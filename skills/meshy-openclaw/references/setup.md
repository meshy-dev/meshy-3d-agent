# Runner, login and output locations

Shared by the generation and print workflows. Three things are settled before any job
starts: **how to run the CLI**, **whether a session already exists**, and **where files go**.
The supported CLI is **0.7.x, from 0.7.1,** on **Node.js 22.12 or newer**. No Python, request wrapper or
separate token store is involved.

Contents: 1 runner · 2 reuse a session · 3 first login · 4 where files go · 5 one session
everywhere · 6 API keys · 7 the China site.

## 1. Resolve the runner

```bash
node --version
meshy --version
```

| Observation | What to do |
|---|---|
| `meshy --version` prints 0.7.1 or a later 0.7.x | run `meshy` |
| no `meshy` command, or a version older than 0.7.1 | install the newest 0.7.x (below), then run `meshy` |
| 0.8 or newer | keep it, since something else may rely on it, and run the temporary 0.7 package |
| no Node.js, or Node older than 22.12 | stop and report it: the user installs Node.js 22.12+ |

```bash
npm install -g meshy-cli@0.7
```

Check and install without asking first; say in one line that you are installing it. Never use `sudo` or change system policy: when the
install is refused (permissions, a managed machine, a sandbox), use the temporary 0.7 package
instead. It runs the same CLI without installing anything: put `npm exec --yes
--package=meshy-cli@0.7 --` in front of the same arguments, and the exit code and the JSON on
stdout are forwarded unchanged. Recipes are written as `meshy …`; example:

```bash
npm exec --yes --package=meshy-cli@0.7 -- meshy auth status --format json --no-update-check
```

The first such call downloads the package into the npm cache; later calls reuse it. On Windows
both commands go through `npm.cmd`. A missing `npm` with a working Node.js means the host
stripped npm: report that and ask the user to install the CLI themselves.

## 2. Reuse a working session before logging in

```bash
meshy auth status --format json --no-update-check
```

Every command, auth included, prints one `meshy.cli/v1` envelope on stdout (`ok`, `result`,
`error`, `warnings`). For `auth status` read `result.authenticated`, `result.verified`,
`result.source` and `result.hint` together with the exit code. `ok` only says the command ran:
the unauthenticated and unverified answers below are `ok: true` with exit 3.

- `authenticated: true`, `verified: true`, exit 0: continue with this account. **No new login.**
- `authenticated: false`, exit 3: no usable credential; log in (next section).
- `authenticated: true`, `verified: false`, exit 3: a credential exists but verification failed —
  which includes network and server errors, not just rejection. Do not start a login or delete
  credentials; see [troubleshooting.md](troubleshooting.md).

`auth status --offline` skips the balance call but can still refresh OAuth over the network.
Use local `doctor` for a diagnostic that must avoid the network entirely.

## 3. First login: one browser approval, then resume the original request

An agent subprocess normally has no TTY, so `auth login` resolves to the device flow on its
own; pass `--device` to make that explicit and deterministic.

```bash
meshy auth login --device --format json --no-update-check
```

In mainland China, or when the user asks for the China site, add `--region cn`
([section 7](#7-the-china-site)): the code is then entered at `meshy.cn`.

Run it as a **persistent tool session that you keep awaiting in the current turn**. A live
CLI process alone is insufficient: finishing the agent turn leaves no active continuation
to consume its result. Do not detach it with `&`, `nohup`, or a terminal launch and then
return. The CLI writes the verification instruction to **stderr**, before it starts polling:

```text
Enter code WXYZ-1234 at https://www.meshy.ai/device
```

Read that instruction as soon as it appears (ignore preceding npm notices) and show the URL
and user code **verbatim** in a **commentary/progress message, never a final answer**,
as a clickable link plus the code to type. Do not wait for the command to exit first, and do
not summarise the code. Then say what happens next, assuming they have never seen the page:
open the URL, sign in to Meshy if asked, type the code, approve. Nothing is copied back into
the chat — the CLI receives the credential itself.

### Keep the agent turn alive

A host whose skill says it wakes the session when a background command exits (OpenClaw)
follows that skill's procedure instead of this subsection. Everywhere else, after showing the link, your next action is to await the **same** running tool session.
Do not ask the user to send "done" or "continue", and do not end the turn with "authorize
and I will continue". Browser approval completes the CLI process; it is not a new user
message and must not be relied on to restart a finished agent turn.

For Codex shells exposing `exec_command` / `write_stdin`:

1. Start the login with a short initial yield (e.g. `yield_time_ms: 1000`). Preserve the
   returned `session_id`; a returned running session is not command completion.
2. Show the verification instruction as commentary as soon as it arrives. If the first
   chunk contains only npm startup output, read more from that same session.
3. Call `write_stdin` with that `session_id`, empty input and a bounded wait (e.g.
   `yield_time_ms: 1000`–`10000`). While still running, repeat; no output means keep waiting.
   The CLI already polls OAuth, so do not spawn another login or poll HTTP yourself.
4. Consume the actual exit code and final JSON. Only then verify `auth status` and continue
   the original task in this turn. A tool yield/timeout is not an OAuth expiry.

If shell calls are wrapped by `functions.exec` and it returns a running `cell_id`, resume
that cell with `functions.wait`; once it returns the shell result, use its `session_id`
if present. Do not confuse the two IDs or leave an unawaited promise in a finished wrapper.
In Claude Code, start it with the Bash tool's `run_in_background`, read its output file until
the code line appears, then keep checking that output until the process exits. Other hosts use
their equivalent running-command wait tool. Send a brief progress
update during a long wait without ending the turn. Stop waiting on a terminal login error,
actual code expiry, user cancellation, or an explicit host limitation; report the reason.
Do not create recurring automations or a second task to keep a login alive.

The process keeps polling until the user approves or the code expires. While it polls, do not
start a second login, do not kill it, and do not ask the user to paste anything. On approval it
prints the envelope with `result.status: "logged_in"` and `result.verified: true` to stdout and
exits 0. Then:

1. Re-run `auth status`; `verified: true` is the proof, not the exit code of `login`.
2. **Continue the request the user originally made**, with the same inputs, output path and
   budget they already gave. Logging in is not the deliverable.

Failure branches — each is a different recovery, so read the error rather than retrying blindly:

- **Browser never opened / user is on another device**: the URL and code in the stderr line are
  all they need; they can open it anywhere they are signed in to Meshy.
- **Code expired or was denied** (the login exits non-zero after polling, with an error envelope
  whose `error.details.oauth_error` names the reason, such as `access_denied` or
  `expired_token`): run the *same* login command again for a fresh code. Never re-run a paid
  create because a login timed out.
- **`device_flow_not_supported`**: this API host has no device endpoint. Ask the user to run
  `meshy auth login` in their own desktop terminal (loopback + browser), or to store their own
  key with `meshy auth login --with-key <key>` privately. Never ask for the key in chat.
- **Host cannot keep a process alive at all**: fall back to the user running the login command
  in their own terminal, then re-check `auth status` and resume. This is the only case where a
  manual terminal step is acceptable.

Do not use `--no-wait`: its JSON contains a `device_code`, which is a bearer secret. Do not use
`--manual` from an agent — it prompts on stdin for a pasted code. Never show a token, a device
code or a signed URL to the user or copy one into chat or a file: task results and sidecars
carry signed URLs, so report paths and task IDs instead of pasting them.

## 4. Where files go

Two paths decide every write. Resolve them from the user's own words *before* the first command:

| The user named | `WORKSPACE` (the write boundary) | `JOB_DIR` (previews, intermediate downloads) | Final model file |
|---|---|---|---|
| nothing | `./meshy_output` | `./meshy_output/<job>` | inside `JOB_DIR` |
| a directory, e.g. `./assets` | `./assets` | `./assets/meshy_output/<job>` | `./assets/<descriptive-name>.<ext>` |
| a file, e.g. `./assets/chest.glb` | `./assets` | `./assets/meshy_output/<job>` | exactly `./assets/chest.glb` |

`<job>` is a short descriptive folder name you choose for this job; the CLI creates it on the first
write, and another job's folder is never reused. `./meshy_output` is only the **default**, never an
override: a path the user asked for wins. When the named directory is itself called
`meshy_output`, `JOB_DIR` is `<that directory>/<job>` (no nested `meshy_output/meshy_output`).
Quote paths with spaces or non-ASCII characters as single shell arguments; they need no other
special handling.

Every command that writes a file (`-o`, `download`, `--save-json`, mesh preparation) carries
`--workspace WORKSPACE`, so the CLI refuses any path that escapes it or follows a symlink out of
it; a `create` or `wait` that saves nothing needs no workspace. Keep one workspace per job:
previews, intermediate downloads and delivered files all live inside it. Say the output location
when the job starts.

Existing files are never silently replaced. `download` refuses to overwrite unless `--overwrite`
is passed, and `-o` refuses a target that holds anything but its own task's earlier output
(rerunning the same `-o` for the same task is fine). So an existing `chest.glb` is a decision — a
new name or, for `download`, an explicit overwrite — covered by what the user already authorized,
not a silent clobber. A model delivered with `-o` leaves a small sidecar beside it
(`chest_meta.json`): that is the task trail described in [delivery.md](delivery.md), not clutter
to delete.

## 5. One session, both skills, any directory

The default store is `~/.config/meshy/credentials.json` (mode 0600). Generation and printing,
in either plugin, reuse it when run as the same OS user with the same CLI configuration.
Changing the working directory does not require another login. Different users, machines,
containers or configuration directories do not automatically share sessions.

`MESHY_CONFIG_DIR` changes the config directory; `MESHY_CREDENTIALS_PATH` overrides the
credential file. Non-production API hosts use `credentials.dev.json` by default. Keep these
settings consistent; do not copy tokens between plugins or read the credential file.
`auth list` reports profile kinds with masked credentials. `auth use <name>` changes the shared
active profile, so do not switch it independently in concurrent workflows.

The CLI refreshes stored OAuth tokens near expiry on its own.

## 6. Existing API keys remain supported

Credential priority is `--api-key` > `MESHY_API_KEY` > explicit `--api-key-file` > stored
active profile. An existing environment key overrides browser login; report `source` when
diagnosing account selection, and do not change the user's environment or account implicitly.

DeepSeek Harness (`DSH_SHELL=1`) removes credential-shaped variables such as `MESHY_API_KEY`
from every shell call, so a key the user exported before starting dsh never reaches the CLI.
There, use the stored browser login (`meshy auth login`) or an explicit `--api-key-file`.

There is no automatic `.env` discovery. If the user chooses a project key file, pass its
explicit path on authenticated commands. In 0.7 **`auth status` ignores `--api-key-file`**,
so verify that branch with a free balance call instead:

```bash
meshy balance --api-key-file ./.env --format json --no-update-check
```

The CLI reads only the key from that file. Do not source or display it. Never ask for an API
key when browser login is available, and never copy keys or tokens into the conversation,
shell profiles or a new skill-managed file. Share masked status and actionable errors only.

## 7. The China site

One Meshy account works on both sites; only the hosts differ. When the user is in mainland China
or asks for the China site, sign in with `--region cn` instead of the plain device login in
section 3, with the same persistent-session procedure (the code is entered at `meshy.cn`):

```bash
meshy auth login --device --region cn --format json --no-update-check
```

The CLI remembers the region on the profile, so later commands call `api.meshy.cn` on their own;
`--region global` on a new login switches back. For an API-key session set `MESHY_REGION=cn`
instead — it is not credential-shaped, so it survives DeepSeek Harness too. `doctor` shows the
resolved origins. Do not move a user to the China site unasked.
