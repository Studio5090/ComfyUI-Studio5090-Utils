# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Alan Rosenfeld
# Studio5090 — see LICENSE at the repository root for full terms.
# Provided "AS IS", without warranty of any kind.

"""
Studio5090 API routes.
"""
import json
import os
import asyncio
from aiohttp import web


def register_routes(routes):
    from .studio5090_utils import (
        Studio5090RenderProjectManager as PM,
        Studio5090HDRRenderQueue as HDR,
        _subject_path, _create_path, _edits_path,
        _audio_path, _movies_path, _characters_path, _grab_path, _exr_path,
        _videos_path, _videos_hdr_path,
        _workflows_path, _product_templates_dir, _list_product_templates,
        _list_multiangle_images, _list_projects, _list_project_videos,
        _queue_state_load, _queue_state_save,
        _load_hdr_template, _mutate_hdr_workflow_for_job,
        _ui_workflow_to_api, _cleanup_vhs_audio_twin,
        _list_accents, _get_accent_body,  # v1.7.0
        QWEN_ANGLES,
        folder_paths
    )

    # One-time retrofit: ensure existing projects have AUDIO/, MOVIES/,
    # CHARACTERS/ (v1.4 / v1.4.2), EXR/ (v1.5.0), VIDEOS/HDR/ (v1.5.2),
    # and workflows/ (v1.6.0) subfolders. Silent best-effort.
    #
    # v1.6.1: the v1.6.0 retrofit also auto-copied product workflow templates
    # into existing projects' empty workflows/ folders. That turned out to
    # be invasive — users who dropped template JSONs into the toolkit found
    # every existing project suddenly populated with template copies they
    # never asked for. The template auto-copy now happens ONLY at
    # create_project time (for new projects). Existing projects that want
    # the templates can load them via the Open Workflow picker's TEMPLATES
    # section, which is always available.
    try:
        for proj in _list_projects():
            for fn in (_audio_path, _movies_path, _characters_path,
                       _exr_path, _videos_hdr_path, _workflows_path):
                try:
                    os.makedirs(fn(proj), exist_ok=True)
                except Exception:
                    pass
    except Exception:
        pass

    @routes.post("/studio5090/create_project")
    async def create_project(request):
        data = await request.json()
        return web.Response(text=json.dumps(PM.create_project(data.get("project_name",""))),
                            content_type="application/json")

    @routes.post("/studio5090/create_subject")
    async def create_subject(request):
        data = await request.json()
        return web.Response(
            text=json.dumps(PM.create_subject(data.get("project",""), data.get("subject_name",""))),
            content_type="application/json")

    # ---------------------------------------------------------------------
    # v1.6.0: workflow save/load/list/templates
    # ---------------------------------------------------------------------

    def _next_workflow_version(workflows_dir, base_name):
        """Find the next available `<base_name>_v<N>.json` in workflows_dir.

        Strips any trailing `_v<N>` suffix from base_name before searching,
        so re-saving a workflow that was loaded as `<base>_v3.json` with
        base_name=`<base>_v3` correctly produces `<base>_v4.json` rather
        than `<base>_v3_v1.json`.
        """
        import re
        if not base_name:
            base_name = "workflow"
        # Strip trailing _v<digits> if present (case-insensitive).
        stripped = re.sub(r"_[vV]\d+$", "", base_name.strip())
        if not stripped:
            stripped = base_name.strip() or "workflow"

        if not os.path.isdir(workflows_dir):
            return f"{stripped}_v1.json"

        highest = 0
        pattern = re.compile(re.escape(stripped) + r"_[vV](\d+)\.json$",
                             re.IGNORECASE)
        for f in os.listdir(workflows_dir):
            m = pattern.match(f)
            if m:
                try:
                    n = int(m.group(1))
                    if n > highest:
                        highest = n
                except Exception:
                    pass
        return f"{stripped}_v{highest + 1}.json"


    @routes.post("/studio5090/save_workflow")
    async def save_workflow(request):
        """v1.6.0: write a ComfyUI workflow JSON to the project's workflows/
        directory. Auto-increments the version suffix.

        Body: {project, base_name, workflow_json}
          - project: target project (need not be the currently-selected one)
          - base_name: filename stem; auto-incremented version suffix is
            appended. If base_name already ends with _v<N>, that suffix is
            stripped before incrementing.
          - workflow_json: the full ComfyUI graph JSON, as produced by
            app.graphToPrompt() or equivalent

        Returns: {success: bool, filename: str, project: str} on success
                 or {success: False, error: str}
        """
        try:
            data = await request.json()
            project = (data.get("project") or "").strip()
            base_name = (data.get("base_name") or "").strip()
            workflow_json = data.get("workflow_json")

            if not project:
                return web.Response(
                    text=json.dumps({"success": False, "error": "Project required"}),
                    content_type="application/json")
            if not base_name:
                return web.Response(
                    text=json.dumps({"success": False, "error": "base_name required"}),
                    content_type="application/json")
            if workflow_json is None:
                return web.Response(
                    text=json.dumps({"success": False, "error": "workflow_json required"}),
                    content_type="application/json")

            # Ensure the target project's workflows folder exists. We do this
            # unconditionally so users can save into a project that pre-dates
            # the v1.6.0 retrofit (or any other edge case).
            wf_dir = _workflows_path(project)
            os.makedirs(wf_dir, exist_ok=True)

            filename = _next_workflow_version(wf_dir, base_name)
            path = os.path.join(wf_dir, filename)
            with open(path, "w", encoding="utf-8") as f:
                json.dump(workflow_json, f, indent=2)
            return web.Response(
                text=json.dumps({"success": True,
                                 "filename": filename,
                                 "project": project}),
                content_type="application/json")
        except Exception as e:
            return web.Response(
                text=json.dumps({"success": False, "error": str(e)}),
                content_type="application/json")


    @routes.get("/studio5090/list_workflows")
    async def list_workflows(request):
        """v1.6.0 / v1.7.3: return all workflows known to the toolkit,
        grouped for the workflow picker UI.

        Response:
          {
            "templates": [list of template filenames in product/workflow_templates/],
            "projects": { "<project_name>": [list of workflow filenames] }
          }

        v1.7.3 CHANGE: every project is included in the projects dict
        regardless of whether it has saved workflows. Projects with no
        workflows return an empty list. This lets the picker show the
        user that a project exists (so newly-created projects are
        discoverable) rather than silently hiding it.

        Filenames in `templates` are bare filenames in the toolkit's
        templates/product_workflows/ directory. Filenames in `projects` are
        bare filenames inside each project's workflows/ folder. The caller
        is expected to know how to reconstruct paths from the structure.
        """
        try:
            result = {
                "templates": _list_product_templates(),
                "projects": {},
            }
            for proj in _list_projects():
                wf_dir = _workflows_path(proj)
                if os.path.isdir(wf_dir):
                    files = sorted([f for f in os.listdir(wf_dir)
                                    if f.lower().endswith(".json")])
                else:
                    files = []
                # v1.7.3: include the project unconditionally, even
                # when files is empty. The picker JS renders empty
                # sections with a helpful "no saved workflows" message.
                result["projects"][proj] = files
            return web.Response(text=json.dumps(result),
                                content_type="application/json")
        except Exception as e:
            return web.Response(
                text=json.dumps({"templates": [], "projects": {},
                                 "error": str(e)}),
                content_type="application/json")


    @routes.get("/studio5090/load_workflow")
    async def load_workflow(request):
        """v1.6.0: return the JSON content of a specific workflow file.

        Query params:
          source = "template" or "project"
          project = project name (only used when source=project)
          filename = bare filename within the source folder
        """
        try:
            q = request.rel_url.query
            source   = q.get("source", "")
            project  = q.get("project", "")
            filename = q.get("filename", "")

            if not filename or ".." in filename or "/" in filename or "\\" in filename:
                return web.Response(
                    text=json.dumps({"success": False, "error": "Invalid filename"}),
                    content_type="application/json")

            if source == "template":
                path = os.path.join(_product_templates_dir(), filename)
            elif source == "project":
                if not project:
                    return web.Response(
                        text=json.dumps({"success": False,
                                         "error": "project required for source=project"}),
                        content_type="application/json")
                path = os.path.join(_workflows_path(project), filename)
            else:
                return web.Response(
                    text=json.dumps({"success": False,
                                     "error": "source must be 'template' or 'project'"}),
                    content_type="application/json")

            if not os.path.isfile(path):
                return web.Response(
                    text=json.dumps({"success": False,
                                     "error": f"Workflow file not found: {filename}"}),
                    content_type="application/json")

            with open(path, "r", encoding="utf-8") as f:
                workflow_json = json.load(f)
            return web.Response(
                text=json.dumps({"success": True,
                                 "workflow_json": workflow_json,
                                 "filename": filename,
                                 "source": source,
                                 "project": project}),
                content_type="application/json")
        except Exception as e:
            return web.Response(
                text=json.dumps({"success": False, "error": str(e)}),
                content_type="application/json")

    @routes.get("/studio5090/projects")
    async def get_projects(request):
        return web.Response(text=json.dumps(PM.get_projects()),
                            content_type="application/json")

    # ---------------------------------------------------------------------
    # v1.7.0: Accents for the CASTING node dropdown
    # ---------------------------------------------------------------------

    @routes.get("/studio5090/accents")
    async def get_accents(request):
        """Return the list of accent names + bodies parsed from the
        active accents file. The active file is STUDIO5090/accents.txt
        if the user has created one, otherwise the toolkit's shipped
        templates/accents.txt.

        Response: {"accents": [{"name": str, "body": str}, ...]}
        """
        # We use a local helper rather than _list_accents() so we can
        # return both name and body in one call — the dropdown needs
        # names for display and the execute node would otherwise need a
        # second round-trip to look up the body. One call is cleaner.
        from .studio5090_utils import _parse_accents_file, _effective_accents_path
        try:
            accents = _parse_accents_file(_effective_accents_path())
            return web.Response(text=json.dumps({"accents": accents}),
                                content_type="application/json")
        except Exception as e:
            return web.Response(
                text=json.dumps({"accents": [], "error": str(e)}),
                content_type="application/json")

    # v1.7.36: Casting keeps its own subject list (see _list_casting_subjects).
    # v1.7.37: render style names for the PM dropdowns (render_styles.txt).
    @routes.get("/studio5090/render_styles")
    async def render_styles(request):
        from .studio5090_utils import _list_render_styles
        styles = _list_render_styles()
        out = {"styles": [st["name"] for st in styles]}
        # v1.7.55: ?bodies=1 adds each style's text, for the Create PM viewer.
        if request.rel_url.query.get("bodies") == "1":
            out["bodies"] = {st["name"]: st["body"] for st in styles}
        return web.Response(text=json.dumps(out), content_type="application/json")

    @routes.get("/studio5090/llm_overrides")
    async def llm_overrides(request):
        """v1.7.45: which Casting LLM files the user has their own copy of."""
        from .studio5090_utils import _llm_overrides
        return web.Response(text=json.dumps({"overrides": _llm_overrides()}),
                            content_type="application/json")

    @routes.get("/studio5090/overrides")
    async def all_overrides(request):
        """v1.7.46: every personal copy in STUDIO5090.  ?log=1 (sent by the
        PMs' Refresh buttons) also writes each one to the ComfyUI log."""
        from .studio5090_utils import _all_overrides
        log = request.rel_url.query.get("log", "") == "1"
        return web.Response(text=json.dumps({"overrides": _all_overrides(log=log)}),
                            content_type="application/json")

    @routes.get("/studio5090/casting/subjects")
    async def casting_subjects(request):
        from .studio5090_utils import _list_casting_subjects
        project = request.rel_url.query.get("project", "")
        return web.Response(text=json.dumps({"subjects": _list_casting_subjects(project)}),
                            content_type="application/json")

    @routes.post("/studio5090/casting/create_subject")
    async def casting_create_subject(request):
        from .studio5090_utils import _create_casting_subject
        data = await request.json()
        return web.Response(
            text=json.dumps(_create_casting_subject(data.get("project", ""), data.get("subject_name", ""))),
            content_type="application/json")

    @routes.get("/studio5090/subjects")
    async def get_subjects(request):
        return web.Response(
            text=json.dumps(PM.get_subjects(request.rel_url.query.get("project",""))),
            content_type="application/json")

    @routes.get("/studio5090/check_subject_exists")
    async def check_subject_exists(request):
        """Check if MULTIANGLE/<subject>/ folder exists for a project, and
        if so, how many image files it contains. Used by Qwen batch UI to
        warn before merging into an existing folder.
        Returns: {exists: bool, image_count: int}
        """
        q = request.rel_url.query
        project = q.get("project", "")
        subject = q.get("subject", "")
        if not project or not subject:
            return web.Response(
                text=json.dumps({"exists": False, "image_count": 0}),
                content_type="application/json")
        path = _subject_path(project, subject)
        if not os.path.isdir(path):
            return web.Response(
                text=json.dumps({"exists": False, "image_count": 0}),
                content_type="application/json")
        count = len(_list_multiangle_images(project, subject))
        return web.Response(
            text=json.dumps({"exists": True, "image_count": count}),
            content_type="application/json")

    @routes.get("/studio5090/source_images")
    async def get_source_images(request):
        return web.Response(
            text=json.dumps(PM.get_source_images(request.rel_url.query.get("project",""))),
            content_type="application/json")

    @routes.get("/studio5090/all_frame_images")
    async def get_all_frame_images(request):
        q = request.rel_url.query
        return web.Response(
            text=json.dumps(PM.get_all_frame_images(q.get("project",""), q.get("subject",""))),
            content_type="application/json")

    # v1.7.10: two endpoints supporting the lazy-load-per-section picker.
    # `/studio5090/frame_folders` enumerates just the section headers
    # (folder names) without listing files — cheap, one shallow walk of
    # each parent folder. Called once when the picker opens.
    # `/studio5090/frame_folder_contents` returns the tagged filenames
    # for a single named section — called on each twirl-open. Only the
    # sections the user actually opens pay their walk cost.
    #
    # Both endpoints coexist with /studio5090/all_frame_images (kept for
    # backward compatibility with any external callers). The picker now
    # uses the two new endpoints; nothing else needs to change.
    @routes.get("/studio5090/frame_folders")
    async def get_frame_folders(request):
        """List the section headers a picker should show for a project.
        Response: {"folders": ["CREATE", "EDITS", "CHARACTERS",
                                "MULTIANGLE:SINGLES",
                                "MULTIANGLE:DOCK_WORKERS", ...],
                    "counts":  {folder: int}}   # image count per folder
        Cheap — walks each parent folder once with a stat-only pass.
        """
        q       = request.rel_url.query
        project = q.get("project","")
        return web.Response(
            text=json.dumps(PM.get_frame_folders(project)),
            content_type="application/json")

    @routes.get("/studio5090/frame_folder_contents")
    async def get_frame_folder_contents(request):
        """List the tagged filenames inside a single named section.
        Query: project=X, folder=CREATE | EDITS | CHARACTERS |
                                MULTIANGLE:<subject>
        Response: {"images": ["[CREATE] foo.png", ...]}
        """
        q       = request.rel_url.query
        project = q.get("project","")
        folder  = q.get("folder","")
        return web.Response(
            text=json.dumps(PM.get_frame_folder_contents(project, folder)),
            content_type="application/json")

    @routes.get("/studio5090/qwen_angles")
    async def get_qwen_angles(request):
        return web.Response(text=json.dumps(PM.get_qwen_angles()),
                            content_type="application/json")

    @routes.get("/studio5090/thumbnail")
    async def get_thumbnail(request):
        q        = request.rel_url.query
        project  = q.get("project","")
        subject  = q.get("subject","")   # may be empty if folder encodes subject
        folder   = q.get("folder","MULTIANGLE")
        filename = q.get("file","")

        # folder may be "MULTIANGLE:SubjectName" — extract subject from it
        if folder.startswith("MULTIANGLE:"):
            subj_name = folder.split(":", 1)[1]
            path = os.path.join(_subject_path(project, subj_name), filename)
        elif folder == "MULTIANGLE":
            path = os.path.join(_subject_path(project, subject), filename)
        elif folder == "CREATE":     path = os.path.join(_create_path(project), filename)
        elif folder == "EDITS":      path = os.path.join(_edits_path(project), filename)
        elif folder == "CHARACTERS": path = os.path.join(_characters_path(project), filename)
        elif folder == "GRAB":       path = os.path.join(_grab_path(project), filename)
        else: return web.Response(status=400, text="Invalid folder")

        if not os.path.isfile(path):
            return web.Response(status=404, text="Not found")

        ext = os.path.splitext(filename)[1].lower()
        ct  = {".jpg":"image/jpeg",".jpeg":"image/jpeg",
               ".png":"image/png",".webp":"image/webp"}.get(ext,"image/png")
        with open(path,"rb") as f:
            data = f.read()
        return web.Response(body=data, content_type=ct)

    @routes.post("/studio5090/queue_qwen_batch")
    async def queue_qwen_batch(request):
        """
        Queue 17 Qwen Multi Angle generations via the ComfyUI /prompt API.
        Copies source image into ComfyUI input/ so LoadImage validation passes.
        Body: {
          project, subject, source_image_path, workflow,
          output_subject (optional, defaults to subject),
          prompt_modifier (optional, appended to each angle prompt)
        }
        """
        import aiohttp as aiohttp_lib
        import copy, random, shutil
        data               = await request.json()
        project            = data.get("project","")
        subject            = data.get("subject","")
        source_image_path  = data.get("source_image_path","")  # full absolute path
        workflow_json      = data.get("workflow")
        prompt_modifier    = (data.get("prompt_modifier","") or "").strip()

        if not all([project, subject, source_image_path, workflow_json]):
            return web.Response(
                text=json.dumps({"success":False,"error":"Missing required fields"}),
                content_type="application/json")

        if not os.path.isfile(source_image_path):
            return web.Response(
                text=json.dumps({"success":False,"error":f"Source image not found: {source_image_path}"}),
                content_type="application/json")

        # Copy source image into ComfyUI input/ directory so LoadImage can find it
        input_dir  = folder_paths.get_input_directory()
        src_fname  = os.path.basename(source_image_path)
        input_copy = os.path.join(input_dir, src_fname)
        shutil.copy2(source_image_path, input_copy)

        # output_subject is explicitly provided by the user via prompt dialog
        output_subject = data.get("output_subject", subject)
        if not output_subject or not output_subject.strip():
            output_subject = subject
        output_subject = output_subject.strip()

        output_root = os.path.join(
            folder_paths.output_directory, "STUDIO5090", project, "MULTIANGLE", output_subject
        )
        # v1.5.7: do NOT pre-create output_root. ComfyUI's Save Image node
        # creates parent folders at write time. If the workflow fails before
        # any images are saved, no empty folder is left on disk.

        queued = []
        errors = []

        from .studio5090_qwen_log import add_log_node, angle_label
        async with aiohttp_lib.ClientSession() as session:
            for angle_i, (prompt_text, suffix) in enumerate(QWEN_ANGLES, 1):
                wf = copy.deepcopy(workflow_json)
                # v1.7.54: one log line per angle when it starts rendering.
                add_log_node(wf, angle_label(suffix, output_subject, angle_i, len(QWEN_ANGLES)))

                # Node 14 (LoadImage) — bare filename, now resolvable from input/
                wf["14"]["inputs"]["image"] = src_fname

                # Node 6 (Positive TextEncode) — angle prompt + optional modifier
                # v1.5.0: auto-insert ", " between angle prompt and modifier
                # so users don't have to remember the leading comma. Strip any
                # leading commas/whitespace from the user's input so a typed
                # comma doesn't become double-comma.
                if prompt_modifier:
                    mod = prompt_modifier.lstrip(",; \t")
                    full_prompt = f"{prompt_text}, {mod}" if mod else prompt_text
                else:
                    full_prompt = prompt_text
                wf["6"]["inputs"]["prompt"] = full_prompt

                # Node 15 (SaveImage) — output path with subfolder
                wf["15"]["inputs"]["filename_prefix"] =                     f"STUDIO5090/{project}/MULTIANGLE/{output_subject}/{suffix}"

                # Randomize seed
                wf["10"]["inputs"]["seed"] = random.randint(0, 2**32 - 1)

                payload = {"prompt": wf}
                try:
                    async with session.post(
                        "http://127.0.0.1:8188/prompt",
                        json=payload
                    ) as resp:
                        result = await resp.json()
                        queued.append({"suffix": suffix, "prompt_id": result.get("prompt_id")})
                except Exception as e:
                    errors.append({"suffix": suffix, "error": str(e)})

        return web.Response(
            text=json.dumps({"success": True, "queued": len(queued),
                             "subject_used": output_subject,
                             "errors": errors, "jobs": queued}),
            content_type="application/json")

    @routes.post("/studio5090/queue_qwen_single")
    async def queue_qwen_single(request):
        """
        v1.5.7: Queue a single Qwen Multi Angle generation for one specific
        angle, used by the new Generate Single button.

        Body: {
          project,
          source_image_path,        // full absolute path (used for file copy)
          source_tag,               // CREATE | EDITS | CHARACTERS | MULTIANGLE:<subject>
          source_basename,          // base filename without tag prefix
          selected_angle_suffix,    // suffix from QWEN_ANGLES, picks the angle
          workflow,                 // workflow JSON to deep-copy and customize
          prompt_modifier (optional)
        }

        Output naming (option 2):
          - If source_tag starts with MULTIANGLE: → MULTIANGLE/<subject>/<source_stem>_oneoff_<angle>
          - Else (CREATE/EDITS/CHARACTERS)        → MULTIANGLE/SINGLES/<source_stem>_<angle>
        """
        import aiohttp as aiohttp_lib
        import copy, random, shutil
        data                  = await request.json()
        project               = data.get("project","")
        source_image_path     = data.get("source_image_path","")
        source_tag            = data.get("source_tag","")
        source_basename       = data.get("source_basename","")
        selected_angle_suffix = data.get("selected_angle_suffix","")
        workflow_json         = data.get("workflow")
        prompt_modifier       = (data.get("prompt_modifier","") or "").strip()

        if not all([project, source_image_path, source_tag,
                    source_basename, selected_angle_suffix, workflow_json]):
            return web.Response(
                text=json.dumps({"success":False,"error":"Missing required fields"}),
                content_type="application/json")

        if not os.path.isfile(source_image_path):
            return web.Response(
                text=json.dumps({"success":False,"error":f"Source image not found: {source_image_path}"}),
                content_type="application/json")

        # Find the matching angle entry in QWEN_ANGLES.
        angle_entry = next((p for p in QWEN_ANGLES if p[1] == selected_angle_suffix), None)
        if not angle_entry:
            return web.Response(
                text=json.dumps({"success":False,"error":f"Unknown angle: {selected_angle_suffix}"}),
                content_type="application/json")
        prompt_text, suffix = angle_entry

        # Copy source image into ComfyUI input/ directory so LoadImage can find it.
        input_dir  = folder_paths.get_input_directory()
        src_fname  = os.path.basename(source_image_path)
        input_copy = os.path.join(input_dir, src_fname)
        shutil.copy2(source_image_path, input_copy)

        # Determine output path per option 2 naming rules.
        # Strip extension from source_basename for use in output filename.
        source_stem = os.path.splitext(source_basename)[0]
        if source_tag.startswith("MULTIANGLE:"):
            # One-off branch from an existing multiangle. Lives next to its
            # family inside the same subject folder.
            subject_for_output = source_tag.split(":", 1)[1]
            filename_prefix = (
                f"STUDIO5090/{project}/MULTIANGLE/{subject_for_output}/"
                f"{source_stem}_oneoff_{suffix}"
            )
        else:
            # One-off from CREATE/EDITS/CHARACTERS. Lives in MULTIANGLE/SINGLES/.
            filename_prefix = (
                f"STUDIO5090/{project}/MULTIANGLE/SINGLES/"
                f"{source_stem}_{suffix}"
            )

        # Deep-copy the workflow and customize for this single render.
        wf = copy.deepcopy(workflow_json)
        wf["14"]["inputs"]["image"] = src_fname

        if prompt_modifier:
            mod = prompt_modifier.lstrip(",; \t")
            full_prompt = f"{prompt_text}, {mod}" if mod else prompt_text
        else:
            full_prompt = prompt_text
        wf["6"]["inputs"]["prompt"] = full_prompt

        wf["15"]["inputs"]["filename_prefix"] = filename_prefix
        wf["10"]["inputs"]["seed"] = random.randint(0, 2**32 - 1)
        # v1.7.54: one log line when this angle starts rendering.
        from .studio5090_qwen_log import add_log_node, angle_label
        add_log_node(wf, angle_label(suffix, filename_prefix.rsplit("/", 2)[-2]))

        # Queue it.
        async with aiohttp_lib.ClientSession() as session:
            try:
                async with session.post(
                    "http://127.0.0.1:8188/prompt",
                    json={"prompt": wf}
                ) as resp:
                    result = await resp.json()
                    return web.Response(
                        text=json.dumps({
                            "success": True,
                            "queued": 1,
                            "angle": suffix,
                            "output_prefix": filename_prefix,
                            "prompt_id": result.get("prompt_id"),
                        }),
                        content_type="application/json")
            except Exception as e:
                return web.Response(
                    text=json.dumps({"success": False, "error": str(e)}),
                    content_type="application/json")

    @routes.get("/studio5090/resolve_image_path")
    async def resolve_image_path(request):
        """Resolve a tagged image filename to its full absolute path.

        Tag formats:
          [CREATE] foo.png
          [EDITS] foo.png
          [CHARACTERS] foo.png             (v1.5.1)
          [MULTIANGLE] foo.png             (uses ?subject= query param)
          [MULTIANGLE:SubjectName] foo.png (subject embedded in tag)
        """
        q        = request.rel_url.query
        project  = q.get("project","")
        subject  = q.get("subject","")
        tagged   = q.get("tagged","")

        import re
        m = re.match(
            r"^\[(CREATE|EDITS|CHARACTERS|GRAB|MULTIANGLE(?::([^\]]+))?)\] (.+)$",
            tagged)
        if m:
            folder      = m.group(1).split(":",1)[0]   # CREATE / EDITS / CHARACTERS / MULTIANGLE
            tag_subject = m.group(2)                   # SubjectName or None
            fname       = m.group(3)
            if   folder == "CREATE":     path = os.path.join(_create_path(project),     fname)
            elif folder == "EDITS":      path = os.path.join(_edits_path(project),      fname)
            elif folder == "CHARACTERS": path = os.path.join(_characters_path(project), fname)
            elif folder == "GRAB":       path = os.path.join(_grab_path(project), fname)
            else:
                # MULTIANGLE — prefer subject from tag, fall back to query param
                subj_name = tag_subject or subject
                path = os.path.join(_subject_path(project, subj_name), fname)
        else:
            # Untagged — check input/ directory
            path = os.path.join(folder_paths.get_input_directory(), tagged)

        return web.Response(
            text=json.dumps({"path": path, "exists": os.path.isfile(path)}),
            content_type="application/json")

    @routes.get("/studio5090/list_input_images")
    async def list_input_images(request):
        """List all images in ComfyUI input/ directory."""
        input_dir = folder_paths.get_input_directory()
        images = sorted([
            f for f in os.listdir(input_dir)
            if f.lower().endswith((".png",".jpg",".jpeg",".webp"))
        ]) if os.path.isdir(input_dir) else []
        return web.Response(text=json.dumps({"images": images}),
                            content_type="application/json")

    @routes.get("/studio5090/input_thumbnail")
    async def input_thumbnail(request):
        """Serve thumbnail from ComfyUI input/ directory."""
        filename = request.rel_url.query.get("file","")
        path = os.path.join(folder_paths.get_input_directory(), filename)
        if not os.path.isfile(path):
            return web.Response(status=404, text="Not found")
        ext = os.path.splitext(filename)[1].lower()
        ct  = {".jpg":"image/jpeg",".jpeg":"image/jpeg",
               ".png":"image/png",".webp":"image/webp"}.get(ext,"image/png")
        with open(path,"rb") as f:
            data = f.read()
        return web.Response(body=data, content_type=ct)

    # -----------------------------------------------------------------------
    # HDR Render Queue routes (v1.5.0)
    # -----------------------------------------------------------------------

    # ---------------------------------------------------------------------
    # v1.7.19: RETRIEVE SETTINGS
    # ---------------------------------------------------------------------

    @routes.get("/studio5090/settings/videos")
    async def settings_videos(request):
        """List every .mp4/.mov under a project's VIDEOS folder, newest first."""
        import os as _os
        from .studio5090_utils import _videos_path
        from .studio5090_video_settings import VIDEO_EXTENSIONS
        project = request.rel_url.query.get("project", "")
        out = []
        base = _videos_path(project) if project else ""
        if base and _os.path.isdir(base):
            for folder, _dirs, files in _os.walk(base):
                for name in files:
                    if not name.lower().endswith(VIDEO_EXTENSIONS):
                        continue
                    full = _os.path.join(folder, name)
                    rel = _os.path.relpath(full, base).replace("\\", "/")
                    try:
                        mtime = _os.path.getmtime(full)
                    except OSError:
                        mtime = 0
                    out.append({"file": rel, "mtime": mtime})
        out.sort(key=lambda v: v["mtime"], reverse=True)
        return web.Response(text=json.dumps({"videos": out}),
                            content_type="application/json")

    @routes.get("/studio5090/settings/read")
    async def settings_read(request):
        """Return the settings text stored inside one video."""
        import os as _os
        from .studio5090_utils import _videos_path
        from .studio5090_video_settings import read_settings_text
        project = request.rel_url.query.get("project", "")
        rel = request.rel_url.query.get("file", "")
        base = _os.path.realpath(_videos_path(project)) if project else ""
        full = _os.path.realpath(_os.path.join(base, rel)) if base else ""
        if not base or not rel or not (full == base or full.startswith(base + _os.sep)):
            ok, text = False, "File not found."
        else:
            ok, text = read_settings_text(full)
        return web.Response(text=json.dumps({"success": ok, "text": text}),
                            content_type="application/json")

    @routes.post("/studio5090/settings/read_picked")
    async def settings_read_picked(request):
        """v1.7.29: settings for a file picked in the Windows dialog.  The file
        is found in ComfyUI's output or input folder by name and size."""
        import asyncio as _asyncio
        from .studio5090_load_video import match_local, resolve_ref
        from .studio5090_video_settings import read_settings_text
        d = await request.json()
        name = str(d.get("name", ""))
        try:
            size = int(d.get("size", -1))
        except (TypeError, ValueError):
            size = -1
        loop = _asyncio.get_running_loop()
        ref = await loop.run_in_executor(None, match_local, name, size, d.get("mtime"))
        full = resolve_ref(ref) if ref else None
        if not full:
            ok, text = False, (name + " is not in ComfyUI's output or input folder, "
                               "so its settings can't be read.")
        else:
            ok, text = await loop.run_in_executor(None, read_settings_text, full)
        return web.Response(text=json.dumps({"success": ok, "text": text}),
                            content_type="application/json")

    @routes.post("/studio5090/workflow/read_picked")
    async def workflow_read_picked(request):
        """v1.7.34: the workflow stored in a file picked in the Windows dialog.
        The file is found in ComfyUI's output or input folder by name and size."""
        import asyncio as _asyncio
        from .studio5090_load_video import match_local, resolve_ref
        from .studio5090_video_settings import read_workflow
        d = await request.json()
        name = str(d.get("name", ""))
        try:
            size = int(d.get("size", -1))
        except (TypeError, ValueError):
            size = -1
        loop = _asyncio.get_running_loop()
        ref = await loop.run_in_executor(None, match_local, name, size, d.get("mtime"))
        full = resolve_ref(ref) if ref else None
        if not full:
            body = {"success": False,
                    "text": name + " is not in ComfyUI's output or input folder."}
        else:
            wf, reason = await loop.run_in_executor(None, read_workflow, full)
            body = {"success": wf is not None, "workflow": wf, "text": reason or ""}
        return web.Response(text=json.dumps(body), content_type="application/json")

    @routes.get("/studio5090/hdr_queue/videos")
    async def hdr_queue_videos(request):
        """List source videos available in a project's VIDEOS/ folder."""
        project = request.rel_url.query.get("project", "")
        return web.Response(
            text=json.dumps({"videos": _list_project_videos(project)}),
            content_type="application/json")

    @routes.get("/studio5090/hdr_queue/state")
    async def hdr_queue_state(request):
        """Get full queue state (pending, running, completed)."""
        return web.Response(
            text=json.dumps(_queue_state_load()),
            content_type="application/json")

    @routes.post("/studio5090/hdr_queue/add")
    async def hdr_queue_add(request):
        """
        Add one or more jobs to the pending queue.
        Body: {jobs: [{project, source_video, scene_name, save_exr, save_prores}, ...]}

        scene_name defaults to the source video filename stem if blank.
        """
        data = await request.json()
        jobs = data.get("jobs", []) or []
        if not jobs:
            return web.Response(
                text=json.dumps({"success": False, "error": "No jobs provided"}),
                content_type="application/json")

        state = _queue_state_load()
        import uuid, time
        added = 0
        for j in jobs:
            project = (j.get("project") or "").strip()
            src     = (j.get("source_video") or "").strip()
            if not project or not src:
                continue
            scene = (j.get("scene_name") or "").strip()
            if not scene:
                scene = os.path.splitext(src)[0]  # default to source stem
            job = {
                "id":           str(uuid.uuid4())[:8],
                "project":      project,
                "source_video": src,
                "scene_name":   scene,
                "save_exr":     bool(j.get("save_exr", False)),
                "save_prores":  bool(j.get("save_prores", True)),
                "queued_at":    time.time(),
            }
            state["pending"].append(job)
            added += 1
        _queue_state_save(state)
        return web.Response(
            text=json.dumps({"success": True, "added": added,
                             "pending_total": len(state["pending"])}),
            content_type="application/json")

    @routes.post("/studio5090/hdr_queue/remove")
    async def hdr_queue_remove(request):
        """Remove a job from the pending queue by id."""
        data = await request.json()
        job_id = data.get("id", "")
        state = _queue_state_load()
        before = len(state["pending"])
        state["pending"] = [j for j in state["pending"] if j.get("id") != job_id]
        _queue_state_save(state)
        return web.Response(
            text=json.dumps({"success": True,
                             "removed": before - len(state["pending"])}),
            content_type="application/json")

    @routes.post("/studio5090/hdr_queue/clear_completed")
    async def hdr_queue_clear_completed(request):
        """Clear the completed-jobs list."""
        state = _queue_state_load()
        n = len(state["completed"])
        state["completed"] = []
        _queue_state_save(state)
        return web.Response(
            text=json.dumps({"success": True, "cleared": n}),
            content_type="application/json")

    @routes.post("/studio5090/hdr_queue/clear_all")
    async def hdr_queue_clear_all(request):
        """
        v1.5.2: Nuke pending + completed lists. Does NOT touch `running` —
        if a job is currently executing, the user should cancel it
        explicitly through recover_running instead. Mixing the two
        operations would risk losing state on a live job.
        """
        state = _queue_state_load()
        pending_n   = len(state["pending"])
        completed_n = len(state["completed"])
        state["pending"]   = []
        state["completed"] = []
        _queue_state_save(state)
        return web.Response(
            text=json.dumps({"success": True,
                             "pending_cleared": pending_n,
                             "completed_cleared": completed_n,
                             "running_preserved": state.get("running") is not None}),
            content_type="application/json")

    @routes.post("/studio5090/hdr_queue/run_next")
    async def hdr_queue_run_next(request):
        """
        Pull the head of the pending queue, mark it running, submit it to
        ComfyUI's /prompt endpoint. Returns the prompt_id so the widget can
        track progress via the existing /history endpoint.

        Caller (the canvas widget) drives this in a loop: call run_next when
        the previous job's prompt_id finishes, until pending is empty.
        Keeping orchestration in the widget means the server stays simple
        and a ComfyUI restart mid-queue cleanly resumes (running gets pushed
        back to pending if needed).
        """
        import aiohttp as aiohttp_lib

        state = _queue_state_load()
        if state["running"] is not None:
            # Someone else is already running a job — refuse rather than double-submit
            return web.Response(
                text=json.dumps({"success": False,
                                 "error": "A job is already running",
                                 "running": state["running"]}),
                content_type="application/json")
        if not state["pending"]:
            return web.Response(
                text=json.dumps({"success": False, "error": "Queue empty"}),
                content_type="application/json")

        job = state["pending"].pop(0)

        # Verify source video still exists
        src_path = os.path.join(_videos_path(job["project"]), job["source_video"])
        if not os.path.isfile(src_path):
            state["completed"].append({**job, "status": "failed",
                                       "error": f"Source not found: {src_path}"})
            _queue_state_save(state)
            return web.Response(
                text=json.dumps({"success": False,
                                 "error": f"Source video missing: {job['source_video']}"}),
                content_type="application/json")

        # v1.5.1: ComfyUI's core LoadVideo validates `file` against the input
        # directory only — it cannot reference files in output/ directly.
        # Mirror the queue_qwen_batch pattern: copy the source into input/
        # so LoadVideo's validation passes. Record the copy path on the job
        # so job_complete can delete it after the render finishes.
        import shutil
        try:
            input_dir = folder_paths.get_input_directory()
            os.makedirs(input_dir, exist_ok=True)
            input_copy_path = os.path.join(input_dir, job["source_video"])
            # Only copy if the destination doesn't already match (idempotent
            # — re-running the same job after a crash skips the copy).
            need_copy = True
            if os.path.isfile(input_copy_path):
                try:
                    if os.path.getsize(input_copy_path) == os.path.getsize(src_path):
                        need_copy = False
                except Exception:
                    pass
            if need_copy:
                shutil.copy2(src_path, input_copy_path)
                print(f"[Studio5090] HDR: staged source to input/ "
                      f"({os.path.basename(src_path)})")
            job["_input_copy"] = input_copy_path  # so job_complete can clean it up
        except Exception as e:
            state["completed"].append({**job, "status": "failed",
                                       "error": f"Input staging failed: {e}"})
            _queue_state_save(state)
            return web.Response(
                text=json.dumps({"success": False,
                                 "error": f"Input staging failed: {e}"}),
                content_type="application/json")

        # v1.5.2: ensure VIDEOS/HDR/ target folder exists. The startup
        # retrofit handles existing projects, but a project created during
        # the same ComfyUI session won't have it yet — VHS will fail to
        # write into a non-existent directory.
        try:
            os.makedirs(_videos_hdr_path(job["project"]), exist_ok=True)
        except Exception:
            pass

        # Ensure EXR target folder exists if EXR is on
        if job.get("save_exr"):
            try:
                os.makedirs(os.path.join(_exr_path(job["project"]),
                                         job["scene_name"]), exist_ok=True)
            except Exception:
                pass

        # Build the API workflow from a fresh template copy
        try:
            template = _load_hdr_template()
            _mutate_hdr_workflow_for_job(template, job)
            api_wf = _ui_workflow_to_api(template)
        except FileNotFoundError:
            state["completed"].append({**job, "status": "failed",
                                       "error": "HDR template missing from toolkit"})
            _queue_state_save(state)
            return web.Response(
                text=json.dumps({"success": False,
                                 "error": "HDR template not found in toolkit"}),
                content_type="application/json")
        except Exception as e:
            state["completed"].append({**job, "status": "failed",
                                       "error": f"Workflow build failed: {e}"})
            _queue_state_save(state)
            return web.Response(
                text=json.dumps({"success": False,
                                 "error": f"Workflow build failed: {e}"}),
                content_type="application/json")

        # Mark running BEFORE submission so a crash mid-submit is recoverable
        state["running"] = job
        _queue_state_save(state)

        # Submit to ComfyUI's /prompt endpoint
        try:
            async with aiohttp_lib.ClientSession() as session:
                async with session.post("http://127.0.0.1:8188/prompt",
                                        json={"prompt": api_wf}) as resp:
                    result = await resp.json()
        except Exception as e:
            # Roll back: put the job back in pending so user can retry
            state["pending"].insert(0, job)
            state["running"] = None
            _queue_state_save(state)
            return web.Response(
                text=json.dumps({"success": False,
                                 "error": f"Submit failed: {e}"}),
                content_type="application/json")

        prompt_id = result.get("prompt_id")
        # Store prompt_id on the running job so widget can poll /history
        state = _queue_state_load()  # reload in case state changed
        if state["running"] and state["running"].get("id") == job["id"]:
            state["running"]["prompt_id"] = prompt_id
            _queue_state_save(state)

        return web.Response(
            text=json.dumps({"success": True, "job": job,
                             "prompt_id": prompt_id}),
            content_type="application/json")

    @routes.post("/studio5090/hdr_queue/job_complete")
    async def hdr_queue_job_complete(request):
        """
        Widget notifies that the running job's prompt has finished (success
        or error). We run VHS audio-twin cleanup, move the job into completed,
        and clear the running slot so the widget can call run_next.
        Body: {status: "ok"|"error", error?: str}
        """
        data = await request.json()
        status = data.get("status", "ok")
        err    = data.get("error")

        state = _queue_state_load()
        job = state.get("running")
        if not job:
            return web.Response(
                text=json.dumps({"success": False, "error": "No running job"}),
                content_type="application/json")

        # Cleanup VHS audio-twin only on success — if it failed, leave the
        # outputs alone so the user can inspect.
        # v1.5.2: HDR masters now write into VIDEOS/HDR/ (not VIDEOS/), and we
        # strip trailing underscores from the scene stem to match the cleaner
        # filename produced by the mutate function. Both must agree or the
        # cleanup won't find the files.
        if status == "ok":
            try:
                cleanup_scene = job["scene_name"].rstrip("_")
                _cleanup_vhs_audio_twin(
                    cleanup_scene,
                    _videos_hdr_path(job["project"])
                )
            except Exception as e:
                print(f"[Studio5090] VHS cleanup raised: {e}")

        # v1.5.1: remove the source-video copy we staged into input/ at submit
        # time. Best-effort — leaves the file alone if the delete fails.
        input_copy = job.get("_input_copy")
        if input_copy:
            try:
                if os.path.isfile(input_copy):
                    os.remove(input_copy)
                    print(f"[Studio5090] HDR: removed staged input "
                          f"{os.path.basename(input_copy)}")
            except Exception as e:
                print(f"[Studio5090] Input cleanup raised: {e}")

        import time
        completed_entry = {**job, "status": status, "completed_at": time.time()}
        # Don't persist the internal staging path in the completed history;
        # it's an implementation detail and would clutter the queue state file.
        completed_entry.pop("_input_copy", None)
        if err:
            completed_entry["error"] = err
        state["completed"].append(completed_entry)
        state["running"] = None

        # v1.5.2: strict auto-clear. When the queue naturally drains (running
        # is now None, pending is empty), clear the completed list too. The
        # user said: "Strict auto clear when queue is done and empty." This
        # gives a clean state each session and fixes the stale-progress-bar
        # issue (the prior 1/3 reading came from completed jobs persisting
        # across sessions). The widget shows a transient "Queue complete"
        # status before the next state reload reflects the cleared list.
        cleared_count = 0
        if not state["pending"]:
            cleared_count = len(state["completed"])
            state["completed"] = []

        _queue_state_save(state)

        return web.Response(
            text=json.dumps({"success": True,
                             "pending_remaining": len(state["pending"]),
                             "auto_cleared": cleared_count}),
            content_type="application/json")

    @routes.post("/studio5090/hdr_queue/recover_running")
    async def hdr_queue_recover_running(request):
        """
        Called by the widget on first load. If a `running` job is set but
        ComfyUI doesn't know about its prompt_id (e.g. restart killed it),
        push it back to pending head so it can be retried.
        Body: {force: bool}  — if true, recover unconditionally
        """
        data = await request.json()
        force = bool(data.get("force", False))
        state = _queue_state_load()
        if not state.get("running"):
            return web.Response(
                text=json.dumps({"success": True, "recovered": False}),
                content_type="application/json")

        # We don't currently probe ComfyUI's /history to verify the prompt
        # is still active — that's a future improvement. For now, the widget
        # can call this with force=True after confirming with the user.
        if not force:
            return web.Response(
                text=json.dumps({"success": True, "recovered": False,
                                 "needs_confirm": True,
                                 "running": state["running"]}),
                content_type="application/json")

        job = state["running"]
        job.pop("prompt_id", None)  # clear stale prompt id
        state["pending"].insert(0, job)
        state["running"] = None
        _queue_state_save(state)
        return web.Response(
            text=json.dumps({"success": True, "recovered": True}),
            content_type="application/json")

    print("[Studio5090] API routes registered OK")
