# Studio5090 Tips

Short notes on three things that are easy to forget.

---

## 1. Your own copies of the text files

Studio5090 reads its accents, render styles and LLM instructions from text files that ship with the toolkit.  You can replace any of them with your own copy.

**Where:** put your copy straight into the STUDIO5090 folder:

`ComfyUI/output/STUDIO5090/<file name>`

Use the exact file name from the list below.  Your copy wins over the toolkit's copy.

| What it is | File name | Toolkit's copy |
|---|---|---|
| Accents | `accents.txt` | `templates/accents.txt` |
| Render Styles | `render_styles.txt` | `templates/render_styles/` |
| FLUX Render Style LLM | `flux_render_style_llm.txt` | `templates/render_styles/` |
| QWEN Render Style Prompt | `qwen_render_style_prompt.txt` | `templates/render_styles/` |
| QWEN Turntable LTX2.3 Render Style | `qwen_turntable_ltx2.3_render_style.txt` | `templates/render_styles/` |
| Casting Director LLM | `Casting_Director_LLM.txt` | `templates/llm/` |
| QWEN Turntable LLM | `QWEN_Turntable_LLM.txt` | `templates/llm/` |
| Animation LLM | `Animation_LLM.txt` | `templates/llm/` |

**To start:** copy the toolkit's file into STUDIO5090, then edit the copy.  Never edit the toolkit's file itself, because an update replaces it.

**To check which copies are in use:** press Refresh on any Project Manager.  The status line names your copies, and the ComfyUI log prints one line per copy:

`[Studio5090] Your own copy is in place and being used: Accents (...)`

**To go back to the toolkit's file:** delete your copy from STUDIO5090 and press Refresh.

**After a toolkit update:** your copy stays in use.  If the update improved that file, compare the two and move the changes you want into your copy.

---

## 2. QWEN yellow-outline trick

Use this to remove objects QWEN keeps getting wrong, such as papers or a phone that move or melt in the video.

1. Open the image in GIMP or any paint program.
2. Draw a bright yellow outline around each object you want gone.
3. Save it and load it into QWEN Edit in Create.
4. Use a prompt like this one:

   Remove all the yellow outlined objects from the desk replacing with similar empty desktop.

5. Change "the desk" and "empty desktop" to match your surface, such as "the counter" and "empty countertop".

The outline tells QWEN exactly which objects to remove, so nothing else in the picture changes.

---

## 3. LTXV Freeze Latent uses

LTXV Freeze Latent freezes the noise mask.  The latent you give it is kept as it is, not cleared.

**Silent turntable.**  Freeze an empty audio latent.  The video renders with silence, so a turntable has no stray voice or music.

**Audio-only voice pass.**  Freeze the video latent.  Only the audio is made, and it tends to come out cleaner.

**Your own audio (not tested yet).**  Freeze an encoded audio file.  The audio should stay as it is while the video is made to match it.
