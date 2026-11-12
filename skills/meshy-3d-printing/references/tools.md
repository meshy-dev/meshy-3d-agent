# Meshy's hosted tools

Shared by the generation and print workflows. This file applies when the session lists Meshy's
hosted tools: `image_to_3d`, `text_to_3d_preview`, `get_task`, `download_model`, `get_balance`
and the others below, served by Meshy's MCP server at `https://mcp.meshy.ai/mcp`. They run on
Meshy's servers under the Meshy account the user connected in the host. Nothing is installed,
and the CLI's login is not involved.

Each tool's own description and parameters are the contract: what it takes, the `request_id`
rules, the models to pair by project. This file adds what they do not say: which tool a request
needs, when to ask before spending, what to show and how to hand the result over. When the
tools are not listed, this file does not apply; the skill's CLI route does.

Generation tools named `meshy_…`, such as `meshy_image_to_3d`, come from the local Meshy MCP
server, a separate package with its own instructions. They are not these tools.

Contents: what the tools do · pick the route · credits and consent · one create per request ·
while it runs · show and deliver · when a tool refuses.

## What the tools do, and what they leave to the CLI

| The tools do | Tool |
|---|---|
| A model from a description | `text_to_3d_preview` (untextured), then `text_to_3d_refine` to texture it |
| A model from one picture | `image_to_3d` |
| A reference picture from a description | `text_to_image` |
| A new picture from a picture and a prompt | `image_to_image` |
| Texture an untextured model, or a model file the user has | `texture_model` |
| Send a file from the user's computer to Meshy | `create_upload`, where the host cannot attach the file itself |
| Find the user's models and pictures | `list_tasks`, `get_task` |
| Show a model or picture; open Meshy 3D | `show_model`, `open_meshy_studio`, where the host offers them |
| A download link as GLB, FBX, OBJ, USDZ or STL | `download_model` |
| The credit balance and what a create costs | `get_balance` |

The tools do not rig, animate or generate motion, remesh a model that exists, unwrap UVs, build
one model from several photos, convert to other formats (3MF, Blender) or convert a local file,
resize, check or repair printability, split a model into parts, make multicolor 3MF files, run
Creative Lab products, or open a slicer. Those are CLI steps:

- **With a shell:** follow the skill's CLI route for them. A job that needs one of them from the
  start runs on the CLI from its first step.
- **Without a shell:** say that the step is not available in this host. Do not ask the user to
  install anything, and never describe a model as rigged, remeshed, repaired or printable when
  no step did that. For a print, the STL download is the handoff; suggest checking it in the
  user's slicer.

## Pick the route

| The user has | Route |
|---|---|
| A picture attached in the host | `image_to_3d` with `image_file`, where the tool lists that parameter |
| A picture at a public link | `image_to_3d` with `image_url` |
| A picture on their computer, in a host with a shell and no way to attach it | `create_upload` (purpose `image`), send the file as its description says, then `image_to_3d` with `image_upload_id` |
| A description and no picture | Recommend a reference picture first: `text_to_image`, show it, and once the user accepts it `image_to_3d` with one of its `image_urls` as `image_url`. The quicker alternative, with nothing to review, is `text_to_3d_preview` and then `text_to_3d_refine` when color is wanted |
| A sketch, silhouette, line drawing or logo | `image_to_image` into a shaded picture of the object, show it, then `image_to_3d` from the accepted picture |
| A reference picture that is close but not right | `image_to_image` from that picture, until the user accepts one: a new picture costs less than a new model |
| One of their untextured models (`texturable` is true) | `texture_model` with its `task_id` and a `texture_prompt` or a reference image |
| A model file on their computer to texture | `create_upload` (purpose `model`), then `texture_model` with `model_upload_id` |
| "My models", "the last one", "that fox" | `list_tasks` (`kind` models or images; `filter` untextured or textured), then `get_task` |

- Know what the model is for before the first paid create, as the skill says. The tool
  descriptions carry the guide that pairs a geometry model and a texture model by project;
  follow it. A game asset or a face budget means a smart topology model with `target_polycount`,
  where `image_to_3d` and `text_to_3d_preview` list those models.
- A prompt describes one object: what it is, its shape, material and style, in plain words, up
  to 800 characters. Turn a vague request into such a prompt and say what you sent. For a
  reference picture, describe the object whole and unobstructed on a plain background.
- `image_to_3d` textures by default; pass `should_texture: false` when only the shape is wanted.
- Use only the parameters a tool lists. `image_file` works where the host attaches files; a
  host without it uploads with `create_upload`. Never put a user's file on another host to get a
  link for it.

## Credits and consent

- `get_balance` returns the balance and `prices`: what each create costs with its default
  parameters, and by `ai_model` for a model's geometry and its texture. A call the list does not
  cover costs an amount that is not listed: say so instead of quoting a default price or
  guessing.
- Propose the plan once, with its price, before the first paid create. The user's yes covers
  every stage of the route they picked. Ask again only for a cost they did not agree to:
  another variant, a higher resolution, texturing a preview they asked for untextured, a rerun.
- When the balance is below the price, say so and do not start.
- The tools do not report what a finished task spent. For the cost, repeat the price the user
  agreed to, or say that it was not listed.

## One create per request

- `request_id` is a new random UUID for each new generation, written out by you; the tool
  descriptions give its rules. Do not run a command to make one.
- A create answered `CREATING` or `RESULT_UNKNOWN` may still complete. Resolve it with
  `get_task` on its `task_id`, or, when it came back without one, by repeating the same call
  with the same `request_id`. Inside 30 days the repeat answers from the first call and creates
  nothing.
- After 30 days, or when you cannot tell when a `request_id` was first sent, do not repeat it.
  Look for the model with `list_tasks`, and if you cannot find it, ask before paying again.
  Never start it again with a new `request_id` unless the user agrees to pay twice.
- A refused create made no model and spent nothing; its error says so. Trying again, once the
  cause is dealt with, needs a new `request_id`.

## While it runs

- Right after a create, call `show_model` with the `task_id` it returned, where the host offers
  that tool. Where it shows Meshy's card, the card follows the progress by itself; where it does
  not, report the progress in text.
- Call `get_task` when you need the result to continue, for example before `text_to_3d_refine`
  or before turning a picture into a model. A model usually takes one to a few minutes; check at
  a calm pace, not in a tight loop.
- `FAILED`: give its `error`. Trying again is a new paid create, so ask first.

## Show and deliver

- `show_model` presents a finished model or picture. `open_meshy_studio` opens Meshy 3D with the
  user's balance and newest models, for browsing or working full screen. When the host offers
  neither tool, or a result says `ui_enabled` is false, describe the task in text instead.
- A succeeded model's `formats` lists what `download_model` can make of it. Without `formats`
  there is nothing to download for that model here; say so, and do not guess the reason. Only a
  `download_model` refusal says this model cannot be downloaded.
- Choose formats by use: game engines GLB or FBX; Apple AR USDZ; 3D printing STL; anything else
  GLB or OBJ. An FBX download is a zip that holds the model and its texture images. Download
  only what the user wants: a download counts toward the monthly allowance on plans that have
  one.
- A `download_model` link expires within two days. With a shell, save the file from the link to
  the path the user named (`curl -fL -o PATH URL`) and report where it is; without one, give the
  link. Thumbnail and picture links expire too; `get_task` signs fresh ones.
- Hand over the file or link, the task ID, and what was shown. The next request ("texture it",
  "now as FBX") continues from that task; generating again is a second charge.
- To take a model the tools made into a CLI step later (rig it, remesh it, prepare it for a
  print), download its GLB and give that file to the CLI step as its model input
  ([Delivery](delivery.md), *Continuing from something that already exists*). Do not assume the
  CLI can see the task: it signs in separately, possibly to another account.

## When a tool refuses

Tell the user what the tool's text means, in their language, as the table says. Never suggest
upgrading, name a plan, or give a purchase or pricing link, even when a tool's text does.

| Tool text | What to do |
|---|---|
| The current Meshy plan does not support generating models. | Say generation is not available on their current plan. |
| Please upgrade plan to download models | Say this model cannot be downloaded on their current plan; do not repeat the upgrade suggestion. |
| Not enough Meshy credits for this generation. | Say so. Give a price only when `get_balance` lists the exact price for this call; otherwise give no number. |
| Too many tasks are queued. … | Wait for the running ones, then try again with a new `request_id`. |
| The Meshy connection is no longer authorized; reconnect Meshy. | Ask the user to reconnect Meshy in the host's settings, then repeat the call. Do not switch to the CLI to get around it. |
| … temporarily unavailable … | Try again a little later, with a new `request_id` for a create. |
