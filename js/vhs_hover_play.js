/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Alan Rosenfeld
 * Studio5090 - see LICENSE at the repository root for full terms.
 * Provided "AS IS", without warranty of any kind.
 */

/**
 * Studio5090 - preview fixes for VideoHelperSuite (VHS) nodes
 * Designed by Alan Rosenfeld + Claude (Anthropic), 2026.
 *
 * 1. HOVER TO PLAY
 *    Stock VHS: every preview autoplays muted in a loop, and hovering only
 *    un-mutes it.  With this file: a preview loads, shows its first frame
 *    and waits.
 *      mouse over the preview  -> plays, with sound
 *      mouse leaves            -> pauses where it is, silent
 *      mouse back over         -> carries on from the same frame
 *    Right-click > Pause preview / Resume preview still works as before.
 *
 *    How: VHS switches autoplay on each time it loads a new file.  The
 *    browser fires "loadeddata" once the first frame of that file is
 *    decoded.  Calling pause() at that moment leaves the first frame on
 *    screen and, by the HTML media rules, cancels autoplay for that file.
 *
 * 2. ALWAYS REFRESH AFTER A RENDER
 *    VHS skips the refresh when a finished render reports exactly the same
 *    file name as the preview it already holds.  That happens on the first
 *    render after every ComfyUI restart for previews with save_output off:
 *    the temp folder is wiped at startup, the counter goes back to 00001,
 *    and the workflow still remembers "..._00001" from the last session.
 *    The new file is on disk but the node stays blank until the workflow
 *    is reloaded (switching workflow tabs does that).
 *
 *    How: when a render finishes with an unchanged file name, ask VHS to
 *    reload its source anyway.  VHS adds a fresh timestamp to the request,
 *    so the browser fetches the new file.
 *
 * Nothing in VHS is modified, so a VHS update does not undo this.
 */

import { app } from "../../scripts/app.js";

const VHS_PREVIEW_NODES = new Set([
    "VHS_VideoCombine",
    "VHS_LoadVideo",
    "VHS_LoadVideoPath",
    "VHS_LoadVideoFFmpeg",
    "VHS_LoadVideoFFmpegPath",
]);

function patchPreview(node) {
    const widget = node.widgets?.find((w) => w.name === "videopreview");
    const video = widget?.videoEl;
    if (!video) return false;
    if (video._studio5090HoverPlay) return true;
    video._studio5090HoverPlay = true;

    // ---- 1. hover to play -------------------------------------------------
    let hovering = false;
    const pausedByUser = () => widget.value?.paused === true;

    // First frame of a newly loaded file is ready: hold on it unless the
    // mouse is already over the preview.
    video.addEventListener("loadeddata", () => {
        if (!hovering) {
            video.pause();
            video.muted = true;
        }
    });

    video.onmouseenter = () => {
        hovering = true;
        if (pausedByUser()) return;
        video.muted = widget.value?.muted === true;
        video.play().catch(() => {
            // The browser refuses sound until the page has been clicked once.
            // Fall back to silent playback rather than doing nothing.
            video.muted = true;
            video.play().catch(() => {});
        });
    };

    video.onmouseleave = () => {
        hovering = false;
        video.pause();
        video.muted = true;
    };

    // A file may already be loaded (workflow reopened with a saved preview).
    if (video.readyState >= 2) {
        video.pause();
        video.muted = true;
    }

    // ---- 2. always refresh after a render ---------------------------------
    const vhsOnExecuted = node.onExecuted;
    node.onExecuted = function (message) {
        const incoming = message?.gifs?.[0];
        const current = widget.value?.params;
        const sameAsBefore =
            !!incoming &&
            !!current &&
            !Object.entries(incoming).some(([key, value]) => current[key] !== value);
        const result = vhsOnExecuted?.apply(this, arguments);
        if (sameAsBefore && typeof widget.updateSource === "function") {
            widget.updateSource();
        }
        return result;
    };

    return true;
}

app.registerExtension({
    name: "Studio5090.VHSHoverPlay",
    nodeCreated(node) {
        if (!VHS_PREVIEW_NODES.has(node.comfyClass)) return;
        // VHS builds its preview widget in its own node-created callback,
        // which can run after this one.  Try now, then retry briefly.
        let tries = 0;
        const attempt = () => {
            if (patchPreview(node)) return;
            if (++tries < 50) setTimeout(attempt, 100);
        };
        attempt();
    },
});

// v1.7.46: the Settings Stamp can rename X_00001-audio.mp4 to X_00001.mp4.
// When it does, point any Video Combine preview that shows the old name at
// the new one, so the preview keeps playing.
app.registerExtension({
    name: "Studio5090.StampRenamePreview",
    async setup() {
        const api = app.api || window.comfyAPI?.api?.api;
        if (!api?.addEventListener) return;
        api.addEventListener("executed", (ev) => {
            const list = ev.detail?.output?.studio5090_renamed;
            if (!Array.isArray(list) || !list.length) return;
            const byOld = new Map(list.map((r) => [r.old, r.new]));
            const graphs = [app.graph, ...(app.graph?.subgraphs?.values?.() || [])];
            for (const g of graphs) {
                for (const n of (g?._nodes || g?.nodes || [])) {
                    if (!VHS_PREVIEW_NODES.has(n.comfyClass || n.type)) continue;
                    const w = n.widgets?.find((x) => x.name === "videopreview");
                    const params = w?.value?.params;
                    const next = params && byOld.get(params.filename);
                    if (!next) continue;
                    params.filename = next;
                    if (typeof w.updateSource === "function") w.updateSource();
                    console.log(`[Studio5090] preview on node ${n.id} now shows ${next}`);
                }
            }
        });
    },
});
