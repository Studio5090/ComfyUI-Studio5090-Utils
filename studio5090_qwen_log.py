# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Alan Rosenfeld
# Studio5090 — see LICENSE at the repository root for full terms.
# Provided "AS IS", without warranty of any kind.
"""Studio5090 QWEN Angle Log (v1.7.54).

Sits inside every QWEN multi-angle job (Frame Grab, Create PM, Render PM),
between the loaded image and the resize.  It passes the image through
untouched and writes one line to the ComfyUI log when that job starts:

    [Studio5090 QWEN] Rendering angle 3 of 17: MA_three-quarter (MARGO_GRAB)
"""

import logging


class Studio5090QwenAngleLog:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "image": ("IMAGE",),
                "label": ("STRING", {"default": ""}),
            }
        }

    RETURN_TYPES = ("IMAGE",)
    RETURN_NAMES = ("image",)
    FUNCTION = "log"
    CATEGORY = "Studio5090/Utils"

    @classmethod
    def IS_CHANGED(cls, **kwargs):
        # Print on every run, even when the same angle is made again.
        return float("nan")

    def log(self, image, label=""):
        msg = f"[Studio5090 QWEN] Rendering angle {label}" if label else "[Studio5090 QWEN] Rendering angle"
        print(msg)
        return (image,)


def angle_label(suffix, folder, index=None, total=None):
    """'3 of 17: MA_three-quarter (MARGO_GRAB)' or 'single: MA_front (SINGLES)'."""
    where = f" ({folder})" if folder else ""
    if index is not None and total:
        return f"{index} of {total}: {suffix}{where}"
    return f"single: {suffix}{where}"


def add_log_node(wf, label):
    """Put the log node into a QWEN job (node 14 LoadImage -> 16 log -> 9 resize).
    Does nothing to a job that has no node 9 or 14."""
    try:
        if "14" not in wf or "9" not in wf:
            return wf
        wf["16"] = {"class_type": "Studio5090QwenAngleLog",
                    "inputs": {"image": ["14", 0], "label": label}}
        inputs = wf["9"]["inputs"]
        key = "input" if "input" in inputs else "image"
        inputs[key] = ["16", 0]
    except Exception as exc:
        logging.warning(f"[Studio5090 QWEN] could not add the angle log: {exc}")
    return wf


NODE_CLASS_MAPPINGS = {"Studio5090QwenAngleLog": Studio5090QwenAngleLog}
NODE_DISPLAY_NAME_MAPPINGS = {"Studio5090QwenAngleLog": "Studio5090 QWEN Angle Log"}
