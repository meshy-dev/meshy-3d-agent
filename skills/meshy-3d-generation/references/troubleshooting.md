# Troubleshooting (meshy-3d-generation)

Error recovery for Meshy API workflows. For the full error-code reference see [../reference.md](../reference.md#error-handling).

## HTTP Status Handling

| HTTP Status | Meaning | Action |
|---|---|---|
| 401 | Invalid API key | Re-run Step 0 (`check-env`); ask user to check key |
| 402 | Insufficient credits | The CLI auto-queries balance (`GET /openapi/v1/balance`) and prints it — show the current balance to the user, link https://www.meshy.ai/pricing |
| 422 | Cannot process | Explain limitation (e.g., non-humanoid for rigging) |
| 429 | Rate limited | Auto-retry after 5s (max 3 times) |
| 5xx | Server error | Auto-retry after 10s (once) |

## Task `FAILED` Messages

When `poll` exits with `TASK_FAILED: <message>`:

- `"The server is busy..."` → retry with backoff (5s, 10s, 20s)
- `"Internal server error."` → simplify prompt, retry once

## Poll Timeouts

`poll` exits with `TIMEOUT after Ns` when a task outlives the timeout. This is usually NOT a failure — re-invoke `poll` with the same `--task-id` and a larger `--timeout` (the task keeps running server-side). Tasks sitting at 99% for 30–120s are in normal finalization; never restart the task because of a 99% stall.

## Environment Problems

- `ERROR: MESHY_API_KEY not set` → run `check-env`; if `READY: NO_KEY_FOUND`, follow [setup.md](setup.md).
- `PYTHON_REQUESTS: MISSING` → `pip install requests`.
- Key works in the user's terminal but not here → the key may live in a shell profile the agent session didn't source; see the extended diagnostics in [setup.md](setup.md).
