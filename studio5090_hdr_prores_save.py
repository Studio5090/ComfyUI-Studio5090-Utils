# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Alan Rosenfeld
# Studio5090 — see LICENSE at the repository root for full terms.
# Provided "AS IS", without warranty of any kind.
"""
Studio5090 HDR ProRes Save
Designed by Alan Rosenfeld + Claude (Anthropic), 2026.

Saves the LTX 2.5 HDR frames as a ProRes .mov that DaVinci Resolve can read.

Why it exists: ComfyUI's Create Video writes HDR as 10-bit H.264 or AV1.
Many copies of Resolve show those as audio only.  ProRes is Resolve's home
format, so this node writes ProRes instead.

What it does with the picture:
  * The frames are taken as already encoded for the chosen colour space,
    exactly like Create Video's "HDR PQ" / "HDR" / "sRGB" setting.  Nothing
    is re-graded or tone-mapped.
  * They are passed to ffmpeg at 16 bits per channel, so no detail is lost
    on the way in, and written as 10-bit ProRes.
  * The file is tagged BT.2020 + PQ (or HLG, or Rec.709 for SDR).
  * Constant frame rate, so Resolve sees a steady 24 (or whatever you set).

It writes one file per run and hands back the file list in the same form
as Video Combine, so the Phase Gate and Settings Stamp both accept it.
With stamp_settings on, it also stamps the render settings into the file
itself, so no separate Settings Stamp node is needed.
"""

import logging
import os
import shutil
import subprocess
import tempfile

import numpy as np
import torch

import folder_paths

from .studio5090_video_settings import format_settings, write_stamp, write_workflow_stamp

PROFILES = {
    "hq (422 HQ, 10-bit)":        ("3", "yuv422p10le"),
    "4444 (4444, 10-bit)":        ("4", "yuv444p10le"),
    "4444xq (4444 XQ, 10-bit)":   ("5", "yuv444p10le"),
}
COLOUR = {
    "HDR PQ (BT.2020, HDR10)":  ("bt2020", "smpte2084", "bt2020nc", "bt2020"),
    "HDR HLG (BT.2020)":        ("bt2020", "arib-std-b67", "bt2020nc", "bt2020"),
    "SDR (Rec.709)":            ("bt709", "bt709", "bt709", "bt709"),
}


def _ffmpeg():
    path = shutil.which("ffmpeg")
    if path:
        return path
    try:
        import imageio_ffmpeg
        return imageio_ffmpeg.get_ffmpeg_exe()
    except Exception:
        raise RuntimeError("Studio5090 HDR ProRes Save: ffmpeg was not found.")


class Studio5090HDRProResSave:

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "images": ("IMAGE",),
                "filename_prefix": ("STRING", {"default": "STUDIO5090/HDR_ProRes",
                                               "tooltip": "Wire the P3 or P4 path from Studio5090 File Path Logic."}),
                "fps": ("FLOAT", {"default": 24.0, "min": 1.0, "max": 120.0, "step": 0.001}),
                "colour_space": (list(COLOUR), {"default": "HDR PQ (BT.2020, HDR10)",
                                                "tooltip": "What the frames already are. LTX 2.5 HDR = HDR PQ."}),
                "profile": (list(PROFILES), {"default": "hq (422 HQ, 10-bit)"}),
                "stamp_settings": ("BOOLEAN", {"default": True,
                                               "tooltip": "Write the render settings and the workflow into the file, for Fetch Data and Open Workflow From Video."}),
            },
            "optional": {
                "audio": ("AUDIO",),
            },
            "hidden": {"prompt": "PROMPT", "extra_pnginfo": "EXTRA_PNGINFO"},
        }

    RETURN_TYPES = ("VHS_FILENAMES",)
    RETURN_NAMES = ("filenames",)
    FUNCTION = "save"
    OUTPUT_NODE = True
    CATEGORY = "Studio5090/Video"

    def save(self, images, filename_prefix, fps, colour_space, profile, stamp_settings,
             audio=None, prompt=None, extra_pnginfo=None):
        if images is None or not hasattr(images, "shape") or images.shape[0] == 0:
            raise ValueError("Studio5090 HDR ProRes Save: no frames arrived.")
        frames, height, width = int(images.shape[0]), int(images.shape[1]), int(images.shape[2])
        prores_profile, pix_fmt = PROFILES[profile]
        primaries, trc, matrix, scale_matrix = COLOUR[colour_space]

        out_dir = folder_paths.get_output_directory()
        full_folder, filename, counter, subfolder, _ = folder_paths.get_save_image_path(
            filename_prefix, out_dir, width, height)
        os.makedirs(full_folder, exist_ok=True)
        existing = [f for f in os.listdir(full_folder) if f.startswith(filename + "_") and f.endswith(".mov")]
        for f in existing:
            digits = f[len(filename) + 1:].split("_")[0].split(".")[0].split("-")[0]
            if digits.isdigit():
                counter = max(counter, int(digits) + 1)
        out_path = os.path.join(full_folder, f"{filename}_{counter:05}.mov")

        cmd = [_ffmpeg(), "-v", "error", "-y",
               "-f", "rawvideo", "-pix_fmt", "rgb48le", "-s", f"{width}x{height}",
               "-r", f"{fps}", "-i", "-"]
        audio_tmp = None
        if audio is not None and isinstance(audio, dict) and audio.get("waveform") is not None:
            wave = audio["waveform"]
            if wave.dim() == 3:
                wave = wave[0]
            channels, rate = int(wave.shape[0]), int(audio.get("sample_rate", 48000))
            # v1.7.60: cut the audio to the length of the video, as the mp4
            # save does.  A longer audio file used to run on past the last
            # frame, with the picture holding.
            keep = int(round(frames * rate / float(fps)))
            if wave.shape[-1] > keep:
                wave = wave[..., :keep]
            fd, audio_tmp = tempfile.mkstemp(suffix=".f32", dir=folder_paths.get_temp_directory()
                                             if os.path.isdir(folder_paths.get_temp_directory()) else None)
            with os.fdopen(fd, "wb") as f:
                f.write(wave.float().cpu().t().contiguous().numpy().tobytes())
            cmd += ["-f", "f32le", "-ar", str(rate), "-ac", str(channels), "-i", audio_tmp]
        cmd += ["-map", "0:v"] + (["-map", "1:a"] if audio_tmp else [])
        cmd += ["-vf", f"scale=out_color_matrix={scale_matrix}:out_range=tv,format={pix_fmt}",
                "-c:v", "prores_ks", "-profile:v", prores_profile, "-pix_fmt", pix_fmt,
                "-vendor", "apl0", "-r", f"{fps}", "-fps_mode", "cfr",
                "-color_primaries", primaries, "-color_trc", trc, "-colorspace", matrix,
                "-color_range", "tv"]
        if audio_tmp:
            cmd += ["-c:a", "pcm_s24le"]
        cmd += [out_path]

        proc = subprocess.Popen(cmd, stdin=subprocess.PIPE, stderr=subprocess.PIPE)
        try:
            for i in range(frames):
                frame = images[i].float().clamp(0.0, 1.0)
                data = (frame * 65535.0 + 0.5).to(torch.int32).clamp(0, 65535).to(torch.uint16) \
                    if hasattr(torch, "uint16") else (frame * 65535.0 + 0.5).to(torch.int32)
                arr = data.cpu().numpy().astype("<u2", copy=False)
                proc.stdin.write(np.ascontiguousarray(arr).tobytes())
            proc.stdin.close()
            err = proc.stderr.read().decode("utf-8", "replace")
            code = proc.wait()
        finally:
            if audio_tmp and os.path.exists(audio_tmp):
                os.remove(audio_tmp)
        if code != 0 or not os.path.isfile(out_path):
            raise RuntimeError(f"Studio5090 HDR ProRes Save: ffmpeg failed.\n{err[-1500:]}")

        logging.info(f"[Studio5090 HDR ProRes Save] {frames} frames, {width}x{height}, "
                     f"{colour_space}, ProRes {profile} -> {out_path}")
        if stamp_settings and isinstance(prompt, dict):
            text = format_settings(prompt)
            if text:
                ok, message = write_stamp(out_path, text)
                logging.info(f"[Studio5090 HDR ProRes Save] settings: {message}")
        if stamp_settings and isinstance(extra_pnginfo, dict) and isinstance(extra_pnginfo.get("workflow"), dict):
            ok, message = write_workflow_stamp(out_path, extra_pnginfo["workflow"])
            logging.info(f"[Studio5090 HDR ProRes Save] workflow: {message}")
        return {"ui": {"text": [os.path.basename(out_path)]}, "result": ((True, [out_path]),)}


NODE_CLASS_MAPPINGS = {"Studio5090HDRProResSave": Studio5090HDRProResSave}
NODE_DISPLAY_NAME_MAPPINGS = {"Studio5090HDRProResSave": "Studio5090 HDR ProRes Save"}
