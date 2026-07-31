---
name: meshy-3d-generation
description: Generate 3D models, textures, images, rig characters, and animate them using the Meshy AI API. Handles API key detection, setup, and all generation workflows via direct HTTP calls. Use when the user asks to create 3D models, convert text/images to 3D, texture models, rig or animate characters, or interact with the Meshy API. For 3D printing requests, use the meshy-3d-printing skill instead.
license: MIT
compatibility: Requires Python 3 with requests package. Works with Claude Code, Cursor, and all Agent Skills compatible tools.
metadata:
  author: meshy-dev
  version: "0.4.1"
  homepage: https://github.com/meshy-dev/meshy-3d-agent
allowed-tools: Bash, Read, Write, Glob, Grep
---

# Meshy 3D Generation

Directly communicate with the Meshy AI API to generate 3D assets. This skill handles the complete lifecycle: environment setup, API key detection, task creation, polling, downloading, and chaining multi-step pipelines.

All paths below are relative to **this skill's own directory** (the directory containing this SKILL.md). Resolve them before running.

| Resource | When to use |
|---|---|
| `scripts/meshy_task.py` | Bundled CLI for every API call and file operation (Step 2) |
| [reference.md](reference.md) | Full API reference: every parameter, response schema, error code |
| [references/setup.md](references/setup.md) | API key setup — read when Step 0 finds no key |
| [references/pipelines.md](references/pipelines.md) | Per-endpoint recipes: exact payloads + script calls for each workflow |
| [references/troubleshooting.md](references/troubleshooting.md) | Error recovery trees and task failure messages |

---

## IMPORTANT: 3D Printing → Use `meshy-3d-printing` Skill

**If the user's request involves 3D printing** (keywords: print, 3d print, slicer, slice, bambu, orca, prusa, cura, multicolor, 3mf, figurine, miniature, statue, physical model), **use the `meshy-3d-printing` skill instead of this one for the entire workflow.** The printing skill handles generation with correct print-optimized parameters (e.g. `target_formats` with `"3mf"` for multicolor), slicer detection, coordinate conversion, and slicer launch — all in one pipeline.

This skill's `scripts/meshy_task.py` is reused by the printing skill, but the **workflow orchestration** (what to generate, which formats, what to do after) must come from the printing skill when printing is involved.

**Do NOT generate a model with this skill and then hand off to the printing skill** — the printing skill needs to control parameters from the start (e.g. `target_formats`, `should_texture`).

---

## IMPORTANT: First-Use Session Notice

When this skill is first activated in a session, inform the user:

> All generated files will be saved to `meshy_output/` in the current working directory. Each project gets its own folder (`{YYYYMMDD_HHmmss}_{prompt}_{id}/`) with model files, textures, thumbnails, and metadata. History is tracked in `meshy_output/history.json`.

This only needs to be said **once per session**, at the beginning.

## IMPORTANT: File Organization

All downloaded files MUST go into a structured `meshy_output/` directory in the current working directory. **Do NOT scatter files randomly.**

- Each project gets its own folder: `meshy_output/{YYYYMMDD_HHmmss}_{prompt_slug}_{task_id_prefix}/`
- For chained tasks (preview → refine → rig), reuse the same `project_dir`
- Track tasks in `metadata.json` per project, and global `history.json`
- Auto-download thumbnails alongside models

The bundled CLI implements this: `project-dir`, `record`, and `thumbnail` subcommands.

---

## IMPORTANT: Shell Command Rules

**Use only standard POSIX tools in shell commands.** Do NOT use `rg` (ripgrep), `fd`, or other non-standard CLI tools — they may not be installed. Use these standard alternatives instead:

| Do NOT use | Use instead |
|---|---|
| `rg` | `grep` |
| `fd` | `find` |
| `bat` | `cat` |
| `exa` / `eza` | `ls` |

---

## IMPORTANT: Run Long Tasks Properly

Meshy generation tasks take 1–5 minutes. When polling for completion:

- The bundled CLI prints unbuffered progress in real time — run each `poll` as a single Bash call and let it finish.
- Be patient with long-running polls — do NOT interrupt or kill them prematurely. Tasks at 99% for 30–120s is normal finalization, not a failure.
- Pass a larger `--timeout` (e.g. `--timeout 600`) for heavy tasks instead of retrying a timed-out poll.

---

## IMPORTANT: Never Rebuild Bundled Scripts

`scripts/meshy_task.py` is the single source of truth for `create_task` / `poll_task` / `download` / `get_project_dir` / `record_task` / `save_thumbnail`. **Never retype, paraphrase, or "reconstruct" these helpers from memory** — not even partially. Compose CLI calls in bash, or write a small Python script that does `sys.path.insert(0, "<this skill's scripts dir>")` and `from meshy_task import ...`. Reimplementing them inline causes silent behavior drift and doubles the token cost of every run.

---

## Step 0: Environment Detection (ALWAYS RUN FIRST)

Before any API call, run the bundled environment check:

**Only check the current session environment and `.env` files in the current working directory. Do NOT scan home directories or shell profile files.**

```bash
python3 scripts/meshy_task.py check-env
```

It reports `ENV_VAR` (current environment), `DOTENV` (`.env` / `.env.local` in the working directory), `PYTHON_REQUESTS`, and a final `READY:` line. The bundled CLI loads the key itself (env var → `.env` → `.env.local`), so no manual `export` is needed to use it.

### Decision After Detection

- **`READY: key=...`** → Proceed to Step 1.
- **`READY: NO_KEY_FOUND`** → Go to Step 0a.
- **`PYTHON_REQUESTS: MISSING`** → Run `pip install requests`.

## Step 0a: API Key Setup (Only If No Key Found)

Follow [references/setup.md](references/setup.md). It walks the user through creating a key at https://www.meshy.ai/settings/api (Pro plan required), setting it for the **current session only**, and verifying it against `GET /openapi/v1/balance`.

**Never persist the key yourself** — no shell profiles, no Windows user environment variables, no file outside the current working directory. The only exception is `.env` in the working directory, and only when the user explicitly asks. Otherwise print the persistence instructions and let the user apply them.

---

## Step 1: Confirm Plan With User Before Spending Credits

**CRITICAL**: Before creating any task, present the user with a summary and get confirmation:

```
I'll generate a 3D model of "<prompt>" using the following plan:

  1. Preview (mesh generation) — 5-20 credits (meshy-6/lowpoly: 20, others: 5)
  2. Refine (texturing with PBR) — 10 credits
  3. Download as .glb

  Total cost: 30 credits
  Current balance: <N> credits

  Shall I proceed?
```

For multi-step pipelines (e.g., text-to-3d → rig → animate), present the FULL pipeline cost upfront:

| Step | API | Credits |
|---|---|---|
| Preview | Text to 3D | 20 |
| Refine | Text to 3D | 10 |
| Rig | Auto-Rigging | 5 |
| **Total** | | **35** |

> **Note:** Rigging automatically includes basic walking + running animations for free (in `result.basic_animations`). Only add `Animate` (3 credits) if the user needs a custom animation beyond walking/running.

Wait for user confirmation before executing.

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
| Add skeleton to character | Auto-Rigging | `POST /openapi/v1/rigging` | 5 (includes walking + running) |
| Animate a rigged character (custom) | Animation | `POST /openapi/v1/animations` | 3 |
| 2D image from text (recommended pre-step before image-to-3d) | Text to Image | `POST /openapi/v1/text-to-image` | 3 / 6 / 9 / 9 |
| Optimize/edit a 2D image (recommended pre-step before image-to-3d) | Image to Image | `POST /openapi/v1/image-to-image` | 3 / 6 / 9 / 12 |
| Check FDM printability (watertight / non-manifold edges / holes) | Analyze Printability | `POST /openapi/v1/print/analyze` | **0 (free)** |
| Repair non-manifold/degenerate-face/hole topology | Repair Printability | `POST /openapi/v1/print/repair` | 10 |
| Multi-color 3D print | Multi-Color Print | `POST /openapi/v1/print/multi-color` | 10 |
| Stylized printable product from a photo (figure / lamp / keychain / fridge-magnet) | Creative Lab — **see the `meshy-3d-printing` skill** for the full prototype→build flow | `POST /openapi/creative-lab/{product}/v1/{prototype,build}` | 36 (6+30) |
| Check credit balance | Balance | `GET /openapi/v1/balance` | 0 |

---

## Step 2: Execute the Workflow

### CRITICAL: Async Task Model

All generation endpoints return `{"result": "<task_id>"}`, NOT the model. You MUST poll.

**NEVER** read `model_urls` from the POST response.

### The Bundled CLI: `scripts/meshy_task.py`

Every workflow is a sequence of calls to the bundled CLI — do not write your own API code:

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

### Pick the Workflow

Follow the matching recipe in [references/pipelines.md](references/pipelines.md) — each lists the exact payload options and the full create → poll → download → record call sequence:

- **Text to 3D** (preview → refine) — the default for "make a 3D model of X"
- **Image to 3D** / **Multi-Image to 3D**
- **Retexture** / **Remesh**
- **Convert / Resize / UV Unwrap** (lightweight mesh utilities)
- **Auto-Rigging + Animation** — requires t-pose + a face-count gate; rigging includes walking/running for free
- **Text to Image** / **Image to Image** — see the 2D pre-step below

### (Optional but strongly recommended) 2D Optimization Pre-Step

**Prefer the image-to-3d route over direct text-to-3d** — it's higher quality and more controllable, so for a text-only request make a design image first, then 3D-ify.

Image quality directly determines 3D model quality. Before calling `/openapi/v1/image-to-3d` or `/openapi/v1/multi-image-to-3d`, evaluate the user's input and proactively suggest a 2D pass:

| User input | Recommended pre-step |
|---|---|
| Only a text description, no reference image | `/openapi/v1/text-to-image` with `nano-banana-pro`. For characters add `generate_multi_view: True` and `pose_mode: "a-pose"` or `"t-pose"` for rig-friendly output. |
| Reference image is low-resolution / cluttered background / unclear subject / bad lighting | `/openapi/v1/image-to-image` with `nano-banana-pro` to clean up (remove background, raise resolution, normalize lighting, fill occlusions). |
| User wants to adjust style / colors / details | `/openapi/v1/image-to-image` for style transfer, then 3D-ify. |

The optimized image URL feeds directly into `/openapi/v1/image-to-3d`'s `image_url`. **3-9 extra credits typically buy a noticeable quality bump**, and downstream `refine` / texture-on-mesh stages benefit too.

**Skip when**: the user already provided a clean front-facing studio shot — go straight to image-to-3d. Also skip for **Creative Lab** products (figure / lamp / keychain / fridge-magnet): they apply their own built-in stylization, so feed the raw photo (or text, for lamp) straight to Creative Lab — do not pre-generate a design image.

---

## Step 3: Report Results

After task succeeds, report:

1. **Downloaded file paths** and sizes
2. **Task IDs** (for follow-up operations like refine, rig, retexture)
3. **Available formats** (list `model_urls` keys — may include glb, fbx, obj, usdz, 3mf)
4. **Thumbnail URL** if present
5. **Credits consumed** and remaining balance (run `balance`; each task JSON also has `consumed_credits`)
6. **Suggested next steps**:
   - Preview done → "Want to refine (add textures)?"
   - Model done → "Want to rig this character for animation?"
   - Rigged → "Want to apply an animation?"
   - Any model → "Want to remesh / export to another format?"
   - Any textured model → "Want to 3D print this? Multicolor printing is available!" (requires `meshy-3d-printing` skill)
   - Any model → "Want to 3D print this model?" (requires `meshy-3d-printing` skill)

---

## Error Recovery

On any failure, follow [references/troubleshooting.md](references/troubleshooting.md): HTTP status handling (401/402/422/429/5xx), retry policy, and known task `FAILED` messages. The bundled CLI already auto-reports the current balance on 402 and exits non-zero with the server's error message on failure.

---

## Known Behaviors & Constraints

- **99% progress stall**: Tasks commonly sit at 99% for 30–120s during finalization. This is normal. Do NOT kill or restart.
- **CORS**: API blocks browser requests. Always server-side.
- **Asset retention**: Files deleted after **3 days** (non-Enterprise). Download immediately.
- **PBR maps**: Must set `enable_pbr: true` explicitly.
- **Format availability**: Check keys in `model_urls` before downloading — not all formats are always present (the `poll` summary lists them). 3MF is available from the Multi-Color Print API.
- **Download format**: ALWAYS ask the user which format they need before downloading. Recommend: GLB (viewing), OBJ (white model printing), 3MF (multicolor printing), FBX (game engines), USDZ (AR). Do NOT download all formats.
- **3MF format**: 3MF is NOT included in default output of generation endpoints. To get 3MF, pass `"3mf"` in `target_formats` on generate/refine/remesh/retexture, or use the Convert API (`POST /openapi/v1/convert`, 1 credit). For multicolor 3D printing, the Multi-Color Print API outputs 3MF directly — no need to request it from generate/refine.
- **Deprecated params**: `symmetry_mode` no longer affects output; `art_style` is ignored by Meshy-6; use `pose_mode` instead of the old `is_a_t_pose` flag. `meshy-4` is retired (returns 400).
- **`consumed_credits`**: Every task GET response includes `consumed_credits` — read it to report the real credits spent rather than estimating.
- **Timestamps**: All API timestamps are Unix epoch **milliseconds**.
- **Large files**: Refined models can be 50–200 MB. The CLI streams downloads with timeouts; just be patient.

---

## Execution Checklist

- [ ] Ran environment detection (`check-env`, Step 0)
- [ ] API key present and verified
- [ ] Presented cost summary and got user confirmation
- [ ] Composed the workflow from bundled `scripts/meshy_task.py` calls (never retyped the helpers)
- [ ] Followed the matching recipe in [references/pipelines.md](references/pipelines.md)
- [ ] Reported file paths, formats, task IDs, and balance
- [ ] Suggested next steps
