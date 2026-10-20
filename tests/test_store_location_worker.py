import importlib
import sys
import types
from datetime import datetime, timezone


fake_supabase = types.ModuleType("config.supabase")
fake_supabase.supabase = object()
fake_supabase.get_supabase_client = lambda: object()
sys.modules["config.supabase"] = fake_supabase

fake_backfill = types.ModuleType("jobs.backfill_store_ids")
fake_backfill.run_backfill = lambda **kwargs: {}
fake_backfill.run_indexed_source_store_repair = lambda **kwargs: {}
sys.modules["jobs.backfill_store_ids"] = fake_backfill

from jobs import store_location_worker as worker


def test_invalid_repair_is_disabled_without_source_key(monkeypatch):
    monkeypatch.setattr(worker, "INVALID_REPAIR_SOURCE_RETAILER_KEY", "")
    monkeypatch.setattr(worker, "INVALID_REPAIR_RETAILER_KEY", "")

    assert worker.invalid_repair_enabled() is False
    assert worker.invalid_repair_due(None, now_monotonic=100.0) is False


def test_invalid_repair_due_is_interval_bounded(monkeypatch):
    monkeypatch.setattr(worker, "INVALID_REPAIR_SOURCE_RETAILER_KEY", "wholefoodsv2")
    monkeypatch.setattr(worker, "INVALID_REPAIR_RETAILER_KEY", "wholefoodsv2")
    monkeypatch.setattr(worker, "INVALID_REPAIR_INTERVAL_SECONDS", 1800.0)

    assert worker.invalid_repair_due(None, now_monotonic=100.0) is True
    assert worker.invalid_repair_due(100.0, now_monotonic=1899.0) is False
    assert worker.invalid_repair_due(100.0, now_monotonic=1900.0) is True


def test_invalid_repair_uses_indexed_bounded_wholefoods_path(monkeypatch):
    captured = {}

    def fake_repair(**kwargs):
        captured.update(kwargs)
        return {
            "processed": 250,
            "matched": 250,
            "no_match": 0,
            "errors": 0,
            "pages": 1,
        }

    monkeypatch.setattr(worker, "INVALID_REPAIR_SOURCE_RETAILER_KEY", "wholefoodsv2")
    monkeypatch.setattr(worker, "INVALID_REPAIR_RETAILER_KEY", "wholefoodsv2")
    monkeypatch.setattr(worker, "INVALID_REPAIR_LOOKBACK_DAYS", 7.0)
    monkeypatch.setattr(worker, "INVALID_REPAIR_PAGE_SIZE", 250)
    monkeypatch.setattr(worker, "INVALID_REPAIR_MAX_PAGES", 8)
    monkeypatch.setattr(worker, "run_indexed_source_store_repair", fake_repair)

    now = datetime(2026, 10, 20, 3, 7, tzinfo=timezone.utc)
    stats = worker.run_invalid_existing_repair(now=now)

    assert captured["source_store_retailer_key"] == "wholefoodsv2"
    assert captured["retailer_filter"] == "wholefoodsv2"
    assert captured["dry_run"] is False
    assert captured["created_after"] == "2026-10-13T03:07:00+00:00"
    assert captured["created_before"] == "2026-10-20T03:07:00+00:00"
    assert captured["page_size"] == 250
    assert captured["max_pages"] == 8
    assert stats["enabled"] is True
