# Changelog

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
