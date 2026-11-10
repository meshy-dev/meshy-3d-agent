# Rigging and animation

For a character that has to move. Placeholders, the create/wait lifecycle and `-o` delivery are as
in [pipelines](pipelines.md); cost, previews and hand-over are in [delivery](delivery.md).

## Rigging

Rig a **textured humanoid** with clear limbs, preferably in an A/T pose, at most 300,000 faces
(the API refuses more than 320,000).
Use the refined, retextured or textured image task, not an untextured preview. Verify geometry
and texture suitability from the task and its preview; a face check alone cannot establish them.

```bash
meshy download --resource RESOURCE --task-id TEXTURED_ID --model-format glb --output "JOB_DIR/textured-TEXTURED_ID.glb" --workspace "WORKSPACE" --format json --no-update-check
meshy inspect faces --model "JOB_DIR/textured-TEXTURED_ID.glb" --max-faces 300000 --format json --no-update-check
meshy rigging create --input-task-id TEXTURED_ID --height-meters 1.7 --async --format json --no-update-check
```

Apply the same pass/fail/unknown rule as for UV unwrap in [pipelines](pipelines.md). Wait through `rigging` using the newly accepted ID.
For external input the rigging CLI accepts a textured GLB via `--model-url`, with the character
facing +Z (glTF forward); it still needs the same suitability and face evidence. Do not pass the deprecated `--texture-image-url`: the rig
keeps the model's own textures, and that flag replaces them with one image.

Choose the motion source in this order; stop at the first that gives the requested action:

1. **Walking or running.** The rig task usually carries both clips (confirm with `download --list`).
   Download them; no new task.
2. **Any other action: the preset animation library.** Look the action up, then apply it to the
   rig. Several actions for one character (idle, walk and attack for a game's state machine) go
   into one task with `--action-ids` (1–10 unique IDs): one file with one clip per action, in
   the order given, charged per action.
3. **An action the library does not have: text-to-motion.** Generate the clip with the recipe
   below, wait for it, then apply it with `--motion-task-id`. Biped rigs only, and
   apply it within 3 days of the motion task.

Select the rig or bundled clips individually, each to its own `OUTPUT_FILE`:

```bash
meshy download --resource rigging --task-id RIG_ID --asset result.rigged_character_glb_url --output "OUTPUT_FILE" --workspace "WORKSPACE" --format json --no-update-check
meshy download --resource rigging --task-id RIG_ID --asset result.basic_animations.walking_glb_url --output "OUTPUT_FILE" --workspace "WORKSPACE" --format json --no-update-check
```

For running, use `result.basic_animations.running_glb_url`; list the assets for FBX and armature
variants. Take library IDs from the library, never from memory: IDs have gaps and retired actions
disappear. The lookup is free but needs the same sign-in as any other command. `--search` matches the name or key;
`--category` narrows to `WalkAndRun`, `BodyMovements`, `DailyActions`, `Fighting` or `Dancing`,
and `--sub-category` narrows further. Each item carries a `preview_url` GIF to show the user
when the choice is not obvious.

```bash
meshy animation-catalog list --search wave --format json --no-update-check
meshy animate create --rig-task-id RIG_ID --action-id ACTION_ID --async --format json --no-update-check
meshy animate create --rig-task-id RIG_ID --action-ids ACTION_IDS --async --format json --no-update-check
meshy animate create --rig-task-id RIG_ID --motion-task-id MOTION_ID --async --format json --no-update-check
```

These are alternatives: one action, several actions in one file, or a generated motion. Wait
through `animate`, then download `--asset result.animation_glb_url` (or
`result.animation_fbx_url`). A generated motion may come back GLB-only, with an empty FBX URL.
Post-processing (FPS, USDZ, armature) is `--post-process-operation`; include it only when
requested. On a generated motion it needs that FBX: when the retarget yields none, the task
fails and its credits are refunded.

## Generated motion

```bash
meshy text-to-motion create --prompt "MOTION_DESCRIPTION" --mode prime --duration 3 --async --format json --no-update-check
```

Text-to-motion makes a standalone skeleton clip from a prompt of up to 400 characters: prime
returns FBX, swift BVH; duration is 2–10 seconds in 0.5-second steps. Delivered as is, it is a
raw clip for the user's own DCC tool; to put it on a rigged character, apply it with
`animate --motion-task-id` (above). Download it with `--kind motion`, using `--output-dir`.
