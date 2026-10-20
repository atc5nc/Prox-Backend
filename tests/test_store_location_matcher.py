import sys
import types
from enum import Enum

import pytest


fake_supabase = types.ModuleType("config.supabase")
fake_supabase.get_supabase_client = lambda: object()
fake_supabase.supabase = object()
sys.modules["config.supabase"] = fake_supabase

fake_postgrest = types.ModuleType("postgrest")
fake_postgrest_types = types.ModuleType("postgrest.types")


class FakeReturnMethod(Enum):
    minimal = "minimal"
    representation = "representation"


fake_postgrest_types.ReturnMethod = FakeReturnMethod
fake_postgrest.types = fake_postgrest_types
sys.modules["postgrest"] = fake_postgrest
sys.modules["postgrest.types"] = fake_postgrest_types

from services import store_location_matcher as matcher
from jobs import backfill_store_ids as backfill


@pytest.mark.parametrize(
    "store",
    [
        {"latitude": None, "longitude": -118.0},
        {"latitude": 34.0, "longitude": None},
        {"latitude": 0, "longitude": 0},
        {"latitude": 91, "longitude": 0},
        {"latitude": -91, "longitude": 0},
        {"latitude": 0, "longitude": 181},
        {"latitude": 0, "longitude": -181},
        {"latitude": float("nan"), "longitude": -118},
        {"latitude": 34, "longitude": float("inf")},
    ],
)
def test_invalid_coordinates_are_rejected(store):
    assert matcher._coords(store) is None


def test_valid_coordinates_are_accepted():
    assert matcher._coords({"latitude": 34.0983, "longitude": -118.3267}) == (
        34.0983,
        -118.3267,
    )


def test_exact_zip_never_selects_zero_zero(monkeypatch):
    stores = [
        {
            "id": 10,
            "retailer_key": "wholefoods",
            "zip_code": "90046",
            "latitude": 0,
            "longitude": 0,
        },
        {
            "id": 20,
            "retailer_key": "wholefoods",
            "zip_code": "90046",
            "latitude": 34.0983,
            "longitude": -118.3267,
        },
    ]
    monkeypatch.setattr(matcher, "_load_retailer_stores", lambda key: stores)
    monkeypatch.setattr(matcher, "_get_zip_centroid", lambda zip_code: (34.098, -118.327))

    result = matcher.find_store_for_deal(
        retailer_key="wholefoodsv2",
        retailer_raw="Whole Foods Market",
        zip_code="90046",
    )

    assert result.store_id == 20
    assert result.store_retailer_key == "wholefoods"
    assert result.match_confidence == "zip_single"


def test_invalid_exact_zip_falls_through_to_valid_nearby(monkeypatch):
    stores = [
        {
            "id": 10,
            "retailer_key": "wholefoods",
            "zip_code": "90046",
            "latitude": 0,
            "longitude": 0,
        },
        {
            "id": 30,
            "retailer_key": "wholefoods",
            "zip_code": "90048",
            "latitude": 34.0749,
            "longitude": -118.3766,
        },
    ]
    monkeypatch.setattr(matcher, "_load_retailer_stores", lambda key: stores)
    monkeypatch.setattr(matcher, "_get_zip_centroid", lambda zip_code: (34.098, -118.327))

    result = matcher.find_store_for_deal(
        retailer_key="wholefoodsv2",
        retailer_raw="Whole Foods Market",
        zip_code="90046",
        max_nearby_miles=15,
    )

    assert result.store_id == 30
    assert result.matched_by == "nearest_within_radius"
    assert result.distance_miles is not None
    assert result.distance_miles < 15


def test_all_invalid_stores_return_no_match(monkeypatch):
    stores = [
        {
            "id": 10,
            "retailer_key": "wholefoods",
            "zip_code": "90046",
            "latitude": 0,
            "longitude": 0,
        },
        {
            "id": 11,
            "retailer_key": "wholefoods",
            "zip_code": "90046",
            "latitude": None,
            "longitude": None,
        },
    ]
    monkeypatch.setattr(matcher, "_load_retailer_stores", lambda key: stores)
    monkeypatch.setattr(matcher, "_load_retailer_stores_by_exact_name", lambda raw: [])

    result = matcher.find_store_for_deal(
        retailer_key="wholefoodsv2",
        retailer_raw="Whole Foods Market",
        zip_code="90046",
    )

    assert result.store_id is None


def test_wholefoodsv2_uses_only_canonical_wholefoods_catalog(monkeypatch):
    calls = []
    stores = [
        {
            "id": 20,
            "retailer_key": "wholefoods",
            "zip_code": "90046",
            "latitude": 34.0983,
            "longitude": -118.3267,
        }
    ]

    def load(key):
        calls.append(key)
        return stores if key == "wholefoods" else []

    monkeypatch.setattr(matcher, "_load_retailer_stores", load)
    monkeypatch.setattr(
        matcher,
        "_load_retailer_stores_by_exact_name",
        lambda raw: (_ for _ in ()).throw(AssertionError("legacy fallback must not run")),
    )
    monkeypatch.setattr(matcher, "_get_zip_centroid", lambda zip_code: (34.098, -118.327))

    result = matcher.find_store_for_deal(
        retailer_key="wholefoodsv2",
        retailer_raw="Whole Foods Market",
        zip_code="90046",
    )

    assert result.store_id == 20
    assert calls == ["wholefoods"]


def test_indexed_repair_page_cap_env_override(monkeypatch):
    monkeypatch.setenv("STORE_LOCATION_INDEXED_REPAIR_MAX_PAGES", "21")
    assert backfill._effective_indexed_repair_max_pages(1) == 21


def test_indexed_repair_page_cap_falls_back_on_invalid_env(monkeypatch):
    monkeypatch.setenv("STORE_LOCATION_INDEXED_REPAIR_MAX_PAGES", "not-an-int")
    assert backfill._effective_indexed_repair_max_pages(7) == 7


def test_source_store_partition_bounds_are_inclusive():
    assert backfill._filter_source_store_ids([10, 20, 30, 40], 20, 30) == [20, 30]


def test_source_store_partition_bounds_can_be_one_sided():
    assert backfill._filter_source_store_ids([10, 20, 30, 40], 30, None) == [30, 40]
    assert backfill._filter_source_store_ids([10, 20, 30, 40], None, 20) == [10, 20]


def test_store_repair_splits_lock_timeout_failures():
    exc = Exception({"code": "55P03", "message": "canceling statement due to lock timeout"})
    assert backfill._is_split_retryable_write_error(exc)


def test_store_repair_splits_statement_timeout_failures():
    exc = Exception({"code": "57014", "message": "canceling statement due to statement timeout"})
    assert backfill._is_split_retryable_write_error(exc)


def test_store_repair_does_not_split_unrelated_write_failures():
    exc = Exception({"code": "23505", "message": "duplicate key"})
    assert not backfill._is_split_retryable_write_error(exc)


def test_indexed_range_write_accepts_full_single_payload_page():
    page = [{"id": 1}, {"id": 2}]
    match = matcher.StoreMatchResult(11461, "nearby_single", 1, "nearest_within_radius")
    payload = backfill._single_payload_for_full_page(page, [(1, match), (2, match)])
    assert payload == {
        "store_id": 11461,
        "match_confidence": "nearby_single",
        "candidate_store_count": 1,
        "matched_by": "nearest_within_radius",
    }


def test_indexed_range_write_rejects_mixed_or_partial_pages():
    page = [{"id": 1}, {"id": 2}]
    first = matcher.StoreMatchResult(11461, "nearby_single", 1, "nearest_within_radius")
    second = matcher.StoreMatchResult(11462, "nearby_single", 1, "nearest_within_radius")
    assert backfill._single_payload_for_full_page(page, [(1, first), (2, second)]) is None
    assert backfill._single_payload_for_full_page(page, [(1, first)]) is None


def test_store_repair_update_requests_minimal_representation(monkeypatch):
    captured = {}

    class FakeTable:
        def update(self, payload, **kwargs):
            captured["payload"] = payload
            captured.update(kwargs)
            return self

    class FakeClient:
        def table(self, name):
            captured["table"] = name
            return FakeTable()

    monkeypatch.setattr(backfill, "supabase", FakeClient())
    builder = backfill._minimal_update("flyer_deals", {"store_id": 123})

    assert isinstance(builder, FakeTable)
    assert captured["table"] == "flyer_deals"
    assert captured["payload"] == {"store_id": 123}
    assert captured["returning"] == backfill.ReturnMethod.minimal


def test_indexed_range_runs_split_mixed_page_contiguously():
    page = [{"id": 1}, {"id": 3}, {"id": 5}, {"id": 7}]
    first = matcher.StoreMatchResult(11461, "nearby_single", 1, "nearest_within_radius")
    second = matcher.StoreMatchResult(11462, "zip_single", 1, "zip_code")

    runs = backfill._payload_runs_for_full_page(
        page,
        [(1, first), (3, first), (5, second), (7, second)],
    )

    assert runs is not None
    assert [(run[0], run[1], len(run[3])) for run in runs] == [
        (1, 3, 2),
        (5, 7, 2),
    ]
    assert runs[0][2]["store_id"] == 11461
    assert runs[1][2]["store_id"] == 11462


def test_indexed_range_runs_require_page_pair_alignment():
    page = [{"id": 1}, {"id": 2}]
    match = matcher.StoreMatchResult(11461, "nearby_single", 1, "nearest_within_radius")
    assert backfill._payload_runs_for_full_page(page, [(2, match), (1, match)]) is None


def test_whole_foods_uses_20_mile_default_radius(monkeypatch):
    stores = [
        {
            "id": 11224,
            "retailer_key": "wholefoods",
            "zip_code": "91784",
            "latitude": 34.1356,
            "longitude": -117.6598,
        }
    ]
    monkeypatch.setattr(matcher, "_load_retailer_stores", lambda key: stores)
    monkeypatch.setattr(matcher, "_get_zip_centroid", lambda zip_code: (33.9533, -117.3962))
    monkeypatch.setattr(matcher, "_haversine", lambda *args: 19.34)

    result = matcher.find_store_for_deal(
        retailer_key="wholefoodsv2",
        retailer_raw="Whole Foods Market",
        zip_code="92503",
    )

    assert result.store_id == 11224
    assert result.store_retailer_key == "wholefoods"
    assert result.matched_by == "nearest_within_radius"
    assert result.distance_miles == 19.34


def test_non_overridden_retailer_still_uses_15_mile_default_radius(monkeypatch):
    stores = [
        {
            "id": 99,
            "retailer_key": "target",
            "zip_code": "90048",
            "latitude": 34.0749,
            "longitude": -118.3766,
        }
    ]
    monkeypatch.setattr(matcher, "_load_retailer_stores", lambda key: stores)
    monkeypatch.setattr(matcher, "_get_zip_centroid", lambda zip_code: (34.098, -118.327))
    monkeypatch.setattr(matcher, "_haversine", lambda *args: 16.0)

    result = matcher.find_store_for_deal(
        retailer_key="target",
        retailer_raw="Target",
        zip_code="90046",
    )

    assert result.store_id is None
    assert result.matched_by == "no_store_within_radius"


def test_explicit_radius_override_still_wins_for_whole_foods(monkeypatch):
    stores = [
        {
            "id": 11224,
            "retailer_key": "wholefoods",
            "zip_code": "91784",
            "latitude": 34.1356,
            "longitude": -117.6598,
        }
    ]
    monkeypatch.setattr(matcher, "_load_retailer_stores", lambda key: stores)
    monkeypatch.setattr(matcher, "_get_zip_centroid", lambda zip_code: (33.9533, -117.3962))
    monkeypatch.setattr(matcher, "_haversine", lambda *args: 19.34)

    result = matcher.find_store_for_deal(
        retailer_key="wholefoodsv2",
        retailer_raw="Whole Foods Market",
        zip_code="92503",
        max_nearby_miles=15,
    )

    assert result.store_id is None
    assert result.matched_by == "no_store_within_radius"


@pytest.mark.parametrize(
    ("source_key", "canonical_key", "expected_radius"),
    [
        ("aldiv2", "aldi", 20.0),
        ("smiths", "smiths", 20.0),
        ("costco", "costco", 30.0),
        ("heb", "heb", 30.0),
        ("bjs", "bjs", 30.0),
        ("foodlion", "foodlion", 30.0),
        ("samsclub", "samsclub", 30.0),
        ("dollartree", "dollartree", 30.0),
        ("kroger", "kroger", 30.0),
        ("krogerbanner", "kroger", 30.0),
    ],
)
def test_retailer_specific_radius_defaults(source_key, canonical_key, expected_radius):
    assert matcher.canonical_store_retailer_key(source_key) == canonical_key
    assert matcher.RETAILER_MAX_NEARBY_MILES[canonical_key] == expected_radius


def test_krogerbanner_uses_kroger_catalog_and_30_mile_radius(monkeypatch):
    stores = [
        {
            "id": 185709,
            "retailer_key": "kroger",
            "zip_code": "46350",
            "latitude": 41.606,
            "longitude": -86.72,
        }
    ]
    calls = []

    def load(key):
        calls.append(key)
        return stores if key == "kroger" else []

    monkeypatch.setattr(matcher, "_load_retailer_stores", load)
    monkeypatch.setattr(matcher, "_get_zip_centroid", lambda zip_code: (41.6106, -87.0642))
    monkeypatch.setattr(matcher, "_haversine", lambda *args: 16.57)

    result = matcher.find_store_for_deal(
        retailer_key="krogerbanner",
        retailer_raw="kroger_banner",
        zip_code="46304",
    )

    assert result.store_id == 185709
    assert result.store_retailer_key == "kroger"
    assert calls == ["kroger"]


def test_keyfood_combines_same_banner_catalog_shards(monkeypatch):
    stores = {
        "keyfood": [
            {
                "id": 1,
                "retailer_key": "keyfood",
                "zip_code": "11201",
                "latitude": 40.69,
                "longitude": -73.99,
            }
        ],
        "key_food": [
            {
                "id": 2,
                "retailer_key": "key_food",
                "zip_code": "11215",
                "latitude": 40.66,
                "longitude": -73.98,
            }
        ],
    }
    monkeypatch.setattr(matcher, "_load_retailer_stores", lambda key: stores.get(key, []))

    candidates = matcher._load_candidate_stores("keyfood")

    assert {store["id"] for store in candidates} == {1, 2}


def test_30_mile_override_does_not_expand_global_default(monkeypatch):
    stores = [
        {
            "id": 99,
            "retailer_key": "target",
            "zip_code": "90048",
            "latitude": 34.0749,
            "longitude": -118.3766,
        }
    ]
    monkeypatch.setattr(matcher, "_load_retailer_stores", lambda key: stores)
    monkeypatch.setattr(matcher, "_get_zip_centroid", lambda zip_code: (34.098, -118.327))
    monkeypatch.setattr(matcher, "_haversine", lambda *args: 16.0)

    result = matcher.find_store_for_deal(
        retailer_key="target",
        retailer_raw="Target",
        zip_code="90046",
    )

    assert result.store_id is None
    assert result.matched_by == "no_store_within_radius"
