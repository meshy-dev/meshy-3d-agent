# Changelog

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
