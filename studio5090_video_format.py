# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Alan Rosenfeld
# Studio5090 - see LICENSE at the repository root for full terms.
# Provided "AS IS", without warranty of any kind.
"""
Studio5090 Video Format Selector (v2 - COMBO-compatible outputs)
Designed by Alan Rosenfeld + Claude (Anthropic), 2026.

Single-boolean selector that outputs the correct bit_depth and
color_space values for ComfyUI's Create Video node based on which
LTX model family is being used.

v2 change: outputs are declared as COMBO lists so they wire directly
into Create Video's COMBO dropdown inputs. Create Video rejects raw
INT/STRING wires on these slots even when the value is valid; a COMBO
declaration matching the node's own choices is what it accepts.

INPUT:
  ltx_version (BOOLEAN):
    True  -> LTX 2.3 (bit_depth=8,  color_space="sRGB")
    False -> LTX 2.5 (bit_depth=10, color_space="HDR PQ")

OUTPUTS:
  bit_depth   (COMBO INT):    8 or 10
  color_space (COMBO STRING): "sRGB" or "HDR PQ"
"""


# Declare the allowed sets. ComfyUI reads these as COMBO lists and will
# wire into any downstream COMBO input whose own list contains the value.
_BIT_DEPTHS = [8, 10]
_COLOR_SPACES = ["sRGB", "HDR PQ"]


class Studio5090VideoFormat:
    """Pick bit_depth + color_space for Create Video from one boolean."""

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "ltx_version": (
                    "BOOLEAN",
                    {
                        "default": True,
                        "label_on": "LTX 2.3 (8-bit sRGB)",
                        "label_off": "LTX 2.5 (10-bit HDR PQ)",
                    },
                ),
            },
        }

    # Declare outputs as COMBO lists. ComfyUI treats a tuple-wrapped list
    # as the COMBO type, which is what Create Video's bit_depth and
    # color_space inputs declare on their end.
    RETURN_TYPES = (_BIT_DEPTHS, _COLOR_SPACES)
    RETURN_NAMES = ("bit_depth", "color_space")
    FUNCTION = "pick_format"
    CATEGORY = "Studio5090"

    def pick_format(self, ltx_version):
        if ltx_version:
            # LTX 2.3: 8-bit sRGB output
            return (8, "sRGB")
        else:
            # LTX 2.5: 10-bit HDR PQ output
            return (10, "HDR PQ")


NODE_CLASS_MAPPINGS = {
    "Studio5090VideoFormat": Studio5090VideoFormat,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "Studio5090VideoFormat": "Studio5090 Video Format (LTX 2.3 / 2.5)",
}
