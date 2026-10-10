"""HTTP with retry (exponential backoff, 3 retries) + streaming download with sha256."""
from __future__ import annotations

import hashlib
import logging
import time
from pathlib import Path

import requests

log = logging.getLogger("etl.http")

RETRIES = 3
BACKOFF_S = 2.0
TIMEOUT_S = (20, 180)
USER_AGENT = "petchwork-etl/0.1 (Thai Rice Digital Twin; +https://github.com/)"
RETRY_STATUS = {429, 500, 502, 503, 504}

_session = requests.Session()
_session.headers["User-Agent"] = USER_AGENT


class FetchError(RuntimeError):
    pass


def request(method: str, url: str, *, retries: int = RETRIES, backoff: float = BACKOFF_S, **kw) -> requests.Response:
    """Request with retry on connection errors / 429 / 5xx. Sleeps backoff * 2**attempt."""
    kw.setdefault("timeout", TIMEOUT_S)
    last: Exception | None = None
    for attempt in range(retries + 1):
        try:
            r = _session.request(method, url, **kw)
            if r.status_code in RETRY_STATUS and attempt < retries:
                wait = backoff * 2**attempt
                ra = r.headers.get("Retry-After")
                if ra and ra.isdigit():
                    wait = max(wait, min(float(ra), 120))
                log.warning("HTTP %s %s → retry in %.0fs", r.status_code, _short(url), wait)
                time.sleep(wait)
                continue
            r.raise_for_status()
            return r
        except (requests.ConnectionError, requests.Timeout) as e:
            last = e
            if attempt < retries:
                wait = backoff * 2**attempt
                log.warning("%s on %s → retry in %.0fs", type(e).__name__, _short(url), wait)
                time.sleep(wait)
                continue
        except requests.HTTPError as e:
            raise FetchError(f"{e.response.status_code} for {_short(url)}") from e
    raise FetchError(f"giving up on {_short(url)}: {last}")


def get_json(url: str, **kw):
    return request("GET", url, **kw).json()


def head_token(url: str) -> str:
    """Change token from ETag / Last-Modified / Content-Length."""
    r = request("HEAD", url, allow_redirects=True)
    h = r.headers
    return "|".join(x for x in (h.get("ETag", ""), h.get("Last-Modified", ""), h.get("Content-Length", "")) if x)


def download(url: str, dest: Path, *, reuse: bool = True, expected_size: int | None = None) -> str:
    """Stream url → dest (atomic rename). Returns sha256 hex. Reuses an existing file of the right size."""
    dest.parent.mkdir(parents=True, exist_ok=True)
    if reuse and dest.exists() and (expected_size is None or dest.stat().st_size == expected_size):
        return sha256_file(dest)
    tmp = dest.with_suffix(dest.suffix + ".part")
    h = hashlib.sha256()
    r = request("GET", url, stream=True)
    with open(tmp, "wb") as f:
        for chunk in r.iter_content(1 << 20):
            f.write(chunk)
            h.update(chunk)
    tmp.replace(dest)
    return h.hexdigest()


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def sha256_bytes(*parts: bytes | str) -> str:
    h = hashlib.sha256()
    for p in parts:
        h.update(p.encode() if isinstance(p, str) else p)
    return h.hexdigest()


def _short(url: str) -> str:
    return url if len(url) < 140 else url[:137] + "..."
