# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Alan Rosenfeld
# Studio5090 — see LICENSE at the repository root for full terms.
# Provided "AS IS", without warranty of any kind.

from .studio5090_utils import NODE_CLASS_MAPPINGS, NODE_DISPLAY_NAME_MAPPINGS

# v1.7.12: Studio5090 Video Format node (ltx_version boolean -> bit_depth + color_space).
# Lets Create Video receive the correct typed values for LTX 2.3 (8-bit sRGB) or
# LTX 2.5 (10-bit HDR PQ) without any If/Else or Switch(Any) chain.
from .studio5090_video_format import (
    NODE_CLASS_MAPPINGS as _VIDFMT_CLASSES,
    NODE_DISPLAY_NAME_MAPPINGS as _VIDFMT_NAMES,
)
NODE_CLASS_MAPPINGS.update(_VIDFMT_CLASSES)
NODE_DISPLAY_NAME_MAPPINGS.update(_VIDFMT_NAMES)

# v1.7.13: Studio5090 Output Router. Sends the frames to ONE save path
# (ProRes for LTX 2.3, HDR PQ for LTX 2.5) and blocks the other, so each
# render writes one master file.
from .studio5090_output_router import (
    NODE_CLASS_MAPPINGS as _ROUTER_CLASSES,
    NODE_DISPLAY_NAME_MAPPINGS as _ROUTER_NAMES,
)
NODE_CLASS_MAPPINGS.update(_ROUTER_CLASSES)
NODE_DISPLAY_NAME_MAPPINGS.update(_ROUTER_NAMES)

# v1.7.17: Studio5090 Phase Gate. Holds the next phase until the previous
# phase has shown its preview and written its master file. Replaces the
# Save Signal and Signal Merger nodes (v1.7.14 - v1.7.16), which are removed.
from .studio5090_phase_gate import (
    NODE_CLASS_MAPPINGS as _GATE_CLASSES,
    NODE_DISPLAY_NAME_MAPPINGS as _GATE_NAMES,
)
NODE_CLASS_MAPPINGS.update(_GATE_CLASSES)
NODE_DISPLAY_NAME_MAPPINGS.update(_GATE_NAMES)

WEB_DIRECTORY = "./js"

# v1.6.1: ensure the STUDIO5090 root folder exists in ComfyUI's output/
# directory. First-time users would otherwise see an empty project list
# and an apparently-broken PM. Creating the folder defensively here means
# the toolkit always has a valid root to populate, even before the user
# creates their first project.
try:
    import os
    from .studio5090_utils import _studio_root
    os.makedirs(_studio_root(), exist_ok=True)
except Exception as e:
    print(f"[Studio5090] Could not create root folder: {e}")

# v1.5.7: one-time cleanup of empty subject folders accumulated from
# pre-v1.5.7 behavior (when create_subject and queue_qwen_batch eagerly
# created folders that might never receive any files). Safe to run on
# every load; only removes folders that genuinely contain no images.
try:
    from .studio5090_utils import _cleanup_empty_subject_folders
    _cleanup_empty_subject_folders()
except Exception as e:
    print(f"[Studio5090] Empty-subject cleanup failed: {e}")

try:
    from server import PromptServer
    from .studio5090_routes import register_routes
    register_routes(PromptServer.instance.routes)
    print("[Studio5090] API routes registered OK")
except Exception as e:
    print(f"[Studio5090] Route registration failed: {e}")

# v1.7.20: Studio5090 Settings Stamp. Writes the render settings into the
# end of a saved ProRes file so RETRIEVE SETTINGS can read them back.
from .studio5090_settings_stamp import (
    NODE_CLASS_MAPPINGS as _STAMP_CLASSES,
    NODE_DISPLAY_NAME_MAPPINGS as _STAMP_NAMES,
)
NODE_CLASS_MAPPINGS.update(_STAMP_CLASSES)
NODE_DISPLAY_NAME_MAPPINGS.update(_STAMP_NAMES)

# v1.7.22: Studio5090 LLM Model Select. One dropdown that sets the model for
# every Prompt Generator node (ComfyUI-Prompt-Manager) wired to it.
from .studio5090_llm_model_select import (
    NODE_CLASS_MAPPINGS as _LLM_CLASSES,
    NODE_DISPLAY_NAME_MAPPINGS as _LLM_NAMES,
)
NODE_CLASS_MAPPINGS.update(_LLM_CLASSES)
NODE_DISPLAY_NAME_MAPPINGS.update(_LLM_NAMES)

# v1.7.24: Studio5090 Burn-In. Writes settings, a label, SMPTE timecode and
# the frame number onto the frames for review.
from .studio5090_burn_in import (
    NODE_CLASS_MAPPINGS as _BURN_CLASSES,
    NODE_DISPLAY_NAME_MAPPINGS as _BURN_NAMES,
)
NODE_CLASS_MAPPINGS.update(_BURN_CLASSES)
NODE_DISPLAY_NAME_MAPPINGS.update(_BURN_NAMES)

# v1.7.26: Studio5090 File Path Logic. Builds the P3 and P4 save names from
# the Project Manager's video path, in one node.
from .studio5090_file_path_logic import (
    NODE_CLASS_MAPPINGS as _PATH_CLASSES,
    NODE_DISPLAY_NAME_MAPPINGS as _PATH_NAMES,
)
NODE_CLASS_MAPPINGS.update(_PATH_CLASSES)
NODE_DISPLAY_NAME_MAPPINGS.update(_PATH_NAMES)

# v1.7.27: Studio5090 HDR ProRes Save. Writes LTX 2.5 HDR frames as a
# ProRes .mov tagged BT.2020/PQ, so Resolve can read it.
from .studio5090_hdr_prores_save import (
    NODE_CLASS_MAPPINGS as _HDRPR_CLASSES,
    NODE_DISPLAY_NAME_MAPPINGS as _HDRPR_NAMES,
)
NODE_CLASS_MAPPINGS.update(_HDRPR_CLASSES)
NODE_DISPLAY_NAME_MAPPINGS.update(_HDRPR_NAMES)

# v1.7.28: Studio5090 Load Video. Picks a frame from a video already in the
# output or input folder (no upload, so no size limit), with a scrubber.
from .studio5090_load_video import (
    NODE_CLASS_MAPPINGS as _LV_CLASSES,
    NODE_DISPLAY_NAME_MAPPINGS as _LV_NAMES,
    register_routes as _lv_routes,
)
NODE_CLASS_MAPPINGS.update(_LV_CLASSES)
NODE_DISPLAY_NAME_MAPPINGS.update(_LV_NAMES)
try:
    from server import PromptServer as _PS
    _lv_routes(_PS.instance.routes)
except Exception as e:
    print(f"[Studio5090] Load Video routes failed: {e}")

# v1.7.19: make the "video/ProRes-Studio5090" format appear in the Video
# Combine format list.  It is the stock ProRes format plus the save_metadata
# switch, so ProRes files carry their render settings like the mp4 files do.
try:
    import os as _os
    import folder_paths as _fp
    _fmt_dir = _os.path.join(_os.path.dirname(_os.path.abspath(__file__)), "vhs_formats")
    _fp.add_model_folder_path("VHS_video_formats", _fmt_dir)
    _paths, _exts = _fp.folder_names_and_paths["VHS_video_formats"]
    _fp.folder_names_and_paths["VHS_video_formats"] = (_paths, set(_exts) | {".json"})
except Exception as e:
    print(f"[Studio5090] Could not register ProRes-Studio5090 format: {e}")

# v1.7.42: Studio5090 Image A/B Switch. Flux.2 Input or Manual Image Input;
# the input that is not picked is never run and may be empty or bypassed.
from .studio5090_image_ab import (
    NODE_CLASS_MAPPINGS as _AB_CLASSES,
    NODE_DISPLAY_NAME_MAPPINGS as _AB_NAMES,
)
NODE_CLASS_MAPPINGS.update(_AB_CLASSES)
NODE_DISPLAY_NAME_MAPPINGS.update(_AB_NAMES)

# v1.7.44: Studio5090 Bypass Gate. One input of any type.  Follow A/B Switch
# (no wire), Run or Skip; Skip stops the input from running and quietly
# skips everything after the gate.
from .studio5090_bypass_gate import (
    NODE_CLASS_MAPPINGS as _BG_CLASSES,
    NODE_DISPLAY_NAME_MAPPINGS as _BG_NAMES,
    register_prompt_hook as _bg_hook,
)
NODE_CLASS_MAPPINGS.update(_BG_CLASSES)
NODE_DISPLAY_NAME_MAPPINGS.update(_BG_NAMES)
try:
    _bg_hook()
except Exception as e:
    print(f"[Studio5090] Bypass Gate queue hook failed: {e}")

# v1.7.54: QWEN Angle Log, one log line per angle while QWEN renders.
from .studio5090_qwen_log import (
    NODE_CLASS_MAPPINGS as _QLOG_CLASSES,
    NODE_DISPLAY_NAME_MAPPINGS as _QLOG_NAMES,
)
NODE_CLASS_MAPPINGS.update(_QLOG_CLASSES)
NODE_DISPLAY_NAME_MAPPINGS.update(_QLOG_NAMES)

__all__ = ["NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS"]
