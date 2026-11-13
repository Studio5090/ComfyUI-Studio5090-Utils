/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Alan Rosenfeld
 * Studio5090 - see LICENSE at the repository root for full terms.
 * Provided "AS IS", without warranty of any kind.
 */

/**
 * Studio5090 Frame Grab - v1.7.42
 * Designed by Alan Rosenfeld + Claude (Anthropic), 2026.
 *
 * Choose Video opens the Windows file dialog.  A file that is already in
 * ComfyUI's output or input folder is used where it is; anything else is
 * copied into the input folder in small pieces (no upload size limit).  The
 * scrubber shows every frame; the node outputs the frame it is parked on.
 *
 * v1.7.42: Snapshot saves the parked frame as a clean 16-bit PNG (with the
 * video's workflow inside) to <project>/GRAB, plus a _BURN copy when any Burn
 * box is ticked, plus the workflow .json in <project>/workflows if asked.
 *
 * v1.7.46:
 *   Save to   project dropdown for Snapshot and New Angle, set to the video's
 *             project each time a video is loaded.
 *   Copy      puts the parked frame (full size PNG) on the clipboard, ready to
 *             paste into GIMP or any other program.  Browsers only allow this
 *             on localhost or https; elsewhere the button says so.
 *   All       (v1.7.49) all 17 angles at once, after the same warning popup the
 *             PMs show.  Orange like the PMs' Generate All; single is blue.
 *   Angle     sends the parked frame to the QWEN multi-angle job (the same one
 *             as the Create PM's Generate Single) and saves the result to
 *             <project>/MULTIANGLE/SINGLES/<short name>_grab_<frame>_<angle>.
 */

import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

const NODE = "Studio5090LoadVideo";
const PANEL_H = 616;

// v1.7.49: the same warning popup the PMs show before Generate All Angles.
function grabConfirm(message) {
  return new Promise((resolve) => {
    document.getElementById("s5090-grab-confirm")?.remove();
    document.getElementById("s5090-grab-confirm-overlay")?.remove();
    const overlay = el("div", { position: "fixed", inset: "0", background: "rgba(0,0,0,0.55)", zIndex: "99998" });
    overlay.id = "s5090-grab-confirm-overlay";
    const panel = el("div", {
      position: "fixed", top: "50%", left: "50%", transform: "translate(-50%,-50%)",
      background: "#1a2626", border: "2px solid #0d9488", borderRadius: "8px", zIndex: "99999",
      width: "min(480px, 90vw)", boxShadow: "0 8px 32px rgba(0,0,0,0.8)",
      display: "flex", flexDirection: "column",
    });
    panel.id = "s5090-grab-confirm";
    const body = el("div", { padding: "20px 20px 16px", color: "#e0f4f4", fontSize: "13px", lineHeight: "1.5", whiteSpace: "pre-line" }, message);
    const footer = el("div", {
      display: "flex", justifyContent: "flex-end", gap: "8px", padding: "10px 16px",
      borderTop: "1px solid #0d9488", background: "#111e1e", borderRadius: "0 0 6px 6px",
    });
    const cancel = document.createElement("button");
    cancel.textContent = "Cancel";
    cancel.style.cssText = "background:#2a2a2a; color:#cccccc; border:1px solid #555; border-radius:4px; cursor:pointer; padding:6px 16px; font-size:12px; font-weight:bold;";
    const ok = document.createElement("button");
    ok.textContent = "OK";
    ok.style.cssText = "background:#0d9488; color:#fff; border:none; border-radius:4px; cursor:pointer; padding:6px 20px; font-size:12px; font-weight:bold;";
    footer.append(cancel, ok);
    panel.append(body, footer);
    let done = false;
    const finish = (v) => { if (done) return; done = true; panel.remove(); overlay.remove(); resolve(v); };
    cancel.onclick = () => finish(false);
    ok.onclick = () => finish(true);
    overlay.onclick = () => finish(false);
    panel.addEventListener("click", (e) => e.stopPropagation());
    document.body.append(overlay, panel);
    setTimeout(() => ok.focus(), 0);
  });
}
const GRAB_DEFAULTS = { style: false, accent: false, settings: false, label_on: false, label: "", json: false };

function el(tag, style = {}, text) {
  const e = document.createElement(tag);
  Object.assign(e.style, style);
  if (text !== undefined) e.textContent = text;
  return e;
}

function btn(label, title) {
  const b = el("button", {
    background: "#2b2b2b", color: "#ddd", border: "1px solid #555", borderRadius: "4px",
    padding: "3px 8px", cursor: "pointer", font: "12px sans-serif", flex: "0 0 auto",
  }, label);
  if (title) b.title = title;
  b.addEventListener("pointerdown", (e) => e.stopPropagation());
  return b;
}

function timecode(i, fps) {
  const f = Math.max(1, Math.round(fps || 24));
  const fr = i % f, s = Math.floor(i / f);
  const p = (n) => String(n).padStart(2, "0");
  return `${p(Math.floor(s / 3600))}:${p(Math.floor(s / 60) % 60)}:${p(s % 60)}:${p(fr)}`;
}

// ---------------------------------------------------------------- node UI

function setup(node) {
  const wVideo = node.widgets.find((w) => w.name === "video");
  const wFrame = node.widgets.find((w) => w.name === "frame");
  if (!wVideo || !wFrame) return;
  wVideo.computeSize = () => [0, -4];
  wVideo.hidden = true;

  const root = el("div", {
    display: "flex", flexDirection: "column", gap: "6px", width: "100%", height: "100%",
    boxSizing: "border-box", padding: "4px", font: "12px sans-serif", color: "#ccc",
  });
  const top = el("div", { display: "flex", gap: "6px", alignItems: "center" });
  const choose = btn("Choose Video", "Opens the Windows file dialog");
  choose.style.background = "#2f4f2f";
  const fname = el("div", { flex: "1 1 auto", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "#eee" }, "No video chosen");
  const fileIn = el("input", { display: "none" });
  fileIn.type = "file";
  fileIn.accept = "video/*,.mov,.mp4,.mkv,.webm,.m4v";
  top.append(choose, fname, fileIn);

  const view = el("div", {
    flex: "1 1 auto", minHeight: "120px", background: "#000", borderRadius: "4px",
    display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", position: "relative",
  });
  const img = el("img", { maxWidth: "100%", maxHeight: "100%", objectFit: "contain", display: "none" });
  const msg = el("div", { color: "#888", padding: "8px", textAlign: "center" }, "Press Choose Video");
  view.append(img, msg);

  const slider = el("input", { width: "100%", margin: "0" });
  slider.type = "range"; slider.min = "0"; slider.max = "0"; slider.value = "0"; slider.disabled = true;
  slider.addEventListener("pointerdown", (e) => e.stopPropagation());

  const ctl = el("div", { display: "flex", gap: "4px", alignItems: "center" });
  const bFirst = btn("|◀", "First frame");
  const bBack = btn("◀", "Back one frame");
  const bNext = btn("▶", "Forward one frame");
  const bLast = btn("▶|", "Last frame");
  const info = el("div", { flex: "1 1 auto", textAlign: "right", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }, "");
  ctl.append(bFirst, bBack, bNext, bLast, info);

  // ---- v1.7.42: Snapshot panel ------------------------------------------
  const grab = el("div", { display: "flex", flexDirection: "column", gap: "4px",
    borderTop: "1px solid #444", paddingTop: "6px" });
  const row = () => el("div", { display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" });
  const tag = (t) => el("div", { width: "44px", flex: "0 0 auto", color: "#999", fontWeight: "bold" }, t);
  const box = (text) => {
    const lab = el("label", { display: "flex", gap: "4px", alignItems: "center", cursor: "pointer", userSelect: "none" });
    const cb = el("input"); cb.type = "checkbox";
    cb.addEventListener("pointerdown", (e) => e.stopPropagation());
    lab.addEventListener("pointerdown", (e) => e.stopPropagation());
    const span = el("span", {}, text);
    lab.append(cb, span);
    return { lab, cb, span };
  };
  const cStyle = box("Render Style"), cAccent = box("Accent"), cSettings = box("Settings");
  const cLabel = box("Label"), cJson = box("Save .json");
  const labelIn = el("input", { flex: "1 1 auto", minWidth: "80px", background: "#1e1e1e", color: "#eee",
    border: "1px solid #555", borderRadius: "3px", padding: "2px 6px", font: "12px sans-serif" });
  labelIn.type = "text"; labelIn.placeholder = "label text";
  for (const ev of ["pointerdown", "keydown", "keyup", "keypress"]) labelIn.addEventListener(ev, (e) => e.stopPropagation());
  const snap = btn("Snapshot", "Save this frame as a 16-bit PNG in the project's GRAB folder");
  snap.style.background = "#3f5159"; snap.style.color = "#fff"; snap.style.fontWeight = "bold";
  // v1.7.46: Copy, Save to, New Angle
  const copyB = btn("Copy", "Copy this frame to the clipboard (full size PNG), then paste it into GIMP or any other program");
  copyB.style.background = "#3f5159"; copyB.style.color = "#fff"; copyB.style.fontWeight = "bold";
  const sel = (title) => {
    const e = el("select", { flex: "1 1 auto", minWidth: "120px", background: "#1e1e1e", color: "#eee",
      border: "1px solid #555", borderRadius: "3px", padding: "2px 4px", font: "12px sans-serif" });
    e.title = title;
    for (const ev of ["pointerdown", "mousedown", "keydown"]) e.addEventListener(ev, (x) => x.stopPropagation());
    return e;
  };
  const saveTo = sel("Project the Snapshot and New Angle files are saved to");
  const angleSel = sel("QWEN multi-angle view to make from this frame");
  // v1.7.49: same colors as the PMs.  Blue = one angle, orange = all 17.
  const angleB = btn("Generate Angle", "Make this angle from the parked frame with QWEN and save it to the project's MULTIANGLE/SINGLES folder");
  angleB.style.background = "#2563eb"; angleB.style.color = "#fff"; angleB.style.fontWeight = "bold";
  angleB.style.border = "1px solid #1d4ed8";
  const allB = btn("▶  Generate All Angles  (17)", "Make all 17 angles from the parked frame with QWEN.  A warning shows first so you can cancel.");
  allB.style.background = "#2a1500"; allB.style.color = "#f97316"; allB.style.fontWeight = "bold";
  allB.style.border = "1px solid #f97316"; allB.style.flex = "1 1 auto";
  const gstat = el("div", { flex: "1 1 auto", color: "#aaa", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }, "");
  const r1 = row(); r1.append(tag("BURN"), cStyle.lab, cAccent.lab, cSettings.lab);
  const r2 = row(); r2.append(tag(""), cLabel.lab, labelIn);
  const r3 = row(); r3.append(tag("JSON"), cJson.lab, el("div", { flex: "1 1 auto" }), copyB, snap);
  const r0 = row(); r0.style.flexWrap = "nowrap"; r0.append(tag("SAVE"), saveTo);
  const r4 = row(); r4.style.flexWrap = "nowrap"; r4.append(tag("ANGLE"), angleSel, angleB);
  const r5 = row(); r5.style.flexWrap = "nowrap"; r5.append(tag("ALL"), allB);
  grab.append(r0, r1, r2, r3, r4, r5, gstat);
  root.append(top, view, slider, ctl, grab);

  const gp = () => {
    node.properties = node.properties || {};
    node.properties.s5090grab = Object.assign({}, GRAB_DEFAULTS, node.properties.s5090grab || {});
    return node.properties.s5090grab;
  };
  const markChanged = () => {
    try { app.graph?.change?.(); } catch (e) {}
    try { app.extensionManager?.workflow?.activeWorkflow?.changeTracker?.checkState?.(); } catch (e) {}
  };
  const applyGrab = () => {
    const p = gp();
    cStyle.cb.checked = !!p.style; cAccent.cb.checked = !!p.accent; cSettings.cb.checked = !!p.settings;
    cLabel.cb.checked = !!p.label_on; cJson.cb.checked = !!p.json; labelIn.value = p.label || "";
  };
  const bind = (c, key) => c.cb.addEventListener("change", () => { gp()[key] = c.cb.checked; markChanged(); });
  bind(cStyle, "style"); bind(cAccent, "accent"); bind(cSettings, "settings"); bind(cLabel, "label_on"); bind(cJson, "json");
  labelIn.addEventListener("change", () => { gp().label = labelIn.value; markChanged(); });
  labelIn.addEventListener("input", () => { gp().label = labelIn.value; });
  const setAvail = (c, ok, why) => {
    c.cb.disabled = !ok;
    c.lab.style.opacity = ok ? "1" : "0.4";
    c.lab.title = ok ? "" : why;
  };
  let gInfo = null;
  const loadGrabInfo = async (ref, token) => {
    gInfo = null;
    setAvail(cStyle, false, "Checking…"); setAvail(cAccent, false, "Checking…"); setAvail(cSettings, false, "Checking…");
    let d;
    try { d = await (await api.fetchApi(`/studio5090/loadvideo/grabinfo?ref=${encodeURIComponent(ref)}`)).json(); }
    catch (e) { d = { ok: false }; }
    if (token !== st.loadToken) return;
    gInfo = d.ok ? d : null;
    const casting = !!(gInfo && gInfo.has_casting);
    setAvail(cStyle, casting, "Not in this video (no Casting PM in its workflow)");
    setAvail(cAccent, casting, "Not in this video (no Casting PM in its workflow)");
    setAvail(cSettings, !!(gInfo && gInfo.settings), "No settings stamp in this video");
    setAvail(cJson, !!(gInfo && gInfo.has_workflow), "No workflow stored in this video");
    fillSaveTo(gInfo);
    gstat.textContent = gInfo ? ("Saves to " + (saveTo.value ? saveTo.value + "/GRAB" : "STUDIO5090/GRAB")) : "";
  };
  const fillSaveTo = (g) => {
    saveTo.innerHTML = "";
    const projects = (g && g.projects) || [];
    const own = (g && g.project) || "";
    const none = el("option", {}, own ? `${own}  (the video's project)` : "No project (STUDIO5090/GRAB)");
    none.value = own;
    saveTo.append(none);
    for (const p of projects) {
      if (p === own) continue;
      const o = el("option", {}, p); o.value = p; saveTo.append(o);
    }
    saveTo.value = own;
  };
  saveTo.addEventListener("change", () => {
    gstat.textContent = "Saves to " + (saveTo.value ? saveTo.value + "/GRAB" : "STUDIO5090/GRAB");
  });
  const loadAngles = async () => {
    if (angleSel.options.length) return;
    try {
      const d = await (await api.fetchApi("/studio5090/qwen_angles")).json();
      for (const a of (d.angles || [])) {
        const o = el("option", {}, a.suffix.replace(/^MA_/, "").replace(/_/g, " "));
        o.value = a.suffix; o.title = a.prompt; angleSel.append(o);
      }
      const p = gp();
      if (p.angle && [...angleSel.options].some((o) => o.value === p.angle)) angleSel.value = p.angle;
    } catch (e) { console.warn("[Studio5090 Frame Grab] angles", e); }
  };
  angleSel.addEventListener("change", () => { gp().angle = angleSel.value; markChanged(); });
  angleB.onclick = async () => {
    if (!st.count || !st.ref) { gstat.textContent = "Choose a video first."; return; }
    if (!angleSel.value) { gstat.textContent = "No angles loaded."; return; }
    if (!saveTo.value) { gstat.textContent = "Pick a project in Save to first."; return; }
    angleB.disabled = true;
    gstat.textContent = "Queuing angle…";
    try {
      const r = await api.fetchApi("/studio5090/loadvideo/new_angle", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ref: st.ref, frame: +slider.value, angle: angleSel.value, save_to: saveTo.value }),
      });
      const d = await r.json();
      gstat.textContent = d.ok
        ? `Queued ${d.angle} from frame ${d.frame}, saves to ${d.project}/MULTIANGLE/SINGLES`
        : "Not queued: " + (d.error || "unknown error");
      gstat.title = d.ok ? d.output_prefix : "";
    } catch (e) { gstat.textContent = "Not queued: " + e; }
    angleB.disabled = false;
  };
  allB.onclick = async () => {
    if (!st.count || !st.ref) { gstat.textContent = "Choose a video first."; return; }
    if (!saveTo.value) { gstat.textContent = "Pick a project in Save to first."; return; }
    const frame = +slider.value;
    // v1.7.51: same rule as grab_folder() in studio5090_grab.py.
    const stem = String(st.ref || "").split(/[\\/]/).pop().replace(/\.[^.]+$/, "");
    const first = (stem.replace(/^[_\-. ]+/, "").split(/[_\-\s.]+/)[0] || "").replace(/[^A-Za-z0-9]/g, "").toUpperCase();
    const folder = (first || "FRAME") + "_GRAB";
    const yes = await grabConfirm(
      "About to queue and process 17 images.\n\n" +
      "Project: " + saveTo.value + "\n" +
      "From frame: " + frame + "\n" +
      "Saves to: " + saveTo.value + "/MULTIANGLE/" + folder + "\n\nProceed?");
    if (!yes) { gstat.textContent = "Cancelled."; return; }
    allB.disabled = true; angleB.disabled = true;
    gstat.textContent = "Queuing 17 angles…";
    try {
      const r = await api.fetchApi("/studio5090/loadvideo/new_angles_all", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ref: st.ref, frame, save_to: saveTo.value }),
      });
      const d = await r.json();
      gstat.textContent = d.ok
        ? `Queued ${d.queued} angles from frame ${d.frame}, saves to ${d.output_folder}`
        : "Not queued: " + (d.error || "unknown error") + (d.queued ? ` (${d.queued} were queued)` : "");
    } catch (e) { gstat.textContent = "Not queued: " + e; }
    allB.disabled = false; angleB.disabled = false;
  };
  copyB.onclick = async () => {
    if (!st.count || !st.ref) { gstat.textContent = "Choose a video first."; return; }
    if (!window.isSecureContext || !navigator.clipboard?.write || typeof ClipboardItem === "undefined") {
      gstat.textContent = "Copy is blocked here.  The browser only allows it on localhost or https.  Use Snapshot instead.";
      gstat.title = "Open ComfyUI at http://127.0.0.1:8188 (or localhost) on this computer to use Copy.";
      return;
    }
    const url = api.apiURL(`/studio5090/loadvideo/frame_png?ref=${encodeURIComponent(st.ref)}&i=${+slider.value}`);
    const getBlob = async () => {
      const r = await fetch(url, { cache: "no-store" });
      if (!r.ok) throw new Error(await r.text() || ("HTTP " + r.status));
      const b = await r.blob();
      return b.type === "image/png" ? b : new Blob([b], { type: "image/png" });
    };
    gstat.textContent = "Copying…";
    try {
      // The blob is passed as a promise so the click still counts while the
      // full size frame is read.
      await navigator.clipboard.write([new ClipboardItem({ "image/png": getBlob() })]);
      gstat.textContent = `Copied frame ${+slider.value}.  Paste it with Ctrl+V.`;
    } catch (e) {
      try {
        const b = await getBlob();
        await navigator.clipboard.write([new ClipboardItem({ "image/png": b })]);
        gstat.textContent = `Copied frame ${+slider.value}.  Paste it with Ctrl+V.`;
      } catch (e2) {
        gstat.textContent = "Not copied: " + (e2.message || e2);
        console.warn("[Studio5090 Frame Grab] copy", e, e2);
      }
    }
  };
  snap.onclick = async () => {
    if (!st.count || !st.ref) { gstat.textContent = "Choose a video first."; return; }
    const p = gp();
    const on = (c, v) => !!v && !c.cb.disabled;
    gstat.textContent = "Saving…";
    try {
      const r = await api.fetchApi("/studio5090/loadvideo/snapshot", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ref: st.ref, frame: +slider.value,
          burn_style: on(cStyle, p.style), burn_accent: on(cAccent, p.accent),
          burn_settings: on(cSettings, p.settings), burn_label: !!p.label_on, label: labelIn.value,
          save_json: on(cJson, p.json), save_to: saveTo.value }),
      });
      const d = await r.json();
      if (!d.ok) { gstat.textContent = "Not saved: " + (d.error || "unknown error"); return; }
      const names = d.files.map(f => f.split("/").pop());
      gstat.textContent = "Saved " + names.join(", ") + (d.notes && d.notes.length ? "  (" + d.notes.join("; ") + ")" : "");
      gstat.title = d.files.join("\n");
    } catch (e) { gstat.textContent = "Not saved: " + e; }
  };

  const st = { ref: "", count: 0, fps: 24, meta: null, loadToken: 0 };

  const showFrame = (i, fromWidget = false) => {
    if (!st.count) return;
    i = Math.min(Math.max(0, Math.round(i)), st.count - 1);
    if (!fromWidget && wFrame.value !== i) { wFrame.value = i; }
    slider.value = String(i);
    img.src = api.apiURL(`/studio5090/loadvideo/thumb?ref=${encodeURIComponent(st.ref)}&i=${i}&k=${st.key}`);
    const kind = st.meta.hdr ? `HDR ${st.meta.hdr}` : "SDR";
    const where = i === 0 ? " (first)" : (i === st.count - 1 ? " (last)" : "");
    info.textContent = `Frame ${i}${where}   ${timecode(i, st.fps)}   ${st.count} frames   ${kind}`;
    node.setDirtyCanvas(true, false);
  };

  const loadVideo = async (ref, frame) => {
    const token = ++st.loadToken;
    st.ref = ref; st.count = 0;
    fname.textContent = ref ? ref.split("/").pop() : "No video chosen";
    fname.title = ref || "";
    img.style.display = "none"; slider.disabled = true; info.textContent = "";
    if (!ref) { msg.textContent = "Press Choose Video"; msg.style.display = ""; return; }
    msg.textContent = "Reading frames..."; msg.style.display = "";
    let meta;
    try {
      const r = await api.fetchApi(`/studio5090/loadvideo/info?ref=${encodeURIComponent(ref)}`);
      meta = await r.json();
    } catch (e) { meta = { ok: false, error: String(e) }; }
    if (token !== st.loadToken) return;
    if (!meta.ok) { msg.textContent = meta.error || "Could not read this video."; return; }
    st.meta = meta; st.count = meta.count; st.fps = meta.fps || 24; st.key = Date.now();
    slider.max = String(st.count - 1); slider.disabled = false;
    msg.style.display = "none"; img.style.display = "";
    showFrame(frame === undefined ? st.count - 1 : frame);
    loadGrabInfo(ref, token);
  };

  slider.addEventListener("input", () => showFrame(+slider.value));
  bFirst.onclick = () => showFrame(0);
  bBack.onclick = () => showFrame(+slider.value - 1);
  bNext.onclick = () => showFrame(+slider.value + 1);
  bLast.onclick = () => showFrame(st.count - 1);
  fileIn.onchange = async () => {
    const file = fileIn.files && fileIn.files[0];
    if (!file) return;
    const token = ++st.loadToken;
    fname.textContent = file.name;
    img.style.display = "none"; slider.disabled = true; info.textContent = "";
    msg.style.display = ""; msg.textContent = "Looking for this file in ComfyUI's folders...";
    let ref = null;
    try {
      const r = await api.fetchApi("/studio5090/loadvideo/match", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: file.name, size: file.size, mtime: file.lastModified }),
      });
      ref = (await r.json()).ref;
    } catch (e) { ref = null; }
    if (!ref) {
      // Not on the ComfyUI machine yet: copy it into the input folder in small pieces.
      const CHUNK = 16 * 1024 * 1024;
      const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
      try {
        for (let off = 0; off < file.size || off === 0; off += CHUNK) {
          if (token !== st.loadToken) return;
          msg.textContent = `Copying into ComfyUI's input folder... ${Math.floor(100 * off / Math.max(1, file.size))}%`;
          const r = await api.fetchApi(
            `/studio5090/loadvideo/upload?name=${encodeURIComponent(file.name)}&offset=${off}&total=${file.size}&id=${id}`,
            { method: "POST", body: file.slice(off, off + CHUNK) });
          const j = await r.json();
          if (!j.ok) throw new Error(j.error || "upload failed");
          if (j.done) { ref = j.ref; break; }
          if (file.size === 0) break;
        }
      } catch (e) {
        msg.textContent = "Could not copy the file: " + e.message;
        return;
      }
    }
    if (token !== st.loadToken || !ref) return;
    wVideo.value = ref;
    loadVideo(ref);
  };
  choose.onclick = () => { fileIn.value = ""; fileIn.click(); };

  const origCb = wFrame.callback;
  wFrame.callback = function (v) {
    const r = origCb?.apply(this, arguments);
    if (st.count) showFrame(v, true);
    return r;
  };

  const dom = node.addDOMWidget("scrubber", "s5090_scrubber", root, {
    serialize: false,
    getMinHeight: () => PANEL_H,
    getHeight: () => PANEL_H,
  });
  dom.computeSize = (w) => [w, PANEL_H];

  node.__s5090lv = { loadVideo, wVideo, wFrame, applyGrab };
  applyGrab();
  loadAngles();
  if (wVideo.value) loadVideo(wVideo.value, wFrame.value);
  const sz = node.computeSize();
  node.setSize([Math.max(node.size[0], 520), Math.max(node.size[1], sz[1])]);
}

app.registerExtension({
  name: "Studio5090.LoadVideo",
  async beforeRegisterNodeDef(nodeType, nodeData) {
    if (nodeData.name !== NODE) return;
    const onCreated = nodeType.prototype.onNodeCreated;
    nodeType.prototype.onNodeCreated = function () {
      const r = onCreated?.apply(this, arguments);
      setup(this);
      return r;
    };
    const onConfigure = nodeType.prototype.onConfigure;
    nodeType.prototype.onConfigure = function () {
      const r = onConfigure?.apply(this, arguments);
      const s = this.__s5090lv;
      if (s) s.applyGrab();
      if (s && s.wVideo.value) s.loadVideo(s.wVideo.value, s.wFrame.value);
      return r;
    };
  },
});
