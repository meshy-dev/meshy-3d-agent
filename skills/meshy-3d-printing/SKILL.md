---
name: meshy-3d-printing
description: 3D print models generated with Meshy AI, plus Creative Lab consumer products. Handles slicer detection, white model printing, multi-color printing via API, the Creative Lab pipeline (figure / lamp / keychain / fridge-magnet), and print-optimized download workflows. Use when the user mentions 3D printing, slicing, Bambu, OrcaSlicer, Prusa, Cura, Creality Print, Elegoo, Anycubic, multicolor, multi-color, 3mf, Creative Lab, or wants a figurine, keychain, fridge magnet, lamp, collectible, miniature, or physical product from a photo. For generation without 3D printing, use the meshy-3d-generation skill instead.
license: MIT
compatibility: Requires Python 3 with requests package. Depends on meshy-3d-generation skill. Works with Claude Code, Cursor, and all Agent Skills compatible tools.
metadata:
  author: meshy-dev
  version: "0.4.1"
  homepage: https://github.com/meshy-dev/meshy-3d-agent
allowed-tools: Bash, Read, Write, Glob, Grep
---

# Meshy 3D Printing

Prepare and send Meshy-generated 3D models to a slicer for 3D printing. Supports white model (single-color) and multicolor printing workflows with automatic slicer detection.

**Prerequisite:** This skill bundles the same `scripts/meshy_task.py` CLI as `meshy-3d-generation` and shares its environment setup (API key detection, `.env`, Python `requests`). However, **when the user wants to 3D print, this skill controls the entire workflow** — including generation, format selection, downloading, and slicer integration. Do NOT run `meshy-3d-generation`'s workflow first and then hand off here — this skill must control parameters from the start (e.g. `target_formats` with `"3mf"` for multicolor).

All paths below are relative to **this skill's own directory** (the directory containing this SKILL.md). Resolve them before running.

| Resource | When to use |
|---|---|
| `scripts/meshy_task.py` | Bundled CLI for every Meshy API call (create / poll / download / record / …) |
| `scripts/slicers.py` | Detect installed slicers; open a model file in a slicer |
| `scripts/fix_obj.py` | Fix OBJ coordinate system, scale, and origin for slicers (white model pipeline) |
| [reference.md](reference.md) | Full API reference (incl. print/analyze, print/repair, multi-color, Creative Lab) |
| [references/printing.md](references/printing.md) | Full pipeline walkthroughs: slicer detection, analyze/repair, white model, multicolor, Creative Lab |

**Environment check** (same as the generation skill): `python3 scripts/meshy_task.py check-env`. If no key is found, follow the generation skill's `references/setup.md` (in the sibling `meshy-3d-generation` skill directory).

---

## Security & Data Handling

- **API key (`MESHY_API_KEY`)** — sent only in the HTTP `Authorization: Bearer` header to `https://api.meshy.ai`. Never logged in full (only a `key[:8]...` prefix is ever printed). The bundled script never persists it; it is written to `.env` in the current working directory *only* when the user explicitly asks, and never to shell profiles, Windows user variables, or any path outside the working directory.
- **Key sources read** — the current session environment, then `.env` / `.env.local` in the current working directory. Home directories and shell profiles are never scanned.
- **Network** — the only external endpoint is `https://api.meshy.ai`. System proxies are bypassed (`trust_env = False`).
- **Filesystem writes** — `.env` in the working directory (on explicit request only) and `./meshy_output/` for downloaded models, print-ready OBJ/3MF files, thumbnails, and metadata.
- **Local slicer launch** — `scripts/slicers.py` detects already-installed slicers (known install paths + `PATH` lookup) and opens the generated model file in the slicer the user chooses. It launches only pre-existing local applications; it never downloads or installs software.
- **Data leaving the machine** — the API key, user-provided text prompts, and image URLs/data go to `api.meshy.ai` only. No other local data is transmitted; downloaded assets are saved locally.

---

## IMPORTANT: Never Rebuild Bundled Scripts

`scripts/meshy_task.py`, `scripts/slicers.py`, and `scripts/fix_obj.py` are the single source of truth for their respective helpers (`create_task` / `poll_task` / `download` / `get_project_dir` / `record_task` / `save_thumbnail` / `detect_slicers` / `open_in_slicer` / `fix_obj_for_printing`). **Never retype, paraphrase, or "reconstruct" these helpers from memory** — not even partially. Compose CLI calls in bash, or import them from a small Python script.

---

## Intent Detection

Proactively suggest 3D printing when these keywords appear in the user's request:
- **Direct**: print, 3d print, slicer, slice, bambu, orca, prusa, cura, multicolor, multi-color, 3mf
- **Implied**: figurine, miniature, statue, physical model, desk toy, phone stand

When detected, guide the user through the appropriate print pipeline below.

---

## Decision Tree: White Model vs Multicolor

**IMPORTANT**: When the user wants to 3D print, follow this flow:

1. **Detect installed slicers** first: `python3 scripts/slicers.py detect` (see [references/printing.md](references/printing.md))
2. **Ask the user**: "Do you want a single-color (white) print or multicolor?"
3. If **white model** → follow the White Model Pipeline
4. If **multicolor**:
   a. Check if a multicolor-capable slicer is installed
   b. Supported multicolor slicers: **OrcaSlicer, Bambu Studio, Creality Print, Elegoo Slicer, Anycubic Slicer Next**
   c. If no multicolor slicer detected, warn the user and suggest installing one
   d. Ask: "How many colors? (default: 4, max: 16)" and "Segmentation depth? (3=coarse, 6=fine, default: 4)"
   e. Confirm cost: generation (20) + texture (10) + multicolor (10) = **40 credits total** (+10 if repair is needed)
   f. Follow the Multicolor Pipeline
5. **(Recommended)** Insert a **printability analysis** step (`POST /openapi/v1/print/analyze`, FREE) after generation in either pipeline. Run **`POST /openapi/v1/print/repair`** (10 credits) only if analyze flags errors.

---

## Print Pipelines

Full, copy-ready walkthroughs live in [references/printing.md](references/printing.md). Overview:

### White Model Print Pipeline

| Step | Action | Credits | Notes |
|------|--------|---------|-------|
| 1 | Detect installed slicers | 0 | `scripts/slicers.py detect` |
| 2 | Generate untextured model | 5–20 | Text to 3D or Image to 3D (`should_texture: false`) |
| 3 | Download OBJ | 0 | OBJ format for slicer compatibility |
| 4 | Fix OBJ for printing | 0 | `scripts/fix_obj.py` coordinate conversion |
| 5 | Open in slicer | 0 | `scripts/slicers.py open` |

### Multicolor Print Pipeline

| Step | Action | Credits | Notes |
|------|--------|---------|-------|
| 1 | Detect slicers + check multicolor | 0 | Warn if no multicolor slicer |
| 2 | Generate 3D model | 20 | Text to 3D or Image to 3D |
| 3 | Add textures | 10 | Refine or Retexture (REQUIRED) |
| 4 | Multi-color processing | 10 | `POST /openapi/v1/print/multi-color` |
| 5 | Poll until SUCCEEDED | 0 | `meshy_task.py poll` |
| 6 | Download 3MF | 0 | From `model_urls["3mf"]` |
| 7 | Open in multicolor slicer | 0 | `scripts/slicers.py open` |
| **Total** | | **40** | |

### Creative Lab Consumer Products

Ready-to-print styled products from a single photo: **figure**, **lamp**, **keychain**, **fridge-magnet**. Two stages: **prototype** (6 credits) → **build** (30 credits). See [references/printing.md](references/printing.md) for the full flow, including how to multicolor a Creative Lab result.

### Mesh Utilities for Printing

- **Convert** (`POST /openapi/v1/convert`, 1 credit): get a printable **STL** or **3MF** from an existing GLB/OBJ result without remeshing — cheaper and faster than re-running generation with `target_formats`.
- **Resize** (`POST /openapi/v1/resize`, 1 credit): set a real-world size before slicing (exactly one of `resize_height` / `resize_longest_side` / `auto_size`). An alternative to `fix_obj.py`'s scaling when you want the API to handle it.
- **UV Unwrap** (`POST /openapi/v1/uv-unwrap`, 5 credits): clean **GLB "UV white model"** before externally painting for a multicolor print. **GLB only, ≤ 40,000 faces** — remesh down first if larger.

---

## Key Rules for Print Workflow

- **Always detect slicer first** and report results to the user before proceeding
- **Always run analyze (FREE)** for production / functional prints, miniatures with thin features, mechanical parts
- **Repair is conditional**: only when analyze status = error, or warning if the user cares about quality
- **White model**: Download OBJ format, apply `scripts/fix_obj.py` for coordinate conversion
- **Multicolor**: The multi-color API outputs 3MF directly — no coordinate conversion needed (3MF uses Z-up natively)
- **3MF for multicolor**: The Multi-Color Print API outputs 3MF directly — no need to request 3MF from generate/refine via `target_formats`. For non-print use cases that need 3MF, pass `"3mf"` in `target_formats` at generation time.
- **For multicolor, verify slicer supports it** before proceeding with the (costly) pipeline
- After opening in slicer, remind user to check print settings (layer height, infill, supports)
- **If OBJ is not available**: Download GLB and guide user to import manually
- **Repair caveat**: textures are NOT preserved. For a multicolor print on a model that needs repair, run repair first, then re-texture, then multicolor.

---

## Additional Resources

For the complete API endpoint reference, read [reference.md](reference.md). For pipeline walkthroughs and the manual print-quality checklist, read [references/printing.md](references/printing.md). For API errors, see the generation skill's `references/troubleshooting.md`.
