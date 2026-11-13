# Third-Party Licenses

Studio5090 is MIT-licensed (see the LICENSE file at the repository root).  It depends on external custom-node packs, model weights, and LoRAs that are NOT redistributed with this repository — users download them directly from their upstream sources.  Each of those upstream components carries its own license, which the user is responsible for reviewing and honoring for their intended use.

This file is a pointer, not a legal opinion.  It exists so nobody assumes the Studio5090 MIT license covers what other people's software or models allow.

## Custom Node Packs (installed via ComfyUI Manager or git)

Each of these ships with its own LICENSE file.  Consult the repository directly for terms.

- **ComfyUI-LTXVideo** — Lightricks LTX video model integration
- **ComfyUI Impact Pack** — Utility nodes
- **ComfyUI-KJNodes** — Kijai's node toolkit
- **ComfyUI-VideoHelperSuite** — Video I/O
- **ComfyUI_essentials** — Image operations
- **WAS Node Suite (Revised)** — Image effects
- **ComfyMath** — Math primitives
- **ComfyUI-Prompt-Manager** — FranckyB's LLM prompt manager (https://github.com/FranckyB/ComfyUI-Prompt-Manager)
- **ComfyLiterals** — Primitive literals
- **Basic data handling** — Reroute and primitive I/O
- **ComfyUI-Easy-Use** — Casting workflow utilities
- **ComfyUI-MelBandRoFormer** — Audio processing
- **ComfyUI ArtVenture** — Image switches
- **Facerestore CF (Code Former)** — Face restoration

## Model Weights (downloaded separately by the user)

Model weights are subject to the license posted at their source URL.  Common licenses in this space include OpenRAIL variants (permissive with use-restrictions), Apache 2.0, custom research licenses, and non-commercial licenses.  Read the model card before commercial or public use.

- **LTX-2.3** and **LTX-2.5** models by Lightricks — see model card on Hugging Face (huggingface.co/Lightricks)
- **Gemma 3** and **Gemma 4** text encoders by Google — Gemma Terms of Use (subject to Google's use policy)
- **Kijai LTX 2.3 support models** (VAEs, text projection, MelBandRoformer) — see each model card on Hugging Face (huggingface.co/Kijai)
- **LTX 2.3 Soft Enhance Style LoRA** and **Crisp Enhance Style LoRA** by vrgamedevgirl84 — see each LoRA card on Hugging Face (huggingface.co/vrgamedevgirl84)
- **Qwen3 GGUF models** used by Prompt Manager — Qwen License (auto-downloaded by ComfyUI-Prompt-Manager to `ComfyUI/models/LLM/`)
- **codeformer.pth** — see model card on Hugging Face (huggingface.co/alexgenovese/facerestore)
- **4x_foolhardy_Remacri.pth** upscaler — see openmodeldb.info for terms

## Not a legal opinion

The Studio5090 author (Alan Rosenfeld) is not a lawyer and does not offer legal advice.  If you plan to use Studio5090 in a commercial context, verify that every model and dependency license you depend on permits your intended use.  The MIT license on Studio5090 itself covers only the code Alan wrote (the workflows, the custom nodes, the templates, the documentation).  It does not extend downstream.
