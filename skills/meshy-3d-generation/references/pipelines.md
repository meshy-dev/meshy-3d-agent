# Digital asset pipelines — CLI 0.3.0

Contents: route choice; shared lifecycle; text/image models; texture/topology/size; rigging and
animation; 2D images and motion; downloads and recovery. Cost, previews, hand-over and
follow-up requests are in [delivery](delivery.md); the runner, login and the meaning of
`WORKSPACE`/`PROJECT_ROOT` are in [setup](setup.md).

Commands are templates: replace uppercase placeholders with values from the user's inputs or
the preceding JSON, quoting paths and text as individual shell arguments. Each command is a
separate step whose output must be read before continuing. Do not run alternative recipes as one
batch. `PROJECT_DIR` is the actual `result.project_dir`, never a literal directory. All business
commands use the v1 envelope; never scrape task IDs from human-readable progress text.

## Pick the route from the intent

| What the user wants | Route | Notes |
|---|---|---|
| A model to look at / a digital prop | text-to-3d preview, then refine when texture is wanted | GLB unless they name a format |
| A model of a specific object in a photo | image-to-3d, `--should-texture true` for colour | one clean reference, whole subject visible |
| A low-poly / game-ready asset on a budget | image-to-3d `--model-type smart-topology --target-polycount N`, or remesh after a standard model | 100–15000 triangles for smart topology; mobile/web budgets sit at the low end |
| An LOD chain from a model that exists | remesh the **existing** task, once per level | never regenerate for a second LOD |
| A character that must move | textured humanoid in A/T pose → rigging → bundled clips or `animate` | see the rigging preconditions below |
| A different format / size of an existing asset | convert / resize on that task | one step, no regeneration |
| A concept image, or a style reference before committing to 3D | text-to-image / image-to-image | optional, and only when offered and accepted |
| A printable physical object | hand the whole job to the printing skill | it sets geometry, format and texture from the start |

Prefer the shortest chain that satisfies the request. An untextured mesh does not need refine;
a GLB does not need a convert step; a plain preview does not need a 2D concept first.

## Shared lifecycle

Choose one `create` recipe below. For the **first** task, omit `--project` until the project
exists; this avoids a local bookkeeping failure after a paid submission. Read its
`result.submission.task_id` as `TASK_ID`, then:

```bash
meshy project init --root "PROJECT_ROOT" --name "JOB_NAME" --task-id TASK_ID --task-type RESOURCE --workspace "WORKSPACE" --output-schema v1 --format json --no-update-check
meshy RESOURCE wait TASK_ID --timeout 600 --project "PROJECT_DIR" --stage STAGE --workspace "WORKSPACE" --output-schema v1 --format json --no-update-check
```

Read the init result before replacing `PROJECT_DIR`. `RESOURCE` is the command that created that
task, e.g. `image-to-3d` or `rigging`, not the parent task's resource. Every later create uses
the same project and a meaningful stage; for example:

```bash
meshy text-to-3d create --mode refine --preview-task-id PREVIEW_ID --enable-pbr true --texture-resolution 4k --target-formats glb --async --project "PROJECT_DIR" --stage refine --workspace "WORKSPACE" --output-schema v1 --format json --no-update-check
```

Read the **new** ID, then wait through `text-to-3d` with stage `refine`. A successful project
wait saves `task_TASK_ID.json`. Use that snapshot for asset selection and face checks. A job
that starts from an existing task initializes its project with that task ID and its resource;
it needs no new generation step.

## Text and image models

**Text:** preview makes geometry; only a SUCCEEDED text-to-3d preview can feed `--mode refine`.
Uploaded, image-derived and remeshed models use retexture instead. Skip refine when the user
asked for an untextured mesh.

```bash
meshy text-to-3d create --mode preview --prompt "MODEL_DESCRIPTION" --target-formats glb --async --output-schema v1 --format json --no-update-check
```

Run init/wait, then the refine example above when texturing is in scope. For a humanoid intended
for rigging, add `--pose-mode a-pose` or `t-pose` to the preview.

**Single image:** use a clean reference with the whole subject visible. Choose explicitly whether
to texture; the CLI defaults to an untextured draft. Texture settings require
`--should-texture true`.

```bash
meshy image-to-3d create --image-url "PHOTO_PATH" --model-type standard --should-texture true --enable-pbr true --texture-resolution 4k --target-formats glb --async --output-schema v1 --format json --no-update-check
```

For a draft use `--should-texture false` and omit `--enable-pbr`/`--texture-resolution`. For
controllable low-poly output, smart topology supports 100–15000 target triangles; standard mode
needs a later remesh for polygon control. Do not pass ultra mode with smart topology.

```bash
meshy image-to-3d create --image-url "PHOTO_PATH" --model-type smart-topology --target-polycount 10000 --should-texture false --target-formats glb --async --output-schema v1 --format json --no-update-check
```

**Multiple views:** supply consistent views of the same object. Use `--data` with an
`image_urls` JSON array for paths containing commas.

```bash
meshy multi-image-to-3d create --image-urls "FRONT_PATH,SIDE_PATH,BACK_PATH" --should-texture true --enable-pbr true --texture-resolution 4k --target-formats glb --async --output-schema v1 --format json --no-update-check
```

A completed text-to-image or image-to-image task can supply the reference without downloading
and re-uploading it:

```bash
meshy image-to-3d create --input-task-id IMAGE_TASK_ID --should-texture false --target-formats glb --async --project "PROJECT_DIR" --stage geometry --workspace "WORKSPACE" --output-schema v1 --format json --no-update-check
```

Use the resulting image-to-3d task for retexture, not the 2D task. Multi-image-to-3d also
exposes `--input-task-id`; inspect its help when consuming generated multiview references. For
single-image humanoids, `--pose-mode a-pose` is available.

## Texture, topology, formats and scale

These examples assume a project containing the source task. When the source is a local model,
replace `--input-task-id SOURCE_ID` with `--model-url "MODEL_PATH"`; use only one source. If this
is the first submitted task of a new job, omit project/stage, then initialize the project with
its accepted ID.

```bash
meshy retexture create --input-task-id SOURCE_ID --text-style-prompt "TEXTURE_DESCRIPTION" --enable-original-uv true --enable-pbr true --texture-resolution 4k --target-formats glb --async --project "PROJECT_DIR" --stage retexture --workspace "WORKSPACE" --output-schema v1 --format json --no-update-check
meshy remesh create --input-task-id SOURCE_ID --topology triangle --target-polycount 30000 --target-formats glb --async --project "PROJECT_DIR" --stage remesh --workspace "WORKSPACE" --output-schema v1 --format json --no-update-check
meshy convert create --input-task-id SOURCE_ID --target-formats fbx,obj --async --project "PROJECT_DIR" --stage convert --workspace "WORKSPACE" --output-schema v1 --format json --no-update-check
meshy resize create --input-task-id SOURCE_ID --resize-height 0.15 --origin-at bottom --async --project "PROJECT_DIR" --stage resize --workspace "WORKSPACE" --output-schema v1 --format json --no-update-check
```

These are alternatives, not an automatic four-step chain. Each is the answer to exactly one
follow-up: a polygon budget or an LOD level (remesh), a format (convert), a physical size
(resize), a new look (retexture). Retexture can use `--image-style-url "STYLE_PATH"` instead of
the text-style prompt; do not combine both style selectors. Remesh supports quad topology and an
adaptive `--decimation-mode` instead of a fixed polygon count. Convert only changes formats.
Resize uses **metres**: 0.15 is 15 cm; choose one of height, longest-side or auto-size. Consult
each resource's `create --help` for further options.

**UV unwrap:** outputs an untextured UV white model for external texturing; requires GLB and at
most 40,000 faces. Inspect the source snapshot first:

```bash
meshy inspect faces --task-json "PROJECT_DIR/task_SOURCE_ID.json" --max-faces 40000 --output-schema v1 --format json --no-update-check
meshy uv-unwrap create --input-task-id SOURCE_ID --async --project "PROJECT_DIR" --stage uv-unwrap --workspace "WORKSPACE" --output-schema v1 --format json --no-update-check
```

Proceed only after a passing check (exit 0); 12 means too dense, 13 means unknown. A remesh is an
additional paid stage when needed, followed by a new face check. If the snapshot is missing,
retrieve it through its actual owning resource:

```bash
meshy RESOURCE get SOURCE_ID --save-json "PROJECT_DIR/task_SOURCE_ID.json" --workspace "WORKSPACE" --output-schema v1 --format json --no-update-check
```

For an external GLB with unknown faces, establish the count with an available local modeling tool
or user-provided evidence. This CLI has no local face counter, so unknown stays unknown: do not
treat it as a pass and do not submit a speculative remesh to make it go away.

## Rigging and animation

Rig a **textured humanoid** with clear limbs, preferably in an A/T pose, at most 300,000 faces.
Use the refined, retextured or textured image task, not an untextured preview. Verify geometry
and texture suitability from the task and its preview; a face check alone cannot establish them.

```bash
meshy inspect faces --task-json "PROJECT_DIR/task_TEXTURED_ID.json" --max-faces 300000 --output-schema v1 --format json --no-update-check
meshy rigging create --input-task-id TEXTURED_ID --height-meters 1.7 --async --project "PROJECT_DIR" --stage rigging --workspace "WORKSPACE" --output-schema v1 --format json --no-update-check
```

Apply the same pass/fail/unknown rule as UV. Wait through `rigging` using the newly accepted ID.
For external input the rigging CLI accepts a textured GLB via `--model-url`; it still needs the
same suitability and face evidence. Rigging already provides walking and running clips — take
them before paying for a custom animation. Select the rig or bundled clips individually:

```bash
meshy download --task-json "PROJECT_DIR/task_RIG_ID.json" --asset result.rigged_character_glb_url --output "PROJECT_DIR/rigged.glb" --project "PROJECT_DIR" --stage rigging --workspace "WORKSPACE" --output-schema v1 --format json --no-update-check
meshy download --task-json "PROJECT_DIR/task_RIG_ID.json" --asset result.basic_animations.walking_glb_url --output "PROJECT_DIR/walking.glb" --project "PROJECT_DIR" --stage rigging --workspace "WORKSPACE" --output-schema v1 --format json --no-update-check
```

For running, use `result.basic_animations.running_glb_url`; list the assets for FBX and armature
variants. A custom animation is a separate task. Get the action ID from the public catalog rather
than guessing it:

```bash
meshy animation-catalog list --search wave --output-schema v1 --format json --no-update-check
meshy animate create --rig-task-id RIG_ID --action-id ACTION_ID --async --project "PROJECT_DIR" --stage animation --workspace "WORKSPACE" --output-schema v1 --format json --no-update-check
```

Wait through `animate`, then download `--asset result.animation_glb_url`. Further post-processing
options (FPS, USDZ, armature) are exposed by `meshy animate create --help`; include them only
when requested.

## 2D images and standalone motion

Text-to-image makes a design or reference image. Image-to-image edits an existing reference; keep
the edit prompt specific. These may be final deliverables, or approved pre-steps to 3D — offer
them, never insert them silently into a 3D request. Choose a model supported by `create --help`,
not an invented identifier.

```bash
meshy text-to-image create --ai-model nano-banana-pro --prompt "DESIGN_DESCRIPTION" --aspect-ratio 1:1 --async --output-schema v1 --format json --no-update-check
meshy image-to-image create --ai-model nano-banana-pro --prompt "EDIT_DESCRIPTION" --reference-image-urls "IMAGE_PATH" --async --output-schema v1 --format json --no-update-check
meshy text-to-motion create --prompt "MOTION_DESCRIPTION" --mode prime --duration 3 --async --output-schema v1 --format json --no-update-check
```

Apply init/wait to the selected resource, or add the existing project's flags for a chained step.
Character concept generation can use `--generate-multi-view true --pose-mode a-pose` where the
selected image model supports it. Text-to-motion is a standalone skeleton clip: prime returns
FBX, swift BVH; duration is 2–10 seconds in 0.5-second increments. It does not animate the
user's rigged character. Download image tasks with `--kind image` and motion with `--kind motion`,
using `--output-dir`.

## Asset delivery and recovery

```bash
meshy download --task-json "PROJECT_DIR/task_TASK_ID.json" --list --output-schema v1 --format json --no-update-check
meshy download --task-json "PROJECT_DIR/task_TASK_ID.json" --model-format glb --output "OUTPUT_FILE" --project "PROJECT_DIR" --stage delivered --workspace "WORKSPACE" --output-schema v1 --format json --no-update-check
meshy download --task-json "PROJECT_DIR/task_TASK_ID.json" --model-format obj --output-dir "OUTPUT_DIR" --project "PROJECT_DIR" --stage delivered --workspace "WORKSPACE" --output-schema v1 --format json --no-update-check
```

`OUTPUT_FILE` is the exact path the user asked for, resolved as in [setup](setup.md); with no
requested path it is a named file inside `PROJECT_DIR`. Use `--output-dir` when a selection
yields several files (OBJ with its MTL and textures, a `--kind`), and `--output` for a single
file. Choose only the applicable download. OBJ includes available MTL and textures; inspect
material-link warnings. For one thumbnail use `--asset thumbnail.primary`; signed URLs and asset
keys come from the task, never from guesswork.

A task-json file preserves a snapshot, not a forever-valid download URL. If it expires, use
`meshy download --resource RESOURCE --task-id TASK_ID` with the same selection, output, project
and workspace flags to obtain refreshed URLs; do not regenerate the model. Existing files are
protected: successful files survive a partial failure, and overwriting happens only within the
user's authorization.

Use `meshy project show --project "PROJECT_DIR" --output-schema v1 --format json
--no-update-check` to recover lineage. The CLI reads legacy metadata and backs it up when
migrating on a later write. Task failures, interrupted waits and unknown submissions follow
[troubleshooting](troubleshooting.md); a failed local save does not erase a remote task. Report
null or unknown charges as unknown rather than assuming zero.
