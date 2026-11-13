# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Alan Rosenfeld
# Studio5090 — see LICENSE at the repository root for full terms.
# Provided "AS IS", without warranty of any kind.
"""
Studio5090 LLM Model Select
Designed by Alan Rosenfeld + Claude (Anthropic), 2026.

One dropdown that sets the LLM model for every Prompt Generator node
(ComfyUI-Prompt-Manager) in the workflow.  Change the model here once, for
example when moving a workflow from a 5090 to a 3070, and all of them follow.

v1.7.47: no wires.  Prompt Manager's October 2026 update rejects any wire
into a Prompt Generator's model field ("Model must be a string").  So
js/studio5090_llm_model_select.js writes the chosen model straight into the
model field of every Prompt Generator, subgraphs included: when the dropdown
changes, when a workflow opens, and just before every Run.  Any old wire
into a Prompt Generator's model field is removed.  The node can sit anywhere
in the workflow.  The "model" output is kept only so older workflows still
open; it is no longer needed.

The dropdown shows the same list the Prompt Generator shows, read live from
ComfyUI-Prompt-Manager.  If that pack is not installed, the dropdown still
works with the default name only.
"""

DEFAULT_MODEL = "Qwen3.5-9B-Q8_0.gguf"
USE_DEFAULT = "(use default)"


class _AnyType(str):
    """Connects to the Prompt Generator's dropdown input."""
    def __ne__(self, other):
        return False


_ANY = _AnyType("*")


def _model_choices():
    """The Prompt Generator's own model list, with our default guaranteed present."""
    choices = []
    try:
        import nodes
        generator = nodes.NODE_CLASS_MAPPINGS.get("PromptGenerator")
        if generator is not None and hasattr(generator, "_available_models"):
            choices = [str(m) for m in generator._available_models()]
    except Exception as exc:
        print(f"[Studio5090 LLM Model Select] Could not read the Prompt Generator model list: {exc}")
    if DEFAULT_MODEL not in choices:
        choices.append(DEFAULT_MODEL)
    if USE_DEFAULT not in choices:
        choices.insert(0, USE_DEFAULT)
    return choices


class Studio5090LLMModelSelect:

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "model": (_model_choices(), {
                    "default": DEFAULT_MODEL,
                    "tooltip": "LLM used by every Prompt Generator in the workflow.  No wires needed.",
                }),
            }
        }

    RETURN_TYPES = (_ANY,)
    RETURN_NAMES = ("model",)
    FUNCTION = "select"
    CATEGORY = "Studio5090/Prompt"

    def select(self, model):
        return (model,)


NODE_CLASS_MAPPINGS = {"Studio5090LLMModelSelect": Studio5090LLMModelSelect}
NODE_DISPLAY_NAME_MAPPINGS = {"Studio5090LLMModelSelect": "Studio5090 LLM Model Select"}
