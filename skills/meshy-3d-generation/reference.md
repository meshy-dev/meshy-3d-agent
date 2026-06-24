# Meshy API

> Meshy is an AI-powered 3D model generation platform. The Meshy API is a RESTful API that allows you to programmatically generate 3D models, textures, images, rig characters, and animate them.

Base URL: `https://api.meshy.ai`

Docs: https://docs.meshy.ai

## Instructions for Large Language Models

When generating code that integrates with the Meshy API, follow these guidelines:

### 1. Authentication

All requests require a Bearer token in the `Authorization` header:

```
Authorization: Bearer msy_YOUR_API_KEY
```

API keys are created at https://www.meshy.ai/settings/api and have the format `msy_<random-string>`.

### 2. Asynchronous Task Model

Meshy uses an asynchronous execution model. All generation endpoints return a task ID, not the result directly. You must poll the task status or use SSE streaming to get results.

**Correct pattern:**

```python
import requests, time, os

headers = {"Authorization": f"Bearer {os.environ['MESHY_API_KEY']}"}

# Step 1: Create a task
response = requests.post(
    "https://api.meshy.ai/openapi/v2/text-to-3d",
    headers=headers,
    json={"mode": "preview", "prompt": "a monster mask"},
)
task_id = response.json()["result"]

# Step 2: Poll until completion
while True:
    task = requests.get(
        f"https://api.meshy.ai/openapi/v2/text-to-3d/{task_id}",
        headers=headers,
    ).json()
    if task["status"] == "SUCCEEDED":
        break
    if task["status"] == "FAILED":
        raise Exception(task["task_error"]["message"])
    time.sleep(5)

# Step 3: Download result
model_url = task["model_urls"]["glb"]
```

**WRONG pattern** (expecting synchronous result):
```python
# WRONG - the POST does not return a model
response = requests.post("https://api.meshy.ai/openapi/v2/text-to-3d", ...)
model = response.json()["model_urls"]  # WRONG
```

### 3. SSE Streaming (Alternative to Polling)

All task endpoints support Server-Sent Events streaming at `/<endpoint>/:id/stream`:

```python
import requests, json

headers = {
    "Authorization": f"Bearer {API_KEY}",
    "Accept": "text/event-stream"
}

response = requests.get(
    f"https://api.meshy.ai/openapi/v2/text-to-3d/{task_id}/stream",
    headers=headers,
    stream=True
)

for line in response.iter_lines():
    if line and line.startswith(b"data:"):
        data = json.loads(line.decode("utf-8")[5:])
        print(data["status"], data.get("progress"))
        if data["status"] in ["SUCCEEDED", "FAILED", "CANCELED"]:
            break

response.close()
```

### 4. Task Statuses

All tasks follow the same lifecycle: `PENDING` -> `IN_PROGRESS` -> `SUCCEEDED` | `FAILED` | `CANCELED`

### 5. Timestamps

All timestamps in the API are Unix epoch milliseconds (not seconds). For example, `1693569600000` represents September 1, 2023 12:00:00 PM UTC.

### 6. Model Output Formats

3D model outputs are available in multiple formats: GLB, FBX, OBJ, USDZ, STL (via Remesh), 3MF. Access them via `model_urls.glb`, `model_urls.fbx`, `model_urls["3mf"]`, etc. Not all formats are always available; omitted properties mean that format was not generated. Ask the user which format they need before downloading — do not download all formats.

**IMPORTANT: 3MF is NOT included by default.** To receive a 3MF file, you MUST explicitly include `"3mf"` in the `target_formats` parameter when creating the task (e.g. `"target_formats": ["glb", "3mf"]`). Without this, the default output includes GLB, OBJ, FBX, STL, USDZ but not 3MF. The Multi-Color Print API always outputs 3MF.

All generation endpoints (Text to 3D, Image to 3D, Multi-Image to 3D, Remesh, Retexture) support `target_formats`. Specifying only the formats you need can reduce task completion time.

### 7. Asset Retention

Generated assets are retained for a maximum of **3 days** for non-Enterprise customers. Download and store models locally if you need them longer.

### 8. Rate Limits

| Tier | Requests/Second | Queue Tasks | Priority |
|------|-----------------|-------------|----------|
| Pro | 20 | 10 | Default |
| Studio | 20 | 20 | Higher |
| Enterprise | 100 | 50+ | Highest |

Exceeding limits returns `429 Too Many Requests`.

### 9. Choosing the Right AI Model

- Use `"latest"` or `"meshy-6"` for the best quality (default).
- Use `"meshy-5"` for the previous generation model.
- `"latest"` always resolves to the newest model (currently Meshy 6).

### 10. Common Mistakes to Avoid

- **Don't call CORS-restricted endpoints from browser JavaScript.** The API blocks CORS requests. Use a server-side proxy.
- **Don't forget `enable_pbr: true`** if you need metallic/roughness/normal maps.
- **Don't set both `texture_prompt` and `texture_image_url`** — if both are provided, `texture_prompt` takes precedence.
- **Don't assume model format availability.** Check that the URL key exists in `model_urls` before downloading.

---

## Complete Code Example: Text to 3D (Preview + Refine)

```python
import requests, os, time

headers = {"Authorization": f"Bearer {os.environ['MESHY_API_KEY']}"}

# 1. Create preview task
preview_resp = requests.post(
    "https://api.meshy.ai/openapi/v2/text-to-3d",
    headers=headers,
    json={
        "mode": "preview",
        "prompt": "a monster mask",
        "should_remesh": True,
    },
)
preview_resp.raise_for_status()
preview_task_id = preview_resp.json()["result"]

# 2. Poll preview task
while True:
    task = requests.get(
        f"https://api.meshy.ai/openapi/v2/text-to-3d/{preview_task_id}",
        headers=headers,
    ).json()
    if task["status"] == "SUCCEEDED":
        break
    if task["status"] == "FAILED":
        raise Exception(task["task_error"]["message"])
    time.sleep(5)

# 3. Download preview model
with open("preview_model.glb", "wb") as f:
    f.write(requests.get(task["model_urls"]["glb"]).content)

# 4. Create refine task (texturing)
refine_resp = requests.post(
    "https://api.meshy.ai/openapi/v2/text-to-3d",
    headers=headers,
    json={
        "mode": "refine",
        "preview_task_id": preview_task_id,
        "enable_pbr": True,
    },
)
refine_resp.raise_for_status()
refine_task_id = refine_resp.json()["result"]

# 5. Poll refine task
while True:
    task = requests.get(
        f"https://api.meshy.ai/openapi/v2/text-to-3d/{refine_task_id}",
        headers=headers,
    ).json()
    if task["status"] == "SUCCEEDED":
        break
    if task["status"] == "FAILED":
        raise Exception(task["task_error"]["message"])
    time.sleep(5)

# 6. Download refined (textured) model
with open("refined_model.glb", "wb") as f:
    f.write(requests.get(task["model_urls"]["glb"]).content)
```

## Complete Code Example: Image to 3D

```python
import requests, os, time

headers = {"Authorization": f"Bearer {os.environ['MESHY_API_KEY']}"}

response = requests.post(
    "https://api.meshy.ai/openapi/v1/image-to-3d",
    headers=headers,
    json={
        "image_url": "https://example.com/photo.jpg",
        "should_texture": True,
        "enable_pbr": True,
    },
)
response.raise_for_status()
task_id = response.json()["result"]

while True:
    task = requests.get(
        f"https://api.meshy.ai/openapi/v1/image-to-3d/{task_id}",
        headers=headers,
    ).json()
    if task["status"] == "SUCCEEDED":
        break
    if task["status"] == "FAILED":
        raise Exception(task["task_error"]["message"])
    time.sleep(5)

with open("model.glb", "wb") as f:
    f.write(requests.get(task["model_urls"]["glb"]).content)
```

---

# API Endpoints Reference

## Text to 3D API

The Text to 3D workflow has two stages: **preview** (mesh generation) and **refine** (texture generation).

### POST /openapi/v2/text-to-3d — Create Preview Task

Creates a preview (mesh-only) 3D model from a text prompt.

**Required parameters:**
- `mode` (string): Must be `"preview"`.
- `prompt` (string): Description of the 3D model. Max 600 characters.

**Optional parameters:**
- `model_type` (string): `"standard"` (default) or `"lowpoly"`. When `"lowpoly"`, `ai_model`, `topology`, `target_polycount`, `should_remesh` are ignored.
- `ai_model` (string): `"meshy-5"`, `"meshy-6"`, or `"latest"` (default, resolves to Meshy 6).
- `topology` (string): `"quad"` or `"triangle"` (default).
- `target_polycount` (integer): 100–300,000. Default 30,000.
- `should_remesh` (boolean): Default `false` for Meshy 6, `true` for others.
- `pose_mode` (string): `"a-pose"`, `"t-pose"`, or `""` (default). (Replaces the deprecated `is_a_t_pose` flag.)
- `decimation_mode` (integer): Adaptive polycount mode, `1`–`4`. Trades detail vs. polygon budget.
- `moderation` (boolean): Screen input for harmful content. Default `false`.
- `target_formats` (string[]): Output formats: `"glb"`, `"obj"`, `"fbx"`, `"stl"`, `"usdz"`, `"3mf"`. Default: all except 3mf. **3mf must be explicitly included.**
- `auto_size` (boolean): Use AI to auto-estimate real-world height. Default `false`.
- `origin_at` (string): `"bottom"` or `"center"`. Default `"bottom"` when auto_size is true.

**Deprecated parameters:** `symmetry_mode` — no longer affects output, safe to omit. `art_style` — ignored by Meshy-6. `is_a_t_pose` — superseded by `pose_mode`.

> **Retired model:** `meshy-4` is retired; requests that pass `ai_model: "meshy-4"` return 400.

**Cost:** 20 credits (Meshy-6/lowpoly), 5 credits (other models).

**Response:** `{"result": "<task_id>"}`

### POST /openapi/v2/text-to-3d — Create Refine Task

Textures a previously generated preview model.

**Required parameters:**
- `mode` (string): Must be `"refine"`.
- `preview_task_id` (string): ID of a succeeded preview task.

**Optional parameters:**
- `enable_pbr` (boolean): Generate metallic/roughness/normal maps. Default `false`.
- `texture_prompt` (string): Additional text to guide texturing. Max 600 characters.
- `texture_image_url` (string): Image URL or data URI to guide texturing.
- `ai_model` (string): `"meshy-5"`, `"meshy-6"`, or `"latest"` (default, resolves to Meshy 6). Refine works with `meshy-5`, `meshy-6`, or `latest` — pick the same family as your preview for consistency.
- `hd_texture` (boolean): Generate a 4K base color texture. `meshy-6`/`latest` only. Default `false`.
- `remove_lighting` (boolean): Removes highlights and shadows from the base color texture. Default `true`. Meshy-6/latest only.
- `moderation` (boolean): Default `false`.
- `target_formats` (string[]): Output formats: `"glb"`, `"obj"`, `"fbx"`, `"stl"`, `"usdz"`, `"3mf"`. Default: all except 3mf. **3mf must be explicitly included.**
- `auto_size` (boolean): Use AI to auto-estimate real-world height. Default `false`.
- `origin_at` (string): `"bottom"` or `"center"`. Default `"bottom"` when auto_size is true.

**Cost:** 10 credits (regardless of `ai_model`).

**Response:** `{"result": "<task_id>"}`

### GET /openapi/v2/text-to-3d/:id — Retrieve Task

Returns the full task object including `status`, `progress`, `model_urls`, `texture_urls`.

### DELETE /openapi/v2/text-to-3d/:id — Delete Task

Permanently deletes a task and all associated data.

### GET /openapi/v2/text-to-3d — List Tasks

Query params: `page_num` (default 1), `page_size` (default 10, max 50), `sort_by` (`+created_at` or `-created_at`).

### GET /openapi/v2/text-to-3d/:id/stream — Stream Task

Server-Sent Events stream for real-time task progress updates.

### Text to 3D Task Object

```json
{
  "id": "018a210d-8ba4-705c-b111-1f1776f7f578",
  "type": "text-to-3d-preview",
  "model_urls": {
    "glb": "https://assets.meshy.ai/.../model.glb?Expires=...",
    "fbx": "https://assets.meshy.ai/.../model.fbx?Expires=...",
    "obj": "https://assets.meshy.ai/.../model.obj?Expires=...",
    "usdz": "https://assets.meshy.ai/.../model.usdz?Expires=..."
  },
  "prompt": "a monster mask",
  "thumbnail_url": "https://assets.meshy.ai/.../preview.png?Expires=...",
  "progress": 100,
  "status": "SUCCEEDED",
  "created_at": 1692771650657,
  "started_at": 1692771667037,
  "finished_at": 1692771669037,
  "texture_urls": [
    {
      "base_color": "https://assets.meshy.ai/.../texture_0.png?Expires=...",
      "metallic": "https://assets.meshy.ai/.../texture_0_metallic.png?Expires=...",
      "normal": "https://assets.meshy.ai/.../texture_0_normal.png?Expires=...",
      "roughness": "https://assets.meshy.ai/.../texture_0_roughness.png?Expires=..."
    }
  ],
  "preceding_tasks": 0,
  "task_error": {"message": ""}
}
```

---

## Image to 3D API

### POST /openapi/v1/image-to-3d — Create Task

Generates a 3D model from a single image.

**Required parameters:**
- `image_url` (string): Publicly accessible URL or base64 data URI (.jpg, .jpeg, .png).

**Optional parameters:**
- `model_type` (string): `"standard"` (default) or `"lowpoly"`.
- `ai_model` (string): `"meshy-5"`, `"meshy-6"`, or `"latest"` (default).
- `topology` (string): `"quad"` or `"triangle"` (default).
- `target_polycount` (integer): 100–300,000. Default 30,000.
- `should_remesh` (boolean): Default `false` for Meshy 6, `true` for others.
- `save_pre_remeshed_model` (boolean): Store GLB before remeshing. Default `false`.
- `input_task_id` (string): Chain directly off a succeeded `text-to-image` / `image-to-image` task — use its generated image as the input without re-uploading. Provide this OR `image_url`.
- `should_texture` (boolean): Generate textures. Default `true`. Without texture: 20 credits (Meshy-6) / 5 credits (others). With texture: +10 credits.
- `enable_pbr` (boolean): PBR maps. Default `false`.
- `hd_texture` (boolean): Generate a 4K base color texture. `meshy-6`/`latest` only. Default `false`.
- `pose_mode` (string): `"a-pose"`, `"t-pose"`, or `""` (default). (Replaces the deprecated `is_a_t_pose` flag.)
- `decimation_mode` (integer): Adaptive polycount mode, `1`–`4`.
- `texture_prompt` (string): Text to guide texturing. Max 600 characters.
- `texture_image_url` (string): Image to guide texturing.
- `image_enhancement` (boolean): Optimize input image. Default `true`. Meshy-6/latest only.
- `remove_lighting` (boolean): Removes highlights and shadows from the base color texture for cleaner results under custom lighting. Default `true`. Meshy-6/latest only.
- `moderation` (boolean): Default `false`.
- `target_formats` (string[]): Output formats: `"glb"`, `"obj"`, `"fbx"`, `"stl"`, `"usdz"`, `"3mf"`. Default: all except 3mf. **3mf must be explicitly included.**
- `auto_size` (boolean): Use AI to auto-estimate real-world height. Default `false`.
- `origin_at` (string): `"bottom"` or `"center"`. Default `"bottom"` when auto_size is true.

**Deprecated parameters:** `symmetry_mode` — no longer affects output. `art_style` — ignored by Meshy-6. `is_a_t_pose` — superseded by `pose_mode`. `meshy-4` is retired (returns 400).

**Response:** `{"result": "<task_id>"}`

### GET /openapi/v1/image-to-3d/:id — Retrieve Task
### DELETE /openapi/v1/image-to-3d/:id — Delete Task
### GET /openapi/v1/image-to-3d — List Tasks
### GET /openapi/v1/image-to-3d/:id/stream — Stream Task

---

## Multi-Image to 3D API

### POST /openapi/v1/multi-image-to-3d — Create Task

Generates a 3D model from 1–4 images of the same object from different angles.

**Required parameters:**
- `image_urls` (array): 1–4 images as URLs or data URIs.

**Optional parameters:** Same as Image to 3D (except `image_url` → `image_urls`). Also supports `input_task_id` to chain off a succeeded `text-to-image` / `image-to-image` result, plus `multi_view_thumbnails` (boolean): generate 4 cardinal-direction thumbnails of the result (image / multi-image only).

**Response:** `{"result": "<task_id>"}`

### GET /openapi/v1/multi-image-to-3d/:id — Retrieve Task
### DELETE /openapi/v1/multi-image-to-3d/:id — Delete Task
### GET /openapi/v1/multi-image-to-3d — List Tasks
### GET /openapi/v1/multi-image-to-3d/:id/stream — Stream Task

---

## Remesh API

Remesh and export existing 3D models into various formats.

### POST /openapi/v1/remesh — Create Task

**Required (one of):**
- `input_task_id` (string): ID of a succeeded Text to 3D, Image to 3D, or Retexture task.
- `model_url` (string): URL or data URI of a 3D model (.glb, .gltf, .obj, .fbx, .stl).

If both are provided, `input_task_id` takes precedence.

**Optional parameters:**
- `target_formats` (array): Formats to export. Values: `"glb"`, `"fbx"`, `"obj"`, `"usdz"`, `"blend"`, `"stl"`, `"3mf"`. Default `["glb"]`. **3mf must be explicitly included.**
- `topology` (string): `"quad"` or `"triangle"` (default).
- `target_polycount` (integer): 100–300,000. Default 30,000.
- `resize_height` (number): Height in meters. Default 0 (no resize). Mutually exclusive with `auto_size`.
- `auto_size` (boolean): Use AI to auto-estimate real-world height. Mutually exclusive with `resize_height`. Default `false`.
- `origin_at` (string): `"bottom"` or `"center"`. Default `"bottom"` when auto_size is true.
- `convert_format_only` (boolean): Only convert format, skip remeshing. Default `false`.

**Cost:** 5 credits.

**Response:** `{"result": "<task_id>"}`

### GET /openapi/v1/remesh/:id — Retrieve Task
### DELETE /openapi/v1/remesh/:id — Delete Task
### GET /openapi/v1/remesh — List Tasks
### GET /openapi/v1/remesh/:id/stream — Stream Task

---

## Retexture API

Apply new AI-generated textures to existing 3D models.

> **Alias note**: The historical "text-to-texture" feature has been renamed to retexture. The public docs URL `/api/text-to-texture` redirects to `/api/retexture`, and there is no separate `/openapi/v1/text-to-texture` endpoint — use `/openapi/v1/retexture` for both text-style-prompt and image-style-url retexturing.

### POST /openapi/v1/retexture — Create Task

**Required (one of each):**
- `input_task_id` or `model_url`: The model to retexture.
- `text_style_prompt` or `image_style_url`: The style to apply.

**Optional parameters:**
- `ai_model` (string): `"meshy-5"`, `"meshy-6"`, or `"latest"` (default, resolves to Meshy 6).
- `enable_original_uv` (boolean): Preserve original UV mapping. Default `true`.
- `enable_pbr` (boolean): PBR maps. Default `false`.
- `hd_texture` (boolean): Generate a 4K base color texture. `meshy-6`/`latest` only. Default `false`.
- `remove_lighting` (boolean): Removes highlights and shadows from the base color texture. Default `true`. Meshy-6/latest only.
- `target_formats` (string[]): Output formats: `"glb"`, `"obj"`, `"fbx"`, `"stl"`, `"usdz"`, `"3mf"`. Default: all except 3mf. **3mf must be explicitly included.**

**Note:** `image_style_url` takes precedence if both `text_style_prompt` and `image_style_url` are provided.

**Cost:** 10 credits.

**Response:** `{"result": "<task_id>"}`

### GET /openapi/v1/retexture/:id — Retrieve Task
### DELETE /openapi/v1/retexture/:id — Delete Task
### GET /openapi/v1/retexture — List Tasks
### GET /openapi/v1/retexture/:id/stream — Stream Task

---

## Multi-Color Print API

Process a textured 3D model for multi-color 3D printing. Segments the model's texture into discrete color regions and outputs a 3MF file. Cost: **10 credits**.

### POST /openapi/v1/print/multi-color — Create Task

**Required parameters:**
- `input_task_id` (string): ID of a completed task with textures (Text to 3D refine, Image to 3D with texture, or Retexture).

**Optional parameters:**
- `max_colors` (integer, 1-16, default 4): Maximum number of colors for segmentation.
- `max_depth` (integer, 3-6, default 4): Color segmentation depth. Higher values produce finer color boundaries.

**Response:** `{"result": "<task_id>"}`

**Example:**
```python
task_id = create_task("/openapi/v1/print/multi-color", {
    "input_task_id": "textured-task-uuid",
    "max_colors": 4,
    "max_depth": 4,
})
```

### GET /openapi/v1/print/multi-color/:id — Retrieve Task

Returns the task object including `status`, `progress`, `model_urls`, `texture_urls`.

**Completed task `model_urls`:**
```json
{
  "3mf": "https://assets.meshy.ai/.../model.3mf?Expires=..."
}
```

### GET /openapi/v1/print/multi-color/:id/stream — Stream Task (SSE)

Server-Sent Events stream. Events include: `status`, `progress`, `model_urls` (contains `{"3mf": "https://..."}`), `texture_urls`, `task_error`.

---

## Auto-Rigging API

Create an internal skeleton and bind mesh to it for animation.

Currently works best with **standard humanoid (bipedal) characters** with clearly defined limbs.

### POST /openapi/v1/rigging — Create Task

**Required (one of):**
- `input_task_id` (string): ID of a succeeded task.
- `model_url` (string): URL or data URI of a GLB file.

**Optional parameters:**
- `height_meters` (number): Character height in meters. Default 1.7.
- `texture_image_url` (string): UV-unwrapped base color texture (.png).

**Cost:** 5 credits.

**Response:** `{"result": "<task_id>"}`

**Succeeded result includes:**
- `rigged_character_glb_url`, `rigged_character_fbx_url`
- `basic_animations.walking_glb_url`, `walking_fbx_url`, `walking_armature_glb_url`
- `basic_animations.running_glb_url`, `running_fbx_url`, `running_armature_glb_url`

### GET /openapi/v1/rigging/:id — Retrieve Task
### DELETE /openapi/v1/rigging/:id — Delete Task
### GET /openapi/v1/rigging/:id/stream — Stream Task

---

## Animation API

Apply animations to rigged characters.

### POST /openapi/v1/animations — Create Task

**Required parameters:**
- `rig_task_id` (string): ID of a succeeded rigging task.
- `action_id` (integer): Animation action ID from the Animation Library.

**Optional parameters:**
- `post_process` (object):
  - `operation_type` (string): `"change_fps"`, `"fbx2usdz"`, or `"extract_armature"`.
  - `fps` (integer): 24, 25, 30, or 60. Only for `change_fps`.

**Cost:** 3 credits.

**Response:** `{"result": "<task_id>"}`

**Succeeded result includes:**
- `animation_glb_url`, `animation_fbx_url`
- `processed_usdz_url`, `processed_armature_fbx_url`, `processed_animation_fps_fbx_url`

### GET /openapi/v1/animations/:id — Retrieve Task
### DELETE /openapi/v1/animations/:id — Delete Task
### GET /openapi/v1/animations/:id/stream — Stream Task

---

## Text to Image API

### POST /openapi/v1/text-to-image — Create Task

**Required parameters:**
- `ai_model` (string): `"nano-banana"`, `"nano-banana-2"`, `"nano-banana-pro"`, or `"gpt-image-2"`.
- `prompt` (string): Text description of the image.

**Optional parameters:**
- `generate_multi_view` (boolean): Multi-angle views. Default `false`. Cannot be used with `aspect_ratio`.
- `multi_view_thumbnails` (boolean): Generate 4 cardinal-direction thumbnails. Default `false`.
- `alpha_thumbnail` (boolean): Generate an RGBA (transparent-background) preview, returned in `alpha_thumbnail_url`. Default `false`.
- `pose_mode` (string): `"a-pose"` or `"t-pose"`.
- `aspect_ratio` (string): `"1:1"` (default), `"16:9"`, `"9:16"`, `"4:3"`, `"3:4"`, `"3:2"`, `"2:3"`.

> **Aspect-ratio support is model-specific:** nano-banana / nano-banana-2 / nano-banana-pro accept `1:1`, `16:9`, `9:16`, `4:3`, `3:4`. gpt-image-2 accepts ONLY `1:1`, `3:2`, `2:3` — and `3:2` / `2:3` are gpt-image-2-only (the nano-banana family rejects them with 400).

**Cost:** nano-banana 3 credits, nano-banana-2 6 credits, nano-banana-pro 9 credits, gpt-image-2 9 credits.

**Response:** `{"result": "<task_id>"}`

### GET /openapi/v1/text-to-image/:id — Retrieve Task
### DELETE /openapi/v1/text-to-image/:id — Delete Task
### GET /openapi/v1/text-to-image — List Tasks
### GET /openapi/v1/text-to-image/:id/stream — Stream Task

---

## Image to Image API

### POST /openapi/v1/image-to-image — Create Task

**Required parameters:**
- `ai_model` (string): `"nano-banana"`, `"nano-banana-2"`, `"nano-banana-pro"`, or `"gpt-image-2"`.
- `prompt` (string): Text description of the transformation.
- `reference_image_urls` (array): 1–5 reference images as URLs or data URIs.

**Optional parameters:**
- `generate_multi_view` (boolean): Default `false`.
- `multi_view_thumbnails` (boolean): Generate 4 cardinal-direction thumbnails. Default `false`.
- `alpha_thumbnail` (boolean): Generate an RGBA (transparent-background) preview, returned in `alpha_thumbnail_url`. Default `false`.

> **Aspect-ratio support is model-specific:** nano-banana / nano-banana-2 / nano-banana-pro accept `1:1`, `16:9`, `9:16`, `4:3`, `3:4`. gpt-image-2 accepts ONLY `1:1`, `3:2`, `2:3` — and `3:2` / `2:3` are gpt-image-2-only (the nano-banana family rejects them with 400).

**Cost:** nano-banana 3 credits, nano-banana-2 6 credits, nano-banana-pro 9 credits, gpt-image-2 12 credits.

**Response:** `{"result": "<task_id>"}`

### GET /openapi/v1/image-to-image/:id — Retrieve Task
### DELETE /openapi/v1/image-to-image/:id — Delete Task
### GET /openapi/v1/image-to-image — List Tasks
### GET /openapi/v1/image-to-image/:id/stream — Stream Task

---

## Convert API

Convert a model to other file formats without remeshing. Cost: **1 credit**.

### POST /openapi/v1/convert — Create Task

Provide **exactly one** of:
- `input_task_id` (string): A succeeded task you own.
- `model_url` (string): Public URL or data URI of a 3D model.

**Required parameters:**
- `target_formats` (string[]): One or more of `"glb"`, `"fbx"`, `"obj"`, `"usdz"`, `"blend"`, `"stl"`, `"3mf"`.

**Response:** `{"result": "<task_id>"}`

### GET /openapi/v1/convert/:id — Retrieve Task
### DELETE /openapi/v1/convert/:id — Delete Task
### GET /openapi/v1/convert — List Tasks
### GET /openapi/v1/convert/:id/stream — Stream Task

---

## Resize API

Rescale a model to a real-world size. Cost: **1 credit**.

### POST /openapi/v1/resize — Create Task

Provide **exactly one** model source:
- `input_task_id` (string), OR `model_url` (string).

Provide **exactly one** resize mode:
- `resize_height` (number): Target height in meters.
- `resize_longest_side` (number): Target longest bounding-box side in meters.
- `auto_size` (boolean): AI auto-estimates a real-world height.

**Optional parameters:**
- `origin_at` (string): `"bottom"` or `"center"`.

**Response:** `{"result": "<task_id>"}`

### GET /openapi/v1/resize/:id — Retrieve Task
### DELETE /openapi/v1/resize/:id — Delete Task
### GET /openapi/v1/resize — List Tasks
### GET /openapi/v1/resize/:id/stream — Stream Task

---

## UV Unwrap API

Generate fresh UVs for a GLB model. Cost: **5 credits**. Available (GA).

### POST /openapi/v1/uv-unwrap — Create Task

Provide **exactly one** of:
- `input_task_id` (string): A succeeded task whose GLB asset will be unwrapped.
- `model_url` (string): Public URL or data URI of a **GLB** model.

**Constraints:** GLB only, **≤ 40,000 faces** (above this the API returns 400 — remesh down first). Quads/n-gons are triangulated.

**Output:** a GLB "UV white model" — the mesh with fresh UVs and a placeholder grey material (no textures). Use it as a clean base for external texturing.

**Response:** `{"result": "<task_id>"}`

### GET /openapi/v1/uv-unwrap/:id — Retrieve Task
### DELETE /openapi/v1/uv-unwrap/:id — Delete Task
### GET /openapi/v1/uv-unwrap — List Tasks
### GET /openapi/v1/uv-unwrap/:id/stream — Stream Task

---

## Balance API

### GET /openapi/v1/balance — Get Balance

Returns the current credit balance.

**Response:** `{"balance": 1000}`

---

## Enterprise API

### GET /openapi/v1/showcases — List Showcases

Search and download community showcase models. Enterprise tier only.

**Optional parameters:**
- `page_size` (integer): 1–10. Default 3.
- `sort_by` (string): `"+created_at"`, `"-created_at"`, `"+updated_at"`, `"-updated_at"`, `"+downloads"`, `"-downloads"`.
- `search` (string): Text search in model names.
- `format` (string): `"glb"` (default), `"fbx"`, `"obj"`, `"usdz"`.
- `showcase_type` (string): `"all"` (default), `"animated"`, `"static"`.

**Cost:** 1 credit per request.

---

## Webhooks

Configure webhooks at https://www.meshy.ai/settings/api to receive task status updates via HTTP POST. Max 5 active webhooks per account. HTTPS only.

Your server must respond with HTTP status < 400. Consecutive failures may auto-disable the webhook.

Webhook payloads contain the full task object in JSON format matching the corresponding API's task object schema.

---

## Pricing Summary

| API | Cost |
|-----|------|
| Text to 3D Preview (Meshy-6/lowpoly) | 20 credits |
| Text to 3D Preview (other models) | 5 credits |
| Text to 3D Refine | 10 credits |
| Image to 3D (Meshy-6, no texture) | 20 credits |
| Image to 3D (Meshy-6, with texture) | 30 credits |
| Image to 3D (other, no texture) | 5 credits |
| Image to 3D (other, with texture) | 15 credits |
| Multi-Image to 3D (Meshy-6, no texture) | 20 credits |
| Multi-Image to 3D (Meshy-6, with texture) | 30 credits |
| Multi-Image to 3D (other, no texture) | 5 credits |
| Multi-Image to 3D (other, with texture) | 15 credits |
| Retexture | 10 credits |
| Remesh | 5 credits |
| Convert | 1 credit |
| Resize | 1 credit |
| UV Unwrap | 5 credits |
| Multi-Color Print | 10 credits |
| Auto-Rigging | 5 credits |
| Animation | 3 credits |
| Text to Image (nano-banana) | 3 credits |
| Text to Image (nano-banana-2) | 6 credits |
| Text to Image (nano-banana-pro) | 9 credits |
| Text to Image (gpt-image-2) | 9 credits |
| Image to Image (nano-banana) | 3 credits |
| Image to Image (nano-banana-2) | 6 credits |
| Image to Image (nano-banana-pro) | 9 credits |
| Image to Image (gpt-image-2) | 12 credits |
| Analyze Printability | **0 (free)** |
| Repair Printability | 10 credits |

> Every task GET response includes a `consumed_credits` field — read it to report the real credits spent on a task rather than estimating.

---

## Print Automation APIs

### POST /openapi/v1/print/analyze — Create Analyze Printability Task

**Cost: FREE (0 credits).**

Provide **exactly one** of:
- `input_task_id` (string): A SUCCEEDED task you own. Supported task types: image-to-3d, multi-image-to-3d, text-to-3d, remesh, retexture. **MUST use Meshy 6 or any Preview model**.
- `model_url` (string): Public URL of a 3D model. Supported formats: `.glb`, `.gltf`, `.obj`, `.fbx`, `.stl`. Max 100 MB. Must use `http`, `https`, or `data:` URL.

Returns: `{"result": "<task_id>"}`.

### GET /openapi/v1/print/analyze/:id — Retrieve Analyze Task

Once SUCCEEDED, the task object contains a `printability` block with:
- `status`: `"healthy"` / `"warning"` / `"error"` / `"unknown"`
- `issue_count`, `error_count`, `warning_count`
- `metrics`: `{ is_watertight, volume, non_manifold_edges, degenerate_faces, holes }`
- Errors triggered by: non-watertight, non-positive volume, or non-manifold edges. Recommend repair before printing.
- Warnings triggered by: degenerate faces or holes. Repair optional.

### DELETE /openapi/v1/print/analyze/:id — Delete Analyze Task
### GET /openapi/v1/print/analyze — List Analyze Tasks
### GET /openapi/v1/print/analyze/:id/stream — Stream Analyze Task

---

### POST /openapi/v1/print/repair — Create Repair Printability Task

**Cost: 10 credits.**

Repairs non-manifold edges, degenerate faces, holes, and ensures watertightness. Output format mirrors input format.

Provide **exactly one** of:
- `input_task_id` (string): A SUCCEEDED task with a GLB asset. Output is GLB.
- `model_url` (string): Public URL of `.glb` / `.stl` / `.obj`. Max 100 MB. Output format matches input extension.

Returns: `{"result": "<task_id>"}`.

### GET /openapi/v1/print/repair/:id — Retrieve Repair Task

Once SUCCEEDED, `model_urls` contains the repaired model in the same format as the input. Other format fields are empty strings. Textures are NOT preserved (geometry-only repair). `consumed_credits: 10`.

### DELETE /openapi/v1/print/repair/:id — Delete Repair Task
### GET /openapi/v1/print/repair — List Repair Tasks
### GET /openapi/v1/print/repair/:id/stream — Stream Repair Task

---

## Error Handling

### HTTP Status Codes

- `200 OK`: Success.
- `202 Accepted`: Task created, processing not yet complete.
- `400 Bad Request`: Missing or invalid parameter.
- `401 Unauthorized`: Invalid API key.
- `402 Payment Required`: Insufficient credits.
- `403 Forbidden`: CORS or permission issue.
- `404 Not Found`: Resource not found.
- `422 Unprocessable Entity`: Valid request but cannot process (e.g., non-humanoid model for rigging).
- `429 Too Many Requests`: Rate limit exceeded.
- `5xx`: Server error.

### Error Response Format

```json
{"message": "Invalid model file extension: .3dm"}
```

### Task Failure

When `status` is `"FAILED"`, check `task_error.message`:
- `"The server is busy. Please try again later."` — Timeout or server overload. Retry with exponential backoff.
- `"Internal server error."` — Processing failure. Verify inputs and retry.
