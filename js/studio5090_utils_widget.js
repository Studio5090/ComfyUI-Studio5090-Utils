/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Alan Rosenfeld
 * Studio5090 — see LICENSE at the repository root for full terms.
 * Provided "AS IS", without warranty of any kind.
 */

/**
 * Studio5090 Utility Nodes — Radio Button Widgets (v1.7.0)
 * Styled toggle buttons for boolean radio toggle nodes:
 *   - Studio5090 Audio Pad Switch  — Normal / Padded
 *   - Studio5090 Audio Select       — Audio File / Prompt Audio
 *   - Studio5090 Latent Mode        — Empty Latent / Image Input
 *   - Studio5090 Latent Resolution  — 1536x864 / 768x432
 *
 * NOTE: Studio5090 Steps (replacing Studio5090 Steps Quality in v1.4.4)
 * uses a native ComfyUI dropdown for its three-value 8/20/50 switch
 * and therefore does NOT need a custom radio widget.
 *
 * Also handles the SaveResult skip badge (red warning when project or
 * subject is empty at execute time).
 *
 * Designed by Alan Rosenfeld + Claude (Anthropic), 2026.
 */

const { app } = window.comfyAPI.app;

const UTIL_COLORS = {
  border:       '#0d9488',
  activeText:   '#0a1a1a',
  activeBg:     '#2dd4bf',
  inactiveBg:   '#1a3535',
  inactiveText: '#ffffff',   // white — readable on dark bg
  nodeBg:       '#1a2a2a',
};

const BTN_HEIGHT  = 28;
const ROW_PADDING = 8;
const WIDGET_H    = 46;

// Node widths
const WIDTH_STANDARD = 260;

// v1.7.45: opts.offAlert = true draws the right-hand (OFF) button red when
// it is selected, so a switch left in an unusual position is easy to spot.
const ALERT_BG = '#b42318', ALERT_BORDER = '#f04438', ALERT_TEXT = '#ffffff';

function attachRadioWidget(node, widgetName, labelOn, labelOff, nodeWidth = WIDTH_STANDARD, opts = {}) {

  const tryAttach = () => {
    if (!node.widgets) return;
    const idx = node.widgets.findIndex(w => w.name === widgetName);
    if (idx === -1) return;

    const initValue = node.widgets[idx].value ?? true;
    node.widgets.splice(idx, 1);

    let currentValue = initValue;

    const widget = {
      name:    widgetName,
      type:    'studio5090_radio',
      value:   currentValue,
      options: {},

      computeSize(nw) {
        return [nw, WIDGET_H];
      },

      draw(ctx, node, nw, y, height) {
        const x     = ROW_PADDING;
        const w     = nw - ROW_PADDING * 2;
        const btnY  = y + (height - BTN_HEIGHT) / 2;
        const halfW = (w - 6) / 2;

        // Left button
        const leftActive = currentValue === true;
        ctx.fillStyle   = leftActive ? UTIL_COLORS.activeBg : UTIL_COLORS.inactiveBg;
        ctx.strokeStyle = UTIL_COLORS.border;
        ctx.lineWidth   = 1;
        roundRect(ctx, x, btnY, halfW, BTN_HEIGHT, 4);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle    = leftActive ? UTIL_COLORS.activeText : UTIL_COLORS.inactiveText;
        ctx.font         = 'bold 11px "Courier New", monospace';
        ctx.textAlign    = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(labelOn, x + halfW / 2, btnY + BTN_HEIGHT / 2);

        // Right button
        const rightX      = x + halfW + 6;
        const rightActive = currentValue === false;
        const alert       = rightActive && opts.offAlert;
        ctx.fillStyle   = alert ? ALERT_BG : (rightActive ? UTIL_COLORS.activeBg : UTIL_COLORS.inactiveBg);
        ctx.strokeStyle = alert ? ALERT_BORDER : UTIL_COLORS.border;
        roundRect(ctx, rightX, btnY, halfW, BTN_HEIGHT, 4);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = alert ? ALERT_TEXT : (rightActive ? UTIL_COLORS.activeText : UTIL_COLORS.inactiveText);
        ctx.fillText(labelOff, rightX + halfW / 2, btnY + BTN_HEIGHT / 2);
      },

      mouse(event, pos, node) {
        if (event.type !== 'pointerdown') return false;

        // 4px hit-region slop on all sides for forgiving click targets.
        // Without this, math-perfect button bounds feel narrow because
        // human pointing has natural variance.
        const SLOP = 4;

        const nw    = node.size[0];
        const w     = nw - ROW_PADDING * 2;
        const halfW = (w - 6) / 2;

        let widgetY = LiteGraph.NODE_TITLE_HEIGHT;
        for (const wg of node.widgets) {
          if (wg === widget) break;
          const sz = wg.computeSize ? wg.computeSize(nw) : [nw, LiteGraph.NODE_WIDGET_HEIGHT];
          widgetY += sz[1];
        }

        const btnY = widgetY + (WIDGET_H - BTN_HEIGHT) / 2;
        if (pos[1] < btnY - SLOP || pos[1] > btnY + BTN_HEIGHT + SLOP) return false;

        const leftX  = ROW_PADDING;
        const rightX = ROW_PADDING + halfW + 6;

        if (pos[0] >= leftX - SLOP && pos[0] <= leftX + halfW + SLOP) { setValue(true);  return true; }
        if (pos[0] >= rightX - SLOP && pos[0] <= rightX + halfW + SLOP) { setValue(false); return true; }
        return false;
      },

      serialize: true,
    };

    const setValue = (val) => {
      currentValue = val;
      widget.value = val;
      if (widget.callback) widget.callback(val);
      app.graph?.setDirtyCanvas(true, true);
    };

    node.widgets.splice(idx, 0, widget);
    node.setSize([nodeWidth, node.computeSize()[1]]);
    node.resizable = false;   // all three locked — Frame Mode is just wider
  };

  let attempts = 0;
  const poll = setInterval(() => {
    if (node.widgets?.find(w => w.name === widgetName)) {
      clearInterval(poll);
      tryAttach();
    } else if (++attempts > 20) {
      clearInterval(poll);
    }
  }, 80);
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

app.registerExtension({
  name: 'Studio5090.AudioPadSwitch',
  nodeCreated(node) {
    if (node.constructor?.comfyClass !== 'Studio5090AudioPadSwitch') return;
    attachRadioWidget(node, 'mode', 'Normal', 'Padded', WIDTH_STANDARD);
  },
});

app.registerExtension({
  name: 'Studio5090.AudioSelect',
  nodeCreated(node) {
    if (node.constructor?.comfyClass !== 'Studio5090AudioSelect') return;
    attachRadioWidget(node, 'mode', 'Audio File', 'Prompt Audio', WIDTH_STANDARD);
  },
});

app.registerExtension({
  name: 'Studio5090.LatentMode',
  nodeCreated(node) {
    if (node.constructor?.comfyClass !== 'Studio5090LatentMode') return;
    attachRadioWidget(node, 'mode', 'Empty Latent', 'Image Input', WIDTH_STANDARD);
  },
});

app.registerExtension({
  name: 'Studio5090.LatentResolution',
  nodeCreated(node) {
    if (node.constructor?.comfyClass !== 'Studio5090LatentResolution') return;
    attachRadioWidget(node, 'mode', '1536x864', '768x432', WIDTH_STANDARD);
  },
});

app.registerExtension({
  name: 'Studio5090.StillVideoSwitch',
  nodeCreated(node) {
    if (node.constructor?.comfyClass !== 'Studio5090StillVideoSwitch') return;
    attachRadioWidget(node, 'mode', 'Still Image', 'Video Grab', WIDTH_STANDARD, { offAlert: true });
  },
});

// ─────────────────────────────────────────────────────────────────────────
// SaveResult skip badge
//
// When the SaveResult node executes and is skipped (project or subject
// empty), the Python side returns a "studio5090_skip" message in the UI
// payload. We listen for that and stamp a red "⚠ subject not set" (or
// equivalent) badge directly onto the node so the user sees it without
// having to scroll the console.
//
// On a successful save, Python returns an empty skip message which we use
// to clear the badge.
// ─────────────────────────────────────────────────────────────────────────

const BADGE = {
  bg:     '#7f1d1d',     // dark red
  border: '#fca5a5',     // light red
  text:   '#fee2e2',     // off-white
  height: 20,
  pad:    6,
};

function drawSkipBadge(node, msg) {
  // Hook the node's onDrawForeground to paint the badge above the node.
  // We attach a property so the badge survives redraws until cleared.
  node.__studio5090_skip_msg = msg || '';
  const original = node.__studio5090_orig_onDrawForeground
    || node.onDrawForeground
    || function(){};
  if (!node.__studio5090_orig_onDrawForeground) {
    node.__studio5090_orig_onDrawForeground = original;
  }
  node.onDrawForeground = function(ctx) {
    original.call(this, ctx);
    const m = this.__studio5090_skip_msg;
    if (!m) return;
    // Truncate long messages to fit the node width
    const maxChars = Math.max(20, Math.floor((this.size?.[0] || 200) / 7));
    const text = m.length > maxChars ? '⚠ ' + m.substring(0, maxChars - 4) + '…' : '⚠ ' + m;
    ctx.save();
    ctx.font = 'bold 11px sans-serif';
    const tw = ctx.measureText(text).width;
    const w = Math.min((this.size?.[0] || 200) - 8, tw + BADGE.pad * 2);
    const x = 4;
    const y = -BADGE.height - 4;   // above the node title bar
    ctx.fillStyle = BADGE.bg;
    ctx.strokeStyle = BADGE.border;
    ctx.lineWidth = 1;
    ctx.beginPath();
    if (ctx.roundRect) {
      ctx.roundRect(x, y, w, BADGE.height, 4);
    } else {
      ctx.rect(x, y, w, BADGE.height);
    }
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = BADGE.text;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x + BADGE.pad, y + BADGE.height / 2);
    ctx.restore();
  };
  node.setDirtyCanvas?.(true, true);
}

app.registerExtension({
  name: 'Studio5090.SaveResultSkipBadge',
  async setup() {
    // Listen for execution events that include studio5090_skip messages.
    const api = app.api || window.comfyAPI?.api?.api;
    if (!api?.addEventListener) return;

    api.addEventListener('executed', (ev) => {
      const detail = ev.detail || {};
      const nodeId = detail.node;
      const output = detail.output || {};
      if (!('studio5090_skip' in output)) return;

      const node = app.graph?.getNodeById?.(Number(nodeId));
      if (!node || node.constructor?.comfyClass !== 'Studio5090SaveResult') return;

      const msgs = output.studio5090_skip || [];
      const msg = (msgs[0] || '').trim();
      drawSkipBadge(node, msg);  // empty string = clear badge
    });
  },
});

// v1.7.40: a Studio5090 text box must never hold null.  Another extension
// (pysssss Preset Text) reads every text box when Run is pressed and fails on
// a null value, which shows as "Cannot read properties of undefined (reading
// 'output')".  Empty values are set to the box's default when a workflow
// opens and again just before each Run.
function s5090FixNullText() {
  let fixed = 0;
  try {
    const root = app.graph;
    if (!root) return 0;
    const graphs = [root, ...(root.subgraphs?.values?.() || [])];
    for (const g of graphs) {
      for (const n of (g._nodes || g.nodes || [])) {
        const cls = n.constructor?.comfyClass || n.type || '';
        if (!String(cls).startsWith('Studio5090')) continue;
        for (const w of (n.widgets || [])) {
          if (w.value !== null) continue;
          const t = String(w.type || '').toLowerCase();
          if (!['text', 'customtext', 'string'].includes(t)) continue;
          let def = w.options?.default;
          if (typeof def !== 'string') def = (w.name === 'render_style') ? '0_NO RENDER STYLE ADDED' : '';
          w.value = def;
          fixed++;
          console.log(`[Studio5090] empty text box set to default: node ${n.id} ${w.name}`);
        }
      }
    }
  } catch (e) { console.warn('[Studio5090] null text check failed', e); }
  return fixed;
}

app.registerExtension({
  name: 'Studio5090.NullTextGuard',
  async setup() {
    const orig = app.graphToPrompt;
    if (typeof orig === 'function' && !orig.__s5090NullGuard) {
      const wrapped = async function (...args) {
        s5090FixNullText();
        return orig.apply(this, args);
      };
      wrapped.__s5090NullGuard = true;
      app.graphToPrompt = wrapped;
    }
  },
  afterConfigureGraph() { s5090FixNullText(); },
});

// v1.7.46: Save Result's result_type dropdown now names the folder each type
// saves to.  A saved workflow that still holds an old bare value (FLUX, QWEN,
// CHARACTER) is switched to the matching new label when it opens.  The
// Python side accepts both, so an old value never stops a run.
const S5090_RESULT_LABELS = {
  FLUX: 'FLUX (CREATE folder)',
  QWEN: 'QWEN (EDITS folder)',
  CHARACTER: 'CHARACTER (CHARACTERS folder)',
};
function s5090UpgradeResultType() {
  try {
    const root = app.graph;
    if (!root) return;
    const graphs = [root, ...(root.subgraphs?.values?.() || [])];
    for (const g of graphs) {
      for (const n of (g._nodes || g.nodes || [])) {
        if ((n.constructor?.comfyClass || n.type) !== 'Studio5090SaveResult') continue;
        const w = (n.widgets || []).find((x) => x.name === 'result_type');
        const key = String(w?.value ?? '').trim().toUpperCase();
        if (w && S5090_RESULT_LABELS[key]) {
          w.value = S5090_RESULT_LABELS[key];
          console.log(`[Studio5090] Save Result ${n.id}: result_type ${key} -> ${w.value}`);
        }
      }
    }
  } catch (e) { console.warn('[Studio5090] result_type upgrade failed', e); }
}
app.registerExtension({
  name: 'Studio5090.SaveResultLabels',
  afterConfigureGraph() { s5090UpgradeResultType(); },
});
