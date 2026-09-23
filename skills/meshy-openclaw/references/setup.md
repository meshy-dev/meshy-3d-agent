# Runner, login and output locations

Everything here is shared by both Meshy skills. Three things are settled before any job
starts: **how to run the CLI**, **whether a session already exists**, and **where files go**.
The supported CLI is **0.4.0** on **Node.js 22.12 or newer**. No Python, request wrapper or
separate token store is involved.

## 1. Resolve the runner

```bash
node --version
meshy --version
```

| Observation | Runner to use for every command below |
|---|---|
| `meshy --version` prints `0.4.0` | `meshy` |
| no `meshy` command, or another version | `npm exec --yes --package=meshy-cli@0.4.0 -- meshy` |
| no Node.js, or Node older than 22.12 | stop and report it: the user installs Node.js 22.12+ |

Recipes are written as `meshy …`. When the pinned temporary package is the runner, put
`npm exec --yes --package=meshy-cli@0.4.0 --` in front of the same arguments; the exit code
and the JSON on stdout are forwarded unchanged. Example:

```bash
npm exec --yes --package=meshy-cli@0.4.0 -- meshy auth status --format json --no-update-check
```

The first such call downloads the package into the npm cache; later calls reuse it, in any
working directory. Nothing is installed globally and no existing installation is touched.
A global `npm install -g meshy-cli@0.4.0` is optional and only worth proposing when the user
wants faster startup — never as a precondition for the first job, and never as a silent
downgrade of a newer global CLI. Do not install with `sudo` or change system policy; if a
global install is refused by the host, keep using the temporary package. On Windows the
runner is the same command through `npm.cmd` in a shell that resolves it.

A missing `npm` with a working Node.js means the host stripped npm: report that and fall back
to asking the user to install the CLI themselves.

Local diagnostics, once a runner is chosen:

```bash
meshy doctor --output-schema v1 --format json --no-update-check
```

`doctor` is local unless `--check-api` is supplied. Check its resolved API origins before
sending credentials; production is `api.meshy.ai` and browser authorization is `www.meshy.ai`.
Preserve a user-authorized custom environment, and investigate an unexpected override.

## 2. Reuse a working session before logging in

```bash
meshy auth status --format json --no-update-check
```

In 0.4.0 the auth commands emit **bare JSON**, even with `--output-schema v1`. Read
`authenticated`, `verified`, `source` and `hint` at the top level, together with the exit code:

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

After showing the link, your next action is to await the **same** running tool session.
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
Other hosts should use their equivalent running-command wait tool. Send a brief progress
update during a long wait without ending the turn. Stop waiting on a terminal login error,
actual code expiry, user cancellation, or an explicit host limitation; report the reason.
Do not create recurring automations or a second task to keep a login alive.

The process keeps polling until the user approves or the code expires. While it polls, do not
start a second login, do not kill it, and do not ask the user to paste anything. On approval it
writes `{"status":"logged_in", … "verified": true}` to stdout and exits 0. Then:

1. Re-run `auth status`; `verified: true` is the proof, not the exit code of `login`.
2. **Continue the request the user originally made**, with the same inputs, output path and
   budget they already gave. Logging in is not the deliverable.

Failure branches — each is a different recovery, so read the error rather than retrying blindly:

- **Browser never opened / user is on another device**: the URL and code in the stderr line are
  all they need; they can open it anywhere they are signed in to Meshy.
- **Code expired or was denied** (the login exits non-zero after polling): run the *same* login
  command again for a fresh code. Never re-run a paid create because a login timed out.
- **`device_flow_not_supported`**: this API host has no device endpoint. Ask the user to run
  `meshy auth login` in their own desktop terminal (loopback + browser), or to store their own
  key with `meshy auth login --with-key <key>` privately. Never ask for the key in chat.
- **Host cannot keep a process alive at all**: fall back to the user running the login command
  in their own terminal, then re-check `auth status` and resume. This is the only case where a
  manual terminal step is acceptable.

Do not use `--no-wait`: its JSON contains a `device_code`, which is a bearer secret. Do not use
`--manual` from an agent — it prompts on stdin for a pasted code. Do not force GUI mode with
test environment variables, and never print tokens, device codes or signed URLs.

## 4. Where files go

Two paths decide every write. Resolve them from the user's own words *before* the first command:

| The user named | `WORKSPACE` (the write boundary) | `PROJECT_ROOT` (bookkeeping) | Final model file |
|---|---|---|---|
| nothing | `./meshy_output` | `./meshy_output` | inside the project folder |
| a directory, e.g. `./assets` | `./assets` | `./assets/meshy_output` | `./assets/<descriptive-name>.<ext>` |
| a file, e.g. `./assets/chest.glb` | `./assets` | `./assets/meshy_output` | exactly `./assets/chest.glb` |

`./meshy_output` is only the **default**, never an override: a path the user asked for wins.
When the named directory is itself called `meshy_output`, `PROJECT_ROOT` is that directory
(no nested `meshy_output/meshy_output`). Quote paths with spaces or non-ASCII characters as
single shell arguments; they need no other special handling.

Every command that writes carries `--workspace WORKSPACE`, so the CLI refuses any path that
escapes it, follows a symlink out of it, or lands on a directory that was swapped since the
command started. Keep one workspace per job: the project folder, task snapshots and delivered
files all live inside it. Say the output location when the job starts.

Existing files are never silently replaced: the CLI refuses to overwrite unless `--overwrite`
is passed, so an existing `chest.glb` is a decision — a new name or an explicit overwrite —
covered by what the user already authorized, not a silent clobber.

A file delivered to the user's own path is outside the project folder, so the project records the
task and stage while the CLI reports `files_outside_project`. That warning is the normal result of
honouring a requested path; it is not an error and never a reason to move the file back.

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

The CLI refreshes stored OAuth tokens near expiry. Skills just invoke the CLI; they do not
implement refresh, locks or credential persistence.

## 6. Existing API keys remain supported

Credential priority is `--api-key` > `MESHY_API_KEY` > explicit `--api-key-file` > stored
active profile. An existing environment key overrides browser login; report `source` when
diagnosing account selection, and do not change the user's environment or account implicitly.

There is no automatic `.env` discovery. If the user chooses a project key file, pass its
explicit path on authenticated commands. In 0.4.0 **`auth status` ignores `--api-key-file`**,
so verify that branch with a free balance call instead:

```bash
meshy balance --api-key-file ./.env --output-schema v1 --format json --no-update-check
```

The CLI reads only the key from that file. Do not source or display it. Never ask for an API
key when browser login is available, and never copy keys or tokens into the conversation,
shell profiles or a new skill-managed file. Share masked status and actionable errors only.
