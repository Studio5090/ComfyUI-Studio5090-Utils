# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Alan Rosenfeld
# Studio5090 — see LICENSE at the repository root for full terms.
# Provided "AS IS", without warranty of any kind.
"""Studio5090 starter project check (v1.7.57, v1.7.58).

Studio5090 needs its starter project at ComfyUI/output/STUDIO5090/STUDIO5090/.
At startup this writes a clear warning to the ComfyUI log when it is missing,
and the browser shows a popup with the download link (js/studio5090_starter_check.js).
"""

import logging
import os

DOWNLOAD_URL = "https://github.com/Studio5090/ComfyUI-Studio5090-Utils/releases/latest"


def starter_path():
    import folder_paths
    return os.path.join(folder_paths.get_output_directory(), "STUDIO5090", "STUDIO5090")


def starter_present():
    try:
        return os.path.isdir(starter_path())
    except Exception:
        return True   # never block anything on a check that failed


def _has_files(path, skip=None):
    """True when path holds any file (empty folders do not count).  Studio5090
    makes empty project folders at startup, so only real files show where the
    project actually is."""
    for root, dirs, files in os.walk(path):
        if skip and os.path.abspath(root) == os.path.abspath(path):
            dirs[:] = [d for d in dirs if d != skip]
        if files:
            return True
    return False


def status():
    """{"present", "nested", "path", "nested_path", "url"}.
    present: the project is where it belongs.  nested: it is one folder too deep."""
    path = starter_path()
    deep = os.path.join(path, "STUDIO5090")
    nested = (os.path.isdir(deep) and _has_files(deep)
              and not _has_files(path, skip="STUDIO5090"))
    present = os.path.isdir(path) and not nested
    return {"present": present, "nested": nested, "path": path,
            "nested_path": deep if nested else "", "url": DOWNLOAD_URL}


def log_startup():
    st = status()
    if st["present"]:
        return
    bar = "=" * 72
    if st["nested"]:
        logging.warning(
            f"\n{bar}\n[Studio5090] The starter project is one folder too deep.\n"
            f"  Found:    {st['nested_path']}\n"
            f"  Expected: {st['path']}\n"
            f"  Move everything inside the inner STUDIO5090 folder up one level into the\n"
            f"  expected folder, delete the empty inner folder, then restart ComfyUI.\n{bar}")
        return
    logging.warning(
        f"\n{bar}\n[Studio5090] The starter project is missing.\n"
        f"  Expected folder: {st['path']}\n"
        f"  Download STUDIO5090.zip from:\n  {DOWNLOAD_URL}\n"
        f"  Extract it into your ComfyUI output folder, then restart ComfyUI.\n{bar}")


def register_routes(routes):
    from aiohttp import web

    @routes.get("/studio5090/starter_status")
    async def starter_status(request):
        return web.json_response(status())
