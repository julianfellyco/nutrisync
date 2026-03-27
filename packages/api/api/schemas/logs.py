"""
Strict Pydantic schemas for HealthLog payloads.
Each log_type maps to exactly one payload model.
"""
from __future__ import annotations

from typing import Annotated, Literal

from pydantic import BaseModel, Field


class MealPayload(BaseModel):
    name: str = Field(..., max_length=200)
    calories: float = Field(..., ge=0, le=10000)
    protein_g: float = Field(..., ge=0, le=1000)
    carbs_g: float = Field(..., ge=0, le=1000)
    fat_g: float = Field(..., ge=0, le=1000)
    ingredients: list[Annotated[str, Field(max_length=200)]] = Field(default_factory=list, max_length=50)
    source: str | None = Field(default=None, max_length=100)


class ActivityPayload(BaseModel):
    type: str = Field(..., max_length=100)
    duration_min: float = Field(..., ge=0, le=1440)
    steps: int | None = Field(default=None, ge=0, le=200000)
    avg_heart_rate: int | None = Field(default=None, ge=20, le=300)
    calories_burned: float | None = Field(default=None, ge=0, le=10000)
    source: str | None = Field(default=None, max_length=100)


class BiometricPayload(BaseModel):
    weight_kg: float | None = Field(default=None, ge=20, le=500)
    body_fat_pct: float | None = Field(default=None, ge=1, le=70)
    steps: int | None = Field(default=None, ge=0, le=200000)
    avg_heart_rate: int | None = Field(default=None, ge=20, le=300)
    resting_hr: int | None = Field(default=None, ge=20, le=200)
    source: str | None = Field(default=None, max_length=100)


# Map log_type → payload schema
_PAYLOAD_SCHEMAS: dict[str, type[BaseModel]] = {
    "meal":      MealPayload,
    "activity":  ActivityPayload,
    "biometric": BiometricPayload,
}

VALID_LOG_TYPES = frozenset(_PAYLOAD_SCHEMAS.keys())


def validate_payload(log_type: str, raw: dict) -> BaseModel:
    """
    Validate and coerce `raw` against the schema for `log_type`.
    Raises ValueError if log_type is unknown or payload fails validation.
    """
    schema = _PAYLOAD_SCHEMAS.get(log_type)
    if schema is None:
        raise ValueError(f"Unknown log_type '{log_type}'. Must be one of: {', '.join(VALID_LOG_TYPES)}")
    return schema.model_validate(raw)
