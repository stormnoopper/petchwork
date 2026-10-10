"""Optional upload of raw files to Supabase Storage bucket `etl-raw` (flag --upload-raw).

Default is local only (etl/.raw/<source>/<date>/). Needs SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL)
and SUPABASE_SERVICE_ROLE_KEY in the environment. Keys are never logged.
"""
from __future__ import annotations

import logging
import mimetypes
import os
from pathlib import Path

from . import http

log = logging.getLogger("etl.storage")
BUCKET = "etl-raw"


def upload_dir(local_dir: Path, remote_prefix: str) -> str | None:
    base = os.environ.get("SUPABASE_URL") or os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not base or not key:
        log.warning("--upload-raw set but SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing → local only")
        return None
    headers = {"Authorization": f"Bearer {key}", "apikey": key, "x-upsert": "true"}
    n = 0
    for f in sorted(local_dir.rglob("*")):
        if not f.is_file() or f.name.endswith(".part"):
            continue
        rel = f.relative_to(local_dir).as_posix()
        ctype = mimetypes.guess_type(f.name)[0] or "application/octet-stream"
        with open(f, "rb") as fh:
            http.request(
                "POST",
                f"{base.rstrip('/')}/storage/v1/object/{BUCKET}/{remote_prefix}/{rel}",
                data=fh,
                headers={**headers, "Content-Type": ctype},
            )
        n += 1
    log.info("uploaded %d raw files → %s/%s", n, BUCKET, remote_prefix)
    return f"{BUCKET}/{remote_prefix}"
