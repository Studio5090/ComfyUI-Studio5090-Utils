# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Alan Rosenfeld
# Studio5090 — see LICENSE at the repository root for full terms.
# Provided "AS IS", without warranty of any kind.

"""
Studio_5090 Utility Nodes — v1.7.58
Designed by Alan Rosenfeld + Claude (Anthropic), 2026.

v1.7.58 release (over v1.7.57):
  - The starter project download is STUDIO5090.zip (log, popup, README).
  - Starter check spots a project one folder too deep
    (output/STUDIO5090/STUDIO5090/STUDIO5090, from Windows Extract All) and
    says to move it up one level.
  - README: Extract All path tip, rename -main, where the templates are.

v1.7.57 release (over v1.7.56):
  - Starter project check.  When ComfyUI/output/STUDIO5090/STUDIO5090/ is
    missing, the ComfyUI log shows a warning with the download link and the
    browser shows a popup with an "Open download page" button.

v1.7.56 release (over v1.7.55):
  - Release templates (CASTING, CREATE, RENDER) from Alan, November 13.
  - README.md for GitHub, .gitignore.

v1.7.55 release (over v1.7.54):
  - Create PM: Render Styles viewer.  Pick a style from the dropdown, read
    its text in a small scrolling box, Copy it into a FLUX or QWEN prompt.
    Viewer only, nothing is added to the node's inputs or outputs.

v1.7.54 release (over v1.7.53):
  - Image pickers list GRAB (Frame Grab snapshots), _BURN copies hidden.
  - Create PM: new flux_prompt_formatter_llm output (no <INSERT HERE>).
    Casting PM: flux_render_style_llm renamed flux_prompt_formatter_llm,
    old wires move over automatically.
  - Settings Stamp stays quiet when it gets no frames.
  - QWEN Angle Log: "Rendering angle 3 of 17: ..." in the log for every
    QWEN multi-angle job (Frame Grab, Create PM, Render PM).

v1.7.53 release (over v1.7.52):
  - QWEN multi-angle everywhere (Create PM, Render PM, Frame Grab) uses
    QWEN_MULTIANGLE_TEMPLATE_v3: resize with center crop to 1536x864, and
    VAEEncode from the resized image.

v1.7.52 release (over v1.7.51):
  - Settings Stamp: when Windows reports the video as busy (WinError 32),
    the -audio rename tries again for up to 15 seconds.
  - Settings Stamp: the switch reads on / off, so its label no longer
    overlaps in the new frontend.

v1.7.51 release (over v1.7.50):
  - Frame Grab Generate All Angles saves into its own folder,
    MULTIANGLE/<FIRST WORD OF VIDEO NAME>_GRAB (e.g. MARGO_GRAB).
    Single angles still go to MULTIANGLE/SINGLES.

v1.7.50 release (over v1.7.49):
  - Frame Grab New Angle / All Angles use QWEN_MULTIANGLE_TEMPLATE_v3
    (resize with center crop, VAEEncode from the resized image).  Create PM
    and Render PM are unchanged, for side-by-side testing.
  - QWEN Turntable LLM keeps only the first person described.

v1.7.49 release (over v1.7.48):
  - Frame Grab: Generate All Angles (17), orange, with the same warning
    popup as the PMs.  Generate Angle is now blue, like the PMs.
  - Image pickers (Render PM and Create PM): Sort dropdown, Newest first
    by default, then Oldest first, Name A to Z, Name Z to A.  Remembered.
  - SOUTHERN accent: light version, no vowel respelling.

v1.7.48 release (over v1.7.47):
  - Frame Grab New Angle saves to <project>/MULTIANGLE/SINGLES/, so the
    Render PM's Start Frame and Last Frame lists can see the results.

v1.7.47 release (over v1.7.46):
  - LLM Model Select needs no wires.  It writes the chosen model into every
    Prompt Generator's model field (Prompt Manager now rejects a wired model
    with "Model must be a string").  Old model wires are removed.

v1.7.46 release (over v1.7.45):
  - Save Result: result_type labels name the folder (FLUX (CREATE folder),
    QWEN (EDITS folder), CHARACTER (CHARACTERS folder)).  Old values still work.
  - Create Project: a name that already exists opens a popup with
    Switch to it / OK, in all three Project Managers.
  - Frame Grab: Save to project dropdown, Copy to clipboard, and New Angle
    (QWEN multi-angle from the parked frame, saved to MULTIANGLE).
  - Settings Stamp: "drop -audio from name" switch, on by default.
  - Refresh writes every personal copy in STUDIO5090 to the ComfyUI log.
  - Templates: Alan's accents (BRITISH, CHOPPERS, thick COCKNEY, SOUTHERN,
    BRONX), render styles, FLUX render style LLM, Director camera-word rule,
    Animation LLM right-hand / setting fix.
  - STUDIO5090_TIPS.md: personal copies, QWEN yellow-outline trick,
    LTXV Freeze Latent uses.

v1.7.11 release (over v1.7.10):
  - RENDER PM: added `video_path_2k` output string. Sibling to the
    existing `video_path` and `video_path_hd` outputs. Emits
    `STUDIO5090/<project>/VIDEOS/<scene>_2560x1536` so downstream
    Save Video nodes writing 2K masters land alongside the 1920 and
    base outputs with a resolution suffix that makes them
    distinguishable on disk even when scene names collide across
    renders. Added at index 6 of the return tuple, after the existing
    audio_output_path at index 5 — this preserves the port ordering of
    all pre-v1.7.11 wiring, so existing workflows require no changes
    to keep working.

  - RENDER PM: added `video_path_debug` output string. Points at
    `STUDIO5090/<project>/VIDEOS/DEBUG/<scene>` — a dedicated DEBUG
    subfolder inside the project's VIDEOS tree. Purpose: DEBUG-mode
    intermediate renders (typically 320×192 and 640×384 preview
    outputs from earlier pipeline phases) no longer pollute the base
    counter that names hero renders, avoiding the off-by-one and
    600-plus counter-skip issues that arose when DEBUG outputs shared
    a folder with the final render output. The user is expected to
    concatenate their own suffix (e.g. "_320_DEBUG" or "_640_DEBUG")
    downstream via a Concatenate Text node — this node emits only the
    scene stem, leaving the resolution/pass label as a workflow-level
    concern.

    Added at index 7 of the return tuple. Also added a matching
    `_videos_debug_path` helper alongside `_videos_hdr_path` in
    studio5090_utils.py; new projects created after this release
    will have the DEBUG folder pre-created for consistency in file
    browsers. Existing projects will have the folder auto-created by
    Save Video nodes on first DEBUG write, so no migration is
    required.

  - CREATE PM: Create Subject button re-styled with a gold fill
    (#866700) and lighter gold border (#a68520), replacing the prior
    green. Distinguishes it visually from the Create Project button
    directly below, which retains its green fill. Rationale: creating
    a subject is a lightweight in-project operation (adds a subject
    entry) while creating a project is a heavier operation that builds
    the whole folder tree. Different weight of action, different color
    signal.

  - CASTING PM: Create Subject button re-styled to match Create PM's
    gold treatment — same #866700 fill, same #a68520 border, same
    rationale. Consistent visual language across both places where
    "Create Subject" appears in the toolkit.

  - No sampler / scheduler / sigma changes in this release. All
    pipeline architecture work of the past week (denoised_output port
    swap, phase-2 bypass toggle for morphing shots, linear-spacing
    sigma family, HyperTile integration) remains a workflow-template
    concern rather than a Python/JS toolkit concern — those live in
    the RENDER_TEMPLATE.json and are the user's to configure per shot
    mode.

v1.7.10 release (over v1.7.9):
  - PERFORMANCE (RENDER PM): SF/FL frame picker now lazy-loads
    section contents on twirl-open. Prior versions walked every
    folder in the project (and, in v1.7.9 cross-project mode, in
    another project) up-front before opening the picker,
    producing a delay proportional to how many files lived under
    MULTIANGLE. Now the picker opens with only a lightweight
    folder-manifest fetch (folder names + per-folder counts —
    directory listings only, no per-file work) and each section's
    contents are fetched the first time the user twirls that
    section open. Contents are cached per-picker-session so
    subsequent twirls of the same section are instant.

    * Picker open cost: constant regardless of project size.
    * Per-section open cost: proportional to that one section's
      file count only.
    * Cross-project browsing benefits identically — switching to
      a project with a large MULTIANGLE tree no longer stalls
      the picker; only sections the user actually opens pay
      their walk cost.
    * Expand All triggers all remaining not-yet-loaded sections
      concurrently and awaits them, showing "Loading" state on
      the button while it works.

    New backend endpoints supporting lazy load:
      /studio5090/frame_folders?project=X
        -> { folders: [...], counts: { folder: n } }
      /studio5090/frame_folder_contents?project=X&folder=Y
        -> { images: [...] }

    The existing /studio5090/all_frame_images endpoint remains in
    place for backward compatibility with any external callers,
    but the Render PM SF/FL picker no longer uses it. Other
    pickers (Render PM multiangle-source, Create PM multiangle-
    source) continue to use their pre-v1.7.10 eager-load path
    unchanged.

    showThumbPicker() got a 7th optional argument, lazyLoadContext.
    When present, the 1st arg is interpreted as a folder manifest
    and per-section content is fetched via lazyLoadContext.fetchFolder.
    When absent, the 1st arg is the pre-fetched image array and the
    picker behaves exactly as it did in v1.7.9 — full backward
    compatibility for all other pickers.

v1.7.9 release (over v1.7.8):
  - FEATURE (RENDER PM): SF/FL frame picker can now browse images
    from any project, not just the workflow's own. New "Select
    Project" button appears in the picker header showing the
    project currently being viewed. Click it to switch to a
    different project's images. The workflow's own project is
    unchanged — cross-project browsing is a picker-view context
    only. When an image from another project is picked, the
    reference persists into first_frame / last_frame with a
    cross-project tag prefix that survives Save Workflow / Open
    Workflow, so reloaded workflows continue to resolve to the
    correct source project without manual re-picking.

    Tag format for cross-project references:
      [@OTHER_PROJECT|CREATE] scene.png
      [@OTHER_PROJECT|EDITS] tweaked.png
      [@OTHER_PROJECT|CHARACTERS] sheet.png
      [@OTHER_PROJECT|MULTIANGLE:SubjectName] frame_0001.png
      [@OTHER_PROJECT|MULTIANGLE:SINGLES] frame_MA_back-left.png

    Same-project selections continue to use the existing tag
    format ([CREATE] scene.png etc.) with no @PREFIX. Fully
    backward compatible — all pre-v1.7.9 saved workflows resolve
    identically to before, no migration needed.

    Picker UX behaviors:
      * Every fresh picker open resets the browsing context to the
        workflow project (not sticky — sticky was a mild trap that
        led to "why don't I see my current-project images"
        confusion after a project switch).
      * When browsing a non-workflow project, the Select Project
        button switches from teal to orange with a yellow border,
        and the picker title suffix reads "BROWSING: <project>".
        Visual signal that the picker context is off-home.
      * The project chooser modal is a secondary overlay above the
        thumbnail picker. Current picker project is highlighted
        teal. Workflow-home project is tagged "workflow" so the
        user always knows where "home" is and can click back to it.

    Backend change: resolve_image() in the Render Project Manager
    node parses the optional @PROJECT_NAME| prefix from tagged
    filenames. When present, path resolution uses the referenced
    project instead of the workflow's project. When absent,
    behavior unchanged. Thumbnail endpoint required no changes —
    it already takes project as a query param; the JS thumbnail
    URL builder now derives the project from the tag.

  - Applies to Render PM only in this release. Create PM's
    multiangle-source picker keeps its single-project behavior for
    now (its normal workflow is source-from-current-project going
    into current-project MULTIANGLE output). Easy to extend if
    needed — same pattern applies. Casting PM does not have this
    picker.

  - The v1.7.8 SF/FL picker-open latency (perceptible delay when
    projects have large MULTIANGLE trees) is still open. The lazy-
    load-per-section design discussed earlier remains on the shelf
    as a candidate v1.8.0 change.

v1.7.8 release (over v1.7.7):
  - BUG FIX (RENDER PM + CREATE PM): the SF/FL frame picker did not
    show images from MULTIANGLE/SINGLES/ when the project had no
    other named subjects yet. Generating a single-angle multiangle
    from a CREATE/EDITS/CHARACTERS source lands the output in
    MULTIANGLE/SINGLES/, and if that was the only multiangle content
    in the project, the entire MULTIANGLE tree was invisible in the
    picker. Refresh did not help because the refresh path ran the
    same broken loop.
    Root cause: the picker JS iterated over the /studio5090/subjects
    endpoint's return list, calling /studio5090/all_frame_images once
    per subject. But `subjects` deliberately excludes reserved system
    folder names (SINGLES is reserved). So when SINGLES was the only
    thing on disk, the loop iterated zero times and MULTIANGLE never
    got walked.
    Fix: single call to /studio5090/all_frame_images with an empty
    subject param. The backend already walks CREATE, EDITS,
    CHARACTERS, and every subfolder under MULTIANGLE — including
    SINGLES — regardless of what subject is passed. The `subject`
    query param on that endpoint is legacy and does not filter the
    walk. Same fix applied to both Render PM (loadFrameImages) and
    Create PM (openSrcPicker). Also removes N-1 redundant round
    trips in projects with multiple subjects (prior code fetched
    the identical complete list once per subject and deduped).

v1.7.7 release (over v1.7.6):
  - LICENSE: MIT license file added at the repository root, with
    Alan Rosenfeld as copyright holder.  Standard MIT text with
    the "AS IS, without warranty" boilerplate preserved verbatim.
  - SPDX license headers injected at the top of every Python and
    JavaScript source file, pointing at LICENSE. Idempotent — the
    injector skips files already tagged.
  - THIRD_PARTY_LICENSES.md added: pointer list to upstream
    licenses for the custom-node packs, model weights, and LoRAs
    Studio5090 depends on but does not redistribute. Clarifies
    that the MIT license on Studio5090 covers only the code Alan
    wrote — not the models or third-party packs.
  - FOLDER NAMING CHANGE: the inner package folder is now named
    ComfyUI-Studio5090-Utils (matching the ComfyUI-XXX ecosystem
    convention that most custom nodes follow) instead of
    studio5090_utils. All Python imports inside the package are
    relative and reference the module file name (studio5090_utils.py),
    not the folder name, so the rename does not affect any code —
    verified with a full source scan. Alan had been renaming the
    folder manually before shipping; this bakes his convention in.
  - RENDER TEMPLATE: the embedded MODELS MANIFEST MarkdownNote
    inside the workflow has been updated to include the LTX 2.5
    files that were missing in the v1.7.6 manifest:
      * diffusion_models: ltx-2.5-22b-distilled-transformer-bf16
      * vae: ltx-2.5-audio-vae-bf16, ltx-2.5-video-vae-bf16
      * upscale_models: ltx-2.5-latent-spatial-upscaler-x2-bf16-1.0
        (LTX 2.5 provides 2x only, no 1.5x)
      * text_encoders: gemma4-12b-with-proj-ltx-2.5-bf16
  - REQUIREMENTS.md updated to mirror the corrected manifest
    (new Section 4.1a "LTX 2.5 core (optional)"), and updated
    to reflect the new folder name in the install path. Added
    Section 9 "License" pointing at LICENSE and
    THIRD_PARTY_LICENSES.md.
  - No JavaScript or Python code logic changed in this release.
    All prior fixes remain in place.

v1.7.6 release (over v1.7.5):
  - IRISH ACCENT: prepended a VOICE-TEXTURE REFERENCE block to the
    IRISH accent body. When a female Irish character was specified,
    the downstream Casting Director tended to reach for male-coded
    texture words (raspy, gritty, weathered, chronic-smoking-and-
    cocaine narrative arc) that overrode the single "female" tag at
    the top of the character sheet. The reference block gives the
    downstream a labeled swap table (raspy -> husky warmth, gritty ->
    smoky-sultry, etc.) and a set of named female Irish voice
    references to anchor against. Effect depends on whether the
    downstream reads the accent body during character generation
    (as opposed to only during dialogue rewrite) — if it does, the
    fix engages; if not, no harm done, because the block sits above
    the "You are a deterministic linguistic translation tool..." tool
    prompt which brackets the LLM's actual dialogue-rewrite job.
  - Ships with REQUIREMENTS.md at the repo root — auto-generated
    from parsing the three shipped template workflows, cross-
    referenced against the custom-node lists Alan provided. Covers
    ComfyUI base, custom-node packs (baseline + Casting-specific +
    Create-specific), all models with download links (mirrored from
    the MODELS MANIFEST embedded in the RENDER workflow), face
    restore + upscaler for CREATE, and the STUDIO5090/ seed
    project folder.
  - No JavaScript or Python code changed in this release. All prior
    fixes (Open Workflow visibility, 0_NONE passthrough, cache
    busting, empty-project rendering) remain in place.

v1.7.5 release (over v1.7.4):
  - CASTING PM ACCENT PICKER: 0_NONE body rewritten again to
    forbid JSON-object output. v1.7.4 fixed the content
    (dialogue preserved verbatim including profanity) but the
    downstream LLM was wrapping the correct passthrough output
    in curly braces, producing {"text..."} shapes instead of
    "text...". Root cause: LLMs default to structured/JSON-biased
    output when the task looks short and structural (passthrough
    is unusually low-effort work). Other accents avoid this
    because they involve enough transformation to keep the LLM
    in text mode. Fix: explicit "no braces, no JSON, no key-value
    pairs, no square brackets, no angle brackets, no field labels"
    rules in the body, plus a worked WRONG/CORRECT example block
    showing exactly which output shapes are forbidden.
  - CASTING PM ACCENT PICKER: 1_GENERIC entry REMOVED entirely.
    v1.7.4 preserved dialogue in most cases but downstream LLMs
    consistently softened profanity ("Fuck that" -> "I don't
    think so") regardless of anti-cleanup instructions in the
    body. The behavior is a safety-tuning artifact of the model
    doing the rewrite step, not something the accent body can
    reliably override. Removing rather than shipping broken.
    Practical alternative: use 0_NONE for verbatim dialogue and
    let the downstream TTS layer handle voice neutrality.

v1.7.4 release (over v1.7.3):
  - CASTING PM ACCENT PICKER: 0_NONE and 1_GENERIC accent bodies
    completely rewritten. The v1.7.3 versions used an opening
    pattern ("You are a passthrough tool" / "You are a linguistic
    normalization tool") that did not match the working pattern
    the other accents use ("You are a deterministic linguistic
    translation tool. Your only job is to rewrite standard text
    into a [DIALECT] English dialect..."). Downstream Casting
    Director LLM wrappers ignored the off-pattern bodies and fell
    back to their default character-block generation behavior,
    producing character/attitude/Phonetics/vibe output for 0_NONE
    with an unsubstituted {YOUR_TEXT_HERE} placeholder at the
    bottom, and softening/censoring dialogue for 1_GENERIC.
    * 0_NONE now framed as the "IDENTITY dialect" — a passthrough
      transformation that must produce character-for-character
      output identical to the input, with explicit anti-censoring,
      anti-cleanup, and anti-embellishment rules.
    * 1_GENERIC now framed as the "NEUTRAL dialect" — strips
      regional markers ONLY, preserves profanity, informality,
      interjections, ellipses, self-identification tags, and
      punctuation exactly as written. The word "clean" was
      deliberately removed from the body (it triggers LLM
      cleanup instincts including profanity softening).
    * Both bodies include a worked example using dialogue that
      round-trips verbatim (input === output), teaching the LLM
      the intended behavior by demonstration.

v1.7.3 release (over v1.7.2):
  - ALL PROJECT MANAGERS (Render, Create, Casting): Open Workflow
    picker now shows ALL projects, not just projects that already have
    saved workflows. Previously the backend filtered out any project
    whose workflows/ folder was empty (or nonexistent), and the JS
    picker also silently skipped sections with zero files. Combined
    effect: newly-created projects, and projects that pre-date the
    v1.6.0 workflows/ retrofit, were invisible in the picker even
    though they exist on disk.
    * Backend /studio5090/list_workflows now returns every project
      key with an empty file array when no workflows exist.
    * Picker JS renders empty sections with a muted "empty" pill and
      a helpful "no saved workflows yet" placeholder body.
    * Picker fetch now cache-busts via a timestamp query param so
      newly-saved workflows and newly-created projects show up on
      the next Open press without requiring a browser hard-refresh.
  - CASTING PM ACCENT PICKER: two new pinned-top entries.
    * 0_NONE: verbatim passthrough. LLM returns the input text
      unchanged, wrapped in quotes. Use for dialogue that should NOT
      be styled with any accent.
    * 1_GENERIC: neutral speaking voice. No regional slang, no
      dialect markers, no phonetic tricks. Reads naturally when
      spoken by any voice (male, female, child, elderly). Use for
      characters whose voice should carry no regional or class
      signal.
    Naming uses a numeric prefix so the default alphabetical sort
    pins them to the top of the picker without special-case code.
    Additional pinned-top entries can be added with any 0_ / 1_ /
    2_ prefix pattern.
  - KNOWN GAP (not fixed in this release): the shipped
    templates/product_workflows/ folder contains only a README,
    no actual CREATE/RENDER/CASTING template JSONs. New projects
    therefore still start with empty workflows/ folders; the
    workflow-list bug fix above just makes those empty projects
    visible in the picker. Seeding real templates requires
    exporting known-good ComfyUI graphs by hand and dropping them
    into templates/product_workflows/ as CREATE_TEMPLATE.json,
    RENDER_TEMPLATE.json, CASTING_TEMPLATE.json.  See
    README_v1_7_3.md for the one-time procedure.

v1.7.2 release (over v1.7.1):
  - RENDER PM + CREATE PM: "Generate Single Angle" button fill changed
    from dark navy (#0f2540) to bright saturated blue (#2563eb) with
    white text. The v1.7.1 dark-navy fill read as visually identical
    to the dark-teal panel background (#0f2a28), making the button
    disappear against the panel. Bright blue-600 pops against the
    panel while remaining the complementary opposite of the orange
    Generate All Angles button above.
  - CASTING PM: accent picker modal simplified — the body-preview
    column beside each accent name has been removed. Names only.
    List is now alphabetically sorted at render time regardless of
    the source file's own ordering, so the picker stays clean even
    if a user-side STUDIO5090/accents.txt override was authored
    unsorted.
  - NOTE ON TEXAN: v1.7.1 already removed TEXAN from the shipped
    templates/accents.txt. If TEXAN is still visible in your picker,
    it is coming from a user-side override at STUDIO5090/accents.txt
    (that file takes precedence over the shipped default). Delete or
    edit that override to remove it. See README_v1_7_2.md for
    instructions.

v1.7.1 release (over v1.7.0):
  - CASTING PM: three new output ports for downstream save/write nodes:
      * turntable_video_path -> STUDIO5090/<project>/VIDEOS/<subject>_TURNTABLE
      * audition_video_path  -> STUDIO5090/<project>/VIDEOS/<subject>_AUDITION
      * character_path       -> STUDIO5090/<project>/CHARACTERS/<subject>
    Total output count: 5 -> 8. Backward-compatible; existing wiring to
    the original five outputs (project, subject, audio_output_path,
    accent_trigger, accent_body) remains unchanged.
  - RENDER PM: image pickers (Source Image, First Frame, Last Frame) now
    always refresh the directory listing before opening the picker
    modal. Eliminates the need to manually press the Refresh button
    when new images have been added to project folders since the last
    picker open.
  - RENDER PM + CREATE PM: image picker grid sort changed from
    alphabetical ascending to filename descending. ComfyUI's
    auto-increment counter convention (IMAGE_00003_.png) means newest
    files sort first, matching the working artist's mental model of
    "most recent work at the top."
  - RENDER PM: Scene Name text input field now drawn with a yellow-orange
    border (#f59e0b) at 2px stroke width. Visually flags the field as
    the primary user-editable output-naming input.
  - RENDER PM + CREATE PM: "Generate Single Angle" button changed from
    orange to blue to differentiate from the orange "Generate All
    Angles (17)" button above it. Blue is the complementary opposite
    of orange in cinematography color theory, producing high visual
    contrast. Prevents users from pressing the wrong button by
    accident. Orange = big commit action; blue = iterative test action.
  - ACCENT FILE: TEXAN accent removed (empirically did not produce
    a distinguishable Texan delivery in Casting testing). Remaining
    18 accents alphabetized for easier scanning in the dropdown.

v1.7.0 release (over v1.6.1):
  - CASTING NODE: new Studio5090CastingProjectManager for the audio
    production pipeline. Project + subject bookkeeping, accent selection,
    audio output path computation. Outputs: project, subject,
    audio_output_path, accent_trigger, accent_body. Five outputs feed
    downstream into the prompt-manager accent LLM + Save Audio (FLAC)
    nodes. Separate node, separate JS widget file.
  - ACCENT FILE: shipped at templates/accents.txt with 19 accents (14
    original + 5 new: IRISH, AUSTRALIAN, TEXAN, INDIAN, NEWS ANCHOR).
    User-extensible via optional STUDIO5090/accents.txt override; the
    user file takes precedence over the shipped default if present.
    (Note: TEXAN was removed in v1.7.1; current shipped count is 18.)
  - RENDER PM: new audio_output_path STRING output emitting
    STUDIO5090/<project>/AUDIO/<scene_name>. Same convention as the
    existing video_path/video_path_hd outputs (no extension; the Save
    Audio (FLAC) node appends .flac).
  - NEW UTILITY NODE: Studio5090Upscale2xSteps. Pure boolean emitter
    in the Studio5090/Utilities category. Labels "3-steps" (ON/true)
    and "8-steps" (OFF/false). Lets the user flip between two manual
    sigma schedules during 2x upscale testing without rewiring the
    canvas. Mirrors the existing AudioPadSwitch pattern.

v1.6.1 hotfix (over v1.6.0):
  - DESKTOP APP COMPATIBILITY: window.prompt() and window.confirm() are
    disabled in the ComfyUI native desktop (Electron) app for security
    reasons, so every text-input and confirmation dialog in the toolkit
    was silently broken there (Create Project, Create Subject, prompt
    modifier entry, scene name entry, save workflow, etc.). Replaced
    with custom DOM-based showTextPrompt() and showConfirm() helpers
    styled to match the toolkit's teal-on-dark aesthetic. Works
    identically in browser and desktop app.
  - ROOT FOLDER AUTO-CREATE: ComfyUI's output/STUDIO5090/ folder is
    now created automatically at toolkit load if it doesn't exist.
    First-time users no longer see an empty PM that looks broken.
  - NO MORE RETROFIT TEMPLATE COPY: v1.6.0 auto-copied product workflow
    templates into every existing project's empty workflows/ folder at
    toolkit load. This turned out to be invasive when users dropped
    new templates in. Template auto-copy now only happens at
    create_project time. Existing projects can load templates via the
    Open Workflow picker's TEMPLATES section anytime.
  - WORKFLOW PICKER UX: sections default to collapsed (consistent with
    the image picker since v1.5.5). Added an "Expand All / Collapse All"
    toggle in the picker's header.
  - NO REPLACE-GRAPH WARNING: removed the v1.6.0 confirmation dialog
    that fired before loading a workflow. ComfyUI's loadGraphData opens
    workflows in a new tab rather than replacing the current graph, so
    the warning was inaccurate and just added friction.

v1.6.0 release (over v1.5.8):
  - WORKFLOWS section added to both Render PM and Create PM, above
    SELECT PROJECT. Two buttons: 💾 Save Workflow… and 📂 Open
    Workflow…
  - Workflows are saved per-project to STUDIO5090/<project>/workflows/
    with auto-incrementing version suffixes (<base>_v1.json,
    <base>_v2.json, …). Re-saving a workflow loaded as _v3 correctly
    produces _v4 — the version-strip-and-bump logic handles it.
  - Save dialog defaults to the current project but accepts any
    project as destination.
  - Open dialog presents a picker modal with TEMPLATES at the top
    followed by one collapsible section per project. Click a workflow
    to load; the current graph is replaced after a confirmation.
  - Product workflow templates ship inside the toolkit at
    templates/product_workflows/. When a new project is created,
    each template is auto-copied into the project's workflows/
    folder as <project>_<TYPE>_v1.json. Existing projects with empty
    workflows/ folders also get the templates copied at startup.
  - v1.6.0 ships with CREATE_TEMPLATE.json and RENDER_TEMPLATE.json
    once provided. CASTING_TEMPLATE.json will be added in v1.7.0
    alongside the CASTING node.

v1.5.8 hotfix (over v1.5.7):
  - LAYOUT FIX: the new angle dropdown and Generate Single Angle button
    added in v1.5.7 were rendering on top of the FRAME MODE SELECTION
    header (Render PM) and extending past the panel border (Create PM).
    The cause was the multianglePanel HEIGHTS constant not accounting
    for the two new rows; the next section's position was computed
    from the old panel height. Both PMs now reserve correct vertical
    space for the new controls.

v1.5.7 hotfix (over v1.5.6):
  - LAZY SUBJECT FOLDERS: subject folders are no longer pre-created on
    "+ New Subject" or when queuing a multiangle batch. Folders only
    appear on disk when ComfyUI's Save Image node writes a file into
    them. If the user creates a subject and never generates anything,
    no empty folder is left behind. Pending subject names are tracked
    in memory so the dropdown still shows them during the session.
  - EMPTY FOLDER CLEANUP: a one-time pass at toolkit load scans every
    project's MULTIANGLE/ directory and removes any subject folder
    that contains no image files (at any depth). Logs what was
    removed. SINGLES is treated as a system folder and never removed.
  - GENERATE SINGLE: both Create PM and Render PM now have an angle
    dropdown and a "Generate Single Angle" button that renders just
    one of the 17 Qwen multiangle angles for a chosen source image.
    Output naming (option 2):
      - Source from MULTIANGLE/<subject>/ → MULTIANGLE/<subject>/
        <stem>_oneoff_<angle> — lives next to its multiangle family
      - Else (CREATE/EDITS/CHARACTERS)    → MULTIANGLE/SINGLES/
        <stem>_<angle> — one-off orphans live in a shared bin
    The existing "Generate All Angles (17)" button is unchanged and
    keeps its confirmation dialog.

v1.5.6 hotfix (over v1.5.5):
  - BUG FIX: floating filename label could remain stuck on screen after
    closing the picker by clicking a thumbnail. The cleanup wrapper added
    in v1.5.4 only fired on the Close button and overlay click; the
    thumbnail click path called the original cleanup directly, bypassing
    label removal. Cleanup now removes the floating label as part of its
    core behavior, so every close path clears it. Affects both Render PM
    and Create PM.

v1.5.5 hotfix (over v1.5.4):
  - Image picker sections now open collapsed by default each time the
    picker is invoked. Click a section header to reveal its thumbnails.
  - A new "Expand All / Collapse All" toggle button sits to the left of
    the Close button in the picker header. It inspects the current
    section states on each click: if any section is collapsed, expand
    them all; otherwise collapse them all. Manual per-section toggles
    do not desync the master button.
  - Both Render PM and Create PM share these changes.

v1.5.4 hotfix (over v1.5.3):
  - Image picker grid is now organized into collapsible sections by source
    folder (CREATE / EDITS / CHARACTERS / MULTIANGLE:<subject>). Each
    section has a prominent header showing the folder name, image count,
    and an expand/collapse arrow. Click the header to hide/show that
    section's thumbnails. Empty sections are hidden entirely. Subject
    folders are alphabetized within the multiangle group.
  - Hovering any thumbnail now displays a floating label with the full,
    untruncated filename. Snappy (no browser tooltip delay), follows the
    cursor, and clears automatically when the picker closes.
  - Both the Render PM and Create PM widgets carry these changes.

v1.5.3 hotfix (over v1.5.2):
  - HDR Render Queue Pause and Cancel buttons now show persistent status
    messages explaining what's happening: Pause says "HDR paused as soon
    as the current job finishes. Press Run Queue to begin again."; Cancel
    says "HDR queue process will cancel after the current job finishes.
    To kill a job, use the ComfyUI active queue to kill the process."
    These messages used to get clobbered ~1.5s later by the poll loop's
    "Running: poll N" updates.
  - VHS cleanup now runs BEFORE the queue enters its paused/cancelled
    state, not deferred until the user presses Run Queue again. The
    inner poll loop continues running after pause/cancel until the
    current job actually finishes, so job_complete (and its cleanup)
    runs at the natural moment.
  - Cancel button behavior simplified: no longer pushes the running job
    back to pending mid-flight (which was duplicating work — ComfyUI
    kept running it while we'd treat it as pending and resubmit). Now
    Cancel = "stop after current job finishes" with pending intact.
    The old stale-state recovery still triggers when Cancel is clicked
    while the loop is NOT running but a stale server-side running
    marker exists (post-restart recovery).

v1.5.2 hotfix (over v1.5.1):
  - HDR Render Queue output now goes to VIDEOS/HDR/<scene>_HDR.mov instead
    of VIDEOS/<scene>_HDR.mov — keeps HDR masters clustered separately from
    SDR LTX renders. New VIDEOS/HDR/ subfolder added to project structure
    and retrofitted onto existing projects.
  - Scene-name handling strips trailing underscores so source files named
    like "SCENE1_00010_.mp4" produce "SCENE1_00010_HDR_00001.mov" instead
    of double-underscored "SCENE1_00010__HDR_00001.mov".
  - HDR cleanup now also removes the companion workflow PNG that
    VHS_VideoCombine writes alongside each video — these renders are
    API-driven, no value in preserving inline workflow JSON.
  - Auto-clear completed jobs list when the queue naturally drains
    (pending empty, running just finished). Fixes stale "1/3" progress
    bar carrying over from previous sessions.
  - New manual "Clear Queue" button — secondary grey, appears in the
    QUEUE section whenever there's pending or completed content. Wipes
    both lists; preserves any running job (cancel that separately).

v1.5.1 hotfix (over v1.5.0):
  - HDR Render Queue stages source videos into ComfyUI input/ before
    submission so the core LoadVideo's validation passes. (Was failing with
    "Invalid video file" because LoadVideo only sees input/, not output/.)
  - Render PM frame pickers (FF / LF) and source-image picker now include
    CHARACTERS/ alongside CREATE / EDITS / MULTIANGLE. Color-coded amber.
  - Studio5090 Steps dropdown order corrected to ascending 8 / 20 / 50
    (source had 20 / 8 / 50; previous "hot patch" never made the source
    tree). Default still 20.

Nodes:
  Studio5090AudioPadSwitch       — Normal (True) / Padded (False)
  Studio5090AudioSelect          — Audio File (True) / Prompt Audio (False)
  Studio5090LatentMode           — Empty Latent (True) / Image Input (False)
  Studio5090LatentResolution     — 1536x864 (True) / 768x432 (False)
  Studio5090StillVideoSwitch     — Still Image (True) / Video Grab (False)
  Studio5090Steps                — 8 / 20 / 50 step count switch (INT output)
  Studio5090RenderProjectManager — Project mgmt + Qwen Multi Angle + frame selection
                                    (v1.5.1: CHARACTERS in frame pickers)
  Studio5090CreateProjectManager — Slim PM for Create/Invent/Edit tab
  Studio5090SaveResult           — Save Flux/Qwen/Character output, right-click to run per island
                                    (v1.4.5: embeds workflow metadata in PNG so saved
                                    images can be dragged back into ComfyUI to restore
                                    the originating workflow — matches native SaveImage)
  Studio5090HDRRenderQueue       — Queue LTX HDR renders across a project's VIDEOS/, with
                                    crash recovery, per-job ProRes/EXR toggles, smart-match
                                    model resolution, and VHS audio-twin cleanup
                                    (v1.5.1: input/ staging; v1.5.2: VIDEOS/HDR/ output
                                    folder, companion PNG removal, auto-clear-on-empty,
                                    manual Clear Queue button)
"""

import os
import json
import logging
import re
import numpy as np
from PIL import Image
import torch
import folder_paths

STUDIO5090_ROOT = "STUDIO5090"

# 17 Qwen Multi Angle prompts + matching filename suffixes
QWEN_ANGLES = [
    ("obtain the back-left view",                    "MA_back-left"),
    ("obtain the three-quarter rear view",           "MA_three-quarter_rear"),
    ("obtain the left-side view",                    "MA_left-side"),
    ("obtain the right-side view",                   "MA_right-side"),
    ("reveal the back side by rotating the camera",  "MA_reveal_back_side_rotate_camera"),
    ("obtain the front view",                        "MA_front"),
    ("switch to a front-facing view",                "MA_switch_front-facing"),
    ("obtain the top-down view",                     "MA_top-down"),
    ("obtain the bird's eye view",                   "MA_birds_eye"),
    ("obtain the low-angle view",                    "MA_low-angle"),
    ("show the subject from a low angle",            "MA_show_subject_low_angle"),
    ("obtain the three-quarter view",                "MA_three-quarter"),
    ("Rotate the object 180 degrees to show the back", "MA_rotate_object_180_show_back"),
    ("Rotate the viewport clockwise 45 degrees",     "MA_rotate_viewport_clockwise_45"),
    ("show the back side of the subject",            "MA_show_back_side_subject"),
    ("cut to a close-up",                            "MA_cut_to_a_close-up"),
    ("obtain a close-up view",                       "MA_close-up_view"),
]

# ---------------------------------------------------------------------------
# Path helpers
# ---------------------------------------------------------------------------

def _studio_root():
    return os.path.join(folder_paths.output_directory, STUDIO5090_ROOT)

def _project_path(project):
    return os.path.join(_studio_root(), project)

def _create_path(project):
    return os.path.join(_project_path(project), "CREATE")

def _edits_path(project):
    return os.path.join(_project_path(project), "EDITS")

def _multiangle_root(project):
    return os.path.join(_project_path(project), "MULTIANGLE")

def _subject_path(project, subject):
    return os.path.join(_multiangle_root(project), subject)

def _videos_path(project):
    return os.path.join(_project_path(project), "VIDEOS")

def _videos_hdr_path(project):
    """VIDEOS/HDR/ subfolder for graded HDR masters (added v1.5.2)."""
    return os.path.join(_videos_path(project), "HDR")

def _videos_debug_path(project):
    """VIDEOS/DEBUG/ subfolder for intermediate pass previews (added v1.7.11).
    Save Video nodes will typically create this automatically on first write,
    but pre-creating it here keeps it consistently discoverable in file
    browsers even before the first debug render lands."""
    return os.path.join(_videos_path(project), "DEBUG")

def _movies_path(project):
    return os.path.join(_project_path(project), "MOVIES")

def _audio_path(project):
    return os.path.join(_project_path(project), "AUDIO")

def _music_path(project):
    return os.path.join(_project_path(project), "MUSIC")

def _characters_path(project):
    return os.path.join(_project_path(project), "CHARACTERS")


def _grab_path(project):
    """v1.7.54: Frame Grab Snapshot folder, <project>/GRAB."""
    return os.path.join(_project_path(project), "GRAB")


def _picker_image(folder, fname):
    """v1.7.54: True when fname belongs in an image picker.  GRAB hides the
    _BURN copies, which have text printed on the picture."""
    if not fname.lower().endswith((".png", ".jpg", ".jpeg", ".webp")):
        return False
    if folder == "GRAB" and os.path.splitext(fname)[0].upper().endswith("_BURN"):
        return False
    return True

def _exr_path(project):
    """EXR/ folder for HDR EXR sequences (added v1.5.0)."""
    return os.path.join(_project_path(project), "EXR")

def _workflows_path(project):
    """v1.6.0: per-project workflows folder. Holds ComfyUI graph JSONs
    saved from within the toolkit and templates auto-copied at project
    creation time."""
    return os.path.join(_project_path(project), "workflows")

def _product_templates_dir():
    """v1.6.0: location of the product workflow templates that ship inside
    the installed toolkit. These are the canonical CREATE/RENDER/CASTING
    starting workflows — read-only from the user's perspective. At project
    creation time, each template is copied (and renamed with the project
    prefix) into the project's workflows/ folder.

    Lives next to this Python file, at templates/product_workflows/.
    """
    return os.path.join(os.path.dirname(os.path.abspath(__file__)),
                        "templates", "product_workflows")


def _list_product_templates():
    """v1.6.0: list of template files shipped in templates/product_workflows/.
    Returns a list of bare filenames (no path). Sorted. Empty list if the
    directory is missing (defensive — the templates ship in the zip)."""
    d = _product_templates_dir()
    if not os.path.isdir(d):
        return []
    return sorted([f for f in os.listdir(d) if f.lower().endswith(".json")])


# ---------------------------------------------------------------------------
# v1.7.0: Accent file (for CASTING node)
# ---------------------------------------------------------------------------
# The shipped accent file lives inside the toolkit at templates/accents.txt
# (read-only product asset). A user-extensible copy lives at
# STUDIO5090/accents.txt — if that file exists, it takes precedence over
# the shipped default. This lets users add their own accents without
# their work being overwritten when they install a new toolkit version.
#
# Format: blocks separated by lines that start with `=== NAME ===`. The
# block body is everything between one delimiter and the next (or EOF).
# The body text is what gets piped into prompt-manager as the LLM prompt.

def _shipped_accents_path():
    """Path to the shipped accents.txt inside the toolkit zip."""
    return os.path.join(os.path.dirname(os.path.abspath(__file__)),
                        "templates", "accents.txt")


def _user_accents_path():
    """Path to the user's overridable accents.txt at STUDIO5090/accents.txt."""
    return os.path.join(_studio_root(), "accents.txt")


def _effective_accents_path():
    """Return the active accents file path. User copy if it exists, else
    the shipped default. None if neither is available (defensive)."""
    user = _user_accents_path()
    if os.path.isfile(user):
        return user
    shipped = _shipped_accents_path()
    if os.path.isfile(shipped):
        return shipped
    return None


def _parse_accents_file(path):
    """Parse a `=== NAME ===` delimited accent file. Returns a list of
    dicts: [{"name": str, "body": str}, ...] in file order. Body text is
    everything between the `=== NAME ===` line and the next delimiter
    (or EOF), with surrounding whitespace stripped. Empty accents (no
    body text) are still returned so the dropdown can show them; the
    user will get empty LLM output if they pick one, which is the right
    feedback that something is wrong.
    """
    if not path or not os.path.isfile(path):
        return []
    try:
        with open(path, "r", encoding="utf-8", errors="replace") as f:
            text = f.read()
    except Exception:
        return []

    # Match a `=== NAME ===` header line. The name is the text between
    # the delimiters, stripped. Body is everything until the next header
    # or EOF.
    pattern = re.compile(r"^[ \t]*===[ \t]*(.+?)[ \t]*===[ \t]*$",
                         re.MULTILINE)

    accents = []
    matches = list(pattern.finditer(text))
    for i, m in enumerate(matches):
        name = m.group(1).strip()
        body_start = m.end()
        body_end   = matches[i + 1].start() if i + 1 < len(matches) else len(text)
        body = text[body_start:body_end].strip()
        accents.append({"name": name, "body": body})
    return accents


def _list_accents():
    """Public list-of-accent-names helper for the CASTING node dropdown."""
    return [a["name"] for a in _parse_accents_file(_effective_accents_path())]


def _get_accent_body(name):
    """Return the body text for an accent by name, or empty string if
    the accent is not found."""
    if not name:
        return ""
    for a in _parse_accents_file(_effective_accents_path()):
        if a["name"] == name:
            return a["body"]
    return ""


# v1.5.7: pending-subjects tracking. When a user creates a subject via the
# "+ New Subject" button, we no longer create the folder on disk. Instead
# we record the resolved name here, so the subject dropdown still shows it
# while the user works with it. The folder will be created by ComfyUI's
# Save Image node the first time a file lands. If the user never generates
# anything before closing ComfyUI, the pending name dies with the process
# — which is the correct behavior (no empty folder cruft on disk).
#
# Keyed by project name; value is a set of pending subject names.
_PENDING_SUBJECTS = {}

# v1.5.7: SINGLES is a special MULTIANGLE/ subfolder for one-off single-angle
# generations from CREATE/EDITS/CHARACTERS sources. It is a *system* folder,
# not a subject, and should never appear in the subject dropdown.
_SUBJECT_RESERVED_NAMES = frozenset({"SINGLES"})


def _has_any_images(dir_path):
    """True if the directory contains at least one image file (any depth=1)."""
    if not os.path.isdir(dir_path):
        return False
    for f in os.listdir(dir_path):
        if f.lower().endswith((".png", ".jpg", ".jpeg", ".webp")):
            return True
    return False


def _cleanup_empty_subject_folders():
    """v1.5.7: one-time startup pass over all projects' MULTIANGLE folders.
    Removes any subject folder that contains no image files at any depth.
    Logs what was removed. Safe to run repeatedly — only removes truly
    empty folders.

    Does NOT remove the SINGLES system folder regardless of contents. Does
    NOT remove folders with subfolders that contain images (preserves the
    SINGLES-inside-subject case from option 2 naming).
    """
    import shutil
    root = _studio_root()
    if not os.path.isdir(root):
        return
    removed = []
    for project in os.listdir(root):
        ma = os.path.join(root, project, "MULTIANGLE")
        if not os.path.isdir(ma):
            continue
        for entry in os.listdir(ma):
            if entry in _SUBJECT_RESERVED_NAMES:
                continue
            full = os.path.join(ma, entry)
            if not os.path.isdir(full):
                continue
            # Walk the entire subject folder. If any image file exists at
            # any depth, keep the folder. Otherwise remove it.
            has_images = False
            for _dirpath, _dirnames, filenames in os.walk(full):
                if any(f.lower().endswith((".png", ".jpg", ".jpeg", ".webp"))
                       for f in filenames):
                    has_images = True
                    break
            if not has_images:
                try:
                    shutil.rmtree(full)
                    removed.append(f"{project}/{entry}")
                except Exception as e:
                    print(f"[Studio5090] Could not remove empty subject "
                          f"{project}/{entry}: {e}")
    if removed:
        print(f"[Studio5090] v1.5.7 cleanup removed {len(removed)} empty "
              f"subject folder(s): {', '.join(removed)}")


def _list_projects():
    root = _studio_root()
    if not os.path.isdir(root):
        return []
    return sorted([d for d in os.listdir(root)
                   if os.path.isdir(os.path.join(root, d))])

def _list_subjects(project):
    """v1.7.45: the Create PM uses the same subject list as the Casting PM
    (see _list_project_subjects): subjects.txt, Casting video and audio
    names, CHARACTERS folders and MULTIANGLE folders with images."""
    return _list_project_subjects(project)

def _list_source_images(project):
    images = []
    for folder_name, folder_fn in [("CREATE", _create_path), ("EDITS", _edits_path)]:
        path = folder_fn(project)
        if os.path.isdir(path):
            for f in sorted(os.listdir(path)):
                if f.lower().endswith((".png", ".jpg", ".jpeg", ".webp")):
                    images.append(f"[{folder_name}] {f}")
    return images

def _list_multiangle_images(project, subject):
    path = _subject_path(project, subject)
    if not os.path.isdir(path):
        return []
    return sorted([f for f in os.listdir(path)
                   if f.lower().endswith((".png", ".jpg", ".jpeg", ".webp"))])

def _tagged_mtimes(project, tagged):
    """v1.7.49: {"[TAG] fname": saved time} for the picker's Newest/Oldest sort."""
    out = {}
    for key in tagged:
        m = re.match(r'^\[(CREATE|EDITS|CHARACTERS|GRAB|MULTIANGLE(?::([^\]]+))?)\] (.+)$', key)
        if not m:
            continue
        tag, subj, fname = m.group(1).split(":", 1)[0], m.group(2), m.group(3)
        if tag == "CREATE":
            folder = _create_path(project)
        elif tag == "EDITS":
            folder = _edits_path(project)
        elif tag == "CHARACTERS":
            folder = _characters_path(project)
        elif tag == "GRAB":
            folder = _grab_path(project)
        else:
            folder = os.path.join(_multiangle_root(project), subj or "")
        try:
            out[key] = os.path.getmtime(os.path.join(folder, fname))
        except OSError:
            pass
    return out


def _list_all_frame_images(project, subject):
    """All images across CREATE, EDITS, CHARACTERS, and ALL MULTIANGLE subjects
    for frame picking. Tag format: [CREATE] fname, [EDITS] fname,
    [CHARACTERS] fname, [MULTIANGLE:SubjectName] fname so thumbnail URLs can
    resolve the correct subfolder."""
    images = []
    # v1.5.1: CHARACTERS added so character sheets can seed FF/LF picks.
    # v1.7.54: GRAB (Frame Grab snapshots) added, _BURN copies hidden.
    for folder_name, folder_fn in [("CREATE",     _create_path),
                                   ("EDITS",      _edits_path),
                                   ("CHARACTERS", _characters_path),
                                   ("GRAB",       _grab_path)]:
        path = folder_fn(project)
        if os.path.isdir(path):
            for f in sorted(os.listdir(path)):
                if _picker_image(folder_name, f):
                    images.append(f"[{folder_name}] {f}")
    # Include ALL multiangle subjects, not just the selected one
    ma_root = _multiangle_root(project)
    if os.path.isdir(ma_root):
        for subj in sorted(os.listdir(ma_root)):
            subj_path = os.path.join(ma_root, subj)
            if os.path.isdir(subj_path):
                for f in sorted(os.listdir(subj_path)):
                    if f.lower().endswith((".png", ".jpg", ".jpeg", ".webp")):
                        images.append(f"[MULTIANGLE:{subj}] {f}")
    return images

def _blank_image():
    # 1×768×1280×3 — proper-sized solid black tensor that downstream image
    # processing nodes (bloom, sharpen, etc.) can run through cleanly.
    # Required because the Render PM's image1/image2 outputs feed directly
    # into was-ns nodes that expect non-degenerate tensor dimensions.
    arr = np.zeros((1, 768, 1280, 3), dtype=np.float32)
    return torch.from_numpy(arr)

def _next_subject_name(project, base_name):
    """Return base_name if available, else base_name1, base_name2, etc."""
    existing = _list_subjects(project)
    if base_name not in existing:
        return base_name
    i = 1
    while f"{base_name}{i}" in existing:
        i += 1
    return f"{base_name}{i}"

# ---------------------------------------------------------------------------
# Boolean selector nodes
# ---------------------------------------------------------------------------

class Studio5090AudioPadSwitch:
    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {"mode": ("BOOLEAN", {
            "default": True, "label_on": "Normal", "label_off": "Padded"})}}
    RETURN_TYPES = ("BOOLEAN",)
    RETURN_NAMES = ("audio_pad",)
    FUNCTION     = "select"
    CATEGORY     = "Studio5090/Utilities"
    def select(self, mode): return (mode,)

class Studio5090Upscale2xSteps:
    """
    v1.7.0: 2x Upscale Steps toggle. Pure boolean emitter for switching
    between two manual sigma schedules during testing of the 2x upscale
    pipeline. ON = 3-steps schedule, OFF = 8-steps schedule. Wire output
    into whatever downstream switch chooses between two pre-built sigma
    arrays in the user's RENDER workflow.

    Sometimes one schedule produces better results, sometimes the other;
    this gives a one-click way to flip between them without rewiring the
    canvas.
    """
    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {"mode": ("BOOLEAN", {
            "default": True, "label_on": "3-steps", "label_off": "8-steps"})}}
    RETURN_TYPES = ("BOOLEAN",)
    RETURN_NAMES = ("upscale_2x_steps",)
    FUNCTION     = "select"
    CATEGORY     = "Studio5090/Utilities"
    def select(self, mode): return (mode,)

class Studio5090AudioSelect:
    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {"mode": ("BOOLEAN", {
            "default": True, "label_on": "Audio File", "label_off": "Prompt Audio"})}}
    RETURN_TYPES = ("BOOLEAN",)
    RETURN_NAMES = ("audio_mode",)
    FUNCTION     = "select"
    CATEGORY     = "Studio5090/Utilities"
    def select(self, mode): return (mode,)

class Studio5090LatentMode:
    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {"mode": ("BOOLEAN", {
            "default": True, "label_on": "Empty Latent", "label_off": "Image Input"})}}
    RETURN_TYPES = ("BOOLEAN",)
    RETURN_NAMES = ("latent_mode",)
    FUNCTION     = "select"
    CATEGORY     = "Studio5090/Utilities"
    def select(self, mode): return (mode,)

class Studio5090LatentResolution:
    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {"mode": ("BOOLEAN", {
            "default": True, "label_on": "1536x864", "label_off": "768x432"})}}
    RETURN_TYPES = ("BOOLEAN",)
    RETURN_NAMES = ("latent_resolution",)
    FUNCTION     = "select"
    CATEGORY     = "Studio5090/Utilities"
    def select(self, mode): return (mode,)

class Studio5090StillVideoSwitch:
    """
    Studio5090 Still/Video Switch (v1.5.0)

    Pure boolean emitter. Wire its output into a was-ns "Image Input Switch"
    node's boolean selector. Lets you route between two upstream IMAGE sources
    with a single click — typically the Render PM's frame output (Still Image)
    and a frame extracted from a previous render via VHS LoadVideo (Video Grab).

    Used in pairs in the Render PM workflow: one for First Frame, one for
    Last Frame, so you can seed the next clip from a frame anywhere inside
    a previous clip without rewiring the canvas.
    """
    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {"mode": ("BOOLEAN", {
            "default": True, "label_on": "Still Image", "label_off": "Video Grab"})}}
    RETURN_TYPES = ("BOOLEAN",)
    RETURN_NAMES = ("still_or_video",)
    FUNCTION     = "select"
    CATEGORY     = "Studio5090/Utilities"
    def select(self, mode): return (mode,)

class Studio5090Steps:
    """
    Studio5090 Steps — 3-way step count switch.

    Outputs the actual step count as an integer (8, 20, or 50). Wire
    directly into a sampler's 'steps' input. The three values represent
    distinct compositional modes, not quality tiers — different step
    counts produce structurally different results in modern diffusion
    models (especially FLUX), so this switch lets the user toggle
    between them deliberately.

      - 8 steps:  fast iteration, lower fidelity composition
      - 20 steps: working draft, typical FLUX result
      - 50 steps: final-look, photoreal-leaning composition
    """
    @classmethod
    def INPUT_TYPES(cls):
        # v1.5.1: ascending order 8/20/50 (was 20/8/50). Default stays 20 —
        # the typical working-draft step count for FLUX iteration.
        return {"required": {"mode": (["8", "20", "50"], {"default": "20"})}}
    RETURN_TYPES = ("INT",)
    RETURN_NAMES = ("steps",)
    FUNCTION     = "select"
    CATEGORY     = "Studio5090/Utilities"
    def select(self, mode):
        return (int(mode),)

# ---------------------------------------------------------------------------
# Project Manager node
# ---------------------------------------------------------------------------

class Studio5090RenderProjectManager:

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "new_project_name": ("STRING", {"default": "", "multiline": False}),
                "project":          ("STRING", {"default": ""}),
                "subject":          ("STRING", {"default": ""}),
                "source_image":     ("STRING", {"default": ""}),
                "first_frame":      ("STRING", {"default": ""}),
                "last_frame":       ("STRING", {"default": ""}),
                "frame_mode":       ("BOOLEAN", {"default": True,
                                     "label_on": "SF", "label_off": "FL"}),
                "video_name":       ("STRING", {"default": ""}),
                "prompt_modifier":  ("STRING", {"default": "", "multiline": False}),
                # v1.5.7: selected_angle backs the new Generate Single button.
                # Holds the angle suffix (e.g., "MA_back-left"). Selected via
                # a dropdown widget in the canvas UI.
                "selected_angle":   ("STRING", {"default": ""}),
                # v1.7.19: RETRIEVE SETTINGS.  Holds the settings text read
                # from a finished video (filled by the Fetch button).
                # Must stay single-line: a multiline box is an on-screen text
                # area that cannot be hidden and covers the PM.
                "render_settings":  ("STRING", {"default": "", "multiline": False}),
            },
            # v1.7.40: RENDER STYLE removed from the Render PM (Casting PM keeps it).
        }

    RETURN_TYPES  = ("IMAGE", "IMAGE", "BOOLEAN", "STRING", "STRING", "STRING", "STRING", "STRING", "STRING")
    RETURN_NAMES  = ("image1", "image2", "frame_mode",
                     "video_path", "video_path_hd", "audio_output_path",
                     "video_path_2k", "video_path_debug", "render_settings")
    FUNCTION      = "execute"
    CATEGORY      = "Studio5090/ProjectManager"

    @classmethod
    def create_project(cls, project_name):
        if not project_name or not project_name.strip():
            return {"success": False, "error": "Project name cannot be empty"}
        name = project_name.strip()
        if os.path.isdir(_project_path(name)):
            return {"success": False, "exists": True,
                    "error": f"Project '{name}' already exists"}
        try:
            for fn in [_create_path, _edits_path, _multiangle_root,
                       _videos_path, _videos_hdr_path, _videos_debug_path,
                       _movies_path, _audio_path, _music_path,
                       _characters_path, _exr_path,
                       _workflows_path]:  # v1.6.0
                os.makedirs(fn(name), exist_ok=True)

            # v1.6.0: auto-copy each product template into the new project's
            # workflows/ folder, renamed with the project prefix and _v1
            # suffix. The user gets working starter workflows the moment
            # the project exists. The templates ship inside the toolkit at
            # templates/product_workflows/ and remain unmodified there;
            # only the per-project copies can be edited.
            import shutil
            copied_templates = []
            templates_src = _product_templates_dir()
            workflows_dst = _workflows_path(name)
            for template_fname in _list_product_templates():
                # Template stored as e.g. "CREATE_TEMPLATE.json".
                # Output named as "<project>_CREATE_v1.json".
                # The TYPE token (CREATE / RENDER / CASTING) is whatever
                # appears before "_TEMPLATE.json" in the template filename.
                base = template_fname
                if base.lower().endswith("_template.json"):
                    type_token = base[:-len("_TEMPLATE.json")]
                else:
                    # Defensive fallback for templates not following the
                    # _TEMPLATE.json suffix convention.
                    type_token = os.path.splitext(base)[0]
                target_name = f"{name}_{type_token}_v1.json"
                src = os.path.join(templates_src, template_fname)
                dst = os.path.join(workflows_dst, target_name)
                try:
                    shutil.copy2(src, dst)
                    copied_templates.append(target_name)
                except Exception as e:
                    print(f"[Studio5090] Could not copy template "
                          f"{template_fname} -> {target_name}: {e}")

            result = {"success": True, "project": name}
            if copied_templates:
                result["templates_copied"] = copied_templates
            return result
        except Exception as e:
            return {"success": False, "error": str(e)}

    @classmethod
    def create_subject(cls, project, subject_name):
        """v1.7.45: saves the name to the project's subjects.txt, shared with
        the Casting PM, so it survives a restart.  No folder is made; Save
        Image makes it when the first file lands.  A name that already
        exists is simply selected."""
        if subject_name and subject_name.strip() in _SUBJECT_RESERVED_NAMES:
            return {"success": False, "error": f"'{subject_name.strip()}' is a reserved name"}
        try:
            return _create_casting_subject(project, subject_name)
        except Exception as e:
            return {"success": False, "error": str(e)}

    @classmethod
    def get_projects(cls):
        return {"projects": _list_projects()}

    @classmethod
    def get_subjects(cls, project):
        return {"subjects": _list_subjects(project)}

    @classmethod
    def get_source_images(cls, project):
        return {"images": _list_source_images(project)}

    @classmethod
    def get_multiangle_images(cls, project, subject):
        return {"images": _list_multiangle_images(project, subject)}

    @classmethod
    def get_all_frame_images(cls, project, subject):
        images = _list_all_frame_images(project, subject)
        return {"images": images, "mtimes": _tagged_mtimes(project, images)}

    # v1.7.10: lazy-load picker support. Two helpers so the picker can
    # fetch only what the user actually opens instead of walking every
    # folder upfront.
    @classmethod
    def get_frame_folders(cls, project):
        """Enumerate section headers for the picker. Returns folder names
        AND per-folder image counts so the picker can show '(N images)'
        pills without doing a second walk."""
        folders = []
        counts  = {}

        for name, path_fn in [("CREATE",     _create_path),
                              ("EDITS",      _edits_path),
                              ("CHARACTERS", _characters_path),
                              ("GRAB",       _grab_path)]:
            path = path_fn(project)
            if os.path.isdir(path):
                n = sum(1 for f in os.listdir(path) if _picker_image(name, f))
                if n > 0:
                    folders.append(name)
                    counts[name] = n

        ma_root = _multiangle_root(project)
        if os.path.isdir(ma_root):
            # Every subfolder under MULTIANGLE becomes a section, including
            # SINGLES. Order: alphabetical, matches what the picker JS sorts
            # anyway; keeping backend and frontend order consistent avoids
            # surprises.
            for subj in sorted(os.listdir(ma_root)):
                subj_path = os.path.join(ma_root, subj)
                if os.path.isdir(subj_path):
                    n = sum(1 for f in os.listdir(subj_path)
                            if f.lower().endswith((".png", ".jpg", ".jpeg", ".webp")))
                    if n > 0:
                        key = f"MULTIANGLE:{subj}"
                        folders.append(key)
                        counts[key] = n

        return {"folders": folders, "counts": counts}

    @classmethod
    def get_frame_folder_contents(cls, project, folder):
        """List tagged filenames for a single named section. `folder` is
        one of: CREATE, EDITS, CHARACTERS, or MULTIANGLE:<subject>."""
        if folder == "CREATE":
            path = _create_path(project)
        elif folder == "EDITS":
            path = _edits_path(project)
        elif folder == "CHARACTERS":
            path = _characters_path(project)
        elif folder == "GRAB":
            path = _grab_path(project)
        elif folder.startswith("MULTIANGLE:"):
            subj = folder.split(":", 1)[1]
            path = _subject_path(project, subj)
        else:
            return {"images": []}
        if not os.path.isdir(path):
            return {"images": []}
        images = []
        mtimes = {}
        for f in sorted(os.listdir(path)):
            if _picker_image(folder, f):
                key = f"[{folder}] {f}"
                images.append(key)
                try:
                    mtimes[key] = os.path.getmtime(os.path.join(path, f))
                except OSError:
                    pass
        return {"images": images, "mtimes": mtimes}

    @classmethod
    def get_qwen_angles(cls):
        return {"angles": [{"prompt": p, "suffix": s} for p, s in QWEN_ANGLES]}

    def execute(self, new_project_name, project, subject, source_image,
                first_frame, last_frame, frame_mode, video_name,
                prompt_modifier="", selected_angle="", render_settings="",
                **_ignored):

        def resolve_image(project, subject, tagged_filename):
            """Resolve a tagged filename to an image tensor.

            Tag formats (v1.7.9):
              [CREATE] foo.png                              — current project
              [EDITS] foo.png                               — current project
              [CHARACTERS] foo.png                          — current project (v1.5.1)
              [MULTIANGLE] foo.png                          — current project, uses `subject` arg
              [MULTIANGLE:SubjectName] foo.png              — current project, tagged subject
              [@OTHER_PROJECT|CREATE] foo.png               — cross-project (v1.7.9)
              [@OTHER_PROJECT|EDITS] foo.png                — cross-project
              [@OTHER_PROJECT|CHARACTERS] foo.png           — cross-project
              [@OTHER_PROJECT|MULTIANGLE:SubjectName] foo.png — cross-project

            v1.7.9: Optional @PROJECT_NAME| prefix on the tag lets a saved
            workflow reference an image from a different project than the
            one currently loaded. When present, the file is resolved
            against the referenced project rather than the workflow's
            `project` arg. When absent, behavior is unchanged from prior
            versions — backward compatible with all pre-v1.7.9 saved
            workflows.
            """
            if not tagged_filename or tagged_filename.strip() == "":
                return _blank_image()

            # v1.7.9: strip optional @PROJECT| cross-project prefix.
            # A tag beginning with "@" up to the first "|" names the
            # source project override. Everything after "|" is the
            # standard tag format the parser below already knows.
            resolved_project = project
            cross_project_match = re.match(
                r'^\[@([^|\]]+)\|([^\]]+)\] (.+)$', tagged_filename)
            if cross_project_match:
                resolved_project = cross_project_match.group(1)
                inner_tag        = cross_project_match.group(2)
                fname_after      = cross_project_match.group(3)
                # Reconstruct as a standard tag for the regex below.
                tagged_filename  = f"[{inner_tag}] {fname_after}"

            m = re.match(
                r'^\[(CREATE|EDITS|CHARACTERS|GRAB|MULTIANGLE(?::([^\]]+))?)\] (.+)$',
                tagged_filename)
            if m:
                folder      = m.group(1).split(":", 1)[0]   # CREATE / EDITS / CHARACTERS / MULTIANGLE
                tag_subject = m.group(2)                    # SubjectName or None
                fname       = m.group(3)
                if folder == "CREATE":
                    path = os.path.join(_create_path(resolved_project), fname)
                elif folder == "EDITS":
                    path = os.path.join(_edits_path(resolved_project), fname)
                elif folder == "CHARACTERS":
                    path = os.path.join(_characters_path(resolved_project), fname)
                elif folder == "GRAB":
                    path = os.path.join(_grab_path(resolved_project), fname)
                else:
                    # Prefer subject from the tag; fall back to the arg.
                    # For cross-project MULTIANGLE, the tag MUST include the
                    # subject (:SubjectName) since the arg subject refers to
                    # the CURRENT project's subject and is meaningless in
                    # another project's namespace.
                    subj_name = tag_subject or subject
                    path = os.path.join(
                        _subject_path(resolved_project, subj_name), fname)
            else:
                # Legacy: untagged filename — assume MULTIANGLE under arg subject
                # in the current project. Cross-project prefix requires a full
                # tag so this branch never applies to cross-project cases.
                path = os.path.join(_subject_path(project, subject), tagged_filename)
            if not os.path.isfile(path):
                return _blank_image()
            img = Image.open(path).convert("RGB")
            arr = np.array(img).astype(np.float32) / 255.0
            return torch.from_numpy(arr).unsqueeze(0)

        image1 = resolve_image(project, subject, first_frame)
        image2 = resolve_image(project, subject, last_frame)

        # Video output paths
        # If user didn't fill in scene name, default to "<project>_SCENE" so the
        # workflow always produces a valid path. Downstream save nodes
        # auto-increment counters, so multiple unnamed runs won't collide.
        effective_name = video_name.strip() if video_name.strip() else f"{project}_SCENE"
        base = f"STUDIO5090/{project}/VIDEOS/{effective_name}" if project else ""
        video_path    = base
        video_path_hd = f"{base}_1920x1152" if base else ""

        # v1.7.11: 2K output path. Sibling to video_path_hd. Appends the
        # 2560x1536 resolution suffix to the scene name so 2K renders are
        # distinguishable on disk from 1920x1152 renders even when they
        # share a scene name. Downstream Save Video nodes consume this
        # string as their filename_prefix when the workflow is configured
        # for 2K output.
        video_path_2k = f"{base}_2560x1536" if base else ""

        # v1.7.11: DEBUG output path. Points at a DEBUG subfolder under the
        # project's VIDEOS/ tree so debug-mode intermediate renders (320x192
        # and 640x384 preview outputs, typically) don't pollute the main
        # video output counter. The user is expected to concatenate their
        # own suffix (e.g. "_320_DEBUG" or "_640_DEBUG") downstream via a
        # Concatenate Text node.
        video_path_debug = (
            f"STUDIO5090/{project}/VIDEOS/DEBUG/{effective_name}"
            if project else ""
        )

        # v1.7.0: audio output path stem for the Save Audio (FLAC) node.
        # Same scene_name as the video outputs so audio and video share a
        # naming convention within the project's STUDIO5090/<project>/ tree.
        # Save Audio (FLAC) appends the .flac extension and any counter
        # downstream, so this is just the stem string.
        audio_output_path = (
            f"STUDIO5090/{project}/AUDIO/{effective_name}" if project else ""
        )

        return (image1, image2, frame_mode,
                video_path, video_path_hd, audio_output_path,
                video_path_2k, video_path_debug, render_settings or "")



# ---------------------------------------------------------------------------
# Create Project Manager node (slim — for Invent/Create/Edit tab)
# ---------------------------------------------------------------------------

class Studio5090CreateProjectManager:
    """
    Slim Project Manager for the Create/Invent/Edit tab.
    Handles project + subject selection/creation and Qwen Multi Angle trigger.
    Outputs: project (STRING), subject (STRING)

    v1.4: subject is the categorization tag for SaveResult routing.
          batch_folder names the next MULTIANGLE/<name>/ folder.
          prompt_modifier is appended to all 17 angle prompts.
    """

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "project":         ("STRING", {"default": ""}),
                "subject":         ("STRING", {"default": ""}),
                "source_image":    ("STRING", {"default": ""}),
                "batch_folder":    ("STRING", {"default": ""}),
                "prompt_modifier": ("STRING", {"default": "", "multiline": False}),
                # v1.5.7: selected_angle backs the new Generate Single button.
                # Holds the angle suffix (e.g., "MA_back-left"). Selected via
                # a dropdown widget in the canvas UI.
                "selected_angle":  ("STRING", {"default": ""}),
            }
        }

    # v1.7.54: flux_prompt_formatter_llm added as the third output, so the
    # project and subject wires stay where they are.
    RETURN_TYPES  = ("STRING", "STRING", "STRING")
    RETURN_NAMES  = ("project", "subject", "flux_prompt_formatter_llm")
    FUNCTION      = "execute"
    CATEGORY      = "Studio5090/ProjectManager"

    @classmethod
    def IS_CHANGED(cls, **kwargs):
        # Rerun when the formatter file (or your STUDIO5090 copy) changes.
        return _flux_formatter_fingerprint()

    def execute(self, project, subject, source_image,
                batch_folder="", prompt_modifier="", selected_angle=""):
        return (project, subject, _flux_prompt_formatter_text())


# ---------------------------------------------------------------------------
# v1.7.0: Casting Project Manager
# ---------------------------------------------------------------------------
#
# Studio5090CastingProjectManager — Audio production project manager.
#
# Same PM family as the Render PM and Create PM, scoped to the audio
# pipeline. Does not handle images. Emits the project context, the audio
# output path stem, and the active accent's trigger word + body text.
# Downstream wiring: accent_body -> prompt-manager's accent LLM input,
# accent_trigger -> concatenated to the head of the user's text before
# inference (required by the accent LLM training to actually apply the
# accent), audio_output_path -> Save Audio (FLAC) filename input.

# v1.7.35: Casting render styles.  The number is the position in this list,
# starting at 1.  Only ever ADD new styles at the end.
# v1.7.36: Casting subjects.  Casting never writes into MULTIANGLE, so it
# keeps its own list per project in casting_subjects.txt, and also finds
# subjects from the files Casting has already made.
_CASTING_SUBJECTS_FILE = "casting_subjects.txt"   # v1.7.36 - v1.7.45, still read
_SUBJECTS_FILE = "subjects.txt"                    # v1.7.45: shared by Casting and Create
_CASTING_VIDEO_RE = re.compile(r"^(.+?)_(?:TURNTABLE|AUDITION)(?:_|\.|$)", re.IGNORECASE)
_CASTING_AUDIO_RE = re.compile(r"^(.+?)_CASTING(?:_|\.|$)", re.IGNORECASE)


def _casting_subjects_file(project):
    return os.path.join(_project_path(project), _CASTING_SUBJECTS_FILE)


def _subjects_file(project):
    return os.path.join(_project_path(project), _SUBJECTS_FILE)


def _clean_casting_subject(name):
    name = (name or "").strip()
    if not name or any(c in name for c in '/\\:*?"<>|') or name in (".", ".."):
        return ""
    return name


def _list_project_subjects(project):
    """v1.7.45: one subject list per project, shared by the Casting and
    Create PMs.  subjects.txt (and the older casting_subjects.txt), Casting
    video and audio names, CHARACTERS folders, and MULTIANGLE folders that
    hold images."""
    if not project:
        return []
    found = []

    def add(n):
        n = _clean_casting_subject(n)
        if n and n not in found:
            found.append(n)

    for path in (_subjects_file(project), _casting_subjects_file(project)):
        try:
            with open(path, "r", encoding="utf-8") as f:
                for line in f:
                    add(line)
        except OSError:
            pass
    for base, rx in ((_videos_path(project), _CASTING_VIDEO_RE),
                     (_audio_path(project), _CASTING_AUDIO_RE)):
        if not os.path.isdir(base):
            continue
        for _folder, dirs, files in os.walk(base):
            for name in list(dirs) + files:
                m = rx.match(name)
                if m:
                    add(m.group(1))
    chars = _characters_path(project)
    if os.path.isdir(chars):
        for name in os.listdir(chars):
            if os.path.isdir(os.path.join(chars, name)):
                add(name)
    ma = _multiangle_root(project)
    if os.path.isdir(ma):
        for name in os.listdir(ma):
            if name not in _SUBJECT_RESERVED_NAMES and _has_any_images(os.path.join(ma, name)):
                add(name)
    return sorted(found, key=str.lower)


_list_casting_subjects = _list_project_subjects


def _create_casting_subject(project, subject_name):
    if not project:
        return {"success": False, "error": "Select a project first"}
    name = _clean_casting_subject(subject_name)
    if not name:
        return {"success": False, "error": "Subject names can't contain / \\ : * ? \" < > |"}
    if not os.path.isdir(_project_path(project)):
        return {"success": False, "error": f"Project '{project}' not found"}
    if name in _SUBJECT_RESERVED_NAMES:
        return {"success": False, "error": f"'{name}' is a reserved name"}
    if name not in _list_project_subjects(project):
        with open(_subjects_file(project), "a", encoding="utf-8") as f:
            f.write(name + "\n")
    return {"success": True, "subject": name}


# v1.7.37: RENDER STYLES come from a text file, like the accents.
#   Shipped default: templates/render_styles/render_styles.txt
#   User copy:       STUDIO5090/render_styles.txt  (wins if it exists)
# Same `=== NAME ===` format.  An entry with no text (the first one,
# "0_NO RENDER STYLE ADDED") means no style: the style outputs are blank.
# The three templates in templates/render_styles/ hold <INSERT HERE>, which
# is replaced with the chosen style's text.  A file of the same name in the
# STUDIO5090 folder overrides each template too.
_RENDER_STYLE_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                                 "templates", "render_styles")
_RENDER_STYLE_INSERT = "<INSERT HERE>"
RENDER_STYLE_NONE = "0_NO RENDER STYLE ADDED"


def _render_style_file(name):
    """User copy in STUDIO5090/ if present, else the shipped one."""
    user = os.path.join(_studio_root(), name)
    if os.path.isfile(user):
        return user
    return os.path.join(_RENDER_STYLE_DIR, name)


def _list_render_styles():
    """[{"name", "body"}] in file order."""
    return _parse_accents_file(_render_style_file("render_styles.txt"))


def _find_render_style(name):
    """(found_name, body).  Case-insensitive.  ("", "") for no style or unknown."""
    name = (name or "").strip()
    # v1.7.39: a value with line breaks is old settings text left in this
    # slot by a workflow saved with v1.7.20, not a style name.
    if not name or "\n" in name:
        return "", ""
    for st in _list_render_styles():
        if st["name"].strip().lower() == name.lower():
            return st["name"], st["body"]
    return "", ""


def _render_style_template(filename, body):
    """Template text with <INSERT HERE> replaced by the style body."""
    try:
        with open(_render_style_file(filename), "r", encoding="utf-8", errors="replace") as f:
            text = f.read().replace("\r\n", "\n")
    except OSError:
        logging.warning(f"[Studio5090 Render Style] template missing: {filename}")
        return body
    return text.replace(_RENDER_STYLE_INSERT, body)


def _flux_prompt_formatter_text():
    """v1.7.54: the FLUX prompt formatter LLM for the Create PM.  Same file as
    Casting's (flux_render_style_llm.txt, your STUDIO5090 copy wins), with
    every <INSERT HERE> line removed, because Create has no render style."""
    try:
        with open(_render_style_file("flux_render_style_llm.txt"), "r",
                  encoding="utf-8", errors="replace") as f:
            text = f.read().replace("\r\n", "\n")
    except OSError:
        logging.warning("[Studio5090 Create PM] flux_render_style_llm.txt is missing")
        return ""
    lines = [ln for ln in text.split("\n") if ln.strip() != _RENDER_STYLE_INSERT]
    return "\n".join(lines).replace(_RENDER_STYLE_INSERT, "")


def _flux_formatter_fingerprint():
    path = _render_style_file("flux_render_style_llm.txt")
    try:
        st = os.stat(path)
        return f"{path}|{st.st_mtime_ns}|{st.st_size}"
    except OSError:
        return path


def _render_style_tag(name):
    """The `style:` block for LTX 2.3 (Render PM and Casting PM).  Blank for no style."""
    _found, body = _find_render_style(name)
    if not body:
        return ""
    return _render_style_template("qwen_turntable_ltx2.3_render_style.txt", body)


def _casting_render_style_outputs(name):
    """(render_style_name, flux_llm, qwen_sheet, style_tag) for the Casting PM."""
    found, body = _find_render_style(name)
    if (name or "").strip() and "\n" not in (name or "") and not found:
        logging.warning(f"[Studio5090 Render Style] '{name}' is not in render_styles.txt, no style added")
    label = found or RENDER_STYLE_NONE
    if not body:
        return (label,
                _render_style_template("flux_render_style_llm.txt", ""),
                _render_style_template("qwen_render_style_prompt.txt", ""),
                "")
    return (label,
            _render_style_template("flux_render_style_llm.txt", body),
            _render_style_template("qwen_render_style_prompt.txt", body),
            _render_style_template("qwen_turntable_ltx2.3_render_style.txt", body))


# v1.7.45: the three Casting LLM instructions live in text files, so a fix
# is a file swap, not surgery in the workflow.
#   Shipped:   templates/llm/<name>.txt
#   Your copy: STUDIO5090/<name>.txt  (wins if it exists; never overwritten
#              by a toolkit update, and it does not get toolkit fixes either)
_LLM_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "templates", "llm")
_LLM_FILES = (("Casting Director LLM", "Casting_Director_LLM.txt"),
              ("QWEN Turntable LLM",   "QWEN_Turntable_LLM.txt"),
              ("Animation LLM",        "Animation_LLM.txt"))


def _llm_file(fname):
    """(path, is_user_copy)."""
    user = os.path.join(_studio_root(), fname)
    if os.path.isfile(user):
        return user, True
    return os.path.join(_LLM_DIR, fname), False


def _read_llm(label, fname):
    path, mine = _llm_file(fname)
    try:
        with open(path, "r", encoding="utf-8", errors="replace") as f:
            text = f.read().replace("\r\n", "\n").strip()
    except OSError:
        logging.warning(f"[Studio5090 LLM] {label}: file missing: {path}")
        return ""
    if mine:
        logging.info(f"[Studio5090 LLM] {label}: using your copy in STUDIO5090 ({path})")
    return text


def _llm_overrides():
    """Labels of the LLM files the user has their own copy of."""
    return [label for label, fname in _LLM_FILES if _llm_file(fname)[1]]


# v1.7.46: every text file a user can replace with their own copy in the
# STUDIO5090 folder, as (label, file name).
_OVERRIDABLE_FILES = (("Accents", "accents.txt"),
                      ("Render Styles", "render_styles.txt"),
                      ("FLUX Render Style LLM", "flux_render_style_llm.txt"),
                      ("QWEN Render Style Prompt", "qwen_render_style_prompt.txt"),
                      ("QWEN Turntable LTX2.3 Render Style", "qwen_turntable_ltx2.3_render_style.txt"),
                      ) + _LLM_FILES


def _all_overrides(log=False):
    """[{"label", "path"}] for each file the user has their own copy of in
    STUDIO5090.  With log=True, each one is written to the ComfyUI log."""
    found = []
    for label, fname in _OVERRIDABLE_FILES:
        path = os.path.join(_studio_root(), fname)
        if os.path.isfile(path):
            found.append({"label": label, "path": path})
    if log:
        if found:
            for f in found:
                logging.info(f"[Studio5090] Your own copy is in place and being used: {f['label']} ({f['path']})")
        else:
            logging.info("[Studio5090] No personal copies in STUDIO5090. Using the toolkit's files.")
    return found


def _casting_files_fingerprint():
    """Changes whenever a file the Casting PM reads is edited, added or
    removed, so ComfyUI reruns the PM instead of reusing old text."""
    paths = [_effective_accents_path() or "",
             _render_style_file("render_styles.txt"),
             _render_style_file("flux_render_style_llm.txt"),
             _render_style_file("qwen_render_style_prompt.txt"),
             _render_style_file("qwen_turntable_ltx2.3_render_style.txt")]
    paths += [_llm_file(fname)[0] for _label, fname in _LLM_FILES]
    parts = []
    for path in paths:
        try:
            parts.append(f"{path}:{os.path.getmtime(path)}")
        except OSError:
            parts.append(f"{path}:missing")
    return "|".join(parts)


class Studio5090CastingProjectManager:
    """
    v1.7.0: Casting Project Manager.

    Three widgets in the canvas UI (handled by studio5090_casting_pm_widget.js):
      - project (dropdown of existing STUDIO5090/ projects)
      - subject (text input; can be set freely, persisted in the workflow)
      - accent (dropdown of accents parsed from the active accents file)

    Sixteen outputs (v1.7.45 adds casting_director_llm, qwen_turntable_llm
    and animation_llm at the end, read from templates/llm/ or STUDIO5090/):
      - project (STRING)              — pass-through for downstream nodes
      - subject (STRING)              — pass-through for downstream nodes
      - audio_output_path (STRING)    — STUDIO5090/<project>/AUDIO/<subject>_CASTING
                                        (stem; Save Audio (FLAC) appends extension)
      - accent_trigger (STRING)       — bare accent name with no === delimiters
                                        (the user concatenates this to the head of
                                        their input text in prompt-manager)
      - accent_body (STRING)          — full prompt body for the chosen accent
      - turntable_video_path (STRING) — STUDIO5090/<project>/VIDEOS/<subject>_TURNTABLE
                                        (v1.7.1; stem for the turntable video output)
      - audition_video_path (STRING)  — STUDIO5090/<project>/VIDEOS/<subject>_AUDITION
                                        (v1.7.1; stem for the audition video output)
      - character_path (STRING)       — STUDIO5090/<project>/CHARACTERS/<subject>
                                        (v1.7.1; stem for character sheet outputs)
      - render_settings (STRING)      — v1.7.39: settings read from a finished
                                        video by Fetch Data From Video

    The PM plumbing (Workflows save/open, Select Project, Create Project,
    subject input) mirrors the Render PM / Create PM pattern from the
    v1.5.x and v1.6.x releases. Reuses the same backend routes — no new
    API surface required beyond the accent-list endpoint added by routes.
    """

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "project":         ("STRING", {"default": ""}),
                "subject":         ("STRING", {"default": ""}),
                # accent: stores the bare name (e.g. "BROOKLYN DETECTIVE"). The
                # canvas widget shows a dropdown populated from the active
                # accents file; the body text is looked up at execute time.
                "accent":          ("STRING", {"default": ""}),
            },
            "optional": {
                # v1.7.37: RENDER STYLE name from render_styles.txt.  Plain
                # text (the PM draws the dropdown), saved with the workflow.
                "render_style":    ("STRING", {"default": RENDER_STYLE_NONE}),
                # v1.7.33: RETRIEVE SETTINGS, same as the Render PM.  Filled
                # by the Fetch Data From Video button, never saved in the
                # workflow.  Single-line so no text box covers the PM.
                "render_settings": ("STRING", {"default": "", "multiline": False}),
            },
        }

    RETURN_TYPES = ("STRING", "STRING", "STRING", "STRING", "STRING",
                    "STRING", "STRING", "STRING", "STRING",
                    "STRING", "STRING", "STRING", "STRING",
                    "STRING", "STRING", "STRING")
    RETURN_NAMES = ("project", "subject", "audio_output_path",
                    "accent_trigger", "accent_body",
                    "turntable_video_path", "audition_video_path",
                    "character_path", "render_settings",
                    "render_style_name", "flux_prompt_formatter_llm",
                    "qwen_render_style_prompt", "qwen_turntable_ltx2.3_render_style",
                    "casting_director_llm", "qwen_turntable_llm", "animation_llm")
    FUNCTION     = "execute"
    CATEGORY     = "Studio5090/ProjectManager"

    @classmethod
    def IS_CHANGED(cls, **kwargs):
        # v1.7.45: rerun when accents.txt, render_styles.txt, a render style
        # template or an LLM file is edited.  Before this, ComfyUI reused the
        # PM's cached text until an input changed or ComfyUI restarted.
        return _casting_files_fingerprint()

    def execute(self, project, subject, accent, render_style=None, render_settings=""):
        # Build the audio output path stem. Save Audio (FLAC) wants a
        # filename stem (no extension); it adds .flac downstream. We
        # nest the subject's casting takes under a `<subject>_CASTING`
        # folder inside AUDIO/, so different subjects in the same project
        # don't collide.
        effective_subject = (subject or "").strip() or "untitled"
        if project:
            audio_output_path = (
                f"STUDIO5090/{project}/AUDIO/{effective_subject}_CASTING"
            )
        else:
            audio_output_path = ""

        # accent_trigger is the bare accent name. The accent LLMs trained
        # in the prompt-manager expect this string concatenated to the
        # head of the user's input text — without it, no accent applies.
        accent_trigger = (accent or "").strip()

        # accent_body is the full body block from the accents file. Looked
        # up by name from whichever accents file is active (user override
        # at STUDIO5090/accents.txt, else the toolkit's shipped default).
        accent_body = _get_accent_body(accent_trigger)

        # v1.7.1: three new path outputs for downstream save/write nodes.
        # Same convention as the Render PM video paths — stem strings only,
        # downstream nodes append counter and extension.
        if project:
            turntable_video_path = (
                f"STUDIO5090/{project}/VIDEOS/{effective_subject}_TURNTABLE"
            )
            audition_video_path = (
                f"STUDIO5090/{project}/VIDEOS/{effective_subject}_AUDITION"
            )
            character_path = (
                f"STUDIO5090/{project}/CHARACTERS/{effective_subject}"
            )
        else:
            turntable_video_path = ""
            audition_video_path = ""
            character_path = ""

        return (project, effective_subject, audio_output_path,
                accent_trigger, accent_body,
                turntable_video_path, audition_video_path,
                character_path, render_settings or "",
                *_casting_render_style_outputs(render_style),
                *(_read_llm(label, fname) for label, fname in _LLM_FILES))


# ---------------------------------------------------------------------------
# Save Result nodes
# ---------------------------------------------------------------------------

class Studio5090SaveResult:
    """
    Save Result node for the Create/Invent/Edit tab.
    Right-click -> Run this node to save the current island output.

    Requires both `project` and `subject` to be set on the upstream
    Studio5090CreateProjectManager. Files are routed by `result_type`
    (v1.7.46: the dropdown labels name the folder, old bare values still work):

      FLUX      -> STUDIO5090/<project>/CREATE/<subject>_FLUX_#####.png
      QWEN      -> STUDIO5090/<project>/EDITS/<subject>_QWEN_#####.png
      CHARACTER -> STUDIO5090/<project>/CHARACTERS/<subject>_CHARACTER_#####.png

    The CHARACTER type is intended for character sheets and reference
    images that establish a subject's visual identity (turnaround sheets,
    expression studies, costume references).
    """

    TYPE_MAP = {
        "FLUX":      ("CREATE",     "FLUX"),
        "QWEN":      ("EDITS",      "QWEN"),
        "CHARACTER": ("CHARACTERS", "CHARACTER"),
    }

    # v1.7.46: the dropdown shows which folder each type saves to.  Saved
    # workflows that still hold the old bare values (FLUX / QWEN / CHARACTER)
    # keep working: VALIDATE_INPUTS accepts both, and _type_key() maps the
    # label back to the bare type.
    TYPE_LABELS = [
        "FLUX (CREATE folder)",
        "QWEN (EDITS folder)",
        "CHARACTER (CHARACTERS folder)",
    ]

    @staticmethod
    def _type_key(result_type):
        return str(result_type or "").split(" (", 1)[0].strip().upper()

    @classmethod
    def VALIDATE_INPUTS(cls, result_type):
        if cls._type_key(result_type) in cls.TYPE_MAP:
            return True
        return f"result_type '{result_type}' is not one of {', '.join(cls.TYPE_LABELS)}"

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "images":      ("IMAGE",),
                "project":     ("STRING", {"default": ""}),
                "subject":     ("STRING", {"default": ""}),
                "result_type": (cls.TYPE_LABELS,),
            },
            # v1.4.5: receive the prompt graph + extra PNG info (which includes
            # the UI-side "workflow" key) so we can embed them as PNG text
            # chunks. This is what lets ComfyUI restore the originating
            # workflow when a saved image is dragged back onto the canvas —
            # matching native SaveImage behavior.
            "hidden": {
                "prompt":        "PROMPT",
                "extra_pnginfo": "EXTRA_PNGINFO",
            },
        }

    RETURN_TYPES = ()
    FUNCTION     = "save"
    OUTPUT_NODE  = True
    CATEGORY     = "Studio5090/Utilities"

    def save(self, images, project, subject, result_type,
             prompt=None, extra_pnginfo=None):
        from PIL import Image as PILImage
        from PIL.PngImagePlugin import PngInfo
        import numpy as np

        # Specific, actionable error messages instead of a generic line.
        # Each skip path returns a "skip_reason" string in the UI dict so the
        # frontend can render a visible red badge on the node, alongside the
        # console log.
        if not project.strip() and not subject.strip():
            msg = ("SaveResult: project AND subject required. Pick a project "
                   "and select or create a subject on the Create PM.")
            print(f"[Studio5090] {msg}")
            return {"ui": {"studio5090_skip": [msg]}}
        if not project.strip():
            msg = ("SaveResult: 'project' is empty. Select a project on the "
                   "upstream Create Project Manager before running this node.")
            print(f"[Studio5090] {msg}")
            return {"ui": {"studio5090_skip": [msg]}}
        if not subject.strip():
            msg = ("SaveResult: 'subject' is empty. Select a subject (or "
                   "create one with the Create Subject button) on the "
                   "upstream Create Project Manager before running this node.")
            print(f"[Studio5090] {msg}")
            return {"ui": {"studio5090_skip": [msg]}}

        type_key = self._type_key(result_type)
        folder, prefix_tag = self.TYPE_MAP.get(type_key, ("CREATE", type_key or "FLUX"))

        save_dir = os.path.join(
            folder_paths.output_directory, STUDIO5090_ROOT, project, folder
        )
        os.makedirs(save_dir, exist_ok=True)

        # v1.4.5: build PNG metadata once. We embed two text chunks matching
        # ComfyUI's native SaveImage exactly:
        #   - "prompt"   : the API-format prompt graph (for headless reruns)
        #   - "workflow" : the UI-format workflow JSON (for drag-back-to-canvas)
        # `extra_pnginfo` arrives as a dict that typically contains a
        # "workflow" key; we forward every key-value the front-end provides
        # so future ComfyUI additions (e.g. authoring metadata) pass through
        # unchanged.
        metadata = PngInfo()
        try:
            if prompt is not None:
                metadata.add_text("prompt", json.dumps(prompt))
            if extra_pnginfo is not None:
                for key, value in extra_pnginfo.items():
                    metadata.add_text(key, json.dumps(value))
        except Exception as e:
            # Don't lose the image to a metadata serialization failure;
            # log and continue with whatever chunks were already added.
            print(f"[Studio5090] Warning: metadata embed partially failed: {e}")

        prefix = f"{subject}_{prefix_tag}"
        results = []
        for img_tensor in images:
            arr = (img_tensor.cpu().numpy() * 255).clip(0, 255).astype(np.uint8)
            img = PILImage.fromarray(arr, mode="RGB")

            # Auto-increment — never overwrite
            counter = 1
            while True:
                fname = f"{prefix}_{counter:05d}_.png"
                fpath = os.path.join(save_dir, fname)
                if not os.path.exists(fpath):
                    break
                counter += 1

            # compress_level=4 matches ComfyUI's native SaveImage default —
            # good balance of speed vs file size for PNGs with metadata.
            img.save(fpath, format="PNG",
                     pnginfo=metadata, compress_level=4)
            results.append({"filename": fname, "subfolder": "", "type": "output"})
            print(f"[Studio5090] Saved {type_key} result: {fpath}")

        # Clear any previous skip badge by sending an empty skip status
        return {"ui": {"images": results, "studio5090_skip": [""]}}

# ---------------------------------------------------------------------------
# HDR Render Queue node (v1.5.0)
# ---------------------------------------------------------------------------

# The HDR template ships with this package at templates/hdr_workflow.json.
# Loaded once and cached on first queue execution.
_HDR_TEMPLATE_CACHE = None

# Node IDs from the LTX-2.3 IC-LoRA HDR Distilled template. These are the
# specific nodes the queue rewrites per job. If the template changes, update
# this map — the rest of the queue logic keys off these names.
HDR_TEMPLATE = {
    "load_video":           "5106",   # LoadVideo
    "video_combine":        "5127",   # VHS_VideoCombine — output naming + ProRes settings
    "hdr_postprocess":      "5126",   # LTXVHDRDecodePostprocess — EXR save toggle + dir
    "random_noise":         "4832",   # RandomNoise — seed (left alone by default)
}

# Smart-match resolution targets. Each entry is (node_id, widget_name).
# The queue resolves each model name through folder_paths and rewrites the
# widget value at submit time so users with different model-folder layouts
# don't need to manually edit the template.
HDR_MODEL_WIDGETS = [
    ("3940", "ckpt_name"),       # CheckpointLoaderSimple — main checkpoint
    ("5011", "lora_name"),       # LTXICLoRALoaderModelOnly — HDR IC-LoRA
    ("5023", "text_encoder"),    # LTXAVTextEncoderLoader — Gemma text encoder
    ("5023", "ckpt_name"),       # LTXAVTextEncoderLoader — transformer checkpoint
    ("5125", "lora_name"),       # LTXICLoRALoaderModelOnly — distilled LoRA
]


def _hdr_template_path():
    """Absolute path to the shipped HDR workflow template."""
    here = os.path.dirname(os.path.abspath(__file__))
    return os.path.join(here, "templates", "hdr_workflow.json")


def _load_hdr_template():
    """Load and cache the HDR template. Returns the UI-format workflow JSON."""
    global _HDR_TEMPLATE_CACHE
    if _HDR_TEMPLATE_CACHE is None:
        with open(_hdr_template_path(), "r", encoding="utf-8") as f:
            _HDR_TEMPLATE_CACHE = json.load(f)
    # Deep-copy so caller can mutate without poisoning the cache
    import copy
    return copy.deepcopy(_HDR_TEMPLATE_CACHE)


def _queue_state_path():
    """Single global queue state file at STUDIO5090/.queue_state.json."""
    return os.path.join(_studio_root(), ".queue_state.json")


def _queue_state_load():
    """Load queue state, returning a default skeleton if missing/corrupt."""
    path = _queue_state_path()
    default = {"pending": [], "running": None, "completed": [], "version": 1}
    if not os.path.isfile(path):
        return default
    try:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
        # Backfill any missing keys for forward-compat
        for k, v in default.items():
            data.setdefault(k, v)
        return data
    except Exception as e:
        print(f"[Studio5090] Queue state load failed ({e}); starting fresh")
        return default


def _queue_state_save(state):
    """Write queue state atomically (write+rename) to avoid corruption mid-write."""
    path = _queue_state_path()
    os.makedirs(os.path.dirname(path), exist_ok=True)
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(state, f, indent=2)
    os.replace(tmp, path)


def _list_project_videos(project):
    """List .mp4/.mov files in STUDIO5090/<project>/VIDEOS/, filenames only."""
    if not project:
        return []
    path = _videos_path(project)
    if not os.path.isdir(path):
        return []
    return sorted([
        f for f in os.listdir(path)
        if f.lower().endswith((".mp4", ".mov", ".mkv", ".webm"))
    ])


def _smart_match_model(requested_name, model_kind="checkpoints"):
    """
    Three-tier model path resolution.

    Tier 1 — exact match: the requested string is already a valid relative
             path in one of the model folders for this kind.
    Tier 2 — filename match: ignore the directory portion; match by leaf
             filename anywhere in the model folders for this kind.
    Tier 3 — unique substring: if there's exactly one model whose filename
             contains the requested leaf (without extension), return it.

    Returns the resolved relative path that ComfyUI's loader will accept,
    or the original requested_name if nothing matches (let ComfyUI surface
    the error — we don't want silent rewrites to a wrong model).
    """
    if not requested_name:
        return requested_name

    # Normalize Windows backslashes to forward slashes for portable matching
    norm_requested = requested_name.replace("\\", "/")
    requested_leaf = os.path.basename(norm_requested)

    # Get the candidate file list from folder_paths for this model kind
    try:
        candidates = folder_paths.get_filename_list(model_kind)
    except Exception:
        return requested_name
    if not candidates:
        return requested_name

    # Tier 1: exact match (try both original and normalized forms)
    if requested_name in candidates:
        return requested_name
    if norm_requested in candidates:
        return norm_requested

    # Tier 2: filename match — find any candidate whose basename equals leaf
    leaf_matches = [c for c in candidates
                    if os.path.basename(c.replace("\\", "/")) == requested_leaf]
    if len(leaf_matches) == 1:
        return leaf_matches[0]
    if len(leaf_matches) > 1:
        # Ambiguous — prefer the one with the most path-component overlap
        req_parts = set(p for p in norm_requested.split("/") if p)
        best = max(leaf_matches,
                   key=lambda c: len(req_parts & set(c.replace("\\","/").split("/"))))
        return best

    # Tier 3: unique substring (without extension) — last resort
    stem = os.path.splitext(requested_leaf)[0].lower()
    if stem:
        substr_matches = [c for c in candidates
                          if stem in os.path.basename(c).lower()]
        if len(substr_matches) == 1:
            return substr_matches[0]

    # No match — return original; ComfyUI will surface a clear loader error
    return requested_name


def _ui_workflow_to_api(ui_workflow):
    """
    Convert a UI-format workflow (the format ComfyUI saves to .json) into the
    API format expected by the /prompt endpoint.

    UI format nodes carry inputs as an array of {name, type, widget?, link?}
    plus widgets_values that can be either a positional list OR a named dict
    (VHS-family nodes use dict form).

    API format keys nodes by id (string), each {class_type, inputs}, where
    inputs is a dict of name->value, and linked inputs are [src_id_str, slot].

    Caveats handled:
      - Input slot may have BOTH a `widget` block AND a non-null `link` —
        the link wins for serialization, but the widget still counts toward
        positional widget indexing (list-form widgets_values only).
      - Non-executable nodes (Note, Reroute, PrimitiveNode) are skipped.
      - Nodes with mode != 0 are skipped (muted/bypassed).
    """
    # Index links: each link is [link_id, src_node, src_slot, dst_node, dst_slot, type]
    links_by_id = {}
    for link in ui_workflow.get("links", []) or []:
        if isinstance(link, list) and len(link) >= 6:
            links_by_id[link[0]] = link

    api = {}
    for node in ui_workflow.get("nodes", []) or []:
        if node.get("type") in ("Note", "PrimitiveNode", "Reroute"):
            continue
        if node.get("mode", 0) != 0:
            # mode 0 = active; non-zero = muted/bypassed
            continue

        node_api = {"class_type": node["type"], "inputs": {}}
        widget_vals = node.get("widgets_values")
        is_dict_widgets = isinstance(widget_vals, dict)
        is_list_widgets = isinstance(widget_vals, list)
        widget_idx = 0

        for inp in (node.get("inputs") or []):
            name = inp.get("name") or inp.get("localized_name")
            if not name:
                continue
            link_id = inp.get("link")
            has_widget = "widget" in inp

            if link_id is not None:
                link = links_by_id.get(link_id)
                if link is not None:
                    node_api["inputs"][name] = [str(link[1]), link[2]]
                if has_widget and is_list_widgets:
                    widget_idx += 1
            elif has_widget:
                if is_list_widgets and widget_idx < len(widget_vals):
                    node_api["inputs"][name] = widget_vals[widget_idx]
                    widget_idx += 1
                elif is_dict_widgets and name in widget_vals:
                    node_api["inputs"][name] = widget_vals[name]

        api[str(node["id"])] = node_api
    return api


def _mutate_hdr_workflow_for_job(ui_workflow, job):
    """
    Given a fresh copy of the UI-format HDR template and a queue job dict,
    rewrite the relevant widget values in place.

    Job dict shape:
      {
        "project":      str,   # Studio5090 project name
        "source_video": str,   # filename within STUDIO5090/<project>/VIDEOS/
        "scene_name":   str,   # output stem; e.g. "RUSTY_SCENE" -> RUSTY_SCENE_HDR.mov
        "save_exr":     bool,  # also write EXR sequence to EXR/<scene_name>/
        "save_prores":  bool,  # write ProRes .mov (typical: True)
      }
    """
    project   = job["project"]
    # v1.5.2: strip trailing underscores from the scene stem so source files
    # named like "SCENE1_00010_.mp4" don't produce "SCENE1_00010__HDR" output
    # (double underscore). The trailing _ comes from ComfyUI's auto-increment
    # naming convention and is cosmetic — we want clean "<scene>_HDR" here.
    scene     = job["scene_name"].rstrip("_")
    src_video = job["source_video"]
    save_exr  = bool(job.get("save_exr", False))

    # Build a quick id -> node lookup for in-place edits
    by_id = {str(n["id"]): n for n in ui_workflow.get("nodes", [])}

    def _set_widget(node, name, value):
        """Set a widget value on a UI-format node, handling list vs dict form."""
        wv = node.get("widgets_values")
        if isinstance(wv, dict):
            wv[name] = value
            return
        if not isinstance(wv, list):
            return
        # Positional: walk inputs to find the slot index for this widget name
        # (matching the converter's logic for list-form widgets).
        idx = 0
        for inp in (node.get("inputs") or []):
            if "widget" in inp:
                if (inp.get("name") == name or
                    inp.get("localized_name") == name):
                    if idx < len(wv):
                        wv[idx] = value
                    return
                idx += 1

    # --- LoadVideo (5106): set source video filename
    n_load = by_id.get(HDR_TEMPLATE["load_video"])
    if n_load:
        _set_widget(n_load, "file", src_video)

    # --- VHS_VideoCombine (5127): output ProRes path
    # filename_prefix is a path-relative prefix that ComfyUI joins with the
    # output directory. v1.5.2: HDR masters now go into VIDEOS/HDR/ so they
    # cluster separately from SDR LTX renders (which remain in VIDEOS/).
    # STUDIO5090/<project>/VIDEOS/HDR/<scene>_HDR yields
    # STUDIO5090/<project>/VIDEOS/HDR/<scene>_HDR_00001-audio.mov and
    # STUDIO5090/<project>/VIDEOS/HDR/<scene>_HDR_00001.mov (audio twin).
    n_vid = by_id.get(HDR_TEMPLATE["video_combine"])
    if n_vid:
        out_prefix = f"STUDIO5090/{project}/VIDEOS/HDR/{scene}_HDR"
        _set_widget(n_vid, "filename_prefix", out_prefix)
        # save_output should be True for ProRes (the typical case)
        _set_widget(n_vid, "save_output", bool(job.get("save_prores", True)))

    # --- LTXVHDRDecodePostprocess (5126): EXR settings
    n_hdr = by_id.get(HDR_TEMPLATE["hdr_postprocess"])
    if n_hdr:
        _set_widget(n_hdr, "save_exr", save_exr)
        if save_exr:
            # Per-scene subfolder under EXR/. Forward slashes since LTX
            # postprocess writes from Python and tolerates either form;
            # this matches the rest of the toolkit's path style.
            exr_dir = f"STUDIO5090/{project}/EXR/{scene}"
            _set_widget(n_hdr, "output_dir", exr_dir)
            _set_widget(n_hdr, "filename_prefix", scene)

    # --- Smart-match all model paths to whatever's actually installed
    for nid, widget_name in HDR_MODEL_WIDGETS:
        n = by_id.get(nid)
        if not n:
            continue
        wv = n.get("widgets_values")
        # Figure out the requested value (the template's stored model path)
        requested = None
        if isinstance(wv, dict):
            requested = wv.get(widget_name)
        elif isinstance(wv, list):
            # Walk inputs to find the positional widget index
            idx = 0
            for inp in (n.get("inputs") or []):
                if "widget" in inp:
                    if (inp.get("name") == widget_name or
                        inp.get("localized_name") == widget_name):
                        if idx < len(wv):
                            requested = wv[idx]
                        break
                    idx += 1
        if not requested:
            continue
        # Resolve and write back. Use "checkpoints" folder for ckpt_name +
        # text_encoder (both live there in practice on Alan's setup), "loras"
        # for lora_name. We accept the slightly fuzzy categorization because
        # smart-match will fall back gracefully if a folder is empty.
        if "lora" in widget_name.lower():
            kind = "loras"
        else:
            kind = "checkpoints"
        resolved = _smart_match_model(requested, kind)
        if resolved != requested:
            _set_widget(n, widget_name, resolved)
            print(f"[Studio5090] HDR smart-match: {widget_name} "
                  f"{requested!r} -> {resolved!r}")

    return ui_workflow


def _cleanup_vhs_audio_twin(scene_stem, videos_dir):
    """
    VHS_VideoCombine emits both an audio-bearing file (.../<stem>_HDR_NNNNN-audio.mov)
    and a silent twin (.../<stem>_HDR_NNNNN.mov). Audio is the one we want.

    Strategy: scan videos_dir for files matching <scene_stem>_HDR_*-audio.mov,
    and for each one, delete the matching silent twin and rename the audio
    file to drop the '-audio' suffix.

    Idempotent — safe to call repeatedly.
    """
    if not os.path.isdir(videos_dir):
        return
    prefix = f"{scene_stem}_HDR_"
    suffix = "-audio.mov"
    cleaned = 0
    for fname in sorted(os.listdir(videos_dir)):
        if not (fname.startswith(prefix) and fname.endswith(suffix)):
            continue
        audio_path = os.path.join(videos_dir, fname)
        silent_name = fname[:-len(suffix)] + ".mov"   # drop "-audio", keep .mov
        silent_path = os.path.join(videos_dir, silent_name)
        try:
            if os.path.isfile(silent_path):
                os.remove(silent_path)
            # Now rename audio -> silent's name (the clean final name)
            os.rename(audio_path, silent_path)
            cleaned += 1
            print(f"[Studio5090] HDR cleanup: kept {silent_name}, removed audio-less twin")
        except Exception as e:
            print(f"[Studio5090] HDR cleanup error on {fname}: {e}")

    # v1.5.2: VHS_VideoCombine always writes a companion <prefix>_NNNNN.png
    # alongside the video, containing the workflow JSON as PNG metadata.
    # Useful for SDR pipelines where you might want to recover the source
    # workflow, but these HDR renders are API-driven and the PNG is just
    # clutter. Remove any matching <scene>_HDR_*.png files from the same dir.
    png_removed = 0
    for fname in sorted(os.listdir(videos_dir)):
        if fname.startswith(prefix) and fname.endswith(".png"):
            try:
                os.remove(os.path.join(videos_dir, fname))
                png_removed += 1
            except Exception as e:
                print(f"[Studio5090] HDR cleanup PNG error on {fname}: {e}")
    if png_removed:
        print(f"[Studio5090] HDR cleanup: removed {png_removed} companion workflow PNG(s)")

    if cleaned:
        print(f"[Studio5090] HDR cleanup: processed {cleaned} output pair(s)")


class Studio5090HDRRenderQueue:
    """
    Studio5090 HDR Render Queue (v1.5.0)

    Queue multiple LTX HDR renders against one project's VIDEOS/ folder.
    Jobs persist across ComfyUI restarts via a single global state file at
    STUDIO5090/.queue_state.json — so a crash or restart doesn't lose work.

    Per-job options:
      - ProRes output (default ON) -> writes to VIDEOS/<scene>_HDR.mov
      - EXR sequence (default OFF) -> writes to EXR/<scene>/frame_*.exr

    Models are smart-matched at submit time so users with different model-folder
    layouts don't need to hand-edit the shipped template. VHS_VideoCombine's
    audio-twin behavior is cleaned up after each job ships (single clean output
    filename, no '-audio' suffix).

    Architecture: this node is a thin Python shell. Almost all interactive
    logic lives in studio5090_hdr_queue_widget.js (canvas widget) which talks
    to API routes in studio5090_routes.py. The node's execute is a no-op —
    submission happens through the widget calling /studio5090/hdr_queue/*
    routes, which use the helpers in this module.

    To actually run a queued job, the widget POSTs to /studio5090/hdr_queue/run
    which builds the API workflow and submits it to ComfyUI's /prompt endpoint.
    """

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "project": ("STRING", {"default": ""}),
            }
        }

    RETURN_TYPES = ()
    FUNCTION     = "noop"
    OUTPUT_NODE  = True
    CATEGORY     = "Studio5090/HDR"

    def noop(self, project):
        # All real work happens through the widget + routes. This is just
        # the canvas placeholder so users can drop it into a workflow.
        return {}

    # Class methods used by routes.py to drive queue ops
    @classmethod
    def list_videos(cls, project):
        return {"videos": _list_project_videos(project)}

    @classmethod
    def state_load(cls):
        return _queue_state_load()

    @classmethod
    def state_save(cls, state):
        _queue_state_save(state)
        return {"success": True}


# ---------------------------------------------------------------------------
# Node registration
# ---------------------------------------------------------------------------

NODE_CLASS_MAPPINGS = {
    "Studio5090AudioPadSwitch":        Studio5090AudioPadSwitch,
    "Studio5090Upscale2xSteps":        Studio5090Upscale2xSteps,
    "Studio5090AudioSelect":           Studio5090AudioSelect,
    "Studio5090LatentMode":            Studio5090LatentMode,
    "Studio5090LatentResolution":      Studio5090LatentResolution,
    "Studio5090StillVideoSwitch":      Studio5090StillVideoSwitch,
    "Studio5090Steps":                 Studio5090Steps,
    "Studio5090RenderProjectManager":  Studio5090RenderProjectManager,
    "Studio5090CreateProjectManager":  Studio5090CreateProjectManager,
    "Studio5090CastingProjectManager": Studio5090CastingProjectManager,
    "Studio5090SaveResult":            Studio5090SaveResult,
    "Studio5090HDRRenderQueue":        Studio5090HDRRenderQueue,
}

# Display names carry the toolkit version so it's visible on the canvas
# which release is currently installed — quick sanity check during testing.
NODE_DISPLAY_NAME_MAPPINGS = {
    "Studio5090AudioPadSwitch":        "Studio5090 Audio Pad Switch",
    "Studio5090Upscale2xSteps":        "Studio5090 2x Upscale Steps",
    "Studio5090AudioSelect":           "Studio5090 Audio Select",
    "Studio5090LatentMode":            "Studio5090 Latent Mode",
    "Studio5090LatentResolution":      "Studio5090 Latent Resolution",
    "Studio5090StillVideoSwitch":      "Studio5090 Still/Video Switch",
    "Studio5090Steps":                 "Studio5090 Steps",
    "Studio5090RenderProjectManager":  "Studio5090 Render Project Manager v1.7.58",
    "Studio5090CreateProjectManager":  "Studio5090 Create Project Manager v1.7.58",
    "Studio5090CastingProjectManager": "Studio5090 Casting Project Manager v1.7.58",
    "Studio5090SaveResult":            "Studio5090 Save Result v1.7.58",
    "Studio5090HDRRenderQueue":        "Studio5090 HDR Render Queue v1.7.58",
}
