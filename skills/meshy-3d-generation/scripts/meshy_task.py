#!/usr/bin/env python3
# GENERATED from scripts/src/meshy_task.py by scripts/build.py — do not edit directly.
"""Meshy API task runner. Handles create → poll → download.

Dual-use: importable library AND argparse CLI.
Library functions: load_api_key, create_task, poll_task, download,
                   get_project_dir, record_task, save_thumbnail.
"""
# Part of the meshy-3d-agent skill bundle. Source of truth: https://github.com/meshy-dev/meshy-3d-agent

import time
import os
import sys
import re
import json
from datetime import datetime

# Guard requests import so check-env can report MISSING gracefully
try:
    import requests
    _REQUESTS_OK = True
except ImportError:
    _REQUESTS_OK = False

BASE = "https://api.meshy.ai"

# Module-level session — created lazily so import never crashes without requests
_SESSION = None


def _get_session():
    """Return (or create) the shared requests.Session."""
    global _SESSION
    if _SESSION is None:
        if not _REQUESTS_OK:
            sys.exit("ERROR: 'requests' package is not installed. Run: pip install requests")
        _SESSION = requests.Session()
        _SESSION.trust_env = False  # bypass any system proxy settings
    return _SESSION


# Keep the name SESSION accessible for library callers that reference it directly
class _SessionProxy:
    """Proxy that lazily initialises the real session on first attribute access."""
    def __getattr__(self, name):
        return getattr(_get_session(), name)


SESSION = _SessionProxy()


# ---------------------------------------------------------------------------
# API key loading
# ---------------------------------------------------------------------------

def load_api_key():
    """Load MESHY_API_KEY from environment, then .env / .env.local in cwd only.

    Strips surrounding quotes from file values.
    Returns empty string if not found anywhere.
    """
    key = os.environ.get("MESHY_API_KEY", "").strip()
    if key:
        return key
    for dotenv_name in (".env", ".env.local"):
        env_path = os.path.join(os.getcwd(), dotenv_name)
        if os.path.exists(env_path):
            with open(env_path) as f:
                for line in f:
                    line = line.strip()
                    if line.startswith("MESHY_API_KEY=") and not line.startswith("#"):
                        val = line.split("=", 1)[1].strip().strip('"').strip("'")
                        if val:
                            return val
    return ""


def _require_key():
    """Load API key, print first-8-char confirmation, exit if missing."""
    key = load_api_key()
    if not key:
        sys.exit("ERROR: MESHY_API_KEY not set. Run your skill's API key setup step.")
    print(f"API key loaded: {key[:8]}...", file=sys.stderr)
    return key


def _make_headers(key):
    return {"Authorization": f"Bearer {key}"}


# ---------------------------------------------------------------------------
# Core library functions
# ---------------------------------------------------------------------------

def create_task(endpoint, payload):
    """POST to endpoint, handle 401/402/429, return task_id string."""
    key = load_api_key()
    headers = _make_headers(key)
    resp = _get_session().post(f"{BASE}{endpoint}", headers=headers, json=payload, timeout=30)
    if resp.status_code == 401:
        sys.exit("ERROR: Invalid API key (401)")
    if resp.status_code == 402:
        try:
            bal = _get_session().get(f"{BASE}/openapi/v1/balance", headers=headers, timeout=10)
            balance = bal.json().get("balance", "unknown")
            sys.exit(
                f"ERROR: Insufficient credits (402). Current balance: {balance}. "
                f"Top up at https://www.meshy.ai/pricing"
            )
        except Exception:
            sys.exit("ERROR: Insufficient credits (402). Check balance at https://www.meshy.ai/pricing")
    if resp.status_code == 429:
        sys.exit("ERROR: Rate limited (429). Wait and retry.")
    resp.raise_for_status()
    task_id = resp.json()["result"]
    print(f"TASK_CREATED: {task_id}")
    return task_id


def poll_task(endpoint, task_id, timeout=300):
    """Poll task with exponential backoff (5s→30s, fixed 15s at 95%+).

    Returns the full task dict on SUCCEEDED.
    Exits on FAILED/CANCELED/timeout.
    """
    key = load_api_key()
    headers = _make_headers(key)
    elapsed = 0
    delay = 5            # Initial delay: 5s
    max_delay = 30       # Cap: 30s
    backoff = 1.5        # Backoff multiplier
    finalize_delay = 15  # Fixed delay during finalization (95%+)
    poll_count = 0
    while elapsed < timeout:
        poll_count += 1
        resp = _get_session().get(f"{BASE}{endpoint}/{task_id}", headers=headers, timeout=30)
        resp.raise_for_status()
        task = resp.json()
        status = task["status"]
        progress = task.get("progress", 0)
        filled = int(progress / 5)
        bar = f"[{'█' * filled}{'░' * (20 - filled)}] {progress}%"
        print(f"  {bar} — {status} ({elapsed}s, poll #{poll_count})", flush=True)
        if status == "SUCCEEDED":
            return task
        if status in ("FAILED", "CANCELED"):
            msg = task.get("task_error", {}).get("message", "Unknown")
            sys.exit(f"TASK_{status}: {msg}")
        current_delay = finalize_delay if progress >= 95 else delay
        time.sleep(current_delay)
        elapsed += current_delay
        if progress < 95:
            delay = min(delay * backoff, max_delay)
    sys.exit(f"TIMEOUT after {timeout}s ({poll_count} polls)")


def download(url, filepath):
    """Download a file to the given path (within a project directory)."""
    os.makedirs(os.path.dirname(os.path.abspath(filepath)), exist_ok=True)
    print(f"Downloading {filepath}...", flush=True)
    resp = _get_session().get(url, timeout=300, stream=True)
    resp.raise_for_status()
    with open(filepath, "wb") as f:
        for chunk in resp.iter_content(chunk_size=8192):
            f.write(chunk)
    size_mb = os.path.getsize(filepath) / (1024 * 1024)
    print(f"DOWNLOADED: {filepath} ({size_mb:.1f} MB)")


def get_project_dir(task_id, prompt="", task_type="model"):
    """Return (and create) a timestamped project directory under cwd/meshy_output/."""
    output_root = os.path.join(os.getcwd(), "meshy_output")
    os.makedirs(output_root, exist_ok=True)
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    slug = re.sub(r'[^a-z0-9]+', '-', (prompt or task_type).lower())[:30].strip('-')
    folder = f"{timestamp}_{slug}_{task_id[:8]}"
    project_dir = os.path.join(output_root, folder)
    os.makedirs(project_dir, exist_ok=True)
    return project_dir


def record_task(project_dir, task_id, task_type, stage, prompt="", files=None):
    """Update per-project metadata.json and global meshy_output/history.json."""
    output_root = os.path.join(os.getcwd(), "meshy_output")
    os.makedirs(output_root, exist_ok=True)
    history_file = os.path.join(output_root, "history.json")

    meta_path = os.path.join(project_dir, "metadata.json")
    if os.path.exists(meta_path):
        meta = json.load(open(meta_path))
    else:
        meta = {
            "project_name": prompt or task_type,
            "folder": os.path.basename(project_dir),
            "root_task_id": task_id,
            "created_at": datetime.now().isoformat(),
            "updated_at": datetime.now().isoformat(),
            "tasks": [],
        }
    meta["tasks"].append({
        "task_id": task_id,
        "task_type": task_type,
        "stage": stage,
        "files": files or [],
        "created_at": datetime.now().isoformat(),
    })
    meta["updated_at"] = datetime.now().isoformat()
    json.dump(meta, open(meta_path, "w"), indent=2)

    # Update global history
    if os.path.exists(history_file):
        history = json.load(open(history_file))
    else:
        history = {"version": 1, "projects": []}
    folder = os.path.basename(project_dir)
    entry = next((p for p in history["projects"] if p["folder"] == folder), None)
    if entry:
        entry["task_count"] = len(meta["tasks"])
        entry["updated_at"] = meta["updated_at"]
    else:
        history["projects"].append({
            "folder": folder,
            "prompt": prompt,
            "task_type": task_type,
            "root_task_id": task_id,
            "created_at": meta["created_at"],
            "updated_at": meta["updated_at"],
            "task_count": len(meta["tasks"]),
        })
    json.dump(history, open(history_file, "w"), indent=2)


def save_thumbnail(project_dir, url):
    """Download thumbnail.png into project_dir; skip if exists; swallow errors."""
    path = os.path.join(project_dir, "thumbnail.png")
    if os.path.exists(path):
        return
    try:
        r = _get_session().get(url, timeout=15)
        r.raise_for_status()
        open(path, "wb").write(r.content)
    except Exception:
        pass


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def _cmd_check_env(args):
    """Print environment readiness report. Exit 0 if key found, 1 if not."""
    # ENV_VAR check
    env_val = os.environ.get("MESHY_API_KEY", "")
    if env_val:
        print(f"ENV_VAR: FOUND ({env_val[:8]}...)")
    else:
        print("ENV_VAR: NOT_FOUND")

    # .env / .env.local check (cwd only — no shell profile scanning)
    for dotenv_name in (".env", ".env.local"):
        env_path = os.path.join(os.getcwd(), dotenv_name)
        if os.path.exists(env_path):
            print(f"DOTENV({dotenv_name}): FOUND")
        else:
            print(f"DOTENV({dotenv_name}): NOT_FOUND")

    # requests availability
    if _REQUESTS_OK:
        print("PYTHON_REQUESTS: OK")
    else:
        print("PYTHON_REQUESTS: MISSING")

    # Final verdict
    key = load_api_key()
    if key:
        print(f"READY: key={key[:8]}...")
        sys.exit(0)
    else:
        print("READY: NO_KEY_FOUND")
        sys.exit(1)


def _cmd_balance(args):
    key = _require_key()
    headers = _make_headers(key)
    resp = _get_session().get(f"{BASE}/openapi/v1/balance", headers=headers, timeout=30)
    resp.raise_for_status()
    print(json.dumps(resp.json(), indent=2))


def _cmd_create(args):
    key = _require_key()
    headers = _make_headers(key)
    if args.payload_file:
        with open(args.payload_file) as f:
            payload = json.load(f)
    else:
        payload = json.loads(args.payload)

    resp = _get_session().post(f"{BASE}{args.endpoint}", headers=headers, json=payload, timeout=30)
    if resp.status_code == 401:
        sys.exit("ERROR: Invalid API key (401)")
    if resp.status_code == 402:
        try:
            bal = _get_session().get(f"{BASE}/openapi/v1/balance", headers=headers, timeout=10)
            balance = bal.json().get("balance", "unknown")
            sys.exit(
                f"ERROR: Insufficient credits (402). Current balance: {balance}. "
                f"Top up at https://www.meshy.ai/pricing"
            )
        except Exception:
            sys.exit("ERROR: Insufficient credits (402). Check balance at https://www.meshy.ai/pricing")
    if resp.status_code == 429:
        sys.exit("ERROR: Rate limited (429). Wait and retry.")
    resp.raise_for_status()
    task_id = resp.json()["result"]
    # Human-readable line to stderr; raw id as last stdout line for $(...) capture
    print(f"TASK_CREATED: {task_id}", file=sys.stderr)
    print(task_id)


def _cmd_get(args):
    key = _require_key()
    headers = _make_headers(key)
    resp = _get_session().get(f"{BASE}{args.endpoint}/{args.task_id}", headers=headers, timeout=30)
    resp.raise_for_status()
    task = resp.json()
    if args.save:
        with open(args.save, "w") as f:
            json.dump(task, f, indent=2)
        print(f"Saved full task JSON to {args.save}", file=sys.stderr)
    # Compact summary
    print(f"status:            {task.get('status')}")
    print(f"progress:          {task.get('progress', 0)}")
    print(f"face_count:        {task.get('face_count')}")
    print(f"consumed_credits:  {task.get('consumed_credits')}")


def _cmd_poll(args):
    key = _require_key()
    headers = _make_headers(key)

    # Inline poll so we use the already-loaded key/headers
    endpoint = args.endpoint
    task_id = args.task_id
    timeout = args.timeout
    elapsed = 0
    delay = 5
    max_delay = 30
    backoff = 1.5
    finalize_delay = 15
    poll_count = 0
    task = None
    while elapsed < timeout:
        poll_count += 1
        resp = _get_session().get(f"{BASE}{endpoint}/{task_id}", headers=headers, timeout=30)
        resp.raise_for_status()
        task = resp.json()
        status = task["status"]
        progress = task.get("progress", 0)
        filled = int(progress / 5)
        bar = f"[{'█' * filled}{'░' * (20 - filled)}] {progress}%"
        print(f"  {bar} — {status} ({elapsed}s, poll #{poll_count})", flush=True)
        if status == "SUCCEEDED":
            break
        if status in ("FAILED", "CANCELED"):
            msg = task.get("task_error", {}).get("message", "Unknown")
            sys.exit(f"TASK_{status}: {msg}")
        current_delay = finalize_delay if progress >= 95 else delay
        time.sleep(current_delay)
        elapsed += current_delay
        if progress < 95:
            delay = min(delay * backoff, max_delay)
    else:
        sys.exit(f"TIMEOUT after {timeout}s ({poll_count} polls)")

    print(f"TASK_SUCCEEDED: {task_id}")
    model_urls = task.get("model_urls", {})
    if model_urls:
        print(f"MODEL_URLS: {', '.join(model_urls.keys())}")
    thumb = task.get("thumbnail_url")
    print(f"THUMBNAIL_URL: {'yes' if thumb else 'no'}")
    print(f"CONSUMED_CREDITS: {task.get('consumed_credits')}")

    if args.project_dir:
        task_json_path = os.path.join(args.project_dir, f"task_{task_id}.json")
        os.makedirs(args.project_dir, exist_ok=True)
        with open(task_json_path, "w") as f:
            json.dump(task, f, indent=2)
        print(f"TASK_JSON: {task_json_path}")


def _cmd_download(args):
    _require_key()
    if args.url:
        url = args.url
    else:
        with open(args.task_json) as f:
            task = json.load(f)
        fmt = args.format or "glb"
        if fmt == "thumbnail":
            url = task.get("thumbnail_url")
        else:
            url = task.get("model_urls", {}).get(fmt)
        if not url:
            sys.exit(f"ERROR: No URL found for format '{fmt}' in task JSON")
    download(url, args.output)


def _cmd_project_dir(args):
    # project_dir prints the path as the only stdout line for $(...) capture
    # Status/key messages go to stderr
    _require_key()
    path = get_project_dir(args.task_id, prompt=args.prompt or "", task_type=args.task_type or "model")
    print(path)


def _cmd_record(args):
    _require_key()
    files = [f.strip() for f in args.files.split(",")] if args.files else []
    record_task(args.project_dir, args.task_id, args.task_type, args.stage,
                prompt=args.prompt or "", files=files)
    print(f"Recorded task {args.task_id} in {args.project_dir}")


def _cmd_thumbnail(args):
    _require_key()
    if args.url:
        url = args.url
    else:
        with open(args.task_json) as f:
            task = json.load(f)
        url = task.get("thumbnail_url")
        if not url:
            sys.exit("ERROR: No thumbnail_url in task JSON")
    save_thumbnail(args.project_dir, url)
    path = os.path.join(args.project_dir, "thumbnail.png")
    if os.path.exists(path):
        print(f"THUMBNAIL: {path}")
    else:
        print("THUMBNAIL: skipped (already exists or download failed)")


def _cmd_check_faces(args):
    key = _require_key()
    headers = _make_headers(key)
    resp = _get_session().get(f"{BASE}{args.endpoint}/{args.task_id}", headers=headers, timeout=30)
    resp.raise_for_status()
    task = resp.json()
    face_count = task.get("face_count", 0)
    max_faces = args.max_faces
    print(f"FACE_COUNT: {face_count} (limit: {max_faces})")
    if face_count > max_faces:
        print(
            f"ERROR: Model has {face_count:,} faces (limit: {max_faces:,}). Remesh first:\n"
            f"  create_task('/openapi/v1/remesh', {{'input_task_id': '{args.task_id}', 'target_polycount': 100000}})"
        )
        sys.exit(1)


def main():
    import argparse

    parser = argparse.ArgumentParser(
        prog="meshy_task",
        description="Meshy API task runner — create, poll, download, and manage tasks.",
    )
    sub = parser.add_subparsers(dest="command", required=True)

    # check-env
    sub.add_parser("check-env", help="Print environment readiness report")

    # balance
    sub.add_parser("balance", help="GET /openapi/v1/balance and print JSON")

    # create
    p_create = sub.add_parser("create", help="Create a task")
    p_create.add_argument("--endpoint", required=True, help="API endpoint, e.g. /openapi/v2/text-to-3d")
    grp = p_create.add_mutually_exclusive_group(required=True)
    grp.add_argument("--payload", help="JSON payload string")
    grp.add_argument("--payload-file", dest="payload_file", help="Path to JSON payload file")

    # get
    p_get = sub.add_parser("get", help="GET a task and print compact summary")
    p_get.add_argument("--endpoint", required=True)
    p_get.add_argument("--task-id", dest="task_id", required=True)
    p_get.add_argument("--save", help="Write full task JSON to this path")

    # poll
    p_poll = sub.add_parser("poll", help="Poll a task until completion")
    p_poll.add_argument("--endpoint", required=True)
    p_poll.add_argument("--task-id", dest="task_id", required=True)
    p_poll.add_argument("--timeout", type=int, default=300)
    p_poll.add_argument("--project-dir", dest="project_dir", help="Save task JSON here on success")

    # download
    p_dl = sub.add_parser("download", help="Download a model or thumbnail")
    p_dl.add_argument("--output", required=True, help="Output file path")
    grp_dl = p_dl.add_mutually_exclusive_group(required=True)
    grp_dl.add_argument("--url", help="Direct URL to download")
    grp_dl.add_argument("--task-json", dest="task_json", help="Path to task JSON file")
    p_dl.add_argument("--format", default=None,
                      help="Model format key (glb, fbx, …) or 'thumbnail'. Default: glb")

    # project-dir
    p_pd = sub.add_parser("project-dir", help="Create and print a project directory path")
    p_pd.add_argument("--task-id", dest="task_id", required=True)
    p_pd.add_argument("--prompt", default="")
    p_pd.add_argument("--task-type", dest="task_type", default="model")

    # record
    p_rec = sub.add_parser("record", help="Record a task in metadata.json and history.json")
    p_rec.add_argument("--project-dir", dest="project_dir", required=True)
    p_rec.add_argument("--task-id", dest="task_id", required=True)
    p_rec.add_argument("--task-type", dest="task_type", required=True)
    p_rec.add_argument("--stage", required=True)
    p_rec.add_argument("--prompt", default="")
    p_rec.add_argument("--files", default="", help="Comma-separated file paths")

    # thumbnail
    p_thumb = sub.add_parser("thumbnail", help="Save thumbnail into a project directory")
    p_thumb.add_argument("--project-dir", dest="project_dir", required=True)
    grp_th = p_thumb.add_mutually_exclusive_group(required=True)
    grp_th.add_argument("--url")
    grp_th.add_argument("--task-json", dest="task_json")

    # check-faces
    p_cf = sub.add_parser("check-faces", help="Check face count against a limit")
    p_cf.add_argument("--endpoint", required=True)
    p_cf.add_argument("--task-id", dest="task_id", required=True)
    p_cf.add_argument("--max-faces", dest="max_faces", type=int, default=300000)

    args = parser.parse_args()

    dispatch = {
        "check-env": _cmd_check_env,
        "balance": _cmd_balance,
        "create": _cmd_create,
        "get": _cmd_get,
        "poll": _cmd_poll,
        "download": _cmd_download,
        "project-dir": _cmd_project_dir,
        "record": _cmd_record,
        "thumbnail": _cmd_thumbnail,
        "check-faces": _cmd_check_faces,
    }
    dispatch[args.command](args)


if __name__ == "__main__":
    main()
