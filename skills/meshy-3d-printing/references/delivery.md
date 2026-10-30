# Cost, waiting, previews, delivery and follow-ups

Shared by the generation and print workflows. [setup.md](setup.md) decides the runner, the
session and `WORKSPACE`/`JOB_DIR`; this file covers what happens around a job: what it costs,
what the user sees while it runs, what is handed over at the end, and how the next sentence
("make it 1500 faces", "now as FBX") reuses what already exists.

Contents: cost · waiting · previews · handing over the result · continuing from something that
already exists · wiring the asset into a project.

## Cost: only estimates you can point at

Two sources are legitimate. Use them, and say which one you used.

1. **The CLI's own planner**, for the chains `make` runs (text prompt to textured model, image
   to textured model). It calls nothing and spends nothing:

```bash
meshy make "MODEL_DESCRIPTION" --dry-run --format json --no-update-check
```

   Read `steps[]` and `estimated_credits`. The numbers carry over to `text-to-3d`/`image-to-3d`
   commands you run yourself only with the same settings (the default model, texture up to 4k, no
   `--geometry-resolution`); Smart Topology, 8k texture or the geometry pass are priced from the
   list below.

2. **The published price list**, <https://docs.meshy.ai/en/api/pricing>, for everything else —
   retexture, remesh, convert, resize, UV, rigging, animation, 2D, motion, print analysis and
   repair, multicolor, auto split, Creative Lab. Quote it with the date you read it and call it an estimate.
   Smart Topology is the `meshy-t2.5` (or `meshy-t2`) column; the page is also served as
   Markdown at <https://docs.meshy.ai/api/pricing.md>.

Nothing else is a quote. `meshy balance` reports the **balance**, not a price. Do not invent a
cost command, reuse a `make` estimate for an unrelated chain, or state a precise figure for a
stage neither source covers — say that the exact price is unknown and give the source to check.

The real number arrives afterwards: `consumed_credits` on the finished task. Report it when it
is present, and report it as unknown when it is not. Never assume zero. A task that ends
`FAILED` is refunded. Studio and Enterprise
teams can also list finished tasks with their charges through the free `meshy usage tasks` (Creative Lab and
canceled tasks are not listed); any other account gets a permission error there, which says nothing about the job.

Before starting, know whether the balance can cover the plan. The balance result also splits
it into monthly credits, which reset on the date it gives, and permanent credits:

```bash
meshy balance --format json --no-update-check
```

Spend rules: work already authorized by the user proceeds without asking again, stage by stage,
to the end of the agreed plan. Ask only for a **new** cost the user has not agreed to — an extra
stage, a second variant, a rerun after a disappointing result. Exit 9 (`insufficient_credit`)
stops new paid submissions immediately: keep everything already produced, report what is
missing and the cause the message gives (balance, plan or a key's credit limit; see
Troubleshooting), and point at the account page rather than retrying.

## Waiting: the CLI polls, you narrate

`create --async` returns an accepted ID; the matching `wait` blocks until the task is terminal
and polls internally. Do not write a polling loop, do not shorten `--timeout` to poll by hand,
and do not finish your turn while a stage is still unfinished.

Say what is running before each wait — the stage, the task ID and that generation typically
takes minutes — and report the outcome after it returns. A stage transition or a real status
change is worth a line; individual polls are not. A timeout (exit 8) is not a failure: the task
continues on the server and the same `wait` resumes it. Keep resuming until about an hour after
the task was created before reporting it stuck; a busy period can take that long.

## Previews: look at what came back

A finished 3D task normally carries a rendered thumbnail. It is free to fetch, and it is the
only cheap way to check the result actually matches the request.

```bash
meshy download --resource RESOURCE --task-id TASK_ID --list --format json --no-update-check
meshy download --resource RESOURCE --task-id TASK_ID --asset thumbnail.primary --output "JOB_DIR/preview-TASK_ID.png" --workspace "WORKSPACE" --format json --no-update-check
```

`--list` shows the asset keys this task really has; `--kind thumbnail` takes every thumbnail it
carries when there is more than one view. Take keys from the listing rather than guessing them.

Then **open the downloaded PNG with the host's file-reading tool and look at it**, and show it
to the user. Judge only what a render can show: is it the requested subject, is it complete, is
it obviously untextured when texture was requested. A thumbnail says nothing about back-face
topology, watertightness, print reliability or polygon count — do not imply otherwise.

Post-processing tasks (convert, resize, multicolor, some builds) often have **no**
thumbnail of their own. Walk back along the parent chain you kept (a convert's or repair's
`--input-task-id`) and run the recipe above on the generation stage's task, with its own
`RESOURCE` and `TASK_ID`. Never pay for a conversion or a regeneration just to obtain a picture.

When no preview exists anywhere in the chain, say so plainly: the model was produced and
downloaded, and it has not been visually checked. Missing previews never block the model
download, and "looks right" is never claimed for an image nobody looked at.

## Handing over the result

Deliver four things, every time:

1. **The model file**, at the path the user asked for, written as a plain path in backticks.
   Do not present it as a clickable link: hosts open such links in a text/preview pane that
   cannot render a binary mesh, and it looks broken. A host with a tool that delivers files to the
   user (dsh's `present`) gets the model through that tool as well, so it opens from the
   conversation. Offer the next real action instead —
   reveal it in the file manager (`open -R <path>` on macOS, `explorer /select,<path>` on
   Windows), open it in a local 3D tool, or wire it into the project.
2. **The preview**, shown inline when one exists, or an explicit note that none does.
   A PNG render is not an interactive 3D viewer; this CLI has no local viewer command, so say
   "rendered preview", never "3D preview".
3. **The task trail**: the producing task ID(s) and the resource each belongs to. That is what
   makes the next request cheap. A delivery made with `-o` also leaves a sidecar beside the model
   (`chest_meta.json` next to `chest.glb`, or `meta.json` in a directory) that records the same
   resource and task ID; `download` and `mesh prepare-print` leave none. The file's own location
   comes from `result.downloads.files`. When there is a sidecar, name it in the handover so the
   extra file is no surprise: it records which Meshy task made the model, so a later "now as FBX"
   continues from that task instead of generating again. It also holds the task's signed URLs,
   so do not paste it whole. The user may delete it; then follow-ups
   fall back to the account's task list, and the same `-o` no longer replaces that model, so a new
   delivery needs a new path.
4. **What it cost**: `consumed_credits` when reported, otherwise stated as unknown, plus any
   warnings that affect use.

If the result is wrong, report it and offer the concrete fix (a rerun, a different reference
image, different parameters) with its cost. Do not silently rerun a paid stage.

## Continuing from something that already exists

"Make a 1500-face LOD of that", "now as FBX", "scale it to 150 mm", "rig the one from before"
mean: **find the existing asset and run only the missing step**. Generating again is both a
wrong answer and a second charge.

Look in this order and stop at the first confident match:

1. This conversation: the task IDs and resource names from the job you just ran.
2. The sidecar next to an earlier delivery: `<name>_meta.json`, or `meta.json` in a delivery
   directory, holds its `resource` and task `id`. Find it with the host's file tools; there is no
   CLI command for it.
3. The account's recent tasks for one resource, when no sidecar is left:

```bash
meshy text-to-3d list --page-size 10 --format json --no-update-check
```

4. A local model file the user points at — pass it to the step's `--model-url` input. A local
   file must be GLB or glTF (rigging, UV unwrap and multicolor: GLB); an STL, OBJ or FBX needs an
   http(s) URL or the task it came from.

Meshy keeps a task's files for at most 3 days (Enterprise accounts longer). An older task answers
not found (exit 5) and can no longer be chained by ID: pass the delivered local GLB or glTF to
`--model-url` instead, and only if there is none, say that the model has to be generated again
and what that costs.

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
