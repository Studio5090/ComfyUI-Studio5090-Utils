# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Alan Rosenfeld
# Studio5090 — see LICENSE at the repository root for full terms.
# Provided "AS IS", without warranty of any kind.
"""
Studio5090 Retrieve Settings
Designed by Alan Rosenfeld + Claude (Anthropic), 2026.

Reads the render settings stored inside a finished video file and returns
them as plain text.  The video itself is never decoded: only the small
header block of the file (the "moov" box) is read, so a multi-gigabyte
ProRes file is as quick as a small mp4.

Where the settings come from
  ComfyUI save nodes embed the workflow that made the file.  The Studio5090
  RENDER workflow contains a "create DICT from STRINGs" node listing every
  setting (Duration, seed, fps, CFG, samplers, steps, strengths, prompts).
  This module finds that node in the embedded workflow and prints it as
      Key: value
  one per line, in the order the node lists them.

No ffmpeg or ffprobe is needed.  This file has no ComfyUI imports.
"""

import json
import os
import re
import struct

VIDEO_EXTENSIONS = (".mp4", ".mov", ".m4v")

# The embedded workflow starts like  {"7534": {"inputs": ...  or  {"7534": {"class_type": ...
_PROMPT_START = re.compile(r'\{"[0-9:]+": \{"(?:inputs|class_type)"')


# ---------------------------------------------------------------------------
# Settings stamp
#
# ffmpeg 8 cuts very large tags short when it writes a .mov, so the embedded
# workflow cannot be relied on for ProRes.  The Studio5090 Settings Stamp
# node therefore adds the settings text to the end of the finished file as
# one small "free" box.  Players and editors skip "free" boxes by design, so
# the picture and sound are untouched.
# ---------------------------------------------------------------------------

STAMP_MAGIC = b"STUDIO5090-SETTINGS-1\n"


def _top_level_boxes(f, size_on_disk):
    """Return [(kind, start, size)] for a well-formed file, else None."""
    boxes = []
    pos = 0
    while pos < size_on_disk:
        f.seek(pos)
        header = f.read(8)
        if len(header) < 8:
            return None
        size, kind = struct.unpack(">I4s", header)
        if size == 1:
            big = f.read(8)
            if len(big) < 8:
                return None
            size = struct.unpack(">Q", big)[0]
            if size < 16:
                return None
        elif size < 8:                          # 0 = "runs to end of file"
            return None
        if pos + size > size_on_disk:
            return None
        boxes.append((kind, pos, size))
        pos += size
    return boxes


# v1.7.34: a second box carries the whole workflow (the same JSON ComfyUI
# keeps in a PNG), so Open Workflow From Video can open it in a new tab.
WORKFLOW_MAGIC = b"STUDIO5090-WORKFLOW-1\n"
_OUR_MAGICS = (STAMP_MAGIC, WORKFLOW_MAGIC)


def _our_box(f, start, size):
    """Which of our magics this free box starts with, or None."""
    f.seek(start + 8)
    head = f.read(max(len(m) for m in _OUR_MAGICS))
    for m in _OUR_MAGICS:
        if size >= 8 + len(m) and head.startswith(m):
            return m
    return None


def read_stamp(path, magic=STAMP_MAGIC):
    """Return the stamped text for `magic` (settings by default), or None."""
    size_on_disk = os.path.getsize(path)
    with open(path, "rb") as f:
        boxes = _top_level_boxes(f, size_on_disk)
        if not boxes:
            return None
        for kind, start, size in reversed(boxes):
            if kind != b"free" or size < 8 + len(magic):
                continue
            f.seek(start + 8)
            if f.read(len(magic)) != magic:
                continue
            return f.read(size - 8 - len(magic)).decode("utf-8", errors="replace")
    return None


def write_stamp(path, text, magic=STAMP_MAGIC):
    """Add (or replace) one of our stamps at the end of a .mov / .mp4.

    Returns (ok, message).  The file is only ever touched at its very end,
    and only if its box layout checks out first.  Our other stamp, if
    present, is kept.
    """
    if not os.path.isfile(path):
        return False, "file not found"
    if not path.lower().endswith(VIDEO_EXTENSIONS):
        return False, "not a .mov or .mp4"
    size_on_disk = os.path.getsize(path)
    with open(path, "r+b") as f:
        boxes = _top_level_boxes(f, size_on_disk)
        if not boxes or not any(kind == b"moov" for kind, _s, _z in boxes):
            return False, "unexpected file layout, left untouched"
        # Our stamps always sit together at the very end.
        end = size_on_disk
        keep = []
        for kind, start, size in reversed(boxes):
            if kind != b"free":
                break
            m = _our_box(f, start, size)
            if m is None:
                break
            end = start
            if m != magic:
                f.seek(start)
                keep.insert(0, f.read(size))
        payload = magic + text.encode("utf-8")
        box = struct.pack(">I4s", 8 + len(payload), b"free") + payload
        f.seek(end)
        f.truncate()
        for old in keep:
            f.write(old)
        f.write(box)
    return True, "stamped"


def write_workflow_stamp(path, workflow):
    """Store the workflow (dict) in the file.  Returns (ok, message)."""
    try:
        text = json.dumps(workflow, separators=(",", ":"))
    except Exception as exc:
        return False, f"workflow could not be stored: {exc}"
    return write_stamp(path, text, WORKFLOW_MAGIC)


_WORKFLOW_START = re.compile(r'\{"(?:id|last_node_id|revision|version|nodes|state)":')


def read_workflow(path):
    """Return (workflow_dict, None) or (None, reason) for one video file.

    Our own stamp first; otherwise the workflow ComfyUI or VideoHelperSuite
    put in the file's metadata (mp4 files)."""
    if not os.path.isfile(path):
        return None, "File not found."
    try:
        stamped = read_stamp(path, WORKFLOW_MAGIC)
        if stamped:
            wf = json.loads(stamped)
            if isinstance(wf, dict) and wf.get("nodes") is not None:
                return wf, None
    except Exception:
        pass
    moov = _read_moov(path)
    if moov:
        text = moov.decode("utf-8", errors="replace")
        decoder = json.JSONDecoder()
        for match in _WORKFLOW_START.finditer(text):
            try:
                obj, _ = decoder.raw_decode(text, match.start())
            except Exception:
                continue
            if isinstance(obj, dict) and isinstance(obj.get("nodes"), list) and "links" in obj:
                return obj, None
    return None, "No workflow is stored in this file.  Takes saved before v1.7.34 have settings only."


def _read_moov(path):
    """Return the bytes of the moov box, skipping the video data entirely."""
    size_on_disk = os.path.getsize(path)
    with open(path, "rb") as f:
        pos = 0
        while pos + 8 <= size_on_disk:
            f.seek(pos)
            header = f.read(8)
            if len(header) < 8:
                break
            size, kind = struct.unpack(">I4s", header)
            head = 8
            if size == 1:                       # 64-bit box size
                size = struct.unpack(">Q", f.read(8))[0]
                head = 16
            elif size == 0:                     # box runs to end of file
                size = size_on_disk - pos
            if size < head:
                break
            if kind == b"moov":
                return f.read(size - head)
            pos += size
    return b""


def read_embedded_prompt(path):
    """Return the embedded workflow (API "prompt" form) as a dict, or None."""
    moov = _read_moov(path)
    if not moov:
        return None
    text = moov.decode("utf-8", errors="replace")
    decoder = json.JSONDecoder()

    # VideoHelperSuite: one "comment" tag holding {"prompt": "...", "workflow": {...}}
    start = text.find('{"prompt":')
    while start != -1:
        try:
            obj, _ = decoder.raw_decode(text, start)
            prompt = obj.get("prompt")
            if isinstance(prompt, str):
                prompt = json.loads(prompt)
            if isinstance(prompt, dict) and prompt:
                return prompt
        except Exception:
            pass
        start = text.find('{"prompt":', start + 1)

    # ComfyUI Save Video: a "prompt" tag holding the workflow directly.
    for match in _PROMPT_START.finditer(text):
        try:
            obj, _ = decoder.raw_decode(text, match.start())
            if isinstance(obj, dict) and obj:
                return obj
        except Exception:
            continue
    return None


def _sidecar_png(path):
    """The first-frame PNG that Video Combine writes next to each video.

    X_00001-audio.mov and X_00001.mov both pair with X_00001.png.  The PNG
    holds the whole workflow with no size limit, so it is the fallback when
    the copy inside the video was cut short (ffmpeg truncates very large
    tags in .mov files).
    """
    stem = os.path.splitext(path)[0]
    if stem.endswith("-audio"):
        stem = stem[:-len("-audio")]
    png = stem + ".png"
    return png if os.path.isfile(png) else None


def _read_png_prompt(png_path):
    """Return the "prompt" text chunk of a PNG as a dict, or None."""
    with open(png_path, "rb") as f:
        if f.read(8) != b"\x89PNG\r\n\x1a\n":
            return None
        while True:
            header = f.read(8)
            if len(header) < 8:
                return None
            size, kind = struct.unpack(">I4s", header)
            if kind == b"IDAT" or kind == b"IEND":
                return None                     # text chunks come before the image
            data = f.read(size)
            f.read(4)                           # checksum
            if kind == b"tEXt" and data.startswith(b"prompt\x00"):
                try:
                    obj = json.loads(data[7:].decode("latin-1"))
                    return obj if isinstance(obj, dict) and obj else None
                except Exception:
                    return None


def read_prompt_for_video(path):
    """Workflow from the video itself, else from its first-frame PNG."""
    prompt = None
    try:
        prompt = read_embedded_prompt(path)
    except Exception:
        prompt = None
    if prompt is None:
        png = _sidecar_png(path)
        if png:
            try:
                prompt = _read_png_prompt(png)
            except Exception:
                prompt = None
    return prompt


def _is_link(value, prompt):
    return (isinstance(value, list) and len(value) == 2
            and isinstance(value[0], str) and value[0] in prompt)


def _resolve(value, prompt, depth=0):
    """Follow a wire back to the value that was actually used."""
    if not _is_link(value, prompt):
        return value
    if depth > 12:
        return "?"
    node = prompt[value[0]]
    inputs = node.get("inputs", {})
    kind = node.get("class_type", "")

    if kind == "SomethingToString":
        inner = _resolve(inputs.get("input"), prompt, depth + 1)
        return f"{inputs.get('prefix', '')}{inner}{inputs.get('suffix', '')}"

    if kind == "ComfySwitchNode":
        switch = _resolve(inputs.get("switch"), prompt, depth + 1)
        if isinstance(switch, str):
            switch = switch.strip().lower() in ("true", "1", "yes")
        branch = "on_true" if switch else "on_false"
        return _resolve(inputs.get(branch), prompt, depth + 1)

    if "value" in inputs:
        return _resolve(inputs["value"], prompt, depth + 1)
    literals = [v for v in inputs.values() if not _is_link(v, prompt)]
    links = [v for v in inputs.values() if _is_link(v, prompt)]
    if len(links) == 1:
        return _resolve(links[0], prompt, depth + 1)
    if len(literals) == 1:
        return literals[0]
    return "?"


def format_settings(prompt):
    """Build the Key: value text from an embedded workflow.  None if absent."""
    blocks = [n for n in prompt.values()
              if isinstance(n, dict) and "DictCreateFromString" in str(n.get("class_type", ""))]
    if not blocks:
        return None
    # If there are several, the settings block is the one with the most keys.
    block = max(blocks, key=lambda n: sum(1 for k in n["inputs"] if k.startswith("key_")))
    inputs = block["inputs"]
    lines = []
    index = 0
    while f"key_{index}" in inputs:
        key = _resolve(inputs.get(f"key_{index}"), prompt)
        value = _resolve(inputs.get(f"value_{index}", ""), prompt)
        index += 1
        if key is None or str(key).strip() == "":
            continue
        lines.append(f"{key}: {value}")
    return "\n".join(lines) if lines else None


def read_settings_text(path):
    """Return (ok, text_or_reason) for one video file."""
    if not os.path.isfile(path):
        return False, "File not found."
    if not path.lower().endswith(VIDEO_EXTENSIONS):
        return False, "Only .mp4 and .mov files carry settings."
    try:
        stamped = read_stamp(path)
    except Exception:
        stamped = None
    if stamped:
        return True, stamped
    try:
        prompt = read_prompt_for_video(path)
    except Exception as exc:
        return False, f"Could not read the file: {exc}"
    if prompt is None:
        return False, ("No settings found in this file. "
                       "ProRes files carry them when a Studio5090 Settings "
                       "Stamp node follows the Video Combine node.")
    text = format_settings(prompt)
    if text is None:
        return False, ("This file has a workflow inside it, but not the "
                       "Studio5090 settings block.")
    return True, text
