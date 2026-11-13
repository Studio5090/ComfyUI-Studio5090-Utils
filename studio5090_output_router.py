# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Alan Rosenfeld
# Studio5090 - see LICENSE at the repository root for full terms.
# Provided "AS IS", without warranty of any kind.
"""
Studio5090 Output Router
Designed by Alan Rosenfeld + Claude (Anthropic), 2026.

Sends the decoded frames to ONE save path.  The other paths receive an
ExecutionBlocker, so their save nodes never run and never write a file.
One render, one master file.

  ltx_version ON  (LTX 2.3) and use_prores ON   -> to_prores
  ltx_version ON  (LTX 2.3) and use_prores OFF  -> to_h264
  ltx_version OFF (LTX 2.5)                     -> to_hdr   (use_prores is ignored)

The save paths must be re-joined with the Studio5090 Phase Gate, which
uses lazy inputs.  An ordinary merge node is always stopped by the block.
"""

import logging

from comfy_execution.graph import ExecutionBlocker


class Studio5090OutputRouter:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "image": ("IMAGE",),
                "ltx_version": (
                    "BOOLEAN",
                    {
                        "default": True,
                        "label_on": "LTX 2.3",
                        "label_off": "LTX 2.5 -> HDR ProRes Save",
                    },
                ),
                "use_prores": (
                    "BOOLEAN",
                    {
                        "default": True,
                        "label_on": "LTX 2.3 saves ProRes HQ",
                        "label_off": "LTX 2.3 saves H.264 mp4",
                    },
                ),
            },
        }

    # to_h264 is added LAST so wires already on the first three outputs
    # in saved workflows stay where they are.
    RETURN_TYPES = ("IMAGE", "IMAGE", "INT", "IMAGE")
    RETURN_NAMES = ("to_prores", "to_hdr", "signal", "to_h264")
    FUNCTION = "route"
    CATEGORY = "Studio5090"

    def route(self, image, ltx_version, use_prores=True):
        blocked = ExecutionBlocker(None)
        # One line in the console per run, so a missing save can be traced:
        # it shows the frames arrived here and which save path they went to.
        try:
            where = "to_hdr (LTX 2.5)" if not ltx_version else ("to_prores" if use_prores else "to_h264")
            shape = tuple(image.shape) if hasattr(image, "shape") else type(image).__name__
            if len(shape) == 4:
                logging.info(f"[Studio5090 Output Router] {shape[0]} frames, {shape[2]}x{shape[1]} -> {where}")
            else:
                logging.info(f"[Studio5090 Output Router] {shape} -> {where}")
        except Exception:
            pass
        # "signal" is kept only so older workflows keep loading.  It is not
        # a save-finished signal.  Use the Studio5090 Phase Gate for ordering.
        if not ltx_version:
            return (blocked, image, 1, blocked)
        if use_prores:
            return (image, blocked, 1, blocked)
        return (blocked, blocked, 1, image)


NODE_CLASS_MAPPINGS = {
    "Studio5090OutputRouter": Studio5090OutputRouter,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "Studio5090OutputRouter": "Studio5090 Output Router (LTX 2.3 / 2.5)",
}
