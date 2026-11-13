# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Alan Rosenfeld
# Studio5090 - see LICENSE at the repository root for full terms.
# Provided "AS IS", without warranty of any kind.
"""
Studio5090 Phase Gate
Designed by Alan Rosenfeld + Claude (Anthropic), 2026.

Holds the next phase (for example P4) until the previous phase (P3) has
shown its preview and written its master file.

"value" is whatever the next phase needs in order to start.  It passes
straight through, unchanged.  The next phase cannot start until this node
has run, and this node cannot run until its wait inputs have finished:

  preview_done     Filenames output of the preview Video Combine.
  save_23_done     filenames output of the LTX 2.3 ProRes save node.
  save_h264_done   Filenames output of the LTX 2.3 H.264 Video Combine.
  save_25_done     filenames output of the LTX 2.5 HDR ProRes Save node.

The three save inputs are LAZY.  The gate only asks for the one that the
two switches select, the same way the Output Router does:

  ltx_version ON  and use_prores ON   -> waits for save_23_done
  ltx_version ON  and use_prores OFF  -> waits for save_h264_done
  ltx_version OFF                     -> waits for save_25_done

The other two are never requested, so the block the Output Router puts on
the unused save paths never reaches this node.

Every wait input is optional.  Leave one unwired and the gate does not
wait for it.
"""


class _AnyType(str):
    """Wildcard type: compares equal to every ComfyUI type."""

    def __ne__(self, other):
        return False


_ANY = _AnyType("*")
_UNLINKED = object()


class Studio5090PhaseGate:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "value": (_ANY,),
                "ltx_version": (
                    "BOOLEAN",
                    {"default": True, "label_on": "LTX 2.3", "label_off": "LTX 2.5"},
                ),
                "use_prores": (
                    "BOOLEAN",
                    {"default": True, "label_on": "ProRes HQ", "label_off": "H.264 mp4"},
                ),
            },
            "optional": {
                "preview_done": (_ANY,),
                "save_23_done": (_ANY, {"lazy": True}),
                "save_25_done": (_ANY, {"lazy": True}),
                "save_h264_done": (_ANY, {"lazy": True}),
            },
        }

    RETURN_TYPES = (_ANY,)
    RETURN_NAMES = ("value",)
    FUNCTION = "gate"
    CATEGORY = "Studio5090"

    def check_lazy_status(self, value=None, ltx_version=True, use_prores=True,
                          preview_done=None, save_23_done=_UNLINKED,
                          save_25_done=_UNLINKED, save_h264_done=_UNLINKED):
        # A lazy input that is wired but not yet evaluated arrives as None.
        # A lazy input that is not wired at all keeps the _UNLINKED default.
        if not ltx_version:
            wanted, current = "save_25_done", save_25_done
        elif use_prores:
            wanted, current = "save_23_done", save_23_done
        else:
            wanted, current = "save_h264_done", save_h264_done
        return [wanted] if current is None else []

    def gate(self, value, ltx_version, use_prores=True, preview_done=None,
             save_23_done=None, save_25_done=None, save_h264_done=None):
        return (value,)


NODE_CLASS_MAPPINGS = {
    "Studio5090PhaseGate": Studio5090PhaseGate,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "Studio5090PhaseGate": "Studio5090 Phase Gate",
}
