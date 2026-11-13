# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Alan Rosenfeld
# Studio5090 - see LICENSE at the repository root for full terms.
# Provided "AS IS", without warranty of any kind.
"""
Studio5090 Frame Grab - Snapshot (v1.7.42)
Designed by Alan Rosenfeld + Claude (Anthropic), 2026.

The Snapshot button on the Frame Grab node saves the frame it is parked on,
without pressing Run.

  * Clean 16-bit PNG:  output/STUDIO5090/<project>/GRAB/<video>_0123.png
    It carries the video's workflow (drag it into ComfyUI to open it), the
    Studio5090 settings text, the source video name and the frame number.
  * Burned PNG (only when a Burn box is ticked):  <video>_0123_BURN.png
    Up to four short lines in the lower left corner: Label, Render Style,
    Accent, Settings.
  * Workflow .json (only when Save .json is ticked):
    output/STUDIO5090/<project>/workflows/<video>_0123.json

The project is found from the video's folder, then from the Project Manager
inside the video's workflow.  When neither gives one, everything goes to
output/STUDIO5090/GRAB/.

v1.7.46:
  * Save to:  a project dropdown (defaults to the video's project) decides
    where the PNGs and the .json go.
  * Copy:  the parked frame at full size, as a PNG for the clipboard.
  * Generate All Angles (v1.7.49):  all 17 angles from the parked frame,
    same naming, after a warning popup.
  * New Angle:  sends the parked frame to the same QWEN multi-angle job the
    Create PM uses for Generate Single (image scaled to 1536x864), saving to
    <project>/MULTIANGLE/SINGLES/<short name>_grab_<frame>_<angle>_00001_.png.  The
    short name is the video name without the counter, -audio and resolution.
"""

import json
import logging
import os
import re
import struct
import zlib

import numpy as np
import torch

_LOG = "[Studio5090 Snapshot]"
_PM_TYPES = ("Studio5090RenderProjectManager", "Studio5090CastingProjectManager",
             "Studio5090CreateProjectManager")


# ------------------------------------------------------------------ project

def _studio_root():
    from .studio5090_utils import _studio_root as root
    return root()


def _project_from_path(full):
    root = os.path.realpath(_studio_root())
    full = os.path.realpath(full)
    if not full.startswith(root + os.sep):
        return None
    first = os.path.relpath(full, root).split(os.sep)[0]
    return first if first and os.path.isdir(os.path.join(root, first)) else None


def _all_nodes(workflow):
    if not isinstance(workflow, dict):
        return []
    nodes = list(workflow.get("nodes") or [])
    for sg in (workflow.get("definitions") or {}).get("subgraphs") or []:
        nodes.extend(sg.get("nodes") or [])
    return [n for n in nodes if isinstance(n, dict)]


def _project_from_workflow(workflow):
    root = _studio_root()
    for n in _all_nodes(workflow):
        if n.get("type") not in _PM_TYPES:
            continue
        for v in n.get("widgets_values") or []:
            if isinstance(v, str) and v.strip() and "/" not in v and "\\" not in v \
                    and os.path.isdir(os.path.join(root, v.strip())):
                return v.strip()
    return None


def find_project(full, workflow):
    return _project_from_path(full) or _project_from_workflow(workflow)


def list_projects():
    from .studio5090_utils import _list_projects
    return [p for p in _list_projects() if p != "GRAB"]


def _pick_project(save_to, full, workflow):
    """The Save to choice when it is a real project, else the video's project."""
    save_to = str(save_to or "").strip()
    if save_to and "/" not in save_to and "\\" not in save_to and save_to not in (".", "..") \
            and os.path.isdir(os.path.join(_studio_root(), save_to)):
        return save_to
    return find_project(full, workflow)


def short_name(video_path):
    """Video file name without extension, -audio, the counter and the resolution.
    Margo_bar_1280x768_00012-audio.mp4 -> Margo_bar"""
    stem = os.path.splitext(os.path.basename(str(video_path)))[0]
    if stem.endswith("-audio"):
        stem = stem[:-len("-audio")]
    stem = re.sub(r"_\d{3,6}_?$", "", stem)                 # _00012 or _00012_
    stem = re.sub(r"(?i)[_-]?\d{3,5}x\d{3,5}(?=$|[_-])", "", stem)   # _1280x768
    stem = re.sub(r"[_-]{2,}", "_", stem).strip("_-")
    return stem or "grab"


# ------------------------------------------------------------ casting / info

def casting_choices(workflow):
    """(render_style, accent) from the Casting PM in the workflow.

    Returns (None, None) when the workflow has no Casting PM (RENDER videos).
    The Casting PM saves [project, subject, accent, render_style]."""
    for n in _all_nodes(workflow):
        if n.get("type") != "Studio5090CastingProjectManager":
            continue
        wv = [v for v in (n.get("widgets_values") or [])]
        accent = wv[2] if len(wv) > 2 and isinstance(wv[2], str) else ""
        style = wv[3] if len(wv) > 3 and isinstance(wv[3], str) else ""
        return style.strip(), accent.strip()
    return None, None


def settings_short(settings_text):
    """'P1 euler/8 · P2 res_2s/3 · P3 euler_cfg_pp · CFG 1.3' from the stamp."""
    if not settings_text:
        return None
    values = {}
    order = []
    for line in str(settings_text).split("\n"):
        if ":" not in line:
            continue
        key, val = line.split(":", 1)
        key, val = key.strip(), val.strip()
        if "prompt" in key.lower():
            break
        values[key.lower()] = val
        m = re.match(r"^(\d+x\d+)\s+sampler$", key, re.I)
        if m and m.group(1) not in order:
            order.append(m.group(1))
    parts = []
    for i, res in enumerate(order, 1):
        sampler = values.get(f"{res.lower()} sampler", "")
        steps = values.get(f"{res.lower()} steps", "")
        parts.append(f"P{i} {sampler}" + (f"/{steps}" if steps else ""))
    if values.get("cfg"):
        parts.append(f"CFG {values['cfg']}")
    return " · ".join(parts) if parts else None


def grab_info(full):
    """What the Snapshot can use from this video."""
    from .studio5090_video_settings import read_workflow, read_settings_text
    workflow, _reason = read_workflow(full)
    ok, text = read_settings_text(full)
    style, accent = casting_choices(workflow)
    return {
        "ok": True,
        "project": find_project(full, workflow),
        "has_workflow": workflow is not None,
        "has_casting": style is not None,
        "projects": list_projects(),
        "render_style": style or "",
        "accent": accent or "",
        "settings": settings_short(text) if ok else None,
    }


# ------------------------------------------------------------------ PNG out

def _chunk(kind, data):
    return (struct.pack(">I", len(data)) + kind + data
            + struct.pack(">I", zlib.crc32(kind + data) & 0xFFFFFFFF))


def write_png16(path, image, text_chunks):
    """Write a float RGB image (H, W, 3, 0..1) as a 16-bit PNG.

    text_chunks: [(key, value)].  "workflow" is stored as tEXt (what ComfyUI
    reads); everything else as UTF-8 iTXt."""
    a = np.clip(np.asarray(image, dtype=np.float32), 0.0, 1.0)
    h, w = a.shape[0], a.shape[1]
    px = np.round(a[..., :3] * 65535.0).astype(">u2")
    raw = np.empty((h, 1 + w * 6), dtype=np.uint8)
    raw[:, 0] = 0
    raw[:, 1:] = px.reshape(h, w * 3).view(np.uint8).reshape(h, w * 6)
    out = [b"\x89PNG\r\n\x1a\n",
           _chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 16, 2, 0, 0, 0))]
    for key, value in text_chunks:
        if value is None:
            continue
        k = key.encode("latin-1")
        if key == "workflow":
            out.append(_chunk(b"tEXt", k + b"\x00" + value.encode("latin-1")))
        else:
            out.append(_chunk(b"iTXt", k + b"\x00\x00\x00\x00\x00" + value.encode("utf-8")))
    out.append(_chunk(b"IDAT", zlib.compress(raw.tobytes(), 6)))
    out.append(_chunk(b"IEND", b""))
    tmp = path + ".part"
    with open(tmp, "wb") as f:
        for part in out:
            f.write(part)
    os.replace(tmp, path)


def _burn(image, lines):
    """Lower-left dark strip with up to four lines, sized to the frame."""
    from PIL import ImageDraw
    from .studio5090_burn_in import _load_font, _layer, _draw_block, _composite
    frames = image.clone()
    height, width = frames.shape[1], frames.shape[2]
    size = max(10, round(height / 36))
    font = _load_font(size)
    line_h = int(size * 1.25)
    margin = max(6, size // 2)
    probe = ImageDraw.Draw(_layer(8, 8))
    char_w = max(1.0, probe.textlength("0", font=font))
    max_chars = max(12, int((width - 2 * margin) / char_w))
    lines = [l if len(l) <= max_chars else l[:max_chars - 1] + "…" for l in lines]
    layer = _layer(width, height)
    draw = ImageDraw.Draw(layer)
    y = height - margin - line_h * len(lines)
    box = _draw_block(draw, lines, margin, y, font, line_h, "dark strip", 0)
    _composite(frames, layer, box)
    return frames


# ------------------------------------------------------------------ snapshot

def snapshot(full, frame, burn_style=False, burn_accent=False, burn_settings=False,
             burn_label=False, label="", save_json=False, save_to=""):
    from .studio5090_load_video import THUMBS, read_frame
    from .studio5090_video_settings import read_workflow, read_settings_text

    entry = THUMBS.get(full)
    info = entry["info"]
    count = max(1, info["count"])
    idx = min(max(0, int(frame)), count - 1)
    image = read_frame(full, idx, info)                      # (1, H, W, 3)

    workflow, _reason = read_workflow(full)
    ok, settings_text = read_settings_text(full)
    settings_text = settings_text if ok else None
    project = _pick_project(save_to, full, workflow)

    root = _studio_root()
    if project:
        grab_dir = os.path.join(root, project, "GRAB")
        json_dir = os.path.join(root, project, "workflows")
    else:
        grab_dir = json_dir = os.path.join(root, "GRAB")
    os.makedirs(grab_dir, exist_ok=True)

    stem = os.path.splitext(os.path.basename(full))[0]
    name = f"{stem}_{idx:04d}"
    chunks = [
        ("workflow", json.dumps(workflow) if workflow is not None else None),
        ("studio5090_settings", settings_text),
        ("studio5090_source", f"{os.path.basename(full)}  frame {idx}"),
    ]

    saved = []
    clean = os.path.join(grab_dir, name + ".png")
    write_png16(clean, image[0].cpu().numpy(), chunks)
    saved.append(clean)

    lines = []
    style, accent = casting_choices(workflow)
    if burn_label and str(label).strip():
        lines.append(str(label).strip())
    if burn_style and style:
        lines.append(f"Render Style: {style}")
    if burn_accent and accent:
        lines.append(f"Accent: {accent}")
    short = settings_short(settings_text)
    if burn_settings and short:
        lines.append(short)
    if lines:
        burned = _burn(image, lines)
        path = os.path.join(grab_dir, name + "_BURN.png")
        write_png16(path, burned[0].cpu().numpy(), chunks)
        saved.append(path)

    if save_json and workflow is not None:
        os.makedirs(json_dir, exist_ok=True)
        path = os.path.join(json_dir, name + ".json")
        with open(path, "w", encoding="utf-8") as f:
            json.dump(workflow, f, indent=2)
        saved.append(path)

    out = os.path.realpath(_studio_root())
    rel = [os.path.relpath(os.path.realpath(p), os.path.dirname(out)).replace("\\", "/") for p in saved]
    logging.info(f"{_LOG} frame {idx} of {os.path.basename(full)} -> {', '.join(rel)}")
    notes = []
    if save_json and workflow is None:
        notes.append("no workflow in this video, so no .json")
    return {"ok": True, "frame": idx, "files": rel, "project": project or "",
            "notes": notes}


# ------------------------------------------------------------------ copy

def frame_png(full, frame):
    """The parked frame at full size as 8-bit PNG bytes (for the clipboard)."""
    import io
    from PIL import Image
    from .studio5090_load_video import THUMBS, read_frame
    info = THUMBS.get(full)["info"]
    idx = min(max(0, int(frame)), max(1, info["count"]) - 1)
    a = read_frame(full, idx, info)[0].cpu().numpy()
    img = Image.fromarray((np.clip(a, 0, 1) * 255.0 + 0.5).astype(np.uint8), "RGB")
    buf = io.BytesIO()
    img.save(buf, format="PNG", compress_level=1)
    return buf.getvalue()


# ------------------------------------------------------------------ new angle

def qwen_angle_workflow():
    """v1.7.50: Alan's QWEN_MULTIANGLE_TEMPLATE_v3.  Since v1.7.53 the Create PM
    and Render PM use the same job.  Two changes from the old job:
      * Resize (ResizeImageMaskNode, "scale dimensions" 1536x864, crop center,
        lanczos) in place of ImageScale (stretched to 1536x864, no crop), so the
        frame keeps its shape.
      * VAEEncode takes the resized image too, so the starting latent is the
        same size as the image QWEN is told about.  Before, it took the image
        at its original size."""
    return {
        "1":  {"class_type": "UNETLoader", "inputs": {"unet_name": "qwen_image_edit_2511_bf16.safetensors", "weight_dtype": "default"}},
        "2":  {"class_type": "LoraLoaderModelOnly", "inputs": {"model": ["1", 0], "lora_name": "Qwen-Image-Edit-2511-Lightning-8steps-V1.0-bf16.safetensors", "strength_model": 1}},
        "3":  {"class_type": "LoraLoaderModelOnly", "inputs": {"model": ["2", 0], "lora_name": "qwen-image-edit-2511-multiple-angles-lora.safetensors", "strength_model": 1}},
        "4":  {"class_type": "CLIPLoader", "inputs": {"clip_name": "qwen_2.5_vl_7b_fp8_scaled.safetensors", "type": "qwen_image", "device": "default"}},
        "5":  {"class_type": "VAELoader", "inputs": {"vae_name": "qwen_image_vae.safetensors"}},
        "6":  {"class_type": "TextEncodeQwenImageEditPlus", "inputs": {"clip": ["4", 0], "vae": ["5", 0], "image1": ["9", 0], "prompt": "ANGLE_PLACEHOLDER"}},
        "7":  {"class_type": "TextEncodeQwenImageEditPlus", "inputs": {"clip": ["4", 0], "vae": ["5", 0], "image1": ["9", 0], "prompt": "worst quality"}},
        "8":  {"class_type": "VAEEncode", "inputs": {"pixels": ["9", 0], "vae": ["5", 0]}},
        "9":  {"class_type": "ResizeImageMaskNode", "inputs": {"input": ["14", 0], "resize_type": "scale dimensions",
               "resize_type.width": 1536, "resize_type.height": 864, "resize_type.crop": "center",
               "scale_method": "lanczos"}},
        "10": {"class_type": "KSampler", "inputs": {"model": ["11", 0], "positive": ["6", 0], "negative": ["7", 0], "latent_image": ["8", 0], "seed": 42, "steps": 8, "cfg": 1, "sampler_name": "euler", "scheduler": "sgm_uniform", "denoise": 1}},
        "11": {"class_type": "CFGNorm", "inputs": {"model": ["12", 0], "strength": 1}},
        "12": {"class_type": "ModelSamplingAuraFlow", "inputs": {"model": ["3", 0], "shift": 3}},
        "13": {"class_type": "VAEDecode", "inputs": {"samples": ["10", 0], "vae": ["5", 0]}},
        "14": {"class_type": "LoadImage", "inputs": {"image": "SOURCE_PLACEHOLDER", "upload": "image"}},
        "15": {"class_type": "SaveImage", "inputs": {"images": ["13", 0], "filename_prefix": "PREFIX_PLACEHOLDER"}},
    }


def _write_grab_source(full, frame, save_to=""):
    """Write the parked frame into ComfyUI's input folder once.
    Returns (src_name, project, short, idx) or raises ValueError."""
    import folder_paths
    from PIL import Image
    from .studio5090_load_video import THUMBS, read_frame
    from .studio5090_video_settings import read_workflow

    workflow, _reason = read_workflow(full)
    project = _pick_project(save_to, full, workflow)
    if not project:
        raise ValueError("Pick a project in Save to first.")

    info = THUMBS.get(full)["info"]
    idx = min(max(0, int(frame)), max(1, info["count"]) - 1)
    a = read_frame(full, idx, info)[0].cpu().numpy()
    short = short_name(full)
    src_name = f"{short}_grab_{idx:04d}.png"
    Image.fromarray((np.clip(a, 0, 1) * 255.0 + 0.5).astype(np.uint8), "RGB").save(
        os.path.join(folder_paths.get_input_directory(), src_name), format="PNG", compress_level=4)
    return src_name, project, short, idx


def grab_folder(video_path):
    """v1.7.51: folder for Generate All Angles, the first word of the video
    name in capitals plus _GRAB.  MARGO_AUDITION_1280x768_00004-audio.mp4 ->
    MARGO_GRAB"""
    stem = os.path.splitext(os.path.basename(str(video_path)))[0]
    first = re.split(r"[_\-\s.]+", stem.strip("_-. "), maxsplit=1)[0]
    first = re.sub(r"[^A-Za-z0-9]", "", first).upper()
    return f"{first or 'FRAME'}_GRAB"


def _angle_job(src_name, project, short, idx, prompt_text, suffix, prompt_modifier="",
               folder="SINGLES", index=None, total=None):
    import random
    mod = str(prompt_modifier or "").strip().lstrip(",; \t")
    # v1.7.48: into a MULTIANGLE subfolder, where the Render PM's frame lists
    # look (they list MULTIANGLE subfolders, not loose files in MULTIANGLE).
    # Single angles go to SINGLES, all 17 to <FIRST WORD>_GRAB (v1.7.51).
    prefix = f"STUDIO5090/{project}/MULTIANGLE/{folder}/{short}_grab_{idx:04d}_{suffix}"
    wf = qwen_angle_workflow()
    wf["14"]["inputs"]["image"] = src_name
    wf["6"]["inputs"]["prompt"] = f"{prompt_text}, {mod}" if mod else prompt_text
    wf["15"]["inputs"]["filename_prefix"] = prefix
    wf["10"]["inputs"]["seed"] = random.randint(0, 2 ** 32 - 1)
    from .studio5090_qwen_log import add_log_node, angle_label
    add_log_node(wf, angle_label(suffix, folder, index, total))
    return wf, prefix


def prepare_new_angle(full, frame, angle_suffix, save_to="", prompt_modifier=""):
    """Write the parked frame into ComfyUI's input folder and build the QWEN job.
    Returns (workflow, info) or raises ValueError with a message for the user."""
    from .studio5090_utils import QWEN_ANGLES
    entry = next((a for a in QWEN_ANGLES if a[1] == angle_suffix), None)
    if not entry:
        raise ValueError(f"Unknown angle: {angle_suffix}")
    prompt_text, suffix = entry
    src_name, project, short, idx = _write_grab_source(full, frame, save_to)
    wf, prefix = _angle_job(src_name, project, short, idx, prompt_text, suffix, prompt_modifier)
    return wf, {"project": project, "frame": idx, "angle": suffix, "output_prefix": prefix}


def prepare_all_angles(full, frame, save_to="", prompt_modifier=""):
    """v1.7.49: one QWEN job per angle (all 17) from one parked frame.
    Returns ([workflow, ...], info) or raises ValueError."""
    from .studio5090_utils import QWEN_ANGLES
    src_name, project, short, idx = _write_grab_source(full, frame, save_to)
    folder = grab_folder(full)
    jobs = [_angle_job(src_name, project, short, idx, p, sfx, prompt_modifier, folder,
                       i, len(QWEN_ANGLES))[0]
            for i, (p, sfx) in enumerate(QWEN_ANGLES, 1)]
    return jobs, {"project": project, "frame": idx, "count": len(jobs),
                  "output_folder": f"{project}/MULTIANGLE/{folder}"}


def register_routes(routes):
    import asyncio
    from aiohttp import web
    from .studio5090_load_video import resolve_ref

    @routes.get("/studio5090/loadvideo/grabinfo")
    async def lv_grabinfo(request):
        full = resolve_ref(request.rel_url.query.get("ref", ""))
        if not full:
            return web.json_response({"ok": False, "error": "Video not found."})
        try:
            body = await asyncio.get_running_loop().run_in_executor(None, grab_info, full)
        except Exception as e:
            body = {"ok": False, "error": str(e)}
        return web.json_response(body)

    @routes.post("/studio5090/loadvideo/snapshot")
    async def lv_snapshot(request):
        d = await request.json()
        full = resolve_ref(str(d.get("ref", "")))
        if not full:
            return web.json_response({"ok": False, "error": "Video not found."})
        try:
            body = await asyncio.get_running_loop().run_in_executor(
                None, lambda: snapshot(
                    full, int(d.get("frame", 0)),
                    burn_style=bool(d.get("burn_style")), burn_accent=bool(d.get("burn_accent")),
                    burn_settings=bool(d.get("burn_settings")), burn_label=bool(d.get("burn_label")),
                    label=str(d.get("label", "")), save_json=bool(d.get("save_json")),
                    save_to=str(d.get("save_to", ""))))
        except Exception as e:
            logging.exception(f"{_LOG} failed")
            body = {"ok": False, "error": str(e)}
        return web.json_response(body)

    @routes.get("/studio5090/loadvideo/frame_png")
    async def lv_frame_png(request):
        full = resolve_ref(request.rel_url.query.get("ref", ""))
        if not full:
            return web.Response(status=404, text="Video not found.")
        try:
            i = int(request.rel_url.query.get("i", "0"))
        except ValueError:
            i = 0
        try:
            data = await asyncio.get_running_loop().run_in_executor(None, frame_png, full, i)
        except Exception as e:
            logging.exception(f"{_LOG} copy failed")
            return web.Response(status=500, text=str(e))
        return web.Response(body=data, content_type="image/png",
                            headers={"Cache-Control": "no-store"})

    @routes.post("/studio5090/loadvideo/new_angle")
    async def lv_new_angle(request):
        d = await request.json()
        full = resolve_ref(str(d.get("ref", "")))
        if not full:
            return web.json_response({"ok": False, "error": "Video not found."})
        try:
            wf, info = await asyncio.get_running_loop().run_in_executor(
                None, lambda: prepare_new_angle(
                    full, int(d.get("frame", 0)), str(d.get("angle", "")),
                    save_to=str(d.get("save_to", "")),
                    prompt_modifier=str(d.get("prompt_modifier", ""))))
        except ValueError as e:
            return web.json_response({"ok": False, "error": str(e)})
        except Exception as e:
            logging.exception(f"{_LOG} new angle failed")
            return web.json_response({"ok": False, "error": str(e)})
        ok, res = await _queue_prompt(wf)
        if not ok:
            return web.json_response({"ok": False, "error": res})
        logging.info(f"{_LOG} new angle {info['angle']} from frame {info['frame']} -> {info['output_prefix']}")
        return web.json_response({"ok": True, "prompt_id": res, **info})

    @routes.post("/studio5090/loadvideo/new_angles_all")
    async def lv_new_angles_all(request):
        d = await request.json()
        full = resolve_ref(str(d.get("ref", "")))
        if not full:
            return web.json_response({"ok": False, "error": "Video not found."})
        try:
            jobs, info = await asyncio.get_running_loop().run_in_executor(
                None, lambda: prepare_all_angles(
                    full, int(d.get("frame", 0)),
                    save_to=str(d.get("save_to", "")),
                    prompt_modifier=str(d.get("prompt_modifier", ""))))
        except ValueError as e:
            return web.json_response({"ok": False, "error": str(e)})
        except Exception as e:
            logging.exception(f"{_LOG} all angles failed")
            return web.json_response({"ok": False, "error": str(e)})
        queued = 0
        for wf in jobs:
            ok, res = await _queue_prompt(wf)
            if not ok:
                return web.json_response({"ok": False, "queued": queued, "error": res, **info})
            queued += 1
        logging.info(f"{_LOG} all {queued} angles from frame {info['frame']} -> {info['output_folder']}")
        return web.json_response({"ok": True, "queued": queued, **info})


async def _queue_prompt(wf):
    """Send one job to ComfyUI's queue.  Returns (True, prompt_id) or (False, message)."""
    import aiohttp
    try:
        from server import PromptServer
        port = getattr(PromptServer.instance, "port", None) or 8188
    except Exception:
        port = 8188
    try:
        async with aiohttp.ClientSession() as session:
            async with session.post(f"http://127.0.0.1:{port}/prompt", json={"prompt": wf}) as resp:
                result = await resp.json()
    except Exception as e:
        return False, f"Could not queue: {e}"
    if result.get("error"):
        err = result["error"]
        return False, err.get("message", str(err)) if isinstance(err, dict) else str(err)
    return True, result.get("prompt_id")
