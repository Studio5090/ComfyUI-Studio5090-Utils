// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Alan Rosenfeld
// Studio5090 — see LICENSE at the repository root for full terms.
// Provided "AS IS", without warranty of any kind.
//
// v1.7.57: when the starter project folder ComfyUI/output/STUDIO5090/STUDIO5090/
// is missing, show a popup with the download link each time ComfyUI opens.
// Once the folder is there, nothing is shown.

const { app } = window.comfyAPI.app;

function s5090StarterPopup(info) {
  if (document.getElementById('s5090-starter')) return;
  const overlay = document.createElement('div');
  overlay.id = 's5090-starter-overlay';
  overlay.style.cssText = 'position:fixed; inset:0; background:rgba(0,0,0,0.6); z-index:99998;';
  const panel = document.createElement('div');
  panel.id = 's5090-starter';
  panel.style.cssText = 'position:fixed; top:50%; left:50%; transform:translate(-50%,-50%); ' +
    'width:min(520px, 92vw); background:#1a2626; border:2px solid #0d9488; border-radius:8px; ' +
    'z-index:99999; box-shadow:0 8px 32px rgba(0,0,0,0.8); display:flex; flex-direction:column; ' +
    'font-family:sans-serif;';
  const body = document.createElement('div');
  body.style.cssText = 'padding:20px 22px 16px; color:#e0f4f4; font-size:13px; line-height:1.55;';
  const h = document.createElement('div');
  h.textContent = 'Studio5090 starter project needed';
  h.style.cssText = 'color:#2dd4bf; font-size:15px; font-weight:bold; margin-bottom:10px;';
  const p1 = document.createElement('div');
  p1.textContent = 'Studio5090 needs its starter project before you open any Studio5090 workflow.';
  const p2 = document.createElement('div');
  p2.style.marginTop = '10px';
  p2.textContent = 'Download STUDIO5090_Starter_Project.zip, unzip it into your ComfyUI output folder, ' +
                   'then restart ComfyUI.  This folder must exist:';
  const path = document.createElement('div');
  path.textContent = info.path || 'ComfyUI/output/STUDIO5090/STUDIO5090';
  path.style.cssText = 'margin-top:6px; padding:6px 8px; background:#0f1515; border-radius:4px; ' +
    'font-family:"Courier New", monospace; font-size:12px; word-break:break-all;';
  body.append(h, p1, p2, path);
  const footer = document.createElement('div');
  footer.style.cssText = 'display:flex; justify-content:flex-end; gap:8px; padding:10px 16px; ' +
    'border-top:1px solid #0d9488; background:#111e1e; border-radius:0 0 6px 6px;';
  const later = document.createElement('button');
  later.textContent = 'Later';
  later.style.cssText = 'background:#2a2a2a; color:#ccc; border:1px solid #555; border-radius:4px; ' +
    'padding:6px 16px; font-size:12px; font-weight:bold; cursor:pointer;';
  const open = document.createElement('button');
  open.textContent = 'Open download page';
  open.style.cssText = 'background:#0d9488; color:#fff; border:none; border-radius:4px; ' +
    'padding:6px 18px; font-size:12px; font-weight:bold; cursor:pointer;';
  footer.append(later, open);
  panel.append(body, footer);
  const close = () => { panel.remove(); overlay.remove(); };
  later.onclick = close;
  overlay.onclick = close;
  open.onclick = () => { window.open(info.url, '_blank', 'noopener'); close(); };
  document.body.append(overlay, panel);
}

app.registerExtension({
  name: 'Studio5090.StarterCheck',
  async setup() {
    try {
      const api = window.comfyAPI?.api?.api;
      const r = api?.fetchApi ? await api.fetchApi('/studio5090/starter_status')
                              : await fetch('/studio5090/starter_status');
      const info = await r.json();
      if (info && info.present === false) s5090StarterPopup(info);
    } catch (e) {
      console.warn('[Studio5090] starter check', e);
    }
  },
});
