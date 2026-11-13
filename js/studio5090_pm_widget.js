/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Alan Rosenfeld
 * Studio5090 — see LICENSE at the repository root for full terms.
 * Provided "AS IS", without warranty of any kind.
 */

/**
 * Studio5090 Render Project Manager — Canvas UI v1.7.11
 * Designed by Alan Rosenfeld + Claude (Anthropic), 2026.
 *
 * v1.7.0: New audio_output_path output emitting
 * STUDIO5090/<project>/AUDIO/<scene_name> as a stem string. Wires into
 * downstream Save Audio (FLAC) node's filename input.
 *
 * v1.6.1: Desktop app compatibility. window.prompt and window.confirm
 * replaced with custom DOM modal helpers (showTextPrompt, showConfirm)
 * because the native ComfyUI Electron app disables these. Workflow
 * picker now default-collapsed with Expand/Collapse toggle. Removed
 * the replace-graph warning on Open Workflow.
 *
 * v1.6.0: WORKFLOWS section added at the top with Save/Open Workflow
 * buttons. Saves per-project to STUDIO5090/<project>/workflows/ with
 * auto-incrementing _v<N> suffix. Picker shows TEMPLATES + per-project
 * sections. New project creation auto-copies product workflow
 * templates into the project's workflows/ folder.
 *
 * v1.5.8: Layout fix — multianglePanel height expanded to fit the
 * v1.5.7 angle dropdown and Generate Single button. They were
 * overlapping the FRAME MODE SELECTION header.
 *
 * v1.5.7: Generate Single Angle button + angle dropdown for one-off
 * multiangle renders. Lazy subject folders (no auto-create until file
 * write). One-time startup cleanup of empty subject folders.
 *
 * v1.5.6: Bug fix — floating filename label could stick on screen after
 * closing the picker by clicking a thumbnail. Cleanup now removes the
 * label as part of its core behavior so every close path clears it.
 *
 * v1.5.5: Picker sections open collapsed by default. New "Expand All /
 * Collapse All" toggle button next to Close inverts all section states
 * with a single click.
 *
 * v1.5.4: Image picker grid reorganized into collapsible sections by
 * source folder (CREATE / EDITS / CHARACTERS / MULTIANGLE:<subject>).
 * Section headers are prominent with image counts and expand/collapse
 * affordances. Hovering any thumbnail shows the full filename in a
 * floating label that follows the cursor.
 *
 * v1.5.1: CHARACTERS folder added to frame pickers + source-image picker.
 * Character sheets can now seed FF/LF picks and act as Qwen source images
 * directly, without having to copy them into CREATE. CHARACTERS files are
 * color-coded amber (after CREATE green, EDITS blue) so they cluster cleanly
 * in the grid view.
 *
 * v1.3 layout (top to bottom):
 *   ① SELECT PROJECT
 *        [⟳ Refresh]  [project dropdown]
 *
 *   ② CREATE PROJECT
 *        Project Name: [text]
 *        [Create Project]   ← green
 *
 *   NEW MULTIANGLE SET   ← teal-framed accent panel
 *        Source Image:    [picker — CREATE + EDITS + all MULTIANGLE]
 *        Subject Name:    [text — names the new MULTIANGLE/<name>/ folder]
 *        [▶ Generate All Angles (17)]   ← orange
 *
 *   ④ FRAME MODE SELECTION
 *        First Frame: [picker]
 *        Last Frame:  [picker]
 *        [SF | FL]
 *
 *   ⑤ VIDEO OUTPUT
 *        Scene Name: [text]
 *        → STUDIO5090/<project>/VIDEOS/<scene>
 *        → STUDIO5090/<project>/VIDEOS/<scene>_1920x1152
 *
 *   First Frame preview        Last Frame preview
 *
 *   status bar
 *
 * v1.3 functional changes:
 *   - "Subject" dropdown removed — the field is now a text-entry that
 *     names the new MULTIANGLE folder for the upcoming Qwen batch.
 *   - "Create Subject" button removed — queue_qwen_batch creates the
 *     folder automatically.
 *   - Source image + Subject name + Generate button are visually framed
 *     as one panel.
 *   - Frame pickers continue to surface CREATE + EDITS + all MULTIANGLE
 *     across every subject.
 *
 * Persistence model: same as the camera widget. Native INPUT_TYPES widgets
 * are kept and visually hidden; we read/write via .value. ComfyUI
 * serializes them automatically. Tab switches preserve all selections.
 *
 * Frame previews are drawn directly onto the LiteGraph canvas via
 * ctx.drawImage from a small Image cache — no DOM-overlay positioning.
 */

const { app } = window.comfyAPI.app;

// ── v1.7.49: image picker Sort ───────────────────────────────────────────────
// Newest first (default), Oldest first, Name A to Z, Name Z to A.  Newest and
// Oldest use the date each file was saved, which the server sends with every
// image list as `mtimes`.  The choice is remembered.
const S5090_MTIME = new Map();
function s5090RememberMtimes(d, rename) {
  const m = d && d.mtimes;
  if (!m) return;
  for (const [k, v] of Object.entries(m)) S5090_MTIME.set(rename ? rename(k) : k, v);
}
const S5090_SORTS = [
  ['newest', 'Newest first'], ['oldest', 'Oldest first'],
  ['az', 'Name A to Z'],      ['za', 'Name Z to A'],
];
function s5090GetSort() {
  try {
    const v = localStorage.getItem('studio5090.pickerSort');
    if (S5090_SORTS.some(s => s[0] === v)) return v;
  } catch (e) { /* storage blocked */ }
  return window.__s5090PickerSort || 'newest';
}
function s5090SetSort(v) {
  window.__s5090PickerSort = v;
  try { localStorage.setItem('studio5090.pickerSort', v); } catch (e) { /* storage blocked */ }
}
function s5090BaseName(f) {
  return String(f).replace(/^\[[^\]]*\] /, '');
}
function s5090SortItems(items) {
  const mode = s5090GetSort();
  const byName = (a, b) => s5090BaseName(a).localeCompare(s5090BaseName(b), undefined, { numeric: true, sensitivity: 'base' });
  const t = f => S5090_MTIME.get(f) || 0;
  const list = [...items];
  if (mode === 'az') return list.sort(byName);
  if (mode === 'za') return list.sort((a, b) => byName(b, a));
  if (mode === 'oldest') return list.sort((a, b) => (t(a) - t(b)) || byName(a, b));
  return list.sort((a, b) => (t(b) - t(a)) || byName(b, a));
}
function s5090SortSelect(onChange) {
  const sel = document.createElement('select');
  sel.title = 'Sort the pictures in every section';
  sel.style.cssText = 'background:#111e1e; color:#2dd4bf; border:1px solid #0d9488; border-radius:4px; padding:4px 6px; font-size:12px; font-weight:bold; margin-right:8px; cursor:pointer; font-family:"Courier New", monospace;';
  for (const [v, label] of S5090_SORTS) {
    const o = document.createElement('option');
    o.value = v; o.textContent = 'Sort: ' + label;
    sel.appendChild(o);
  }
  sel.value = s5090GetSort();
  sel.addEventListener('click', e => e.stopPropagation());
  sel.onchange = () => { s5090SetSort(sel.value); onChange(); };
  return sel;
}

// ── Design tokens ─────────────────────────────────────────────────────────────
const C = {
  teal:        '#2dd4bf',
  tealDark:    '#0d9488',
  tealDim:     '#1a3535',
  tealPanel:   '#0f2a28',
  green:       '#22c55e',
  greenDark:   '#15803d',
  orange:      '#fb923c',
  orangeDim:   '#2a1500',
  white:       '#ffffff',
  dimGrey:     '#888888',
  grey:        '#cccccc',
  bgSection:   '#1a1a1a',
  bgRow:       '#353535',
  border:      '#555555',
  borderAcc:   '#0d9488',
  NODE_W:      440,
  PAD:         10,
  ROW_H:       28,
  BTN_H:       30,
  SEC_GAP:     12,
  LABEL_H:     20,
  THUMB_H:     160,
  PANEL_PAD:   10,
};

const api = {
  async get(path) {
    const r = await fetch(path);
    if (!r.ok) throw new Error(`HTTP ${r.status} ${path}`);
    return r.json();
  },
  async post(path, body) {
    const r = await fetch(path, {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify(body),
    });
    if (!r.ok) throw new Error(`HTTP ${r.status} ${path}`);
    return r.json();
  },
};

function enc(s){ return encodeURIComponent(s||''); }

// ── Canvas drawing primitives ─────────────────────────────────────────────────
function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x+r,y); ctx.lineTo(x+w-r,y);
  ctx.quadraticCurveTo(x+w,y,x+w,y+r);
  ctx.lineTo(x+w,y+h-r);
  ctx.quadraticCurveTo(x+w,y+h,x+w-r,y+h);
  ctx.lineTo(x+r,y+h);
  ctx.quadraticCurveTo(x,y+h,x,y+h-r);
  ctx.lineTo(x,y+r);
  ctx.quadraticCurveTo(x,y,x+r,y);
  ctx.closePath();
}

function secHeader(ctx, label, x, y, w) {
  ctx.fillStyle = '#1a1a1a';
  rr(ctx, x, y, w, C.LABEL_H, 4); ctx.fill();
  ctx.strokeStyle = '#333333'; ctx.lineWidth = 1; ctx.stroke();
  ctx.fillStyle = C.white;
  ctx.font = 'bold 11px sans-serif';
  ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  ctx.fillText(label, x+8, y+C.LABEL_H/2);
  return y + C.LABEL_H + 6;
}

function accentHeader(ctx, label, x, y, w) {
  ctx.fillStyle = C.tealDark;
  rr(ctx, x, y, w, C.LABEL_H, 4); ctx.fill();
  ctx.fillStyle = C.white;
  ctx.font = 'bold 11px sans-serif';
  ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  ctx.fillText(label, x+8, y+C.LABEL_H/2);
  return y + C.LABEL_H + 6;
}

function drawRow(ctx, label, value, placeholder, x, y, w, hasThumb, dimmed, dimReason) {
  // dimmed=true grays everything out and appends a reason suffix to the label.
  // The row stays clickable — caller still registers a click region.
  const labelColor = dimmed ? '#555555' : C.grey;
  ctx.fillStyle = labelColor;
  ctx.font = '10px "Courier New", monospace';
  ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  ctx.fillText(label, x, y+C.ROW_H/2);

  const dx = x+95, dw = w-95;
  ctx.fillStyle = dimmed ? '#222222' : C.bgRow;
  ctx.strokeStyle = dimmed ? '#3a3a3a' : C.border;
  ctx.lineWidth = 1;
  rr(ctx, dx, y, dw, C.ROW_H, 3); ctx.fill(); ctx.stroke();

  if (hasThumb) {
    ctx.fillStyle = dimmed ? '#1a1a1a' : C.tealDim;
    rr(ctx, dx+3, y+3, 22, C.ROW_H-6, 2); ctx.fill();
    ctx.fillStyle = dimmed ? '#444444' : C.teal;
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('🖼', dx+14, y+C.ROW_H/2);
  }

  const has = value && value.trim()!=='';
  const txtX = hasThumb ? dx+30 : dx+6;
  const maxCh = Math.floor((dw - (hasThumb?36:12)) / 6.5);
  // When dimmed, override displayed text with the reason.
  const display = dimmed
    ? (dimReason || 'ignored')
    : (has ? value : (placeholder||'—'));
  ctx.fillStyle = dimmed ? '#666666'
                : has    ? C.white
                :          C.dimGrey;
  ctx.font = dimmed ? 'italic 10px "Courier New", monospace'
                    : '10px "Courier New", monospace';
  ctx.textAlign = 'left';
  ctx.fillText(display.length>maxCh ? display.slice(0,maxCh-1)+'…' : display,
               txtX, y+C.ROW_H/2);
  ctx.fillStyle = dimmed ? '#444444' : C.teal;
  ctx.textAlign = 'right';
  ctx.fillText('▾', dx+dw-6, y+C.ROW_H/2);
  return y + C.ROW_H + 5;
}

// v1.7.1: added optional borderColor / borderWidth params. When omitted,
// falls back to the standard grey used across the toolkit. Used by the
// Scene Name field to draw attention to the field with a yellow-orange
// border. Backward-compatible — existing call sites don't need to change.
function drawTextInput(ctx, label, value, placeholder, x, y, w,
                       borderColor, borderWidth) {
  ctx.fillStyle = C.white; ctx.font = '11px sans-serif';
  ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  ctx.fillText(label, x, y+C.ROW_H/2);
  const ix = x+95, iw = w-95;
  ctx.fillStyle = '#353535';
  ctx.strokeStyle = borderColor || '#555555';
  ctx.lineWidth   = borderWidth || 1;
  rr(ctx, ix, y, iw, C.ROW_H, 4); ctx.fill(); ctx.stroke();
  const has = value && value.trim()!=='';

  // Clip text to the input rectangle so long values don't bleed past the
  // field's visible boundary. Inner padding of 8px on each side.
  ctx.save();
  ctx.beginPath();
  ctx.rect(ix + 4, y + 1, iw - 8, C.ROW_H - 2);
  ctx.clip();
  ctx.fillStyle = has ? C.white : C.dimGrey; ctx.textAlign = 'left';
  ctx.font = '11px sans-serif';
  ctx.fillText(has ? value : placeholder, ix+8, y+C.ROW_H/2);
  ctx.restore();

  return y + C.ROW_H + 5;
}

// v1.7.32: buttons look like buttons.  A border lighter than the fill and a
// soft light band across the top, so every button reads as pressable and
// never as a flat label.
function s5090Lighten(hex, amt) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || '').trim());
  if (!m) return '#777777';
  const n = parseInt(m[1], 16);
  const ch = (v) => Math.round(v + (255 - v) * amt).toString(16).padStart(2, '0');
  return '#' + ch((n >> 16) & 255) + ch((n >> 8) & 255) + ch(n & 255);
}
function s5090ButtonFace(ctx, rrFn, x, y, w, h, r, bg) {
  ctx.save();
  ctx.fillStyle = bg;
  rrFn(ctx, x, y, w, h, r); ctx.fill();
  const g = ctx.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, 'rgba(255,255,255,0.16)');
  g.addColorStop(0.5, 'rgba(255,255,255,0.03)');
  g.addColorStop(1, 'rgba(0,0,0,0.12)');
  ctx.fillStyle = g;
  rrFn(ctx, x, y, w, h, r); ctx.fill();
  ctx.strokeStyle = s5090Lighten(bg, 0.38); ctx.lineWidth = 1.5;
  rrFn(ctx, x + 0.75, y + 0.75, w - 1.5, h - 1.5, r); ctx.stroke();
  ctx.restore();
}

function drawBtn(ctx, label, x, y, w, bg, fg, borderColor) {
  s5090ButtonFace(ctx, rr, x, y, w, C.BTN_H, 4, bg||'#3a3a3a');
  ctx.fillStyle = fg||C.white; ctx.font = 'bold 12px sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(label, x+w/2, y+C.BTN_H/2);
  return y + C.BTN_H + 5;
}

function drawRadio(ctx, labelOn, labelOff, value, x, y, w) {
  const half = (w-6)/2;
  s5090ButtonFace(ctx, rr, x, y, half, C.BTN_H, 4, value ? C.teal : '#353535');
  ctx.fillStyle = value ? '#0a1a1a' : C.white;
  ctx.font = 'bold 12px sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(labelOn, x+half/2, y+C.BTN_H/2);
  const rx = x+half+6;
  s5090ButtonFace(ctx, rr, rx, y, half, C.BTN_H, 4, !value ? C.teal : '#353535');
  ctx.fillStyle = !value ? '#0a1a1a' : C.white;
  ctx.fillText(labelOff, rx+half/2, y+C.BTN_H/2);
  return y + C.BTN_H + 5;
}

// ── Canvas-drawn thumbnail cache ──────────────────────────────────────────────
const thumbCache = new Map();

function getThumb(url) {
  if (!url) return null;
  let entry = thumbCache.get(url);
  if (entry) return entry;
  entry = { img: new Image(), status: 'loading' };
  entry.img.onload  = () => { entry.status = 'ok';  app.graph?.setDirtyCanvas(true,true); };
  entry.img.onerror = () => { entry.status = 'err'; app.graph?.setDirtyCanvas(true,true); };
  entry.img.src = url;
  thumbCache.set(url, entry);
  return entry;
}

function drawThumb(ctx, url, x, y, w, h, label, dimmed) {
  ctx.fillStyle = '#252525';
  ctx.strokeStyle = '#444444';
  ctx.lineWidth = 1;
  rr(ctx, x, y, w, h, 4);
  ctx.fill();
  ctx.stroke();

  if (!url) {
    ctx.fillStyle = dimmed ? '#555555' : C.dimGrey;
    ctx.font = dimmed ? 'italic 11px sans-serif' : '11px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(dimmed ? label : label, x + w/2, y + h/2);
    return;
  }

  const entry = getThumb(url);
  if (entry.status === 'ok' && entry.img.naturalWidth > 0) {
    const iw = entry.img.naturalWidth, ih = entry.img.naturalHeight;
    const scale = Math.max(w / iw, h / ih);
    const dw = iw * scale, dh = ih * scale;
    const dx = x + (w - dw) / 2, dy = y + (h - dh) / 2;
    ctx.save();
    rr(ctx, x, y, w, h, 4);
    ctx.clip();
    if (dimmed) {
      // Drastically lower opacity + desaturate via globalAlpha + grayscale-ish overlay
      ctx.globalAlpha = 0.25;
    }
    ctx.drawImage(entry.img, dx, dy, dw, dh);
    if (dimmed) {
      ctx.globalAlpha = 1;
      // Dark overlay to push the image toward "ignored"
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      ctx.fillRect(x, y, w, h);
    }
    ctx.restore();
    ctx.strokeStyle = dimmed ? '#3a3a3a' : '#444444';
    ctx.lineWidth = 1;
    rr(ctx, x, y, w, h, 4);
    ctx.stroke();
    if (dimmed) {
      // Italic label overlaid in the center
      ctx.fillStyle = '#888888';
      ctx.font = 'italic bold 12px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, x + w/2, y + h/2);
    }
  } else {
    ctx.fillStyle = dimmed ? '#555555' : C.dimGrey;
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(entry.status === 'err' ? '✕  no preview' : label,
                 x + w/2, y + h/2);
  }
}

// ── Color coding (v1.4) ──────────────────────────────────────────────────────
// CREATE, EDITS, and CHARACTERS get fixed colors. Each MULTIANGLE subject gets
// a unique color from a 10-hue palette, assigned by hashing the subject name.
// Stable across sessions: same subject name always gets the same color.
// v1.5.1: CHARACTERS added (amber/yellow) so character sheets are visually
// distinct from CREATE/EDITS and any MULTIANGLE subject.
const FIXED_COLORS = {
  CREATE:     '#166534',  // green
  EDITS:      '#1d4ed8',  // blue
  CHARACTERS: '#a16207',  // amber / dark yellow
  GRAB:       '#64748b',  // v1.7.54: slate gray, Frame Grab snapshots
};
const MA_PALETTE = [
  '#0d9488',  // teal
  '#c2410c',  // orange
  '#7c3aed',  // purple
  '#be185d',  // rose
  '#b45309',  // amber
  '#4338ca',  // indigo
  '#047857',  // emerald
  '#0369a1',  // sky
  '#6d28d9',  // violet
  '#a21caf',  // fuchsia
];
function hashStr(s) {
  // Simple deterministic hash — same string -> same number across sessions.
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}
function colorForFile(taggedFilename) {
  // Returns the category color for a tagged filename like "[CREATE] foo.png"
  // or "[MULTIANGLE:RUSTY1] frame_0001.png".
  // v1.7.9: also handles the cross-project tag form "[@PROJECT|CREATE] foo.png"
  // — color assignment is based on the inner tag so a cross-project CREATE
  // still reads as CREATE-green.
  let toMatch = taggedFilename;
  const crossProj = taggedFilename.match(/^\[@[^|\]]+\|([^\]]+)\] /);
  if (crossProj) {
    toMatch = `[${crossProj[1]}] `;
  }
  const m = toMatch.match(/^\[([^\]]+)\] /);
  if (!m) return MA_PALETTE[0];
  return colorForSectionKey(m[1]);
}

// v1.7.10: color assignment by section key alone. Used by the lazy-load
// picker so section headers can be color-coded before any file content
// is fetched. Both same-project sections (CREATE) and MULTIANGLE:<subject>
// keys resolve here.
function colorForSectionKey(sectionKey) {
  if (FIXED_COLORS[sectionKey]) return FIXED_COLORS[sectionKey];
  if (sectionKey.startsWith('MULTIANGLE:')) {
    const subj = sectionKey.slice('MULTIANGLE:'.length);
    return MA_PALETTE[hashStr(subj) % MA_PALETTE.length];
  }
  if (sectionKey === 'MULTIANGLE') return MA_PALETTE[0];
  return MA_PALETTE[0];
}

// v1.7.9: return the "inner tag" of a filename, stripping any
// cross-project @PROJECT| prefix. Used for bucketing so cross-project
// items land in the same picker sections as same-project items
// (a cross-project CREATE still bucketed under CREATE, not OTHER).
function innerTagOf(taggedFilename) {
  const crossProj = taggedFilename.match(/^\[@[^|\]]+\|([^\]]+)\] /);
  if (crossProj) return crossProj[1];
  const m = taggedFilename.match(/^\[([^\]]+)\] /);
  return m ? m[1] : '';
}
function sortByColorThenName(images) {
  // Cluster files by color. Within each color group, preserve original order.
  const groups = new Map();   // color -> [files...]
  const order  = [];          // colors in first-seen order
  for (const f of images) {
    const c = colorForFile(f);
    if (!groups.has(c)) { groups.set(c, []); order.push(c); }
    groups.get(c).push(f);
  }
  // Stable order: CREATE green first, EDITS blue second, CHARACTERS amber
  // third, then MULTIANGLE subjects in their first-seen order. We want
  // deterministic ordering so CREATE/EDITS/CHARACTERS always lead.
  const lead = [FIXED_COLORS.CREATE, FIXED_COLORS.EDITS, FIXED_COLORS.CHARACTERS, FIXED_COLORS.GRAB];
  const ordered = [
    ...lead.filter(c => groups.has(c)),
    ...order.filter(c => !lead.includes(c)),
  ];
  return ordered.flatMap(c => groups.get(c));
}

// v1.6.1: Custom text-input modal. Replaces window.prompt() which is
// disabled in the ComfyUI native desktop (Electron) app for security
// reasons. Returns a Promise that resolves to the entered string, or
// null if the user cancelled — matching window.prompt's return contract.
//
// Styling matches the toolkit's teal-on-dark aesthetic so it feels
// native to Studio5090 rather than borrowed from the OS.
//
// Defined identically in every PM widget file so each can use it
// regardless of load order.
function showTextPrompt(title, defaultValue) {
  return new Promise(resolve => {
    document.getElementById('s5090-textprompt')?.remove();
    document.getElementById('s5090-textprompt-overlay')?.remove();

    const overlay = document.createElement('div');
    overlay.id = 's5090-textprompt-overlay';
    Object.assign(overlay.style, {
      position:'fixed', inset:'0', background:'rgba(0,0,0,0.55)', zIndex:'99998',
    });

    const panel = document.createElement('div');
    panel.id = 's5090-textprompt';
    Object.assign(panel.style, {
      position:'fixed', top:'50%', left:'50%',
      transform:'translate(-50%,-50%)',
      background:'#1a2626', border:'2px solid #0d9488',
      borderRadius:'8px', padding:'0', zIndex:'99999',
      width:'min(480px, 90vw)',
      boxShadow:'0 8px 32px rgba(0,0,0,0.8)',
      display:'flex', flexDirection:'column',
    });

    const header = document.createElement('div');
    Object.assign(header.style, {
      padding:'12px 16px',
      borderBottom:'1px solid #0d9488',
      background:'#111e1e',
      borderRadius:'6px 6px 0 0',
      color:'#2dd4bf', fontWeight:'bold', fontSize:'13px',
      whiteSpace:'pre-line',
    });
    header.textContent = title || 'Enter value';
    panel.appendChild(header);

    const body = document.createElement('div');
    body.style.cssText = 'padding:16px;';

    const input = document.createElement('input');
    input.type = 'text';
    input.value = defaultValue || '';
    Object.assign(input.style, {
      width:'100%', boxSizing:'border-box',
      background:'#0d1a1a', color:'#e0f4f4',
      border:'1px solid #0d9488', borderRadius:'4px',
      padding:'8px 10px', fontSize:'13px',
      fontFamily:'"Courier New", monospace',
      outline:'none',
    });
    input.onfocus = () => input.style.borderColor = '#2dd4bf';
    input.onblur  = () => input.style.borderColor = '#0d9488';

    body.appendChild(input);
    panel.appendChild(body);

    const footer = document.createElement('div');
    Object.assign(footer.style, {
      display:'flex', justifyContent:'flex-end', gap:'8px',
      padding:'10px 16px', borderTop:'1px solid #0d9488',
      background:'#111e1e', borderRadius:'0 0 6px 6px',
    });
    const cancelBtn = document.createElement('button');
    cancelBtn.textContent = 'Cancel';
    cancelBtn.style.cssText = 'background:#2a2a2a; color:#cccccc; border:1px solid #555; border-radius:4px; cursor:pointer; padding:6px 16px; font-size:12px; font-weight:bold;';
    const okBtn = document.createElement('button');
    okBtn.textContent = 'OK';
    okBtn.style.cssText = 'background:#0d9488; color:#fff; border:none; border-radius:4px; cursor:pointer; padding:6px 20px; font-size:12px; font-weight:bold;';
    footer.appendChild(cancelBtn);
    footer.appendChild(okBtn);
    panel.appendChild(footer);

    let resolved = false;
    const cleanup = (value) => {
      if (resolved) return;
      resolved = true;
      panel.remove(); overlay.remove();
      resolve(value);
    };
    cancelBtn.onclick = () => cleanup(null);
    okBtn.onclick     = () => cleanup(input.value);
    overlay.onclick   = () => cleanup(null);
    panel.addEventListener('click', e => e.stopPropagation());

    input.addEventListener('keydown', e => {
      if (e.key === 'Enter')      { e.preventDefault(); cleanup(input.value); }
      else if (e.key === 'Escape') { e.preventDefault(); cleanup(null); }
    });

    document.body.appendChild(overlay);
    document.body.appendChild(panel);
    // Defer focus so the input is mounted before we focus it.
    setTimeout(() => { input.focus(); input.select(); }, 0);
  });
}

// v1.6.1: Custom confirm modal. Replaces window.confirm() which is
// disabled in the ComfyUI native desktop (Electron) app. Returns a
// Promise that resolves to true (confirmed) or false (cancelled),
// matching window.confirm's return contract.
function showConfirm(message) {
  return new Promise(resolve => {
    document.getElementById('s5090-confirm')?.remove();
    document.getElementById('s5090-confirm-overlay')?.remove();

    const overlay = document.createElement('div');
    overlay.id = 's5090-confirm-overlay';
    Object.assign(overlay.style, {
      position:'fixed', inset:'0', background:'rgba(0,0,0,0.55)', zIndex:'99998',
    });

    const panel = document.createElement('div');
    panel.id = 's5090-confirm';
    Object.assign(panel.style, {
      position:'fixed', top:'50%', left:'50%',
      transform:'translate(-50%,-50%)',
      background:'#1a2626', border:'2px solid #0d9488',
      borderRadius:'8px', padding:'0', zIndex:'99999',
      width:'min(480px, 90vw)',
      boxShadow:'0 8px 32px rgba(0,0,0,0.8)',
      display:'flex', flexDirection:'column',
    });

    const body = document.createElement('div');
    Object.assign(body.style, {
      padding:'20px 20px 16px',
      color:'#e0f4f4', fontSize:'13px', lineHeight:'1.5',
      whiteSpace:'pre-line',
    });
    body.textContent = message || 'Are you sure?';
    panel.appendChild(body);

    const footer = document.createElement('div');
    Object.assign(footer.style, {
      display:'flex', justifyContent:'flex-end', gap:'8px',
      padding:'10px 16px', borderTop:'1px solid #0d9488',
      background:'#111e1e', borderRadius:'0 0 6px 6px',
    });
    const cancelBtn = document.createElement('button');
    cancelBtn.textContent = 'Cancel';
    cancelBtn.style.cssText = 'background:#2a2a2a; color:#cccccc; border:1px solid #555; border-radius:4px; cursor:pointer; padding:6px 16px; font-size:12px; font-weight:bold;';
    const okBtn = document.createElement('button');
    okBtn.textContent = 'OK';
    okBtn.style.cssText = 'background:#0d9488; color:#fff; border:none; border-radius:4px; cursor:pointer; padding:6px 20px; font-size:12px; font-weight:bold;';
    footer.appendChild(cancelBtn);
    footer.appendChild(okBtn);
    panel.appendChild(footer);

    let resolved = false;
    const finish = (value) => {
      if (resolved) return;
      resolved = true;
      panel.remove(); overlay.remove();
      resolve(value);
    };
    cancelBtn.onclick = () => finish(false);
    okBtn.onclick     = () => finish(true);
    overlay.onclick   = () => finish(false);
    panel.addEventListener('click', e => e.stopPropagation());

    document.body.appendChild(overlay);
    document.body.appendChild(panel);
    setTimeout(() => okBtn.focus(), 0);
  });
}

// v1.7.46: shown when Create Project is pressed with a name that is already a
// project.  Resolves 'switch' (open that project) or 'ok' (stay as you are).
function showProjectExists(name) {
  return new Promise(resolve => {
    document.getElementById('s5090-exists')?.remove();
    document.getElementById('s5090-exists-overlay')?.remove();

    const overlay = document.createElement('div');
    overlay.id = 's5090-exists-overlay';
    Object.assign(overlay.style, {
      position:'fixed', inset:'0', background:'rgba(0,0,0,0.55)', zIndex:'99998',
    });

    const panel = document.createElement('div');
    panel.id = 's5090-exists';
    Object.assign(panel.style, {
      position:'fixed', top:'50%', left:'50%',
      transform:'translate(-50%,-50%)',
      background:'#1a2626', border:'2px solid #0d9488',
      borderRadius:'8px', padding:'0', zIndex:'99999',
      width:'min(480px, 90vw)',
      boxShadow:'0 8px 32px rgba(0,0,0,0.8)',
      display:'flex', flexDirection:'column',
    });

    const body = document.createElement('div');
    Object.assign(body.style, {
      padding:'20px 20px 16px',
      color:'#e0f4f4', fontSize:'13px', lineHeight:'1.5',
      whiteSpace:'pre-line',
    });
    body.textContent = `A project named '${name}' already exists.\n\nSwitch to it, or press OK to stay where you are.`;
    panel.appendChild(body);

    const footer = document.createElement('div');
    Object.assign(footer.style, {
      display:'flex', justifyContent:'flex-end', gap:'8px',
      padding:'10px 16px', borderTop:'1px solid #0d9488',
      background:'#111e1e', borderRadius:'0 0 6px 6px',
    });
    const okBtn = document.createElement('button');
    okBtn.textContent = 'OK';
    okBtn.style.cssText = 'background:#2a2a2a; color:#cccccc; border:1px solid #555; border-radius:4px; cursor:pointer; padding:6px 16px; font-size:12px; font-weight:bold;';
    const switchBtn = document.createElement('button');
    switchBtn.textContent = 'Switch to it';
    switchBtn.style.cssText = 'background:#0d9488; color:#fff; border:none; border-radius:4px; cursor:pointer; padding:6px 20px; font-size:12px; font-weight:bold;';
    footer.appendChild(okBtn);
    footer.appendChild(switchBtn);
    panel.appendChild(footer);

    let resolved = false;
    const finish = (value) => {
      if (resolved) return;
      resolved = true;
      panel.remove(); overlay.remove();
      resolve(value);
    };
    okBtn.onclick     = () => finish('ok');
    switchBtn.onclick = () => finish('switch');
    overlay.onclick   = () => finish('ok');
    panel.addEventListener('click', e => e.stopPropagation());

    document.body.appendChild(overlay);
    document.body.appendChild(panel);
    setTimeout(() => switchBtn.focus(), 0);
  });
}

// v1.7.20: hand the settings text straight to every node wired to the
// render_settings output, the same way ComfyUI does after a run, so the
// text shows without pressing Run.  Returns how many nodes took it.
function pushSettingsToDisplays(node, text) {
  let shown = 0;
  try {
    const out = node.outputs?.find(o => o.name === 'render_settings');
    const graph = node.graph;
    for (const id of (out?.links || [])) {
      const link = graph.getLink?.(id) ?? graph.links?.get?.(id) ?? graph.links?.[id];
      const target = link ? graph.getNodeById(link.target_id) : null;
      if (!target) continue;
      if (typeof target.onExecuted === 'function') {
        target.onExecuted({ text: [text] });
        shown++;
      }
    }
    graph.setDirtyCanvas?.(true, true);
  } catch (e) { console.warn('[Studio5090] could not push settings to display nodes', e); }
  return shown;
}

// v1.7.29: RETRIEVE SETTINGS uses the Windows file dialog.  The picked file
// is matched (by name and size) to the same file in ComfyUI's output or input
// folder, and the settings stored in it are read there.  Nothing is uploaded.
// v1.7.34: Open Workflow From Video.  Windows file dialog; the picked file is
// matched (by name and size) to the same file in ComfyUI's output or input
// folder, and the workflow stored inside it opens in a NEW tab, so the
// workflow you are working in is never replaced.
// Resolves to {ok, msg}, or null if the dialog was cancelled.
// v1.7.42: Open Workflow From File also takes .png and .json.  These are read
// in the browser; videos still go through ComfyUI's folders as before.
async function s5090WorkflowFromLocalFile(file) {
  const name = file.name.toLowerCase();
  if (name.endsWith('.json')) {
    const wf = JSON.parse(await file.text());
    return (wf && typeof wf === 'object' && Array.isArray(wf.nodes)) ? wf : null;
  }
  const buf = new Uint8Array(await file.arrayBuffer());
  const sig = [137, 80, 78, 71, 13, 10, 26, 10];
  if (buf.length < 8 || sig.some((b, i) => buf[i] !== b)) return null;
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let pos = 8;
  while (pos + 8 <= buf.length) {
    const len = dv.getUint32(pos);
    const type = String.fromCharCode(...buf.subarray(pos + 4, pos + 8));
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === 'IEND') break;
    if (type === 'tEXt' || type === 'iTXt') {
      const nul = data.indexOf(0);
      const key = new TextDecoder('latin1').decode(data.subarray(0, nul));
      if (key === 'workflow') {
        let body = data.subarray(nul + 1);
        if (type === 'iTXt') {               // flag, method, then two NUL-ended fields
          if (body[0] !== 0) return null;    // compressed iTXt is not used by ComfyUI
          let p = 2;
          p = body.indexOf(0, p) + 1;
          p = body.indexOf(0, p) + 1;
          body = body.subarray(p);
          return JSON.parse(new TextDecoder('utf-8').decode(body));
        }
        return JSON.parse(new TextDecoder('latin1').decode(body));
      }
    }
    pos += 12 + len;
  }
  return null;
}

function s5090OpenWorkflowFromVideo() {
  return new Promise(resolve => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'video/*,.mov,.mp4,.m4v,.png,.json';
    input.style.display = 'none';
    document.body.appendChild(input);
    let settled = false;
    const finish = (v) => { if (settled) return; settled = true; input.remove(); resolve(v); };
    input.addEventListener('cancel', () => finish(null));
    input.onchange = async () => {
      const file = input.files && input.files[0];
      if (!file) { finish(null); return; }
      const lower = file.name.toLowerCase();
      if (lower.endsWith('.png') || lower.endsWith('.json')) {
        try {
          const wf = await s5090WorkflowFromLocalFile(file);
          if (!wf) { finish({ ok: false, msg: 'No workflow in ' + file.name }); return; }
          await app.loadGraphData(wf, true, true, file.name.replace(/\.[^.]+$/, ''));
          finish({ ok: true, msg: 'Opened workflow from ' + file.name });
        } catch (e) {
          finish({ ok: false, msg: 'Could not open workflow: ' + e });
        }
        return;
      }
      try {
        const r = await fetch('/studio5090/workflow/read_picked', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: file.name, size: file.size, mtime: file.lastModified }),
        });
        const d = await r.json();
        if (!d.success || !d.workflow) {
          finish({ ok: false, msg: 'No workflow in ' + file.name });
          return;
        }
        const tabName = file.name.replace(/\.[^.]+$/, '');
        await app.loadGraphData(d.workflow, true, true, tabName);
        finish({ ok: true, msg: 'Opened workflow from ' + file.name });
      } catch (e) {
        finish({ ok: false, msg: 'Could not open workflow: ' + e });
      }
    };
    input.click();
  });
}

// Resolves to {file, text}, {error}, or null if the dialog was cancelled.
function pickSettingsFile() {
  return new Promise(resolve => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'video/*,.mov,.mp4,.m4v';
    input.style.display = 'none';
    document.body.appendChild(input);
    let settled = false;
    const finish = (v) => { if (settled) return; settled = true; input.remove(); resolve(v); };
    input.addEventListener('cancel', () => finish(null));
    input.onchange = async () => {
      const file = input.files && input.files[0];
      if (!file) { finish(null); return; }
      try {
        const r = await fetch('/studio5090/settings/read_picked', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: file.name, size: file.size, mtime: file.lastModified }),
        });
        const d = await r.json();
        if (d.success) finish({ file: file.name, text: d.text });
        else finish({ error: 'No settings found in ' + file.name, detail: d.text || '' });
      } catch (e) {
        finish({ error: 'Could not read settings: ' + e });
      }
    };
    input.click();
  });
}

// v1.5.7: dedicated angle picker for the Generate Single button. Mirrors
// the Create PM version. Simple vertical list of all 17 angles; click an
// entry to select.
// v1.6.0: Workflow picker modal. Two-tier sectioning — TEMPLATES at the
// top (the canonical product workflows shipped in templates/product_workflows/)
// then one collapsible section per project, alphabetized. Each entry is
// a workflow JSON filename. Click an entry to select; the onSelect
// callback receives (source, project, filename) where source is
// 'template' or 'project'.
function showWorkflowPicker(templates, projects, currentProject, onSelect) {
  document.getElementById('s5090-wf-picker')?.remove();
  document.getElementById('s5090-wf-overlay')?.remove();

  const overlay = document.createElement('div');
  overlay.id = 's5090-wf-overlay';
  Object.assign(overlay.style, {
    position:'fixed', inset:'0', background:'rgba(0,0,0,0.55)', zIndex:'99998',
  });

  const panel = document.createElement('div');
  panel.id = 's5090-wf-picker';
  Object.assign(panel.style, {
    position:'fixed', top:'50%', left:'50%',
    transform:'translate(-50%,-50%)',
    background:'#1a2626', border:'2px solid #0d9488',
    borderRadius:'8px', padding:'0', zIndex:'99999',
    width:'min(640px, 90vw)', maxHeight:'80vh',
    boxShadow:'0 8px 32px rgba(0,0,0,0.8)',
    display:'flex', flexDirection:'column',
  });

  const header = document.createElement('div');
  Object.assign(header.style, {
    display:'flex', justifyContent:'space-between', alignItems:'center',
    padding:'10px 14px', borderBottom:'1px solid #0d9488',
    background:'#111e1e', borderRadius:'6px 6px 0 0', flexShrink:'0',
  });
  const ttl = document.createElement('span');
  ttl.textContent = 'Open Workflow';
  ttl.style.cssText = 'color:#2dd4bf; font-weight:bold; font-size:13px;';

  // v1.6.1: Expand All / Collapse All toggle. Sections default to
  // collapsed; this button flips everything at once. Same UX pattern
  // as the image picker (introduced in v1.5.5).
  const sectionRefs = [];
  const expandBtn = document.createElement('button');
  expandBtn.textContent = '▸  Expand All';
  expandBtn.style.cssText = 'background:#0d9488; color:#fff; border:none; border-radius:4px; cursor:pointer; padding:5px 14px; font-size:12px; font-weight:bold; margin-right:8px;';
  expandBtn.onclick = () => {
    const anyCollapsed = sectionRefs.some(({ list }) => list.style.display === 'none');
    const shouldExpand = anyCollapsed;
    sectionRefs.forEach(({ arrow, list }) => {
      list.style.display = shouldExpand ? 'flex' : 'none';
      arrow.style.transform = shouldExpand ? 'rotate(0deg)' : 'rotate(-90deg)';
    });
    expandBtn.textContent = shouldExpand ? '▾  Collapse All' : '▸  Expand All';
  };

  const closeBtn = document.createElement('button');
  closeBtn.textContent = '✕  Close';
  closeBtn.style.cssText = 'background:#0d9488; color:#fff; border:none; border-radius:4px; cursor:pointer; padding:5px 14px; font-size:12px; font-weight:bold;';
  const cleanup = () => { panel.remove(); overlay.remove(); };
  closeBtn.onclick = cleanup;
  overlay.onclick  = cleanup;
  panel.addEventListener('click', e => e.stopPropagation());

  const headerButtons = document.createElement('div');
  headerButtons.style.cssText = 'display:flex; align-items:center;';
  headerButtons.appendChild(expandBtn);
  headerButtons.appendChild(closeBtn);

  header.appendChild(ttl);
  header.appendChild(headerButtons);
  panel.appendChild(header);

  const scroll = document.createElement('div');
  Object.assign(scroll.style, {
    overflowY:'auto', flex:'1', padding:'12px',
  });

  // Helper to make a section header + list of files. v1.6.1: sections
  // default collapsed; user clicks the section header or the Expand All
  // button to reveal their contents. v1.7.3: empty sections render too,
  // with a helpful placeholder instead of bailing silently — so all
  // projects the user has are discoverable in the picker.
  function makeSection(label, files, source, projectName, sectionColor) {
    files = files || [];
    const isEmpty = files.length === 0;

    const sectionHeader = document.createElement('div');
    Object.assign(sectionHeader.style, {
      display:'flex', alignItems:'center', justifyContent:'space-between',
      background:'#0d3838', borderLeft:`4px solid ${isEmpty ? '#557070' : sectionColor}`,
      borderRadius:'4px', padding:'10px 14px', marginBottom:'8px',
      marginTop:'4px', cursor:'pointer', userSelect:'none',
      transition:'background 0.15s ease',
    });
    sectionHeader.onmouseenter = () => sectionHeader.style.background = '#134e4a';
    sectionHeader.onmouseleave = () => sectionHeader.style.background = '#0d3838';

    const left = document.createElement('div');
    left.style.cssText = 'display:flex; align-items:center; gap:10px;';
    const arrow = document.createElement('span');
    arrow.textContent = '▼';
    // v1.6.1: default collapsed — arrow rotated to "right pointing" state.
    arrow.style.cssText = `color:${isEmpty ? '#557070' : sectionColor}; font-size:14px; transition:transform 0.15s ease; transform:rotate(-90deg);`;
    const name = document.createElement('span');
    name.textContent = label;
    name.style.cssText = `color:${isEmpty ? '#557070' : '#2dd4bf'}; font-size:15px; font-weight:bold;`;
    left.appendChild(arrow);
    left.appendChild(name);

    const pill = document.createElement('span');
    if (isEmpty) {
      pill.textContent = 'empty';
      pill.style.cssText = 'background:transparent; color:#557070; font-size:11px; font-weight:bold; padding:3px 10px; border-radius:10px; border:1px solid #557070;';
    } else {
      pill.textContent = `${files.length} workflow${files.length === 1 ? '' : 's'}`;
      pill.style.cssText = `background:${sectionColor}; color:#fff; font-size:11px; font-weight:bold; padding:3px 10px; border-radius:10px;`;
    }

    sectionHeader.appendChild(left);
    sectionHeader.appendChild(pill);

    const list = document.createElement('div');
    Object.assign(list.style, {
      // v1.6.1: default hidden.
      display:'none', flexDirection:'column', gap:'4px',
      marginBottom:'12px',
    });

    sectionHeader.onclick = () => {
      const isCollapsed = list.style.display === 'none';
      list.style.display = isCollapsed ? 'flex' : 'none';
      arrow.style.transform = isCollapsed ? 'rotate(0deg)' : 'rotate(-90deg)';
    };

    if (isEmpty) {
      // v1.7.3: placeholder body for empty sections.
      const emptyMsg = document.createElement('div');
      emptyMsg.style.cssText = 'color:#557070; font-size:12px; padding:8px 12px; font-style:italic; line-height:1.5;';
      emptyMsg.textContent = 'No saved workflows in this project yet. Use the Save Workflow button from within this project to add one.';
      list.appendChild(emptyMsg);
    } else {
      files.forEach(filename => {
        const row = document.createElement('div');
        Object.assign(row.style, {
          background:'#1f3232', border:'2px solid #0d3838',
          borderRadius:'5px', padding:'8px 12px',
          cursor:'pointer', transition:'background 0.12s ease',
          color:'#cccccc', fontSize:'12px',
          fontFamily:'"Courier New", monospace',
        });
        row.textContent = filename;
        row.onmouseenter = () => { row.style.background = '#234848'; row.style.borderColor = '#2dd4bf'; };
        row.onmouseleave = () => { row.style.background = '#1f3232'; row.style.borderColor = '#0d3838'; };
        row.onclick = () => {
          onSelect(source, projectName, filename);
          cleanup();
        };
        list.appendChild(row);
      });
    }

    // v1.6.1: register this section so the master Expand toggle can see it.
    sectionRefs.push({ arrow, list });

    scroll.appendChild(sectionHeader);
    scroll.appendChild(list);
  }

  // v1.7.23: the picker opens showing TEMPLATES and the current project only.
  // The "All Projects" button in the header reveals every project; press it
  // again to go back.  TEMPLATES is always listed.
  const projectNames = Object.keys(projects).sort();
  const hasCurrent = !!currentProject && projectNames.includes(currentProject);
  let showAll = !hasCurrent;
  const allBtn = document.createElement('button');
  allBtn.style.cssText = 'background:#d97706; color:#fff; border:none; border-radius:4px; cursor:pointer; padding:5px 14px; font-size:12px; font-weight:bold; margin-right:8px;';
  function renderSections() {
    scroll.innerHTML = '';
    sectionRefs.length = 0;
    expandBtn.textContent = '▸  Expand All';
    allBtn.textContent = showAll ? 'Current Project Only' : 'All Projects';
    if (templates.length) {
      makeSection('TEMPLATES', templates, 'template', null, '#d97706');
    }
    const colors = ['#0d9488', '#0891b2', '#0e7490', '#155e75', '#164e63'];
    projectNames.forEach(proj => {
      if (!showAll && proj !== currentProject) return;
      const color = colors[projectNames.indexOf(proj) % colors.length];
      makeSection(proj, projects[proj], 'project', proj, color);
      if (proj === currentProject) {          // the current project starts open
        const ref = sectionRefs[sectionRefs.length - 1];
        ref.list.style.display = 'flex';
        ref.arrow.style.transform = 'rotate(0deg)';
      }
    });
  }
  allBtn.onclick = () => { showAll = !showAll; renderSections(); };
  if (hasCurrent && projectNames.length > 1) {
    headerButtons.insertBefore(allBtn, headerButtons.firstChild);
  }
  renderSections();

  if (!templates.length && !projectNames.length) {
    const empty = document.createElement('div');
    empty.style.cssText = 'text-align:center; color:#557070; padding:40px; font-size:12px;';
    empty.textContent = 'No workflows or templates available yet.';
    scroll.appendChild(empty);
  }

  panel.appendChild(scroll);
  document.body.appendChild(overlay);
  document.body.appendChild(panel);
}

function showAnglePicker(angles, currentSuffix, onSelect) {
  document.getElementById('s5090-angle-picker')?.remove();
  document.getElementById('s5090-angle-overlay')?.remove();

  const overlay = document.createElement('div');
  overlay.id = 's5090-angle-overlay';
  Object.assign(overlay.style, {
    position:'fixed', inset:'0', background:'rgba(0,0,0,0.55)', zIndex:'99998',
  });

  const panel = document.createElement('div');
  panel.id = 's5090-angle-picker';
  Object.assign(panel.style, {
    position:'fixed', top:'50%', left:'50%',
    transform:'translate(-50%,-50%)',
    background:'#1a2626', border:'2px solid #0d9488',
    borderRadius:'8px', padding:'0', zIndex:'99999',
    width:'min(560px, 90vw)', maxHeight:'80vh',
    boxShadow:'0 8px 32px rgba(0,0,0,0.8)',
    display:'flex', flexDirection:'column',
  });

  const header = document.createElement('div');
  Object.assign(header.style, {
    display:'flex', justifyContent:'space-between', alignItems:'center',
    padding:'10px 14px', borderBottom:'1px solid #0d9488',
    background:'#111e1e', borderRadius:'6px 6px 0 0', flexShrink:'0',
  });
  const ttl = document.createElement('span');
  ttl.textContent = 'Pick an Angle for Generate Single';
  ttl.style.cssText = 'color:#2dd4bf; font-weight:bold; font-size:13px;';
  const closeBtn = document.createElement('button');
  closeBtn.textContent = '✕  Close';
  closeBtn.style.cssText = 'background:#0d9488; color:#fff; border:none; border-radius:4px; cursor:pointer; padding:5px 14px; font-size:12px; font-weight:bold;';
  const cleanup = () => { panel.remove(); overlay.remove(); };
  closeBtn.onclick = cleanup;
  overlay.onclick  = cleanup;
  panel.addEventListener('click', e => e.stopPropagation());
  header.appendChild(ttl);
  header.appendChild(closeBtn);
  panel.appendChild(header);

  const list = document.createElement('div');
  Object.assign(list.style, {
    overflowY:'auto', flex:'1', padding:'10px',
  });

  angles.forEach(a => {
    const row = document.createElement('div');
    const isSelected = a.suffix === currentSuffix;
    Object.assign(row.style, {
      display:'flex', alignItems:'center', justifyContent:'space-between',
      background: isSelected ? '#134e4a' : '#1f3232',
      border: `2px solid ${isSelected ? '#2dd4bf' : '#0d3838'}`,
      borderRadius:'5px', padding:'8px 12px', marginBottom:'5px',
      cursor:'pointer', transition:'background 0.12s ease',
    });

    const left = document.createElement('span');
    left.textContent = a.suffix;
    left.style.cssText = 'color:#2dd4bf; font-family:"Courier New",monospace; font-size:12px; font-weight:bold; min-width:240px;';

    const right = document.createElement('span');
    right.textContent = a.prompt;
    right.style.cssText = 'color:#cccccc; font-size:11px; margin-left:14px; text-align:right;';

    row.appendChild(left);
    row.appendChild(right);

    row.onmouseenter = () => { if (!isSelected) row.style.background = '#234848'; };
    row.onmouseleave = () => { if (!isSelected) row.style.background = '#1f3232'; };
    row.onclick = () => { onSelect(a.suffix); cleanup(); };

    list.appendChild(row);
  });

  panel.appendChild(list);
  document.body.appendChild(overlay);
  document.body.appendChild(panel);
}

// ── Project picker (DOM modal, v1.7.9) ───────────────────────────────────────
// Secondary modal invoked from the Select Project button inside showThumbPicker.
// Shows a scrollable list of all projects. The current picker project is
// highlighted teal. The workflow's own project is tagged "(workflow)" so the
// user always knows which one is "home" — clicking it returns the picker to
// its normal same-project view.
function showProjectPicker(projects, currentProject, workflowProject, onSelect) {
  document.getElementById('s5090-projpicker')?.remove();
  document.getElementById('s5090-projoverlay')?.remove();

  const overlay = document.createElement('div');
  overlay.id = 's5090-projoverlay';
  Object.assign(overlay.style, {
    position:'fixed', inset:'0', background:'rgba(0,0,0,0.55)',
    zIndex:'100000',  // above the main picker's 99999
  });

  const panel = document.createElement('div');
  panel.id = 's5090-projpicker';
  Object.assign(panel.style, {
    position:'fixed', top:'50%', left:'50%',
    transform:'translate(-50%,-50%)',
    background:'#1a2626', border:'2px solid #c2410c',
    borderRadius:'8px', zIndex:'100001',
    width:'min(420px, 90vw)', maxHeight:'70vh',
    display:'flex', flexDirection:'column',
    boxShadow:'0 8px 32px rgba(0,0,0,0.8)',
    fontFamily:'"Courier New", monospace',
  });

  const header = document.createElement('div');
  Object.assign(header.style, {
    display:'flex', justifyContent:'space-between', alignItems:'center',
    padding:'10px 14px', borderBottom:'1px solid #c2410c',
    background:'#111e1e', borderRadius:'6px 6px 0 0', flexShrink:'0',
  });
  const ttl = document.createElement('span');
  ttl.textContent = 'Select a Project to Browse';
  ttl.style.cssText = 'color:#fbbf24; font-weight:bold; font-size:13px;';

  const closeBtn = document.createElement('button');
  closeBtn.textContent = '✕  Cancel';
  closeBtn.style.cssText = 'background:#c2410c; color:#fff; border:none; border-radius:4px; cursor:pointer; padding:5px 14px; font-size:12px; font-weight:bold;';
  const cleanup = () => { panel.remove(); overlay.remove(); };
  closeBtn.onclick = cleanup;
  overlay.onclick  = cleanup;
  panel.addEventListener('click', e => e.stopPropagation());

  header.appendChild(ttl);
  header.appendChild(closeBtn);
  panel.appendChild(header);

  // Note explaining the workflow-project is not changed by this action.
  const note = document.createElement('div');
  note.style.cssText = 'color:#9ca3af; font-size:11px; padding:8px 14px; border-bottom:1px solid #0d3838; font-style:italic;';
  note.textContent = 'Choosing another project only changes what the picker shows. The workflow project stays as it is.';
  panel.appendChild(note);

  const list = document.createElement('div');
  Object.assign(list.style, {
    overflowY:'auto', flex:'1', padding:'10px',
  });

  if (!projects || !projects.length) {
    const empty = document.createElement('div');
    empty.style.cssText = 'text-align:center; color:#557070; padding:40px; font-size:12px;';
    empty.textContent = 'No projects found.';
    list.appendChild(empty);
  } else {
    const sorted = projects.slice().sort((a, b) => String(a).localeCompare(String(b)));
    sorted.forEach(proj => {
      const row = document.createElement('div');
      const isCurrent  = proj === currentProject;
      const isWorkflow = proj === workflowProject;
      Object.assign(row.style, {
        display:'flex', justifyContent:'space-between', alignItems:'center',
        background: isCurrent ? '#134e4a' : '#1f3232',
        border: `2px solid ${isCurrent ? '#2dd4bf' : '#0d3838'}`,
        borderRadius:'5px', padding:'10px 14px', marginBottom:'6px',
        cursor:'pointer', transition:'background 0.12s ease',
      });
      const nameEl = document.createElement('span');
      nameEl.textContent = proj;
      nameEl.style.cssText = 'color:#2dd4bf; font-size:13px; font-weight:bold;';
      row.appendChild(nameEl);

      if (isWorkflow) {
        const tag = document.createElement('span');
        tag.textContent = 'workflow';
        tag.style.cssText = 'background:#0d9488; color:#fff; font-size:10px; font-weight:bold; padding:2px 8px; border-radius:8px;';
        row.appendChild(tag);
      }

      row.onmouseenter = () => { if (!isCurrent) row.style.background = '#234848'; };
      row.onmouseleave = () => { if (!isCurrent) row.style.background = '#1f3232'; };
      row.onclick = () => {
        cleanup();
        if (proj !== currentProject) onSelect(proj);
      };

      list.appendChild(row);
    });
  }

  panel.appendChild(list);
  document.body.appendChild(overlay);
  document.body.appendChild(panel);
}

// ── Thumbnail picker (DOM modal) ──────────────────────────────────────────────
// v1.7.9: optional 6th arg `crossProjectContext` enables the Select Project
// button in the picker header. When present, the shape is:
//   {
//     currentProject:    string,    // the project currently being browsed
//     workflowProject:   string,    // the workflow's own project (for orientation)
//     availableProjects: string[],  // list to show in the chooser
//     onProjectChange:   async (newProject) => void
//                                   // called when the user picks a different
//                                   // project. Caller is expected to re-invoke
//                                   // showThumbPicker with the new project's
//                                   // images. Any existing picker is replaced.
//   }
// When crossProjectContext is undefined, the picker behaves exactly as it
// did in v1.7.8 — no Select Project button, no project indicator.
//
// v1.7.10: optional 7th arg `lazyLoadContext` switches to per-section
// lazy loading. When present:
//   * The 1st arg (`images`) is treated as a folder manifest of shape
//     { folders: string[], counts: { [folder]: number } } instead of a
//     flat image array.
//   * Section grids render empty on picker open — no upfront fetch of
//     any folder's contents.
//   * The first time the user twirls a section open, that section's
//     contents are fetched via lazyLoadContext.fetchFolder(sectionKey)
//     and cached on the section object. Subsequent twirls of the same
//     section reuse the cache — no refetch.
//   Shape:
//     {
//       fetchFolder: async (sectionKey) => string[]  // tagged filenames
//     }
//   When lazyLoadContext is undefined, the picker behaves as before —
//   the 1st arg is a flat image array, everything renders on open.
function showThumbPicker(images, currentValue, urlBuilder, title, onSelect, crossProjectContext, lazyLoadContext) {
  document.getElementById('s5090-picker')?.remove();
  document.getElementById('s5090-overlay')?.remove();

  const overlay = document.createElement('div');
  overlay.id = 's5090-overlay';
  Object.assign(overlay.style, {
    position:'fixed', inset:'0', background:'rgba(0,0,0,0.55)',
    zIndex:'99998',
  });

  const panel = document.createElement('div');
  panel.id = 's5090-picker';
  Object.assign(panel.style, {
    position:'fixed', top:'50%', left:'50%',
    transform:'translate(-50%,-50%)',
    background:'#1a2626', border:'2px solid #0d9488',
    borderRadius:'8px', zIndex:'99999',
    width:'700px', maxHeight:'540px',
    display:'flex', flexDirection:'column',
    boxShadow:'0 8px 40px rgba(0,0,0,0.8)',
    fontFamily:'"Courier New", monospace',
  });

  const header = document.createElement('div');
  Object.assign(header.style, {
    display:'flex', justifyContent:'space-between', alignItems:'center',
    padding:'10px 14px', borderBottom:'1px solid #0d9488',
    background:'#111e1e', borderRadius:'6px 6px 0 0', flexShrink:'0',
  });
  const ttl = document.createElement('span');
  ttl.textContent = title;
  ttl.style.cssText = 'color:#2dd4bf; font-weight:bold; font-size:13px;';

  const closeBtn = document.createElement('button');
  closeBtn.textContent = '✕  Close';
  closeBtn.style.cssText = 'background:#0d9488; color:#fff; border:none; border-radius:4px; cursor:pointer; padding:5px 14px; font-size:12px; font-weight:bold;';

  // v1.5.5: Expand Toggle. Tracks all sections built below so a single
  // click can collapse-all or expand-all. Each section pushes its arrow
  // element and grid element into `sectionRefs`; the toggle iterates them.
  // Button behavior: looks at the actual section states and inverts. If
  // any section is currently collapsed, expand all; otherwise collapse all.
  // This stays correct even when the user has manually toggled individual
  // sections before clicking the master button.
  const sectionRefs = [];
  const expandBtn = document.createElement('button');
  expandBtn.textContent = '▸  Expand All';
  expandBtn.style.cssText = 'background:#0d9488; color:#fff; border:none; border-radius:4px; cursor:pointer; padding:5px 14px; font-size:12px; font-weight:bold; margin-right:8px;';
  expandBtn.onclick = async () => {
    // If any section is collapsed, the next action is to expand everything.
    // Otherwise (all expanded), the next action is to collapse everything.
    const anyCollapsed = sectionRefs.some(({ grid }) => grid.style.display === 'none');
    const shouldExpand = anyCollapsed;
    if (shouldExpand) {
      // v1.7.10: in lazy mode, opening a section requires a fetch.
      // Expand-all triggers all not-yet-loaded sections concurrently and
      // awaits them. In eager mode ensurePopulated is a no-op wrapper
      // around already-in-memory data, so this stays cheap.
      expandBtn.textContent = '…  Loading';
      expandBtn.disabled = true;
      try {
        await Promise.all(sectionRefs.map(ref =>
          ref.ensurePopulated ? ref.ensurePopulated() : Promise.resolve()));
      } finally {
        expandBtn.disabled = false;
      }
    }
    sectionRefs.forEach(({ arrow, grid }) => {
      grid.style.display = shouldExpand ? 'grid' : 'none';
      arrow.style.transform = shouldExpand ? 'rotate(0deg)' : 'rotate(-90deg)';
    });
    expandBtn.textContent = shouldExpand ? '▾  Collapse All' : '▸  Expand All';
  };

  // v1.5.4: floating filename label. One shared DOM element per modal open;
  // populated and repositioned on hover. Appears immediately (no browser
  // tooltip delay). Z-index above the picker modal (which is 99999) so it
  // floats above all thumbnails.
  //
  // v1.5.6: declared BEFORE cleanup() so removal is part of cleanup itself.
  // Every close path (Close button, overlay click, thumbnail click) goes
  // through the same cleanup function, so no path can orphan the label
  // in the DOM. The defensive `getElementById` removal at the top also
  // catches the (rare) case of an existing label from a prior session.
  document.getElementById('s5090-float-label')?.remove();
  const floatLabel = document.createElement('div');
  floatLabel.id = 's5090-float-label';
  Object.assign(floatLabel.style, {
    position:'fixed', display:'none', zIndex:'100001',
    background:'rgba(20,30,30,0.95)', color:'#2dd4bf',
    border:'1px solid #0d9488', borderRadius:'4px',
    padding:'6px 10px', fontSize:'12px', fontFamily:'"Courier New", monospace',
    pointerEvents:'none', maxWidth:'500px', wordBreak:'break-all',
    boxShadow:'0 2px 8px rgba(0,0,0,0.6)',
  });
  document.body.appendChild(floatLabel);

  // v1.5.6: cleanup now removes the floating label too. Single source of
  // truth — every close path calls this same function.
  const cleanup = () => {
    floatLabel.remove();
    panel.remove();
    overlay.remove();
  };
  closeBtn.onclick = cleanup;
  overlay.onclick  = cleanup;

  panel.addEventListener('click', e => e.stopPropagation());

  // Header right side groups the buttons so they sit together.
  const headerRight = document.createElement('div');
  headerRight.style.cssText = 'display:flex; align-items:center;';

  // v1.7.9: Select Project button (only if cross-project browsing is enabled).
  // Shows the current picker project as the button label. Orange to signal
  // it's a context-switching control, distinct from the teal picker chrome.
  // When picker is browsing a different project than the workflow, the
  // button gets a highlighted border as an extra visual cue.
  if (crossProjectContext) {
    const projBtn = document.createElement('button');
    const isCrossProject = crossProjectContext.currentProject !== crossProjectContext.workflowProject;
    projBtn.textContent = `📁  ${crossProjectContext.currentProject}`;
    projBtn.title = 'Browse images from a different project.  The workflow project is not changed.';
    projBtn.style.cssText =
      `background:${isCrossProject ? '#c2410c' : '#0d9488'}; color:#fff; ` +
      `border:${isCrossProject ? '2px solid #fbbf24' : 'none'}; ` +
      `border-radius:4px; cursor:pointer; padding:5px 14px; ` +
      `font-size:12px; font-weight:bold; margin-right:8px; ` +
      `font-family:"Courier New", monospace;`;
    projBtn.onclick = (e) => {
      e.stopPropagation();
      showProjectPicker(
        crossProjectContext.availableProjects,
        crossProjectContext.currentProject,
        crossProjectContext.workflowProject,
        (newProj) => { crossProjectContext.onProjectChange(newProj); }
      );
    };
    headerRight.appendChild(projBtn);
  }

  headerRight.appendChild(s5090SortSelect(() => sectionRefs.forEach(r => r.resort && r.resort())));
  headerRight.appendChild(expandBtn);
  headerRight.appendChild(closeBtn);

  header.appendChild(ttl);
  header.appendChild(headerRight);
  panel.appendChild(header);

  // v1.5.4: scrollable outer container holds the section blocks.
  const scrollArea = document.createElement('div');
  Object.assign(scrollArea.style, {
    overflowY:'auto', flex:'1', padding:'12px',
  });

  if (lazyLoadContext) {
    // v1.7.10 lazy mode. `images` is a folder manifest.
    const manifest = images || { folders: [], counts: {} };
    if (!manifest.folders || manifest.folders.length === 0) {
      const empty = document.createElement('div');
      empty.style.cssText = 'text-align:center; color:#557070; padding:40px; font-size:12px;';
      empty.textContent = 'No images found in this project.';
      scrollArea.appendChild(empty);
    } else {
      // Section ordering: CREATE, EDITS, CHARACTERS, then MULTIANGLE:<subject>
      // alphabetized. Manifest may arrive in any order; sort to match the
      // eager-mode picker's ordering for consistency.
      const orderedSections = [];
      if (manifest.folders.includes('CREATE'))     orderedSections.push('CREATE');
      if (manifest.folders.includes('EDITS'))      orderedSections.push('EDITS');
      if (manifest.folders.includes('CHARACTERS')) orderedSections.push('CHARACTERS');
      if (manifest.folders.includes('GRAB'))       orderedSections.push('GRAB');
      const multi = manifest.folders.filter(k => k.startsWith('MULTIANGLE')).sort();
      orderedSections.push(...multi);

      orderedSections.forEach(sectionKey => {
        const count = manifest.counts[sectionKey] || 0;
        buildSection({
          key:            sectionKey,
          count:          count,
          fetchOnExpand:  async () => await lazyLoadContext.fetchFolder(sectionKey),
        });
      });
    }
  } else if (!images || images.length === 0) {
    const empty = document.createElement('div');
    empty.style.cssText = 'text-align:center; color:#557070; padding:40px; font-size:12px;';
    empty.textContent = 'No images found in this folder.';
    scrollArea.appendChild(empty);
  } else {
    // Eager mode (backward compat, all pre-v1.7.10 call sites).
    // Bucket by inner-tag and render every section's contents inline.
    // v1.5.4: group images by source-folder tag. Each tag becomes its own
    // collapsible section. The tag prefix in filenames is one of:
    //   [CREATE], [EDITS], [CHARACTERS], [MULTIANGLE:<subject>]
    // v1.7.9: cross-project items ([@PROJECT|TAG] filename) bucket by
    // their inner tag so they land in the same section as same-project
    // items (a cross-project CREATE joins the CREATE bucket).
    const buckets = new Map();
    images.forEach(filename => {
      const innerTag = innerTagOf(filename);
      const m = innerTag.match(/^(\w+)(?::(.+))?$/);
      const tag = m?.[1];
      const subj = m?.[2];
      const sectionKey = tag ? (subj ? `${tag}:${subj}` : tag) : 'OTHER';
      if (!buckets.has(sectionKey)) buckets.set(sectionKey, []);
      buckets.get(sectionKey).push(filename);
    });

    const order = [];
    if (buckets.has('CREATE'))     order.push('CREATE');
    if (buckets.has('EDITS'))      order.push('EDITS');
    if (buckets.has('CHARACTERS')) order.push('CHARACTERS');
    if (buckets.has('GRAB'))       order.push('GRAB');
    const multiKeys = Array.from(buckets.keys()).filter(k => k.startsWith('MULTIANGLE')).sort();
    order.push(...multiKeys);
    if (buckets.has('OTHER')) order.push('OTHER');

    order.forEach(sectionKey => {
      const items = buckets.get(sectionKey);
      buildSection({
        key:           sectionKey,
        count:         items.length,
        // Eager mode: content is already in memory; wrap in async for uniformity.
        fetchOnExpand: async () => items,
      });
    });
  }

  // ── Section builder — shared by eager and lazy modes ─────────────────────
  // Called for each section. Renders the header (with count pill), the
  // (initially empty) grid, and wires up the twirl-toggle. In lazy mode,
  // the first twirl fires fetchOnExpand and populates the grid. In eager
  // mode, fetchOnExpand returns a pre-computed array synchronously (via
  // Promise wrapping) so the same code path handles both.
  function buildSection({ key, count, fetchOnExpand }) {
    // Guard: skip sections with zero items (in lazy mode this can happen
    // if the manifest reports a 0 count for a folder; in eager mode empty
    // buckets are already filtered out upstream but the guard is cheap
    // insurance).
    if (count === 0) return;

    const sectionColor = colorForSectionKey(key);

    const sectionHeader = document.createElement('div');
    Object.assign(sectionHeader.style, {
      display:'flex', alignItems:'center', justifyContent:'space-between',
      background:'#0d3838', borderLeft:`4px solid ${sectionColor}`,
      borderRadius:'4px', padding:'10px 14px', marginBottom:'8px',
      marginTop:'4px', cursor:'pointer', userSelect:'none',
      transition:'background 0.15s ease',
    });
    sectionHeader.onmouseenter = () => sectionHeader.style.background = '#134e4a';
    sectionHeader.onmouseleave = () => sectionHeader.style.background = '#0d3838';

    const headerLeft = document.createElement('div');
    headerLeft.style.cssText = 'display:flex; align-items:center; gap:10px;';

    const arrow = document.createElement('span');
    arrow.textContent = '▼';
    arrow.style.cssText = `color:${sectionColor}; font-size:14px; transition:transform 0.15s ease; transform:rotate(-90deg);`;

    const sectionName = document.createElement('span');
    sectionName.textContent = key;
    sectionName.style.cssText = 'color:#2dd4bf; font-size:15px; font-weight:bold;';

    headerLeft.appendChild(arrow);
    headerLeft.appendChild(sectionName);

    const countPill = document.createElement('span');
    countPill.textContent = `${count} image${count === 1 ? '' : 's'}`;
    countPill.style.cssText = `background:${sectionColor}; color:#fff; font-size:11px; font-weight:bold; padding:3px 10px; border-radius:10px;`;

    sectionHeader.appendChild(headerLeft);
    sectionHeader.appendChild(countPill);

    const sectionGrid = document.createElement('div');
    Object.assign(sectionGrid.style, {
      display:'none',
      gridTemplateColumns:'repeat(auto-fill, minmax(150px, 1fr))',
      gap:'8px', marginBottom:'16px',
    });

    // v1.7.10: fetch-once-and-cache. Grid content is populated on first
    // twirl-open. Subsequent twirls just toggle display — no refetch.
    let contentFetched = false;
    let contentFetching = false;

    // v1.7.49: cells are drawn by renderCells so the Sort choice can redraw
    // a section that is already open.
    let lastItems = null;
    function renderCells(list) {
      list.forEach(filename => {
        const cellColor = colorForFile(filename);
        const cell = document.createElement('div');
        const isSelected = currentValue === filename;
        Object.assign(cell.style, {
          background:   isSelected ? '#134e4a' : '#1f3232',
          border:       `2px solid ${isSelected ? '#2dd4bf' : cellColor}`,
          borderRadius: '6px', padding:'6px', cursor:'pointer', textAlign:'center',
        });

        const img = document.createElement('img');
        img.src = urlBuilder(filename);
        img.style.cssText = 'width:100%; height:110px; object-fit:cover; border-radius:4px; display:block;';

        const noImg = document.createElement('div');
        noImg.style.cssText = 'width:100%; height:110px; display:none; align-items:center; justify-content:center; color:#557070; font-size:10px; flex-direction:column;';
        noImg.innerHTML = '<span style="font-size:24px">🖼</span><br>No preview';
        img.onerror = () => { img.style.display='none'; noImg.style.display='flex'; };

        // v1.7.10: strip both the tag prefix AND any @PROJECT| cross-project
        // prefix from the visible label. Section header + section color
        // already carry the source info; the label just needs the filename.
        const displayName = filename
          .replace(/^\[@[^|\]]+\|[^\]]+\] /, '')
          .replace(/^\[(CREATE|EDITS|CHARACTERS|GRAB|MULTIANGLE[^\]]*)\] /, '');

        const lbl = document.createElement('div');
        lbl.textContent = displayName.length>20 ? displayName.slice(0,19)+'…' : displayName;
        lbl.style.cssText = 'color:#cccccc; font-size:9px; margin-top:3px; word-break:break-all;';

        cell.appendChild(img);
        cell.appendChild(noImg);
        cell.appendChild(lbl);

        const showLabel = (e) => {
          floatLabel.textContent = filename;
          floatLabel.style.display = 'block';
          floatLabel.style.left = (e.clientX + 14) + 'px';
          floatLabel.style.top  = (e.clientY + 14) + 'px';
        };
        cell.onmouseenter = (e) => {
          if (!isSelected) cell.style.border = '2px solid #2dd4bf';
          showLabel(e);
        };
        cell.onmousemove = showLabel;
        cell.onmouseleave = () => {
          if (!isSelected) cell.style.border = `2px solid ${cellColor}`;
          floatLabel.style.display = 'none';
        };
        cell.onclick = () => { onSelect(filename); cleanup(); };

        sectionGrid.appendChild(cell);
      });
    }

    async function populateGrid() {
      contentFetching = true;
      // Loading indicator while the fetch is in flight. Kept simple —
      // one line of italic muted text. Removed as soon as thumbnails
      // are appended.
      const loading = document.createElement('div');
      loading.style.cssText = 'color:#557070; font-size:12px; padding:16px; font-style:italic; grid-column:1/-1;';
      loading.textContent = 'Loading thumbnails…';
      sectionGrid.appendChild(loading);

      let items = [];
      try {
        items = await fetchOnExpand();
      } catch (e) {
        console.error('[PM] section fetch failed', key, e);
        loading.textContent = 'Failed to load. Close and reopen the picker to retry.';
        loading.style.color = '#f87171';
        contentFetching = false;
        return;
      }

      sectionGrid.removeChild(loading);

      // v1.7.49: sorted by the picker's Sort choice (newest first by default).
      lastItems = items;
      renderCells(s5090SortItems(items));

      contentFetched = true;
      contentFetching = false;
    }

    sectionRefs.push({
      arrow,
      grid: sectionGrid,
      // v1.7.10: Expand All has to trigger fetches for all not-yet-loaded
      // sections when it opens them. This exposes the populate call so the
      // master toggle can await it.
      ensurePopulated: async () => {
        if (!contentFetched && !contentFetching) await populateGrid();
      },
      resort: () => {
        if (!lastItems) return;
        sectionGrid.innerHTML = '';
        renderCells(s5090SortItems(lastItems));
      },
    });

    sectionHeader.onclick = async () => {
      const isCollapsed = sectionGrid.style.display === 'none';
      if (isCollapsed && !contentFetched && !contentFetching) {
        await populateGrid();
      }
      sectionGrid.style.display = isCollapsed ? 'grid' : 'none';
      arrow.style.transform = isCollapsed ? 'rotate(0deg)' : 'rotate(-90deg)';
    };

    scrollArea.appendChild(sectionHeader);
    scrollArea.appendChild(sectionGrid);
  }

  panel.appendChild(scrollArea);
  document.body.appendChild(overlay);
  document.body.appendChild(panel);
}

// ── Section heights (computeSize and draw share these) ───────────────────────
// v1.7.24: the Save Workflow / Open Workflow section is switched off.
// ComfyUI's own File menu is the one way to save and open workflows.
// The templates folder and each project's workflows folder are unchanged.
// Set this to true to bring the section back.
const SHOW_WORKFLOWS = false;

const HEIGHTS = {
  // v1.6.0: new top-most section. Two side-by-side buttons for Save/Open.
  workflows:
    (C.LABEL_H+6) +              // header
    (C.BTN_H+5),                 // save/open buttons row
  selectProject:
    (C.LABEL_H+6) +              // header
    (C.BTN_H+5),                 // refresh + project dropdown
  createProject:
    (C.LABEL_H+6) +              // header
    (C.ROW_H+5) +                // project name input
    (C.BTN_H+5),                 // create project button
  // v1.7.19: RETRIEVE SETTINGS. Header and one button, nothing else.
  retrieveSettings:
    (C.LABEL_H+6) +              // header
    (C.BTN_H+5),                 // Fetch Data From Video button
  multianglePanel:
    (C.LABEL_H+6) +              // accent header
    C.PANEL_PAD +                // top inner pad
    (C.ROW_H+5) +                // source image
    (C.ROW_H+5) +                // subject name
    (C.ROW_H+5) +                // prompt modifier
    (C.BTN_H+5) +                // Generate All Angles (17) button
    (C.ROW_H+5) +                // v1.5.8: angle dropdown
    (C.BTN_H+5) +                // v1.5.8: Generate Single Angle button
    C.PANEL_PAD,                 // bottom inner pad
  frameMode:
    (C.LABEL_H+6) +              // header
    (C.ROW_H+5) +                // first frame
    (C.ROW_H+5) +                // last frame
    12 +                         // spacer
    (C.BTN_H+5),                 // SF/FL radio
  videoOutput:
    (C.LABEL_H+6) +              // header
    (C.ROW_H+5) +                // scene name
    32,                          // derived path hints
  previews:
    C.THUMB_H + 10,
  status:
    (C.ROW_H+5),
};

// ── Main factory ──────────────────────────────────────────────────────────────
function buildProjectManagerWidget(node) {

  // Native widgets — kept in node.widgets, hidden visually, serialized natively.
  // Same persistence pattern as the camera widget. NEVER replace node.widgets.
  const NATIVE = [
    'new_project_name',
    'project',
    'subject',
    'source_image',
    'first_frame',
    'last_frame',
    'frame_mode',
    'video_name',
    'prompt_modifier',
    // v1.5.7: backs the Generate Single button. Holds the angle suffix.
    'selected_angle',
    // v1.7.19: text read from a finished video by Fetch Data From Video.
    'render_settings',
  ];

  const nativeWidgets = {};
  for (const name of NATIVE) {
    const w = node.widgets?.find(w => w.name === name);
    if (w) {
      nativeWidgets[name] = w;
      w.computeSize = () => [0, -4];
      w.draw        = () => {};
    }
  }

  // v1.7.21: fetched settings are for this session only.  They are never
  // written into the saved workflow file.
  if (nativeWidgets.render_settings) nativeWidgets.render_settings.serialize = false;

  const getW = (name) => nativeWidgets[name]?.value ?? '';
  const setW = (name, value) => {
    const w = nativeWidgets[name];
    if (!w) return;
    if (w.value === value) return;
    w.value = value;
    if (typeof w.callback === 'function') {
      try { w.callback(value); } catch (e) {}
    }
  };

  // UI-only state
  const ui = {
    newProjectName: '',
    projects: [],
    frameImages: [],
    status: '',
    statusOk: true,
    qwenRunning: false,
    qwenProgress: 0,
    // v1.5.7: angles list (static) + flag for single-angle generation.
    angles: [],
    qwenSingleRunning: false,
  };

  let regions      = [];
  let statusTimer  = null;

  // ── URL builders ─────────────────────────────────────────────────────────
  function thumbUrlFor(taggedFilename) {
    if (!taggedFilename) return '';
    // v1.7.9: cross-project tags carry the source project as an @PROJECT|
    // prefix. Extract it and use it for the thumbnail fetch URL.  Regular
    // (same-project) tags fall through to the workflow's current project.
    let project = getW('project');
    let folder, fname;
    const cp = taggedFilename.match(/^\[@([^|\]]+)\|([^\]]+)\] (.+)$/);
    if (cp) {
      project = cp[1];
      folder  = cp[2];
      fname   = cp[3];
    } else {
      const m = taggedFilename.match(/^\[([^\]]+)\] (.+)$/);
      if (!m) return '';
      folder = m[1];
      fname  = m[2];
    }
    return `/studio5090/thumbnail?project=${enc(project)}&subject=${enc(getW('subject'))}&folder=${enc(folder)}&file=${enc(fname)}`;
  }

  // v1.7.9: fetch frame images from an arbitrary project. When the source
  // project differs from the workflow project, tags are pre-wrapped with
  // the @PROJECT| prefix so the picker, the URL builder, and the ultimate
  // resolve_image call downstream all speak the same cross-project idiom.
  async function loadFrameImagesForProject(sourceProject) {
    const wfProject = getW('project');
    try {
      const ma = await api.get(
        `/studio5090/all_frame_images?project=${enc(sourceProject)}&subject=`
      );
      let imgs = ma.images || [];
      const pre = f => {
        const m = f.match(/^\[([^\]]+)\] (.+)$/);
        return m ? `[@${sourceProject}|${m[1]}] ${m[2]}` : f;
      };
      s5090RememberMtimes(ma, sourceProject !== wfProject ? pre : null);
      if (sourceProject !== wfProject) {
        imgs = imgs.map(pre);
      }
      return imgs;
    } catch (e) {
      console.error('[PM] loadFrameImagesForProject', e);
      return [];
    }
  }

  // ── API loaders ──────────────────────────────────────────────────────────
  async function loadProjects() {
    try {
      const d = await api.get('/studio5090/projects');
      ui.projects = d.projects || [];
    } catch (e) { console.error('[PM] loadProjects', e); }
  }

  async function loadFrameImages() {
    const project = getW('project');
    if (!project) { ui.frameImages = []; return; }
    try {
      // v1.7.8: single call to /studio5090/all_frame_images with an
      // empty subject param. The backend walks CREATE, EDITS,
      // CHARACTERS, AND every subfolder under MULTIANGLE — including
      // SINGLES, which is where a single-angle multiangle generated
      // from a CREATE/EDITS/CHARACTERS source lands. The `subject`
      // query param is legacy on this endpoint: the walk does not
      // filter by it.
      //
      // Prior versions called this endpoint N times in a loop, once
      // per subject returned by /studio5090/subjects. Two problems
      // with that: (1) `subjects` deliberately excludes reserved
      // system folder names (SINGLES) so if a project's only
      // multiangle output was in SINGLES with no named subjects yet,
      // the loop iterated zero times and the MULTIANGLE tree stayed
      // invisible in the SF/FL picker. (2) Every iteration returned
      // the same complete list, deduped, so N-1 calls were wasted
      // network round trips.
      const ma = await api.get(
        `/studio5090/all_frame_images?project=${enc(project)}&subject=`
      );
      ui.frameImages = ma.images || [];
      s5090RememberMtimes(ma);
    } catch (e) { console.error('[PM] loadFrameImages', e); }
  }

  async function refresh() {
    await loadProjects();
    await loadFrameImages();
    // v1.7.46: Refresh also writes every personal copy in STUDIO5090 to the ComfyUI log.
    let mine = [];
    try { mine = ((await api.get('/studio5090/overrides?log=1')).overrides || []).map(o => o.label); }
    catch (e) { console.error('[RenderPM] overrides', e); }
    setStatus(mine.length ? `Refreshed ✓  Using your copy in STUDIO5090: ${mine.join(', ')}` : 'Refreshed ✓', true);
    redraw();
  }

  // v1.5.7: load the 17 Qwen angles once at init for the Generate Single
  // dropdown. The list is static across the toolkit's lifetime.
  async function loadAngles() {
    try {
      const d = await api.get('/studio5090/qwen_angles');
      ui.angles = d.angles || [];
    } catch (e) { console.error('[PM] loadAngles', e); }
  }

  async function initialPopulate() {
    await loadProjects();
    if (getW('project')) {
      await loadFrameImages();
    }
    await loadAngles();
    redraw();
  }

  // ── Mutations ────────────────────────────────────────────────────────────
  async function createProject() {
    const name = ui.newProjectName.trim();
    if (!name) { setStatus('Enter a project name', false); redraw(); return; }
    try {
      const d = await api.post('/studio5090/create_project', { project_name: name });
      if (d.success) {
        setStatus(`Created: ${name} ✓`, true);
        ui.newProjectName = '';
        await loadProjects();
        clearRenderSettings();   // v1.7.21: new project, old settings no longer apply
        setW('project', name);
        setW('subject', '');
        setW('source_image', '');
        setW('first_frame', '');
        setW('last_frame', '');
        setW('video_name', '');
        await loadFrameImages();
      } else if (d.exists) {
        // v1.7.46: popup with Switch to it / OK.
        await loadProjects();
        const real = ui.projects.find(p => p.toLowerCase() === name.toLowerCase()) || name;
        if (await showProjectExists(real) === 'switch') {
          if (real !== getW('project')) clearRenderSettings();
          ui.newProjectName = '';
          setW('project', real);
          setW('subject', '');
          setW('source_image', '');
          setW('first_frame', '');
          setW('last_frame', '');
          await loadFrameImages();
          setStatus(`Switched to: ${real} ✓`, true);
        } else {
          setStatus(`'${real}' already exists`, false);
        }
      } else {
        setStatus(`Error: ${d.error}`, false);
      }
    } catch (e) {
      setStatus('Create failed', false);
      console.error('[PM]', e);
    }
    redraw();
  }

  // ── Source image picker — CREATE + EDITS + all MULTIANGLE ────────────────
  async function openSourceImagePicker() {
    const project = getW('project');
    if (!project) { setStatus('Select a project first', false); redraw(); return; }

    // v1.7.1: always refresh directory listing before opening picker so newly
    // added images appear without requiring a manual Refresh button press.
    await loadFrameImages();
    if (!ui.frameImages.length) {
      setStatus('No images found in project', false); redraw(); return;
    }

    showThumbPicker(ui.frameImages, getW('source_image'),
      fn => {
        const m = fn.match(/^\[([^\]]+)\] (.+)$/);
        if (!m) return '';
        return `/studio5090/thumbnail?project=${enc(project)}&folder=${encodeURIComponent(m[1])}&file=${enc(m[2])}`;
      },
      `Source Image — ${project} (CREATE + EDITS + CHARACTERS + GRAB + MULTIANGLE)`,
      val => { setW('source_image', val); redraw(); }
    );
  }

  // ── Qwen batch ───────────────────────────────────────────────────────────
  async function runQwenBatch() {
    const project     = getW('project');
    const subjectName = getW('subject').trim();
    const sourceImage = getW('source_image');
    const promptMod   = (getW('prompt_modifier') || '').trim();

    if (!project)     { setStatus('Select a project first', false); redraw(); return; }
    if (!sourceImage) { setStatus('Pick a source image first', false); redraw(); return; }
    if (!subjectName) { setStatus('Enter a subject name first', false); redraw(); return; }
    if (ui.qwenRunning) { setStatus('Batch already running…', false); redraw(); return; }

    let srcPath = '';
    try {
      const resolved = await api.get(
        `/studio5090/resolve_image_path?project=${enc(project)}&subject=${enc(subjectName)}&tagged=${enc(sourceImage)}`
      );
      if (!resolved.exists) {
        setStatus('Source image file not found on disk', false); redraw();
        return;
      }
      srcPath = resolved.path;
    } catch (e) {
      setStatus('Could not resolve source image path', false); redraw();
      return;
    }

    // Collision check — warn if MULTIANGLE/<subjectName>/ already has images.
    let existsWarning = '';
    try {
      const ck = await api.get(
        `/studio5090/check_subject_exists?project=${enc(project)}&subject=${enc(subjectName)}`
      );
      if (ck.exists && ck.image_count > 0) {
        existsWarning =
          `⚠  Folder '${subjectName}' already exists with ${ck.image_count} image(s).\n` +
          `New batch will be ADDED (existing files kept, ComfyUI auto-increments filenames).\n\n`;
      }
    } catch (e) {
      // Non-fatal — proceed without the warning.
      console.warn('[PM] collision check failed', e);
    }

    const confirmed = await showConfirm(
      existsWarning +
      'About to queue and process 17 images.\n\n' +
      'Project: ' + project + '\n' +
      'Subject (output folder): ' + subjectName + '\n' +
      (promptMod ? 'Prompt modifier: ' + promptMod + '\n' : '') +
      '\nProceed?'
    );
    if (!confirmed) { ui.qwenRunning = false; redraw(); return; }

    ui.qwenRunning = true; ui.qwenProgress = 0;
    setStatus('Queuing 17 angles…'); redraw();

    try {
      const workflow = buildQwenWorkflow();
      const d = await api.post('/studio5090/queue_qwen_batch', {
        project,
        subject:           subjectName,
        output_subject:    subjectName,
        source_image_path: srcPath,
        prompt_modifier:   promptMod,
        workflow,
      });
      if (d.success) {
        setStatus(`Queued ${d.queued}/17 → ${d.subject_used || subjectName} ✓`, true);
        // New MA folder might affect frame picker — reload.
        await loadFrameImages();
      } else {
        setStatus(`Queue error: ${d.error}`, false);
      }
    } catch (e) {
      setStatus('Queue failed — check console', false);
      console.error('[PM Qwen]', e);
    }
    ui.qwenRunning = false;
    redraw();
  }

  // v1.5.7: Generate Single. Renders one angle (selected from the dropdown)
  // from the source image. Output naming follows option 2:
  //   - Source from MULTIANGLE/<subject>/ → MULTIANGLE/<subject>/<stem>_oneoff_<angle>
  //   - Else (CREATE/EDITS/CHARACTERS)   → MULTIANGLE/SINGLES/<stem>_<angle>
  // No 17-pass warning; this is one render.
  async function runQwenSingle() {
    const project     = getW('project');
    const sourceImage = getW('source_image');
    const angleSuffix = getW('selected_angle');
    const promptMod   = (getW('prompt_modifier') || '').trim();

    if (!project)     { setStatus('Select a project first', false); redraw(); return; }
    if (!sourceImage) { setStatus('Pick a source image first', false); redraw(); return; }
    if (!angleSuffix) { setStatus('Pick an angle first', false); redraw(); return; }
    if (ui.qwenSingleRunning) {
      setStatus('Single render already queueing…', false); redraw(); return;
    }

    const m = sourceImage.match(/^\[([^\]]+)\] (.+)$/);
    if (!m) {
      setStatus('Source image is not tagged correctly', false); redraw(); return;
    }
    const sourceTag      = m[1];
    const sourceBasename = m[2];

    let resolvedSrc = '';
    try {
      const r = await api.get(
        `/studio5090/resolve_image_path?project=${enc(project)}&subject=&tagged=${enc(sourceImage)}`
      );
      if (!r.exists) {
        setStatus('Source image file not found on disk', false); redraw(); return;
      }
      resolvedSrc = r.path || '';
    } catch (e) { /* fall through */ }
    if (!resolvedSrc) {
      setStatus('Could not resolve source image path', false); redraw(); return;
    }

    ui.qwenSingleRunning = true;
    setStatus(`Queuing single angle: ${angleSuffix}…`, true); redraw();

    try {
      const workflow = buildQwenWorkflow();
      const d = await api.post('/studio5090/queue_qwen_single', {
        project,
        source_image_path:      resolvedSrc,
        source_tag:             sourceTag,
        source_basename:        sourceBasename,
        selected_angle_suffix:  angleSuffix,
        prompt_modifier:        promptMod,
        workflow,
      });

      if (d.success) {
        setStatus(`Queued single ${d.angle} ✓`, true);
        await loadFrameImages();
      } else {
        setStatus(`Queue error: ${d.error}`, false);
      }
    } catch (e) {
      setStatus('Single queue failed — check console', false);
      console.error('[PM QwenSingle]', e);
    }
    ui.qwenSingleRunning = false;
    redraw();
  }

  // v1.6.0: Workflow save/load. The save flow prompts the user for a
  // destination project (default = current) and a base filename, then
  // sends the current ComfyUI graph (via app.graphToPrompt) to the
  // /studio5090/save_workflow route which auto-increments the version
  // suffix. The open flow fetches the full library across templates +
  // every project, presents a sectioned picker, and on selection loads
  // the chosen graph via app.loadGraphData.
  async function saveWorkflow() {
    try {
      // Pick destination project — default is current.
      const currentProject = getW('project');
      // The list_workflows route also doubles as a project list source;
      // we use ui.projects which is already loaded.
      const projects = ui.projects.slice();
      if (!projects.length) {
        setStatus('No projects exist — create one first', false); redraw();
        return;
      }
      // Default to current project if it's in the list, else first.
      const defaultProject = projects.includes(currentProject)
        ? currentProject : projects[0];

      const projInput = await showTextPrompt(
        `Save to which project?\n\nAvailable: ${projects.join(', ')}\n\nDefault: ${defaultProject}`,
        defaultProject
      );
      if (projInput === null) return;  // cancelled
      const targetProject = projInput.trim() || defaultProject;
      if (!projects.includes(targetProject)) {
        setStatus(`Unknown project: ${targetProject}`, false); redraw();
        return;
      }

      // Suggested base name from current project.
      const suggested = `${targetProject}_workflow`;
      const baseInput = await showTextPrompt(
        'Workflow base name (version suffix is auto-appended as _vN):',
        suggested
      );
      if (baseInput === null) return;
      const baseName = baseInput.trim();
      if (!baseName) {
        setStatus('Base name cannot be empty', false); redraw();
        return;
      }

      // Capture the current ComfyUI graph.
      const graphData = (typeof app !== 'undefined' && app.graphToPrompt)
        ? await app.graphToPrompt()
        : null;
      // graphToPrompt() returns { workflow, output }. We store the
      // .workflow (the UI graph) because that's what loadGraphData wants.
      const workflowJson = graphData?.workflow || graphData;
      if (!workflowJson) {
        setStatus('Could not capture current workflow', false); redraw();
        return;
      }

      const d = await api.post('/studio5090/save_workflow', {
        project: targetProject,
        base_name: baseName,
        workflow_json: workflowJson,
      });
      if (d.success) {
        setStatus(`Saved as ${d.filename} ✓`, true);
      } else {
        setStatus(`Save error: ${d.error}`, false);
      }
    } catch (e) {
      setStatus('Save failed — check console', false);
      console.error('[PM saveWorkflow]', e);
    }
    redraw();
  }

  async function openWorkflow() {
    try {
      // v1.7.3: cache-busting query param defeats any browser HTTP
      // caching that might mask newly-created projects or newly-saved
      // workflows.
      const d = await api.get(`/studio5090/list_workflows?_=${Date.now()}`);
      const templates = d.templates || [];
      const projects  = d.projects  || {};
      const projectCount = Object.keys(projects).length;
      const totalFileCount = templates.length +
        Object.values(projects).reduce((s, arr) => s + arr.length, 0);
      // v1.7.3: only bail when there's truly nothing to show, i.e. no
      // templates AND no projects. If projects exist but have no saved
      // workflows, the picker still opens so the user can see them.
      if (totalFileCount === 0 && projectCount === 0) {
        setStatus('No workflows, templates, or projects available yet', false); redraw();
        return;
      }
      showWorkflowPicker(templates, projects, getW('project'), async (source, project, filename) => {
        // v1.6.1: no warning before load. ComfyUI's loadGraphData opens
        // the workflow in a new tab (does not replace the current graph),
        // so the destructive-replacement warning we had in v1.6.0 was
        // inaccurate and just added friction.
        try {
          const params = new URLSearchParams({
            source, filename, project: project || ''
          });
          const r = await api.get(`/studio5090/load_workflow?${params.toString()}`);
          if (!r.success) {
            setStatus(`Load error: ${r.error}`, false); redraw();
            return;
          }
          if (typeof app !== 'undefined' && app.loadGraphData) {
            // v1.7.23: pass the file name so the tab shows it instead of
            // "Unsaved Workflow".
            await app.loadGraphData(r.workflow_json, true, true, filename.replace(/\.json$/i, ''));
            setStatus(`Loaded ${filename} ✓`, true);
          } else {
            setStatus('Cannot reach ComfyUI graph loader', false);
          }
        } catch (e) {
          setStatus('Load failed — check console', false);
          console.error('[PM openWorkflow load]', e);
        }
        redraw();
      });
    } catch (e) {
      setStatus('Open failed — check console', false);
      console.error('[PM openWorkflow list]', e);
      redraw();
    }
  }

  function buildQwenWorkflow() {
    return {
      "1":  {"class_type":"UNETLoader",    "inputs":{"unet_name":"qwen_image_edit_2511_bf16.safetensors","weight_dtype":"default"}},
      "2":  {"class_type":"LoraLoaderModelOnly", "inputs":{"model":["1",0],"lora_name":"Qwen-Image-Edit-2511-Lightning-8steps-V1.0-bf16.safetensors","strength_model":1}},
      "3":  {"class_type":"LoraLoaderModelOnly", "inputs":{"model":["2",0],"lora_name":"qwen-image-edit-2511-multiple-angles-lora.safetensors","strength_model":1}},
      "4":  {"class_type":"CLIPLoader",    "inputs":{"clip_name":"qwen_2.5_vl_7b_fp8_scaled.safetensors","type":"qwen_image","device":"default"}},
      "5":  {"class_type":"VAELoader",     "inputs":{"vae_name":"qwen_image_vae.safetensors"}},
      "6":  {"class_type":"TextEncodeQwenImageEditPlus","inputs":{"clip":["4",0],"vae":["5",0],"image1":["9",0],"prompt":"ANGLE_PLACEHOLDER"}},
      "7":  {"class_type":"TextEncodeQwenImageEditPlus","inputs":{"clip":["4",0],"vae":["5",0],"image1":["9",0],"prompt":"worst quality"}},
      // v1.7.53: QWEN_MULTIANGLE_TEMPLATE_v3.  Resize keeps the image's shape
      // (scale to 1536x864, crop from center) and VAEEncode takes the resized
      // image, so the starting latent matches the image QWEN is told about.
      "8":  {"class_type":"VAEEncode",     "inputs":{"pixels":["9",0],"vae":["5",0]}},
      "9":  {"class_type":"ResizeImageMaskNode", "inputs":{"input":["14",0],"resize_type":"scale dimensions","resize_type.width":1536,"resize_type.height":864,"resize_type.crop":"center","scale_method":"lanczos"}},
      "10": {"class_type":"KSampler",      "inputs":{"model":["11",0],"positive":["6",0],"negative":["7",0],"latent_image":["8",0],"seed":42,"control_after_generate":"randomize","steps":8,"cfg":1,"sampler_name":"euler","scheduler":"sgm_uniform","denoise":1}},
      "11": {"class_type":"CFGNorm",       "inputs":{"model":["12",0],"strength":1}},
      "12": {"class_type":"ModelSamplingAuraFlow","inputs":{"model":["3",0],"shift":3}},
      "13": {"class_type":"VAEDecode",     "inputs":{"samples":["10",0],"vae":["5",0]}},
      "14": {"class_type":"LoadImage",     "inputs":{"image":"SOURCE_PLACEHOLDER","upload":"image"}},
      "15": {"class_type":"SaveImage",     "inputs":{"images":["13",0],"filename_prefix":"PREFIX_PLACEHOLDER"}},
    };
  }

  // v1.7.21: forget the fetched settings and blank any display wired to them.
  function clearRenderSettings() {
    if (!getW('render_settings')) return;
    setW('render_settings', '');
    pushSettingsToDisplays(node, '');
  }

  function setStatus(msg, ok) {
    ui.status = msg; ui.statusOk = ok;
    if (statusTimer) clearTimeout(statusTimer);
    statusTimer = setTimeout(() => { ui.status = ''; redraw(); }, 5000);
  }

  function redraw() {
    app.graph?.setDirtyCanvas(true, true);
  }

  function showMenu(items, onSelect, anchorEvent) {
    if (!items?.length) return;
    const canvas = app.canvas?.canvas;
    const rect = canvas?.getBoundingClientRect() || { left:100, top:100, width:800, height:600 };
    const sel = document.createElement('select');
    // size = at least 4 rows so single-item menus aren't tiny floating boxes
    sel.size = Math.max(4, Math.min(items.length, 12));

    // Position adjacent to click point if we have one, else canvas center.
    let leftPx, topPx;
    if (anchorEvent && typeof anchorEvent.clientX === 'number') {
      leftPx = anchorEvent.clientX;
      topPx  = anchorEvent.clientY + 8;
      const menuW = 260;
      const vw = window.innerWidth || 1920;
      const vh = window.innerHeight || 1080;
      if (leftPx + menuW > vw) leftPx = Math.max(8, vw - menuW - 8);
      if (topPx + 200 > vh) topPx = Math.max(8, vh - 220);
    } else {
      leftPx = rect.left + rect.width / 2 - 130;
      topPx  = rect.top  + rect.height / 2 - 100;
    }

    Object.assign(sel.style, {
      position:'fixed', background:'#1a2626', color:'#fff',
      border:'1px solid #0d9488', font:'11px "Courier New",monospace',
      zIndex:'99999', minWidth:'260px', padding:'4px',
      left: `${leftPx}px`,
      top:  `${topPx}px`,
    });
    items.forEach(item => {
      const o = document.createElement('option');
      o.value = item; o.textContent = item; sel.appendChild(o);
    });
    // v1.7.39: guard so the change and blur events can't both remove the menu.
    let closed = false;
    const cleanup = () => { if (closed) return; closed = true; sel.remove(); };
    sel.addEventListener('change', () => { onSelect(sel.value); cleanup(); redraw(); });
    sel.addEventListener('blur', cleanup);
    document.body.appendChild(sel); sel.focus();
  }

  // ── Canvas widget definition ─────────────────────────────────────────────
  const widget = {
    name: 'pm_ui',
    type: 'studio5090_pm',
    value: null,
    options: {},
    serialize: false,

    computeSize(nw) {
      const h =
        (SHOW_WORKFLOWS ? HEIGHTS.workflows + C.SEC_GAP : 0) +       // v1.6.0
        HEIGHTS.selectProject + C.SEC_GAP +
        HEIGHTS.createProject + C.SEC_GAP +
        HEIGHTS.retrieveSettings + C.SEC_GAP +   // v1.7.19
        HEIGHTS.multianglePanel + C.SEC_GAP +
        HEIGHTS.frameMode + C.SEC_GAP +
        HEIGHTS.videoOutput + C.SEC_GAP +
        HEIGHTS.previews +
        HEIGHTS.status +
        C.PAD;
      return [nw, h];
    },

    draw(ctx, node, nw, y, height) {
      regions = [];
      const x = C.PAD, w = nw - C.PAD * 2;
      let cy = y;

      const reg = (id, ry, rh, rx, rw) =>
        regions.push({ id, y: ry, h: rh,
                       x: rx !== undefined ? rx : x,
                       w: rw !== undefined ? rw : w });

      // Outer node panel
      ctx.fillStyle = C.bgSection;
      rr(ctx, x - 4, cy - 4, w + 8, height + 8, 6);
      ctx.fill();

      // ── ⓪ WORKFLOWS (v1.6.0) ─────────────────────────────────────────
      if (SHOW_WORKFLOWS) {
      cy = secHeader(ctx, 'WORKFLOWS', x, cy, w);

      // Two side-by-side buttons: Save Workflow | Open Workflow
      const wfBtnGap = 6;
      const wfBtnW = Math.floor((w - wfBtnGap) / 2);
      const wfBtnY = cy;
      // Save button (left)
      drawBtn(ctx, '💾  Save Workflow…', x, cy, wfBtnW,
              C.tealDark, C.white, C.tealDark);
      reg('btn_saveWorkflow', wfBtnY, C.BTN_H, x, wfBtnW);
      // Open button (right)
      drawBtn(ctx, '📂  Open Workflow…', x + wfBtnW + wfBtnGap, cy, wfBtnW,
              C.tealDark, C.white, C.tealDark);
      reg('btn_openWorkflow', wfBtnY, C.BTN_H, x + wfBtnW + wfBtnGap, wfBtnW);
      cy += C.BTN_H + 5;

      cy += C.SEC_GAP;
      }

      // ── ① SELECT PROJECT ─────────────────────────────────────────────
      cy = secHeader(ctx, 'SELECT PROJECT', x, cy, w);

      const refW = 78, pdW = w - refW - 6;
      s5090ButtonFace(ctx, rr, x, cy, refW, C.BTN_H, 4, C.tealDark);
      ctx.fillStyle = C.white; ctx.font = 'bold 12px sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('⟳  Refresh', x + refW / 2, cy + C.BTN_H / 2);
      reg('btn_refresh', cy, C.BTN_H, x, refW);

      const pdX = x + refW + 6;
      const project = getW('project');
      ctx.fillStyle = '#353535'; ctx.strokeStyle = '#555555';
      rr(ctx, pdX, cy, pdW, C.BTN_H, 4); ctx.fill(); ctx.stroke();
      const pTxt = project || '— select project —';
      ctx.fillStyle = project ? C.white : C.dimGrey;
      ctx.font = '11px sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.fillText(pTxt.slice(0, Math.floor((pdW - 24) / 6.5)), pdX + 6, cy + C.BTN_H / 2);
      ctx.fillStyle = C.dimGrey; ctx.textAlign = 'right';
      ctx.fillText('▾', pdX + pdW - 6, cy + C.BTN_H / 2);
      reg('drop_project', cy, C.BTN_H, pdX, pdW);
      cy += C.BTN_H + 5;
      cy += C.SEC_GAP;

      // ── ② CREATE PROJECT ─────────────────────────────────────────────
      cy = secHeader(ctx, 'CREATE PROJECT', x, cy, w);
      const nameY = cy;
      cy = drawTextInput(ctx, 'Project Name', ui.newProjectName, 'click to enter…', x, cy, w);
      reg('input_newProject', nameY, C.ROW_H);
      const createY = cy;
      cy = drawBtn(ctx, 'Create Project', x, cy, w, C.greenDark, C.white, C.green);
      reg('btn_createProject', createY, C.BTN_H);
      cy += C.SEC_GAP;

      // ── RETRIEVE SETTINGS (v1.7.19) ──────────────────────────────────
      cy = secHeader(ctx, 'RETRIEVE SETTINGS', x, cy, w);
      const fetchY = cy;
      // v1.7.34: two buttons side by side, both ComfyUI pale blue.
      const fbW = (w - 6) / 2;
      drawBtn(ctx, 'Fetch Data From Video', x, cy, fbW, '#3f5159', C.white, '#2a363b');
      cy = drawBtn(ctx, 'Open Workflow From File', x + fbW + 6, cy, fbW, '#3f5159', C.white, '#2a363b');
      reg('btn_fetchSettings', fetchY, C.BTN_H, x, fbW);
      reg('btn_openWfVideo', fetchY, C.BTN_H, x + fbW + 6, fbW);
      cy += C.SEC_GAP;

      // ── NEW MULTIANGLE SET (framed) ──────────────────────────────────
      const panelTop    = cy;
      const panelBottom = cy + HEIGHTS.multianglePanel;

      // Accent fill behind the inner content
      const innerTop = panelTop + C.LABEL_H + 6;
      ctx.fillStyle   = C.tealPanel;
      ctx.strokeStyle = C.tealDark;
      ctx.lineWidth   = 1;
      rr(ctx, x, innerTop, w, panelBottom - innerTop, 4);
      ctx.fill(); ctx.stroke();

      cy = secHeader(ctx, 'NEW MULTIANGLE SET', x, cy, w);   // v1.7.19: black like the other headers

      // Inset content
      const innerX = x + C.PANEL_PAD;
      const innerW = w - C.PANEL_PAD * 2;
      cy += C.PANEL_PAD - 5;   // align first item after panel pad

      const srcY = cy;
      cy = drawRow(ctx, 'Source Image', getW('source_image'),
                   '— pick image —', innerX, cy, innerW, true);
      reg('drop_sourceImage', srcY, C.ROW_H, innerX, innerW);

      const subjY = cy;
      cy = drawTextInput(ctx, 'Subject Name', getW('subject'),
                         'name this batch…', innerX, cy, innerW);
      reg('input_subjectName', subjY, C.ROW_H, innerX, innerW);

      const pmY = cy;
      cy = drawTextInput(ctx, 'Prompt Mod', getW('prompt_modifier'),
                         '(appended to each angle — e.g. "on opera stage")',
                         innerX, cy, innerW);
      reg('input_promptModifier', pmY, C.ROW_H, innerX, innerW);

      const qLabel = ui.qwenRunning
        ? `Queuing… ${ui.qwenProgress}/17`
        : '▶  Generate All Angles  (17)';
      const qwenY = cy;
      cy = drawBtn(ctx, qLabel, innerX, cy, innerW, '#2a1500', C.orange, C.orange);
      reg('btn_qwen', qwenY, C.BTN_H, innerX, innerW);

      // v1.5.7: Generate Single section. Angle dropdown selects one of the
      // 17 angles; the button renders only that one. The 17-pass button
      // above keeps its warning dialog; Generate Single does not warn.
      const angleY = cy;
      const angleLabel = getW('selected_angle') || '(pick an angle)';
      cy = drawRow(ctx, 'Angle', angleLabel, '(pick an angle)',
                   innerX, cy, innerW, false, false);
      reg('drop_selectedAngle', angleY, C.ROW_H, innerX, innerW);

      const singleY = cy;
      const singleLabel = ui.qwenSingleRunning ? 'Queuing…' : '▶  Generate Single Angle';
      // v1.7.2: Generate Single Angle button — bright saturated blue
      // fill with white text. Previous v1.7.1 dark-navy fill (#0f2540)
      // read as identical to the dark-teal panel background (#0f2a28)
      // and made the button visually disappear. Bright blue-600 fill
      // pops against the panel while remaining the complementary
      // opposite of the orange Generate All Angles button above.
      // Orange = big commit action; blue = iterative test action.
      cy = drawBtn(ctx, singleLabel, innerX, cy, innerW, '#2563eb', '#ffffff', '#1d4ed8');
      reg('btn_qwenSingle', singleY, C.BTN_H, innerX, innerW);

      cy = panelBottom + C.SEC_GAP;

      // ── ④ FRAME MODE SELECTION ───────────────────────────────────────
      cy = secHeader(ctx, 'FRAME MODE SELECTION', x, cy, w);
      // SF mode (frame_mode=true) ignores Last Frame.
      // FL mode (frame_mode=false) uses both frames, nothing dims.
      const sfActive = !!getW('frame_mode');
      const ffY = cy;
      cy = drawRow(ctx, 'First Frame', getW('first_frame'), '— select —', x, cy, w, true,
                   /* dimmed= */ false);
      reg('drop_firstFrame', ffY, C.ROW_H);
      const lfY = cy;
      cy = drawRow(ctx, 'Last Frame', getW('last_frame'), '— select —', x, cy, w, true,
                   /* dimmed= */ sfActive,
                   /* dimReason= */ 'ignored — SF mode');
      reg('drop_lastFrame', lfY, C.ROW_H);

      cy += 12;
      const radioY = cy;
      const fm = !!getW('frame_mode');
      cy = drawRadio(ctx, 'SF', 'FL', fm, x, cy, w);
      reg('radio_frameMode', radioY, C.BTN_H);
      cy += C.SEC_GAP;

      // ── VIDEO OUTPUT ─────────────────────────────────────────────────
      cy = secHeader(ctx, 'VIDEO OUTPUT', x, cy, w);
      const vnY = cy;
      // v1.7.1: yellow-orange border on Scene Name field to visually flag it
      // as the primary user-editable output-naming input.
      cy = drawTextInput(ctx, 'Scene Name', getW('video_name'),
                         project ? `(blank → ${project}_SCENE)` : 'e.g. SCENE3',
                         x, cy, w, '#f59e0b', 2);
      reg('input_videoName', vnY, C.ROW_H);

      const vn = (getW('video_name') || '').trim();
      if (project) {
        // Show the path that will actually be used — either the user-typed
        // scene name, or the default <project>_SCENE.
        const effective = vn || `${project}_SCENE`;
        const base = `${project}/VIDEOS/${effective}`;
        ctx.fillStyle = vn ? C.dimGrey : '#666666';
        ctx.font = '10px sans-serif';
        ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
        ctx.fillText(`→ ${base}`, x, cy + 6); cy += 14;
        ctx.fillText(`→ ${base}_1920x1152`, x, cy + 6); cy += 18;
      } else {
        cy += 32;
      }
      cy += C.SEC_GAP;

      // ── Preview thumbnails ───────────────────────────────────────────
      const thumbW = (w - 6) / 2;
      const ffUrl = thumbUrlFor(getW('first_frame'));
      const lfUrl = thumbUrlFor(getW('last_frame'));
      drawThumb(ctx, ffUrl, x,             cy, thumbW, C.THUMB_H, 'First Frame', false);
      drawThumb(ctx, lfUrl, x + thumbW + 6, cy, thumbW, C.THUMB_H,
                sfActive ? 'ignored — SF mode' : 'Last Frame', sfActive);
      cy += C.THUMB_H + 10;

      // ── Status bar ───────────────────────────────────────────────────
      if (ui.status) {
        ctx.fillStyle = ui.statusOk ? C.white : C.orange;
        ctx.font = 'bold 12px "Courier New", monospace';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(ui.status, x + w / 2, cy + C.ROW_H / 2);
      }
    },

    mouse(event, pos, node) {
      if (event.type !== 'pointerdown') return false;
      const rx = pos[0], ry = pos[1];

      for (const reg of regions) {
        if (ry < reg.y || ry > reg.y + reg.h) continue;
        if (rx < reg.x || rx > reg.x + reg.w) continue;

        switch (reg.id) {
          // v1.6.0: workflow save/load
          case 'btn_saveWorkflow':
            saveWorkflow();
            return true;
          case 'btn_openWorkflow':
            openWorkflow();
            return true;

          case 'btn_refresh':
            refresh();
            return true;

          case 'drop_project':
            if (!ui.projects.length) {
              setStatus('No projects — create one below ↓', false); redraw();
            } else {
              showMenu(ui.projects, async val => {
                if (val !== getW('project')) clearRenderSettings();   // v1.7.21
                setW('project', val);
                setW('subject', '');
                setW('source_image', '');
                setW('first_frame', '');
                setW('last_frame', '');
                await loadFrameImages();
                redraw();
              }, event);
            }
            return true;

          case 'input_newProject': {
            // v1.6.1: showTextPrompt is async, but the dispatch handler is
            // sync. We launch the prompt as a fire-and-forget IIFE; the
            // handler returns true immediately to consume the click.
            (async () => {
              const v = await showTextPrompt('Project name:', ui.newProjectName || '');
              if (v !== null) { ui.newProjectName = v.trim(); redraw(); }
            })();
            return true;
          }
          case 'btn_createProject':
            createProject();
            return true;

          case 'btn_openWfVideo':
            (async () => {
              const res = await s5090OpenWorkflowFromVideo();
              if (res) { setStatus(res.msg, res.ok); redraw(); }
            })();
            return true;

          case 'btn_fetchSettings':
            // v1.7.19: pick a finished video, read the settings stored in it.
            (async () => {
              const picked = await pickSettingsFile();
              if (picked && picked.error) {
                // Clear the old text so it is never mistaken for this file's.
                setW('render_settings', '');
                pushSettingsToDisplays(node, picked.error + (picked.detail ? '\n\n' + picked.detail : ''));
                setStatus(picked.error, false);
                redraw();
              } else if (picked) {
                picked.text = 'Video: ' + picked.file + '\n' + picked.text.replace(/^Video: [^\n]*\n/, '');
                setW('render_settings', picked.text);
                // v1.7.20: show the text right away in any text display node
                // wired to render_settings.  No Run needed.
                const shown = pushSettingsToDisplays(node, picked.text);
                if (shown) setStatus('Settings displayed from ' + picked.file, true);
                else setStatus('Wire render_settings to a Preview as Text node to see them', false);
                redraw();
              }
            })();
            return true;

          case 'drop_sourceImage':
            openSourceImagePicker();
            return true;

          case 'input_subjectName': {
            (async () => {
              const v = await showTextPrompt(
                'Subject name (will be MULTIANGLE/<name>/):',
                getW('subject') || ''
              );
              if (v !== null) { setW('subject', v.trim()); redraw(); }
            })();
            return true;
          }

          case 'input_promptModifier': {
            (async () => {
              const v = await showTextPrompt(
                'Prompt modifier — appended to all 17 angle prompts.\n' +
                'Example: "standing on the empty stage of the New York Met"',
                getW('prompt_modifier') || ''
              );
              if (v !== null) { setW('prompt_modifier', v.trim()); redraw(); }
            })();
            return true;
          }

          case 'btn_qwen':
            runQwenBatch();
            return true;

          // v1.5.7: angle dropdown for Generate Single
          case 'drop_selectedAngle': {
            if (!ui.angles.length) {
              setStatus('Angles not loaded yet', false); redraw();
              return true;
            }
            showAnglePicker(ui.angles, getW('selected_angle'), suffix => {
              setW('selected_angle', suffix);
              redraw();
            });
            return true;
          }

          case 'btn_qwenSingle':
            runQwenSingle();
            return true;

          case 'drop_firstFrame': {
            // v1.7.10: lazy-load. Picker opens with just the section
            // manifest (fast — one shallow walk of each parent folder,
            // no per-file work). Each section fetches its own contents
            // only when the user twirls it open.
            (async () => {
              const project = getW('project');
              if (!project) { setStatus('Select a project first', false); redraw(); return; }
              await loadProjects();  // ensure the project list is fresh for the chooser
              const openPickerForProject = async (pickerProject) => {
                let manifest = { folders: [], counts: {} };
                try {
                  manifest = await api.get(
                    `/studio5090/frame_folders?project=${enc(pickerProject)}`);
                } catch (e) { console.error('[PM] frame_folders', e); }

                if ((!manifest.folders || !manifest.folders.length) &&
                    (!ui.projects || !ui.projects.length)) {
                  setStatus('No images available', false); redraw();
                  return;
                }

                const suffix = pickerProject === project
                  ? ''
                  : `  —  BROWSING: ${pickerProject}`;
                showThumbPicker(manifest, getW('first_frame'), thumbUrlFor,
                  `First Frame — CREATE + EDITS + CHARACTERS + GRAB + MULTIANGLE${suffix}`,
                  val => { setW('first_frame', val); redraw(); },
                  {
                    currentProject:    pickerProject,
                    workflowProject:   project,
                    availableProjects: ui.projects,
                    onProjectChange:   async (newProj) => { await openPickerForProject(newProj); },
                  },
                  {
                    fetchFolder: async (folderKey) => {
                      const r = await api.get(
                        `/studio5090/frame_folder_contents?project=${enc(pickerProject)}&folder=${enc(folderKey)}`);
                      let items = r.images || [];
                      const pre = f => {
                        const m = f.match(/^\[([^\]]+)\] (.+)$/);
                        return m ? `[@${pickerProject}|${m[1]}] ${m[2]}` : f;
                      };
                      s5090RememberMtimes(r, pickerProject !== project ? pre : null);
                      // Cross-project: wrap tags with @PROJECT| prefix so the
                      // resolver downstream knows where the file lives.
                      if (pickerProject !== project) {
                        items = items.map(pre);
                      }
                      return items;
                    },
                  }
                );
              };
              await openPickerForProject(project);
            })();
            return true;
          }

          case 'drop_lastFrame': {
            // v1.7.10: lazy-load — mirrors drop_firstFrame.
            (async () => {
              const project = getW('project');
              if (!project) { setStatus('Select a project first', false); redraw(); return; }
              await loadProjects();
              const openPickerForProject = async (pickerProject) => {
                let manifest = { folders: [], counts: {} };
                try {
                  manifest = await api.get(
                    `/studio5090/frame_folders?project=${enc(pickerProject)}`);
                } catch (e) { console.error('[PM] frame_folders', e); }

                if ((!manifest.folders || !manifest.folders.length) &&
                    (!ui.projects || !ui.projects.length)) {
                  setStatus('No images available', false); redraw();
                  return;
                }

                const suffix = pickerProject === project
                  ? ''
                  : `  —  BROWSING: ${pickerProject}`;
                showThumbPicker(manifest, getW('last_frame'), thumbUrlFor,
                  `Last Frame — CREATE + EDITS + CHARACTERS + GRAB + MULTIANGLE${suffix}`,
                  val => { setW('last_frame', val); redraw(); },
                  {
                    currentProject:    pickerProject,
                    workflowProject:   project,
                    availableProjects: ui.projects,
                    onProjectChange:   async (newProj) => { await openPickerForProject(newProj); },
                  },
                  {
                    fetchFolder: async (folderKey) => {
                      const r = await api.get(
                        `/studio5090/frame_folder_contents?project=${enc(pickerProject)}&folder=${enc(folderKey)}`);
                      let items = r.images || [];
                      const pre = f => {
                        const m = f.match(/^\[([^\]]+)\] (.+)$/);
                        return m ? `[@${pickerProject}|${m[1]}] ${m[2]}` : f;
                      };
                      s5090RememberMtimes(r, pickerProject !== project ? pre : null);
                      if (pickerProject !== project) {
                        items = items.map(pre);
                      }
                      return items;
                    },
                  }
                );
              };
              await openPickerForProject(project);
            })();
            return true;
          }

          case 'radio_frameMode': {
            const half = (node.size[0] - C.PAD * 2 - 6) / 2;
            setW('frame_mode', rx < C.PAD + half);
            redraw();
            return true;
          }

          case 'input_videoName': {
            (async () => {
              const v = await showTextPrompt(
                'Scene name (e.g. SCENE3):',
                getW('video_name') || ''
              );
              if (v !== null) { setW('video_name', v.trim()); redraw(); }
            })();
            return true;
          }
        }
      }
      return false;
    },
  };

  // Append the canvas widget. NEVER replace node.widgets.
  if (!node.widgets) node.widgets = [];
  node.widgets.push(widget);

  // Hook native widget callbacks for workflow load / paste / undo.
  hookCallback('project', async () => {
    await loadFrameImages();
    redraw();
  });
  ['subject', 'source_image', 'first_frame', 'last_frame', 'frame_mode',
   'video_name', 'prompt_modifier', 'selected_angle']
    .forEach(name => hookCallback(name, () => redraw()));

  function hookCallback(name, after) {
    const w = nativeWidgets[name];
    if (!w) return;
    const orig = w.callback;
    w.callback = (val) => {
      if (orig) { try { orig.call(w, val); } catch (e) {} }
      try { after(val); } catch (e) {}
    };
  }

  node.setSize([C.NODE_W, node.computeSize()[1]]);
  node.resizable = false;

  initialPopulate();
}

app.registerExtension({
  name: 'Studio5090.RenderProjectManager',
  nodeCreated(node) {
    if (node.constructor?.comfyClass !== 'Studio5090RenderProjectManager') return;
    buildProjectManagerWidget(node);
  },
  // v1.7.41: workflows saved before v1.7.40 still list the render_style
  // output on the Render PM, and ComfyUI keeps a saved output list as it is.
  // Drop that output (and any wire from it) before the workflow is built.
  beforeConfigureGraph(graphData) {
    try {
      const graphs = [graphData, ...((graphData?.definitions?.subgraphs) || [])];
      let removed = 0;
      for (const g of graphs) {
        for (const n of (g?.nodes || [])) {
          if (n.type !== 'Studio5090RenderProjectManager' || !Array.isArray(n.outputs)) continue;
          const slot = n.outputs.findIndex(o => o && o.name === 'render_style');
          if (slot < 0) continue;
          const dropIds = new Set();
          const links = g.links || [];
          for (let k = links.length - 1; k >= 0; k--) {
            const L = links[k];
            const isArr = Array.isArray(L);
            if (String(isArr ? L[1] : L.origin_id) !== String(n.id) || Number(isArr ? L[2] : L.origin_slot) !== slot) continue;
            dropIds.add(isArr ? L[0] : L.id);
            links.splice(k, 1);
          }
          if (dropIds.size) {
            for (const t of (g.nodes || [])) {
              for (const inp of (t.inputs || [])) if (dropIds.has(inp.link)) inp.link = null;
            }
          }
          n.outputs.splice(slot, 1);
          removed++;
        }
      }
      if (removed) console.info(`[Studio5090] Render PM: old render_style output removed from ${removed} node(s)`);
    } catch (e) { console.warn('[Studio5090] could not remove old render_style output', e); }
  },
  // v1.7.21: whenever a workflow is opened, nothing has been fetched yet, so
  // the settings text starts empty and any display wired to it is blanked.
  afterConfigureGraph() {
    try {
      for (const node of (app.graph?._nodes || [])) {
        if (node.constructor?.comfyClass !== 'Studio5090RenderProjectManager') continue;
        const w = node.widgets?.find(w => w.name === 'render_settings');
        if (w) w.value = '';
        pushSettingsToDisplays(node, '');
      }
    } catch (e) { console.warn('[Studio5090] could not reset render settings', e); }
  },
});
