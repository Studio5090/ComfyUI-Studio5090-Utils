# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Alan Rosenfeld
# Studio5090 — see LICENSE at the repository root for full terms.
# Provided "AS IS", without warranty of any kind.
"""
Studio5090 File Path Logic
Designed by Alan Rosenfeld + Claude (Anthropic), 2026.

One node that turns the Project Manager's video path into the file names
for the P3 and P4 saves.  It replaces the cluster of String Constant, Regex
and If/Elif/Else nodes.

In:
    video_path   the path from the Project Manager, for example
                 STUDIO5090/MYPROJECT/VIDEOS/Sandy_AUDITION
    ltx_version  on = LTX 2.3, off = LTX 2.5
    output_2k    on = 2K, off = HD   (only used for LTX 2.3)

Out:
    path_1280x768   video_path + "_1280x768"            for the P3 saves
    path_hd_or_2k   video_path + "_1920x1152"            LTX 2.3, HD
                    video_path + "_2560x1536"            LTX 2.3, 2K
                    video_path + "_2560x1536"            LTX 2.5 (always 2K)
    video_path      the path as it came in, unchanged

Safety: if video_path is empty, or is not a real path (no folder in it),
the node stops the run with a clear message.  It never lets a save go to a
made-up name in the wrong folder.
"""

import logging


class Studio5090FilePathLogic:

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "video_path": ("STRING", {"forceInput": True,
                                          "tooltip": "Video path from the Project Manager."}),
                "ltx_version": ("BOOLEAN", {"default": True, "label_on": "LTX 2.3", "label_off": "LTX 2.5"}),
                "output_2k": ("BOOLEAN", {"default": False, "label_on": "2K", "label_off": "HD",
                                          "tooltip": "LTX 2.3 only. LTX 2.5 always uses the 2K name."}),
                "suffix_1280x768": ("STRING", {"default": "_1280x768", "multiline": False}),
                "suffix_hd": ("STRING", {"default": "_1920x1152", "multiline": False}),
                "suffix_2k": ("STRING", {"default": "_2560x1536", "multiline": False}),
            }
        }

    RETURN_TYPES = ("STRING", "STRING", "STRING")
    RETURN_NAMES = ("path_1280x768", "path_hd_or_2k", "video_path")
    FUNCTION = "build"
    CATEGORY = "Studio5090/Video"

    def build(self, video_path, ltx_version, output_2k,
              suffix_1280x768="_1280x768", suffix_hd="_1920x1152", suffix_2k="_2560x1536"):
        base = str(video_path or "").strip().replace("\\", "/").rstrip("/")
        if not base:
            raise ValueError("Studio5090 File Path Logic: video_path is empty. "
                             "Wire the video path from the Project Manager into it, "
                             "and pick a project and subject in the Project Manager.")
        if "/" not in base:
            raise ValueError(f"Studio5090 File Path Logic: '{video_path}' is not a project path. "
                             "It should look like STUDIO5090/<project>/VIDEOS/<name>. "
                             "Nothing was saved.")
        use_2k = (not ltx_version) or bool(output_2k)
        p3 = base + suffix_1280x768
        p4 = base + (suffix_2k if use_2k else suffix_hd)
        logging.info(f"[Studio5090 File Path Logic] P3 -> {p3}")
        logging.info(f"[Studio5090 File Path Logic] P4 -> {p4}")
        return (p3, p4, base)


NODE_CLASS_MAPPINGS = {"Studio5090FilePathLogic": Studio5090FilePathLogic}
NODE_DISPLAY_NAME_MAPPINGS = {"Studio5090FilePathLogic": "Studio5090 File Path Logic"}
