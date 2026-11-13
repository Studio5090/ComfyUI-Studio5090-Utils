# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Alan Rosenfeld
# Studio5090 — see LICENSE at the repository root for full terms.
# Provided "AS IS", without warranty of any kind.
"""
Studio5090 Settings Stamp
Designed by Alan Rosenfeld + Claude (Anthropic), 2026.

Place one after each ProRes Video Combine node and wire that node's
Filenames output into it.  When the video has been saved, this node writes
the render settings (Duration, seed, samplers, steps, prompts ...) and the
workflow into the end of that same file, so Fetch Data From Video and
Open Workflow From Video in the Project Managers can read them back.

One file per render.  No extra files are written.

If the save path was switched off for this run (the Output Router blocked
it), this node is skipped automatically.

v1.7.46: "drop -audio from name" (on by default) renames X_00001-audio.mp4
to X_00001.mp4 after stamping.  If X_00001.mp4 is already there, the file is
left as it is.  The Video Combine preview is pointed at the new name.
"""

import logging
import os

from .studio5090_video_settings import (
    VIDEO_EXTENSIONS, format_settings, write_stamp, write_workflow_stamp,
)


class _AnyType(str):
    def __ne__(self, other):
        return False


_ANY = _AnyType("*")


class Studio5090SettingsStamp:

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "filenames": (_ANY, {"tooltip": "Filenames output of the Video Combine node."}),
            },
            "optional": {
                "drop_audio_from_name": ("BOOLEAN", {
                    "default": True,
                    "label_on": "on", "label_off": "off",
                    "tooltip": "Rename X_00001-audio.mp4 to X_00001.mp4 after stamping.  "
                               "Skipped when that name is already taken."}),
            },
            "hidden": {"prompt": "PROMPT", "extra_pnginfo": "EXTRA_PNGINFO"},
        }

    RETURN_TYPES = (_ANY,)
    RETURN_NAMES = ("filenames",)
    FUNCTION = "stamp"
    OUTPUT_NODE = True
    CATEGORY = "Studio5090/Video"

    def stamp(self, filenames, drop_audio_from_name=True, prompt=None, extra_pnginfo=None):
        text = format_settings(prompt) if isinstance(prompt, dict) else None
        workflow = extra_pnginfo.get("workflow") if isinstance(extra_pnginfo, dict) else None
        if not isinstance(workflow, dict):
            workflow = None
        if not text and not workflow and not drop_audio_from_name:
            return (filenames,)

        paths = []
        if isinstance(filenames, (list, tuple)) and len(filenames) == 2 \
                and isinstance(filenames[1], (list, tuple)):
            paths = list(filenames[1])              # VHS: (save_output, [paths])
        elif isinstance(filenames, str):
            paths = [filenames]

        videos = [p for p in paths if isinstance(p, str) and p.lower().endswith(VIDEO_EXTENSIONS)]
        if not videos:
            # Video Combine returns an empty list when it was handed no frames,
            # which is normal on a save path the Output Router did not use this
            # run.  v1.7.54: stay quiet about it.
            return (filenames,)
        if not text:
            print("[Studio5090 Settings Stamp] No settings block in this workflow, settings not stamped.")
        for path in videos:
            if not os.path.isfile(path):
                continue        # the silent copy Video Combine removes once audio is added
            done = []
            for what, value, fn in (("settings", text, write_stamp), ("workflow", workflow, write_workflow_stamp)):
                if not value:
                    continue
                try:
                    ok, message = fn(path, value)
                except Exception as exc:
                    ok, message = False, str(exc)
                done.append(f"{what} {message}")
            if done:
                print(f"[Studio5090 Settings Stamp] {os.path.basename(path)}: {', '.join(done)}")

        renamed = []
        if drop_audio_from_name:
            for path in videos:
                new = drop_audio_name(path)
                if new:
                    renamed.append((path, new))
        if not renamed:
            return {"ui": {"studio5090_renamed": []}, "result": (filenames,)}

        mapping = dict(renamed)
        if isinstance(filenames, (list, tuple)) and len(filenames) == 2 \
                and isinstance(filenames[1], (list, tuple)):
            filenames = (filenames[0], [mapping.get(p, p) for p in filenames[1]])
        elif isinstance(filenames, str):
            filenames = mapping.get(filenames, filenames)
        ui = [{"old": os.path.basename(a), "new": os.path.basename(b)} for a, b in renamed]
        return {"ui": {"studio5090_renamed": ui}, "result": (filenames,)}


def drop_audio_name(path):
    """X_00001-audio.mp4 -> X_00001.mp4.  Returns the new path, or None when the
    name has no -audio, the file is missing, or the new name is already taken."""
    folder, base = os.path.split(path)
    stem, ext = os.path.splitext(base)
    if not stem.endswith("-audio") or not os.path.isfile(path):
        return None
    new = os.path.join(folder, stem[:-len("-audio")] + ext)
    if os.path.exists(new):
        print(f"[Studio5090 Settings Stamp] {base}: kept -audio in the name, "
              f"{os.path.basename(new)} already exists.")
        return None
    # v1.7.52: on Windows the file can still be open for a moment, usually
    # because the browser is loading the Video Combine preview (WinError 32).
    # Try again for up to 15 seconds before giving up.
    import time
    last = None
    for attempt in range(60):
        try:
            os.rename(path, new)
            if attempt:
                print(f"[Studio5090 Settings Stamp] {base} was busy, renamed after "
                      f"{attempt * 0.25:.2f} s")
            print(f"[Studio5090 Settings Stamp] renamed {base} -> {os.path.basename(new)}")
            return new
        except PermissionError as exc:      # file in use (Windows)
            last = exc
            time.sleep(0.25)
        except OSError as exc:
            last = exc
            break
    logging.warning(f"[Studio5090 Settings Stamp] could not rename {base}, kept the "
                    f"-audio name.  Another program still had it open after 15 s: {last}")
    return None


NODE_CLASS_MAPPINGS = {"Studio5090SettingsStamp": Studio5090SettingsStamp}
NODE_DISPLAY_NAME_MAPPINGS = {"Studio5090SettingsStamp": "Studio5090 Settings Stamp"}
