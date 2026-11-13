# Studio5090 — Required Models

This document lists every model file the Studio5090 toolkit expects, where
each file should live in your ComfyUI installation, and what part of the
pipeline depends on it.

If your filenames differ slightly (newer release versions, custom
quantizations), the existing batch routes will still find a single
unambiguous match — but exact-name matches are the most reliable. When in
doubt, rename to match the canonical filenames below or update the
references in the workflow JSON.

---

## Project layout assumed

```
ComfyUI/
  models/
    checkpoints/        ← LTX 2.3 base checkpoint
    diffusion_models/   ← Qwen Image Edit UNET (or models/unet/)
    loras/              ← All LoRAs (Qwen + LTX IC-LoRAs)
    text_encoders/      ← CLIP / Gemma encoders (or models/clip/)
    vae/                ← VAEs
```

ComfyUI accepts subfolders inside any of these. Studio5090 will search
recursively, so files under `models/loras/qwen/` or `models/loras/LTX2.3/`
are discoverable.

---

## Qwen Multi Angle batch (used by both Project Manager nodes)

Required for the **Generate All Angles (17)** button in the Render PM and
the Create PM. If any of these are missing, the batch will fail with a
specific error message naming the missing file.

| File | Folder | Purpose |
|------|--------|---------|
| `qwen_image_edit_2511_bf16.safetensors` | `models/diffusion_models/` (or `models/unet/`) | Qwen Image Edit base UNET |
| `Qwen-Image-Edit-2511-Lightning-8steps-V1.0-bf16.safetensors` | `models/loras/` | Lightning 8-step distillation LoRA (speeds up inference) |
| `qwen-image-edit-2511-multiple-angles-lora.safetensors` | `models/loras/` | Multi-angle camera control LoRA |
| `qwen_2.5_vl_7b_fp8_scaled.safetensors` | `models/text_encoders/` (or `models/clip/`) | Qwen 2.5 VL 7B vision-language encoder |
| `qwen_image_vae.safetensors` | `models/vae/` | Qwen image VAE |

Where to download: search the model name on Hugging Face. The Lightning
LoRA and the multi-angle LoRA are both community releases — use the most
recent versions linked from the Lightricks LTX community channels.

---

## LTX-2.3 video render pipeline

Required for the Studio5090 LTX render workflow (downstream of the Render
Project Manager). These are not loaded by the Studio5090 nodes themselves
but by the LTX nodes the workflow connects to.

| File | Folder | Purpose |
|------|--------|---------|
| `ltx-2.3-22b-dev.safetensors` | `models/checkpoints/` | LTX-2.3 base checkpoint |
| `ltx-2.3-22b-distilled-lora-384-1.1.safetensors` | `models/loras/` | LTX 2.3 distilled LoRA |
| `gemma_3_12B_it.safetensors` | `models/text_encoders/` | Gemma 3 12B text encoder |

Where to download: Lightricks publishes LTX checkpoints and LoRAs on
Hugging Face under the official Lightricks organization.

---

## LTX-2.3 HDR finishing pipeline

Required for the LTX-2.3 HDR (LumiVid) workflow that produces 12-bit
ProRes 4444 XQ HDR masters. Requires everything from the SDR LTX section
above, plus:

| File | Folder | Purpose |
|------|--------|---------|
| `ltx-2.3-22b-ic-lora-hdr-0.9.safetensors` | `models/loras/` | LTX HDR IC-LoRA (LogC3 encoder) |

**Environment variable required for EXR output:**

If you plan to export EXR sequences (full scene-linear HDR masters), set
this environment variable before launching ComfyUI:

```
OPENCV_IO_ENABLE_OPENEXR=1
```

Without it, OpenCV silently drops EXR write capability and EXR output will
fail. ProRes-only output works without the variable.

Reference paper: Lightricks LumiVid (HDR-LumiVid project page, 2025-2026).
The HDR pipeline encodes scene-linear HDR via Arri LogC3 internally.
Workflow output is interpreted by Resolve as **Arri LogC3 / Arri Wide
Gamut 3** input — see Resolve setup notes in the session notes.

---

## How Studio5090 finds models

When a batch route (Qwen multi-angle in v1.4, HDR queue in v1.5) is
queued, the model lookup walks a three-tier search:

1. **Exact path match** — file at the exact name and folder shown above
2. **Filename match across subfolders** — same filename, different folder
   (catches users who organize models under `models/loras/qwen/`,
   `models/loras/ltx/`, etc.)
3. **Substring match if exactly one candidate** — handles minor version
   drift like `_v1.1` → `_v1.2`. Will not auto-pick if multiple files
   match — in that case the batch fails with a "please rename to
   disambiguate" error.

If the batch reports a missing model, the error message names the exact
file that wasn't found. Verify the file exists in any subfolder of the
expected `models/<type>/` directory.

---

## Notes for users packaging their own workflows

If you build a workflow that uses Studio5090 nodes and the model
references in your downstream LTX nodes use names different from the
canonical ones above, document those names in your own workflow's Note
nodes. The Studio5090 toolkit only auto-discovers models for the batches
it owns (Qwen multi-angle in v1.4, HDR queue in v1.5).

---

## Using Save Result (Studio5090 Save Result node)

The Save Result node is how you persist Flux generations, Qwen edits, and
character sheets into the Studio5090 project structure. It's an OUTPUT_NODE
in the Studio5090/Utilities category — you wire image output into it and
right-click → "Run this node" on whichever island you want to save from.

**Required inputs:**

The node has three required string inputs that come from the upstream
**Studio5090 Create Project Manager** node:

- `project` — the project name from the Create PM's project dropdown
- `subject` — the subject from the Create PM's Subject dropdown (NOT the
  Batch Folder field — that's for Qwen multiangle output, not Save Result)
- `result_type` — one of `FLUX`, `QWEN`, `CHARACTER`

**File routing by result_type:**

| Type | Folder | Filename |
|------|--------|----------|
| FLUX | `STUDIO5090/<project>/CREATE/` | `<subject>_FLUX_#####_.png` |
| QWEN | `STUDIO5090/<project>/EDITS/` | `<subject>_QWEN_#####_.png` |
| CHARACTER | `STUDIO5090/<project>/CHARACTERS/` | `<subject>_CHARACTER_#####_.png` |

The `#####` is an auto-incrementing counter. Save Result never overwrites
existing files — it always picks the next available number.

**Common gotcha — "I clicked Save Result and nothing happened":**

If you don't see a saved file and the ComfyUI log shows one of these
messages, the node refused to save because a required field was empty:

- `[Studio5090] SaveResult: 'project' is empty.` — pick a project on the
  Create PM
- `[Studio5090] SaveResult: 'subject' is empty.` — select an existing
  subject from the dropdown OR create a new one with the green "Create
  Subject" button on the Create PM

The Create PM's Subject dropdown drives the SaveResult routing. Without a
subject, the node has nothing to use as a filename prefix and bails. This
is intentional — silent saves with malformed names would be worse.

**When to use CHARACTER vs FLUX:**

FLUX is for in-progress character generations and concept work — first
attempts at the look, costume variations, posing studies. CHARACTER is for
*reference sheets* — turnaround views, expression studies, costume
references that establish the canonical appearance of a subject. The
CHARACTERS folder is meant to be the directory you point Reference-Sheet
Prompting at when feeding character identity into LTX i2v.

A typical workflow: generate exploration images with Flux → save the best
ones as FLUX into CREATE → once you've locked in the look, generate a
proper character sheet → save that as CHARACTER into CHARACTERS. The
character sheet is the load-bearing identity reference for downstream work.

---

## Scene name default behavior (Render Project Manager)

The Render PM has a "Scene Name" field that drives the video output path.
If you leave this field blank when running a render, the toolkit
substitutes a default of `<project>_SCENE`. So if your project is `RUSTY`
and you render without setting a scene name, the output goes to:

```
STUDIO5090/RUSTY/VIDEOS/RUSTY_SCENE      (1280x768)
STUDIO5090/RUSTY/VIDEOS/RUSTY_SCENE_1920x1152
```

The Render PM panel shows a hint in the field — `(blank → RUSTY_SCENE)`
— and the path preview below the field updates in real time to show the
effective path either way.

This default exists because there's no way to validate the field at
render-time (the workflow runs whatever inputs it gets). Without a
default, an empty Scene Name would produce a malformed path. Downstream
save nodes auto-increment file counters, so multiple unnamed runs won't
collide — they just produce `RUSTY_SCENE_00001`, `RUSTY_SCENE_00002`, etc.

For organized projects, name your scenes explicitly. The default is a
safety net, not a recommendation.

---

---

## Studio5090 Steps node (replaces Steps Quality in v1.4.4)

The Steps node outputs an integer step count (8, 20, or 50) that wires
directly into a sampler's `steps` input. Three discrete values, one
switch.

**Important: step count is a composition variable, not a quality dial.**

In FLUX (and other modern diffusion models), different step counts
produce *structurally different* compositions, not the same image at
different fidelities. A 20-step Dave and a 50-step Dave are slightly
different Daves arrived at via different denoising trajectories — not
the same image at different polish levels.

The three values represent distinct compositional modes:

| Steps | Use |
|------|-----|
| 8 | Fast iteration. Lower fidelity composition. Useful for previewing prompt structure or testing seed exploration. |
| 20 | Working draft. Typical FLUX result quality. Good general-purpose default. |
| 50 | Final-look. Photoreal-leaning composition. Use when shipping a render. |

**Migration from Steps Quality (v1.4.3 and earlier):** the old node
returned BOOLEAN (True = 50 steps, False = 8 steps). The new node
returns INT (8, 20, or 50). Workflows wiring the old BOOLEAN into a
downstream conditional need to be updated to consume the INT directly.
This is a breaking change but a clean one — the integer value is what
you actually want to feed a sampler.

---

## v1.4.5 fixes — workflow metadata + thumbnail clipping

### SaveResult now embeds workflow metadata in saved PNGs

Through v1.4.4, `Studio5090SaveResult` saved PNGs without the prompt or
workflow text chunks that ComfyUI's native SaveImage embeds. The visible
symptom was that you couldn't drag a previously-saved image back onto
the ComfyUI canvas to restore the originating workflow — the toolkit's
output was a dead end for iterative refinement.

v1.4.5 fixes this. SaveResult now embeds two PNG text chunks matching
the native SaveImage exactly:

- **`prompt`** — the API-format prompt graph (used by ComfyUI headless
  reruns and the workflow-from-image tooling)
- **`workflow`** — the UI-format workflow JSON (used when you drag a
  saved image onto the canvas to restore the full node graph)

Plus any additional keys the front-end provides via `extra_pnginfo`,
forwarded unchanged for forward compatibility.

**Limitation:** images saved by v1.4.0 through v1.4.4 cannot be
recovered. There is no metadata in those PNGs to extract. v1.4.5
applies only to newly-saved images going forward.

**Verification ritual:** install v1.4.5, save a fresh image via
SaveResult, drag the resulting PNG back into ComfyUI — the originating
workflow should restore in full, identical to dragging a native
SaveImage output.

### Create PM source-image thumbnail clipping fixed

Through v1.4.3 and v1.4.4 the source-image preview thumbnail in the
Create PM appeared to be cut off at the bottom for portrait or square
source images. PANEL_PAD bumps in those versions didn't help because
the cropping wasn't happening at the panel boundary — it was happening
inside the thumbnail's own draw function, which used `Math.max` (COVER
sizing) to scale the image up to fill the wide thumb box, with the
overflow on the long axis getting clipped.

v1.4.5 switches the source-image thumbnail to `Math.min` (CONTAIN
sizing) so the whole image fits inside the box, with letterboxing on
the long axis when aspect ratios don't match. Character sheets (1:1)
now display in full instead of showing only the middle slice.

The Render PM first/last frame thumbnails still use COVER, which is
appropriate for frame previews where framing-match matters more than
seeing every pixel.

---

## v1.5.0 — HDR Render Queue + companion utilities

This release ships the locked-scope **HDR Render Queue** node (the
v1.5 headline) plus three smaller adds picked up from in-session
testing of v1.4.5: the **Still/Video Switch** boolean node, version
numbers in PM display names, and an auto-comma in the Qwen multiangle
prompt modifier.

### Studio5090 HDR Render Queue

A canvas node living in the LTX workflow tab. Queues one or more HDR
renders against a single project's `VIDEOS/` folder and runs them
sequentially, with crash recovery, per-job ProRes/EXR toggles, and
smart-match model resolution. The shipped template
(`templates/hdr_workflow.json`) is the LTX-2.3 IC-LoRA HDR Distilled
workflow with four ID-pinned nodes: LoadVideo (5106),
VHS_VideoCombine (5127), LTXVHDRDecodePostprocess (5126), RandomNoise
(4832).

**Per-job options:**

- **ProRes** (default on) — 12-bit ProRes HQ master to
  `VIDEOS/<scene>_HDR.mov`. The toolkit automatically deletes the
  silent twin that VHS_VideoCombine emits alongside the audio version,
  and renames the audio file to the clean target name. Result: one
  output file per job, no `-audio` suffix.
- **EXR sequence** (default off) — per-scene EXR frame sequence to
  `EXR/<scene>/`. The `EXR/` folder is added to the standard project
  structure in v1.5.0 and retrofitted onto existing projects at
  ComfyUI startup.

**Smart-match models.** The template references models via Windows-style
paths like `LTX2.3\ltx-2.3-22b-dev.safetensors`. Most users keep models
in a flat `models/checkpoints/` or `models/loras/`. At submit time the
queue resolves each model name through a three-tier search: (1) exact
match, (2) leaf-filename match anywhere in the appropriate folder, (3)
unique substring match. Resolved paths are written into the workflow
in place before submission, so the same template works across users
with different folder layouts without manual editing. Console logs
each smart-match rewrite for transparency.

**Crash recovery.** Queue state lives in a single global JSON file at
`STUDIO5090/.queue_state.json` with three sections: pending, running,
completed. The file is written atomically (write-then-rename) so a
crash mid-write doesn't corrupt it. On startup, if a `running` entry
is present, the widget surfaces it and offers to push it back to
pending head — recoverable, not lost.

**Architecture.** The Python `Studio5090HDRRenderQueue` node is a thin
shell. Almost all logic lives in `js/studio5090_hdr_queue_widget.js`
(canvas widget) and `studio5090_routes.py` (queue ops + workflow
submission to ComfyUI's `/prompt` endpoint). The widget polls
`/history/<prompt_id>` to detect job completion, runs cleanup, and
pulls the next job.

### Studio5090 Still/Video Switch

A pure boolean toggle node — "Still Image" (True, default) / "Video
Grab" (False). Wire its output into a was-ns Image Input Switch's
boolean selector to flip between a Render PM frame and a frame
extracted from a previous video via VHS LoadVideo. Used in pairs
typically: one for FF, one for LF, so you can seed a new clip from
any frame of a past render without rewiring the canvas.

### Version numbers in PM titles

The Render PM, Create PM, Save Result, and HDR Render Queue nodes now
display the toolkit version inline with their title — visible at a
glance which release is installed. Reduces ambiguity when switching
sessions or installing patches mid-project.

### Qwen Prompt Modifier auto-comma

The multiangle batch route previously joined the angle prompt and the
user's modifier with a single space. v1.5.0 inserts ", " between them,
and strips leading commas/whitespace from the user's modifier text so
typing a leading comma doesn't produce a duplicate. Both
`of the car on the road` and `, of the car on the road` produce the
same well-formed prompt now.

---

## v1.5.1 hotfix — HDR LoadVideo + CHARACTERS picker + Steps order

Three fixes shipped together over v1.5.0:

### HDR Render Queue: source-video staging into input/

The shipped v1.5.0 HDR queue submitted jobs to ComfyUI's `/prompt`
endpoint with just the bare source-video filename. ComfyUI's core
`LoadVideo` (comfy-core 0.10.0) validates the `file` widget against
the **input directory**, not against any absolute path on disk. So
videos sitting in `output/STUDIO5090/<project>/VIDEOS/` were rejected
with `Invalid video file: <filename>` and the prompt never queued.

v1.5.1 mirrors the working pattern from `queue_qwen_batch`: before
submission, the source video is `shutil.copy2`'d into ComfyUI's
`input/` directory. The copy is idempotent (skipped if a same-size
file is already there). After the job finishes — successfully or with
an error — the staged copy is removed from `input/` so the directory
doesn't accumulate large video files. Failures leave the original
output untouched for inspection.

Internal job state grows one transient field (`_input_copy`, the path
to the staged file) which is stripped before the job moves into the
completed history.

### Render PM frame pickers now include CHARACTERS/

The first-frame and last-frame pickers in the Render PM (plus the
Create PM source-image picker) walked `CREATE`, `EDITS`, and every
`MULTIANGLE/<subject>/` folder but skipped `CHARACTERS/`. Character
sheets had to be copied into `CREATE/` to be selectable, defeating
the v1.4.2 separation that gave character sheets their own folder.

v1.5.1 adds `CHARACTERS` to:

- `_list_all_frame_images` (the function that builds the tagged file
  list returned by `/studio5090/all_frame_images`)
- the `resolve_image` regex inside `Studio5090RenderProjectManager.execute`
- the `/studio5090/thumbnail` route's folder dispatch
- the `/studio5090/resolve_image_path` route's regex + dispatch
- the Render PM widget's color map (CHARACTERS = amber `#a16207`)
- the picker title strings
- the lead ordering in `sortByColorThenName` so CHARACTERS clusters
  after CREATE/EDITS, before any MULTIANGLE subject

Character sheets now appear in pickers, color-code distinctly, and
resolve correctly when wired into the FF/LF outputs.

### Studio5090 Steps dropdown order

The source on `studio5090_utils.py` line 254 declared the COMBO list
as `["20", "8", "50"]`. The v1.4.4 changelog reported a hot-patch
to ascending order, but the change never made it into the source
tree — every shipped zip from v1.4.4 through v1.5.0 carried the
wrong order. v1.5.1 fixes the source: `["8", "20", "50"]` with
default `"20"` (unchanged — that's still the typical working-draft
step count for FLUX iteration).

After installing v1.5.1, the Studio5090 Steps dropdown reads
8 / 20 / 50 in the order one would expect. If the old order persists
after install, delete `comfyui.db` and restart — ComfyUI caches
COMBO orderings and will otherwise show the stale list.

---

## v1.5.2 hotfix — HDR output polish

Five small but meaningful fixes for the HDR queue based on the first
real production run:

### HDR output now writes to VIDEOS/HDR/

The shipped v1.5.0/v1.5.1 wrote ProRes masters into `VIDEOS/` next
to SDR LTX renders. Keeping HDR grades clustered separately makes
finishing work cleaner — `VIDEOS/HDR/<scene>_HDR.mov` for graded
masters, `VIDEOS/<scene>.mov` for SDR raws. The new folder is
created automatically on project creation and retrofitted onto
existing projects at ComfyUI startup. The `VHS_VideoCombine`
filename_prefix and the post-render cleanup function were both
updated to use the subfolder; mismatch between the two would have
left the audio-twin in place.

### Trailing-underscore cleanup in filenames

Source files named like `SCENE1_00010_.mp4` (the trailing underscore
comes from ComfyUI's auto-increment counter) used to produce HDR
masters named `SCENE1_00010__HDR_00001.mov` — double underscore,
mildly ugly. `_mutate_hdr_workflow_for_job` and the matching cleanup
function now both `rstrip("_")` the scene stem before composing
output paths. Result: `SCENE1_00010_HDR_00001.mov`. Both sides of
the operation strip the same way so they stay in sync.

### Companion workflow PNGs cleaned up

VHS_VideoCombine writes a `<prefix>_NNNNN.png` alongside every video
it produces, containing the workflow JSON as PNG metadata. Useful
for SDR workflows where a user might want to recover the source
graph, but for API-driven HDR renders the PNG is just noise. The
cleanup function now also deletes any matching `<scene>_HDR_*.png`
files in the output directory once the render completes. Reports
the count of PNGs removed alongside the audio-twin count.

### Auto-clear completed jobs on queue drain

The completed-jobs list used to persist across sessions. Opening a
fresh HDR queue node would surface old completed entries, which
also confused the progress-bar fraction math (a 1/3 reading when
starting with 2 pending jobs, because 1 completed from a previous
batch was still counted). Now, when `job_complete` lands and the
queue has no more pending work, the completed list is automatically
cleared before saving state. The user gets a clean slate every
session. (Per your spec: "strict auto clear when queue is done
and empty.")

### Manual Clear Queue button

Secondary grey button that appears in the QUEUE section whenever
there's any pending or completed content. Confirms with the user
(it destroys queued work, not just history), then nukes both lists.
Running jobs are preserved — for those, use the Cancel button.

The widget also now resizes its outer frame dynamically as queue
contents grow and shrink, so the new button (and the existing job
rows) don't get clipped by stale outer bounds.

---

## v1.5.3 hotfix — Pause/Cancel feedback + on-time cleanup

Three coordinated fixes for the HDR queue's pause/cancel flow:

### Pause and Cancel produce persistent status messages

Through v1.5.2, pressing Pause or Cancel set a status message but it
was overwritten ~1.5 seconds later when the poll loop wrote the next
"Running: poll N" update. The user got no feedback that their click
had been received.

v1.5.3 separates two concepts: `ui.running` (queue loop is actively
pulling new jobs) from `ui.windingDown` (user requested stop). The
poll loop checks `windingDown` before writing its "Running: poll N"
update — when winding down, the user's pause/cancel message stays
visible until the current job completes.

Messages now match the user's spec exactly:

- **Pause:** "HDR paused as soon as the current job finishes. Press
  Run Queue to begin again."
- **Cancel:** "HDR queue process will cancel after the current job
  finishes. To kill a job, use the ComfyUI active queue to kill the
  process."

The Pause and Cancel buttons also grey themselves out while winding
down so the user can't re-click them. Run Queue stays disabled until
the loop actually exits.

### VHS cleanup runs at the natural moment

Through v1.5.2, the inner poll loop terminated as soon as
`ui.running` flipped to false (pause/cancel). That left the job
still running in ComfyUI's background — but our queue widget walked
away. `job_complete` (which runs the VHS audio-twin and companion
PNG cleanup) wasn't called until the user pressed Run Queue again
and the loop re-polled the job.

v1.5.3 fixes this by removing `ui.running` from the inner poll's
loop condition. The poll continues until the job ACTUALLY finishes
in ComfyUI, at which point `job_complete` fires and cleanup runs.
Only after that does the outer loop check `windingDown` and exit.
Result: cleanup happens at the right time, immediately when the
HDR render finishes — not deferred until next Run Queue press.

### Cancel no longer pushes the running job back to pending mid-flight

Through v1.5.2, Cancel called `recover_running` with `force: true`,
which moved the actively-running job back to pending head. ComfyUI
kept running the original job in the background while our queue
state recorded it as pending. If the user later resumed, the job
would be **submitted a second time** — duplicate render, wasted GPU
time.

v1.5.3 splits Cancel into two paths based on whether the loop is
running:

- **Loop running** → soft cancel via `windingDown`. The job finishes
  naturally, cleanup runs, queue exits. Pending intact for later
  inspection or Clear Queue.
- **Loop NOT running, but server has stale running marker** (e.g.
  ComfyUI restarted mid-job, leaving the marker behind) → the old
  stale-state recovery path triggers, pushing the marker back to
  pending so the user can resume cleanly.

The bifurcation is internal; the user sees one Cancel button with
the correct behavior in each context.

---

## v1.5.4 hotfix — Image picker UX overhaul

Two coordinated improvements to the image picker (which appears whenever
the user clicks an FF / LF / source-image picker in the Render PM or
Create PM):

### Collapsible sections by source folder

The picker previously displayed all images in a flat grid, color-coded
by subject but without structural organization. For projects with many
images across multiple subjects, this became unwieldy — too much
scrolling, no way to scope what you were looking at.

The picker is now organized into collapsible sections. Each source
folder gets its own section with a prominent header:

- **CREATE** — base generated images
- **EDITS** — modified images
- **CHARACTERS** — character sheets (Render PM only)
- **MULTIANGLE:<subject>** — one section per multiangle subject,
  alphabetized

Section headers show the folder name in larger bold text alongside a
pill displaying the image count. A colored left border and arrow
indicate the section's color identity and collapse state. Click the
header to collapse or expand that section's thumbnails. Empty sections
are hidden entirely. All sections open expanded by default each time
the picker opens.

The section organization mirrors the toolkit's underlying folder
discipline, making the picker feel like a real asset browser rather
than a flat dump.

### Floating filename label on hover

Filename labels under each thumbnail were truncated at 20 characters,
which collided with the Studio5090 file-naming convention. Two saved
files from the same subject with similar names became visually
indistinguishable.

Hovering any thumbnail now displays a floating label with the full
untruncated filename. The label:

- Appears immediately on `mouseenter` (no browser tooltip delay)
- Follows the cursor with a small offset so it never sits directly
  under the pointer
- Renders with the picker's dark teal color palette and a monospace
  font for filename readability
- Persists for as long as the cursor stays in the thumbnail
- Clears automatically when the picker closes

Both the Render PM and Create PM share the same picker function, so
both nodes get this behavior simultaneously.

---

## v1.5.5 hotfix — Picker default-collapsed + Expand All toggle

Two small UX refinements to the picker introduced in v1.5.4:

### Sections default to collapsed

In v1.5.4 the picker opened with every section already expanded. For
large projects with many subjects and many images per section, this
meant the picker still showed a wall of thumbnails on open — defeating
some of the purpose of sectioning.

The picker now opens with **every section collapsed by default**. Each
section header is fully readable and clickable; the user clicks into
the section they want. Section state does not persist between picker
opens; each invocation starts fresh with everything collapsed.

### Expand All / Collapse All toggle

A new button sits to the left of the Close button in the picker
header. Click once to expand every section; click again to collapse
every section. The button label updates to reflect the next action
(`▸ Expand All` or `▾ Collapse All`).

The button inspects the actual state of every section on each click,
so manual per-section toggles do not desync the master button. If
the user has manually opened two sections and clicks the master
button, it will expand the rest. If the user has manually closed
everything after clicking Expand All, the next click will correctly
expand again.

Both Render PM and Create PM share these refinements.

---

## v1.5.6 hotfix — Stuck floating label

Bug fix for the floating filename label introduced in v1.5.4.

### Problem

When closing the picker by clicking on a thumbnail (selecting an image),
the floating filename label could remain stuck on screen, overlaying
the rest of the ComfyUI workspace. The label was orphaned in the DOM
and not removed.

### Cause

v1.5.4 added a `cleanup()` wrapper that removed the floating label
before calling the original cleanup function. The wrapper was attached
only to the Close button and the overlay click handler. But clicking
a thumbnail to select an image calls the original `cleanup` directly
(via `cell.onclick`), bypassing the wrapper. The label survived.

### Fix

The `cleanup()` function now removes the floating label as part of its
core behavior. Every close path (Close button, overlay click, thumbnail
selection) calls the same `cleanup()` and therefore clears the label.
The defensive `getElementById` removal at the top of `showThumbPicker`
remains, catching any (rare) case of a stale label from a prior session.

Same fix applied to both Render PM and Create PM widgets.

---

## v1.5.7 hotfix — Lazy folders, empty-folder cleanup, Generate Single

Three coordinated changes that close out two long-running workflow
issues and add a feature requested for everyday production.

### Lazy subject folders

Prior versions created MULTIANGLE/<subject>/ folders eagerly: the
moment a user clicked "+ New Subject" or queued a multiangle batch,
the folder was created on disk. If the user later abandoned the
subject (changed their mind, the batch failed, the model couldn't
load, they hit Cancel), an empty folder was left behind. Over weeks
of work, dozens of empty subject folders accumulated and made the
project tree noisy.

In v1.5.7, subject folders are no longer pre-created. The
`create_subject` route now validates the name and registers it as
"pending" in an in-memory set so the dropdown still shows it during
the session. Folders only appear on disk when ComfyUI's Save Image
node actually writes a file into them. If the user closes ComfyUI
before generating anything, the pending name dies with the process —
no disk artifact.

The `queue_qwen_batch` route's eager `os.makedirs(output_root)` was
also removed for the same reason. ComfyUI's Save Image creates
parent directories at write time, so even a batch that succeeds
partway through (some images saved, then failure) leaves only the
folders with content in them.

### One-time empty folder cleanup

To handle the cruft already on disk from older versions, a cleanup
pass runs once at toolkit load. It scans every project's MULTIANGLE/
directory and removes any subject folder that contains no image
files (at any depth). The pass is safe to run on every load — it
only removes truly empty folders, and the SINGLES system folder is
explicitly preserved regardless of contents. Removed folders are
logged to the ComfyUI console.

### Generate Single Angle

Both Create PM and Render PM now expose an angle dropdown plus a
"Generate Single Angle" button alongside the existing 17-pass
"Generate All Angles" button. The user picks one of the 17 Qwen
multiangle angles from the dropdown, picks a source image, and
clicks Generate Single — only that one angle renders.

Output naming follows option 2 of the design discussion:

- If the source is from `MULTIANGLE/<subject>/` (i.e., the user is
  branching off an existing multiangle to grab one more angle), the
  output lives next to its multiangle family at
  `MULTIANGLE/<subject>/<source_stem>_oneoff_<angle>.png`.
- Otherwise (source from CREATE / EDITS / CHARACTERS), the output
  goes to `MULTIANGLE/SINGLES/<source_stem>_<angle>.png` — a shared
  bin for one-offs that don't belong to a multiangle family yet.

The existing "Generate All Angles (17)" button is unchanged and
still presents its confirmation dialog. Generate Single does not
warn — it's one render, not a 17-pass commitment.

A new backend route `/studio5090/queue_qwen_single` handles the
single-angle workflow submission with the option-2 naming logic
baked in. A new helper `showAnglePicker()` provides the modal for
angle selection (mirrors the visual style of the thumbnail picker
but simplified for a flat 17-item list).

---

## v1.5.8 hotfix — Multiangle panel layout

The v1.5.7 angle dropdown and Generate Single Angle button were added
without expanding the multiangle panel's reserved vertical space. The
result: in the Render PM, the new controls overlapped the FRAME MODE
SELECTION header below; in the Create PM, the source-image thumb box
extended past the node's panel border.

Fix: expanded the `multianglePanel` entry in each PM's HEIGHTS table
to include the new ROW_H + BTN_H worth of space. Both PMs now reserve
correct vertical room and the next section sits below cleanly.

Behavioral changes: none. This is a pure layout fix.

---

## v1.6.0 — Workflow save/load + product templates

The headline feature for the v1.0 launch trajectory. Workflows
become first-class project artifacts, stored inside the project
folder alongside everything else the project owns. The toolkit
ships with canonical CREATE and RENDER workflow templates that
auto-populate every new project as starting points.

### WORKFLOWS section in both PMs

A new section sits at the top of the Render PM and Create PM,
above SELECT PROJECT. Two side-by-side buttons:

- **💾 Save Workflow…** — prompts for a destination project
  (default = current project) and a base filename. The current
  ComfyUI graph is captured via `app.graphToPrompt()` and written
  to `STUDIO5090/<project>/workflows/<base>_v<N>.json`. The `_v<N>`
  suffix auto-increments based on what's already in the folder.
  Re-saving a workflow loaded as `..._v3.json` correctly produces
  `..._v4.json` rather than `..._v3_v1.json` — the version suffix
  is stripped before incrementing.

- **📂 Open Workflow…** — opens a picker modal organized into
  collapsible sections. The TEMPLATES section appears at the top
  (warm-gold colored, listing the canonical product templates
  shipped with the toolkit), followed by one section per project
  containing that project's saved workflows. Click a workflow
  filename to load. A confirmation dialog warns that loading
  replaces the current graph.

### Per-project workflows folder

Each project now has a `workflows/` subfolder under
`STUDIO5090/<project>/`. Created automatically:

- On `create_project` — alongside the other standard project
  folders (CREATE, EDITS, CHARACTERS, MULTIANGLE, etc.)
- On toolkit load for existing projects that pre-date v1.6.0
  (silent retrofit pass, same pattern as previous version migrations)

### Product workflow templates

The toolkit ships with canonical starting workflows in
`templates/product_workflows/` inside the installed custom node.
Filenames follow the convention `<TYPE>_TEMPLATE.json` — e.g.
`CREATE_TEMPLATE.json`, `RENDER_TEMPLATE.json`. These are
read-only product assets.

When a new project is created, every template is auto-copied into
the project's `workflows/` folder, renamed with the project prefix
and `_v1` suffix:

- `CREATE_TEMPLATE.json` → `<project>_CREATE_v1.json`
- `RENDER_TEMPLATE.json` → `<project>_RENDER_v1.json`

Existing projects whose `workflows/` folder is empty also receive
the templates at startup, giving them the same first-run experience
as newly-created projects. Projects with existing workflow content
are left alone.

Templates are also visible directly through the Open Workflow
picker (TEMPLATES section), so users can load a template at any
time even outside a project context.

### Backend routes

Three new routes:

- `POST /studio5090/save_workflow` — writes the workflow JSON,
  resolves the auto-incremented filename, returns the resolved name
- `GET /studio5090/list_workflows` — returns the full library
  (`{templates: [...], projects: {name: [...]}}`)
- `GET /studio5090/load_workflow?source=template|project&project=X&filename=Y`
  — returns the workflow JSON for loading via `app.loadGraphData()`

### v1.7.0 will add CASTING

When the CASTING node ships (v1.7.0), a corresponding
`CASTING_TEMPLATE.json` will be added to `templates/product_workflows/`
and will start auto-copying into newly-created projects.

---

## v1.6.1 hotfix — Desktop app compatibility + v1.6.0 fixes

Five fixes addressing issues found right after the v1.6.0 ship. The
most important is desktop app compatibility, which we did not catch
during browser-based testing.

### Desktop app compatibility (the big one)

The native ComfyUI desktop app (Electron-based) disables
`window.prompt()` and `window.confirm()` for security reasons. Every
text-entry and confirmation dialog in the toolkit silently did
nothing on the desktop app — Create Project, Create Subject,
prompt modifier entry, scene name entry, save workflow, all of it.
The 3070Ti install test caught this when "Create Project" did
nothing on click.

Fixed by defining two custom DOM-based helpers in every widget file:

- `showTextPrompt(title, defaultValue)` — returns Promise resolving
  to entered string or null if cancelled (matches window.prompt's
  return contract)
- `showConfirm(message)` — returns Promise resolving to true or
  false (matches window.confirm's return contract)

Styled to match the toolkit's teal-on-dark aesthetic. Works
identically in browser and desktop app. Keyboard shortcuts
preserved (Enter to confirm, Escape to cancel).

All ~15 call sites across three widget files now use these
helpers. The dispatch handlers wrap the async call in a
fire-and-forget IIFE so the sync click handler can return true
immediately while the modal handles its own lifecycle.

### Root folder auto-create

ComfyUI's `output/STUDIO5090/` is now created automatically at
toolkit load. First-time users no longer see an empty project
list and an apparently-broken Render PM. One-line fix in
`__init__.py`.

### No more retrofit template auto-copy

v1.6.0's retrofit pass auto-copied product workflow templates
into every existing project's empty `workflows/` folder. When the
user dropped fresh template JSONs into the toolkit and reloaded,
every existing project suddenly had template copies they didn't
ask for — the toolkit modifying user data without consent.

Template auto-copy now only happens at `create_project` time,
where it's appropriate. Existing projects can load templates from
the Open Workflow picker's TEMPLATES section at any time.

### Workflow picker default-collapsed + Expand/Collapse toggle

Same UX pattern as the image picker (introduced in v1.5.5). All
sections start collapsed; an "Expand All / Collapse All" toggle
button sits in the picker's header next to Close. Cleaner first
impression and lets the user navigate large workflow libraries
without scrolling through every section's contents.

### No more replace-graph warning

The v1.6.0 confirmation dialog that fired before loading a
workflow ("This will REPLACE your current graph") was inaccurate.
ComfyUI's `loadGraphData` opens the workflow in a new tab rather
than replacing the current graph. The warning was just friction.
Removed.

### Known issues still open

- Loading a workflow opens a new tab named "Unsaved Workflow"
  rather than the workflow's filename. Saving via the toolkit
  doesn't update the tab name either. Both require ComfyUI API
  research; deferred to v1.6.2 or later.

---

## v1.7.0 — CASTING + Render PM audio path + utility node

The audio pipeline gets its own project manager and the toolkit picks up
infrastructure to make casting work cleanly end-to-end.

### CASTING Project Manager (new node)

`Studio5090CastingProjectManager` lives in `Studio5090/ProjectManager`
alongside the Render PM and Create PM. Same family, scoped to audio.

Three widgets in the canvas UI:

- **project** — dropdown of existing STUDIO5090 projects
- **subject** — text input or dropdown (subjects are shared with the
  multiangle subject list per project)
- **accent** — dropdown of accents parsed from the active accents file

Five outputs:

- **project** (STRING) — pass-through
- **subject** (STRING) — pass-through
- **audio_output_path** (STRING) — `STUDIO5090/<project>/AUDIO/<subject>_CASTING`
  as a stem string for the Save Audio (FLAC) node
- **accent_trigger** (STRING) — bare accent name (no `===` delimiters);
  required as a prefix to the user's input text for the accent LLMs to
  actually apply the accent
- **accent_body** (STRING) — full body block for the chosen accent;
  wires into prompt-manager's accent LLM input

The PM plumbing — WORKFLOWS save/open at the top, SELECT PROJECT,
CREATE PROJECT, subject controls — mirrors the Render PM and Create
PM. No image picker (CASTING doesn't operate on images).

### Accent file

Shipped at `templates/accents.txt` inside the toolkit. 19 accents
total: 14 from the previous accent LLM work, plus 5 new ones drafted
for v1.7.0:

- **IRISH** — Hiberno-English, Dublin/rural lilting cadence
- **AUSTRALIAN** — broad casual Australian English with diminutives
- **TEXAN** — West Texas / Hill Country drawl, distinct from SOUTHERN
- **INDIAN** — Indian English with continuous tense and formal register
- **NEWS ANCHOR** — neutral General American broadcast voice

Format: `=== NAME ===` delimited blocks. The body between delimiters is
the LLM prompt that prompt-manager feeds to the accent translator.

**User override:** if a user creates `STUDIO5090/accents.txt`, that
file is read instead of the shipped default. This lets users add
custom accents without their work being overwritten when they install
a new toolkit version. Order of precedence: user copy first, shipped
default as fallback.

### Render PM addition

A sixth output: `audio_output_path` (STRING). Format:
`STUDIO5090/<project>/AUDIO/<scene_name>` — same `scene_name` (video_name
widget) used for the existing `video_path` and `video_path_hd` outputs,
so audio and video share a naming convention. Wires into Save Audio
(FLAC) for scene-paired narration tracks.

### New utility node: Studio5090Upscale2xSteps

Pure boolean emitter in `Studio5090/Utilities`. Two states with labels
"3-steps" (ON/true, default) and "8-steps" (OFF/false). Output flows
into the user's downstream switch logic for selecting between two
pre-built manual sigma schedules during 2x upscale testing.

Same architectural pattern as the existing AudioPadSwitch — one
widget, one boolean output. A small node, but the kind of thing the
user wires into a workflow once and saves them rewiring the canvas
every time they want to A/B test sigma schedules.

### Backend

One new route: `GET /studio5090/accents` returns the parsed accent
list (name + body) for the CASTING node's dropdown.

---

*Last updated for Studio5090 Utils v1.7.0.*
