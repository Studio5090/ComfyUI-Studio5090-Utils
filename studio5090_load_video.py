# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Alan Rosenfeld
# Studio5090 - see LICENSE at the repository root for full terms.
# Provided "AS IS", without warranty of any kind.
"""
Studio5090 Load Video
Designed by Alan Rosenfeld + Claude (Anthropic), 2026.

Choose Video opens the Windows file dialog.  Then pick a frame by eye with
the scrubber.

  * A file that is already in ComfyUI's output or input folder is used where
    it is.  Anything else is copied into the input folder in small pieces,
    so ComfyUI's upload size limit never applies.  Big ProRes .mov files
    work the same as small .mp4 files.
  * The node shows the frames and has a scrubber, so you can find the frame
    you want by eye.  It opens on the last frame.
  * The frame comes out at full quality.  10-bit ProRes stays 10-bit.  The
    picture values are exactly what was saved: an LTX 2.5 HDR file gives
    HDR (PQ) values, an LTX 2.3 file gives normal values.

The scrubber pictures are small JPEG copies made once when a video is
chosen, by the same decoder that makes the real frame, so frame N in the
scrubber is frame N in the output.
"""

import asyncio
import hashlib
import json
import logging
import os
import re
import shutil
import subprocess
import tempfile
import threading
from collections import OrderedDict

import numpy as np
import torch

import folder_paths

VIDEO_EXTS = (".mp4", ".mov", ".mkv", ".webm", ".m4v")
THUMB_W = 512
_LOG = "[Studio5090 Load Video]"


# ------------------------------------------------------------------ helpers

def _ffmpeg():
    path = shutil.which("ffmpeg")
    if path:
        return path
    try:
        import imageio_ffmpeg
        return imageio_ffmpeg.get_ffmpeg_exe()
    except Exception:
        raise RuntimeError("Studio5090 Load Video: ffmpeg was not found.")


def _roots():
    return {
        "output": os.path.realpath(folder_paths.get_output_directory()),
        "input": os.path.realpath(folder_paths.get_input_directory()),
    }


def resolve_ref(ref):
    """'output/STUDIO5090/X/VIDEOS/a.mov' -> full path, or None if unsafe."""
    if not ref or "/" not in ref:
        return None
    root_name, rel = ref.split("/", 1)
    base = _roots().get(root_name)
    if not base:
        return None
    full = os.path.realpath(os.path.join(base, rel))
    if not full.startswith(base + os.sep) or not os.path.isfile(full):
        return None
    return full


def list_videos():
    """Every video in output/ and input/, grouped by folder, newest first."""
    groups = {}
    for root_name, base in _roots().items():
        if not os.path.isdir(base):
            continue
        for folder, dirs, files in os.walk(base):
            dirs[:] = [d for d in dirs if not d.startswith(".")]
            for name in files:
                if not name.lower().endswith(VIDEO_EXTS):
                    continue
                full = os.path.join(folder, name)
                try:
                    st = os.stat(full)
                except OSError:
                    continue
                rel_folder = os.path.relpath(folder, base).replace("\\", "/")
                gname = root_name if rel_folder == "." else f"{root_name}/{rel_folder}"
                groups.setdefault(gname, []).append({
                    "ref": f"{root_name}/" + os.path.relpath(full, base).replace("\\", "/"),
                    "name": name,
                    "mtime": st.st_mtime,
                    "mb": round(st.st_size / 1048576, 1),
                })
    out = []
    for gname, files in groups.items():
        files.sort(key=lambda f: f["mtime"], reverse=True)
        out.append({"group": gname, "newest": files[0]["mtime"], "files": files})
    out.sort(key=lambda g: g["newest"], reverse=True)
    return out


def _probe(full):
    """Frame count, fps, size and colour tags, using ffmpeg only."""
    ff = _ffmpeg()
    # Counting packets with stream copy is fast and needs no decode.
    r = subprocess.run([ff, "-hide_banner", "-i", full, "-map", "0:v:0", "-c", "copy",
                        "-f", "null", "-"], capture_output=True, text=True, errors="replace")
    err = r.stderr
    count = 0
    for m in re.finditer(r"frame=\s*(\d+)", err):
        count = int(m.group(1))
    vline = ""
    for line in err.splitlines():
        if "Video:" in line:
            vline = line
            break
    w = h = 0
    m = re.search(r",\s*(\d{2,5})x(\d{2,5})", vline)
    if m:
        w, h = int(m.group(1)), int(m.group(2))
    fps = 0.0
    m = re.search(r"([\d.]+)\s*fps", vline)
    if m:
        fps = float(m.group(1))
    else:
        m = re.search(r"([\d.]+)\s*tbr", vline)
        if m:
            fps = float(m.group(1))
    matrix = None
    if "bt2020" in vline:
        matrix = "bt2020"
    elif "bt709" in vline:
        matrix = "bt709"
    full_range = "(pc" in vline
    hdr = "PQ" if "smpte2084" in vline else ("HLG" if "arib-std-b67" in vline else "")
    ten_bit = bool(re.search(r"p1[02]le|p16le", vline))
    return {"count": count, "fps": fps, "width": w, "height": h,
            "matrix": matrix, "full_range": full_range, "hdr": hdr, "ten_bit": ten_bit}


def _scale_filter(info, size=""):
    """swscale settings that read the file with its own colour matrix and range."""
    opts = [size] if size else []
    if info.get("matrix"):
        opts.append(f"in_color_matrix={info['matrix']}")
    opts.append("in_range=" + ("pc" if info.get("full_range") else "tv"))
    return "scale=" + ":".join(opts)


# -------------------------------------------------- scrubber picture cache

class _ThumbCache:
    """Small JPEGs of every frame, made once per video (keyed by path+mtime)."""

    def __init__(self, keep=4):
        self.keep = keep
        self.items = OrderedDict()
        self.lock = threading.Lock()

    def _key(self, full):
        st = os.stat(full)
        return f"{full}|{st.st_mtime_ns}|{st.st_size}"

    def get(self, full):
        key = self._key(full)
        with self.lock:
            if key in self.items:
                self.items.move_to_end(key)
                return self.items[key]
        info = _probe(full)
        frames = self._build(full, info)
        info["count"] = len(frames) or info["count"]
        entry = {"info": info, "frames": frames}
        with self.lock:
            self.items[key] = entry
            while len(self.items) > self.keep:
                self.items.popitem(last=False)
        return entry

    def _build(self, full, info):
        ff = _ffmpeg()
        tmp = tempfile.mkdtemp(prefix="s5090_lv_")
        try:
            vf = _scale_filter(info, size=f"{THUMB_W}:-2") + ",format=yuvj420p"
            subprocess.run([ff, "-hide_banner", "-loglevel", "error", "-i", full,
                            "-map", "0:v:0", "-vf", vf, "-fps_mode", "passthrough",
                            "-q:v", "4", os.path.join(tmp, "%06d.jpg")],
                           capture_output=True)
            names = sorted(n for n in os.listdir(tmp) if n.endswith(".jpg"))
            frames = []
            for n in names:
                with open(os.path.join(tmp, n), "rb") as f:
                    frames.append(f.read())
            return frames
        finally:
            shutil.rmtree(tmp, ignore_errors=True)


THUMBS = _ThumbCache()


# ------------------------------------------------------------- full frame

def read_frame(full, index, info=None):
    """Decode frame `index` at full size as float RGB 0..1, keeping 10-bit."""
    info = info or _probe(full)
    w, h = info["width"], info["height"]
    if not w or not h:
        raise RuntimeError(f"Studio5090 Load Video: could not read the size of {os.path.basename(full)}.")
    ff = _ffmpeg()
    vf = f"select=eq(n\\,{int(index)})," + _scale_filter(info) + ",format=rgb48le"
    r = subprocess.run([ff, "-hide_banner", "-loglevel", "error", "-i", full, "-map", "0:v:0",
                        "-vf", vf, "-fps_mode", "passthrough", "-frames:v", "1",
                        "-f", "rawvideo", "-pix_fmt", "rgb48le", "-"], capture_output=True)
    need = w * h * 3 * 2
    if len(r.stdout) < need:
        raise RuntimeError(f"Studio5090 Load Video: frame {index} could not be read from "
                           f"{os.path.basename(full)}. {r.stderr.decode(errors='replace')[-300:]}")
    a = np.frombuffer(r.stdout[:need], dtype="<u2").reshape(h, w, 3).astype(np.float32) / 65535.0
    return torch.from_numpy(a).unsqueeze(0)



# ------------------------------------------------- Windows dialog match

def match_local(name, size, mtime_ms=None):
    """Find a file picked in the Windows dialog among the videos ComfyUI can
    already read, by name and exact size, so it is used in place."""
    hits = []
    for g in list_videos():
        for f in g["files"]:
            if f["name"] != name:
                continue
            full = resolve_ref(f["ref"])
            if full and os.path.getsize(full) == size:
                hits.append((abs(os.path.getmtime(full) * 1000 - (mtime_ms or 0)), f["ref"]))
    hits.sort()
    return hits[0][1] if hits else None


# ------------------------------------------------------------------- node

class Studio5090LoadVideo:

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "video": ("STRING", {"default": "",
                                     "tooltip": "Set with the Choose Video button (Windows file dialog)."}),
                "frame": ("INT", {"default": 0, "min": 0, "max": 1000000, "step": 1,
                                  "tooltip": "Set with the scrubber.  Past the end = last frame."}),
            },
        }

    RETURN_TYPES = ("IMAGE", "INT", "FLOAT", "INT")
    RETURN_NAMES = ("frame_grab", "frame_number", "fps", "frame_count")
    FUNCTION = "load"
    CATEGORY = "Studio5090/Video"

    @classmethod
    def IS_CHANGED(cls, video, frame):
        full = resolve_ref(video)
        if not full:
            return f"{video}|{frame}"
        st = os.stat(full)
        return f"{video}|{frame}|{st.st_mtime_ns}|{st.st_size}"

    @classmethod
    def VALIDATE_INPUTS(cls, video, frame):
        if not video:
            return "No video chosen.  Press Choose Video on the node."
        if not resolve_ref(video):
            return f"Video not found: {video}"
        return True

    def load(self, video, frame):
        full = resolve_ref(video)
        if not full:
            raise RuntimeError(f"Studio5090 Load Video: video not found: {video}")
        entry = THUMBS.get(full)
        info = entry["info"]
        count = max(1, info["count"])
        idx = min(max(0, int(frame)), count - 1)
        image = read_frame(full, idx, info)
        kind = info["hdr"] and f"HDR {info['hdr']}" or "SDR"
        logging.info(f"{_LOG} {os.path.basename(full)}: frame {idx} of {count - 1}, "
                     f"{image.shape[2]}x{image.shape[1]}, {kind}, "
                     f"{'10-bit' if info['ten_bit'] else '8-bit'}")
        return (image, idx, float(info["fps"] or 24.0), count)


NODE_CLASS_MAPPINGS = {"Studio5090LoadVideo": Studio5090LoadVideo}
NODE_DISPLAY_NAME_MAPPINGS = {"Studio5090LoadVideo": "Studio5090 Frame Grab"}


# ----------------------------------------------------------------- routes

def register_routes(routes):
    from aiohttp import web

    @routes.get("/studio5090/loadvideo/info")
    async def lv_info(request):
        full = resolve_ref(request.rel_url.query.get("ref", ""))
        if not full:
            return web.json_response({"ok": False, "error": "Video not found."})
        try:
            entry = await asyncio.get_running_loop().run_in_executor(None, THUMBS.get, full)
        except Exception as e:
            return web.json_response({"ok": False, "error": str(e)})
        info = dict(entry["info"])
        info["ok"] = bool(entry["frames"])
        if not entry["frames"]:
            info["error"] = "No frames could be read from this video."
        return web.json_response(info)

    @routes.get("/studio5090/loadvideo/thumb")
    async def lv_thumb(request):
        full = resolve_ref(request.rel_url.query.get("ref", ""))
        if not full:
            return web.Response(status=404)
        entry = await asyncio.get_running_loop().run_in_executor(None, THUMBS.get, full)
        frames = entry["frames"]
        if not frames:
            return web.Response(status=404)
        try:
            i = int(request.rel_url.query.get("i", "0"))
        except ValueError:
            i = 0
        i = min(max(0, i), len(frames) - 1)
        return web.Response(body=frames[i], content_type="image/jpeg",
                            headers={"Cache-Control": "max-age=3600"})

    @routes.post("/studio5090/loadvideo/match")
    async def lv_match(request):
        d = await request.json()
        ref = await asyncio.get_running_loop().run_in_executor(
            None, match_local, str(d.get("name", "")), int(d.get("size", -1)), d.get("mtime"))
        return web.json_response({"ref": ref})

    # Chunked upload for a video that is NOT already on the ComfyUI machine.
    # Each piece is small, so ComfyUI's upload size limit never applies.
    @routes.post("/studio5090/loadvideo/upload")
    async def lv_upload(request):
        q = request.rel_url.query
        name = os.path.basename(q.get("name", ""))
        if not name.lower().endswith(VIDEO_EXTS):
            return web.json_response({"ok": False, "error": "Not a video file."})
        try:
            offset, total = int(q.get("offset", "0")), int(q.get("total", "0"))
        except ValueError:
            return web.json_response({"ok": False, "error": "Bad upload request."})
        uid = re.sub(r"[^A-Za-z0-9_-]", "", q.get("id", ""))[:40] or "x"
        base = _roots()["input"]
        part = os.path.join(base, f".s5090_{uid}.part")
        body = await request.read()
        mode = "r+b" if offset > 0 and os.path.exists(part) else "wb"
        if offset > 0 and (not os.path.exists(part) or os.path.getsize(part) != offset):
            return web.json_response({"ok": False, "error": "Upload out of step.  Try again."})
        with open(part, mode) as f:
            f.seek(offset)
            f.write(body)
        if offset + len(body) < total:
            return web.json_response({"ok": True, "done": False})
        stem, ext = os.path.splitext(name)
        dest, n = os.path.join(base, name), 1
        while os.path.exists(dest):
            if os.path.getsize(dest) == total:
                os.remove(part)
                return web.json_response({"ok": True, "done": True,
                                          "ref": "input/" + os.path.basename(dest)})
            dest = os.path.join(base, f"{stem}_{n}{ext}")
            n += 1
        os.replace(part, dest)
        logging.info(f"{_LOG} uploaded {os.path.basename(dest)} ({total / 1048576:.0f} MB)")
        return web.json_response({"ok": True, "done": True, "ref": "input/" + os.path.basename(dest)})

    # v1.7.42: Snapshot button (clean + burned 16-bit PNG, optional .json).
    from .studio5090_grab import register_routes as _grab_routes
    _grab_routes(routes)
