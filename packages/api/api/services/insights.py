"""
Proactive Health Insights Engine.

Analyses a client's last 30 days of health logs and produces a list of
insight cards — each card has a severity level, a human-readable title,
and a recommended action for the consultant.

Rules implemented:
  1. CALORIE_DEFICIT  — avg calories < 75% of target for 3+ consecutive days
  2. CALORIE_SURPLUS  — avg calories > 120% of target for 3+ consecutive days
  3. INACTIVITY       — no activity log for 5+ days
  4. HR_SPIKE         — 7-day avg resting HR rose > 8 bpm vs prior 7 days
  5. MISSED_LOGGING   — fewer than 4 days logged in last 7 days
  6. WEIGHT_PLATEAU   — weight unchanged (±0.5 kg) for 14+ days despite calorie deficit
  7. PROTEIN_GAP      — avg protein < 80% of target for the last 7 days
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Literal

from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from api.db.models import ClientProfile, HealthLog
from api.services.encryption import decrypt_payload


Severity = Literal["info", "warning", "critical"]


class Insight(BaseModel):
    id: str
    severity: Severity
    title: str
    body: str
    action: str
    metric: dict | None = None   # e.g. {"value": 1240, "target": 2000}


async def get_insights(client_id: str, db: AsyncSession) -> list[Insight]:
    since = datetime.now(timezone.utc) - timedelta(days=30)
    result = await db.execute(
        select(HealthLog)
        .where(HealthLog.user_id == client_id, HealthLog.logged_at >= since)
        .order_by(HealthLog.logged_at.asc())
    )
    logs = result.scalars().all()

    # Fetch profile for targets
    profile_result = await db.execute(
        select(ClientProfile).where(ClientProfile.user_id == client_id)
    )
    profile = profile_result.scalar_one_or_none()
    targets = profile.macro_targets if profile else {}
    cal_target = targets.get("calories", 0)
    pro_target  = targets.get("protein_g", 0)

    # Decrypt and group by date
    meal_by_day:     dict[str, list[dict]] = {}
    activity_by_day: dict[str, list[dict]] = {}
    bio_by_day:      dict[str, list[dict]] = {}

    now = datetime.now(timezone.utc)

    for log in logs:
        day_key = log.logged_at.strftime("%Y-%m-%d")
        try:
            payload = (
                decrypt_payload(log.payload)
                if isinstance(log.payload, str)
                else log.payload
            )
        except Exception:
            payload = {}

        if log.log_type == "meal":
            meal_by_day.setdefault(day_key, []).append(payload)
        elif log.log_type == "activity":
            activity_by_day.setdefault(day_key, []).append(payload)
        elif log.log_type == "biometric":
            bio_by_day.setdefault(day_key, []).append(payload)

    insights: list[Insight] = []

    # ── 1 & 2: Calorie trend (last 7 days) ────────────────────────────────────
    if cal_target > 0:
        recent_7_days = [
            (now - timedelta(days=i)).strftime("%Y-%m-%d") for i in range(7)
        ]
        daily_calories = [
            sum(m.get("calories", 0) for m in meal_by_day.get(d, []))
            for d in recent_7_days
            if meal_by_day.get(d)
        ]
        if daily_calories:
            avg_cal = sum(daily_calories) / len(daily_calories)
            consecutive_deficit = sum(1 for c in daily_calories if c < cal_target * 0.75)
            consecutive_surplus = sum(1 for c in daily_calories if c > cal_target * 1.20)

            if consecutive_deficit >= 3:
                insights.append(Insight(
                    id="calorie_deficit",
                    severity="warning",
                    title="Persistent calorie deficit",
                    body=f"Averaging {avg_cal:.0f} kcal/day over the last 7 logged days — "
                         f"{(1 - avg_cal/cal_target)*100:.0f}% below the {cal_target} kcal target.",
                    action="Review meal plan and check for appetite or lifestyle changes.",
                    metric={"value": round(avg_cal), "target": cal_target, "unit": "kcal"},
                ))
            elif consecutive_surplus >= 3:
                insights.append(Insight(
                    id="calorie_surplus",
                    severity="info",
                    title="Consistent calorie surplus",
                    body=f"Averaging {avg_cal:.0f} kcal/day — "
                         f"{(avg_cal/cal_target - 1)*100:.0f}% above the {cal_target} kcal target.",
                    action="Confirm whether surplus aligns with a muscle-gain goal, or adjust plan.",
                    metric={"value": round(avg_cal), "target": cal_target, "unit": "kcal"},
                ))

    # ── 3: Inactivity ──────────────────────────────────────────────────────────
    if activity_by_day:
        last_activity_str = max(activity_by_day.keys())
        last_activity = datetime.strptime(last_activity_str, "%Y-%m-%d").replace(tzinfo=timezone.utc)
        days_inactive = (now - last_activity).days
        if days_inactive >= 5:
            insights.append(Insight(
                id="inactivity",
                severity="warning",
                title=f"No activity logged for {days_inactive} days",
                body=f"Last recorded workout or step count was on {last_activity_str}.",
                action="Check in with client — this may indicate illness, travel, or reduced motivation.",
                metric={"days_inactive": days_inactive},
            ))
    elif logs:
        insights.append(Insight(
            id="inactivity",
            severity="info",
            title="No activity logs recorded",
            body="No workout or step data has been logged in the past 30 days.",
            action="Encourage client to connect their health tracker or log activities manually.",
        ))

    # ── 4: Resting heart rate spike ────────────────────────────────────────────
    hr_readings: list[tuple[str, float]] = []
    for day, entries in bio_by_day.items():
        hrs = [e.get("resting_hr", 0) for e in entries if e.get("resting_hr")]
        if hrs:
            hr_readings.append((day, sum(hrs) / len(hrs)))

    hr_readings.sort(key=lambda x: x[0])
    if len(hr_readings) >= 6:
        midpoint = len(hr_readings) // 2
        avg_old = sum(r[1] for r in hr_readings[:midpoint]) / midpoint
        avg_new = sum(r[1] for r in hr_readings[midpoint:]) / (len(hr_readings) - midpoint)
        if avg_new - avg_old > 8:
            insights.append(Insight(
                id="hr_spike",
                severity="critical",
                title="Resting heart rate trending up",
                body=f"Average resting HR rose from {avg_old:.0f} bpm to {avg_new:.0f} bpm "
                     f"(+{avg_new - avg_old:.0f} bpm) over the past 30 days.",
                action="This may indicate overtraining, stress, or illness. Consider a deload week.",
                metric={"previous_avg": round(avg_old), "current_avg": round(avg_new), "unit": "bpm"},
            ))

    # ── 5: Missed logging ──────────────────────────────────────────────────────
    days_with_any_log = set(meal_by_day.keys()) | set(activity_by_day.keys())
    last_7 = {(now - timedelta(days=i)).strftime("%Y-%m-%d") for i in range(7)}
    logged_last_7 = len(days_with_any_log & last_7)
    if logged_last_7 < 4:
        insights.append(Insight(
            id="missed_logging",
            severity="info",
            title=f"Low logging consistency ({logged_last_7}/7 days)",
            body="Incomplete data limits how accurately progress can be assessed.",
            action="Remind client to log at least one meal or activity per day for accurate tracking.",
            metric={"days_logged": logged_last_7, "days_expected": 7},
        ))

    # ── 6: Weight plateau ──────────────────────────────────────────────────────
    weight_readings = []
    for day, entries in bio_by_day.items():
        weights = [e.get("weight_kg", 0) for e in entries if e.get("weight_kg")]
        if weights:
            weight_readings.append((day, weights[-1]))  # last reading of the day

    weight_readings.sort(key=lambda x: x[0])
    if len(weight_readings) >= 4:
        recent_weight = weight_readings[-1][1]
        oldest_weight = weight_readings[0][1]
        span_days = (
            datetime.strptime(weight_readings[-1][0], "%Y-%m-%d") -
            datetime.strptime(weight_readings[0][0], "%Y-%m-%d")
        ).days
        if span_days >= 14 and abs(recent_weight - oldest_weight) < 0.5:
            insights.append(Insight(
                id="weight_plateau",
                severity="info",
                title="Weight plateau detected",
                body=f"Weight has remained within 0.5 kg of {recent_weight:.1f} kg "
                     f"for {span_days} days.",
                action="Consider adjusting calorie targets, carb cycling, or workout intensity.",
                metric={"current_kg": recent_weight, "span_days": span_days},
            ))

    # ── 7: Protein gap ─────────────────────────────────────────────────────────
    if pro_target > 0:
        recent_7_days = [
            (now - timedelta(days=i)).strftime("%Y-%m-%d") for i in range(7)
        ]
        daily_protein = [
            sum(m.get("protein_g", 0) for m in meal_by_day.get(d, []))
            for d in recent_7_days
            if meal_by_day.get(d)
        ]
        if daily_protein:
            avg_pro = sum(daily_protein) / len(daily_protein)
            if avg_pro < pro_target * 0.80:
                insights.append(Insight(
                    id="protein_gap",
                    severity="warning",
                    title="Protein intake below target",
                    body=f"Averaging {avg_pro:.0f} g protein/day — "
                         f"{(1 - avg_pro/pro_target)*100:.0f}% below the {pro_target} g target.",
                    action="Suggest higher-protein meal swaps or a post-workout protein supplement.",
                    metric={"value": round(avg_pro), "target": pro_target, "unit": "g"},
                ))

    return insights
