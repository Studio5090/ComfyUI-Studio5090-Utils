/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Alan Rosenfeld
 * Studio5090 — see LICENSE at the repository root for full terms.
 * Provided "AS IS", without warranty of any kind.
 */

/**
 * Studio5090 Image A/B Switch colors (v1.7.45)
 *
 * The node takes the color of the input it is set to, so the setting can be
 * read at a glance:
 *   Flux.2 Input        → ComfyUI's built-in "purple" (title bar and body)
 *   Manual Image Input  → ComfyUI's built-in "green"  (title bar and body)
 * These are the same values the node color picker uses.  The color follows
 * the switch when it is flipped and when a workflow is opened, and replaces
 * any color set on this node by hand.
 */

const { app } = window.comfyAPI.app;

const AB_TYPE = 'Studio5090ImageABSwitch';
const FALLBACK = {
  purple: { color: '#323', bgcolor: '#535' },
  green:  { color: '#232', bgcolor: '#353' },
};

function paletteColor(name) {
  const canvasClass = window.LGraphCanvas || window.LiteGraph?.LGraphCanvas;
  const c = canvasClass?.node_colors?.[name];
  return (c && c.color && c.bgcolor) ? c : FALLBACK[name];
}

function applyABColor(node) {
  const w = node.widgets?.find(x => x.name === 'use_manual_image');
  if (!w) return;
  const manual = !!w.value;
  if (node._s5090ABApplied === manual && node.color && node.bgcolor) return;
  const c = paletteColor(manual ? 'green' : 'purple');
  if (typeof node.setColorOption === 'function') node.setColorOption(c);
  else { node.color = c.color; node.bgcolor = c.bgcolor; }
  node._s5090ABApplied = manual;
  node.setDirtyCanvas?.(true, true);
}

app.registerExtension({
  name: 'Studio5090.ImageABSwitchColor',

  nodeCreated(node) {
    if (node.constructor?.comfyClass !== AB_TYPE) return;
    const w = node.widgets?.find(x => x.name === 'use_manual_image');
    if (w) {
      const orig = w.callback;
      w.callback = function (...args) {
        const r = orig?.apply(this, args);
        node._s5090ABApplied = undefined;
        applyABColor(node);
        return r;
      };
    }
    // Catches every other way the value can change (opening a workflow,
    // undo, paste): compare on each draw, and recolor only on a change.
    const origDraw = node.onDrawForeground;
    node.onDrawForeground = function (...args) {
      applyABColor(this);
      return origDraw?.apply(this, args);
    };
    const origConfigure = node.onConfigure;
    node.onConfigure = function (...args) {
      const r = origConfigure?.apply(this, args);
      this._s5090ABApplied = undefined;
      applyABColor(this);
      return r;
    };
    applyABColor(node);
  },
});
