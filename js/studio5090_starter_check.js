// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Alan Rosenfeld
// Studio5090 — see LICENSE at the repository root for full terms.
// Provided "AS IS", without warranty of any kind.
//
// v1.7.57: when the starter project folder ComfyUI/output/STUDIO5090/STUDIO5090/
// is missing, show a popup with the download link each time ComfyUI opens.
// Once the folder is there, nothing is shown.
//
// v1.7.59: "Install starter project for me" downloads STUDIO5090.zip from the
// GitHub release and unpacks it into the output folder, with progress.  When
// it is done the popup says to restart ComfyUI and offers the video demos.

const { app } = window.comfyAPI.app;

const S5090_DEMOS_URL = 'https://vimeo.com/showcase/12492601';

function s5090Fetch(path, opts) {
  const api = window.comfyAPI?.api?.api;
  return api?.fetchApi ? api.fetchApi(path, opts) : fetch(path, opts);
}

function s5090MB(n) {
  return (n / (1024 * 1024)).toFixed(1);
}

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
  h.textContent = info.nested ? 'Studio5090 starter project is one folder too deep'
                              : 'Studio5090 starter project needed';
  h.style.cssText = 'color:#2dd4bf; font-size:15px; font-weight:bold; margin-bottom:10px;';
  const boxCss = 'margin-top:6px; padding:6px 8px; background:#0f1515; border-radius:4px; ' +
    'font-family:"Courier New", monospace; font-size:12px; word-break:break-all;';
  const para = (text, top) => {
    const d = document.createElement('div');
    d.textContent = text;
    if (top) d.style.marginTop = '10px';
    return d;
  };
  const box = (text) => {
    const d = document.createElement('div');
    d.textContent = text;
    d.style.cssText = boxCss;
    return d;
  };
  const target = info.path || 'ComfyUI/output/STUDIO5090/STUDIO5090';
  if (info.nested) {
    // v1.7.58: Windows "Extract All" added an extra STUDIO5090 folder.
    body.append(h,
      para('The starter project was found, but one folder too deep.  Windows "Extract All" ' +
           'usually adds an extra folder named after the zip.'),
      para('It is here:', true), box(info.nested_path),
      para('Move everything inside that inner STUDIO5090 folder up one level, into this folder, then delete the empty inner folder and restart ComfyUI:', true),
      box(target));
  } else {
    body.append(h,
      para('Studio5090 needs its starter project before you open any Studio5090 workflow.'),
      para('Click Install starter project for me and Studio5090 downloads it and puts it in the ' +
           'right place for you.', true),
      para('Or do it by hand.  Download STUDIO5090.zip and extract it into your ComfyUI output folder, then restart ' +
           'ComfyUI.  In Windows "Extract All", delete the \\STUDIO5090 Windows adds to the end of ' +
           'the path, so it ends in \\ComfyUI\\output.  This folder must exist:', true),
      box(target));
  }
  const footer = document.createElement('div');
  footer.style.cssText = 'display:flex; justify-content:flex-end; gap:8px; padding:10px 16px; ' +
    'border-top:1px solid #0d9488; background:#111e1e; border-radius:0 0 6px 6px; flex-wrap:wrap;';
  const btnCss = (primary) => (primary
    ? 'background:#0d9488; color:#fff; border:none; '
    : 'background:#2a2a2a; color:#ccc; border:1px solid #555; ') +
    'border-radius:4px; padding:6px 16px; font-size:12px; font-weight:bold; cursor:pointer;';
  const button = (text, primary) => {
    const b = document.createElement('button');
    b.textContent = text;
    b.style.cssText = btnCss(primary);
    return b;
  };
  const later = button('Later', false);
  const open = button('Open download page', false);
  const install = button('Install starter project for me', true);
  footer.append(later);
  if (!info.nested) footer.append(open, install);
  panel.append(body, footer);

  let busy = false;
  const close = () => { if (busy) return; panel.remove(); overlay.remove(); };
  later.onclick = close;
  // Clicking outside the popup or opening the download page leaves it open.
  // Only Later, Close, or the install closes or changes it.
  open.onclick = () => { window.open(info.url, '_blank', 'noopener'); };

  // v1.7.59: install the starter project from inside ComfyUI.
  const progress = document.createElement('div');
  progress.style.cssText = 'margin-top:12px; color:#2dd4bf; font-weight:bold;';
  const barOuter = document.createElement('div');
  barOuter.style.cssText = 'margin-top:6px; height:8px; background:#0f1515; border-radius:4px; overflow:hidden;';
  const barInner = document.createElement('div');
  barInner.style.cssText = 'height:100%; width:0%; background:#0d9488; transition:width 0.3s;';
  barOuter.append(barInner);

  const showDone = (st) => {
    busy = false;
    h.textContent = 'Starter project installed';
    body.replaceChildren(h,
      para('Restart ComfyUI before you open a workflow.'),
      para('After the restart, open output/STUDIO5090/STUDIO5090/workflows/CASTING_TEMPLATE.json.  ' +
           'First set the local LLM model, then press RUN to test.', true),
      para('It is here:', true), box(target));
    if (st.skipped) body.append(para(`${st.skipped} file(s) were already there and were left as they were.`, true));
    const docs = button('Open the Documentation', true);
    const demos = button('Show me the video demos', true);
    const done = button('Close', false);
    docs.onclick = () => window.open('/studio5090/documentation.pdf', '_blank', 'noopener');
    demos.onclick = () => window.open(S5090_DEMOS_URL, '_blank', 'noopener');
    done.onclick = close;
    footer.replaceChildren(done, docs, demos);
  };

  const showError = (msg) => {
    busy = false;
    progress.style.color = '#f87171';
    progress.textContent = 'The install did not finish: ' + (msg || 'unknown error') +
      '.  You can try again, or use Open download page.';
    [later, open, install].forEach((b) => { b.disabled = false; b.style.opacity = '1'; });
    install.textContent = 'Try again';
  };

  const poll = async () => {
    let st;
    try {
      st = await (await s5090Fetch('/studio5090/starter_install_status')).json();
    } catch (e) {
      setTimeout(poll, 1000);
      return;
    }
    if (st.state === 'downloading') {
      const pct = st.total ? Math.floor(100 * st.done / st.total) : 0;
      barInner.style.width = pct + '%';
      progress.textContent = st.total
        ? `Downloading the starter project... ${s5090MB(st.done)} of ${s5090MB(st.total)} MB`
        : `Downloading the starter project... ${s5090MB(st.done)} MB`;
      setTimeout(poll, 500);
    } else if (st.state === 'extracting') {
      barInner.style.width = '100%';
      progress.textContent = 'Unpacking the starter project...';
      setTimeout(poll, 500);
    } else if (st.state === 'done') {
      showDone(st);
    } else if (st.state === 'error') {
      showError(st.message);
    } else {
      setTimeout(poll, 500);
    }
  };

  install.onclick = async () => {
    busy = true;
    progress.style.color = '#2dd4bf';
    progress.textContent = 'Starting the download...';
    barInner.style.width = '0%';
    if (!progress.isConnected) body.append(progress, barOuter);
    [later, open, install].forEach((b) => { b.disabled = true; b.style.opacity = '0.5'; });
    try {
      const r = await s5090Fetch('/studio5090/starter_install', { method: 'POST' });
      if (!r.ok) throw new Error('the server said ' + r.status);
      poll();
    } catch (e) {
      showError(String(e?.message || e));
    }
  };
  document.body.append(overlay, panel);
}

app.registerExtension({
  name: 'Studio5090.StarterCheck',
  async setup() {
    try {
      const r = await s5090Fetch('/studio5090/starter_status');
      const info = await r.json();
      if (info && info.present === false) s5090StarterPopup(info);   // missing or one folder too deep
    } catch (e) {
      console.warn('[Studio5090] starter check', e);
    }
  },
});
