# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Alan Rosenfeld
# Studio5090 - see LICENSE at the repository root for full terms.
# Provided "AS IS", without warranty of any kind.
"""
Studio5090 Image A/B Switch (v1.7.44)
Designed by Alan Rosenfeld + Claude (Anthropic), 2026.

Two image inputs and one switch.  The switch picks which image goes out:
"Flux.2 Input" or "Manual Image Input".

  * The input that is not picked may be empty or bypassed.  It causes no
    error.
  * Only the picked input is run.  With the switch on Manual Image Input,
    the FLUX.2 nodes that feed only this switch do not run at all, so there
    is nothing to bypass.
"""

FLUX = "Flux.2 Input"
MANUAL = "Manual Image Input"


class Studio5090ImageABSwitch:

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "use_manual_image": ("BOOLEAN", {
                    "default": False, "label_on": MANUAL, "label_off": FLUX,
                    "tooltip": "Which image goes out.  The other input is not run."}),
            },
            "optional": {
                FLUX: ("IMAGE", {"lazy": True}),
                MANUAL: ("IMAGE", {"lazy": True}),
            },
        }

    RETURN_TYPES = ("IMAGE",)
    RETURN_NAMES = ("image",)
    FUNCTION = "pick"
    CATEGORY = "Studio5090/Image"

    def check_lazy_status(self, use_manual_image, **kwargs):
        want = MANUAL if use_manual_image else FLUX
        # A wired input that has not run yet arrives as None; an input with
        # nothing wired to it is missing entirely.  Only ask for the first.
        return [want] if want in kwargs and kwargs[want] is None else []

    def pick(self, use_manual_image, **kwargs):
        want = MANUAL if use_manual_image else FLUX
        image = kwargs.get(want)
        if image is None:
            raise RuntimeError(
                f"Studio5090 Image A/B Switch: the switch is set to '{want}', "
                f"but nothing reaches that input.  Connect it, un-bypass the "
                f"node that feeds it, or flip the switch.")
        return (image,)


NODE_CLASS_MAPPINGS = {"Studio5090ImageABSwitch": Studio5090ImageABSwitch}
NODE_DISPLAY_NAME_MAPPINGS = {"Studio5090ImageABSwitch": "Studio5090 Image A/B Switch"}
