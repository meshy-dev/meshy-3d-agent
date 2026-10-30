# Recover without duplicating a task

Every command uses `--format json --no-update-check` and prints one envelope. Read the process
exit code and the envelope's `error`, `result` and `warnings`; preserve any task ID, operation
ID, downloaded files and recovery command even when `ok` is false. Auth results are in
`result` as well; see [setup.md](setup.md). A `metadata.json` left by an older version of this
skill is no longer read by the CLI; take task IDs from it by hand.

Contents: runner problems · authentication · exit codes · unknown submission, failure and
timeout · deleting a task · local files.

## Runner problems

- **`meshy: command not found`** or **a version older than 0.7.1**: install the newest 0.7.x as
  Setup describes. If the install is refused, use the temporary 0.7 package
  (`npm exec --yes --package=meshy-cli@0.7 -- meshy …`) and carry on with the same job.
- **A global 0.8 or newer** answers `--version`. Do not uninstall or downgrade it; use the
  temporary 0.7 package for this work and mention the mismatch once.
- **Node older than 22.12** fails the CLI's own runtime gate. Report the required version and the
  installed one; do not try to relax it or run an older CLI.
- **`npm exec` cannot reach the registry**: report the network/proxy error. A cached package
  still runs offline; an uncached one cannot be conjured.

## Authentication and connectivity

`auth status` exit 3 is ambiguous: `authenticated: false` means no usable credential was
resolved, while `authenticated: true, verified: false` also covers network and server failures.
For the latter, use the hint or a free `meshy balance --format json --no-update-check` to
obtain a typed error. Keep the same explicit `--api-key-file` if that is the selected source;
status does not honor it in 0.7.

- **Network failure during verification**: say it is a connectivity problem, keep the stored
  credential, and retry the check when the network is back. Do not start a new authorization.
- **Auth rejection**: use the login flow in [setup.md](setup.md). Do not clear all profiles.
- **Refresh failure**: a still-valid access token may keep working; an expired one cannot.
  Check connection/server errors before asking the user to authorize again.
- **Login code expired or denied**: rerun the same `auth login --device` for a fresh code, and
  show the new URL and code. Nothing paid is retried because a login timed out.
- **Works in another terminal**: compare status `source`, active profile, OS user and
  config/API environment. An environment key overrides a stored OAuth session. Do not scan
  shell profiles or print secret values.
- **`device_flow_not_supported`**: this API host has no device endpoint — the user logs in
  from their own desktop terminal, or supplies their own key privately.

## CLI 0.7 exit codes

| Exit | Meaning | Recovery |
|---|---|---|
| 1 | Generic/server/protocol error or failed task | Inspect the error and any known task before deciding next steps. |
| 2 | Usage or operation conflict | Correct arguments/account/payload mismatch; do not invent a fresh operation ID to bypass a conflict. A local STL/OBJ/FBX `--model-url` lands here: pass it as an http(s) URL instead. So do `unknown option '--output-schema'`, `'--project'` and `'--stage'`: drop those flags. |
| 3 | Authentication | Use the source-aware checks above; status also uses this for failed network verification. |
| 4 | Validation | Correct the rejected input or explain the unsupported request. |
| 5 | Not found | Check the resource, task ID and account; a task older than Meshy's 3-day retention is gone (see Delivery). |
| 6 | Rate limit | Back off for read/status requests; respect server guidance. A create refused with a message starting `NoMorePendingTasks` made no task: too many of the account's tasks are queued or running, so wait for one to finish, then submit once. |
| 7 | Network | Retry safe reads after connectivity recovers; inspect submission state before any create. |
| 8 | Timeout | Resume waiting on an existing task; a login timeout needs a new authorization flow. |
| 9 | The account cannot pay for this task | Too few credits, a Free plan (creating tasks needs a paid plan), a per-key monthly credit limit, or a plan-gated model (`nano-banana-pro` below Pro). Read the message, report the actual cause, and do not resubmit. |
| 10 | Submission outcome unknown | Reconcile first; never automatically resubmit. |
| 11 | Local I/O | Fix the output path/permissions, or choose another path when the target holds files that are not that task's own; then rerun the same `-o` or `download`. |
| 12 / 13 | Check failed / unknown | Inspect check details; do not present an unknown result as a pass. |
| 14 | Conflict: the task is running | A delete of an `IN_PROGRESS` task; see *Deleting a task* below. |
| 130 | Interrupted (Ctrl-C, SIGTERM or SIGHUP) | Preserve task/operation context and reconcile before continuing. |

These are 0.7 codes, not HTTP status codes. Some OAuth errors use generic exit 1; inspect
their message and hint, and `error.details.oauth_error` when it is present, as well.

## Unknown submission, failure and timeout

A create may have reached Meshy even if the response was lost. On `submission_unknown`
(exit 10), retain the original operation ID (`result.submission.operation_id`, the local journal
record of that create) and follow `error.recovery.command` to inspect the resource list.
Correlate candidate tasks with the submitted request, then close the record:

```bash
meshy operations list --state unknown --format json --no-update-check
meshy operations resolve OPERATION_ID --task-id TASK_ID --format json --no-update-check
meshy operations resolve OPERATION_ID --not-created --format json --no-update-check
```

`--task-id` binds the task the list showed: a replay of that operation ID returns it with no new
request, and you carry on with its `get`/`wait`. `--not-created` releases the ID when the list
shows no matching task; the original create run again with `--operation-id OPERATION_ID` then
submits it, which is a new paid create, so only within the user's existing authorization. A record still at `started` (the process was killed
mid-request) is resolved the same way, and `operations show OPERATION_ID` reads one record. These
commands are local and need no sign-in. If the outcome stays ambiguous, report that uncertainty
and wait for a decision. Do not generate another operation ID or resubmit automatically.
Changing authentication or account during recovery can also cause an operation conflict.

If a task ID is already known, retrieve or wait on **that same task** with its resource's
`get`/`wait`. A polling timeout, or a task paused at 99%, does not cancel the remote task.
Resume waiting; do not create a replacement. `wait` already rides out a rate limit, a server
error or a slow response on a status check and polls again, so one of those is not a reason to
stop either.

A terminal `FAILED` task is different from a failed poll. A `get` of one is a successful query
(exit 0, `ok: true`): read `result.task.status` and `result.task.task_error`. A `wait` that ends
`FAILED` is `ok: false` with exit 1 and the whole task kept in `result`. Explain the server's
reason. A replacement generation is another potentially billable operation: retry only within the user's
existing retry/budget authorization, otherwise present that concrete choice. Do not apply
generic HTTP retry loops to creates, repairs, conversions or whole multi-step pipelines.

## Deleting a task

Delete only what the user asked to remove. A `PENDING` task is deleted and refunded. A task
that is already running cannot be stopped: delete exits 14 (`conflict`), the task keeps
running and its credits are already spent. Wait for its result instead; delete it afterwards
only if the user still wants it gone, which is permanent and refunds nothing.

Creative Lab tasks are not reached by `meshy delete`; use `meshy creative-lab PRODUCT STAGE
delete` (`meshy creative-lab fidget-collapsible delete` for the single-stage product), and it is
a cancel, not a delete. `PENDING` is refunded. A running task is stopped, losing both its result
and its credits. A finished one cannot be cancelled (exit 4) or deleted at all. The task stays
listed as `CANCELED` (`canceled: true, deleted: false`).

## Local files

A write refused as outside the workspace means the path escaped `WORKSPACE` (or a symlink pointed
out of it). Fix the path or widen the workspace deliberately — do not drop `--workspace`. An
existing destination file is refused rather than overwritten (exit 11, before anything is
downloaded): choose a new name, or for `download` pass `--overwrite` when the user's instruction
covers replacing that file. `-o` has no overwrite flag; it replaces only the files of the same
task's earlier `-o`, which its sidecar names.

If generation succeeded but a download or a local step failed, keep the successful task and
repair only the failed step. A part-way `-o` transfer (exit 7 or 130) still writes its sidecar for
the files that landed, and `error.recovery.command` is the same `get … -o …` with absolute paths:
run it as printed once the cause is gone, and it replaces what landed and fetches the rest. A
process killed hard mid-transfer leaves files without a sidecar; the rerun then refuses them, so
choose a new path, or ask the user before deleting those partial files. A `download` with the same selection can likewise be
re-run for the rest. Never restart generation to obtain a missing file.
