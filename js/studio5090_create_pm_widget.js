/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Alan Rosenfeld
 * Studio5090 — see LICENSE at the repository root for full terms.
 * Provided "AS IS", without warranty of any kind.
 */

/**
 * Studio5090 Create Project Manager — Slim Canvas UI v1.7.11
 * For the Invent/Create/Edit tab.
 * Designed by Alan Rosenfeld + Claude (Anthropic), 2026.
 *
 * v1.4.5: source-image thumbnail now uses CONTAIN fit instead of COVER, so
 * portrait or square sources (e.g. character sheets) display in full rather
 * than getting top/bottom cropped to fill the wide thumb box. This was the
 * real cause of the "thumbnail cut off" bug — the prior PANEL_PAD bumps
 * couldn't fix it because the cropping happened inside the image, not at
 * the panel boundary.
 *
 * v1.4 layout (top to bottom):
 *   SELECT PROJECT
 *        [⟳ Refresh]  [project dropdown]
 *
 *   SELECT SUBJECT  (subject drives SaveResult routing)
 *        Subject:      [subject dropdown]
 *        New Subject:  [text]  [Create Subject]
 *
 *   CREATE PROJECT
 *        Project Name: [text]
 *        [Create Project]
 *
 *   NEW MULTIANGLE SET   ← teal-framed accent panel
 *        Source Image:    [picker, color-coded]
 *        Batch Folder:    [text — names new MULTIANGLE/<name>/, prefilled from subject]
 *        Prompt Mod:      [text — appended to all 17 angle prompts]
 *        [▶ Generate All Angles (17)]
 *        [source image thumbnail]
 *
 *   status bar
 *
 * Persistence: native INPUT_TYPES widgets (project, subject, source_image,
 * batch_folder, prompt_modifier) hidden but kept in node.widgets so
 * ComfyUI serializes them. Camera-pattern persistence — same as Render PM.
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

const CPM = {
  teal:        '#2dd4bf',
  tealDark:    '#0d9488',
  tealDim:     '#1a3535',
  tealPanel:   '#0f2a28',
  green:       '#22c55e',
  greenDark:   '#15803d',
  // v1.7.11: gold accent for the Create Subject button. Distinguishes
  // subject creation (an in-project operation, no filesystem side-effects
  // beyond a subject entry) from project creation (creates the whole
  // project folder tree) which keeps its green.
  gold:        '#866700',
  goldLight:   '#a68520',
  orange:      '#fb923c',
  orangeDim:   '#2a1500',
  white:       '#ffffff',
  dimGrey:     '#888888',
  bgSection:   '#1a1a1a',
  bgRow:       '#2a2a2a',
  border:      '#555555',
  NODE_W:      400,
  PAD:         14,
  ROW_H:       30,
  BTN_H:       34,
  SEC_GAP:     16,
  ITEM_GAP:    8,
  LABEL_H:     22,
  PANEL_PAD:   20,
  THUMB_H:     130,
};

const capi = {
  async get(path) {
    const r = await fetch(path);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
  },
  async post(path, body) {
    const r = await fetch(path, {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify(body),
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
  },
};

function cenc(s) { return encodeURIComponent(s || ''); }

function crr(ctx, x, y, w, h, r) {
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

function cSecHeader(ctx, label, x, y, w) {
  ctx.fillStyle = '#1a1a1a';
  crr(ctx, x, y, w, CPM.LABEL_H, 4); ctx.fill();
  ctx.strokeStyle = '#333333'; ctx.lineWidth = 1; ctx.stroke();
  ctx.fillStyle = CPM.white;
  ctx.font = 'bold 11px "Courier New", monospace';
  ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  ctx.fillText(label, x+8, y+CPM.LABEL_H/2);
  return y + CPM.LABEL_H + CPM.ITEM_GAP;
}

function cAccentHeader(ctx, label, x, y, w) {
  ctx.fillStyle = CPM.tealDark;
  crr(ctx, x, y, w, CPM.LABEL_H, 4); ctx.fill();
  ctx.fillStyle = CPM.white;
  ctx.font = 'bold 11px "Courier New", monospace';
  ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  ctx.fillText(label, x+8, y+CPM.LABEL_H/2);
  return y + CPM.LABEL_H + CPM.ITEM_GAP;
}

function cDrawRow(ctx, label, value, placeholder, x, y, w, hasThumb) {
  ctx.fillStyle = CPM.white;
  ctx.font = '11px sans-serif';
  ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  ctx.fillText(label, x, y+CPM.ROW_H/2);
  const dx = x+95, dw = w-95;
  ctx.fillStyle = '#353535'; ctx.strokeStyle = '#555555'; ctx.lineWidth = 1;
  crr(ctx, dx, y, dw, CPM.ROW_H, 4); ctx.fill(); ctx.stroke();

  if (hasThumb) {
    ctx.fillStyle = CPM.tealDim;
    crr(ctx, dx+3, y+3, 22, CPM.ROW_H-6, 2); ctx.fill();
    ctx.fillStyle = CPM.teal; ctx.font = '11px sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('🖼', dx+14, y+CPM.ROW_H/2);
  }

  const has = value && value.trim() !== '';
  const txtX = hasThumb ? dx+30 : dx+8;
  const maxCh = Math.floor((dw - (hasThumb?38:16)) / 6.5);
  const display = has ? value : (placeholder||'—');
  ctx.fillStyle = has ? CPM.white : CPM.dimGrey;
  ctx.font = '11px sans-serif'; ctx.textAlign = 'left';
  ctx.fillText(display.length>maxCh ? display.slice(0,maxCh-1)+'…' : display, txtX, y+CPM.ROW_H/2);
  ctx.fillStyle = CPM.dimGrey; ctx.textAlign = 'right';
  ctx.fillText('▾', dx+dw-6, y+CPM.ROW_H/2);
  return y + CPM.ROW_H + CPM.ITEM_GAP;
}

function cDrawTextInput(ctx, label, value, placeholder, x, y, w) {
  ctx.fillStyle = CPM.white;
  ctx.font = '11px sans-serif';
  ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  ctx.fillText(label, x, y+CPM.ROW_H/2);
  const ix = x+95, iw = w-95;
  ctx.fillStyle = '#353535'; ctx.strokeStyle = '#555555'; ctx.lineWidth = 1;
  crr(ctx, ix, y, iw, CPM.ROW_H, 4); ctx.fill(); ctx.stroke();
  const has = value && value.trim() !== '';

  // Clip text to the input rectangle so long values don't bleed past the
  // field's visible boundary. Inner padding of 8px on each side.
  ctx.save();
  ctx.beginPath();
  ctx.rect(ix + 4, y + 1, iw - 8, CPM.ROW_H - 2);
  ctx.clip();
  ctx.fillStyle = has ? CPM.white : CPM.dimGrey; ctx.textAlign = 'left';
  ctx.font = '11px sans-serif';
  ctx.fillText(has ? value : placeholder, ix+8, y+CPM.ROW_H/2);
  ctx.restore();

  return y + CPM.ROW_H + CPM.ITEM_GAP;
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

function cDrawBtn(ctx, label, x, y, w, bg, fg, border) {
  s5090ButtonFace(ctx, crr, x, y, w, CPM.BTN_H, 4, bg);
  ctx.fillStyle = fg;
  ctx.font = 'bold 12px sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(label, x+w/2, y+CPM.BTN_H/2);
  return y + CPM.BTN_H + CPM.ITEM_GAP;
}

// ── Color coding (v1.4) ──────────────────────────────────────────────────────
const FIXED_COLORS = {
  CREATE: '#166534',
  EDITS:  '#1d4ed8',
  CHARACTERS: '#a16207',  // v1.7.43: same amber as the Render PM
  GRAB:       '#64748b',  // v1.7.54: slate gray, Frame Grab snapshots
};
const MA_PALETTE = [
  '#0d9488', '#c2410c', '#7c3aed', '#be185d', '#b45309',
  '#4338ca', '#047857', '#0369a1', '#6d28d9', '#a21caf',
];
function hashStr(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}
function colorForFile(taggedFilename) {
  const m = taggedFilename.match(/^\[([^\]]+)\] /);
  if (!m) return MA_PALETTE[0];
  const tag = m[1];
  if (FIXED_COLORS[tag]) return FIXED_COLORS[tag];
  if (tag.startsWith('MULTIANGLE:')) {
    const subj = tag.slice('MULTIANGLE:'.length);
    return MA_PALETTE[hashStr(subj) % MA_PALETTE.length];
  }
  if (tag === 'MULTIANGLE') return MA_PALETTE[0];
  return MA_PALETTE[0];
}
function sortByColorThenName(images) {
  const groups = new Map();
  const order  = [];
  for (const f of images) {
    const c = colorForFile(f);
    if (!groups.has(c)) { groups.set(c, []); order.push(c); }
    groups.get(c).push(f);
  }
  const lead = [FIXED_COLORS.CREATE, FIXED_COLORS.EDITS, FIXED_COLORS.CHARACTERS, FIXED_COLORS.GRAB];
  const ordered = [
    ...lead.filter(c => groups.has(c)),
    ...order.filter(c => !lead.includes(c)),
  ];
  return ordered.flatMap(c => groups.get(c));
}

// ── Canvas thumbnail cache (for the source-image preview in panel) ────────────
const cThumbCache = new Map();
function cGetThumb(url) {
  if (!url) return null;
  let entry = cThumbCache.get(url);
  if (entry) return entry;
  entry = { img: new Image(), status: 'loading' };
  entry.img.onload  = () => { entry.status = 'ok';  app.graph?.setDirtyCanvas(true,true); };
  entry.img.onerror = () => { entry.status = 'err'; app.graph?.setDirtyCanvas(true,true); };
  entry.img.src = url;
  cThumbCache.set(url, entry);
  return entry;
}
function cDrawSourceThumb(ctx, url, x, y, w, h, label) {
  ctx.fillStyle = '#252525';
  ctx.strokeStyle = '#444444';
  ctx.lineWidth = 1;
  crr(ctx, x, y, w, h, 4);
  ctx.fill();
  ctx.stroke();
  if (!url) {
    ctx.fillStyle = CPM.dimGrey;
    ctx.font = 'italic 11px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, x + w/2, y + h/2);
    return;
  }
  const entry = cGetThumb(url);
  if (entry.status === 'ok' && entry.img.naturalWidth > 0) {
    const iw = entry.img.naturalWidth, ih = entry.img.naturalHeight;
    // v1.4.5: CONTAIN fit (was COVER). The previous Math.max made the image
    // fill the thumb box, cropping top/bottom for square or portrait sources
    // (character sheets are typically 1:1 or taller, while this thumb box is
    // wide — ~2.5:1). The crop made it look like the panel was clipping the
    // thumbnail when it was actually the image being cropped to fill. CONTAIN
    // shows the whole image, with letterbox on the long axis.
    const scale = Math.min(w / iw, h / ih);
    const dw = iw * scale, dh = ih * scale;
    const dx = x + (w - dw) / 2, dy = y + (h - dh) / 2;
    ctx.save();
    crr(ctx, x, y, w, h, 4);
    ctx.clip();
    ctx.drawImage(entry.img, dx, dy, dw, dh);
    ctx.restore();
    ctx.strokeStyle = '#444444';
    ctx.lineWidth = 1;
    crr(ctx, x, y, w, h, 4);
    ctx.stroke();
  } else {
    ctx.fillStyle = CPM.dimGrey;
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(entry.status === 'err' ? '✕  no preview' : 'loading…',
                 x + w/2, y + h/2);
  }
}

// v1.5.7: dedicated angle picker for the Generate Single button. A simple
// vertical list of all 17 angles styled to match the thumb picker; no grid
// or sectioning. Used by both Create PM and Render PM. Each entry shows
// the suffix (the file-naming token) on the left and the prompt text
// describing the angle on the right. Click an entry to select.
// v1.6.1: Custom text-input modal. Replaces window.prompt() which is
// disabled in the ComfyUI native desktop (Electron) app for security
// reasons. Returns a Promise that resolves to the entered string, or
// null if the user cancelled.
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
    setTimeout(() => { input.focus(); input.select(); }, 0);
  });
}

// v1.6.1: Custom confirm modal. Replaces window.confirm().
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
  // collapsed; this button flips everything at once.
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

  // v1.7.3: empty sections render too, with a helpful placeholder
  // instead of bailing silently — so all projects the user has are
  // discoverable in the picker.
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
    // v1.6.1: default collapsed.
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

// ── Thumbnail picker (DOM modal) ──────────────────────────────────────────────
function cShowThumbPicker(images, currentValue, urlBuilder, title, onSelect) {
  document.getElementById('s5090-cpicker')?.remove();
  document.getElementById('s5090-coverlay')?.remove();

  const overlay = document.createElement('div');
  overlay.id = 's5090-coverlay';
  Object.assign(overlay.style, {
    position:'fixed', inset:'0', background:'rgba(0,0,0,0.55)', zIndex:'99998',
  });

  const panel = document.createElement('div');
  panel.id = 's5090-cpicker';
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

  // v1.5.5: Expand Toggle (mirrors Render PM behavior). Tracks every
  // section's arrow and grid in sectionRefs; the button flips them all
  // at once. Looks at actual section state on each click so manual
  // per-section toggles don't desync the master button.
  const sectionRefs = [];
  const expandBtn = document.createElement('button');
  expandBtn.textContent = '▸  Expand All';
  expandBtn.style.cssText = 'background:#0d9488; color:#fff; border:none; border-radius:4px; cursor:pointer; padding:5px 14px; font-size:12px; font-weight:bold; margin-right:8px;';
  expandBtn.onclick = () => {
    const anyCollapsed = sectionRefs.some(({ grid }) => grid.style.display === 'none');
    const shouldExpand = anyCollapsed;
    sectionRefs.forEach(({ arrow, grid }) => {
      grid.style.display = shouldExpand ? 'grid' : 'none';
      arrow.style.transform = shouldExpand ? 'rotate(0deg)' : 'rotate(-90deg)';
    });
    expandBtn.textContent = shouldExpand ? '▾  Collapse All' : '▸  Expand All';
  };

  // v1.5.4: floating filename label, same pattern as Render PM widget.
  // v1.5.6: declared BEFORE cleanup() so removal is part of cleanup itself.
  // Every close path (Close button, overlay click, thumbnail click) goes
  // through the same cleanup function, so no path can orphan the label
  // in the DOM.
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

  // v1.5.6: cleanup removes the floating label too. Single source of truth.
  const cleanup = () => {
    floatLabel.remove();
    panel.remove();
    overlay.remove();
  };
  closeBtn.onclick = cleanup;
  overlay.onclick  = cleanup;
  panel.addEventListener('click', e => e.stopPropagation());

  const headerRight = document.createElement('div');
  headerRight.style.cssText = 'display:flex; align-items:center;';
  const cResorters = [];
  headerRight.appendChild(s5090SortSelect(() => cResorters.forEach(fn => fn())));
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

  if (!images || images.length === 0) {
    const empty = document.createElement('div');
    empty.style.cssText = 'text-align:center; color:#557070; padding:40px; font-size:12px;';
    empty.textContent = 'No images found in this project.';
    scrollArea.appendChild(empty);
  } else {
    // v1.5.4: group images by source-folder tag. Create PM tag set is
    // [CREATE], [EDITS], [CHARACTERS], [MULTIANGLE:<subject>].  v1.7.43:
    // CHARACTERS is shown too (Casting saves character images there).
    // If a filename has no tag, it goes into "OTHER".
    const buckets = new Map();
    images.forEach(filename => {
      const m = filename.match(/^\[(\w+)(?::([^\]]+))?\]/);
      const tag = m?.[1];
      const subj = m?.[2];
      const sectionKey = tag ? (subj ? `${tag}:${subj}` : tag) : 'OTHER';
      if (!buckets.has(sectionKey)) buckets.set(sectionKey, []);
      buckets.get(sectionKey).push(filename);
    });

    // Section ordering: CREATE, EDITS, then MULTIANGLE:<subject>
    // alphabetized by subject, then any OTHER bucket last.
    const sectionOrder = [];
    if (buckets.has('CREATE')) sectionOrder.push('CREATE');
    if (buckets.has('EDITS'))  sectionOrder.push('EDITS');
    if (buckets.has('CHARACTERS')) sectionOrder.push('CHARACTERS');
    if (buckets.has('GRAB'))       sectionOrder.push('GRAB');
    const multiKeys = Array.from(buckets.keys())
      .filter(k => k.startsWith('MULTIANGLE'))
      .sort();
    sectionOrder.push(...multiKeys);
    if (buckets.has('OTHER')) sectionOrder.push('OTHER');

    sectionOrder.forEach(sectionKey => {
      const sectionImages = buckets.get(sectionKey);
      if (!sectionImages || sectionImages.length === 0) return;

      const sectionColor = colorForFile(sectionImages[0]);

      // Header — Option B prominent style.
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
      // v1.5.5: arrow starts rotated -90deg to match default-collapsed state.
      arrow.style.cssText = `color:${sectionColor}; font-size:14px; transition:transform 0.15s ease; transform:rotate(-90deg);`;

      const sectionName = document.createElement('span');
      sectionName.textContent = sectionKey;
      sectionName.style.cssText = 'color:#2dd4bf; font-size:15px; font-weight:bold;';

      headerLeft.appendChild(arrow);
      headerLeft.appendChild(sectionName);

      const countPill = document.createElement('span');
      countPill.textContent = `${sectionImages.length} image${sectionImages.length === 1 ? '' : 's'}`;
      countPill.style.cssText = `background:${sectionColor}; color:#fff; font-size:11px; font-weight:bold; padding:3px 10px; border-radius:10px;`;

      sectionHeader.appendChild(headerLeft);
      sectionHeader.appendChild(countPill);

      const sectionGrid = document.createElement('div');
      Object.assign(sectionGrid.style, {
        // v1.5.5: collapsed by default. Click section header or the
        // master Expand All button to reveal.
        display:'none',
        gridTemplateColumns:'repeat(auto-fill, minmax(150px, 1fr))',
        gap:'8px', marginBottom:'16px',
      });

      // v1.5.5: register refs for the master Expand Toggle.
      sectionRefs.push({ arrow, grid: sectionGrid });

      sectionHeader.onclick = () => {
        const isCollapsed = sectionGrid.style.display === 'none';
        sectionGrid.style.display = isCollapsed ? 'grid' : 'none';
        arrow.style.transform = isCollapsed ? 'rotate(0deg)' : 'rotate(-90deg)';
      };

      // v1.7.49: sorted by the picker's Sort choice (newest first by default).
      const renderCells = () => {
      sectionGrid.innerHTML = '';
      s5090SortItems(sectionImages).forEach(filename => {
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

        const displayName = filename.replace(/^\[(CREATE|EDITS|CHARACTERS|GRAB|MULTIANGLE[^\]]*)\] /,'');

        const lbl = document.createElement('div');
        lbl.textContent = displayName.length>20 ? displayName.slice(0,19)+'…' : displayName;
        lbl.style.cssText = 'color:#cccccc; font-size:9px; margin-top:3px; word-break:break-all;';

        cell.appendChild(img);
        cell.appendChild(noImg);
        cell.appendChild(lbl);

        // Floating filename label on hover — full filename always.
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
      };
      renderCells();
      cResorters.push(renderCells);

      scrollArea.appendChild(sectionHeader);
      scrollArea.appendChild(sectionGrid);
    });
  }

  panel.appendChild(scrollArea);
  document.body.appendChild(overlay);
  document.body.appendChild(panel);
}

// ── Section heights ──────────────────────────────────────────────────────────
// v1.7.24: the Save Workflow / Open Workflow section is switched off.
// ComfyUI's own File menu is the one way to save and open workflows.
// The templates folder and each project's workflows folder are unchanged.
// Set this to true to bring the section back.
const SHOW_WORKFLOWS = false;

const HEIGHTS = {
  // v1.6.0: new top-most section. Two side-by-side buttons for Save/Open.
  workflows:
    CPM.LABEL_H + CPM.ITEM_GAP +
    CPM.BTN_H + CPM.ITEM_GAP,
  selectProject:
    CPM.LABEL_H + CPM.ITEM_GAP +
    CPM.BTN_H + CPM.ITEM_GAP,
  selectSubject:
    CPM.LABEL_H + CPM.ITEM_GAP +
    CPM.ROW_H + CPM.ITEM_GAP +              // subject dropdown
    CPM.ROW_H + CPM.ITEM_GAP +              // new subject input
    CPM.BTN_H + CPM.ITEM_GAP,               // create subject button
  createProject:
    CPM.LABEL_H + CPM.ITEM_GAP +
    CPM.ROW_H + CPM.ITEM_GAP +
    CPM.BTN_H + CPM.ITEM_GAP,
  multianglePanel:
    CPM.LABEL_H + CPM.ITEM_GAP +            // accent header
    CPM.PANEL_PAD +                          // inner top pad
    CPM.ROW_H + CPM.ITEM_GAP +              // source image picker
    CPM.ROW_H + CPM.ITEM_GAP +              // batch folder text
    CPM.ROW_H + CPM.ITEM_GAP +              // prompt modifier text
    CPM.BTN_H + CPM.ITEM_GAP +              // Generate All Angles (17) button
    CPM.ROW_H + CPM.ITEM_GAP +              // v1.5.8: angle dropdown
    CPM.BTN_H + CPM.ITEM_GAP +              // v1.5.8: Generate Single button
    CPM.THUMB_H + CPM.ITEM_GAP +             // source image thumbnail
    CPM.PANEL_PAD,                           // inner bottom pad
  status:
    CPM.ROW_H + CPM.ITEM_GAP,
};

// ── Main factory ──────────────────────────────────────────────────────────────
function buildCreatePMWidget(node) {

  const NATIVE = ['project', 'subject', 'source_image', 'batch_folder',
                  'prompt_modifier', 'selected_angle'];
  const nativeWidgets = {};
  for (const name of NATIVE) {
    const w = node.widgets?.find(w => w.name === name);
    if (w) {
      nativeWidgets[name] = w;
      w.computeSize = () => [0, -4];
      w.draw        = () => {};
    }
  }

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

  const ui = {
    newProjectName: '',
    newSubjectName: '',
    projects: [],
    subjects: [],
    // v1.5.7: angles list for the Generate Single dropdown. Loaded once at
    // node init from /studio5090/qwen_angles. Each entry is {prompt, suffix}.
    angles: [],
    status: '',
    statusOk: true,
    qwenRunning: false,
    // v1.5.7: separate flag for the single-angle generation so its button
    // can be disabled independently of the 17-pass batch.
    qwenSingleRunning: false,
  };

  let regions     = [];
  let statusTimer = null;

  // ── API loaders ──────────────────────────────────────────────────────────
  async function loadProjects() {
    try {
      const d = await capi.get('/studio5090/projects');
      ui.projects = d.projects || [];
    } catch (e) { console.error('[CreatePM] loadProjects', e); }
  }

  async function loadSubjects() {
    const project = getW('project');
    if (!project) { ui.subjects = []; return; }
    try {
      const d = await capi.get(`/studio5090/subjects?project=${cenc(project)}`);
      ui.subjects = d.subjects || [];
    } catch (e) { console.error('[CreatePM] loadSubjects', e); }
  }

  // v1.5.7: load the 17 Qwen angles once at init for the Generate Single
  // dropdown. The list is static across the toolkit's lifetime, so we only
  // fetch it once.
  async function loadAngles() {
    try {
      const d = await capi.get('/studio5090/qwen_angles');
      ui.angles = d.angles || [];
    } catch (e) { console.error('[CreatePM] loadAngles', e); }
  }

  async function refresh() {
    await loadProjects();
    await loadSubjects();
    try { rsv?.load(); } catch (e) { /* viewer not built */ }
    // v1.7.46: Refresh also writes every personal copy in STUDIO5090 to the ComfyUI log.
    let mine = [];
    try { mine = ((await capi.get('/studio5090/overrides?log=1')).overrides || []).map(o => o.label); }
    catch (e) { console.error('[CreatePM] overrides', e); }
    setStatus(mine.length ? `Refreshed ✓  Using your copy in STUDIO5090: ${mine.join(', ')}` : 'Refreshed ✓', true);
    redraw();
  }

  async function initialPopulate() {
    await loadProjects();
    if (getW('project')) await loadSubjects();
    await loadAngles();
    redraw();
  }

  // ── Mutations ────────────────────────────────────────────────────────────
  async function createProject() {
    const name = ui.newProjectName.trim();
    if (!name) { setStatus('Enter a project name', false); redraw(); return; }
    try {
      const d = await capi.post('/studio5090/create_project', { project_name: name });
      if (d.success) {
        setStatus(`Created: ${name} ✓`, true);
        ui.newProjectName = '';
        await loadProjects();
        setW('project', name);
        setW('subject', '');
        setW('source_image', '');
        setW('batch_folder', '');
        await loadSubjects();
      } else if (d.exists) {
        // v1.7.46: popup with Switch to it / OK.
        await loadProjects();
        const real = ui.projects.find(p => p.toLowerCase() === name.toLowerCase()) || name;
        if (await showProjectExists(real) === 'switch') {
          ui.newProjectName = '';
          setW('project', real);
          setW('subject', '');
          setW('source_image', '');
          setW('batch_folder', '');
          await loadSubjects();
          setStatus(`Switched to: ${real} ✓`, true);
        } else {
          setStatus(`'${real}' already exists`, false);
        }
      } else {
        setStatus(`Error: ${d.error}`, false);
      }
    } catch (e) {
      setStatus('Create failed', false);
      console.error('[CreatePM]', e);
    }
    redraw();
  }

  async function createSubject() {
    const name = ui.newSubjectName.trim();
    const project = getW('project');
    if (!name)    { setStatus('Enter a subject name', false); redraw(); return; }
    if (!project) { setStatus('Select a project first', false); redraw(); return; }
    try {
      const d = await capi.post('/studio5090/create_subject',
                                { project, subject_name: name });
      if (d.success) {
        setStatus(`Subject: ${d.subject} ✓`, true);
        ui.newSubjectName = '';
        await loadSubjects();
        setW('subject', d.subject);
        // Auto-prefill batch folder with the new subject name
        setW('batch_folder', d.subject);
      } else {
        setStatus(`Error: ${d.error}`, false);
      }
    } catch (e) {
      setStatus('Subject create failed', false);
      console.error('[CreatePM]', e);
    }
    redraw();
  }

  // ── Source image picker ──────────────────────────────────────────────────
  async function openSrcPicker() {
    const project = getW('project');
    if (!project) { setStatus('Select a project first', false); redraw(); return; }

    // v1.7.8: single call to /studio5090/all_frame_images with empty
    // subject. Returns CREATE + EDITS + CHARACTERS + every subfolder
    // under MULTIANGLE (including SINGLES where single-angle output
    // from CREATE/EDITS/CHARACTERS sources lands). The `subject` query
    // param is legacy on this endpoint — the walk does not filter by it.
    //
    // Prior versions called source_images once, then looped over
    // /studio5090/subjects calling all_frame_images per subject.
    // Two problems: (1) `subjects` deliberately excludes reserved
    // system folder names like SINGLES, so a project with only
    // SINGLES output and no named subjects had the loop iterate zero
    // times and MULTIANGLE went missing from the picker.
    // (2) all_frame_images returns the same complete list every time,
    // so per-subject iteration was wasted round trips.
    let images = [];
    try {
      const ma = await capi.get(
        `/studio5090/all_frame_images?project=${cenc(project)}&subject=`
      );
      images = ma.images || [];
      s5090RememberMtimes(ma);
    } catch (e) { console.warn('[CreatePM] all_frame_images', e); }

    if (!images.length) {
      setStatus('No images found in project', false); redraw(); return;
    }

    cShowThumbPicker(
      images,
      getW('source_image'),
      fn => {
        const m = fn.match(/^\[([^\]]+)\] (.+)$/);
        if (!m) return '';
        return `/studio5090/thumbnail?project=${cenc(project)}&folder=${encodeURIComponent(m[1])}&file=${cenc(m[2])}`;
      },
      `Source Image — ${project} (CREATE + EDITS + CHARACTERS + GRAB + MULTIANGLE)`,
      val => { setW('source_image', val); redraw(); }
    );
  }

  // Source image thumbnail URL (for in-panel preview)
  function srcThumbUrl() {
    const project = getW('project');
    const sourceImage = getW('source_image');
    if (!project || !sourceImage) return '';
    const m = sourceImage.match(/^\[([^\]]+)\] (.+)$/);
    if (!m) return '';
    return `/studio5090/thumbnail?project=${cenc(project)}&folder=${encodeURIComponent(m[1])}&file=${cenc(m[2])}`;
  }

  // ── Qwen batch ───────────────────────────────────────────────────────────
  async function runQwenBatch() {
    const project     = getW('project');
    const subject     = getW('subject').trim();
    const batchFolder = (getW('batch_folder') || '').trim();
    const sourceImage = getW('source_image');
    const promptMod   = (getW('prompt_modifier') || '').trim();

    if (!project)     { setStatus('Select a project first', false); redraw(); return; }
    if (!sourceImage) { setStatus('Pick a source image first', false); redraw(); return; }
    if (!batchFolder) { setStatus('Enter a batch folder name', false); redraw(); return; }
    if (ui.qwenRunning) { setStatus('Batch already running…', false); redraw(); return; }

    let resolvedSrc = '';
    try {
      const resolved = await capi.get(
        `/studio5090/resolve_image_path?project=${cenc(project)}&subject=${cenc(subject || batchFolder)}&tagged=${cenc(sourceImage)}`
      );
      if (!resolved.exists) {
        setStatus('Source image not found on disk', false); redraw(); return;
      }
      resolvedSrc = resolved.path;
    } catch (e) {
      setStatus('Could not resolve source image path', false); redraw(); return;
    }

    // Collision check on the batch folder
    let existsWarning = '';
    try {
      const ck = await capi.get(
        `/studio5090/check_subject_exists?project=${cenc(project)}&subject=${cenc(batchFolder)}`
      );
      if (ck.exists && ck.image_count > 0) {
        existsWarning =
          `⚠  Batch folder '${batchFolder}' already exists with ${ck.image_count} image(s).\n` +
          `New batch will be ADDED (existing files kept, ComfyUI auto-increments filenames).\n\n`;
      }
    } catch (e) {
      console.warn('[CreatePM] collision check failed', e);
    }

    const confirmed = await showConfirm(
      existsWarning +
      'About to queue and process 17 images.\n\n' +
      'Project: ' + project + '\n' +
      'Batch folder: ' + batchFolder + '\n' +
      (promptMod ? 'Prompt modifier: ' + promptMod + '\n' : '') +
      '\nProceed?'
    );
    if (!confirmed) { ui.qwenRunning = false; redraw(); return; }

    ui.qwenRunning = true;
    setStatus('Queuing 17 angles…', true); redraw();

    try {
      const workflow = buildCPMQwenWorkflow();
      const d = await capi.post('/studio5090/queue_qwen_batch', {
        project,
        subject:           batchFolder,
        output_subject:    batchFolder,
        source_image_path: resolvedSrc,
        prompt_modifier:   promptMod,
        workflow,
      });

      if (d.success) {
        setStatus(`Queued ${d.queued}/17 → ${d.subject_used || batchFolder} ✓`, true);
        await loadSubjects();
      } else {
        setStatus(`Queue error: ${d.error}`, false);
      }
    } catch (e) {
      setStatus('Queue failed — check console', false);
      console.error('[CreatePM Qwen]', e);
    }
    ui.qwenRunning = false;
    redraw();
  }

  // v1.5.7: Generate Single — render one angle (selected from the dropdown)
  // from the chosen source image. Output naming follows option 2:
  //   - Source from MULTIANGLE/<subject>/ → output lives in that same
  //     subject folder as <stem>_oneoff_<angle>.png
  //   - Source from CREATE/EDITS         → output lives in MULTIANGLE/SINGLES/
  //     as <stem>_<angle>.png
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

    // Parse the source tag (CREATE / EDITS / MULTIANGLE:<subject>) and the
    // bare filename out of the tagged source_image widget value.
    const m = sourceImage.match(/^\[([^\]]+)\] (.+)$/);
    if (!m) {
      setStatus('Source image is not tagged correctly', false); redraw(); return;
    }
    const sourceTag      = m[1];
    const sourceBasename = m[2];

    // Resolve the tagged source filename to its absolute path on disk.
    // The resolve route accepts subject as a query param for plain
    // [MULTIANGLE] tags, but our picker always tags with [MULTIANGLE:<subj>],
    // so subject= can be empty here.
    let resolvedSrc = '';
    try {
      const r = await capi.get(
        `/studio5090/resolve_image_path?project=${cenc(project)}&subject=&tagged=${cenc(sourceImage)}`
      );
      resolvedSrc = r.path || '';
    } catch (e) { /* fall through */ }
    if (!resolvedSrc) {
      setStatus('Could not resolve source image path', false); redraw(); return;
    }

    ui.qwenSingleRunning = true;
    setStatus(`Queuing single angle: ${angleSuffix}…`, true); redraw();

    try {
      const workflow = buildCPMQwenWorkflow();
      const d = await capi.post('/studio5090/queue_qwen_single', {
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
        await loadSubjects();
      } else {
        setStatus(`Queue error: ${d.error}`, false);
      }
    } catch (e) {
      setStatus('Single queue failed — check console', false);
      console.error('[CreatePM QwenSingle]', e);
    }
    ui.qwenSingleRunning = false;
    redraw();
  }

  // v1.6.0: Workflow save/load. Same pattern as Render PM.
  async function saveWorkflow() {
    try {
      const currentProject = getW('project');
      const projects = ui.projects.slice();
      if (!projects.length) {
        setStatus('No projects exist — create one first', false); redraw();
        return;
      }
      const defaultProject = projects.includes(currentProject)
        ? currentProject : projects[0];

      const projInput = await showTextPrompt(
        `Save to which project?\n\nAvailable: ${projects.join(', ')}\n\nDefault: ${defaultProject}`,
        defaultProject
      );
      if (projInput === null) return;
      const targetProject = projInput.trim() || defaultProject;
      if (!projects.includes(targetProject)) {
        setStatus(`Unknown project: ${targetProject}`, false); redraw();
        return;
      }

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

      const graphData = (typeof app !== 'undefined' && app.graphToPrompt)
        ? await app.graphToPrompt()
        : null;
      const workflowJson = graphData?.workflow || graphData;
      if (!workflowJson) {
        setStatus('Could not capture current workflow', false); redraw();
        return;
      }

      const d = await capi.post('/studio5090/save_workflow', {
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
      console.error('[CreatePM saveWorkflow]', e);
    }
    redraw();
  }

  async function openWorkflow() {
    try {
      // v1.7.3: cache-busting query param defeats browser HTTP caching
      // that could mask newly-created projects or newly-saved workflows.
      const d = await capi.get(`/studio5090/list_workflows?_=${Date.now()}`);
      const templates = d.templates || [];
      const projects  = d.projects  || {};
      const projectCount = Object.keys(projects).length;
      const totalFileCount = templates.length +
        Object.values(projects).reduce((s, arr) => s + arr.length, 0);
      // v1.7.3: only bail when there's truly nothing to show. Projects
      // with no saved workflows still open the picker so the user can
      // see them.
      if (totalFileCount === 0 && projectCount === 0) {
        setStatus('No workflows, templates, or projects available yet', false); redraw();
        return;
      }
      showWorkflowPicker(templates, projects, getW('project'), async (source, project, filename) => {
        // v1.6.1: no warning. Loads open in a new tab; no destructive
        // replacement of the current graph.
        try {
          const params = new URLSearchParams({
            source, filename, project: project || ''
          });
          const r = await capi.get(`/studio5090/load_workflow?${params.toString()}`);
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
          console.error('[CreatePM openWorkflow load]', e);
        }
        redraw();
      });
    } catch (e) {
      setStatus('Open failed — check console', false);
      console.error('[CreatePM openWorkflow list]', e);
      redraw();
    }
  }

  function buildCPMQwenWorkflow() {
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
    // Anchor event provides clientX/clientY in viewport coordinates.
    let leftPx, topPx;
    if (anchorEvent && typeof anchorEvent.clientX === 'number') {
      leftPx = anchorEvent.clientX;
      topPx  = anchorEvent.clientY + 8;  // slight offset below click point
      // Keep menu inside viewport
      const menuW = 240;
      const vw = window.innerWidth || 1920;
      const vh = window.innerHeight || 1080;
      if (leftPx + menuW > vw) leftPx = Math.max(8, vw - menuW - 8);
      if (topPx + 200 > vh) topPx = Math.max(8, vh - 220);
    } else {
      leftPx = rect.left + rect.width / 2 - 120;
      topPx  = rect.top  + rect.height / 2 - 100;
    }

    Object.assign(sel.style, {
      position:'fixed', background:'#1a2626', color:'#fff',
      border:'1px solid #0d9488', font:'11px "Courier New",monospace',
      zIndex:'99999', minWidth:'240px', padding:'4px',
      left: `${leftPx}px`,
      top:  `${topPx}px`,
    });
    items.forEach(item => {
      const o = document.createElement('option');
      o.value = item; o.textContent = item; sel.appendChild(o);
    });
    const cleanup = () => { if (sel.parentNode) document.body.removeChild(sel); };
    sel.addEventListener('change', () => { onSelect(sel.value); cleanup(); redraw(); });
    sel.addEventListener('blur', cleanup);
    document.body.appendChild(sel); sel.focus();
  }

  // ── Canvas widget ────────────────────────────────────────────────────────
  const widget = {
    name: 'cpm_ui',
    type: 'studio5090_cpm',
    value: null,
    options: {},
    serialize: false,

    computeSize(nw) {
      const h =
        CPM.SEC_GAP +
        (SHOW_WORKFLOWS ? HEIGHTS.workflows + CPM.SEC_GAP : 0) +       // v1.6.0
        HEIGHTS.selectProject + CPM.SEC_GAP +
        HEIGHTS.selectSubject + CPM.SEC_GAP +
        HEIGHTS.createProject + CPM.SEC_GAP +
        HEIGHTS.multianglePanel + CPM.SEC_GAP +
        HEIGHTS.status +
        CPM.PAD;
      return [nw, h];
    },

    draw(ctx, node, nw, y, height) {
      regions = [];
      const x = CPM.PAD, w = nw - CPM.PAD*2;
      let cy = y + CPM.SEC_GAP;

      const reg = (id, ry, rh, rx, rw) => regions.push({
        id, y:ry, h:rh,
        x: rx !== undefined ? rx : x,
        w: rw !== undefined ? rw : w,
      });

      ctx.fillStyle = '#1a1a1a';
      crr(ctx, x-4, y, w+8, height, 6); ctx.fill();

      // ── ⓪ WORKFLOWS (v1.6.0) ─────────────────────────────────────────
      if (SHOW_WORKFLOWS) {
      cy = cSecHeader(ctx, 'WORKFLOWS', x, cy, w);

      const wfBtnGap = 6;
      const wfBtnW = Math.floor((w - wfBtnGap) / 2);
      const wfBtnY = cy;
      cDrawBtn(ctx, '💾  Save Workflow…', x, cy, wfBtnW,
               CPM.tealDark, CPM.white, CPM.tealDark);
      reg('btn_saveWorkflow', wfBtnY, CPM.BTN_H, x, wfBtnW);
      cDrawBtn(ctx, '📂  Open Workflow…', x + wfBtnW + wfBtnGap, cy, wfBtnW,
               CPM.tealDark, CPM.white, CPM.tealDark);
      reg('btn_openWorkflow', wfBtnY, CPM.BTN_H, x + wfBtnW + wfBtnGap, wfBtnW);
      cy += CPM.BTN_H + CPM.ITEM_GAP;

      cy += CPM.SEC_GAP;
      }

      // ── ① SELECT PROJECT ─────────────────────────────────────────────
      cy = cSecHeader(ctx, 'SELECT PROJECT', x, cy, w);

      const refW = 84, pdW = w - refW - 8;
      ctx.fillStyle = CPM.tealDark; ctx.strokeStyle = CPM.tealDark; ctx.lineWidth = 1;
      crr(ctx, x, cy, refW, CPM.BTN_H, 4); ctx.fill(); ctx.stroke();
      ctx.fillStyle = CPM.white; ctx.font = 'bold 12px sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('⟳  Refresh', x + refW/2, cy + CPM.BTN_H/2);
      reg('btn_refresh', cy, CPM.BTN_H, x, refW);

      const pdX = x + refW + 8;
      const project = getW('project');
      ctx.fillStyle = '#353535'; ctx.strokeStyle = '#555555';
      crr(ctx, pdX, cy, pdW, CPM.BTN_H, 4); ctx.fill(); ctx.stroke();
      const pTxt = project || '— select project —';
      ctx.fillStyle = project ? CPM.white : CPM.dimGrey;
      ctx.font = '11px sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.fillText(pTxt.slice(0, Math.floor((pdW-24)/6.5)), pdX+6, cy + CPM.BTN_H/2);
      ctx.fillStyle = CPM.dimGrey; ctx.textAlign = 'right';
      ctx.fillText('▾', pdX+pdW-6, cy + CPM.BTN_H/2);
      reg('drop_project', cy, CPM.BTN_H, pdX, pdW);
      cy += CPM.BTN_H + CPM.ITEM_GAP;
      cy += CPM.SEC_GAP;

      // ── ② SELECT SUBJECT ─────────────────────────────────────────────
      cy = cSecHeader(ctx, 'SELECT SUBJECT', x, cy, w);

      const subjY = cy;
      cy = cDrawRow(ctx, 'Subject', getW('subject'), '— select subject —', x, cy, w, false);
      reg('drop_subject', subjY, CPM.ROW_H);

      const newSubjY = cy;
      cy = cDrawTextInput(ctx, 'New Subject', ui.newSubjectName, 'click to enter…', x, cy, w);
      reg('input_newSubject', newSubjY, CPM.ROW_H);

      const createSubjY = cy;
      // v1.7.11: gold fill for the Create Subject button. Visually
      // distinguishes it from the green Create Project button below —
      // creating a subject is a lightweight in-project operation while
      // creating a project is a heavier filesystem-tree operation.
      cy = cDrawBtn(ctx, 'Create Subject', x, cy, w, CPM.gold, CPM.white, CPM.goldLight);
      reg('btn_createSubject', createSubjY, CPM.BTN_H);
      cy += CPM.SEC_GAP;

      // ── ③ CREATE PROJECT ─────────────────────────────────────────────
      cy = cSecHeader(ctx, 'CREATE PROJECT', x, cy, w);
      const projNameY = cy;
      cy = cDrawTextInput(ctx, 'Project Name', ui.newProjectName, 'click to enter…', x, cy, w);
      reg('input_newProject', projNameY, CPM.ROW_H);
      const createProjY = cy;
      cy = cDrawBtn(ctx, 'Create Project', x, cy, w, CPM.greenDark, CPM.white, CPM.green);
      reg('btn_createProject', createProjY, CPM.BTN_H);
      cy += CPM.SEC_GAP;

      // ── ④ NEW MULTIANGLE SET (framed) ────────────────────────────────
      const panelTop    = cy;
      const panelBottom = cy + HEIGHTS.multianglePanel;
      const innerTop = panelTop + CPM.LABEL_H + CPM.ITEM_GAP;

      ctx.fillStyle   = CPM.tealPanel;
      ctx.strokeStyle = CPM.tealDark;
      ctx.lineWidth   = 1;
      crr(ctx, x, innerTop, w, panelBottom - innerTop, 4);
      ctx.fill(); ctx.stroke();

      cy = cAccentHeader(ctx, 'NEW MULTIANGLE SET', x, cy, w);

      const innerX = x + CPM.PANEL_PAD;
      const innerW = w - CPM.PANEL_PAD * 2;
      cy += CPM.PANEL_PAD - CPM.ITEM_GAP;

      const srcRowY = cy;
      cy = cDrawRow(ctx, 'Source Image', getW('source_image'),
                    '— pick image —', innerX, cy, innerW, true);
      reg('drop_sourceImage', srcRowY, CPM.ROW_H, innerX, innerW);

      const bfY = cy;
      cy = cDrawTextInput(ctx, 'Batch Folder', getW('batch_folder'),
                          '(prefilled from subject)', innerX, cy, innerW);
      reg('input_batchFolder', bfY, CPM.ROW_H, innerX, innerW);

      const pmY = cy;
      cy = cDrawTextInput(ctx, 'Prompt Mod', getW('prompt_modifier'),
                          '(appended to each angle — e.g. "on opera stage")',
                          innerX, cy, innerW);
      reg('input_promptModifier', pmY, CPM.ROW_H, innerX, innerW);

      const qwenY = cy;
      const qLabel = ui.qwenRunning ? 'Queuing…' : '▶  Generate All Angles  (17)';
      cy = cDrawBtn(ctx, qLabel, innerX, cy, innerW, '#2a1500', CPM.orange, CPM.orange);
      reg('btn_qwen', qwenY, CPM.BTN_H, innerX, innerW);

      // v1.5.7: Generate Single section. Angle dropdown selects one of the
      // 17 angles; the button renders only that one. The 17-pass button
      // above keeps its warning dialog; Generate Single does not warn.
      const angleY = cy;
      const angleLabel = getW('selected_angle') || '(pick an angle)';
      cy = cDrawRow(ctx, 'Angle', angleLabel, '(pick an angle)',
                    innerX, cy, innerW, false);
      reg('drop_selectedAngle', angleY, CPM.ROW_H, innerX, innerW);

      const singleY = cy;
      const singleLabel = ui.qwenSingleRunning ? 'Queuing…' : '▶  Generate Single Angle';
      // v1.7.2: Generate Single Angle button — bright saturated blue
      // fill with white text. Previous v1.7.1 dark-navy fill (#0f2540)
      // read as identical to the dark-teal panel background and made
      // the button visually disappear. Bright blue-600 fill pops
      // against the panel while remaining the complementary opposite
      // of the orange Generate All Angles button above.
      // Orange = big commit action; blue = iterative test action.
      cy = cDrawBtn(ctx, singleLabel, innerX, cy, innerW, '#2563eb', '#ffffff', '#1d4ed8');
      reg('btn_qwenSingle', singleY, CPM.BTN_H, innerX, innerW);

      // Source image thumbnail below the button
      cDrawSourceThumb(ctx, srcThumbUrl(), innerX, cy, innerW, CPM.THUMB_H,
                       'no source image selected');
      cy += CPM.THUMB_H + CPM.ITEM_GAP;

      cy = panelBottom + CPM.SEC_GAP;

      // ── Status bar ───────────────────────────────────────────────────
      if (ui.status) {
        ctx.fillStyle = ui.statusOk ? CPM.white : CPM.orange;
        ctx.font = 'bold 12px "Courier New",monospace';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(ui.status, x+w/2, cy+CPM.ROW_H/2);
      }
    },

    mouse(event, pos, node) {
      if (event.type !== 'pointerdown') return false;
      const rx = pos[0], ry = pos[1];

      for (const reg of regions) {
        if (ry < reg.y || ry > reg.y+reg.h) continue;
        if (rx < reg.x || rx > reg.x+reg.w) continue;

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
                setW('project', val);
                setW('subject', '');
                setW('source_image', '');
                setW('batch_folder', '');
                await loadSubjects();
                redraw();
              }, event);
            }
            return true;

          case 'drop_subject':
            if (!ui.subjects.length) {
              setStatus('No subjects — create one below ↓', false); redraw();
            } else {
              showMenu(ui.subjects, val => {
                setW('subject', val);
                // Auto-prefill batch folder with the selected subject
                setW('batch_folder', val);
                redraw();
              }, event);
            }
            return true;

          case 'input_newSubject': {
            (async () => {
              const v = await showTextPrompt('New subject name:', ui.newSubjectName || '');
              if (v !== null) { ui.newSubjectName = v.trim(); redraw(); }
            })();
            return true;
          }
          case 'btn_createSubject':
            createSubject();
            return true;

          case 'input_newProject': {
            (async () => {
              const v = await showTextPrompt('Project name:', ui.newProjectName || '');
              if (v !== null) { ui.newProjectName = v.trim(); redraw(); }
            })();
            return true;
          }
          case 'btn_createProject':
            createProject();
            return true;

          case 'drop_sourceImage':
            openSrcPicker();
            return true;

          case 'input_batchFolder': {
            (async () => {
              const v = await showTextPrompt(
                'Batch folder name (will be MULTIANGLE/<name>/):',
                getW('batch_folder') || ''
              );
              if (v !== null) { setW('batch_folder', v.trim()); redraw(); }
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
        }
      }
      return false;
    },
  };

  if (!node.widgets) node.widgets = [];
  node.widgets.push(widget);

  hookCallback('project', async () => {
    await loadSubjects();
    redraw();
  });
  hookCallback('subject',         () => redraw());
  hookCallback('source_image',    () => redraw());
  hookCallback('batch_folder',    () => redraw());
  hookCallback('prompt_modifier', () => redraw());
  hookCallback('selected_angle',  () => redraw());

  function hookCallback(name, after) {
    const w = nativeWidgets[name];
    if (!w) return;
    const orig = w.callback;
    w.callback = (val) => {
      if (orig) { try { orig.call(w, val); } catch (e) {} }
      try { after(val); } catch (e) {}
    };
  }

  // ── v1.7.55: Render Style viewer ─────────────────────────────────────
  // Pick a style, read its text, copy it into a FLUX or QWEN prompt.
  // Viewer only: no input or output, nothing saved with the workflow.
  const RSV_H = 196;
  const rsv = buildRenderStyleViewer();
  const rsvWidget = node.addDOMWidget?.('render_style_viewer', 'studio5090_rsview', rsv.el, {
    serialize: false,
    hideOnZoom: false,
    getMinHeight: () => RSV_H,
    getMaxHeight: () => RSV_H,
  });
  if (rsvWidget) {
    rsvWidget.serialize = false;
    rsvWidget.computeSize = (w) => [w, RSV_H];
  }
  rsv.load();

  node.setSize([CPM.NODE_W, node.computeSize()[1]]);
  node.resizable = false;

  initialPopulate();

  function buildRenderStyleViewer() {
    const el = document.createElement('div');
    el.style.cssText = 'box-sizing:border-box; width:100%; height:' + RSV_H + 'px; padding:6px 10px 8px; ' +
      'background:#1a1a1a; border-radius:6px; display:flex; flex-direction:column; gap:5px; ' +
      'font-family:"Courier New", monospace;';
    for (const ev of ['pointerdown', 'mousedown', 'wheel', 'keydown', 'contextmenu']) {
      el.addEventListener(ev, e => e.stopPropagation());
    }

    const head = document.createElement('div');
    head.textContent = 'RENDER STYLES';
    head.style.cssText = 'color:#2dd4bf; font-size:11px; font-weight:bold; letter-spacing:1px;';

    const row = document.createElement('div');
    row.style.cssText = 'display:flex; gap:6px; align-items:center;';
    const sel = document.createElement('select');
    sel.title = 'Pick a render style to see its text';
    sel.style.cssText = 'flex:1 1 auto; min-width:0; background:#111e1e; color:#e0f4f4; ' +
      'border:1px solid #0d9488; border-radius:4px; padding:3px 4px; font-size:12px;';
    const copyBtn = document.createElement('button');
    copyBtn.textContent = 'Copy';
    copyBtn.title = 'Copy this style text to the clipboard';
    copyBtn.style.cssText = 'background:#0d9488; color:#fff; border:none; border-radius:4px; ' +
      'padding:4px 14px; font-size:12px; font-weight:bold; cursor:pointer;';
    row.append(sel, copyBtn);

    const text = document.createElement('textarea');
    text.readOnly = true;
    text.spellcheck = false;
    text.placeholder = 'Pick a render style above to see its text.';
    text.style.cssText = 'flex:1 1 auto; resize:none; background:#0f1515; color:#d6e6e6; ' +
      'border:1px solid #2a3a3a; border-radius:4px; padding:5px 6px; font-size:11px; ' +
      'line-height:1.35; font-family:sans-serif; overflow-y:auto;';

    const note = document.createElement('div');
    note.style.cssText = 'color:#8aa; font-size:10px; min-height:12px;';

    el.append(head, row, text, note);

    let bodies = {};
    const show = () => { text.value = bodies[sel.value] || ''; text.scrollTop = 0; note.textContent = ''; };
    sel.addEventListener('change', show);

    copyBtn.onclick = async () => {
      if (!text.value) { note.textContent = 'Pick a style first.'; return; }
      try {
        if (window.isSecureContext && navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(text.value);
        } else {
          text.focus(); text.select();
          if (!document.execCommand('copy')) throw new Error('blocked');
          text.setSelectionRange(0, 0);
        }
        note.textContent = `Copied "${sel.value}".  Paste it with Ctrl+V.`;
      } catch (e) {
        text.focus(); text.select();
        note.textContent = 'The browser blocked Copy.  The text is selected, press Ctrl+C.';
      }
    };

    async function load() {
      const keep = sel.value;
      try {
        const d = await capi.get('/studio5090/render_styles?bodies=1');
        bodies = d.bodies || {};
        sel.innerHTML = '';
        const first = document.createElement('option');
        first.value = ''; first.textContent = '— pick a render style —';
        sel.appendChild(first);
        for (const name of (d.styles || [])) {
          const o = document.createElement('option');
          o.value = name; o.textContent = name;
          sel.appendChild(o);
        }
        if (keep && bodies[keep] !== undefined) sel.value = keep;
        show();
      } catch (e) {
        console.error('[CreatePM] render styles', e);
        note.textContent = 'Could not load render styles.';
      }
    }
    return { el, load };
  }
}

app.registerExtension({
  name: 'Studio5090.CreateProjectManager',
  nodeCreated(node) {
    if (node.constructor?.comfyClass !== 'Studio5090CreateProjectManager') return;
    buildCreatePMWidget(node);
  },
});
