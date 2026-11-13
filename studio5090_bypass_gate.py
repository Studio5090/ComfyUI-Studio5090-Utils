# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Alan Rosenfeld
# Studio5090 - see LICENSE at the repository root for full terms.
# Provided "AS IS", without warranty of any kind.
"""
Studio5090 Bypass Gate (v1.7.44)
Designed by Alan Rosenfeld + Claude (Anthropic), 2026.

One input of any type, one mode, one output.

  * Follow A/B Switch:  reads the Studio5090 Image A/B Switch in the same
    workflow, with no wire.  Flux.2 Input = Run.  Manual Image Input = Skip.
  * Run:   runs whatever feeds the input and passes it through.
  * Skip:  never asks for its input, so the node feeding it does not run.
    It sends out a skip, so every node after it (and every node after
    those) is skipped quietly, with no error.

Why no wire from the A/B Switch:  the A/B Switch waits for the FLUX.2 image,
FLUX.2 waits for the gate, so a wire from the switch to the gate makes a
loop and ComfyUI refuses to queue the workflow.  Reading the switch's
setting avoids the loop.

The gate only stops what is after it.  A node that feeds the gate can still
run if something else asks for it.
"""

import logging

from comfy_execution.graph import ExecutionBlocker

FOLLOW = "Follow A/B Switch"
RUN = "Run"
SKIP = "Skip"
_AB_TYPE = "Studio5090ImageABSwitch"
_LOG = "[Studio5090 Bypass Gate]"


class _AnyType(str):
    """Matches every type, so the gate takes and gives any value."""
    def __ne__(self, other):
        return False


ANY = _AnyType("*")


def _follow(prompt):
    """True to run, from the A/B Switch setting in the queued workflow."""
    switches = [(nid, n) for nid, n in (prompt or {}).items()
                if isinstance(n, dict) and n.get("class_type") == _AB_TYPE]
    if not switches:
        raise RuntimeError(
            "Studio5090 Bypass Gate: set to Follow A/B Switch, but there is no "
            "Studio5090 Image A/B Switch in this workflow.  Add one, or set the "
            "gate to Run or Skip.")
    values = set()
    for nid, n in switches:
        v = (n.get("inputs") or {}).get("use_manual_image")
        if not isinstance(v, bool):
            raise RuntimeError(
                "Studio5090 Bypass Gate: the Image A/B Switch's switch is wired "
                "from another node, so the gate cannot read it.  Use the switch "
                "on the node itself, or set the gate to Run or Skip.")
        values.add(v)
    if len(values) > 1:
        raise RuntimeError(
            "Studio5090 Bypass Gate: this workflow has more than one Image A/B "
            "Switch, and they are set differently.  Set them the same, or set "
            "the gate to Run or Skip.")
    return not values.pop()


class Studio5090BypassGate:

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "mode": ([FOLLOW, RUN, SKIP], {
                    "default": FOLLOW,
                    "tooltip": "Follow A/B Switch: Flux.2 Input runs, Manual Image Input "
                               "skips.  Run passes the input through.  Skip stops the "
                               "input from running and skips everything after the gate."}),
            },
            "optional": {
                "input": (ANY, {"lazy": True}),
            },
            "hidden": {"prompt": "PROMPT", "unique_id": "UNIQUE_ID"},
        }

    RETURN_TYPES = (ANY,)
    RETURN_NAMES = ("output",)
    FUNCTION = "gate"
    CATEGORY = "Studio5090"

    @staticmethod
    def _should_run(mode, prompt):
        if mode == RUN:
            return True
        if mode == SKIP:
            return False
        return _follow(prompt)

    def check_lazy_status(self, mode, prompt=None, unique_id=None, **kwargs):
        # A wired input that has not run yet arrives as None; an input with
        # nothing wired to it is missing entirely.  Only ask when running.
        if not self._should_run(mode, prompt):
            return []
        return ["input"] if "input" in kwargs and kwargs["input"] is None else []

    def gate(self, mode, prompt=None, unique_id=None, **kwargs):
        run = self._should_run(mode, prompt)
        logging.info(f"{_LOG} node {unique_id}: {mode} -> {'run' if run else 'skip'}")
        if not run:
            return (ExecutionBlocker(None),)
        if "input" not in kwargs:
            raise RuntimeError(
                "Studio5090 Bypass Gate: the gate is set to run, but nothing is "
                "connected to its input.  Connect it, or set the gate to Skip.")
        return (kwargs["input"],)


def _stamp_follow(json_data):
    """Queue hook.  The A/B Switch is read, not wired, so ComfyUI's cache
    would not see it change and would reuse the gate's last result.  Write
    the decision into each Follow gate's inputs, so flipping the switch
    reruns the gate (and only then)."""
    try:
        prompt = json_data.get("prompt") or {}
        for n in prompt.values():
            if not isinstance(n, dict) or n.get("class_type") != "Studio5090BypassGate":
                continue
            inputs = n.setdefault("inputs", {})
            if inputs.get("mode", FOLLOW) != FOLLOW:
                inputs.pop("_follow", None)
                continue
            try:
                inputs["_follow"] = "run" if _follow(prompt) else "skip"
            except Exception:
                inputs["_follow"] = "error"
    except Exception as e:
        logging.warning(f"{_LOG} queue hook: {e}")
    return json_data


def register_prompt_hook():
    from server import PromptServer
    PromptServer.instance.add_on_prompt_handler(_stamp_follow)


NODE_CLASS_MAPPINGS = {"Studio5090BypassGate": Studio5090BypassGate}
NODE_DISPLAY_NAME_MAPPINGS = {"Studio5090BypassGate": "Studio5090 Bypass Gate"}
