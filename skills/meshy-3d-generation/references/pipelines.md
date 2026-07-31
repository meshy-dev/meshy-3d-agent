# Generation Pipelines (meshy-3d-generation)

Per-endpoint recipes built from the bundled CLI `scripts/meshy_task.py`. All paths are relative to this skill's directory (the parent of `references/`).

Conventions used below:

- `SKILL_DIR` = this skill's directory; examples write `scripts/meshy_task.py` for brevity — run them from the skill directory or prefix with `$SKILL_DIR/`.
- Payloads can be passed inline (`--payload '{"mode":"preview",...}'`) or written to a file and passed with `--payload-file payload.json` (preferred for large payloads).
- `create` prints the new task ID as its last stdout line → capture it with `TASK_ID=$(...)`.
- `poll --project-dir D` saves the full task JSON to `D/task_<id>.json` and prints a summary (`TASK_SUCCEEDED`, `MODEL_URLS: glb, fbx, ...`, `CONSUMED_CREDITS`).
- For the complete parameter lists, defaults, and response schemas, read [../reference.md](../reference.md).

---

## Text to 3D (Preview + Refine)

```bash
PROMPT="USER_PROMPT"  # max 600 chars

# --- Preview ---
PREVIEW_ID=$(python3 scripts/meshy_task.py create --endpoint /openapi/v2/text-to-3d --payload '{
  "mode": "preview",
  "prompt": "'"$PROMPT"'",
  "ai_model": "latest"
}')

PROJECT_DIR=$(python3 scripts/meshy_task.py project-dir --task-id "$PREVIEW_ID" --prompt "$PROMPT")
python3 scripts/meshy_task.py poll --endpoint /openapi/v2/text-to-3d --task-id "$PREVIEW_ID" --project-dir "$PROJECT_DIR"
python3 scripts/meshy_task.py download --task-json "$PROJECT_DIR/task_$PREVIEW_ID.json" --format glb --output "$PROJECT_DIR/preview.glb"
python3 scripts/meshy_task.py record --project-dir "$PROJECT_DIR" --task-id "$PREVIEW_ID" --task-type text-to-3d --stage preview --prompt "$PROMPT" --files preview.glb
python3 scripts/meshy_task.py thumbnail --project-dir "$PROJECT_DIR" --task-json "$PROJECT_DIR/task_$PREVIEW_ID.json"

# --- Refine ---
REFINE_ID=$(python3 scripts/meshy_task.py create --endpoint /openapi/v2/text-to-3d --payload '{
  "mode": "refine",
  "preview_task_id": "'"$PREVIEW_ID"'",
  "enable_pbr": true,
  "ai_model": "latest"
}')
python3 scripts/meshy_task.py poll --endpoint /openapi/v2/text-to-3d --task-id "$REFINE_ID" --project-dir "$PROJECT_DIR"
python3 scripts/meshy_task.py download --task-json "$PROJECT_DIR/task_$REFINE_ID.json" --format glb --output "$PROJECT_DIR/refined.glb"
python3 scripts/meshy_task.py record --project-dir "$PROJECT_DIR" --task-id "$REFINE_ID" --task-type text-to-3d --stage refined --prompt "$PROMPT" --files refined.glb
```

Common **preview** options (add to the payload):

- `"model_type": "standard" | "lowpoly"` — with `lowpoly`, `ai_model` / `topology` / `target_polycount` / `should_remesh` are ignored
- `"topology": "triangle"` (default) or `"quad"`
- `"target_polycount": 30000` — 100–300000
- `"should_remesh": false` — default false for Meshy 6, true for others
- `"pose_mode": "" | "a-pose" | "t-pose"` — use `"t-pose"` if rigging/animating later
- `"target_formats": ["glb", "3mf"]` — 3mf must be explicitly requested
- NOTE: `symmetry_mode` / `art_style` / `is_a_t_pose` are deprecated (symmetry_mode & art_style ignored; use pose_mode)

Common **refine** options:

- `"texture_prompt": ""` — extra guidance for texturing
- `"hd_texture": true` — 4K base color texture (meshy-6/latest only)
- `"remove_lighting": true` — remove baked lighting (meshy-6/latest only, default true)

> **Refine compatibility**: Refine works with `meshy-5`, `meshy-6`, or `latest` (= Meshy 6) — pick the same family as your preview for consistency. Refine costs 10 credits regardless of model. (`meshy-4` is retired and returns 400.)

---

## 2D Optimization Pre-Step (text-only request → design image → image-to-3d)

```bash
# 1. Generate a design image
IMG_ID=$(python3 scripts/meshy_task.py create --endpoint /openapi/v1/text-to-image --payload '{
  "ai_model": "nano-banana-pro",
  "prompt": "studio render of a sci-fi helmet, neutral background, even lighting",
  "aspect_ratio": "1:1"
}')
# For character meshes add: "generate_multi_view": true and "pose_mode": "a-pose" (or "t-pose")

python3 scripts/meshy_task.py poll --endpoint /openapi/v1/text-to-image --task-id "$IMG_ID" --project-dir "$PROJECT_DIR"
IMG_URL=$(python3 -c "import json;print(json.load(open('$PROJECT_DIR/task_$IMG_ID.json'))['image_urls'][0])")

# 2. Feed IMG_URL into the Image to 3D recipe below as "image_url"
```

---

## Image to 3D

```bash
# Local file? Convert to a data URI first:
# IMG_URL=$(python3 -c "import base64;print('data:image/jpeg;base64,'+base64.b64encode(open('photo.jpg','rb').read()).decode())")

TASK_ID=$(python3 scripts/meshy_task.py create --endpoint /openapi/v1/image-to-3d --payload '{
  "image_url": "'"$IMG_URL"'",
  "should_texture": true,
  "enable_pbr": true,
  "ai_model": "latest"
}')
PROJECT_DIR=$(python3 scripts/meshy_task.py project-dir --task-id "$TASK_ID" --prompt "image-to-3d")
python3 scripts/meshy_task.py poll --endpoint /openapi/v1/image-to-3d --task-id "$TASK_ID" --project-dir "$PROJECT_DIR"
python3 scripts/meshy_task.py download --task-json "$PROJECT_DIR/task_$TASK_ID.json" --format glb --output "$PROJECT_DIR/model.glb"
python3 scripts/meshy_task.py record --project-dir "$PROJECT_DIR" --task-id "$TASK_ID" --task-type image-to-3d --stage complete --files model.glb
```

- `enable_pbr` default is **false** — set `true` for metallic/roughness/normal maps
- `"image_enhancement": true` — optimize input image (meshy-6/latest only, default true)
- `"remove_lighting": true` — remove baked lighting from texture (meshy-6/latest only, default true)

---

## Multi-Image to 3D

```bash
TASK_ID=$(python3 scripts/meshy_task.py create --endpoint /openapi/v1/multi-image-to-3d --payload '{
  "image_urls": ["URL_1", "URL_2", "URL_3"],
  "should_texture": true,
  "enable_pbr": true,
  "ai_model": "latest"
}')
python3 scripts/meshy_task.py poll --endpoint /openapi/v1/multi-image-to-3d --task-id "$TASK_ID" --project-dir "$PROJECT_DIR"
python3 scripts/meshy_task.py download --task-json "$PROJECT_DIR/task_$TASK_ID.json" --format glb --output "$PROJECT_DIR/model.glb"
```

- `image_urls`: 1–4 images of the same object from different angles
- Same `image_enhancement` / `remove_lighting` options as Image to 3D

---

## Retexture

**IMPORTANT**: Before calling, ask the user to provide a texture style:
- **Text prompt**: e.g. "rusty metal", "cartoon style" → `text_style_prompt`
- **Reference image**: URL of style image → `image_style_url`
One of these is **required**. If both provided, `image_style_url` takes precedence.

```bash
TASK_ID=$(python3 scripts/meshy_task.py create --endpoint /openapi/v1/retexture --payload '{
  "input_task_id": "PREVIOUS_TASK_ID",
  "text_style_prompt": "wooden texture",
  "enable_pbr": true
}')
python3 scripts/meshy_task.py poll --endpoint /openapi/v1/retexture --task-id "$TASK_ID" --project-dir "$PROJECT_DIR"
python3 scripts/meshy_task.py download --task-json "$PROJECT_DIR/task_$TASK_ID.json" --format glb --output "$PROJECT_DIR/retextured.glb"
```

- Model source: `"input_task_id"` OR `"model_url": "URL"`
- Style: `"text_style_prompt"` (required if no image_style_url) OR `"image_style_url": "URL"` (takes precedence)
- Options: `"remove_lighting": true` (meshy-6/latest, default true), `"target_formats": ["glb", "3mf"]`, `"auto_size": true`

---

## Remesh / Format Conversion

```bash
TASK_ID=$(python3 scripts/meshy_task.py create --endpoint /openapi/v1/remesh --payload '{
  "input_task_id": "TASK_ID",
  "target_formats": ["glb", "fbx", "obj"],
  "topology": "quad",
  "target_polycount": 10000
}')
python3 scripts/meshy_task.py poll --endpoint /openapi/v1/remesh --task-id "$TASK_ID" --project-dir "$PROJECT_DIR"
# poll prints the available MODEL_URLS keys — download each requested format:
python3 scripts/meshy_task.py download --task-json "$PROJECT_DIR/task_$TASK_ID.json" --format glb --output "$PROJECT_DIR/remeshed.glb"
python3 scripts/meshy_task.py download --task-json "$PROJECT_DIR/task_$TASK_ID.json" --format fbx --output "$PROJECT_DIR/remeshed.fbx"
python3 scripts/meshy_task.py download --task-json "$PROJECT_DIR/task_$TASK_ID.json" --format obj --output "$PROJECT_DIR/remeshed.obj"
```

---

## Mesh Utilities (Convert / Resize / UV Unwrap)

Lightweight post-processing on a finished model (via `input_task_id` or `model_url`):

```bash
# Convert to other formats without remeshing (1 credit). Cheapest way to get 3MF/STL.
CONV_ID=$(python3 scripts/meshy_task.py create --endpoint /openapi/v1/convert --payload '{
  "input_task_id": "TASK_ID",
  "target_formats": ["stl", "3mf"]
}')
python3 scripts/meshy_task.py poll --endpoint /openapi/v1/convert --task-id "$CONV_ID" --project-dir "$PROJECT_DIR"
# target_formats required; values: glb/fbx/obj/usdz/blend/stl/3mf

# Resize to a real-world size (1 credit). Give EXACTLY ONE resize mode.
RESIZE_ID=$(python3 scripts/meshy_task.py create --endpoint /openapi/v1/resize --payload '{
  "input_task_id": "TASK_ID",
  "resize_height": 0.15
}')
python3 scripts/meshy_task.py poll --endpoint /openapi/v1/resize --task-id "$RESIZE_ID" --project-dir "$PROJECT_DIR"
# Exactly one of: "resize_height": 0.15 (meters) | "resize_longest_side": 0.2 | "auto_size": true
# Optional: "origin_at": "bottom" | "center"

# UV Unwrap a GLB (5 credits). GLB only, ≤ 40,000 faces (else 400 → remesh down first).
# Output: a GLB "UV white model" (fresh UVs + placeholder grey material) for external texturing.
UV_ID=$(python3 scripts/meshy_task.py create --endpoint /openapi/v1/uv-unwrap --payload '{
  "input_task_id": "TASK_ID"
}')
python3 scripts/meshy_task.py poll --endpoint /openapi/v1/uv-unwrap --task-id "$UV_ID" --project-dir "$PROJECT_DIR"
```

---

## Auto-Rigging + Animation

**IMPORTANT: When the user explicitly asks to rig or animate, the generation step (text-to-3d / image-to-3d) MUST use `pose_mode: "t-pose"` for best rigging results.** If the model was already generated without t-pose, recommend regenerating with `pose_mode: "t-pose"` first.

**Before rigging, verify the model's polygon count is under 300,000** — the bundled `check-faces` subcommand blocks and prints a remesh hint when exceeded:

```bash
SOURCE_ENDPOINT="/openapi/v2/text-to-3d"  # adjust to match the source task's endpoint
SOURCE_TASK_ID="TASK_ID"

# Pre-rig check: face count MUST be ≤ 300,000 (exits 1 with a remesh hint otherwise)
python3 scripts/meshy_task.py check-faces --endpoint "$SOURCE_ENDPOINT" --task-id "$SOURCE_TASK_ID" || exit 1

# Rig (humanoid bipedal characters only)
RIG_ID=$(python3 scripts/meshy_task.py create --endpoint /openapi/v1/rigging --payload '{
  "input_task_id": "'"$SOURCE_TASK_ID"'",
  "height_meters": 1.7
}')
python3 scripts/meshy_task.py poll --endpoint /openapi/v1/rigging --task-id "$RIG_ID" --project-dir "$PROJECT_DIR"

# Rigging automatically includes basic walking + running animations — download all three:
TJ="$PROJECT_DIR/task_$RIG_ID.json"
python3 scripts/meshy_task.py download --url "$(python3 -c "import json;print(json.load(open('$TJ'))['result']['rigged_character_glb_url'])")" --output "$PROJECT_DIR/rigged.glb"
python3 scripts/meshy_task.py download --url "$(python3 -c "import json;print(json.load(open('$TJ'))['result']['basic_animations']['walking_glb_url'])")" --output "$PROJECT_DIR/walking.glb"
python3 scripts/meshy_task.py download --url "$(python3 -c "import json;print(json.load(open('$TJ'))['result']['basic_animations']['running_glb_url'])")" --output "$PROJECT_DIR/running.glb"
python3 scripts/meshy_task.py record --project-dir "$PROJECT_DIR" --task-id "$RIG_ID" --task-type rigging --stage rigged --files rigged.glb,walking.glb,running.glb

# Only create an Animation task if you need a CUSTOM animation beyond walking/running:
# ANIM_ID=$(python3 scripts/meshy_task.py create --endpoint /openapi/v1/animations --payload '{
#   "rig_task_id": "'"$RIG_ID"'",
#   "action_id": 1
# }')
# python3 scripts/meshy_task.py poll --endpoint /openapi/v1/animations --task-id "$ANIM_ID" --project-dir "$PROJECT_DIR"
# python3 scripts/meshy_task.py download --url "$(python3 -c "import json;print(json.load(open('$PROJECT_DIR/task_$ANIM_ID.json'))['result']['animation_glb_url'])")" --output "$PROJECT_DIR/animated.glb"
```

`action_id` comes from the Animation Library.

---

## Text to Image / Image to Image

```bash
# Text to Image
IMG_ID=$(python3 scripts/meshy_task.py create --endpoint /openapi/v1/text-to-image --payload '{
  "ai_model": "nano-banana-pro",
  "prompt": "a futuristic spaceship"
}')
python3 scripts/meshy_task.py poll --endpoint /openapi/v1/text-to-image --task-id "$IMG_ID" --project-dir "$PROJECT_DIR"
# Result: "image_url" in the saved task JSON

# Image to Image
IMG2_ID=$(python3 scripts/meshy_task.py create --endpoint /openapi/v1/image-to-image --payload '{
  "ai_model": "nano-banana-pro",
  "prompt": "make it look cyberpunk",
  "reference_image_urls": ["URL"]
}')
python3 scripts/meshy_task.py poll --endpoint /openapi/v1/image-to-image --task-id "$IMG2_ID" --project-dir "$PROJECT_DIR"
```

Models: `nano-banana` (3 cr) / `nano-banana-2` (6) / `nano-banana-pro` (9) / `gpt-image-2` (9 for text-to-image, 12 for image-to-image). Aspect-ratio support is model-specific — see [../reference.md](../reference.md).
