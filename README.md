# Studio5090

**Studio5090 is a series of ComfyUI workflows designed by a VFX artist, built the way a film studio works: cast it, create it, render it.**

Designed by Alan Rosenfeld.

[![Watch the Studio5090 demos on Vimeo](https://img.shields.io/badge/%E2%96%B6%20Watch%20the%20demos-Vimeo%20Showcase-1ab7ea?style=for-the-badge&logo=vimeo&logoColor=white)](https://vimeo.com/showcase/12492601)

---

## Before you begin: download the starter project

**Studio5090 needs its starter project to be in place before you open any workflow.**  The workflows, examples and test files all live inside it.

Go to the **[Releases page](https://github.com/Studio5090/ComfyUI-Studio5090-Utils/releases/latest)** and download these three files:

| File | What it is |
|---|---|
| `STUDIO5090.zip` | The starter project.  Required. |
| `Studio5090_Documentation.pdf` | How every part of Studio5090 works. |
| `Studio5090_Bible.pdf` | Recipes, render style samples and tricks. |

---

## Installation

### 1. Extract the starter project

Extract `STUDIO5090.zip` into your ComfyUI **output** folder.

**On Windows:** right-click `STUDIO5090.zip` and choose **Extract All**.  Windows adds `\STUDIO5090` to the end of the destination path.  **Delete that part**, so the path ends in `\ComfyUI\output`, then click **Extract**.

When you are done, this folder must exist:

```
ComfyUI/output/STUDIO5090/STUDIO5090/
```

If the folder ends up one level too deep (`STUDIO5090/STUDIO5090/STUDIO5090`), Studio5090 tells you when ComfyUI starts.  Move everything inside the inner `STUDIO5090` folder up one level, then delete the empty inner folder.

### 2. Install the Studio5090 nodes

**With git:** open a terminal in `ComfyUI/custom_nodes/` and run

```
git clone https://github.com/Studio5090/ComfyUI-Studio5090-Utils
```

**Without git:** on this page, click the green **Code** button, then **Download ZIP**.  Unzip it, **rename the folder from `ComfyUI-Studio5090-Utils-main` to `ComfyUI-Studio5090-Utils`**, and move it into `ComfyUI/custom_nodes/`.

Keep only one copy of Studio5090 in `custom_nodes`.  If you had an earlier copy, remove it first.

### 3. Restart ComfyUI

Restart ComfyUI completely, not just the browser page.

---

## First run

### STEP 1: Open the Casting template

Open the **Casting** template first.  It contains every model Studio5090 uses, so it is the best way to get everything installed at once.

The templates are in the starter project you extracted:
ComfyUI/output/STUDIO5090/STUDIO5090/workflows/

Drag `CASTING_TEMPLATE.json` onto ComfyUI to open it.  This folder also holds the example project workflows.  The same templates are in `ComfyUI/custom_nodes/ComfyUI-Studio5090-Utils/templates/product_workflows/`.

- Use **ComfyUI Manager > Install Missing Custom Nodes** to install the other node packs the workflow needs, then restart ComfyUI.
- Download any missing models.  ComfyUI lists them when the workflow opens.  `MODELS.md` in this repository lists every model and the folder it goes in.

### STEP 2: Set the Prompt Generator model

Every time you open a template, after the models and nodes are installed, **set the Prompt Generator model first.**  The Documentation and the demo videos show where to do this.

Studio5090's **LLM Model Select** node sets the model for every Prompt Generator in the workflow at once, so you only pick it in one place.

### STEP 3: Run Casting

Run the Casting workflow.

**If you get errors,** the most likely cause is a Prompt Generator model that is too big for your system.  Choose a smaller model in LLM Model Select and run it again.

---

## The three tools

**Casting:** create a character, give them a voice and an accent, and audition them on camera.

**Create:** build images and character sheets with FLUX.2 and QWEN, including full sets of multi-angle views.

**RENDER:** turn your images and audio into finished video with LTX-2.3, from first frame to last frame.

Watch each one in action in the **[Studio5090 Vimeo Showcase](https://vimeo.com/showcase/12492601)**.

---

## Your own copies of the text files

Accents, render styles and the LLM instructions are plain text files.  To change one, copy it into `ComfyUI/output/STUDIO5090/` and edit the copy.  Your copy is used in place of the toolkit's, and updates never overwrite it.  See `STUDIO5090_TIPS.md`.

---

## License

MIT License.  See `LICENSE` and `THIRD_PARTY_LICENSES.md`.
