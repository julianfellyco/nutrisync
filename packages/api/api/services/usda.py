"""
USDA FoodData Central client with Redis caching.

Docs: https://fdc.nal.usda.gov/api-guide.html
Free API key: https://fdc.nal.usda.gov/api-key-signup  (1 000 req/day with DEMO_KEY)

Caching strategy:
  - Search results cached for 24 h (food names don't change).
  - Nutrient detail cached for 24 h (same fdc_id + gram weight).
  - Cache keys: "usda:search:<food_name>" and "usda:nutrients:<fdc_id>:<grams>"
  - Falls back to live API on cache miss or Redis unavailability.

Nutrient IDs used (stable across FoodData Central):
    1008 → Energy (kcal)
    1003 → Protein (g)
    1005 → Carbohydrate, by difference (g)
    1004 → Total lipid / fat (g)
    1079 → Fiber, total dietary (g)
"""
from __future__ import annotations

import hashlib
import json

import httpx
import structlog

from api.config import settings

log = structlog.get_logger()

_BASE = "https://api.nal.usda.gov/fdc/v1"
_MACRO_IDS = {1008: "calories", 1003: "protein_g", 1005: "carbs_g", 1004: "fat_g", 1079: "fiber_g"}
_CACHE_TTL = 86400  # 24 hours

# Shared async HTTP client
_http: httpx.AsyncClient | None = None


def _client() -> httpx.AsyncClient:
    global _http
    if _http is None or _http.is_closed:
        _http = httpx.AsyncClient(timeout=10.0)
    return _http


def _params(**extra) -> dict:
    return {"api_key": settings.usda_api_key, **extra}


def _safe_key(value: str) -> str:
    """Normalise cache key — lowercase, hash if too long."""
    clean = value.strip().lower()
    if len(clean) <= 64:
        return clean
    return hashlib.sha256(clean.encode()).hexdigest()


async def _cache_get(key: str) -> dict | None:
    try:
        from api.services.realtime import get_redis
        redis = get_redis()
        raw = await redis.get(key)
        if raw:
            return json.loads(raw)
    except Exception:
        pass
    return None


async def _cache_set(key: str, value: dict) -> None:
    try:
        from api.services.realtime import get_redis
        redis = get_redis()
        await redis.set(key, json.dumps(value), ex=_CACHE_TTL)
    except Exception:
        pass


# ── Public API ─────────────────────────────────────────────────────────────────

async def search(food_name: str) -> dict | None:
    """
    Return the best-matching food item from FoodData Central.
    Results are cached in Redis for 24 h.
    """
    cache_key = f"usda:search:{_safe_key(food_name)}"
    cached = await _cache_get(cache_key)
    if cached:
        log.debug("usda.search.cache_hit", food=food_name)
        return cached

    url = f"{_BASE}/foods/search"
    params = _params(query=food_name, pageSize=5, dataType="SR Legacy,Foundation,Branded")

    try:
        resp = await _client().get(url, params=params)
        resp.raise_for_status()
        data = resp.json()
    except httpx.HTTPError as exc:
        log.warning("usda.search_error", food=food_name, exc=str(exc))
        return None

    foods = data.get("foods", [])
    if not foods:
        return None

    sr = next((f for f in foods if f.get("dataType") == "SR Legacy"), foods[0])
    await _cache_set(cache_key, sr)
    return sr


async def get_nutrients(fdc_id: int, grams: float = 100.0) -> dict:
    """
    Fetch nutrient detail for a specific food and scale to `grams`.
    Results are cached in Redis for 24 h.
    """
    cache_key = f"usda:nutrients:{fdc_id}:{grams}"
    cached = await _cache_get(cache_key)
    if cached:
        log.debug("usda.nutrients.cache_hit", fdc_id=fdc_id, grams=grams)
        return cached

    url = f"{_BASE}/food/{fdc_id}"
    try:
        resp = await _client().get(url, params=_params())
        resp.raise_for_status()
        data = resp.json()
    except httpx.HTTPError as exc:
        log.warning("usda.nutrients_error", fdc_id=fdc_id, exc=str(exc))
        return {}

    scale = grams / 100.0
    result: dict[str, float] = {}

    for nutrient in data.get("foodNutrients", []):
        nid = nutrient.get("nutrient", {}).get("id")
        if nid in _MACRO_IDS:
            raw = nutrient.get("amount", 0.0) or 0.0
            result[_MACRO_IDS[nid]] = round(raw * scale, 2)

    await _cache_set(cache_key, result)
    return result


# ── Portion parsing ────────────────────────────────────────────────────────────

_UNIT_TO_GRAMS: dict[str, float] = {
    "g": 1, "gram": 1, "grams": 1,
    "kg": 1000, "kilogram": 1000,
    "oz": 28.35, "ounce": 28.35, "ounces": 28.35,
    "lb": 453.6, "pound": 453.6, "pounds": 453.6,
    "cup": 240, "cups": 240,
    "tbsp": 15, "tablespoon": 15, "tablespoons": 15,
    "tsp": 5, "teaspoon": 5, "teaspoons": 5,
    "ml": 1, "milliliter": 1,
    "l": 1000, "liter": 1000,
    "piece": 100, "pieces": 100,
    "slice": 30, "slices": 30,
    "medium": 100, "large": 150, "small": 70,
}


def parse_grams(portion: str) -> float:
    """
    Convert a human portion string to grams.
    Examples: "100g" → 100, "2 tbsp" → 30, "1 cup" → 240, "150" → 150
    Falls back to 100 g if unparseable.
    """
    portion = portion.strip().lower()
    parts = portion.split()

    try:
        if len(parts) == 1:
            if parts[0][-1].isalpha():
                num_str = "".join(c for c in parts[0] if c.isdigit() or c == ".")
                unit = "".join(c for c in parts[0] if c.isalpha())
                return float(num_str) * _UNIT_TO_GRAMS.get(unit, 1)
            return float(parts[0])

        if len(parts) >= 2:
            quantity = float(parts[0])
            unit = parts[1].rstrip(".")
            return quantity * _UNIT_TO_GRAMS.get(unit, 100)
    except (ValueError, IndexError):
        pass

    return 100.0
