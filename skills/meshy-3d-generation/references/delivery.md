# Cost, waiting, previews, delivery and follow-ups

Shared by both Meshy skills. [setup.md](setup.md) decides the runner, the session and
`WORKSPACE`/`PROJECT_ROOT`; this file covers what happens around a job: what it costs, what the
user sees while it runs, what is handed over at the end, and how the next sentence
("make it 1500 faces", "now as FBX") reuses what already exists.

## Cost: only estimates you can point at

Two sources are legitimate. Use them, and say which one you used.

1. **The CLI's own planner**, for the chains `make` runs (text prompt to textured model, image
   to textured model). It calls nothing and spends nothing:

```bash
meshy make "MODEL_DESCRIPTION" --dry-run --output-schema v1 --format json --no-update-check
```

   Read `steps[]` and `estimated_credits`. The same per-step numbers apply when you run those
   steps yourself as `text-to-3d`/`image-to-3d` commands.

2. **The published price list**, <https://docs.meshy.ai/en/api/pricing>, for everything else —
   retexture, remesh, convert, resize, UV, rigging, animation, 2D, motion, print analysis and
   repair, multicolor, Creative Lab. Quote it with the date you read it and call it an estimate.

Nothing else is a quote. `meshy balance` reports the **balance**, not a price. Do not invent a
cost command, reuse a `make` estimate for an unrelated chain, or state a precise figure for a
stage neither source covers — say that the exact price is unknown and give the source to check.

The real number arrives afterwards: `consumed_credits` on the finished task. Report it when it
is present, and report it as unknown when it is not. Never assume zero.

Before starting, know whether the balance can cover the plan:

```bash
meshy balance --output-schema v1 --format json --no-update-check
```

Spend rules: work already authorized by the user proceeds without asking again, stage by stage,
to the end of the agreed plan. Ask only for a **new** cost the user has not agreed to — an extra
stage, a second variant, a rerun after a disappointing result. Exit 9 (`insufficient_credit`)
stops new paid submissions immediately: keep everything already produced, report what is
missing, and point at the account page rather than retrying.

## Waiting: the CLI polls, you narrate

`create --async` returns an accepted ID; the matching `wait` blocks until the task is terminal
and polls internally. Do not write a polling loop, do not shorten `--timeout` to poll by hand,
and do not finish your turn while a stage is still unfinished.

Say what is running before each wait — the stage, the task ID and that generation typically
takes minutes — and report the outcome after it returns. A stage transition or a real status
change is worth a line; individual polls are not. A timeout (exit 8) is not a failure: the task
continues on the server and the same `wait` resumes it.

## Previews: look at what came back

A finished 3D task normally carries a rendered thumbnail. It is free to fetch, and it is the
only cheap way to check the result actually matches the request.

```bash
meshy download --task-json "PROJECT_DIR/task_TASK_ID.json" --list --output-schema v1 --format json --no-update-check
meshy download --task-json "PROJECT_DIR/task_TASK_ID.json" --asset thumbnail.primary --output "PROJECT_DIR/preview.png" --project "PROJECT_DIR" --stage preview --workspace "WORKSPACE" --output-schema v1 --format json --no-update-check
```

`--list` shows the asset keys this task really has; `--kind thumbnail` takes every thumbnail it
carries when there is more than one view. Take keys from the listing rather than guessing them.

Then **open the downloaded PNG with the host's file-reading tool and look at it**, and show it
to the user. Judge only what a render can show: is it the requested subject, is it complete, is
it obviously untextured when texture was requested. A thumbnail says nothing about back-face
topology, watertightness, print reliability or polygon count — do not imply otherwise.

Post-processing tasks (convert, resize, repair, multicolor, some builds) often have **no**
thumbnail of their own. Walk back along the lineage the project already recorded and use the
generation stage's preview instead:

```bash
meshy project show --project "PROJECT_DIR" --workspace "WORKSPACE" --output-schema v1 --format json --no-update-check
```

Take the `parent_task_id` chain from `tasks[]`, then fetch that earlier task's thumbnail with
`download --resource RESOURCE --task-id TASK_ID --asset thumbnail.primary`. Never pay for a
conversion or a regeneration just to obtain a picture.

When no preview exists anywhere in the chain, say so plainly: the model was produced and
downloaded, and it has not been visually checked. Missing previews never block the model
download, and "looks right" is never claimed for an image nobody looked at.

## Handing over the result

Deliver four things, every time:

1. **The model file**, at the path the user asked for, written as a plain path in backticks.
   Do not present it as a clickable link: hosts open such links in a text/preview pane that
   cannot render a binary mesh, and it looks broken. Offer the next real action instead —
   reveal it in the file manager (`open -R <path>` on macOS, `explorer /select,<path>` on
   Windows), open it in a local 3D tool, or wire it into the project.
2. **The preview**, shown inline when one exists, or an explicit note that none does.
   A PNG render is not an interactive 3D viewer; this CLI has no local viewer command, so say
   "rendered preview", never "3D preview".
3. **The task trail**: the producing task ID(s), the resource each belongs to, and the project
   folder. That is what makes the next request cheap. When the deliverable sits at the user's own
   path rather than inside the project folder, the project records the **task and stage** and the
   CLI adds a `files_outside_project` warning — that is the expected shape of an honoured path,
   not a failure; the file's own location comes from `result.downloads.files`.
4. **What it cost**: `consumed_credits` when reported, otherwise stated as unknown, plus any
   warnings that affect use.

If the result is wrong, report it and offer the concrete fix (a rerun, a different reference
image, different parameters) with its cost. Do not silently rerun a paid stage.

## Continuing from something that already exists

"Make a 1500-face LOD of that", "now as FBX", "scale it to 150 mm", "rig the one from before"
mean: **find the existing asset and run only the missing step**. Generating again is both a
wrong answer and a second charge.

Look in this order and stop at the first confident match:

1. This conversation: the task IDs, resource names and project folder from the job you just ran.
2. The workspace's own history:

```bash
meshy project list --root "PROJECT_ROOT" --workspace "WORKSPACE" --output-schema v1 --format json --no-update-check
meshy project show --project "PROJECT_DIR" --workspace "WORKSPACE" --output-schema v1 --format json --no-update-check
```

3. The account's recent tasks for one resource, when the project record is gone:

```bash
meshy text-to-3d list --page-size 10 --output-schema v1 --format json --no-update-check
```

4. A local model file the user points at — pass it to the step's `--model-url` input.

Then run the one step that is actually missing: `remesh` for a polygon budget, `convert` for a
format, `resize` for a physical size, `retexture` for a new look, `rigging`/`animate` for motion,
`mesh prepare-print` for a print-ready OBJ. Keep the task's own resource with its ID — an
`image-to-3d` ID is not queried through `text-to-3d`.

Ask only when the reference is genuinely ambiguous (several candidates, none obviously the one),
and then ask with the candidates listed — never by asking the user to find a task ID. A missing
index is a lookup problem, not a reason to regenerate.

## Wiring the asset into a project

When the user asks for the asset **in** their game, site or app — "use it in my Three.js scene",
"add it to the Unity project" — finish that job: check the preview first, put the file where the
project keeps its assets, add the loader call, prefab entry or manifest line the project
actually uses, and verify the reference resolves (the path exists, the build or type check still
passes). Match the surrounding code's conventions.

Without such a request, deliver the files and stop. Do not edit application code, asset
manifests or build configuration on your own initiative.
