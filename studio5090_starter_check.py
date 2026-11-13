# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Alan Rosenfeld
# Studio5090 — see LICENSE at the repository root for full terms.
# Provided "AS IS", without warranty of any kind.
"""Studio5090 starter project check (v1.7.57).

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


def log_startup():
    if starter_present():
        return
    bar = "=" * 72
    logging.warning(
        f"\n{bar}\n[Studio5090] The starter project is missing.\n"
        f"  Expected folder: {starter_path()}\n"
        f"  Download STUDIO5090_Starter_Project.zip from:\n  {DOWNLOAD_URL}\n"
        f"  Unzip it into your ComfyUI output folder, then restart ComfyUI.\n{bar}")


def register_routes(routes):
    from aiohttp import web

    @routes.get("/studio5090/starter_status")
    async def starter_status(request):
        return web.json_response({"present": starter_present(),
                                  "path": starter_path(),
                                  "url": DOWNLOAD_URL})
