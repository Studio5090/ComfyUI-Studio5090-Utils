# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Alan Rosenfeld
# Studio5090 — see LICENSE at the repository root for full terms.
# Provided "AS IS", without warranty of any kind.
"""
Studio5090 Burn-In
Designed by Alan Rosenfeld + Claude (Anthropic), 2026.

Writes review information onto the frames, the way a VFX review screen
shows it:

    top left      the render settings (seed, samplers, steps, strengths ...)
    bottom left   a label line of your choice (scene, take ...)
    bottom right  SMPTE timecode and the frame number, counted per frame

Frames in, labelled frames out.  With "enabled" off the frames pass through
untouched.

Timecode is NON-DROP-FRAME: HH:MM:SS:FF, straight counting at the frame rate
you give (rounded to a whole number of frames per second, so 24 and 23.976
both count 0 to 23).  start_timecode sets where the first frame begins, for
houses that start at 00:00:00:00, 00:01:00:00, 01:00:00:00 and so on.

The settings are read from the same settings block that RETRIEVE SETTINGS and
the Settings Stamp use, so the label always matches.  The two long prompt
lines are left out to keep the picture clear.  Wire text into settings_text
to show your own text instead.

This node changes the picture.  Wire it only into the outputs you want
labelled.
"""

import numpy as np
import torch
from PIL import Image, ImageDraw, ImageFont

from .studio5090_video_settings import format_settings

_FONT_CANDIDATES = (
    "consola.ttf", "cour.ttf",                       # Windows
    "DejaVuSansMono.ttf", "LiberationMono-Regular.ttf",   # Linux
    "Menlo.ttc", "Courier New.ttf",                  # macOS
)


def _load_font(size):
    for name in _FONT_CANDIDATES:
        try:
            return ImageFont.truetype(name, size)
        except Exception:
            continue
    try:
        return ImageFont.load_default(size)
    except TypeError:                                # very old Pillow
        return ImageFont.load_default()


def parse_timecode(text, base):
    """'HH:MM:SS:FF' -> frame count.  Anything unreadable counts as zero."""
    try:
        parts = [int(p) for p in str(text).replace(";", ":").strip().split(":")]
        while len(parts) < 4:
            parts.insert(0, 0)
        hours, minutes, seconds, frames = parts[-4:]
        return ((hours * 60 + minutes) * 60 + seconds) * base + frames
    except Exception:
        return 0


def format_timecode(frame_count, base):
    """Frame count -> 'HH:MM:SS:FF', non-drop-frame."""
    frame_count = max(0, int(frame_count))
    frames = frame_count % base
    total_seconds = frame_count // base
    return (f"{total_seconds // 3600:02d}:{(total_seconds // 60) % 60:02d}:"
            f"{total_seconds % 60:02d}:{frames:02d}")


def _settings_lines(prompt, max_chars):
    """Short settings lines from the workflow's settings block, prompts left out."""
    text = format_settings(prompt) if isinstance(prompt, dict) else None
    if not text:
        return []
    lines = []
    for line in text.split("\n"):
        key = line.split(":", 1)[0].strip().lower()
        if "prompt" in key:
            break               # the prompts come last and run over many lines
        if not line.strip() or ":" not in line:
            continue
        lines.append(line.strip())
    return [l if len(l) <= max_chars else l[:max_chars - 1] + "…" for l in lines]


def _layer(width, height):
    return Image.new("RGBA", (width, height), (0, 0, 0, 0))


def _draw_block(draw, lines, x, y, font, line_h, style, stroke, align_right=False, width=0):
    """Draw text lines starting at (x, y).  Returns the box that was touched."""
    if not lines:
        return None
    widths = [draw.textlength(l, font=font) for l in lines]
    block_w = int(max(widths)) + 1
    block_h = line_h * len(lines)
    pad = max(2, line_h // 4)
    left = (width - x - block_w) if align_right else x
    if style == "dark strip":
        draw.rectangle([left - pad, y - pad, left + block_w + pad, y + block_h + pad],
                       fill=(0, 0, 0, 150))
    for i, line in enumerate(lines):
        lx = left + (block_w - int(widths[i]) - 1 if align_right else 0)
        draw.text((lx, y + i * line_h), line, font=font, fill=(255, 255, 255, 255),
                  stroke_width=stroke if style == "outline" else 0,
                  stroke_fill=(0, 0, 0, 255))
    grow = pad + stroke + 2
    return (max(0, left - grow), max(0, y - grow),
            left + block_w + grow, y + block_h + grow)


def _composite(frames, layer, box):
    """Blend an RGBA layer onto frames[..., H, W, C] inside box, in place."""
    if box is None:
        return
    x0, y0, x1, y1 = box
    height, width = frames.shape[-3], frames.shape[-2]
    x1, y1 = min(x1, width), min(y1, height)
    if x1 <= x0 or y1 <= y0:
        return
    patch = np.asarray(layer.crop((x0, y0, x1, y1)), dtype=np.float32) / 255.0
    rgb = torch.from_numpy(patch[..., :3]).to(frames.device, frames.dtype)
    alpha = torch.from_numpy(patch[..., 3:4]).to(frames.device, frames.dtype)
    region = frames[..., y0:y1, x0:x1, :3]
    frames[..., y0:y1, x0:x1, :3] = region * (1.0 - alpha) + rgb * alpha


class Studio5090BurnIn:

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "images": ("IMAGE",),
                "enabled": ("BOOLEAN", {"default": True, "label_on": "burn in", "label_off": "off",
                                        "tooltip": "Off passes the frames through untouched."}),
                "fps": ("FLOAT", {"default": 24.0, "min": 1.0, "max": 240.0, "step": 0.001,
                                  "tooltip": "Frame rate used to count timecode."}),
                "start_timecode": ("STRING", {"default": "00:00:00:00",
                                              "tooltip": "Timecode of the first frame, HH:MM:SS:FF. Non-drop-frame."}),
                "start_frame": ("INT", {"default": 0, "min": 0, "max": 9999999,
                                        "tooltip": "Number shown on the first frame (0, 1, 1001 ...)."}),
                "show_timecode": ("BOOLEAN", {"default": True}),
                "show_frame_number": ("BOOLEAN", {"default": True}),
                "show_settings": ("BOOLEAN", {"default": True,
                                              "tooltip": "Render settings, top left, read from the workflow's settings block."}),
                "label": ("STRING", {"default": "", "multiline": False,
                                     "tooltip": "One line, bottom left. Scene, take, anything."}),
                "text_size": ("INT", {"default": 0, "min": 0, "max": 200,
                                      "tooltip": "Letter height in pixels. 0 picks a size from the picture height."}),
                "style": (["outline", "dark strip"], {"default": "outline",
                                                      "tooltip": "How the text is kept readable on any shot."}),
            },
            "optional": {
                "settings_text": ("STRING", {"forceInput": True,
                                             "tooltip": "Optional. Your own text for the top left, used in place of the workflow settings."}),
            },
            "hidden": {"prompt": "PROMPT"},
        }

    RETURN_TYPES = ("IMAGE",)
    RETURN_NAMES = ("images",)
    FUNCTION = "burn"
    CATEGORY = "Studio5090/Video"

    def burn(self, images, enabled, fps, start_timecode, start_frame,
             show_timecode, show_frame_number, show_settings, label,
             text_size, style, settings_text=None, prompt=None):
        if not enabled:
            return (images,)

        count, height, width = images.shape[0], images.shape[1], images.shape[2]
        size = int(text_size) if text_size else max(10, round(height / 36))
        font = _load_font(size)
        line_h = int(size * 1.25)
        stroke = max(1, size // 9)
        margin = max(6, size // 2)
        base = max(1, int(round(float(fps))))

        probe = ImageDraw.Draw(_layer(8, 8))
        char_w = max(1.0, probe.textlength("0", font=font))
        max_chars = max(12, int((width * 0.6) / char_w))

        out = images.clone()

        # ---- parts that are the same on every frame -------------------
        if settings_text is not None and str(settings_text).strip():
            top_lines = [l.rstrip() for l in str(settings_text).split("\n")]
            top_lines = [l if len(l) <= max_chars else l[:max_chars - 1] + "…" for l in top_lines]
        elif show_settings:
            top_lines = _settings_lines(prompt, max_chars)
        else:
            top_lines = []
        max_lines = max(0, (height - 3 * line_h - 2 * margin) // line_h)
        top_lines = top_lines[:max_lines]

        static = _layer(width, height)
        draw = ImageDraw.Draw(static)
        box = _draw_block(draw, top_lines, margin, margin, font, line_h, style, stroke)
        _composite(out, static, box)

        bottom_y = height - margin - line_h
        if label and label.strip():
            text = label.strip()
            if len(text) > max_chars:
                text = text[:max_chars - 1] + "…"
            static = _layer(width, height)
            draw = ImageDraw.Draw(static)
            box = _draw_block(draw, [text], margin, bottom_y, font, line_h, style, stroke)
            _composite(out, static, box)

        # ---- the counter, different on every frame --------------------
        if show_timecode or show_frame_number:
            first = parse_timecode(start_timecode, base)
            for i in range(count):
                parts = []
                if show_timecode:
                    parts.append(format_timecode(first + i, base))
                if show_frame_number:
                    parts.append(f"F {int(start_frame) + i:05d}")
                layer = _layer(width, height)
                draw = ImageDraw.Draw(layer)
                box = _draw_block(draw, ["   ".join(parts)], margin, bottom_y, font,
                                  line_h, style, stroke, align_right=True, width=width)
                _composite(out[i], layer, box)

        return (out,)


NODE_CLASS_MAPPINGS = {"Studio5090BurnIn": Studio5090BurnIn}
NODE_DISPLAY_NAME_MAPPINGS = {"Studio5090BurnIn": "Studio5090 Burn-In"}
