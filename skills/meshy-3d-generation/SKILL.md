---
name: meshy-3d-generation
description: "Create or edit digital 3D assets with Meshy: models, textures, rigging, animation, and reference images. For physical printing, use meshy-3d-printing."
license: MIT
---

# Meshy 3D Generation

Use Meshy CLI **0.3.0** to turn the user's request into a delivered asset. Completion means
saving the requested files in the requested location, inspecting an available preview, and
finishing any project integration the user requested. Login or task submission alone is not
completion. Choose the shortest suitable pipeline and reuse existing assets for follow-ups.

## Read what this request needs

| Need | Reference |
|---|---|
| CLI runner, credentials, or output location | [Setup](references/setup.md) |
| Generation, texturing, rigging, animation, or conversion | [Pipelines](references/pipelines.md) |
| Cost, waiting, preview, delivery, or finding a previous model | [Delivery](references/delivery.md) |
| Failed or uncertain operation | [Troubleshooting](references/troubleshooting.md) |

Read the relevant section when needed; recipes are examples to adapt to the requested result,
not a requirement to execute every stage. An untextured model skips texture generation; an
existing GLB needs no extra format conversion. Use command help when parameters are uncertain.

## First use and authorization

Resolve the runner automatically: use compatible `meshy`, otherwise
`npm exec --yes --package=meshy-cli@0.3.0 -- meshy …`. Reuse a verified session. If login is
needed, follow Setup and run `auth login --device` in a persistent tool session. Show its
verification URL and user code in **commentary/progress, not a final answer**. Await that same
session in this turn until it exits, verify `auth status`, then continue the original request.
A background process cannot resume a finished turn; do not require a "done" chat message.
Browser approval stays with the user; credentials never belong in chat.

## Execution boundaries

- Run API, upload, download and mesh operations through the CLI. Local inputs have a 50 MiB
  limit; use the supported URL input route where appropriate.
- Use `--output-schema v1 --format json --no-update-check` for business commands; auth has
  its own JSON shape. Resolve `WORKSPACE` from the user's output path and pass it to writes.
- Submit once with `create --async`, retain the owning resource and ID, then `wait` on that
  task. Keep the agent turn active while awaiting a running command. Follow Troubleshooting
  on timeout or unknown submission; these do not authorize another paid create.
- Continue work within the user's approved scope and budget. Propose additional paid stages
  or reruns before spending; Delivery specifies estimates and balance checks.

## Deliver

Download only needed assets. Inspect and show a preview when available; a missing preview
must not prevent delivery or be described as inspected. Delivery covers earlier-stage preview
lookup, actual charges, and existing-project integration. Report the result and any concrete
limitation; a rendered image does not establish topology quality or provide a 3D viewer.
