# Changelog

## [0.5.1] - Development candidate

### Changed

- Generation and printing now pin **Meshy CLI 0.4.0** (runner, setup, troubleshooting, validator,
  CI and contract tests). Every command still passes `--output-schema v1 --format json
  --no-update-check` and reads only stdout JSON and the `Enter code … at …` stderr line; 0.4.0
  changes the terminal view only, and the auth shapes, `auth status` ignoring `--api-key-file`,
  and the exit codes are unchanged (verified against the published package).
- The Node.js floor is **22.12**, not 24 — the CLI's own `engines` since 0.3.2. Agents on Node 22
  no longer stop and ask the user to upgrade. CI now runs the suite on Node 22.12.

## [0.5.0] - Development candidate

### Added (first-run and delivery experience)

- One sentence starts the job: the skills resolve the runner, reuse an existing session, and —
  when there is none — run `meshy auth login --device` as a live process, show the verification
  URL and code as soon as the CLI prints them, and resume the original request once the session
  verifies. No API key, token or task ID is ever copied by hand.
- No global CLI required: with Node 24+ the pinned package runs temporarily through
  `npm exec --yes --package=meshy-cli@0.3.0 -- meshy …`, verified for entry point, flag and
  exit-code forwarding, and credential reuse across working directories.
- The user's requested path wins. `WORKSPACE`/`PROJECT_ROOT` are resolved from the request and
  `./meshy_output` is only the default; every writing command still carries the workspace
  boundary, and out-of-boundary, symlink and overwrite protection is unchanged.
- Previews are part of delivery: the task's thumbnail is downloaded, looked at and shown, an
  earlier stage's preview is reused when a post-processing task has none, and a missing preview
  is stated rather than implied. A rendered PNG is never called an interactive 3D viewer.
- Follow-ups ("a 1500-face LOD", "now as FBX") locate the existing task or asset through the
  session, the project index or a resource listing, and run only the missing step.
- Estimates come from `meshy make --dry-run` or the dated published price list — never from the
  balance, and never from an invented command.
- Printing gained a local-only route: preparing an existing OBJ or opening a 3MF triggers no
  authentication, no balance check and no generation, and "figurine" alone no longer implies
  Creative Lab.

### Changed

- Rebuilt generation and printing from the 0.4.1 baseline around Meshy CLI 0.3.0;
  removed their bundled Python runtime and duplicated API manuals.
- Prefer one browser login, shared CLI profiles and automatic token refresh. Existing
  API-key environments remain supported. Printing is independently installable.
- Use async task IDs, resource-specific waits, explicit workspaces and selective downloads.
- Added isolated auth, runner and recipe tests against the real CLI on loopback. No live-host
  certification is implied.
- SKILL.md frontmatter carries only name, description and license; the release version lives
  in the plugin manifests.
- OpenClaw remains the separate 0.4.1 Python skill; its runtime is outside this change.

## [Unreleased — historical 0.4.1 baseline notes]

### Fixed (API facts that were making agents do the wrong thing)

Every change below is sourced from the public docs at `docs.meshy.ai` or from the public, unauthenticated Animation Library endpoint. Verified 2026-08-08.

- **Animation was a dead end.** The Animation recipe said `"action_id": 1  # from Animation Library` and gave no way to find a real ID, so an agent asked for "make it wave" had nowhere to go. The reference and the pipeline recipe now point at the public catalog — `GET https://api.meshy.ai/web/public/animations/resources`, no API key, 680 actions, `?category=` (`WalkAndRun` / `BodyMovements` / `DailyActions` / `Fighting` / `Dancing`) to keep the payload small — with a working lookup snippet and the fields carried on each entry (`id` = `action_id`, `name`, `subCategory`, `previewUrl` GIF, …). The docs' own Animation Library Reference page points at this same endpoint. Also flagged: IDs are **not** a `1..N` range (the catalog contains `-2`, `-1`, `0`), so the old hardcoded `1` was never "the first animation" — don't guess one.
- **`model_type: "lowpoly"` is deprecated; `"smart-topology"` was missing entirely.** Image to 3D now documents `standard` / `smart-topology` / `lowpoly` (deprecated — "We recommend using `smart-topology` instead"), the `ai_model` values that go with each (`meshy-t2`, default and recommended, honours `target_polycount`; `meshy-t1` does not), and both mutual-exclusion rules including the previously missing `save_pre_remeshed_model`. Scoped correctly: `smart-topology` exists on **Image to 3D only** — Text to 3D still has just `standard`/`lowpoly`, and Multi-Image to 3D has no `model_type` parameter at all.
- **`hd_texture` is deprecated.** Replaced with `texture_resolution` (`"2k"` default / `"4k"` / `"8k"`) across text-to-3d refine, image-to-3d, multi-image-to-3d, and retexture, including the precedence rule (`texture_resolution` wins when both are set), the `meshy-5` restriction, and the no-emission-map-at-`8k` caveat.
- **Rigging examples fed it untextured meshes.** The docs support *textured* humanoid models and list untextured meshes as unsupported, but the recipe rigged a bare `TASK_ID` with a text-to-3d **preview** in scope. The rigging section now leads with a preconditions block (textured input, bipedal humanoid, ≤300k faces via `input_task_id` else `400 Face count exceeded`, `model_url` models must face **+Z**, t-pose decided at generation time) and a source→"rig this task ID" table that routes text-to-3d through **refine**. The 300k limit and the humanoid restriction are now in SKILL.md, not only in the reference.
- **`multi_view_thumbnails` was invisible where it mattered.** It appeared only in `reference.md`, so agents downloaded a 50–200 MB GLB just to look at a result. It is now in every SKILL.md as the default inspection move, with what it returns (`thumbnail_urls`: front / right / back / left, 512×512 PNG) and its ~3s latency cost.
- **Failed tasks are free.** `consumed_credits` returns `0` for `FAILED` tasks — credits are refunded — so a transient failure is a lost wait, not lost money, and can be retried without re-asking the user to approve the spend. Documented in the reference, the error-handling section, and both SKILL.md files.
- **Error codes now name the rigging cases**: `400` covers `Face count exceeded`, and `422` is pose estimation failing (non-humanoid, untextured, or not facing +Z).

### Changed (internal restructure — no behavior or content changes for end users)

- **SKILL.md split**: all three skills (`meshy-3d-generation`, `meshy-3d-printing`, `meshy-openclaw`) now have a ≤300-line `SKILL.md` (frontmatter, flow overview, decision trees, per-round UX rules) with detail moved into per-skill `references/` docs (`setup.md`, `pipelines.md`, `printing.md`, `troubleshooting.md` as applicable). Content was moved verbatim.
- **Bundled scripts**: the inline Python template (`create_task` / `poll_task` / `download` / `get_project_dir` / `record_task` / `save_thumbnail`) is now a real CLI, `scripts/meshy_task.py`, inside each skill. The printing slicer detection / OBJ-fix snippets are `scripts/slicers.py` and `scripts/fix_obj.py`. SKILL.md files now state the explicit rule: never retype or reconstruct bundled scripts from memory.
- **Single-source `reference.md`**: the three hand-drifted copies are merged into `reference/source.md`; `scripts/build.py` regenerates each skill's `reference.md` (the OpenClaw build injects the SECURITY MANIFEST extracted from its SKILL.md). `python3 scripts/build.py --check` validates freshness, the ≤300-line limit, and that every `references/*.md` is linked from its SKILL.md. Drift resolved in the merge: kept the model-specific `aspect_ratio` notes, the retexture alias note, the fuller analyze/repair JSON examples, and the `model_url` option for multi-color; dropped the redundant trailing "Print Automation APIs" section.
- The OpenClaw SECURITY MANIFEST now reads `.env` / `.env.local` (was: `.env` only), matching the bundled CLI's key lookup.

## [0.4.1] - 2026-07-31

### Fixed

- **README manual install no longer breaks relative links.** The Claude Code / Cursor steps previously copied `SKILL.md` and `reference.md` as two unrelated flat files (`.claude/skills/meshy-3d-generation.md` + `.claude/skills/meshy-reference.md`), which broke the `[reference.md](reference.md)` links inside the skill. The steps now install each skill as a directory (`.claude/skills/meshy-3d-generation/{SKILL.md,reference.md}`, same for Cursor), matching the current Agent Skills directory convention so every relative link resolves.
- **Skills no longer write the API key to shell profiles or system env.** `meshy-3d-generation` Step 0a previously had the agent append the key to `~/.zshrc` / `~/.bashrc` and set Windows user environment variables — putting the key into shell history, the agent transcript, and long-lived config simultaneously, and contradicting the `meshy-openclaw` SECURITY MANIFEST ("No access to home directories, shell profiles"). All three skills now share the openclaw posture: the agent sets the key for the current session only, may write `.env` in the current working directory only on explicit user request, and otherwise prints persistence instructions for the user to apply themselves. Step 0 detection no longer scans shell profile files.
- **Version drift pinned.** All three SKILL.md frontmatters now declare the same version (`meshy-openclaw` previously had no `version` field and its `name` did not match its directory), aligned with the top of this CHANGELOG and with every plugin manifest. The README Windows setup no longer shows a `setx` command for the key; it points at the Environment Variables GUI instead.

### Added

- **Plugin manifests for Claude Code and Cursor.** `.claude-plugin/plugin.json` + `.claude-plugin/marketplace.json` and `.cursor-plugin/plugin.json`. Each marketplace entry pins an exclusive `skills` path so any single skill directory can be installed on its own. `.gitignore` previously ignored `.claude-plugin/`, which would have made the manifests uncommittable. Verified by installing all three skills through `claude plugin marketplace add` / `claude plugin install`: each plugin exposes exactly its own skill.
- **Codex install documented via `.agents/skills`.** Codex discovers skills from `.agents/skills` (per repo) and `~/.agents/skills` (user-wide) — the cross-editor convention Cursor also reads — so the directory install in the README covers it. A `.codex-plugin/plugin.json` was written and then removed: Codex's plugin marketplace only accepts a plugin root in a subdirectory carrying its own real `skills/` tree, and both cheap workarounds (a `skills` symlink, or a `"../skills"` path in the manifest) install **zero** skills while still reporting success. Shipping that manifest would have meant either committing a second copy of every skill or leaving users with a plugin that reports "installed" and does nothing.
- **`validate-skills` CI (`scripts/validate_skills.py`), five checks on every PR and push to `main`:** ① frontmatter `name` matches the directory, `metadata.version` is semver, and `description` carries both a trigger phrase and a routing boundary; ② version stays in sync across both manifests, every `SKILL.md`, and the top CHANGELOG entry; ③ the marketplace and Codex skill lists cover exactly the `skills/` directory set; ④ references are bidirectional — every relative link resolves and every non-`SKILL.md` markdown file is reachable from `SKILL.md`; ⑤ no `..` path segments, so each skill directory stays independently installable. Check ④ is what would have caught the broken-install-link bug above.

## [0.4.0] - 2026-06-24

### Added

- **New API endpoints** documented across `meshy-3d-generation`, `meshy-3d-printing`, and `meshy-openclaw` (SKILL.md + reference.md):
  - `POST /openapi/v1/convert` (1 credit) — convert a model to other formats (glb/fbx/obj/usdz/blend/stl/3mf) without remeshing. Cheapest way to get an STL/3MF.
  - `POST /openapi/v1/resize` (1 credit) — rescale to a real-world size: exactly one of `resize_height` / `resize_longest_side` / `auto_size`, optional `origin_at`.
  - `POST /openapi/v1/uv-unwrap` (5 credits, GA) — generate fresh UVs for a GLB (≤ 40,000 faces, else 400 → remesh first); outputs a GLB "UV white model" for external texturing.
  - **Creative Lab** (`POST /openapi/creative-lab/{product}/v1/prototype` 6 credits → `.../build` 30 credits) for figure / lamp / keychain / fridge-magnet. Documented primarily in `meshy-3d-printing` (physical products) and in `meshy-openclaw`. Build requires an API-created prototype of the same product (web-app prototypes return 404).
- **New generation parameters** in the reference tables: `hd_texture` (4K base color, meshy-6/latest only), `decimation_mode` (1–4 adaptive polycount), `auto_size` + `origin_at`, `alpha_thumbnail` (RGBA preview → `alpha_thumbnail_url`), `multi_view_thumbnails` (image/multi-image only), and `input_task_id` chaining for image-to-3d / multi-image-to-3d off a text-to-image / image-to-image result.
- **New 2D image models**: text-to-image and image-to-image now list `nano-banana-2` and `gpt-image-2` alongside `nano-banana` / `nano-banana-pro`.
- Every task GET response now documents `consumed_credits` so agents can report real spend.

### Changed

- **Refine fact-fix**: refine works with `meshy-5`, `meshy-6`, or `latest` (= Meshy 6); pick the same family as your preview for consistency. Removed contradictory claims (the old "meshy-6 previews do NOT support refine" / mismatch caveats). Refine is 10 credits regardless of model.
- **3MF fact-fix**: 3MF is supported but NOT included by default — request it via `target_formats: ["3mf"]`, the Convert API, or the Multi-Color Print API (always 3MF).
- **Pricing sync** to the authoritative price list: Text-to-Image (nano-banana 3 / nano-banana-2 6 / nano-banana-pro 9 / gpt-image-2 9), Image-to-Image (3 / 6 / 9 / 12), Convert 1, Resize 1, UV Unwrap 5, Creative Lab prototype 6 / build 30.
- **Deprecations** noted where the params appear: `symmetry_mode` no longer affects output; `art_style` is ignored by Meshy-6; `is_a_t_pose` superseded by `pose_mode`; `meshy-4` is retired (returns 400).

### Internal

- Frontmatter version bumped to `0.4.0` on `meshy-3d-generation` (was 1.0.0) and `meshy-3d-printing` (was 0.3.0). `meshy-openclaw` has no frontmatter `version` field, so only its content was updated.

## [0.3.0] - 2026-05-09

### Added

- **Printability automation suite** across all three skills (`meshy-3d-generation`, `meshy-3d-printing`, `meshy-openclaw`):
  - `POST /openapi/v1/print/analyze` (FREE) — FDM printability check (watertightness, volume, non-manifold edges, degenerate faces, holes)
  - `POST /openapi/v1/print/repair` (10 credits) — topology repair; output format mirrors input
  - `POST /openapi/v1/print/multi-color` (10 credits) — now accepts `model_url` in addition to `input_task_id`
- **2D optimization pre-step** — recommended workflow before image-to-3d when the user supplies low-quality references or a text-only prompt: `text-to-image` (`nano-banana-pro`, optional `generate_multi_view` + `pose_mode` for characters) or `image-to-image` (background removal / upscale / lighting normalization / style transfer). 3–9 extra credits typically buy a meaningful 3D-quality lift; documented in all three SKILL.md files.

### Changed

- `meshy-3d-printing` SKILL frontmatter version bumped 0.2.0 → 0.3.0; print pipeline rewritten as `generate → analyze (FREE) → repair? → multicolor? → download → send_to_slicer` to leverage the new automated printability check
- The "Printability Checklist (Manual Review)" + "Coming Soon: Printability Analysis & Fix API" sections in `meshy-3d-printing` are replaced by the real automated check; the manual checklist now covers only print-quality concerns the API doesn't (wall thickness, overhangs, base stability)
- `meshy-openclaw` printing section adds analyze/repair steps while preserving the SECURITY MANIFEST and `metadata.openclaw` frontmatter
- Intent-mapping table in `meshy-3d-generation` and `meshy-openclaw` lists the three new print endpoints
- Pricing summary in all three `reference.md` files lists `analyze` (FREE) and `repair` (10 credits)
- Retexture section in all three `reference.md` files clarifies that the historical "text-to-texture" name redirects to retexture and there is no separate `/openapi/v1/text-to-texture` endpoint

### Internal

- Bumped repo version to v0.3.0 (the `meshy-3d-generation` skill keeps its 1.0.0 internal version since its own surface area didn't change beyond doc updates)
- This is the first time skill release ships a CHANGELOG; future entries will follow the same semver-style structure as the MCP server release CHANGELOG

## [0.2.0] - prior

Initial multi-skill release (meshy-3d-generation, meshy-3d-printing, meshy-openclaw) with multicolor printing, slicer detection, and OpenClaw / ClawHub bundle.
