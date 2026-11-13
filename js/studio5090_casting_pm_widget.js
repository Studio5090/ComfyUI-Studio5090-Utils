/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Alan Rosenfeld
 * Studio5090 — see LICENSE at the repository root for full terms.
 * Provided "AS IS", without warranty of any kind.
 */

/**
 * Studio5090 Casting Project Manager — Canvas UI v1.7.11
 * For the CASTING audio production tab.
 *
 * Mirrors the structure of the Create PM (studio5090_create_pm_widget.js)
 * minus image work. CASTING is a project manager for the audio pipeline —
 * project + subject bookkeeping, accent selection, and an audio output
 * path stem that flows downstream into a Save Audio (FLAC) node.
 *
 * Layout (top to bottom):
 *   WORKFLOWS        — Save Workflow / Open Workflow buttons
 *   SELECT PROJECT   — Refresh + dropdown
 *   CREATE PROJECT   — text input + Create button
 *   SELECT/CREATE SUBJECT — subject dropdown + new subject input + Create
 *   ACCENT           — accent dropdown
 *
 * Outputs (from the Python node):
 *   project (STRING), subject (STRING),
 *   audio_output_path (STRING), accent_trigger (STRING), accent_body (STRING)
 */

const { app } = window.comfyAPI.app;

// ── Layout constants ────────────────────────────────────────────────────────
const KPM = {
  NODE_W:    400,
  PAD:       12,
  SEC_GAP:   10,
  ITEM_GAP:  4,
  PANEL_PAD: 8,

  ROW_H:     26,
  BTN_H:     30,
  LABEL_H:   22,

  bgSection: '#1a1a1a',
  bgPanel:   '#222d2d',
  bgInput:   '#0d1a1a',
  border:    '#0d9488',
  borderHi:  '#2dd4bf',
  text:      '#e0f4f4',
  textDim:   '#8aa0a0',
  textHdr:   '#2dd4bf',
  accent:    '#2dd4bf',
  tealDark:  '#0d9488',
  green:     '#16a34a',
  greenDark: '#15803d',
  // v1.7.11: gold accent for the Create Subject button. Matches Create PM's
  // convention — subject creation reads as a lightweight in-project action,
  // project creation stays green because it builds the whole folder tree.
  gold:      '#866700',
  goldLight: '#a68520',
  white:     '#ffffff',
  orange:    '#f97316',
};

// ── API helper (shared HTTP wrapper) ────────────────────────────────────────
const kapi = {
  async get(url) {
    const r = await fetch(url);
    if (!r.ok) throw new Error(`GET ${url} -> ${r.status}`);
    return r.json();
  },
  async post(url, body) {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!r.ok) throw new Error(`POST ${url} -> ${r.status}`);
    return r.json();
  },
};

function kenc(s) { return encodeURIComponent(s || ''); }

// ── Canvas drawing primitives ───────────────────────────────────────────────
function krr(ctx, x, y, w, h, r) {
  if (w < 2*r) r = w/2;
  if (h < 2*r) r = h/2;
  ctx.beginPath();
  ctx.moveTo(x+r, y);
  ctx.arcTo(x+w, y, x+w, y+h, r);
  ctx.arcTo(x+w, y+h, x, y+h, r);
  ctx.arcTo(x, y+h, x, y, r);
  ctx.arcTo(x, y, x+w, y, r);
  ctx.closePath();
}

function kSecHeader(ctx, label, x, y, w) {
  ctx.fillStyle = '#000000';
  krr(ctx, x, y, w, KPM.LABEL_H, 3); ctx.fill();
  ctx.fillStyle = KPM.white;
  ctx.font = 'bold 11px "Courier New", monospace';
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.fillText(label, x+8, y+KPM.LABEL_H/2);
  return y + KPM.LABEL_H + KPM.ITEM_GAP;
}

function kAccentHeader(ctx, label, x, y, w) {
  ctx.fillStyle = KPM.tealDark;
  krr(ctx, x, y, w, KPM.LABEL_H, 3); ctx.fill();
  ctx.fillStyle = KPM.white;
  ctx.font = 'bold 11px "Courier New", monospace';
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.fillText(label, x+8, y+KPM.LABEL_H/2);
  return y + KPM.LABEL_H + KPM.ITEM_GAP;
}

function kDrawRow(ctx, label, value, placeholder, x, y, w) {
  ctx.font = '11px Arial';
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.fillStyle = KPM.text;
  ctx.fillText(label, x, y+KPM.ROW_H/2);

  const dx = x + 110, dw = w - 110;
  ctx.fillStyle = KPM.bgInput;
  krr(ctx, dx, y, dw, KPM.ROW_H, 4); ctx.fill();
  ctx.strokeStyle = KPM.border;
  ctx.lineWidth = 1;
  krr(ctx, dx, y, dw, KPM.ROW_H, 4); ctx.stroke();

  const display = value || placeholder;
  const has = !!value;
  ctx.fillStyle = has ? KPM.text : KPM.textDim;
  const maxCh = Math.floor((dw-30)/6.5);
  ctx.fillText(
    display.length > maxCh ? display.slice(0, maxCh-1) + '…' : display,
    dx+8, y+KPM.ROW_H/2);

  ctx.fillStyle = KPM.accent;
  ctx.font = 'bold 12px Arial';
  ctx.textAlign = 'right';
  ctx.fillText('▾', dx+dw-6, y+KPM.ROW_H/2);

  return y + KPM.ROW_H + KPM.ITEM_GAP;
}

function kDrawTextInput(ctx, label, value, placeholder, x, y, w) {
  ctx.font = '11px Arial';
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.fillStyle = KPM.text;
  ctx.fillText(label, x, y+KPM.ROW_H/2);

  const ix = x + 110, iw = w - 110;
  ctx.fillStyle = KPM.bgInput;
  krr(ctx, ix, y, iw, KPM.ROW_H, 4); ctx.fill();
  ctx.strokeStyle = KPM.border;
  ctx.lineWidth = 1;
  krr(ctx, ix, y, iw, KPM.ROW_H, 4); ctx.stroke();

  const has = !!value;
  ctx.fillStyle = has ? KPM.text : KPM.textDim;
  const maxCh = Math.floor((iw-16)/6.5);
  ctx.fillText(
    (has ? value : placeholder).slice(0, maxCh),
    ix+8, y+KPM.ROW_H/2);

  return y + KPM.ROW_H + KPM.ITEM_GAP;
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

function kDrawBtn(ctx, label, x, y, w, bg, fg, border) {
  s5090ButtonFace(ctx, krr, x, y, w, KPM.BTN_H, 5, bg);
  ctx.fillStyle = fg;
  ctx.font = 'bold 12px Arial';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, x+w/2, y+KPM.BTN_H/2);
  return y + KPM.BTN_H + KPM.ITEM_GAP;
}

// ── Modal helpers — text prompt, confirm, accent picker, workflow picker ────
// (Identical to Render/Create PM definitions; functions at module scope are
// redeclared in every widget file so each can use them regardless of which
// loads first. The redeclarations are intentional and harmless because the
// definitions match.)

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

// Accent picker — modal showing the accents from the active accents file.
// v1.7.2: bare-name rows only; body-preview column removed. List is
// sorted alphabetically at render time regardless of the file's own
// ordering, so the picker stays readable even if a user-side
// STUDIO5090/accents.txt override was authored in a different order.
function showCastingAccentPicker(accents, currentName, onSelect) {
  document.getElementById('s5090-accent-picker')?.remove();
  document.getElementById('s5090-accent-overlay')?.remove();

  const overlay = document.createElement('div');
  overlay.id = 's5090-accent-overlay';
  Object.assign(overlay.style, {
    position:'fixed', inset:'0', background:'rgba(0,0,0,0.55)', zIndex:'99998',
  });

  const panel = document.createElement('div');
  panel.id = 's5090-accent-picker';
  Object.assign(panel.style, {
    position:'fixed', top:'50%', left:'50%',
    transform:'translate(-50%,-50%)',
    background:'#1a2626', border:'2px solid #0d9488',
    borderRadius:'8px', padding:'0', zIndex:'99999',
    width:'min(420px, 90vw)', maxHeight:'80vh',
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
  ttl.textContent = 'Pick an Accent';
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

  if (!accents || !accents.length) {
    const empty = document.createElement('div');
    empty.style.cssText = 'text-align:center; color:#557070; padding:40px; font-size:12px;';
    empty.textContent = 'No accents found.\n\nCheck templates/accents.txt in the toolkit, or create STUDIO5090/accents.txt with your own.';
    empty.style.whiteSpace = 'pre-line';
    list.appendChild(empty);
  } else {
    // v1.7.2: defensive alphabetical sort. Guarantees ordered display
    // even when the source file's own ordering is stale or arbitrary.
    const sorted = accents.slice().sort((a, b) =>
      String(a.name || '').localeCompare(String(b.name || '')));

    sorted.forEach(a => {
      const row = document.createElement('div');
      const isSelected = a.name === currentName;
      Object.assign(row.style, {
        display:'block',
        background: isSelected ? '#134e4a' : '#1f3232',
        border: `2px solid ${isSelected ? '#2dd4bf' : '#0d3838'}`,
        borderRadius:'5px', padding:'10px 14px', marginBottom:'6px',
        cursor:'pointer', transition:'background 0.12s ease',
      });

      const nameEl = document.createElement('div');
      nameEl.textContent = a.name;
      nameEl.style.cssText = 'color:#2dd4bf; font-family:"Courier New",monospace; font-size:13px; font-weight:bold;';
      row.appendChild(nameEl);

      row.onmouseenter = () => { if (!isSelected) row.style.background = '#234848'; };
      row.onmouseleave = () => { if (!isSelected) row.style.background = '#1f3232'; };
      row.onclick = () => { onSelect(a.name); cleanup(); };

      list.appendChild(row);
    });
  }

  panel.appendChild(list);
  document.body.appendChild(overlay);
  document.body.appendChild(panel);
}

// Workflow picker (identical to the version in Render PM / Create PM).
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
  // instead of bailing silently — so all projects are discoverable.
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
      display:'none', flexDirection:'column', gap:'4px', marginBottom:'12px',
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
        row.onclick = () => { onSelect(source, projectName, filename); cleanup(); };
        list.appendChild(row);
      });
    }

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

// ── Section heights (computeSize + draw share these) ────────────────────────
// v1.7.24: the Save Workflow / Open Workflow section is switched off.
// ComfyUI's own File menu is the one way to save and open workflows.
// The templates folder and each project's workflows folder are unchanged.
// Set this to true to bring the section back.
const SHOW_WORKFLOWS = false;

const HEIGHTS = {
  workflows:
    KPM.LABEL_H + KPM.ITEM_GAP +
    KPM.BTN_H + KPM.ITEM_GAP,

  selectProject:
    KPM.LABEL_H + KPM.ITEM_GAP +
    KPM.BTN_H + KPM.ITEM_GAP,

  createProject:
    KPM.LABEL_H + KPM.ITEM_GAP +
    KPM.ROW_H + KPM.ITEM_GAP +
    KPM.BTN_H + KPM.ITEM_GAP,

  // v1.7.33: RETRIEVE SETTINGS header + Fetch Data From Video button
  retrieve:
    KPM.LABEL_H + KPM.ITEM_GAP +
    KPM.BTN_H + KPM.ITEM_GAP,

  // Subject panel: accent header + subject dropdown + new subject input + Create
  subjectPanel:
    KPM.LABEL_H + KPM.ITEM_GAP +
    KPM.PANEL_PAD +
    KPM.ROW_H + KPM.ITEM_GAP +    // subject dropdown
    KPM.ROW_H + KPM.ITEM_GAP +    // new subject text input
    KPM.BTN_H + KPM.ITEM_GAP +    // Create Subject button
    KPM.PANEL_PAD,

  // Accent panel: accent header + accent dropdown
  accentPanel:
    KPM.LABEL_H + KPM.ITEM_GAP +
    KPM.PANEL_PAD +
    KPM.ROW_H + KPM.ITEM_GAP +    // accent dropdown
    KPM.PANEL_PAD,

  // v1.7.35: Render Style panel: header + style dropdown button
  stylePanel:
    KPM.LABEL_H + KPM.ITEM_GAP +
    KPM.PANEL_PAD +
    KPM.BTN_H + KPM.ITEM_GAP +
    KPM.PANEL_PAD,

  status:
    KPM.ROW_H + KPM.ITEM_GAP,
};

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

// ── RETRIEVE SETTINGS helpers (v1.7.33, same as the Render PM) ─────────────
// Hand the text straight to every node wired to render_settings, so it shows
// without pressing Run.  Returns how many nodes took it.
function kPushSettingsToDisplays(node, text) {
  let shown = 0;
  try {
    const out = node.outputs?.find(o => o.name === 'render_settings');
    const graph = node.graph;
    for (const id of (out?.links || [])) {
      const link = graph.getLink?.(id) ?? graph.links?.get?.(id) ?? graph.links?.[id];
      const target = link ? graph.getNodeById(link.target_id) : null;
      if (target && typeof target.onExecuted === 'function') {
        target.onExecuted({ text: [text] });
        shown++;
      }
    }
    graph.setDirtyCanvas?.(true, true);
  } catch (e) { console.warn('[Studio5090] could not push settings to display nodes', e); }
  return shown;
}

// Windows file dialog.  The picked file is matched by name and size to the
// same file in ComfyUI's output or input folder; nothing is uploaded.
// Resolves to {file, text}, {error, detail}, or null if cancelled.
function kPickSettingsFile() {
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

// v1.7.37: render styles come from render_styles.txt (see the Render PM).
// What the RENDER STYLE button shows; names match regardless of case.
const K_STYLE_NONE = '0_NO RENDER STYLE ADDED';
function kStyleLabel(value, styles, loaded) {
  const v = (value || '').trim();
  if (!v || v.includes('\n')) return { label: K_STYLE_NONE, ok: true };
  const hit = styles.find(n => n.trim().toLowerCase() === v.toLowerCase());
  if (hit) return { label: hit, ok: true };
  if (!loaded) return { label: v, ok: true };
  return { label: '⚠ ' + v + ' (not in render_styles.txt)', ok: false };
}

// v1.7.37: the outputs of this node changed (the number output was removed,
// three style outputs were added).  When a workflow saved by an older
// version is opened, ComfyUI keeps each wire on the same output POSITION,
// so wires would land on the wrong output.  Before the workflow is built,
// this moves every wire in the saved file onto the output with the same
// NAME, and removes wires whose output no longer exists.
let K_OUTPUT_NAMES = [], K_OUTPUT_TYPES = [];
function kRemapSavedWorkflow(data) {
  try {
    if (!data || !K_OUTPUT_NAMES.length) return;
    const graphs = [data, ...((data.definitions && data.definitions.subgraphs) || [])];
    let moved = 0, dropped = 0;
    for (const g of graphs) {
      for (const n of (g.nodes || [])) {
        if (n.type !== 'Studio5090CastingProjectManager' || !Array.isArray(n.outputs)) continue;
        const saved = n.outputs.map(o => o && o.name);
        if (saved.length === K_OUTPUT_NAMES.length && saved.every((x, i) => x === K_OUTPUT_NAMES[i])) continue;
        // v1.7.54: outputs that were renamed.  A wire on the old name moves to the new one.
        const RENAMED = { flux_render_style_llm: 'flux_prompt_formatter_llm' };
        const slotMap = saved.map(name => K_OUTPUT_NAMES.indexOf(RENAMED[name] || name));
        const fresh = K_OUTPUT_NAMES.map((name, i) => ({ name, type: K_OUTPUT_TYPES[i], links: [] }));
        const dropIds = new Set();
        const links = g.links || [];
        for (let k = links.length - 1; k >= 0; k--) {
          const L = links[k];
          const isArr = Array.isArray(L);
          const id = isArr ? L[0] : L.id;
          const origin = isArr ? L[1] : L.origin_id;
          if (origin !== n.id) continue;
          const oldSlot = isArr ? L[2] : L.origin_slot;
          const j = slotMap[oldSlot];
          if (j === undefined || j < 0) { dropIds.add(id); links.splice(k, 1); dropped++; continue; }
          if (isArr) { L[2] = j; L[5] = K_OUTPUT_TYPES[j]; } else { L.origin_slot = j; L.type = K_OUTPUT_TYPES[j]; }
          fresh[j].links.push(id);
          if (j !== oldSlot) moved++;
        }
        n.outputs = fresh;
        if (dropIds.size) {
          for (const t of (g.nodes || [])) {
            for (const inp of (t.inputs || [])) if (dropIds.has(inp.link)) inp.link = null;
          }
        }
      }
    }
    if (moved || dropped) console.info(`[Studio5090] Casting PM outputs updated: ${moved} wire(s) moved by name, ${dropped} removed`);
  } catch (e) { console.warn('[Studio5090] could not update Casting PM wires', e); }
}

// ── Main factory ────────────────────────────────────────────────────────────
function buildCastingPMWidget(node) {

  const NATIVE = ['project', 'subject', 'accent', 'render_style', 'render_settings'];
  const nativeWidgets = {};
  for (const name of NATIVE) {
    const w = node.widgets?.find(w => w.name === name);
    if (w) {
      nativeWidgets[name] = w;
      w.computeSize = () => [0, -4];
      w.draw        = () => {};
    }
  }

  // v1.7.33: settings text is session-only, never saved in the workflow.
  if (nativeWidgets.render_settings) {
    nativeWidgets.render_settings.serialize = false;
    nativeWidgets.render_settings.value = '';
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

  // v1.7.33: a new project means old settings no longer apply.
  function clearCastingSettings() {
    if (!getW('render_settings')) return;
    setW('render_settings', '');
    kPushSettingsToDisplays(node, '');
  }

  const ui = {
    newProjectName: '',
    newSubjectName: '',
    projects: [],
    subjects: [],   // simple per-project subject memory (in-session only)
    accents: [],    // [{name, body}, ...]
    status: '',
    statusOk: true,
  };

  let regions = [];
  let statusTimer = null;

  // ── API loaders ──────────────────────────────────────────────────────────
  async function loadProjects() {
    try {
      const d = await kapi.get('/studio5090/projects');
      ui.projects = d.projects || [];
    } catch (e) { console.error('[CastingPM] loadProjects', e); }
  }

  async function loadSubjects() {
    const project = getW('project');
    if (!project) { ui.subjects = []; return; }
    try {
      // v1.7.36: Casting's own subject list, saved per project.
      const d = await kapi.get(`/studio5090/casting/subjects?project=${kenc(project)}`);
      ui.subjects = d.subjects || [];
    } catch (e) { console.error('[CastingPM] loadSubjects', e); }
  }

  // v1.7.37: render style names from render_styles.txt.
  async function loadStyles() {
    try {
      const d = await kapi.get('/studio5090/render_styles');
      ui.styles = d.styles || [];
      ui.stylesLoaded = true;
    } catch (e) { console.error('[CastingPM] loadStyles', e); }
  }

  async function loadAccents() {
    try {
      const d = await kapi.get('/studio5090/accents');
      ui.accents = d.accents || [];
    } catch (e) { console.error('[CastingPM] loadAccents', e); }
  }

  // v1.7.45: the LLM instruction files.  A copy in the STUDIO5090 folder
  // wins over the toolkit's, so say so: it also means toolkit fixes to that
  // file do not reach this user.
  async function loadOverrides() {
    try {
      const d = await kapi.get('/studio5090/llm_overrides');
      return d.overrides || [];
    } catch (e) { console.error('[CastingPM] loadOverrides', e); return []; }
  }
  function overrideNotice(list) {
    return list.length ? `Using your copy in STUDIO5090: ${list.join(', ')}` : '';
  }

  async function refresh() {
    await loadProjects();
    await loadSubjects();
    await loadAccents();
    await loadStyles();             // v1.7.37
    // v1.7.46: Refresh also writes every personal copy to the ComfyUI log.
    let mine = [];
    try { mine = ((await kapi.get('/studio5090/overrides?log=1')).overrides || []).map(o => o.label); }
    catch (e) { console.error('[CastingPM] overrides', e); }
    const note = overrideNotice(mine);
    setStatus(note ? `Refreshed ✓  ${note}` : 'Refreshed ✓', true);
    redraw();
  }

  async function initialPopulate() {
    await loadProjects();
    if (getW('project')) await loadSubjects();
    await loadAccents();
    await loadStyles();             // v1.7.37
    const note = overrideNotice(await loadOverrides());
    if (note) {
      console.info(`[Studio5090] Casting PM: ${note}`);
      setStatus(note, true);
    }
    redraw();
  }

  // ── Mutations ────────────────────────────────────────────────────────────
  async function createProject() {
    const name = ui.newProjectName.trim();
    if (!name) { setStatus('Enter a project name', false); redraw(); return; }
    try {
      const d = await kapi.post('/studio5090/create_project', { project_name: name });
      if (d.success) {
        clearCastingSettings();   // v1.7.46: moved here from the button, so a name that already exists clears nothing
        setStatus(`Created: ${name} ✓`, true);
        ui.newProjectName = '';
        await loadProjects();
        setW('project', name);
        await loadSubjects();
      } else if (d.exists) {
        // v1.7.46: popup with Switch to it / OK.
        await loadProjects();
        const real = ui.projects.find(p => p.toLowerCase() === name.toLowerCase()) || name;
        if (await showProjectExists(real) === 'switch') {
          if (real !== getW('project')) clearCastingSettings();
          ui.newProjectName = '';
          setW('project', real);
          await loadSubjects();
          setStatus(`Switched to: ${real} ✓`, true);
        } else {
          setStatus(`'${real}' already exists`, false);
        }
      } else {
        setStatus(`Error: ${d.error}`, false);
      }
    } catch (e) {
      setStatus('Project create failed', false);
      console.error('[CastingPM]', e);
    }
    redraw();
  }

  async function createSubject() {
    const project = getW('project');
    if (!project) { setStatus('Select a project first', false); redraw(); return; }
    const name = ui.newSubjectName.trim();
    if (!name) { setStatus('Enter a subject name', false); redraw(); return; }
    try {
      // v1.7.36: saved straight away, so it survives a restart.
      const d = await kapi.post('/studio5090/casting/create_subject',
                                { project, subject_name: name });
      if (d.success) {
        setStatus(`Subject: ${d.subject} ✓`, true);
        ui.newSubjectName = '';
        await loadSubjects();
        setW('subject', d.subject);
      } else {
        setStatus(`Error: ${d.error}`, false);
      }
    } catch (e) {
      setStatus('Subject create failed', false);
      console.error('[CastingPM]', e);
    }
    redraw();
  }

  // ── Workflow save/load ───────────────────────────────────────────────────
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
      const suggested = `${targetProject}_casting`;
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
      const d = await kapi.post('/studio5090/save_workflow', {
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
      console.error('[CastingPM saveWorkflow]', e);
    }
    redraw();
  }

  async function openWorkflow() {
    try {
      // v1.7.3: cache-busting query param defeats browser HTTP caching.
      const d = await kapi.get(`/studio5090/list_workflows?_=${Date.now()}`);
      const templates = d.templates || [];
      const projects  = d.projects  || {};
      const projectCount = Object.keys(projects).length;
      const totalFileCount = templates.length +
        Object.values(projects).reduce((s, arr) => s + arr.length, 0);
      // v1.7.3: projects with no saved workflows still open the picker
      // so the user can see them.
      if (totalFileCount === 0 && projectCount === 0) {
        setStatus('No workflows, templates, or projects available yet', false); redraw();
        return;
      }
      showWorkflowPicker(templates, projects, getW('project'), async (source, project, filename) => {
        try {
          const params = new URLSearchParams({
            source, filename, project: project || ''
          });
          const r = await kapi.get(`/studio5090/load_workflow?${params.toString()}`);
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
          console.error('[CastingPM openWorkflow load]', e);
        }
        redraw();
      });
    } catch (e) {
      setStatus('Open failed — check console', false);
      console.error('[CastingPM openWorkflow list]', e);
      redraw();
    }
  }

  // ── Status ───────────────────────────────────────────────────────────────
  function setStatus(msg, ok = true) {
    ui.status = msg;
    ui.statusOk = ok;
    if (statusTimer) clearTimeout(statusTimer);
    statusTimer = setTimeout(() => { ui.status = ''; redraw(); }, 5000);
  }

  // ── Redraw trigger ───────────────────────────────────────────────────────
  function redraw() {
    if (node.graph?.canvas?.draw) {
      node.graph.canvas.draw(true, true);
    } else if (node.setDirtyCanvas) {
      node.setDirtyCanvas(true, true);
    }
  }

  function reg(id, y, h, x, w) {
    regions.push({ id, y, h, x, w });
  }

  // ── Submenu helper (for dropdowns of strings) ────────────────────────────
  // Reuses LiteGraph's ContextMenu via the canvas.
  function showMenu(items, onSelect, event) {
    const menu = new LiteGraph.ContextMenu(
      items.map(it => ({ content: it, callback: () => onSelect(it) })),
      { event }
    );
  }

  // ── Custom widget (canvas-drawn) ─────────────────────────────────────────
  const widget = {
    name: 'casting_pm_ui',
    type: 'studio5090_casting_pm',
    value: null,
    options: {},
    serialize: false,

    computeSize(nw) {
      const h =
        KPM.SEC_GAP +
        (SHOW_WORKFLOWS ? HEIGHTS.workflows + KPM.SEC_GAP : 0) +
        HEIGHTS.selectProject + KPM.SEC_GAP +
        HEIGHTS.createProject + KPM.SEC_GAP +
        HEIGHTS.retrieve + KPM.SEC_GAP +
        HEIGHTS.subjectPanel + KPM.SEC_GAP +
        HEIGHTS.accentPanel + KPM.SEC_GAP +
        HEIGHTS.stylePanel + KPM.SEC_GAP +
        HEIGHTS.status +
        KPM.PAD;
      return [nw, h];
    },

    draw(ctx, node, nw, y, height) {
      regions = [];
      const x = KPM.PAD, w = nw - KPM.PAD*2;
      let cy = y + KPM.SEC_GAP;

      ctx.fillStyle = '#1a1a1a';
      krr(ctx, x-4, y, w+8, height, 6); ctx.fill();

      // ── WORKFLOWS ────────────────────────────────────────────────────
      if (SHOW_WORKFLOWS) {
      cy = kSecHeader(ctx, 'WORKFLOWS', x, cy, w);
      const wfBtnGap = 6;
      const wfBtnW = Math.floor((w - wfBtnGap) / 2);
      const wfBtnY = cy;
      kDrawBtn(ctx, '💾  Save Workflow…', x, cy, wfBtnW,
               KPM.tealDark, KPM.white, KPM.tealDark);
      reg('btn_saveWorkflow', wfBtnY, KPM.BTN_H, x, wfBtnW);
      kDrawBtn(ctx, '📂  Open Workflow…', x + wfBtnW + wfBtnGap, cy, wfBtnW,
               KPM.tealDark, KPM.white, KPM.tealDark);
      reg('btn_openWorkflow', wfBtnY, KPM.BTN_H, x + wfBtnW + wfBtnGap, wfBtnW);
      cy += KPM.BTN_H + KPM.ITEM_GAP;
      cy += KPM.SEC_GAP;
      }

      // ── SELECT PROJECT ───────────────────────────────────────────────
      cy = kSecHeader(ctx, 'SELECT PROJECT', x, cy, w);
      const refreshW = 100;
      const refreshY = cy;
      kDrawBtn(ctx, '↻ Refresh', x, cy, refreshW, KPM.tealDark, KPM.white, KPM.tealDark);
      reg('btn_refresh', refreshY, KPM.BTN_H, x, refreshW);

      const dropX = x + refreshW + 6;
      const dropW = w - refreshW - 6;
      const dropY = cy + (KPM.BTN_H - KPM.ROW_H) / 2;
      kDrawRow(ctx, '', getW('project'), '— select project —',
               dropX, dropY, dropW);
      reg('drop_project', dropY, KPM.ROW_H, dropX, dropW);
      cy += KPM.BTN_H + KPM.ITEM_GAP;
      cy += KPM.SEC_GAP;

      // ── CREATE PROJECT ───────────────────────────────────────────────
      cy = kSecHeader(ctx, 'CREATE PROJECT', x, cy, w);
      const npRowY = cy;
      kDrawTextInput(ctx, 'Project Name', ui.newProjectName,
                     'click to enter…', x, cy, w);
      reg('input_newProject', npRowY, KPM.ROW_H, x, w);
      cy += KPM.ROW_H + KPM.ITEM_GAP;

      const npBtnY = cy;
      kDrawBtn(ctx, 'Create Project', x, cy, w,
               KPM.greenDark, KPM.white, KPM.green);
      reg('btn_createProject', npBtnY, KPM.BTN_H, x, w);
      cy += KPM.BTN_H + KPM.ITEM_GAP;
      cy += KPM.SEC_GAP;

      // ── RETRIEVE SETTINGS (v1.7.33) ──────────────────────────────────
      cy = kSecHeader(ctx, 'RETRIEVE SETTINGS', x, cy, w);
      const fetchY = cy;
      // v1.7.34: two buttons side by side, both ComfyUI pale blue.
      const fbW = (w - 6) / 2;
      kDrawBtn(ctx, 'Fetch Data From Video', x, cy, fbW, '#3f5159', KPM.white, '#2a363b');
      kDrawBtn(ctx, 'Open Workflow From File', x + fbW + 6, cy, fbW, '#3f5159', KPM.white, '#2a363b');
      reg('btn_fetchSettings', fetchY, KPM.BTN_H, x, fbW);
      reg('btn_openWfVideo', fetchY, KPM.BTN_H, x + fbW + 6, fbW);
      cy += KPM.BTN_H + KPM.ITEM_GAP;
      cy += KPM.SEC_GAP;

      // ── SUBJECT (TEAL PANEL) ─────────────────────────────────────────
      cy = kAccentHeader(ctx, 'SELECT / CREATE SUBJECT', x, cy, w);
      const subjPanelTop = cy;
      const subjPanelHeight =
        KPM.PANEL_PAD +
        KPM.ROW_H + KPM.ITEM_GAP +
        KPM.ROW_H + KPM.ITEM_GAP +
        KPM.BTN_H + KPM.ITEM_GAP +
        KPM.PANEL_PAD;
      ctx.fillStyle = KPM.bgPanel;
      krr(ctx, x, subjPanelTop, w, subjPanelHeight, 4); ctx.fill();
      ctx.strokeStyle = KPM.tealDark;
      ctx.lineWidth = 2;
      krr(ctx, x, subjPanelTop, w, subjPanelHeight, 4); ctx.stroke();

      const innerX = x + KPM.PANEL_PAD;
      const innerW = w - KPM.PANEL_PAD * 2;
      cy = subjPanelTop + KPM.PANEL_PAD;

      const sRowY = cy;
      kDrawRow(ctx, 'Subject', getW('subject'), '— select subject —',
               innerX, cy, innerW);
      reg('drop_subject', sRowY, KPM.ROW_H, innerX, innerW);
      cy += KPM.ROW_H + KPM.ITEM_GAP;

      const nsRowY = cy;
      kDrawTextInput(ctx, 'New Subject', ui.newSubjectName,
                     'click to enter…', innerX, cy, innerW);
      reg('input_newSubject', nsRowY, KPM.ROW_H, innerX, innerW);
      cy += KPM.ROW_H + KPM.ITEM_GAP;

      const nsBtnY = cy;
      // v1.7.11: gold fill matches Create PM's Create Subject button.
      kDrawBtn(ctx, 'Create Subject', innerX, cy, innerW,
               KPM.gold, KPM.white, KPM.goldLight);
      reg('btn_createSubject', nsBtnY, KPM.BTN_H, innerX, innerW);
      cy += KPM.BTN_H + KPM.ITEM_GAP;
      cy = subjPanelTop + subjPanelHeight + KPM.SEC_GAP;

      // ── ACCENT (TEAL PANEL) ──────────────────────────────────────────
      cy = kAccentHeader(ctx, 'ACCENT', x, cy, w);
      const accPanelTop = cy;
      const accPanelHeight =
        KPM.PANEL_PAD +
        KPM.ROW_H + KPM.ITEM_GAP +
        KPM.PANEL_PAD;
      ctx.fillStyle = KPM.bgPanel;
      krr(ctx, x, accPanelTop, w, accPanelHeight, 4); ctx.fill();
      ctx.strokeStyle = KPM.tealDark;
      ctx.lineWidth = 2;
      krr(ctx, x, accPanelTop, w, accPanelHeight, 4); ctx.stroke();

      cy = accPanelTop + KPM.PANEL_PAD;

      const aRowY = cy;
      kDrawRow(ctx, 'Accent', getW('accent'), '— select accent —',
               innerX, cy, innerW);
      reg('drop_accent', aRowY, KPM.ROW_H, innerX, innerW);
      cy += KPM.ROW_H + KPM.ITEM_GAP;
      cy = accPanelTop + accPanelHeight + KPM.SEC_GAP;

      // ── RENDER STYLE (v1.7.35) ───────────────────────────────────────
      cy = kAccentHeader(ctx, 'RENDER STYLE', x, cy, w);
      const stPanelTop = cy;
      const stPanelHeight = KPM.PANEL_PAD + KPM.BTN_H + KPM.ITEM_GAP + KPM.PANEL_PAD;
      ctx.fillStyle = KPM.bgPanel;
      krr(ctx, x, stPanelTop, w, stPanelHeight, 4); ctx.fill();
      ctx.strokeStyle = KPM.tealDark;
      ctx.lineWidth = 2;
      krr(ctx, x, stPanelTop, w, stPanelHeight, 4); ctx.stroke();
      cy = stPanelTop + KPM.PANEL_PAD;
      const stY = cy;
      const stl = kStyleLabel(getW('render_style'), ui.styles || [], !!ui.stylesLoaded);
      s5090ButtonFace(ctx, krr, innerX, cy, innerW, KPM.BTN_H, 5, '#553333');
      ctx.fillStyle = stl.ok ? '#ffffff' : '#fca5a5';
      ctx.font = 'bold 12px Arial';
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'center';
      ctx.fillText(stl.label.length > 46 ? stl.label.slice(0, 45) + '…' : stl.label, innerX + innerW / 2, cy + KPM.BTN_H / 2);
      ctx.textAlign = 'right';
      ctx.fillText('▾', innerX + innerW - 10, cy + KPM.BTN_H / 2);
      reg('drop_renderStyle', stY, KPM.BTN_H, innerX, innerW);
      cy = stPanelTop + stPanelHeight + KPM.SEC_GAP;

      // ── Status line ──────────────────────────────────────────────────
      if (ui.status) {
        ctx.font = 'italic 11px Arial';
        ctx.fillStyle = ui.statusOk ? '#16a34a' : '#dc2626';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(ui.status, x, cy + KPM.ROW_H/2);
      }
    },

    mouse(event, pos, node) {
      if (event.type !== 'pointerdown') return false;
      const rx = pos[0], ry = pos[1];
      for (const reg of regions) {
        if (ry < reg.y || ry > reg.y + reg.h) continue;
        if (rx < reg.x || rx > reg.x + reg.w) continue;

        switch (reg.id) {
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
                if (val !== getW('project')) clearCastingSettings();
                setW('project', val);
                await loadSubjects();
                redraw();
              }, event);
            }
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

          case 'btn_openWfVideo':
            (async () => {
              const res = await s5090OpenWorkflowFromVideo();
              if (res) { setStatus(res.msg, res.ok); redraw(); }
            })();
            return true;

          case 'btn_fetchSettings':
            // v1.7.33: Windows file dialog, then show the stored settings.
            (async () => {
              const picked = await kPickSettingsFile();
              if (!picked) return;
              if (picked.error) {
                setW('render_settings', '');
                kPushSettingsToDisplays(node, picked.error + (picked.detail ? '\n\n' + picked.detail : ''));
                setStatus(picked.error, false);
              } else {
                const text = 'Video: ' + picked.file + '\n' + picked.text.replace(/^Video: [^\n]*\n/, '');
                setW('render_settings', text);
                const shown = kPushSettingsToDisplays(node, text);
                if (shown) setStatus('Settings displayed from ' + picked.file, true);
                else setStatus('Wire render_settings to a Preview as Text node', false);
              }
              redraw();
            })();
            return true;

          case 'drop_subject':
            if (!ui.subjects.length) {
              setStatus('No subjects — create one below ↓', false); redraw();
            } else {
              showMenu(ui.subjects, val => {
                setW('subject', val);
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

          case 'drop_renderStyle':
            if (!ui.styles?.length) {
              setStatus('No styles found in render_styles.txt', false); redraw();
            } else {
              showMenu(ui.styles, name => {
                setW('render_style', name);
                // v1.7.39: tell ComfyUI the workflow changed, so switching tabs keeps it.
                try { app.graph?.change?.(); } catch (e) {}
                try { app.extensionManager?.workflow?.activeWorkflow?.changeTracker?.checkState?.(); } catch (e) {}
                redraw();
              }, event);
            }
            return true;

          case 'drop_accent':
            if (!ui.accents.length) {
              setStatus('No accents loaded — check templates/accents.txt', false);
              redraw();
            } else {
              showCastingAccentPicker(ui.accents, getW('accent'), name => {
                setW('accent', name);
                redraw();
              });
            }
            return true;
        }
      }
      return false;
    },
  };

  node.addCustomWidget(widget);

  // Wire native widget callbacks so workflow load / paste / undo triggers redraw.
  hookCallback('project', async () => {
    await loadSubjects();
    redraw();
  });
  hookCallback('subject', () => redraw());
  hookCallback('accent',  () => redraw());
  hookCallback('render_style', () => redraw());

  function hookCallback(name, after) {
    const w = nativeWidgets[name];
    if (!w) return;
    const orig = w.callback;
    w.callback = (val) => {
      if (orig) { try { orig.call(w, val); } catch (e) {} }
      try { after(val); } catch (e) {}
    };
  }

  node.setSize([KPM.NODE_W, node.computeSize()[1]]);
  node.resizable = false;

  initialPopulate();
}

app.registerExtension({
  name: 'Studio5090.CastingProjectManager',
  async beforeRegisterNodeDef(nodeType, nodeData, app) {
    if (nodeData.name !== 'Studio5090CastingProjectManager') return;
    K_OUTPUT_NAMES = nodeData.output_name || [];
    K_OUTPUT_TYPES = nodeData.output || [];
    const orig = nodeType.prototype.onNodeCreated;
    nodeType.prototype.onNodeCreated = function () {
      const r = orig?.apply(this, arguments);
      buildCastingPMWidget(this);
      return r;
    };
  },
  // v1.7.37: fix wires in workflows saved before the output change.
  beforeConfigureGraph(graphData) {
    kRemapSavedWorkflow(graphData);
  },
  // v1.7.33: when a workflow is opened nothing has been fetched yet.
  afterConfigureGraph() {
    try {
      for (const n of (app.graph?._nodes || [])) {
        if (n.comfyClass !== 'Studio5090CastingProjectManager' && n.type !== 'Studio5090CastingProjectManager') continue;
        const w = n.widgets?.find(w => w.name === 'render_settings');
        if (w) w.value = '';
        kPushSettingsToDisplays(n, '');
      }
    } catch (e) { console.warn('[Studio5090] could not reset casting settings', e); }
  },
});
