# Digital asset pipelines — CLI 0.7

Contents: route choice; shared lifecycle; text/image models; texture/topology/size; 2D images;
downloads and recovery. Rigging, animation and generated motion are in [animation](animation.md);
cost, previews, hand-over and follow-up requests in [delivery](delivery.md); the runner, login and
the meaning of `WORKSPACE`/`JOB_DIR` in [setup](setup.md).

Commands are templates: replace uppercase placeholders with values from the user's inputs or
the preceding JSON, quoting paths and text as individual shell arguments. Each command is a
separate step whose output must be read before continuing. Do not run alternative recipes as one
batch. Every command prints the v1 envelope; never scrape task IDs from human-readable progress
text.

## Pick the route from the intent

| What the user wants | Route | Notes |
|---|---|---|
| A model to look at / a digital prop | text-to-3d preview, then refine when texture is wanted | GLB unless they name a format |
| A model of a specific object in a photo | image-to-3d, textured by default (`--should-texture false` for a draft) | one clean reference, whole subject visible |
| A model from multi-view images of one object (front, side, back) | multi-image-to-3d | every view shows the same object; front first |
| A new look for a model that exists | retexture that task or file | text style, style image, or photos of the real object |
| A low-poly / game-ready asset on a budget | image-to-3d or text-to-3d preview with `--model-type smart-topology --target-polycount N`, or remesh after a standard model | ranges under *Single image* below; mobile/web budgets sit at the low end |
| An LOD chain from a model that exists | remesh the **existing** task, once per level | never regenerate for a second LOD |
| A character that must move, or new actions for a rig | textured humanoid in A/T pose → rigging → bundled walk/run, a library action, or a generated motion | see [animation](animation.md) |
| A motion clip without a character | text-to-motion | see [animation](animation.md) |
| A UV-unwrapped white model to texture elsewhere | uv-unwrap | GLB, at most 40,000 faces |
| A different format / size of an existing asset | convert / resize on that task | one step, no regeneration |
| A concept image, or a style reference before committing to 3D | text-to-image / image-to-image | optional, and only when offered and accepted |
| A printable physical object | the print workflow, not these recipes | it sets geometry, format and texture from the start |

Prefer the shortest chain that satisfies the request. An untextured mesh does not need refine;
a GLB does not need a convert step; a plain preview does not need a 2D concept first.

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
default, as the API does, and also asks for full PBR maps and a 4k base colour; texturing is
billed, so say which you want:
`--should-texture false` gives the untextured draft. Texture settings (`--enable-pbr`,
`--texture-resolution`, `--texture-prompt`) are refused together with `--should-texture false`.

```bash
meshy image-to-3d create --image-url "PHOTO_PATH" --model-type standard --should-texture true --enable-pbr true --texture-resolution 4k --target-formats glb --async --format json --no-update-check
```

For a draft use `--should-texture false` and omit `--enable-pbr`/`--texture-resolution`. For
controllable low-poly output use smart topology: its default model, meshy-t2.5, takes 100–30,000
target triangles (default 15,000); `--ai-model meshy-t2`
takes 100–15,000 (default 10,000). Standard mode needs a later remesh for polygon control.
`--geometry-resolution 2k|4k` adds a paid high-detail geometry pass to standard mode on the
default model (meshy-7.1) only; never
combine it with smart topology.

```bash
meshy image-to-3d create --image-url "PHOTO_PATH" --model-type smart-topology --target-polycount 10000 --should-texture false --target-formats glb --async --format json --no-update-check
```

**Multiple views:** supply consistent views of the same object; it is textured by default like a
single image. Use `--data` with an `image_urls` JSON array for paths containing commas.
`--geometry-resolution 2k` is the paid high-detail pass here (no 4k).

```bash
meshy multi-image-to-3d create --image-urls "FRONT_PATH,SIDE_PATH,BACK_PATH" --should-texture true --enable-pbr true --texture-resolution 4k --target-formats glb --async --format json --no-update-check
```

A completed text-to-image or image-to-image task can supply the reference without downloading
and re-uploading it:

```bash
meshy image-to-3d create --input-task-id IMAGE_TASK_ID --should-texture false --target-formats glb --async --format json --no-update-check
```

That image task must have produced exactly one image; a multi-view image task feeds
`multi-image-to-3d --input-task-id` instead. Use the resulting 3D task for retexture, not the 2D
task. For single-image humanoids, `--pose-mode a-pose` is available.

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
to match that object; use exactly one of the three. Remesh supports quad topology and an
adaptive `--decimation-mode` instead of a fixed polygon count. Convert only changes formats.
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
the edit prompt specific. These may be final deliverables, or approved pre-steps to 3D — offer
them, never insert them silently into a 3D request. Use `gpt-image-2-5-flare` unless the user names
another model from `create --help`. `nano-banana-pro` needs a Pro plan or higher, and
on a lower plan it fails like an empty balance (exit 9) with credits left: retry once on
`gpt-image-2-5-flare` rather than reporting a low balance.

```bash
meshy text-to-image create --ai-model gpt-image-2-5-flare --prompt "DESIGN_DESCRIPTION" --aspect-ratio 1:1 --async --format json --no-update-check
meshy image-to-image create --ai-model gpt-image-2-5-flare --prompt "EDIT_DESCRIPTION" --reference-image-urls "IMAGE_PATH" --async --format json --no-update-check
```

Wait on the selected resource as above. A character concept from text-to-image can use
`--generate-multi-view true --pose-mode a-pose` (drop `--aspect-ratio`: the two exclude each
other). A nano-banana model renders any pose at 3:4
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
refused (exit 11). Meshy keeps a task's files for at most 3 days, and until then `get` and
`download --resource` fetch them again, so never regenerate a model to obtain a file. Existing
files, part-way transfers, task failures, interrupted waits and unknown submissions follow
[troubleshooting](troubleshooting.md); a failed local save does not erase a remote task.
