// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Alan Rosenfeld
// Studio5090 — see LICENSE at the repository root for full terms.
// Provided "AS IS", without warranty of any kind.
//
// Studio5090 LLM Model Select, v1.7.47.
//
// The node needs no wires.  Whatever model is picked here is written into the
// "model" field of every Prompt Generator (ComfyUI-Prompt-Manager) in the
// workflow, subgraphs included:
//   * right away when the dropdown changes,
//   * when a workflow opens,
//   * and again just before every Run.
//
// Why no wires: since Prompt Manager's October 2026 update, a Prompt
// Generator rejects any wire into its model field ("Model must be a string"),
// because ComfyUI checks the field before the wire has a value.  So any wire
// into a Prompt Generator's model field is removed, and the value is typed
// into the field instead.

const { app } = window.comfyAPI.app;

const SELECT_CLASS = 'Studio5090LLMModelSelect';
const TARGET_CLASS = 'PromptGenerator';

function s5090AllGraphs() {
  const root = app.graph;
  if (!root) return [];
  return [root, ...(root.subgraphs?.values?.() || [])];
}

function s5090NodesOf(g) {
  return g?._nodes || g?.nodes || [];
}

function s5090Class(n) {
  return n?.constructor?.comfyClass || n?.comfyClass || n?.type || '';
}

function s5090FindSelect() {
  for (const g of s5090AllGraphs()) {
    for (const n of s5090NodesOf(g)) {
      if (s5090Class(n) === SELECT_CLASS) return n;
    }
  }
  return null;
}

// Write the model into every Prompt Generator.  Returns how many it set.
function s5090ApplyModel(model, why) {
  if (typeof model !== 'string' || !model) return 0;
  let count = 0, unwired = 0, changed = 0;
  for (const g of s5090AllGraphs()) {
    for (const n of s5090NodesOf(g)) {
      if (s5090Class(n) !== TARGET_CLASS) continue;
      const w = (n.widgets || []).find((x) => x.name === 'model');
      if (!w) continue;
      count++;
      // Remove a wire into the model field.  Prompt Manager rejects it.
      const slot = (n.inputs || []).findIndex((i) => i?.name === 'model');
      if (slot >= 0 && n.inputs[slot].link != null) {
        try {
          n.disconnectInput(slot);
          unwired++;
        } catch (e) {
          console.warn(`[Studio5090 LLM Model Select] could not remove the model wire on node ${n.id}`, e);
        }
      }
      if (w.value !== model) {
        w.value = model;
        changed++;
      }
    }
  }
  if (unwired || changed) {
    console.log(`[Studio5090 LLM Model Select] ${why}: ${model} on ${count} Prompt Generator(s)` +
      (changed ? `, ${changed} changed` : '') + (unwired ? `, ${unwired} model wire(s) removed` : ''));
    app.graph?.setDirtyCanvas?.(true, true);
  }
  const sel = s5090FindSelect();
  if (sel) {
    sel.__s5090Count = count;
    sel.setDirtyCanvas?.(true, false);
  }
  return count;
}

function s5090ApplyFromSelect(why) {
  const sel = s5090FindSelect();
  if (!sel) return 0;
  const w = (sel.widgets || []).find((x) => x.name === 'model');
  return s5090ApplyModel(w?.value, why);
}

app.registerExtension({
  name: 'Studio5090.LLMModelSelect',

  async setup() {
    const orig = app.graphToPrompt;
    if (typeof orig === 'function' && !orig.__s5090ModelSelect) {
      const wrapped = async function (...args) {
        try { s5090ApplyFromSelect('before Run'); }
        catch (e) { console.warn('[Studio5090 LLM Model Select] before Run failed', e); }
        return orig.apply(this, args);
      };
      wrapped.__s5090ModelSelect = true;
      app.graphToPrompt = wrapped;
    }
  },

  afterConfigureGraph() {
    try { s5090ApplyFromSelect('workflow opened'); }
    catch (e) { console.warn('[Studio5090 LLM Model Select] workflow open failed', e); }
  },

  async beforeRegisterNodeDef(nodeType, nodeData) {
    if (nodeData?.name !== SELECT_CLASS) return;

    const onCreated = nodeType.prototype.onNodeCreated;
    nodeType.prototype.onNodeCreated = function () {
      const r = onCreated?.apply(this, arguments);
      const w = (this.widgets || []).find((x) => x.name === 'model');
      if (w) {
        const cb = w.callback;
        w.callback = (value, ...rest) => {
          const out = cb?.call(w, value, ...rest);
          s5090ApplyModel(w.value, 'model changed');
          return out;
        };
      }
      return r;
    };

    // Show how many Prompt Generators follow this node.
    const computeSize = nodeType.prototype.computeSize;
    nodeType.prototype.computeSize = function (out) {
      const s = computeSize ? computeSize.call(this, out) : [260, 60];
      return [Math.max(s[0], 260), s[1] + 18];
    };
    const onDraw = nodeType.prototype.onDrawForeground;
    nodeType.prototype.onDrawForeground = function (ctx) {
      onDraw?.apply(this, arguments);
      if (this.flags?.collapsed) return;
      const n = this.__s5090Count;
      const text = (n == null) ? 'Sets the model on every Prompt Generator'
        : n === 1 ? 'Sets the model on 1 Prompt Generator'
        : `Sets the model on ${n} Prompt Generators`;
      ctx.save();
      ctx.font = '12px sans-serif';
      ctx.fillStyle = n === 0 ? '#e0a040' : '#9fb3b3';
      ctx.textAlign = 'left';
      ctx.fillText(text, 10, this.size[1] - 8);
      ctx.restore();
    };
  },
});
