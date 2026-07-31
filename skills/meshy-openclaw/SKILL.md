---
name: meshy-openclaw
description: Generate 3D models, textures, images, rig characters, animate them, and prepare for 3D printing using the Meshy AI API. Handles API key detection, task creation, polling, downloading, and full 3D print pipeline with slicer integration. Use when the user asks to create 3D models, convert text/images to 3D, texture models, rig or animate characters, 3D print a model, or interact with the Meshy API. For Claude Code or Cursor, use the meshy-3d-generation and meshy-3d-printing skills instead.
license: MIT-0
compatibility: Requires Python 3 with requests package. Compatible with OpenClaw and all Agent Skills tools.
metadata:
  author: meshy-dev
  version: "0.4.1"
  homepage: https://github.com/meshy-dev/meshy-3d-agent
  openclaw:
    primaryEnv: MESHY_API_KEY
    requires:
      env:
        - MESHY_API_KEY
      bins:
        - python3
        - curl
    install:
      - kind: uv
        package: requests
allowed-tools: Bash, Write
---

# Meshy 3D — Generation + Printing

Directly communicate with the Meshy AI API to generate and print 3D assets. Covers the complete lifecycle: API key setup, task creation, exponential backoff polling, downloading, multi-step pipelines, and 3D print preparation with slicer integration.

---

## SECURITY MANIFEST

**Environment variables accessed:**
- `MESHY_API_KEY` — API authentication token sent in HTTP `Authorization: Bearer` header only. Never logged, never written to any file except `.env` in the current working directory when explicitly requested by the user.

**External network endpoints:**
- `https://api.meshy.ai` — Meshy AI API (task creation, status polling, model/image downloads)

**File system access:**
- Read: `.env` / `.env.local` in the current working directory only (API key lookup)
- Write: `.env` in the current working directory only (API key storage, only on user request)
- Write: `./meshy_output/` in the current working directory (downloaded model files, metadata)
- Read: files explicitly provided by the user (e.g., local images passed for image-to-3D conversion), accessed only at the exact path the user specifies
- No access to home directories, shell profiles, or any path outside the above

**Data leaving this machine:**
- API requests to `api.meshy.ai` include the `MESHY_API_KEY` in the Authorization header and user-provided text prompts or image URLs. No other local data is transmitted. Downloaded model files are saved locally only.

---

All paths below are relative to **this skill's own directory** (the directory containing this SKILL.md). Resolve them before running.

| Resource | When to use |
|---|---|
| `scripts/meshy_task.py` | Bundled CLI for every Meshy API call (create / poll / download / record / …) |
| `scripts/slicers.py` | Detect installed slicers; open a model file in a slicer |
| `scripts/fix_obj.py` | Fix OBJ coordinate system, scale, and origin for slicers |
| [reference.md](reference.md) | Full API reference: every parameter, response schema, error code |
| [references/setup.md](references/setup.md) | API key setup — read when Step 0 finds no key |
| [references/pipelines.md](references/pipelines.md) | Generation recipes: exact payloads + script calls per endpoint |
| [references/printing.md](references/printing.md) | Print pipeline walkthroughs: slicer detection, analyze/repair, white model, multicolor, Creative Lab |
| [references/troubleshooting.md](references/troubleshooting.md) | Error recovery trees and task failure messages |

---

## IMPORTANT: First-Use Session Notice

When this skill is first activated in a session, inform the user:

> All generated files will be saved to `meshy_output/` in the current working directory. Each project gets its own folder (`{YYYYMMDD_HHmmss}_{prompt}_{id}/`) with model files, textures, thumbnails, and metadata. History is tracked in `meshy_output/history.json`.

This only needs to be said **once per session**.

---

## IMPORTANT: File Organization

All downloaded files MUST go into a structured `meshy_output/` directory in the current working directory. **Do NOT scatter files randomly.**

- Each project: `meshy_output/{YYYYMMDD_HHmmss}_{prompt_slug}_{task_id_prefix}/`
- Chained tasks (preview → refine → rig) reuse the same `project_dir`
- Track tasks in `metadata.json` per project, and global `history.json`
- Auto-download thumbnails alongside models

The bundled CLI implements this: `project-dir`, `record`, and `thumbnail` subcommands.

---

## IMPORTANT: Shell Command Rules

Use only standard POSIX tools. Do NOT use `rg`, `fd`, `bat`, `exa`/`eza`.

---

## IMPORTANT: Run Long Tasks Properly

Meshy generation takes 1–5 minutes. Run each `poll` as a single Bash call and let it finish — the bundled CLI prints unbuffered progress in real time. Tasks sitting at 99% for 30–120s is normal finalization — do NOT interrupt. Pass a larger `--timeout` for heavy tasks instead of retrying.

---

## IMPORTANT: Never Rebuild Bundled Scripts

`scripts/meshy_task.py` is the single source of truth for `create_task` / `poll_task` / `download` / `get_project_dir` / `record_task` / `save_thumbnail`. **Never retype, paraphrase, or "reconstruct" these helpers from memory** — not even partially. Compose CLI calls in bash, or write a small Python script that does `sys.path.insert(0, "<this skill's scripts dir>")` and `from meshy_task import ...`.

---

## Step 0: API Key Detection (ALWAYS RUN FIRST)

**Only the current session environment and `.env` / `.env.local` in the current working directory are checked. Never scan home directories or shell profile files.**

```bash
python3 scripts/meshy_task.py check-env
```

### Decision After Detection

- **`READY: key=...`** → Proceed to Step 1.
- **`READY: NO_KEY_FOUND`** → Go to Step 0a.
- **`PYTHON_REQUESTS: MISSING`** → Run `pip install requests`.

---

## Step 0a: API Key Setup (Only If No Key Found)

Follow [references/setup.md](references/setup.md): create a key at https://www.meshy.ai/settings/api (Pro plan required), verify it against `GET /openapi/v1/balance`, and optionally persist it to `.env` in the current project (auto-added to `.gitignore`).

---

## Step 1: Confirm Plan With User Before Spending Credits

**CRITICAL**: Before creating any task, present the user with a cost summary and wait for confirmation:

```
I'll generate a 3D model of "<prompt>" using the following plan:

  1. Preview (mesh generation) — 20 credits
  2. Refine (texturing with PBR) — 10 credits
  3. Download as .glb

  Total cost: 30 credits
  Current balance: <N> credits

  Shall I proceed?
```

For multi-step pipelines (text-to-3d → rig → animate), show the FULL pipeline cost upfront.

> **Note:** Rigging automatically includes walking + running animations at no extra cost. Only add `Animate` (3 credits) for custom animations beyond those.

### Intent → API Mapping

| User wants to... | API | Endpoint | Credits |
|---|---|---|---|
| 3D model from text | Text to 3D | `POST /openapi/v2/text-to-3d` | 5–20 (preview) + 10 (refine) |
| 3D model from one image | Image to 3D | `POST /openapi/v1/image-to-3d` | 5–30 |
| 3D model from multiple images | Multi-Image to 3D | `POST /openapi/v1/multi-image-to-3d` | 5–30 |
| New textures on existing model | Retexture | `POST /openapi/v1/retexture` | 10 |
| Change mesh format/topology | Remesh | `POST /openapi/v1/remesh` | 5 |
| Convert a model to other formats (no remesh) | Convert | `POST /openapi/v1/convert` | 1 |
| Rescale a model to real-world size | Resize | `POST /openapi/v1/resize` | 1 |
| Generate fresh UVs (GLB, ≤40k faces) before external texturing | UV Unwrap | `POST /openapi/v1/uv-unwrap` | 5 |
| Add skeleton to character | Auto-Rigging | `POST /openapi/v1/rigging` | 5 |
| Animate a rigged character | Animation | `POST /openapi/v1/animations` | 3 |
| 2D image from text (recommended pre-step before image-to-3d) | Text to Image | `POST /openapi/v1/text-to-image` | 3 / 6 / 9 / 9 |
| Optimize/edit a 2D image (recommended pre-step before image-to-3d) | Image to Image | `POST /openapi/v1/image-to-image` | 3 / 6 / 9 / 12 |
| Photo → styled physical product (figure/lamp/keychain/fridge-magnet) | Creative Lab | `POST /openapi/creative-lab/{product}/v1/prototype` then `.../build` | 6 + 30 |
| Check FDM printability | Analyze Printability | `POST /openapi/v1/print/analyze` | **0 (free)** |
| Repair non-manifold/degenerate-face/hole topology | Repair Printability | `POST /openapi/v1/print/repair` | 10 |
| Multi-color 3D print | Multi-Color Print | `POST /openapi/v1/print/multi-color` | 10 (+ generation) |
| 3D print a model (white) | → See 3D Printing Workflow section | — | 20 |
| Check credit balance | Balance | `GET /openapi/v1/balance` | 0 |

---

## Step 2: Execute the Workflow

All generation endpoints return `{"result": "<task_id>"}`, NOT the model — you MUST poll. **NEVER** read `model_urls` from the POST response.

Every workflow is a sequence of calls to the bundled CLI `scripts/meshy_task.py` — do not write your own API code:

| Subcommand | Purpose |
|---|---|
| `check-env` | Step 0 environment report |
| `balance` | Current credit balance |
| `create --endpoint E (--payload JSON \| --payload-file F)` | Create a task; prints the new task ID |
| `poll --endpoint E --task-id ID [--timeout 300] [--project-dir D]` | Poll to completion; saves the task JSON into the project dir |
| `get --endpoint E --task-id ID [--save F]` | One-shot status / progress / face_count check |
| `download (--url U \| --task-json F [--format FMT]) --output PATH` | Stream-download a model file |
| `project-dir --task-id ID [--prompt P]` | Create + print the project folder path |
| `record --project-dir D --task-id ID --task-type T --stage S [--files "a,b"]` | Update `metadata.json` + `history.json` |
| `thumbnail --project-dir D (--url U \| --task-json F)` | Save the project thumbnail |
| `check-faces --endpoint E --task-id ID [--max-faces 300000]` | Pre-rigging polycount gate |

Follow the matching recipe in [references/pipelines.md](references/pipelines.md): **Text to 3D** (preview → refine), **Image to 3D**, **Multi-Image to 3D**, **Retexture**, **Remesh**, **Convert / Resize / UV Unwrap**, **Auto-Rigging + Animation** (t-pose + face-count gate), **Text/Image to Image**.

**2D Optimization Pre-Step (strongly recommended):** prefer the image-to-3d route over direct text-to-3d — for a text-only request, first make a design image via `/openapi/v1/text-to-image` (`nano-banana-pro`; characters: `generate_multi_view: true` + `pose_mode`), then 3D-ify. For low-quality reference images, clean up first via `/openapi/v1/image-to-image`. 3–9 extra credits typically buy a noticeable quality bump. Skip when the user provides a clean studio shot, and always skip for Creative Lab products (they stylize internally).

---

## 3D Printing Workflow

**IMPORTANT: When the user's request involves 3D printing, use this section for the ENTIRE workflow — including model generation.** Do NOT run the generation workflows above and then come here. This section controls `target_formats` and other print-specific parameters from the start.

Trigger when the user mentions: print, 3d print, slicer, slice, bambu, orca, prusa, cura, multicolor, multi-color, 3mf, figurine, miniature, statue, physical model, desk toy, phone stand.

### Decision: White Model vs Multicolor

1. **Detect installed slicers** first: `python3 scripts/slicers.py detect`
2. Ask the user: "White model (single-color) or multicolor?"
3. If **multicolor**: check for multicolor-capable slicer (OrcaSlicer, Bambu Studio, Creality Print, Elegoo Slicer, Anycubic Slicer Next), ask max_colors (1-16, default 4) and max_depth (3-6, default 4), confirm cost: 40 credits (+10 if repair is needed)
4. **(Recommended)** After generation, run a **printability analysis** (`POST /openapi/v1/print/analyze`, FREE). Run **`POST /openapi/v1/print/repair`** (10 credits) only if status = error.

Then follow the full walkthroughs in [references/printing.md](references/printing.md):

- **White Model Pipeline** (20 credits): generate untextured (`target_formats: ["obj"]`) → download OBJ → `scripts/fix_obj.py` (Y-up→Z-up, scale to mm, center, bottom at Z=0) → open in slicer
- **Multicolor Pipeline** (40 credits): generate + texture (refine/retexture REQUIRED) → multi-color API → download 3MF → open in multicolor slicer. The multi-color API outputs 3MF directly — no coordinate conversion, no `target_formats` needed at generation.
- **Creative Lab** (36 credits): photo → `prototype` (6) → `build` (30) → textured GLB, ready to print; multicolor via `model_url`.
- **Print-quality checklist** (wall thickness, overhangs, base stability, …) is in [references/printing.md](references/printing.md#manual-sanity-checks-in-addition-to-the-automated-analyze-api).

Key rules: always detect slicer first and report; always run the FREE analyze for production/functional prints; repair only on `error` (or `warning` when quality matters); repair does NOT preserve textures (repair → re-texture → multicolor); if OBJ is unavailable, download GLB and import manually; after opening in a slicer, remind the user to check print settings (layer height, infill, supports).

---

## Step 3: Report Results

After task succeeds:
1. Downloaded file paths and sizes
2. Task IDs (for follow-up: refine, rig, retexture)
3. Available formats (list `model_urls` keys)
4. Credits consumed + current balance (task JSON has `consumed_credits`; run `balance`)
5. Suggested next steps:
   - Preview done → "Want to refine (add textures)?"
   - Model done → "Want to rig this character?"
   - Rigged → "Want to apply a custom animation?"
   - Any textured model → "Want to 3D print this? Multicolor printing is available!"
   - Any model → "Want to 3D print this?"

---

## Error Recovery

On any failure, follow [references/troubleshooting.md](references/troubleshooting.md): HTTP status handling (401/402/422/429/5xx), retry policy, and known task `FAILED` messages. The bundled CLI auto-reports the current balance on 402 and exits non-zero with the server's error message on failure.

---

## Known Behaviors & Constraints

- **99% stall**: Normal finalization (30–120s). Do NOT interrupt.
- **Asset retention**: Files deleted after **3 days** (non-Enterprise). Download immediately.
- **PBR maps**: Must set `enable_pbr: true` explicitly.
- **Refine**: Works with `meshy-5`, `meshy-6`, or `latest` — pick the same family as your preview for consistency. 10 credits regardless of model. (`meshy-4` is retired → 400.)
- **Deprecated params**: `symmetry_mode` no longer affects output; `art_style` is ignored by Meshy-6; use `pose_mode` instead of the old `is_a_t_pose` flag.
- **`consumed_credits`**: Every task GET response includes `consumed_credits` — read it to report the real credits spent rather than estimating.
- **Rigging**: Humanoid bipedal only, polycount ≤ 300,000 (enforced by `check-faces`).
- **Printing formats**: White model → OBJ with `scripts/fix_obj.py`. Multicolor → 3MF from Multi-Color Print API. Always detect slicer first.
- **Download format**: Ask the user which format they need before downloading. GLB (viewing), OBJ (printing), 3MF (multicolor), FBX (games), USDZ (AR). Do NOT download all formats.
- **3MF for multicolor**: Multi-Color Print API outputs 3MF directly — no need to request 3MF from generate/refine. For non-print use cases needing 3MF, pass `"3mf"` in `target_formats`.
- **Timestamps**: All API timestamps are Unix epoch **milliseconds**.

---

## Execution Checklist

- [ ] Ran API key detection (`check-env`, Step 0) — checked env var and `.env` / `.env.local` only
- [ ] API key verified (never printed in full)
- [ ] Presented cost summary and got user confirmation
- [ ] Composed the workflow from bundled script calls (never retyped the helpers)
- [ ] Followed the matching recipe in references/pipelines.md or references/printing.md
- [ ] Reported file paths, formats, task IDs, and balance
- [ ] Suggested next steps

---

## Additional Resources

For the complete API endpoint reference including all parameters, response schemas, and error codes, read [reference.md](reference.md).
