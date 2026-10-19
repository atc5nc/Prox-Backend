import sys
import types

import pytest


fake_supabase = types.ModuleType("config.supabase")
fake_supabase.get_supabase_client = lambda: object()
sys.modules["config.supabase"] = fake_supabase

from services import store_location_matcher as matcher


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
