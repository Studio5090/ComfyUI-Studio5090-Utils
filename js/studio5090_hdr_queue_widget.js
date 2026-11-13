/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Alan Rosenfeld
 * Studio5090 — see LICENSE at the repository root for full terms.
 * Provided "AS IS", without warranty of any kind.
 */

/**
 * Studio5090 HDR Render Queue — Canvas UI v1.7.0
 * Designed by Alan Rosenfeld + Claude (Anthropic), 2026.
 *
 * v1.5.3: Pause and Cancel buttons now produce persistent, explanatory
 * status messages and trigger cleanup at the natural moment (when the
 * current job actually finishes) rather than deferring it to the next
 * Run Queue press. Separated `ui.windingDown` from `ui.running` so the
 * inner poll loop continues after a Pause/Cancel — letting the job
 * complete naturally and its cleanup run — then the outer loop exits.
 *
 * v1.5.2: Clear Queue button (secondary grey, sits at the end of the QUEUE
 * section when there's pending or completed content). Dynamic node-height
 * tracking so the widget grows/shrinks cleanly with the queue's contents.
 *
 * v1.5.1: server-side staging of the source video into ComfyUI input/ so
 * core LoadVideo's validation passes — no widget changes here, but version
 * matches the package release.
 *
 * Lives on the LTX workflow tab. Queues multiple HDR renders against ONE
 * project's VIDEOS/ folder. Persists across ComfyUI restarts via global
 * state file STUDIO5090/.queue_state.json. Per-job ProRes/EXR toggles.
 *
 * Layout (top to bottom):
 *
 *   SELECT PROJECT
 *        [⟳ Refresh]  [project dropdown]
 *
 *   ADD JOB                                    ← teal accent panel
 *        Source Video:     [picker]
 *        Scene Name:       [text — defaults to source stem]
 *        Output Format:    [☑ ProRes]   [☐ EXR]
 *        [+ Add to Queue]
 *
 *   QUEUE  (N pending)
 *        [job row 1]   [✕]
 *        [job row 2]   [✕]
 *        ...
 *
 *   PROGRESS
 *        ▶ Run Queue   ⏸ Pause   ⏹ Cancel
 *        [N/M  progress bar  ETA]
 *
 *   status bar
 *
 * Architecture: this is a "thin orchestrator" — it shells API calls to
 * /studio5090/hdr_queue/* routes. The widget keeps minimal local state
 * (current ui selections); the source of truth is the server-side queue
 * state file, polled on a 1-second interval while running.
 */

const { app } = window.comfyAPI.app;

const HQ = {
  teal:        '#2dd4bf',
  tealDark:    '#0d9488',
  tealDim:     '#1a3535',
  tealPanel:   '#0f2a28',
  green:       '#22c55e',
  greenDark:   '#15803d',
  orange:      '#fb923c',
  orangeDim:   '#2a1500',
  red:         '#ef4444',
  redDark:     '#7f1d1d',
  white:       '#ffffff',
  dimGrey:     '#888888',
  bgSection:   '#1a1a1a',
  bgRow:       '#2a2a2a',
  border:      '#555555',
  NODE_W:      460,
  PAD:         14,
  ROW_H:       30,
  BTN_H:       34,
  SEC_GAP:     16,
  ITEM_GAP:    8,
  LABEL_H:     22,
  PANEL_PAD:   18,
  JOB_ROW_H:   28,
  MAX_VISIBLE_JOBS: 6,
};

const api = {
  async get(path) {
    const r = await fetch(path);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
  },
  async post(path, body) {
    const r = await fetch(path, {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify(body || {}),
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
  },
};

function enc(s) { return encodeURIComponent(s || ''); }

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
  rr(ctx, x, y, w, HQ.LABEL_H, 4); ctx.fill();
  ctx.strokeStyle = '#333333'; ctx.lineWidth = 1; ctx.stroke();
  ctx.fillStyle = HQ.white;
  ctx.font = 'bold 11px "Courier New", monospace';
  ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  ctx.fillText(label, x+8, y+HQ.LABEL_H/2);
  return y + HQ.LABEL_H + HQ.ITEM_GAP;
}

function accentHeader(ctx, label, x, y, w) {
  ctx.fillStyle = HQ.tealDark;
  rr(ctx, x, y, w, HQ.LABEL_H, 4); ctx.fill();
  ctx.fillStyle = HQ.white;
  ctx.font = 'bold 11px "Courier New", monospace';
  ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  ctx.fillText(label, x+8, y+HQ.LABEL_H/2);
  return y + HQ.LABEL_H + HQ.ITEM_GAP;
}

function drawRow(ctx, label, value, placeholder, x, y, w) {
  ctx.fillStyle = HQ.white;
  ctx.font = '11px sans-serif';
  ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  ctx.fillText(label, x, y+HQ.ROW_H/2);
  const dx = x+95, dw = w-95;
  ctx.fillStyle = '#353535'; ctx.strokeStyle = '#555555'; ctx.lineWidth = 1;
  rr(ctx, dx, y, dw, HQ.ROW_H, 4); ctx.fill(); ctx.stroke();
  const has = value && value.trim() !== '';
  const maxCh = Math.floor((dw - 16) / 6.5);
  const display = has ? value : (placeholder||'—');
  ctx.fillStyle = has ? HQ.white : HQ.dimGrey;
  ctx.font = '11px sans-serif'; ctx.textAlign = 'left';
  ctx.save();
  ctx.beginPath();
  ctx.rect(dx+4, y+1, dw-8, HQ.ROW_H-2);
  ctx.clip();
  ctx.fillText(display.length>maxCh ? display.slice(0,maxCh-1)+'…' : display,
               dx+8, y+HQ.ROW_H/2);
  ctx.restore();
  ctx.fillStyle = HQ.dimGrey; ctx.textAlign = 'right';
  ctx.fillText('▾', dx+dw-6, y+HQ.ROW_H/2);
  return y + HQ.ROW_H + HQ.ITEM_GAP;
}

function drawTextInput(ctx, label, value, placeholder, x, y, w) {
  ctx.fillStyle = HQ.white;
  ctx.font = '11px sans-serif';
  ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  ctx.fillText(label, x, y+HQ.ROW_H/2);
  const ix = x+95, iw = w-95;
  ctx.fillStyle = '#353535'; ctx.strokeStyle = '#555555'; ctx.lineWidth = 1;
  rr(ctx, ix, y, iw, HQ.ROW_H, 4); ctx.fill(); ctx.stroke();
  const has = value && value.trim() !== '';
  ctx.save();
  ctx.beginPath();
  ctx.rect(ix + 4, y + 1, iw - 8, HQ.ROW_H - 2);
  ctx.clip();
  ctx.fillStyle = has ? HQ.white : HQ.dimGrey; ctx.textAlign = 'left';
  ctx.font = '11px sans-serif';
  ctx.fillText(has ? value : placeholder, ix+8, y+HQ.ROW_H/2);
  ctx.restore();
  return y + HQ.ROW_H + HQ.ITEM_GAP;
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

function drawBtn(ctx, label, x, y, w, bg, fg, border) {
  s5090ButtonFace(ctx, rr, x, y, w, HQ.BTN_H, 4, bg);
  ctx.fillStyle = fg;
  ctx.font = 'bold 12px sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(label, x+w/2, y+HQ.BTN_H/2);
  return y + HQ.BTN_H + HQ.ITEM_GAP;
}

function drawCheckbox(ctx, label, value, x, y, w) {
  // box + label, drawn inline so they fit on one row
  const boxSize = 16;
  const by = y + (HQ.ROW_H - boxSize) / 2;
  ctx.fillStyle = value ? HQ.tealDark : '#353535';
  ctx.strokeStyle = HQ.border; ctx.lineWidth = 1;
  rr(ctx, x, by, boxSize, boxSize, 3); ctx.fill(); ctx.stroke();
  if (value) {
    ctx.strokeStyle = HQ.white; ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x+3, by+8); ctx.lineTo(x+7, by+12); ctx.lineTo(x+13, by+4);
    ctx.stroke();
  }
  ctx.fillStyle = HQ.white;
  ctx.font = '11px sans-serif';
  ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  ctx.fillText(label, x + boxSize + 6, y + HQ.ROW_H/2);
}

// ── Dropdown picker (DOM <select>) ──────────────────────────────────────────
function showMenu(items, onSelect, event) {
  const existing = document.getElementById('s5090-hq-menu');
  if (existing) existing.remove();
  const sel = document.createElement('select');
  sel.id = 's5090-hq-menu';
  Object.assign(sel.style, {
    position: 'fixed', zIndex: '99999',
    left: (event.clientX || 100) + 'px',
    top:  (event.clientY || 100) + 'px',
    minWidth: '240px', maxWidth: '460px',
    background: '#2a2a2a', color: '#fff', border: '1px solid #555',
    font: '12px sans-serif', padding: '4px',
  });
  sel.size = Math.max(4, Math.min(items.length || 1, 12));
  if (!items.length) {
    const opt = document.createElement('option');
    opt.text = '(no items)'; opt.disabled = true; sel.add(opt);
  } else {
    for (const it of items) {
      const opt = document.createElement('option');
      opt.value = it; opt.text = it; sel.add(opt);
    }
  }
  document.body.appendChild(sel);
  sel.focus();
  const cleanup = () => sel.remove();
  sel.addEventListener('change', () => {
    if (sel.value) { try { onSelect(sel.value); } catch(e) {} }
    cleanup();
  });
  sel.addEventListener('blur', () => setTimeout(cleanup, 100));
  sel.addEventListener('keydown', (e) => { if (e.key === 'Escape') cleanup(); });
}

// v1.6.1: Custom text-input modal. Replaces window.prompt() for the
// ComfyUI native desktop (Electron) app. Returns Promise<string|null>.
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

// ── Main factory ────────────────────────────────────────────────────────────
function buildHDRQueueWidget(node) {

  const NATIVE = ['project'];
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
    projects: [],
    videos: [],
    sceneName: '',
    saveProres: true,
    saveExr: false,
    state: { pending: [], running: null, completed: [] },
    status: '',
    statusOk: true,
    running: false,        // local "is queue currently being processed" flag
    windingDown: false,    // v1.5.3: user pressed Pause/Cancel during a job;
                           // finish the polling so cleanup runs, then exit.
    pollHandle: null,
  };

  let regions = [];

  const setStatus = (msg, ok=true) => {
    ui.status = msg; ui.statusOk = ok;
  };

  // v1.5.2: also resize the node when queue content changes — the
  // computeSize function is dynamic (varies with pending/completed
  // counts), so we have to call setSize explicitly to grow/shrink the
  // outer node frame to match. The try/catch handles the unlikely case
  // where redraw fires during initial widget construction (before the
  // `widget` const exists in this closure's scope).
  const redraw = () => {
    try {
      node.setSize([HQ.NODE_W, widget.computeSize(HQ.NODE_W)[1]]);
    } catch (e) {
      // widget not yet defined or setSize failed — fall through to
      // dirty-canvas which still paints whatever's available.
    }
    node.setDirtyCanvas(true, true);
  };

  // ── API helpers ─────────────────────────────────────────────────────────
  async function loadProjects() {
    try {
      const r = await api.get('/studio5090/projects');
      ui.projects = r.projects || [];
    } catch (e) {
      setStatus('Project load failed: ' + e.message, false);
    }
  }
  async function loadVideos() {
    const proj = getW('project');
    if (!proj) { ui.videos = []; return; }
    try {
      const r = await api.get('/studio5090/hdr_queue/videos?project=' + enc(proj));
      ui.videos = r.videos || [];
    } catch (e) {
      ui.videos = [];
      setStatus('Video list failed: ' + e.message, false);
    }
  }
  async function loadState() {
    try {
      ui.state = await api.get('/studio5090/hdr_queue/state');
    } catch (e) {
      // Quiet failure — state may not yet exist
    }
  }
  async function addJobToQueue() {
    const proj = getW('project');
    if (!proj) { setStatus('Pick a project first', false); redraw(); return; }
    if (!ui.selectedVideo) { setStatus('Pick a source video first', false); redraw(); return; }
    const scene = (ui.sceneName || '').trim() ||
                  ui.selectedVideo.replace(/\.[^.]+$/, '');
    try {
      const r = await api.post('/studio5090/hdr_queue/add', {
        jobs: [{
          project: proj,
          source_video: ui.selectedVideo,
          scene_name: scene,
          save_exr: ui.saveExr,
          save_prores: ui.saveProres,
        }]
      });
      if (r.success) {
        setStatus(`Queued: ${scene} (${r.pending_total} pending)`, true);
        ui.selectedVideo = '';
        ui.sceneName = '';
        await loadState();
      } else {
        setStatus('Add failed: ' + (r.error || 'unknown'), false);
      }
    } catch (e) {
      setStatus('Add request failed: ' + e.message, false);
    }
    redraw();
  }
  async function removeJob(id) {
    try {
      await api.post('/studio5090/hdr_queue/remove', { id });
      await loadState();
      redraw();
    } catch (e) {
      setStatus('Remove failed: ' + e.message, false);
      redraw();
    }
  }
  async function clearCompleted() {
    try {
      await api.post('/studio5090/hdr_queue/clear_completed');
      await loadState();
      redraw();
    } catch (e) {
      setStatus('Clear failed: ' + e.message, false);
      redraw();
    }
  }

  async function clearAll() {
    // v1.5.2: nuke pending + completed lists. Preserves the running job
    // (use Cancel button for that). Confirmation prompt for the user
    // since this destroys queued work, not just history.
    const pendingN = ui.state.pending?.length || 0;
    const completedN = ui.state.completed?.length || 0;
    if (pendingN === 0 && completedN === 0) {
      setStatus('Nothing to clear', true);
      redraw();
      return;
    }
    const what = [];
    if (pendingN)   what.push(`${pendingN} pending`);
    if (completedN) what.push(`${completedN} completed`);
    const ok = await showConfirm(
      `Clear queue?\n\nThis removes ${what.join(' and ')} job(s) from the queue.` +
      (ui.state.running ? '\n\nThe currently running job will NOT be touched.' : '')
    );
    if (!ok) return;
    try {
      const r = await api.post('/studio5090/hdr_queue/clear_all');
      await loadState();
      setStatus(`Cleared ${r.pending_cleared} pending + ${r.completed_cleared} completed`, true);
      redraw();
    } catch (e) {
      setStatus('Clear failed: ' + e.message, false);
      redraw();
    }
  }

  // ── Queue execution loop ────────────────────────────────────────────────
  // The widget polls ComfyUI's /history for the running job's prompt_id.
  // When it appears as completed there, we notify the server and pull next.

  async function checkPromptDone(promptId) {
    try {
      const r = await fetch('/history/' + promptId);
      if (!r.ok) return null;
      const data = await r.json();
      // /history returns {prompt_id: {...}} when complete, {} while running
      const entry = data[promptId];
      if (!entry) return null;
      // status.completed is true when finished (success); status.status_str
      // may be "success" or "error"
      const status = entry.status;
      if (!status) return null;
      if (status.completed === true || status.status_str) {
        return status.status_str === 'error' ? 'error' : 'ok';
      }
      return null;
    } catch (e) {
      return null;
    }
  }

  async function runQueueLoop() {
    if (ui.running) return;          // guard against double-start
    ui.running = true;
    ui.windingDown = false;
    setStatus('Running queue…', true);
    redraw();

    try {
      while (true) {
        // Refresh state — user may have added/removed mid-run
        await loadState();
        if (!ui.state.pending.length && !ui.state.running) {
          setStatus('Queue complete', true);
          break;
        }

        // If no current running job, pull the next one — BUT only if we're
        // not winding down. windingDown means user pressed Pause/Cancel
        // during the previous job, so we exit cleanly here.
        if (!ui.state.running) {
          if (ui.windingDown) break;
          let resp;
          try {
            resp = await api.post('/studio5090/hdr_queue/run_next');
          } catch (e) {
            setStatus('Submit failed: ' + e.message, false);
            break;
          }
          if (!resp.success) {
            setStatus('Submit refused: ' + (resp.error || ''), false);
            break;
          }
          await loadState();
        }

        // Poll the running job's prompt_id until ComfyUI says it's done.
        // v1.5.3: the inner loop no longer terminates on ui.running=false.
        // We keep polling until the job ACTUALLY finishes, so job_complete
        // (which runs the VHS audio-twin + PNG cleanup) gets called even
        // when the user has paused/cancelled. Without this, cleanup is
        // deferred until the user presses Run Queue again — wrong.
        const running = ui.state.running;
        if (!running || !running.prompt_id) {
          setStatus('No prompt_id from submit — stopping', false);
          break;
        }
        const sceneLabel = running.scene_name;
        let result = null;
        let pollCount = 0;
        while (result === null) {
          await new Promise(r => setTimeout(r, 1500));
          pollCount++;
          // v1.5.3: don't overwrite the pause/cancel status messages.
          // If the user pressed Pause or Cancel, their explanatory message
          // stays on screen until the current job finishes; the "Running:
          // poll N" cycling is suppressed.
          if (!ui.windingDown) {
            setStatus(`Running: ${sceneLabel} (poll ${pollCount})`, true);
          }
          redraw();
          result = await checkPromptDone(running.prompt_id);
        }

        // Job done. Always notify server (this runs the VHS + PNG cleanup
        // and clears the running slot in the queue state file).
        await api.post('/studio5090/hdr_queue/job_complete', {
          status: result || 'ok',
        });
        await loadState();
        redraw();

        // v1.5.3: post-cleanup wind-down check. If the user pressed
        // Pause/Cancel during the job we just finished, the cleanup has now
        // completed and we exit cleanly with a status that explains the state.
        if (ui.windingDown) {
          // Whatever pause/cancel set the status to — keep that visible.
          // Don't overwrite with a generic "queue stopped" — the messages
          // those functions wrote are more specific.
          break;
        }
      }
    } finally {
      ui.running = false;
      ui.windingDown = false;
      redraw();
    }
  }

  function pauseQueue() {
    // v1.5.3: soft pause. Sets windingDown so the loop finishes the current
    // job's polling (which lets cleanup run) and then exits without pulling
    // the next pending job. Pending queue stays intact for later resume.
    if (!ui.running) {
      // Loop isn't running — nothing to pause.
      setStatus('Queue is not running', false);
      redraw();
      return;
    }
    ui.windingDown = true;
    setStatus(
      'HDR paused as soon as the current job finishes. ' +
      'Press Run Queue to begin again.',
      true);
    redraw();
  }

  async function cancelRunning() {
    // v1.5.3: cancel splits into two cases based on whether the queue loop
    // is actively running:
    //
    // (a) Loop running → soft cancel. Same as pause but with messaging that
    //     signals end-of-batch intent rather than temporary pause. We keep
    //     pending intact (user can Clear Queue separately if they want).
    //     The current job finishes naturally; cleanup runs.
    //
    // (b) Loop NOT running but server has a stale running marker (e.g.
    //     ComfyUI was restarted mid-job and we still have a recorded running
    //     entry) → stale-state recovery. Push the recorded job back to
    //     pending head so the user can resume.
    if (ui.running) {
      ui.windingDown = true;
      setStatus(
        'HDR queue process will cancel after the current job finishes. ' +
        'To kill a job, use the ComfyUI active queue to kill the process.',
        true);
      redraw();
      return;
    }
    // Stale-state recovery path
    try {
      await api.post('/studio5090/hdr_queue/recover_running', { force: true });
      await loadState();
      setStatus('Stuck running job moved back to pending head', true);
    } catch (e) {
      setStatus('Cancel failed: ' + e.message, false);
    }
    redraw();
  }

  // ── Initial populate + recovery probe ──────────────────────────────────
  async function initialPopulate() {
    await loadProjects();
    await loadState();
    // If there's a stale 'running' job from before ComfyUI restarted,
    // recover_running with force=false returns needs_confirm so user can decide.
    if (ui.state.running) {
      const r = await api.post('/studio5090/hdr_queue/recover_running',
                               { force: false });
      if (r.needs_confirm) {
        setStatus(`Stale running job: ${r.running?.scene_name || ''} — click ⟳ to recover`,
                  false);
      }
    }
    redraw();
  }

  async function refresh() {
    await loadProjects();
    if (getW('project')) await loadVideos();
    await loadState();
    // If we detect a stuck running job, offer recovery via state action
    if (ui.state.running && !ui.running) {
      try {
        const r = await api.post('/studio5090/hdr_queue/recover_running',
                                 { force: true });
        if (r.recovered) setStatus('Recovered stuck running job to pending', true);
      } catch (e) {}
      await loadState();
    }
    redraw();
  }

  // ── Heights ─────────────────────────────────────────────────────────────
  const HEIGHTS = () => {
    const pendingRows = Math.min(ui.state.pending.length,
                                 HQ.MAX_VISIBLE_JOBS);
    // v1.5.2: when pending or completed has any content, the Clear Queue
    // button appears at the end of the QUEUE section. 24px button + 4px
    // bottom gap = 28px of extra footprint.
    const hasClearable = (ui.state.pending.length > 0) ||
                         (ui.state.completed.length > 0);
    const clearBtnArea = hasClearable ? 28 : 0;
    const queueArea = HQ.LABEL_H + HQ.ITEM_GAP +
                      Math.max(1, pendingRows) * (HQ.JOB_ROW_H + 4) +
                      clearBtnArea +
                      HQ.ITEM_GAP;
    const completedShow = ui.state.completed.length ? (HQ.LABEL_H + HQ.ITEM_GAP +
                          HQ.BTN_H + HQ.ITEM_GAP) : 0;
    return {
      selectProject: HQ.LABEL_H + HQ.ITEM_GAP + HQ.BTN_H + HQ.ITEM_GAP,
      addPanel:
        HQ.LABEL_H + HQ.ITEM_GAP +
        HQ.PANEL_PAD +
        (HQ.ROW_H + HQ.ITEM_GAP) +   // source video picker
        (HQ.ROW_H + HQ.ITEM_GAP) +   // scene name input
        (HQ.ROW_H + HQ.ITEM_GAP) +   // checkboxes row
        (HQ.BTN_H + HQ.ITEM_GAP) +   // add button
        HQ.PANEL_PAD,
      queue: queueArea,
      progress: HQ.LABEL_H + HQ.ITEM_GAP +
                HQ.BTN_H + HQ.ITEM_GAP +
                HQ.ROW_H + HQ.ITEM_GAP,
      completed: completedShow,
      status: HQ.ROW_H + HQ.ITEM_GAP,
    };
  };

  const widget = {
    name: 's5090_hdrqueue_widget',
    type: 'studio5090_hdrqueue',
    value: null,
    options: {},
    serialize: false,

    computeSize(nw) {
      const H = HEIGHTS();
      const total = HQ.SEC_GAP +
                    H.selectProject + HQ.SEC_GAP +
                    H.addPanel + HQ.SEC_GAP +
                    H.queue + HQ.SEC_GAP +
                    H.progress + HQ.SEC_GAP +
                    H.completed + (H.completed ? HQ.SEC_GAP : 0) +
                    H.status + HQ.PAD;
      return [nw, total];
    },

    draw(ctx, node, nw, y, height) {
      regions = [];
      const x = HQ.PAD, w = nw - HQ.PAD*2;
      let cy = y + HQ.SEC_GAP;
      const H = HEIGHTS();

      const reg = (id, ry, rh, rx, rw, payload) => regions.push({
        id, y: ry, h: rh,
        x: rx !== undefined ? rx : x,
        w: rw !== undefined ? rw : w,
        payload,
      });

      // Background card
      ctx.fillStyle = '#1a1a1a';
      rr(ctx, x-4, y, w+8, height, 6); ctx.fill();

      // ── ① SELECT PROJECT ───────────────────────────────────────────────
      cy = secHeader(ctx, 'SELECT PROJECT', x, cy, w);
      const refW = 84, pdW = w - refW - 8;
      ctx.fillStyle = HQ.tealDark; ctx.strokeStyle = HQ.tealDark; ctx.lineWidth = 1;
      rr(ctx, x, cy, refW, HQ.BTN_H, 4); ctx.fill(); ctx.stroke();
      ctx.fillStyle = HQ.white; ctx.font = 'bold 12px sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('⟳ Refresh', x + refW/2, cy + HQ.BTN_H/2);
      reg('btn_refresh', cy, HQ.BTN_H, x, refW);

      const pdX = x + refW + 8;
      const project = getW('project');
      ctx.fillStyle = '#353535'; ctx.strokeStyle = '#555555';
      rr(ctx, pdX, cy, pdW, HQ.BTN_H, 4); ctx.fill(); ctx.stroke();
      const pTxt = project || '— select project —';
      ctx.fillStyle = project ? HQ.white : HQ.dimGrey;
      ctx.font = '11px sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.fillText(pTxt.slice(0, Math.floor((pdW-24)/6.5)), pdX+6, cy + HQ.BTN_H/2);
      ctx.fillStyle = HQ.dimGrey; ctx.textAlign = 'right';
      ctx.fillText('▾', pdX+pdW-6, cy + HQ.BTN_H/2);
      reg('drop_project', cy, HQ.BTN_H, pdX, pdW);
      cy += HQ.BTN_H + HQ.ITEM_GAP;
      cy += HQ.SEC_GAP;

      // ── ② ADD JOB (framed) ─────────────────────────────────────────────
      const panelTop = cy;
      const panelBottom = cy + H.addPanel;
      const innerTop = panelTop + HQ.LABEL_H + HQ.ITEM_GAP;

      ctx.fillStyle = HQ.tealPanel;
      ctx.strokeStyle = HQ.tealDark;
      ctx.lineWidth = 1;
      rr(ctx, x, innerTop, w, panelBottom - innerTop, 4);
      ctx.fill(); ctx.stroke();

      cy = accentHeader(ctx, 'ADD JOB', x, cy, w);
      const innerX = x + HQ.PANEL_PAD;
      const innerW = w - HQ.PANEL_PAD * 2;
      cy += HQ.PANEL_PAD - HQ.ITEM_GAP;

      const srcY = cy;
      cy = drawRow(ctx, 'Source Video', ui.selectedVideo || '',
                   '— pick video —', innerX, cy, innerW);
      reg('drop_video', srcY, HQ.ROW_H, innerX, innerW);

      const snY = cy;
      cy = drawTextInput(ctx, 'Scene Name', ui.sceneName,
                         '(defaults to source filename)', innerX, cy, innerW);
      reg('input_scene', snY, HQ.ROW_H, innerX, innerW);

      // Checkbox row: ProRes | EXR side by side
      const cbY = cy;
      const halfW = (innerW - 8) / 2;
      drawCheckbox(ctx, 'ProRes (.mov)', ui.saveProres, innerX, cbY, halfW);
      drawCheckbox(ctx, 'EXR sequence',  ui.saveExr,    innerX + halfW + 8, cbY, halfW);
      reg('cb_prores', cbY, HQ.ROW_H, innerX,            halfW);
      reg('cb_exr',    cbY, HQ.ROW_H, innerX + halfW + 8, halfW);
      cy += HQ.ROW_H + HQ.ITEM_GAP;

      const addY = cy;
      cy = drawBtn(ctx, '+ Add to Queue', innerX, cy, innerW,
                   HQ.greenDark, HQ.white, HQ.green);
      reg('btn_add', addY, HQ.BTN_H, innerX, innerW);

      cy = panelBottom + HQ.SEC_GAP;

      // ── ③ QUEUE ────────────────────────────────────────────────────────
      const pending = ui.state.pending || [];
      cy = secHeader(ctx, `QUEUE  (${pending.length} pending)`, x, cy, w);
      if (!pending.length) {
        ctx.fillStyle = HQ.dimGrey;
        ctx.font = 'italic 11px sans-serif';
        ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
        ctx.fillText('No pending jobs — add one above ↑',
                     x + 4, cy + HQ.JOB_ROW_H/2);
        cy += HQ.JOB_ROW_H + 4;
      } else {
        const showN = Math.min(pending.length, HQ.MAX_VISIBLE_JOBS);
        for (let i = 0; i < showN; i++) {
          const job = pending[i];
          // Job row background
          ctx.fillStyle = '#252525'; ctx.strokeStyle = '#444444'; ctx.lineWidth = 1;
          rr(ctx, x, cy, w, HQ.JOB_ROW_H, 4); ctx.fill(); ctx.stroke();
          // Label: scene name + small project tag
          const flags = [];
          if (job.save_prores) flags.push('ProRes');
          if (job.save_exr)    flags.push('EXR');
          const label = `${i+1}.  ${job.scene_name}  · ${job.project}` +
                        (flags.length ? `  [${flags.join('+')}]` : '');
          ctx.fillStyle = HQ.white; ctx.font = '11px sans-serif';
          ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
          ctx.save();
          ctx.beginPath();
          ctx.rect(x+8, cy+1, w - 40, HQ.JOB_ROW_H - 2);
          ctx.clip();
          ctx.fillText(label, x + 8, cy + HQ.JOB_ROW_H/2);
          ctx.restore();
          // Remove button
          const xBtnX = x + w - 28, xBtnW = 22;
          ctx.fillStyle = HQ.redDark; ctx.strokeStyle = HQ.red;
          rr(ctx, xBtnX, cy+3, xBtnW, HQ.JOB_ROW_H-6, 3); ctx.fill(); ctx.stroke();
          ctx.fillStyle = HQ.white; ctx.font = 'bold 11px sans-serif';
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText('✕', xBtnX + xBtnW/2, cy + HQ.JOB_ROW_H/2);
          reg('btn_remove', cy+3, HQ.JOB_ROW_H-6, xBtnX, xBtnW, { id: job.id });
          cy += HQ.JOB_ROW_H + 4;
        }
        if (pending.length > showN) {
          ctx.fillStyle = HQ.dimGrey;
          ctx.font = 'italic 10px sans-serif';
          ctx.textAlign = 'left';
          ctx.fillText(`… and ${pending.length - showN} more`, x + 4,
                       cy + HQ.JOB_ROW_H/2);
          cy += HQ.JOB_ROW_H + 4;
        }
      }

      // v1.5.2: Clear Queue button — small, grey, shown whenever there's
      // any pending or completed content to clear. Manual escape hatch for
      // when auto-clear-on-empty isn't enough (e.g. user wants to abandon
      // a half-built queue without running it).
      const hasContent = (pending.length > 0) ||
                         ((ui.state.completed?.length || 0) > 0);
      if (hasContent) {
        const cqY = cy;
        const cqH = 24;          // smaller than full BTN_H — secondary action
        const cqW = 130;
        const cqX = x + w - cqW; // right-aligned, sits under the ✕ buttons
        ctx.fillStyle = '#252525'; ctx.strokeStyle = '#555555'; ctx.lineWidth = 1;
        rr(ctx, cqX, cqY, cqW, cqH, 4); ctx.fill(); ctx.stroke();
        ctx.fillStyle = HQ.dimGrey;
        ctx.font = '11px sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('Clear Queue', cqX + cqW/2, cqY + cqH/2);
        reg('btn_clear_all', cqY, cqH, cqX, cqW);
        cy += cqH + 4;
      }

      cy += HQ.ITEM_GAP;
      cy += HQ.SEC_GAP;

      // ── ④ PROGRESS / CONTROLS ──────────────────────────────────────────
      cy = secHeader(ctx, 'PROGRESS', x, cy, w);
      // Buttons: Run | Pause | Cancel
      const btnW = (w - 16) / 3;
      // v1.5.3: while winding down (pause/cancel already pressed but job
      // still polling), grey out Pause and Cancel so the user doesn't
      // re-click. Run stays disabled until the loop actually exits.
      const canRun    = !ui.running && pending.length > 0;
      const canPause  = ui.running && !ui.windingDown;
      const canCancel = (ui.running && !ui.windingDown) ||
                        (!ui.running && ui.state.running);

      const runBg  = canRun  ? HQ.greenDark : '#1a3a25';
      const runFg  = canRun  ? HQ.white     : HQ.dimGrey;
      const pauseBg = canPause ? HQ.orangeDim : '#1a1a1a';
      const pauseFg = canPause ? HQ.orange    : HQ.dimGrey;
      const cancBg = canCancel ? HQ.redDark   : '#1a1a1a';
      const cancFg = canCancel ? HQ.white     : HQ.dimGrey;

      const runY = cy;
      drawBtn(ctx, '▶ Run Queue', x,                    cy, btnW, runBg,  runFg,  HQ.green);
      drawBtn(ctx, '⏸ Pause',     x + btnW + 8,          cy, btnW, pauseBg, pauseFg, HQ.orange);
      drawBtn(ctx, '⏹ Cancel',    x + (btnW + 8)*2,      cy, btnW, cancBg, cancFg, HQ.red);
      reg('btn_run',    runY, HQ.BTN_H, x,             btnW);
      reg('btn_pause',  runY, HQ.BTN_H, x + btnW + 8,  btnW);
      reg('btn_cancel', runY, HQ.BTN_H, x + (btnW+8)*2, btnW);
      cy += HQ.BTN_H + HQ.ITEM_GAP;

      // Progress bar
      const completed = ui.state.completed?.length || 0;
      const totalJobs = completed + pending.length + (ui.state.running ? 1 : 0);
      const doneN = completed + (ui.state.running ? 0.5 : 0);
      const fraction = totalJobs > 0 ? doneN / totalJobs : 0;
      ctx.fillStyle = '#252525'; ctx.strokeStyle = '#444444';
      rr(ctx, x, cy, w, HQ.ROW_H, 4); ctx.fill(); ctx.stroke();
      if (fraction > 0) {
        ctx.fillStyle = HQ.teal;
        rr(ctx, x+2, cy+2, Math.max(2, (w-4) * fraction), HQ.ROW_H-4, 3);
        ctx.fill();
      }
      ctx.fillStyle = HQ.white; ctx.font = 'bold 11px "Courier New",monospace';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const progressLabel = ui.state.running
        ? `${completed} / ${totalJobs}   running: ${ui.state.running.scene_name}`
        : `${completed} / ${totalJobs}`;
      ctx.fillText(progressLabel, x + w/2, cy + HQ.ROW_H/2);
      cy += HQ.ROW_H + HQ.ITEM_GAP;
      cy += HQ.SEC_GAP;

      // ── ⑤ COMPLETED ────────────────────────────────────────────────────
      if (H.completed) {
        cy = secHeader(ctx,
          `COMPLETED  (${ui.state.completed.length})`,
          x, cy, w);
        const ccY = cy;
        cy = drawBtn(ctx, 'Clear Completed', x, cy, w, '#252525', HQ.dimGrey, '#555555');
        reg('btn_clear_completed', ccY, HQ.BTN_H, x, w);
        cy += HQ.SEC_GAP;
      }

      // ── Status bar ─────────────────────────────────────────────────────
      if (ui.status) {
        ctx.fillStyle = ui.statusOk ? HQ.white : HQ.orange;
        ctx.font = 'bold 12px "Courier New",monospace';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(ui.status, x+w/2, cy+HQ.ROW_H/2);
      }
    },

    mouse(event, pos, node) {
      if (event.type !== 'pointerdown') return false;
      const rx = pos[0], ry = pos[1];
      for (const r of regions) {
        if (ry < r.y || ry > r.y+r.h) continue;
        if (rx < r.x || rx > r.x+r.w) continue;
        switch (r.id) {
          case 'btn_refresh':
            refresh();
            return true;
          case 'drop_project':
            if (!ui.projects.length) {
              setStatus('No projects — create one on the Render PM', false);
              redraw();
            } else {
              showMenu(ui.projects, async val => {
                setW('project', val);
                ui.selectedVideo = '';
                ui.sceneName = '';
                await loadVideos();
                await loadState();
                redraw();
              }, event);
            }
            return true;
          case 'drop_video':
            if (!ui.videos.length) {
              setStatus(getW('project')
                ? 'No videos in this project — render some first'
                : 'Pick a project first',
                false);
              redraw();
            } else {
              showMenu(ui.videos, val => {
                ui.selectedVideo = val;
                if (!ui.sceneName) {
                  ui.sceneName = val.replace(/\.[^.]+$/, '');
                }
                redraw();
              }, event);
            }
            return true;
          case 'input_scene': {
            (async () => {
              const v = await showTextPrompt(
                'Scene name (output file stem):',
                ui.sceneName || ''
              );
              if (v !== null) { ui.sceneName = v.trim(); redraw(); }
            })();
            return true;
          }
          case 'cb_prores':
            ui.saveProres = !ui.saveProres;
            redraw();
            return true;
          case 'cb_exr':
            ui.saveExr = !ui.saveExr;
            redraw();
            return true;
          case 'btn_add':
            addJobToQueue();
            return true;
          case 'btn_remove':
            removeJob(r.payload?.id);
            return true;
          case 'btn_run':
            // v1.5.3: also guard against re-click while winding down — the
            // user-visible button is greyed in that state, but defensive.
            if (!ui.running && !ui.windingDown &&
                (ui.state.pending?.length || 0) > 0) {
              runQueueLoop();
            }
            return true;
          case 'btn_pause':
            // pauseQueue() has its own ui.running guard; call only when
            // actively running and not already winding down.
            if (ui.running && !ui.windingDown) pauseQueue();
            return true;
          case 'btn_cancel':
            // cancelRunning() branches internally: if loop running ->
            // soft cancel, else stale-state recovery. Skip if already
            // winding down (re-click while cleanup pending = no-op).
            if (!ui.windingDown && (ui.running || ui.state.running)) {
              cancelRunning();
            }
            return true;
          case 'btn_clear_completed':
            clearCompleted();
            return true;
          case 'btn_clear_all':
            clearAll();
            return true;
        }
      }
      return false;
    },
  };

  if (!node.widgets) node.widgets = [];
  node.widgets.push(widget);

  // Hook the project widget so changing it via the dropdown auto-reloads videos
  const projW = nativeWidgets['project'];
  if (projW) {
    const orig = projW.callback;
    projW.callback = async (val) => {
      if (orig) { try { orig.call(projW, val); } catch (e) {} }
      await loadVideos();
      redraw();
    };
  }

  node.setSize([HQ.NODE_W, node.computeSize()[1]]);
  node.resizable = false;

  initialPopulate();
}

app.registerExtension({
  name: 'Studio5090.HDRRenderQueue',
  nodeCreated(node) {
    if (node.comfyClass !== 'Studio5090HDRRenderQueue') return;
    buildHDRQueueWidget(node);
  },
});
