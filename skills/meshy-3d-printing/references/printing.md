# Printing Pipelines (meshy-3d-printing)

Full walkthroughs for every print workflow, built from the bundled scripts. All paths are relative to this skill's directory (the parent of `references/`).

- `scripts/slicers.py` — slicer detection + launch (pure stdlib)
- `scripts/fix_obj.py` — OBJ coordinate/scale/origin fix for slicers (pure stdlib)
- `scripts/meshy_task.py` — Meshy API CLI (create / poll / download / record / …); see the generation skill's `references/pipelines.md` for general generation recipes and [../reference.md](../reference.md) for all parameters.

---

## Slicer Detection + Opening

```bash
python3 scripts/slicers.py detect
```

Prints one line per installed slicer, e.g. `- OrcaSlicer [multicolor]: /Applications/OrcaSlicer.app`, or guidance when none are found. Detected slicers: OrcaSlicer, Bambu Studio, Creality Print, Elegoo Slicer, Anycubic Slicer Next, PrusaSlicer, UltiMaker Cura. Multicolor-capable: **OrcaSlicer, Bambu Studio, Creality Print, Elegoo Slicer, Anycubic Slicer Next**.

Open a model in a slicer:

```bash
python3 scripts/slicers.py open --file /abs/path/model.obj --slicer "OrcaSlicer"
```

Opening several SEPARATE/unrelated models (e.g. results from different tasks)? Open them one at a time with a short gap — Bambu Studio especially may respond to only one if the commands fire back-to-back:

```bash
for f in model_a.obj model_b.obj model_c.obj; do
  python3 scripts/slicers.py open --file "$f" --slicer "Bambu Studio"; sleep 2
done
```

(Parts of ONE model belong in a single slicer project — not spaced.)

---

## Printability Analysis & Repair (FREE → optional 10-credit fix)

Run the **automated printability check** after the generation/refine/retexture step that produced your printable mesh. The analyze step is FREE (0 credits), so there's no reason to skip it for production prints.

```bash
INPUT_TASK_ID="$REFINE_ID"  # or whatever produced the textured / final mesh
# IMPORTANT: input_task_id MUST refer to a task that used Meshy 6 or any Preview model.
# For Meshy 4/5 outputs, pass "model_url" (the GLB download URL) instead.

ANALYZE_ID=$(python3 scripts/meshy_task.py create --endpoint /openapi/v1/print/analyze --payload '{
  "input_task_id": "'"$INPUT_TASK_ID"'"
}')
python3 scripts/meshy_task.py poll --endpoint /openapi/v1/print/analyze --task-id "$ANALYZE_ID" --project-dir "$PROJECT_DIR"

# Read the printability report from the saved task JSON:
python3 -c "
import json
p = json.load(open('$PROJECT_DIR/task_$ANALYZE_ID.json')).get('printability') or {}
m = p.get('metrics', {})
print(f\"Printability: {p.get('status', 'unknown')} (issues: {p.get('issue_count', 0)} = errors {p.get('error_count', 0)} + warnings {p.get('warning_count', 0)})\")
print(f\"  watertight={m.get('is_watertight')}, volume={m.get('volume')} m³, non_manifold_edges={m.get('non_manifold_edges')}, degenerate_faces={m.get('degenerate_faces')}, holes={m.get('holes')}\")
"
```

**Status meanings**:
- `healthy` — print as-is.
- `warning` — degenerate faces or holes present. Repair is OPTIONAL but recommended for thin-feature prints.
- `error` — non-watertight, non-positive volume, or non-manifold edges. **Recommend repair before printing.**
- `unknown` — analyze couldn't process the model. Inspect manually or retry.

### Repair (only if analyze flagged errors)

```bash
REPAIR_ID=$(python3 scripts/meshy_task.py create --endpoint /openapi/v1/print/repair --payload '{
  "input_task_id": "'"$INPUT_TASK_ID"'"
}')
# OR with a model URL: {"model_url": "https://example.com/model.stl"}  (output is STL)
python3 scripts/meshy_task.py poll --endpoint /openapi/v1/print/repair --task-id "$REPAIR_ID" --project-dir "$PROJECT_DIR"

# Output format mirrors input. Find the populated model_urls field:
python3 -c "
import json
urls = json.load(open('$PROJECT_DIR/task_$REPAIR_ID.json'))['model_urls']
print(next((u for u in urls.values() if u), None))
"
# Use this repaired URL / task for downstream download / multicolor / slicer steps.
```

**Note**: repair preserves geometry only, not textures. If you need a textured + repaired model for multicolor printing, run `repair` first, then re-texture (or feed `repair`'s task_id to `multi-color` directly — the API handles re-texturing internally if applicable).

---

## White Model Print Pipeline

| Step | Action | Credits | Notes |
|------|--------|---------|-------|
| 1 | Detect installed slicers | 0 | `scripts/slicers.py detect` |
| 2 | Generate untextured model | 5–20 | Text to 3D or Image to 3D (`should_texture: false`) |
| 3 | Download OBJ | 0 | OBJ format for slicer compatibility |
| 4 | Fix OBJ for printing | 0 | `scripts/fix_obj.py` (see below) |
| 5 | Open in slicer | 0 | `scripts/slicers.py open` |

```bash
# --- Step 2: Generate untextured model for printing ---
# Text to 3D:
TASK_ID=$(python3 scripts/meshy_task.py create --endpoint /openapi/v2/text-to-3d --payload '{
  "mode": "preview",
  "prompt": "USER_PROMPT",
  "ai_model": "latest",
  "target_formats": ["obj"]
}')
# OR Image to 3D:
# TASK_ID=$(python3 scripts/meshy_task.py create --endpoint /openapi/v1/image-to-3d --payload '{
#   "image_url": "IMAGE_URL",
#   "should_texture": false,
#   "target_formats": ["glb", "obj"]
# }')

PROJECT_DIR=$(python3 scripts/meshy_task.py project-dir --task-id "$TASK_ID" --prompt "print")
python3 scripts/meshy_task.py poll --endpoint /openapi/v2/text-to-3d --task-id "$TASK_ID" --project-dir "$PROJECT_DIR"  # adjust endpoint for image-to-3d

# --- Step 3: Download OBJ ---
# If poll's MODEL_URLS summary lacks obj, download GLB and import it into the slicer manually.
python3 scripts/meshy_task.py download --task-json "$PROJECT_DIR/task_$TASK_ID.json" --format obj --output "$PROJECT_DIR/model.obj" \
  || python3 scripts/meshy_task.py download --task-json "$PROJECT_DIR/task_$TASK_ID.json" --format glb --output "$PROJECT_DIR/model.glb"

# --- Step 4: Fix OBJ for slicer compatibility ---
# Rotates glTF Y-up → slicer Z-up, scales to target height, centers on XY, bottom at Z=0.
python3 scripts/fix_obj.py "$PROJECT_DIR/model.obj" --height-mm 75.0
# --height-mm: default 75. Adjust per user request (e.g. "print at 15cm" → 150.0).

# --- Step 5: Open in slicer ---
python3 scripts/slicers.py open --file "$PROJECT_DIR/model.obj" --slicer "SLICER_NAME"
# If no slicer was detected, tell the user: open this file in your slicer via File → Import / Open.
```

---

## Multicolor Print Pipeline

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

```bash
# --- Step 1: Multicolor slicer gate ---
# From `slicers.py detect` output, confirm a [multicolor] slicer. If none:
#   WARN: Supported: OrcaSlicer, Bambu Studio, Creality Print, Elegoo Slicer, Anycubic Slicer Next.

# --- Step 2-3: Generate + texture ---
PREVIEW_ID=$(python3 scripts/meshy_task.py create --endpoint /openapi/v2/text-to-3d --payload '{
  "mode": "preview",
  "prompt": "USER_PROMPT",
  "ai_model": "latest"
}')
# No target_formats needed — 3MF comes from the multi-color API, not from generate/refine
python3 scripts/meshy_task.py poll --endpoint /openapi/v2/text-to-3d --task-id "$PREVIEW_ID"

REFINE_ID=$(python3 scripts/meshy_task.py create --endpoint /openapi/v2/text-to-3d --payload '{
  "mode": "refine",
  "preview_task_id": "'"$PREVIEW_ID"'",
  "enable_pbr": true
}')
PROJECT_DIR=$(python3 scripts/meshy_task.py project-dir --task-id "$PREVIEW_ID" --prompt "multicolor-print")
python3 scripts/meshy_task.py poll --endpoint /openapi/v2/text-to-3d --task-id "$REFINE_ID" --project-dir "$PROJECT_DIR"

# OR for Image to 3D with texture:
# TASK_ID=$(python3 scripts/meshy_task.py create --endpoint /openapi/v1/image-to-3d --payload '{
#   "image_url": "IMAGE_URL", "should_texture": true
# }')
# python3 scripts/meshy_task.py poll --endpoint /openapi/v1/image-to-3d --task-id "$TASK_ID" --project-dir "$PROJECT_DIR"

# --- Step 4-5: Multi-color processing (10 credits) ---
MC_ID=$(python3 scripts/meshy_task.py create --endpoint /openapi/v1/print/multi-color --payload '{
  "input_task_id": "'"$REFINE_ID"'",
  "max_colors": 4,
  "max_depth": 4
}')
# max_colors: 1-16, ask user (default 4). max_depth: 3-6, ask user (default 4; 3=coarse, 6=fine).
python3 scripts/meshy_task.py poll --endpoint /openapi/v1/print/multi-color --task-id "$MC_ID" --project-dir "$PROJECT_DIR"

# --- Step 6: Download 3MF ---
python3 scripts/meshy_task.py download --task-json "$PROJECT_DIR/task_$MC_ID.json" --format 3mf --output "$PROJECT_DIR/multicolor.3mf"
python3 scripts/meshy_task.py record --project-dir "$PROJECT_DIR" --task-id "$MC_ID" --task-type multi-color --stage complete --files multicolor.3mf

# --- Step 7: Open in multicolor slicer ---
python3 scripts/slicers.py open --file "$PROJECT_DIR/multicolor.3mf" --slicer "SLICER_NAME"
```

---

## Creative Lab Consumer Products

For ready-to-print physical products, Meshy offers a dedicated **Creative Lab** pipeline that turns a single photo into a styled, printable model. Four products: **figure**, **lamp**, **keychain**, **fridge-magnet**. Two stages (replace `{product}` with one of those):

1. **Prototype** (6 credits): `POST /openapi/creative-lab/{product}/v1/prototype` with `image_url` (jpg/jpeg/png/webp URL or data URI) and optional `name` (≤100). Returns a styled concept image.
2. **Build** (30 credits): `POST /openapi/creative-lab/{product}/v1/build` with `input_task_id` = the SUCCEEDED prototype task (same product + key). Runs the image-to-3d pipeline → textured GLB / OBJ+MTL. Web-app prototypes are rejected with 404 — the prototype must come from the prototype API above.

```bash
PRODUCT="keychain"  # figure | lamp | keychain | fridge-magnet

# Stage 1 — prototype (6 credits)
PROTO_ID=$(python3 scripts/meshy_task.py create --endpoint "/openapi/creative-lab/$PRODUCT/v1/prototype" --payload '{
  "image_url": "PHOTO_URL_OR_DATA_URI"
}')
# optional payload field: "name": "My keychain"  (≤ 100 chars)
python3 scripts/meshy_task.py poll --endpoint "/openapi/creative-lab/$PRODUCT/v1/prototype" --task-id "$PROTO_ID"

# Stage 2 — build (30 credits)
BUILD_ID=$(python3 scripts/meshy_task.py create --endpoint "/openapi/creative-lab/$PRODUCT/v1/build" --payload '{
  "input_task_id": "'"$PROTO_ID"'"
}')
PROJECT_DIR=$(python3 scripts/meshy_task.py project-dir --task-id "$BUILD_ID" --prompt "creative-lab-$PRODUCT")
python3 scripts/meshy_task.py poll --endpoint "/openapi/creative-lab/$PRODUCT/v1/build" --task-id "$BUILD_ID" --project-dir "$PROJECT_DIR"
python3 scripts/meshy_task.py download --task-json "$PROJECT_DIR/task_$BUILD_ID.json" --format glb --output "$PROJECT_DIR/creative-lab.glb"
# build model_urls → textured GLB / OBJ+MTL, ready to convert to STL/3MF and slice.
```

After build, treat the result like any generated model: optionally `analyze` / `repair`, convert to STL/3MF, and open in a slicer (see pipelines above).

**Multicolor a Creative Lab result**: a Creative Lab model can only be sent to Multi-Color Print as `model_url` — pass the build's GLB URL (or a `data:` URI of the downloaded GLB):

```bash
GLB_URL=$(python3 -c "import json;print(json.load(open('$PROJECT_DIR/task_$BUILD_ID.json'))['model_urls']['glb'])")
MC_ID=$(python3 scripts/meshy_task.py create --endpoint /openapi/v1/print/multi-color --payload '{
  "model_url": "'"$GLB_URL"'",
  "max_colors": 4
}')
```

---

## Manual Sanity Checks (in addition to the automated analyze API)

The analyze API covers geometric correctness (watertight, manifold edges, degenerate faces, holes). Some print-quality concerns still need a human eye in the slicer:

| Check | Recommendation | Where to verify |
|-------|---------------|-----------------|
| Wall thickness | Minimum 1.2mm for FDM, 0.8mm for resin | Slicer (after import) |
| Overhangs | Keep below 45° or add supports | Slicer support generation |
| Minimum detail | At least 0.4mm for FDM, 0.05mm for resin | Visual inspection in slicer |
| Base stability | Flat base or add brim/raft in slicer | Slicer plate adhesion |
| Hollowing | Consider hollowing for figurines/miniatures | Slicer hollow tool (resin) |

The automated analyze API now handles: watertightness, volume, non-manifold edges, degenerate faces, holes — these no longer require manual inspection.
