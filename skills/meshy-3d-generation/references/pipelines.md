# Digital asset pipelines — CLI 0.8

Contents: route choice; models by project; shared lifecycle; text/image models;
texture/topology/size; 2D images; downloads and recovery. Rigging, animation and generated
motion are in [animation](animation.md); cost, previews, hand-over and follow-up requests in
[delivery](delivery.md); the runner, login and the meaning of `WORKSPACE`/`JOB_DIR` in
[setup](setup.md).

Commands are templates: replace uppercase placeholders with values from the user's inputs or
the preceding JSON, quoting paths and text as individual shell arguments. Each command is a
separate step whose output must be read before continuing. Do not run alternative recipes as one
batch. Every command prints the v1 envelope; never scrape task IDs from human-readable progress
text.

## Pick the route from the intent

| What the user wants | Route | Notes |
|---|---|---|
| A model from a description | recommend: text-to-image → the user approves the image → image-to-3d from that task; or text-to-3d preview, then refine when texture is wanted | offer both, image route first; see *Start from an image* below |
| A model from a sketch, silhouette, line drawing or logo | image-to-image into a shaded image → the user approves it → image-to-3d from that task | an outline is not a photo; text-to-3d would ignore it |
| A model whose exact shape matters: proportions, depth, sides or back one picture cannot show | multi-view text-to-image or image-to-image → the user approves the views → multi-image-to-3d from that task | see *Start from an image* below |
| A model of a specific object in a photo | image-to-3d, textured by default (`--should-texture false` for a draft) | one clean reference, whole subject visible; pick the models by project (below) |
| A model from multi-view images of one object (front, side, back) | multi-image-to-3d | every view shows the same object; front first |
| A game character to rig and animate, from an image | image-to-3d with smart topology (`meshy-t2.5`) and `--texture-model meshy-n1` in A/T pose, then rigging | set `--target-polycount`; see [animation](animation.md) |
| Many props for a game scene, or user-generated content, from images | image-to-3d with smart topology `--ai-model meshy-t2` and `--texture-model meshy-n1` | one task per prop |
| Many drafts at a low cost | image-to-3d with `meshy-6-lite` geometry and texture | recipe under *Single image* below |
| A new look for a model that exists | retexture that task or file | text style, style image, or photos of the real object |
| A low-poly / game-ready asset on a budget | image-to-3d as in the game rows above, or text-to-3d preview with `--model-type smart-topology --target-polycount N`, or remesh a standard model the user already has | ranges under *Single image* below; mobile/web budgets sit at the low end |
| An LOD chain from a model that exists | remesh the **existing** task, once per level | never regenerate for a second LOD |
| A character that must move, or new actions for a rig | textured humanoid in A/T pose → rigging → bundled walk/run, a library action, or a generated motion | see [animation](animation.md) |
| A motion clip without a character | text-to-motion | see [animation](animation.md) |
| A UV-unwrapped white model to texture elsewhere | uv-unwrap | GLB, at most 40,000 faces |
| A different format / size of an existing asset | convert / resize on that task | one step, no regeneration |
| A concept image or a style reference on its own | text-to-image / image-to-image | see *2D images* below |
| A printable physical object | the print workflow, not these recipes | it sets geometry, format and texture from the start |

Prefer the shortest chain that satisfies the request. An untextured mesh does not need refine;
a GLB does not need a convert step.

## Start from an image

A 3D model follows its reference image closely, so an image is the best place for the user to
steer the result. When the request has no usable photo, recommend making one first:

1. **Propose the plan once**, before any paid create: the image route, with text-to-3d named as
   the quicker alternative with nothing to review. The user's yes covers the cost of every stage
   of the route they pick, not the image itself: they still see it before the model (step 3).
2. **Make the image** with text-to-image, or with image-to-image when the user gave a sketch,
   silhouette, line drawing or logo: those are outlines, not photos, and image-to-3d reads them
   as flat shapes. Describe the subject as one object, whole and unobstructed, on a plain
   background in soft studio light, with the shape requirements the user stated (depth,
   proportions, what must not be thin). For a model whose exact shape matters, add
   `--generate-multi-view true` to get front, side and back views of the same object.
3. **Show the image and end your turn.** Download it and put it in your message as a Markdown
   image with its absolute path, as *Previews* in [delivery](delivery.md) describes. Make the
   model only after the user approves it; your own look at the image is not approval. Adjust it with image-to-image from that task
   (`--input-task-id`) until the user is satisfied: a new image costs less than a new model.
   Skip the review only when the user said not to stop for it.
4. **Make the model from that task** by `--input-task-id`: image-to-3d from a single image,
   multi-image-to-3d from multi-view output. A multi-view task can return fewer than three views;
   look at them before the 3D create.

Text-to-3d goes straight from words to geometry: faster, but the only way to steer it is to
reword the prompt and pay for another model. Run it when the user picks it, asks for a quick
draft, or names text-to-3d.

## Choose the models by project

Image-to-3d and multi-image-to-3d make a model with two AI models: a geometry model builds the
mesh and a texture model paints it. Choose models by project (geometry `ai_model` + `texture_model`):

| Project | Geometry | Texture |
|---|---|---|
| Detailed hero asset, product render, cinematic prop | `meshy-7.1` | `meshy-7` (PBR, up to 8K) |
| Game character to rig and animate | `meshy-t2.5` (smart topology, set `target_polycount`) | `meshy-n1` |
| Many props for a game scene, or user-generated content | `meshy-t2` (smart topology) | `meshy-n1` |
| A real object from 2 to 4 photos | `meshy-7.1` on Multi-Image to 3D | `meshy-7` |
| A model to 3D print | `meshy-7.1` | none, or `meshy-7` to print in color |
| Many drafts at a low cost | `meshy-6-lite` | `meshy-6-lite` |

More: <https://docs.meshy.ai/en/api/models>

How the CLI sets each one:

- **Geometry.** `meshy-7.1` is standard mode, the default, so it needs no flag. Smart topology is
  `--model-type smart-topology`, on `meshy-t2.5` unless you add `--ai-model meshy-t2`.
  `meshy-6-lite` has no flag: send it as `--data '{"ai_model":"meshy-6-lite"}'`.
- **Texture.** `--texture-model meshy-7`, `meshy-n1` or `meshy-6-lite`; multi-image-to-3d takes
  `meshy-7` or `meshy-n1` only. Left out, the API uses the geometry's own default: Meshy 7 for
  `meshy-7.1`, `meshy-t2.5` and `meshy-t2`, Meshy 6 Lite for `meshy-6-lite`. At a given texture
  resolution the texture model does not change the price. An untextured run
  (`--should-texture false`) has no texture model, and the CLI refuses the flag with it.
- **What each texture model takes.** Meshy 7: PBR maps, a 2k, 4k or 8k base color, a texture
  prompt. Meshy N1: a 2k base color painted from the reference images alone, so no
  `--enable-pbr true`, no 4k or 8k, no `--texture-prompt` and no `--remove-lighting`; a model
  over 7,999,999 triangles fails with it and is refunded, so do not pair it with
  `--geometry-resolution 4k`. Meshy 6 Lite: 2k only, PBR allowed, no `--remove-lighting`. The CLI's
  texture defaults follow the texture model, and it refuses a setting that model does not take
  (exit 2) before anything is sent, so drop that flag rather than retrying.

## Shared lifecycle

Choose one `create` recipe below. Read its `result.submission.task_id` as `TASK_ID` and keep
`{resource, task_id, parent_task_id}` for every stage: the lineage lives in your notes, and in the
sidecar of each delivered file (see the last section). Then:

```bash
meshy RESOURCE wait TASK_ID --timeout 600 --format json --no-update-check
```

`RESOURCE` is the command that created that task, e.g. `image-to-3d` or `rigging`, not the parent
task's resource. Every later create chains by ID (`--input-task-id`, `--preview-task-id`,
`--rig-task-id`), and every chained create has a **new** ID to wait on. An API field with no
CLI flag goes in `--data '{"field": …}'` on the same create; a flag overrides it. A job that starts from an existing
task needs no new generation step: `get` or `wait` on that task by its ID and resource.

## Text and image models

**Text:** preview makes geometry; only a SUCCEEDED text-to-3d preview can feed `--mode refine`.
Uploaded, image-derived and remeshed models use retexture instead. Skip refine when the user
asked for an untextured mesh.

```bash
meshy text-to-3d create --mode preview --prompt "MODEL_DESCRIPTION" --target-formats glb --async --format json --no-update-check
```

For a humanoid intended for rigging, add `--pose-mode a-pose` or `t-pose`. The preview also takes
`--model-type smart-topology` with the polygon rules described for images below, or in standard
mode the paid `--geometry-resolution` pass. Wait on it, then refine when texturing is in scope:

```bash
meshy text-to-3d create --mode refine --preview-task-id PREVIEW_ID --enable-pbr true --texture-resolution 4k --target-formats glb --async --format json --no-update-check
```

Without `--texture-resolution` refine uses the server's 2k; 4k and 8k need a meshy-6, meshy-7.1,
`latest` or Smart Topology preview, and a meshy-6-lite preview refuses them, so drop the flag
for one.

**Single image:** use a clean reference with the whole subject visible. The CLI textures by
default, as the API does, and with Meshy 7 also asks for full PBR maps and a 4k base colour;
texturing is billed, so say which you want:
`--should-texture false` gives the untextured draft. Texture settings (`--texture-model`,
`--enable-pbr`, `--texture-resolution`, `--texture-prompt`) are refused together with
`--should-texture false`. The detailed hero asset (`meshy-7.1` with `meshy-7`):

```bash
meshy image-to-3d create --image-url "PHOTO_PATH" --model-type standard --should-texture true --texture-model meshy-7 --enable-pbr true --texture-resolution 4k --target-formats glb --async --format json --no-update-check
```

For a draft use `--should-texture false` and omit `--texture-model`, `--enable-pbr` and
`--texture-resolution`. For controllable low-poly output use smart topology: its default model, meshy-t2.5, takes 100–30,000
target triangles (default 15,000); `--ai-model meshy-t2`
takes 100–15,000 (default 10,000). Standard mode needs a later remesh for polygon control.
`--geometry-resolution 2k|4k` adds a paid high-detail geometry pass to standard mode on the
default model (meshy-7.1) only; never
combine it with smart topology. A game character to rig (`meshy-t2.5` with `meshy-n1`), then
many props or user-generated content (`meshy-t2` with `meshy-n1`):

```bash
meshy image-to-3d create --image-url "PHOTO_PATH" --model-type smart-topology --target-polycount 10000 --texture-model meshy-n1 --pose-mode a-pose --target-formats glb --async --format json --no-update-check
meshy image-to-3d create --image-url "PHOTO_PATH" --model-type smart-topology --ai-model meshy-t2 --texture-model meshy-n1 --target-formats glb --async --format json --no-update-check
```

Add `--should-texture false` and drop `--texture-model` for an untextured low-poly mesh. Many
drafts at a low cost (`meshy-6-lite` with `meshy-6-lite`): it remeshes to 30,000 faces by default
and textures at 2k, and the API refuses `--image-enhancement` and `--geometry-resolution` with it.

```bash
meshy image-to-3d create --image-url "PHOTO_PATH" --data '{"ai_model":"meshy-6-lite"}' --texture-model meshy-6-lite --target-formats glb --async --format json --no-update-check
```

**Multiple views:** supply consistent views of the same object; it is textured by default like a
single image. Use `--data` with an `image_urls` JSON array for paths containing commas.
`--geometry-resolution 2k` is the paid high-detail pass here (no 4k). A real object from 2 to 4
photos is `meshy-7.1` with `meshy-7`; `--texture-model meshy-n1` also paints from every view, and
`meshy-6-lite` is not offered here.

```bash
meshy multi-image-to-3d create --image-urls "FRONT_PATH,SIDE_PATH,BACK_PATH" --should-texture true --texture-model meshy-7 --enable-pbr true --texture-resolution 4k --target-formats glb --async --format json --no-update-check
```

**From an image task** (the image-first route above): a completed text-to-image or
image-to-image task supplies the reference without downloading and re-uploading it. These run
the untextured draft; the texture and model flags of the recipes above apply the same way.

```bash
meshy image-to-3d create --input-task-id IMAGE_TASK_ID --should-texture false --target-formats glb --async --format json --no-update-check
meshy multi-image-to-3d create --input-task-id VIEWS_TASK_ID --should-texture false --target-formats glb --async --format json --no-update-check
```

Image-to-3d takes a task that produced exactly one image; a multi-view image task feeds
multi-image-to-3d instead. Use the resulting 3D task for retexture, not the 2D task. For
single-image humanoids, `--pose-mode a-pose` is available.

## Texture, topology, formats and scale

These examples take the source task by ID. When the source is a model from outside Meshy,
replace `--input-task-id SOURCE_ID` with `--model-url`; use only one source. A local file must
be GLB or glTF. An STL, OBJ or FBX goes in only as an http(s) URL: the CLI refuses a local one
(exit 2) before anything is sent, so do not retry it, and do not convert it with a paid task
just to get it in.

```bash
meshy retexture create --input-task-id SOURCE_ID --text-style-prompt "TEXTURE_DESCRIPTION" --enable-original-uv true --enable-pbr true --texture-resolution 4k --target-formats glb --async --format json --no-update-check
meshy remesh create --input-task-id SOURCE_ID --topology triangle --target-polycount 30000 --target-formats glb --async --format json --no-update-check
meshy convert create --input-task-id SOURCE_ID --target-formats fbx,obj --async --format json --no-update-check
meshy resize create --input-task-id SOURCE_ID --resize-height 0.15 --origin-at bottom --async --format json --no-update-check
```

These are alternatives, not an automatic four-step chain. Each is the answer to exactly one
follow-up: a polygon budget or an LOD level (remesh), a format (convert), a physical size
(resize), a new look (retexture). Retexture can use `--image-style-url "STYLE_PATH"` instead of
the text-style prompt, or `--multiview-image-urls` (1–4 photos of the real object, front first)
to match that object; use exactly one of the three. With either image input, `--ai-model meshy-n1`
(Meshy N1) textures from the images alone (a single style image is read as the front view): a 2K
base color texture, no PBR maps. Drop `--text-style-prompt`, `--enable-pbr` and
`--texture-resolution` from the recipe; the CLI refuses a prompt, PBR, 4K/8K and
`--remove-lighting` with it (exit 2) before anything is sent. The API refuses a model over
7,999,999 triangles for it; a file it cannot count first (an STL URL) fails and is refunded
instead. Remesh supports quad topology and an adaptive `--decimation-mode` instead of a fixed
polygon count. Convert only changes formats.
Resize uses **metres**: 0.15 is 15 cm; choose one of height, longest-side or auto-size. Consult
each resource's `create --help` for further options.

**UV unwrap:** outputs an untextured UV white model for external texturing; requires GLB and at
most 40,000 faces. The API does not report a face count, so count the GLB itself: download the
source model (free), check it locally, then submit:

```bash
meshy download --resource RESOURCE --task-id SOURCE_ID --model-format glb --output "JOB_DIR/source-SOURCE_ID.glb" --workspace "WORKSPACE" --format json --no-update-check
meshy inspect faces --model "JOB_DIR/source-SOURCE_ID.glb" --max-faces 40000 --format json --no-update-check
meshy uv-unwrap create --input-task-id SOURCE_ID --async --format json --no-update-check
```

`inspect faces --model` counts the triangles of every mesh instance in a local GLB or glTF (an
external one included), with no network and no sign-in; its task forms read a `face_count` the
API does not report, so always measure the file. Proceed only after a passing check (exit 0);
12 means too dense, 13 unknown. A remesh is an additional paid stage when needed, followed by a
new download and check. An unknown count is not a pass, and not a reason for a speculative remesh.

## 2D images

Text-to-image makes a design or reference image. Image-to-image edits an existing reference; keep
the edit prompt specific. These may be final deliverables, or the first stage of a 3D request
(*Start from an image* above), proposed with the rest of the plan. Use `gpt-image-2-5-flare` unless the user names
another model from `create --help`. `nano-banana-pro`, and `--pose-mode` on the older nano-banana
models, need a Pro plan or above. On a lower plan the create fails with exit 9 and
`plan_upgrade_required` even with credits left: retry once on `gpt-image-2-5-flare` rather than
reporting a plan or balance problem.

```bash
meshy text-to-image create --ai-model gpt-image-2-5-flare --prompt "DESIGN_DESCRIPTION" --aspect-ratio 1:1 --async --format json --no-update-check
meshy image-to-image create --ai-model gpt-image-2-5-flare --prompt "EDIT_DESCRIPTION" --reference-image-urls "IMAGE_PATH" --async --format json --no-update-check
```

Wait on the selected resource as above. `--generate-multi-view true` makes front, side and back
views of one object as transparent cutouts, on either command; drop `--aspect-ratio`, which it
excludes:

```bash
meshy text-to-image create --ai-model gpt-image-2-5-flare --prompt "VIEWS_DESCRIPTION" --generate-multi-view true --async --format json --no-update-check
```

A character concept adds `--pose-mode a-pose`. A nano-banana model renders any pose at 3:4
(a `pose_aspect_ratio` warning says so). `--remove-background true` returns a transparent PNG. A
finished image task can feed image-to-image with `--input-task-id IMAGE_TASK_ID` instead of
re-uploading its output. Download image tasks with `--kind image`, using `--output-dir`.

## Asset delivery and recovery

```bash
meshy RESOURCE get TASK_ID -o "OUTPUT_FILE" --workspace "WORKSPACE" --format json --no-update-check
meshy download --resource RESOURCE --task-id TASK_ID --list --format json --no-update-check
meshy download --resource RESOURCE --task-id TASK_ID --model-format obj --output-dir "OUTPUT_DIR" --workspace "WORKSPACE" --format json --no-update-check
```

`OUTPUT_FILE` is the exact path the user asked for, resolved as in [setup](setup.md); with no
requested path it is a named file inside `JOB_DIR`. `-o` on a SUCCEEDED task saves its primary
files: a file path such as `chest.glb` gets the one asset of that format (`.fbx` on a rigging task
gets the rig's FBX) and a sidecar `chest_meta.json` beside it that records the resource, the task
and the saved files. That sidecar is the task trail for follow-ups, so leave it next to the model.
`-o` also works on `wait`, `stream` and a synchronous `create`, but `get` after a `wait` keeps the
delivery a separate, repeatable step.

A directory (`-o OUTPUT_DIR`, sidecar `meta.json`) gets every primary file: each model format the
task produced, the thumbnail, images, reports, a rig or animation as GLB. Texture PNGs a GLB
already embeds, a rig's bundled walking and running clips, FBX copies and the pre-remesh model
stay on the server and are listed in `result.downloads.skipped`. `--all-assets` (with `-o` and a
directory) saves them too, which on a long chain is hundreds of megabytes. To take specific
files use `meshy download` instead: `--list` shows the asset keys the task really has, `--asset`
takes one, `--model-format obj --output-dir` takes an OBJ with its MTL and textures (inspect the
material-link warnings), and `--asset thumbnail.primary` takes the preview. `download` writes no
sidecar. Signed URLs and asset keys come from the task, never from guesswork. Every writing
command carries `--workspace WORKSPACE`. A `get` of a task that has not succeeded yet answers
`downloads.state: "not_ready"` with exit 0, so `wait` first.

Rerunning the same `-o` for the same task is safe and free; anything else already at a target is
refused (exit 11). While Meshy keeps the task ([delivery](delivery.md)), `get` and
`download --resource` fetch its files again, so never regenerate a model to obtain a file. Existing
files, part-way transfers, task failures, interrupted waits and unknown submissions follow
[troubleshooting](troubleshooting.md); a failed local save does not erase a remote task.
