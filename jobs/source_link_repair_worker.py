# jobs/source_link_repair_worker.py
"""Continuous Railway worker for recent source-link/canonical reconciliation."""

from __future__ import annotations

import logging
import os
import time

from config.supabase import supabase

logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO").upper(),
    format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
)
logger = logging.getLogger("SOURCE_LINK_REPAIR_WORKER")

BATCH_SIZE = int(os.getenv("SOURCE_LINK_BATCH_SIZE", "3000"))
MISSING_SOURCE_BATCH = int(os.getenv("SOURCE_LINK_MISSING_SOURCE_BATCH", "250"))
FINALIZE_BATCH = int(os.getenv("SOURCE_LINK_FINALIZE_BATCH", "500"))
IDENTITY_BATCH = int(os.getenv("SOURCE_LINK_IDENTITY_BATCH", "500"))
ACTIVE_SLEEP_SECONDS = float(os.getenv("SOURCE_LINK_ACTIVE_SLEEP_SECONDS", "1"))
IDLE_SLEEP_SECONDS = float(os.getenv("SOURCE_LINK_IDLE_SLEEP_SECONDS", "10"))
ERROR_SLEEP_SECONDS = float(os.getenv("SOURCE_LINK_ERROR_SLEEP_SECONDS", "10"))
SINCE_INTERVAL = os.getenv("SOURCE_LINK_SINCE_INTERVAL", "2 days")


def _rpc(name: str, params: dict | None = None):
    result = supabase.rpc(name, params or {}).execute()
    return result.data


def run_cycle() -> dict:
    existing = _rpc(
        "v27_reconcile_recent_existing_sources",
        {"p_limit": BATCH_SIZE, "p_since": SINCE_INTERVAL},
    )
    missing = _rpc(
        "v27_create_missing_sources_recent_fast",
        {"p_limit": MISSING_SOURCE_BATCH, "p_since": SINCE_INTERVAL},
    )
    finalize = _rpc(
        "v27_existing_mapping_finalize_batch_tick",
        {"p_limit": FINALIZE_BATCH},
    )
    identity = _rpc(
        "v27_source_identity_refresh_tick",
        {"p_limit": IDENTITY_BATCH},
    )

    result = {
        "existing": existing,
        "missing_sources": missing,
        "finalize": finalize,
        "identity": identity,
    }
    logger.info("repair_cycle=%s", result)
    return result


def _has_work(result: dict) -> bool:
    text = str(result).lower()
    return not (
        "'status': 'empty'" in text
        or '"status": "empty"' in text
    )


def main() -> None:
    logger.info(
        "Source-link repair worker started batch=%s missing_batch=%s finalize=%s identity=%s since=%s",
        BATCH_SIZE,
        MISSING_SOURCE_BATCH,
        FINALIZE_BATCH,
        IDENTITY_BATCH,
        SINCE_INTERVAL,
    )
    while True:
        try:
            result = run_cycle()
            time.sleep(ACTIVE_SLEEP_SECONDS if _has_work(result) else IDLE_SLEEP_SECONDS)
        except KeyboardInterrupt:
            logger.info("Worker interrupted, exiting")
            return
        except Exception:
            logger.exception("Repair cycle failed")
            time.sleep(ERROR_SLEEP_SECONDS)


if __name__ == "__main__":
    main()
