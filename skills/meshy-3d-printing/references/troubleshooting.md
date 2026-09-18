# Recover without duplicating a task

Business commands use `--output-schema v1 --format json --no-update-check`. Read the process
exit code and the envelope's `error`, `result` and `warnings`; preserve any task ID, operation
ID, downloaded files and recovery command even when `ok` is false. Auth commands use their own
bare JSON shape; see [setup.md](setup.md).

## Runner problems

- **`meshy: command not found`** is not a dead end: switch to the pinned temporary package
  (`npm exec --yes --package=meshy-cli@0.3.0 -- meshy …`) and carry on with the same job.
- **A different global version** answers `--version`. Do not uninstall or downgrade it; use the
  pinned temporary package for this work and mention the mismatch once.
- **Node older than 24** fails the CLI's own runtime gate. Report the required version and the
  installed one; do not try to relax it or run an older CLI.
- **`npm exec` cannot reach the registry**: report the network/proxy error. A cached package
  still runs offline; an uncached one cannot be conjured.

## Authentication and connectivity

`auth status` exit 3 is ambiguous: `authenticated: false` means no usable credential was
resolved, while `authenticated: true, verified: false` also covers network and server failures.
For the latter, use the hint or a free `meshy balance --output-schema v1 --format json
--no-update-check` to obtain a typed error. Keep the same explicit `--api-key-file` if that is
the selected source; status does not honor it in 0.3.0.

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
- **`device_flow_not_supported`**: this API host has no device endpoint yet — the user logs in
  from their own desktop terminal, or supplies their own key privately.

## CLI 0.3.0 exit codes

| Exit | Meaning | Recovery |
|---|---|---|
| 1 | Generic/server/protocol error or failed task | Inspect the error and any known task before deciding next steps. |
| 2 | Usage or operation conflict | Correct arguments/account/payload mismatch; do not invent a fresh operation ID to bypass a conflict. |
| 3 | Authentication | Use the source-aware checks above; status also uses this for failed network verification. |
| 4 | Validation | Correct the rejected input or explain the unsupported request. |
| 5 | Not found | Check the resource, task ID and account. |
| 6 | Rate limit | Back off for read/status requests; respect server guidance. |
| 7 | Network | Retry safe reads after connectivity recovers; inspect submission state before any create. |
| 8 | Timeout | Resume waiting on an existing task; a login timeout needs a new authorization flow. |
| 9 | Insufficient credit | Report balance/top-up requirement; no repeated submissions. |
| 10 | Submission outcome unknown | Reconcile first; never automatically resubmit. |
| 11 | Local I/O | Fix the output path/permissions, then resume from the known task or landed files. |
| 12 / 13 | Check failed / unknown | Inspect check details; do not present an unknown result as a pass. |
| 130 | Interrupted | Preserve task/operation context and reconcile before continuing. |

These are 0.3.0 codes, not HTTP status codes. Some OAuth errors use generic exit 1; inspect
their message and hint as well.

## Unknown submission, failure and timeout

A create may have reached Meshy even if the response was lost. On `submission_unknown`
(exit 10), retain the original operation ID and follow `error.recovery.command` to inspect the
resource list. Correlate candidate tasks with the submitted request; if the outcome stays
ambiguous, report that uncertainty and wait for a decision. Do not generate another operation ID
or resubmit automatically. Changing authentication or account during recovery can also cause an
operation conflict.

If a task ID is already known, retrieve or wait on **that same task** with its resource's
`get`/`wait`. A polling timeout, or a task paused at 99%, does not cancel the remote task.
Resume waiting; do not create a replacement.

A terminal `FAILED` task is different from a failed poll. Explain the server's reason. A
replacement generation is another potentially billable operation: retry only within the user's
existing retry/budget authorization, otherwise present that concrete choice. Do not apply
generic HTTP retry loops to creates, repairs, conversions or whole multi-step pipelines.

## Local files

A write refused as outside the workspace means the path escaped `WORKSPACE` (or a symlink or a
swapped directory pointed out of it). Fix the path or widen the workspace deliberately — do not
drop `--workspace`. An existing destination file is refused rather than overwritten: choose a
new name, or pass `--overwrite` when the user's instruction covers replacing that file.

If generation succeeded but a download or a local step failed, keep the successful task and
repair only the failed step: partial downloads leave the files that already landed, and the
same selection can be re-run for the rest. Never restart generation to obtain a missing file.
