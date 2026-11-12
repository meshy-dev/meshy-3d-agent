---
name: meshy-3d-generation
description: "Generates and edits digital 3D assets with Meshy: text-to-3D and image-to-3D models, reference images, texturing, remeshing and LODs, UV unwrapping, format conversion (GLB, FBX, OBJ, USDZ, STL, 3MF, Blender), rigging, animation and motion clips from text. Works through Meshy's hosted tools where the host has them connected and through the Meshy CLI otherwise. Use when the user asks to make, texture, rig, animate, convert, find or download a 3D model or game asset. For physical 3D printing use meshy-3d-printing."
license: MIT
compatibility: "Hosted tools: a host connected to Meshy's MCP server, nothing to install. CLI: Node.js 22.12+ and the Meshy CLI 0.8.x, 0.8.5 or later (npm install -g meshy-cli@0.8); network access to the Meshy API."
---

# Meshy 3D Generation

Turn the user's request into a delivered asset. Completion means the requested files in the
requested location, or their download links where the host has no file system, and an available
preview inspected. Login or task submission alone is not completion. Choose the shortest
suitable pipeline and reuse existing assets for follow-ups.

## How to run it

Meshy is reached through its hosted tools or through the Meshy CLI. See which this session has
before anything else; install nothing and sign in to nothing to find out.

| This session has | Run |
|---|---|
| Meshy's hosted tools (`image_to_3d`, `text_to_3d_preview`, `get_task`, `download_model`, `get_balance`) | Generation, reference images, texturing, lookups, downloads and the balance through the tools: [Tools](references/tools.md) |
| The tools and a shell | The same. The CLI does what the tools do not: rigging, animation, motion, remeshing and LODs, UV unwrapping, multi-image-to-3d, conversion, resizing, and steps on a local model file |
| A shell and no Meshy tools | Everything through the CLI: the CLI sections below and their references |
| The tools and no shell | The tools only. For a step they do not do, say that it is not available in this host ([Tools](references/tools.md)) |

A job stays on one way of running. When the request needs a CLI step from the start (a
character to rig, an LOD chain, several photos of one object), run all of it on the CLI: its
steps chain by task ID, and it signs in separately from the host's connection, possibly to
another account. Tools shows how a model the tools made is handed to a later CLI step.

## Read what this request needs

| Need | Reference |
|---|---|
| The hosted tools: routes, credits and consent, progress, delivery, refusals | [Tools](references/tools.md) |
| CLI runner, credentials, or output location | [Setup](references/setup.md) |
| CLI generation and the models to pair for a project, texturing, remeshing, conversion, scale, or 2D images | [Pipelines](references/pipelines.md) |
| Rigging, animation, or generated motion (CLI) | [Animation](references/animation.md) |
| CLI cost, waiting, preview, delivery, or finding a previous model | [Delivery](references/delivery.md) |
| Failed or uncertain CLI operation | [Troubleshooting](references/troubleshooting.md) |

Read the relevant section when needed; recipes are examples to adapt to the requested result,
not a requirement to execute every stage. An untextured model skips texture generation; an
existing GLB needs no extra format conversion. Use command help when parameters are uncertain.

## Before any paid create

These hold on the tools and on the CLI alike.

- Know what the model is for before the first paid create: a game asset, a character to rig, a
  render, a 3D print. If the user hasn't said, ask once; the answer picks the route and the
  models. A game asset or a face-count budget means smart topology, not a standard model
  remeshed down.
- Without a usable photo, recommend making a reference image first and building the model
  from it; text-to-3d is the quicker alternative.
- Continue work within the user's approved scope and budget. Propose additional paid stages
  or reruns before spending.
- Submit a create once and follow that task to its end. A timeout or an unknown submission does
  not authorize another paid create.

## CLI: first use and authorization

In DeepSeek Harness with the Meshy plugin (`DSH_MESHY_CLI` is set) run every command as
`"$DSH_MESHY_NODE" "$DSH_MESHY_CLI" …`, never a `meshy` on PATH, install nothing, and sign in with
the `meshy_sign_in` tool. Everywhere else run `meshy --version` before the first command, without
asking; when it is missing or older than 0.8.5, install it with `npm install -g meshy-cli@0.8`
and say so in one line ([Setup](references/setup.md), section 1).

Reuse a verified session. If login is needed, run `auth login --device` (with `--region cn` for a
user in mainland China) as Setup, section 3 describes: show its URL and user code in
**commentary/progress, not a final answer**, wait on that same command in this turn, verify
`auth status`, then continue the original request. Browser approval stays with the user;
credentials never belong in chat, and only the CLI touches its config directory.

## CLI: execution boundaries

- Run API, upload, download and mesh operations through the CLI. Local inputs have a 50 MiB
  limit, and a local model must be GLB or glTF (rigging, UV unwrap and multicolor: GLB); use the supported
  URL input route for anything else.
- Use `--format json --no-update-check` on every command: stdout is one `meshy.cli/v1` envelope,
  auth included. Resolve `WORKSPACE` from the user's output
  path and pass it to writes.
- The route and the models for a purpose are in [Pipelines](references/pipelines.md), with
  *Start from an image* for a request without a photo.
- Submit once with `create --async`, retain the owning resource and ID, then `wait` on that
  task. Keep the agent turn active while awaiting a running command. Follow Troubleshooting
  on timeout or unknown submission.
- Delivery specifies estimates and balance checks.

## Deliver

Download only needed assets. Inspect and show a preview when available; a missing preview
must not prevent delivery or be described as inspected. On the CLI, Delivery covers
earlier-stage preview lookup and actual charges. Report the result and any concrete
limitation; a rendered image does not establish topology quality or provide a 3D viewer.
