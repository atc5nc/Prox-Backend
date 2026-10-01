import logging
import os
import time
from typing import Any

import httpx
from dotenv import load_dotenv

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    raise EnvironmentError("SUPABASE_URL and SUPABASE_KEY must be set")

BATCH_SIZE = max(100, min(int(os.getenv("SOURCE_LINK_BATCH_SIZE", "3000")), 5000))
SINCE_HOURS = max(1, min(int(os.getenv("SOURCE_LINK_SINCE_HOURS", "48")), 168))
IDLE_SLEEP_SECONDS = float(os.getenv("SOURCE_LINK_IDLE_SLEEP_SECONDS", "2"))
ERROR_SLEEP_SECONDS = float(os.getenv("SOURCE_LINK_ERROR_SLEEP_SECONDS", "5"))
RPC_TIMEOUT_SECONDS = float(os.getenv("SOURCE_LINK_RPC_TIMEOUT_SECONDS", "240"))

logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO"),
    format="%(asctime)s %(levelname)s %(message)s",
)
logger = logging.getLogger("v27-source-link-repair-worker")

HEADERS = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
}

client = httpx.Client(
    base_url=f"{SUPABASE_URL.rstrip('/')}/rest/v1",
    headers=HEADERS,
    timeout=httpx.Timeout(RPC_TIMEOUT_SECONDS, connect=10.0),
    http2=False,
)

def rpc(name: str, payload: dict[str, Any]) -> Any:
    response = client.post(f"/rpc/{name}", json=payload)
    response.raise_for_status()
    return response.json()

def main() -> None:
    logger.info(
        "source-link repair worker started batch_size=%s since_hours=%s timeout=%ss",
        BATCH_SIZE,
        SINCE_HOURS,
        RPC_TIMEOUT_SECONDS,
    )

    while True:
        started = time.monotonic()
        try:
            result = rpc(
                "v27_reconcile_recent_existing_sources",
                {
                    "p_limit": BATCH_SIZE,
                    "p_since": f"{SINCE_HOURS} hours",
                },
            )
            elapsed = time.monotonic() - started
            status = result.get("status") if isinstance(result, dict) else None
            logger.info("repair result=%s elapsed=%.2fs", result, elapsed)

            if status in {"empty", "no_existing_sources"}:
                time.sleep(IDLE_SLEEP_SECONDS)
            elif status == "skipped_overlap":
                time.sleep(1.0)
        except httpx.TimeoutException:
            logger.exception(
                "repair RPC timed out after %.2fs; sleeping before retry",
                time.monotonic() - started,
            )
            time.sleep(ERROR_SLEEP_SECONDS)
        except Exception:
            logger.exception("repair worker error")
            time.sleep(ERROR_SLEEP_SECONDS)

if __name__ == "__main__":
    main()
