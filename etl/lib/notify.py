"""Notify ETL_ALERT_WEBHOOK (Slack / Discord / generic JSON) — never raises."""
from __future__ import annotations

import logging
import os

import requests

log = logging.getLogger("etl.notify")

ICON = {"success": "✅", "skipped": "⏭", "dry_run": "🧪", "blocked": "⚠️", "failed": "❌"}


def notify(results: list[dict]) -> None:
    url = os.environ.get("ETL_ALERT_WEBHOOK")
    if not url or not results:
        return
    lines = [
        f"{ICON.get(r['status'], '•')} {r['source']}: {r['status']}"
        + (f" ({r.get('rows')} rows)" if r.get("rows") is not None else "")
        + (f" — {r['message']}" if r.get("message") else "")
        for r in results
    ]
    text = "Thai Rice Digital Twin ETL\n" + "\n".join(lines)
    try:
        # Slack uses `text`, Discord uses `content`; extra keys are ignored by both.
        requests.post(url, json={"text": text, "content": text[:1900]}, timeout=15)
    except Exception as e:  # webhook failures must not fail the ETL
        log.warning("webhook notify failed: %s", type(e).__name__)
