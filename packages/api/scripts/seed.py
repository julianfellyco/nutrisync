"""
Seed script — creates two demo accounts and 30 days of realistic health data.

Usage:
    cd packages/api
    python -m scripts.seed
"""
from __future__ import annotations

import asyncio
import json
import random
from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker

from api.config import settings
from api.db.models import AuditEvent, ClientProfile, HealthLog, Plan, User
from api.middleware.auth import hash_password

engine = create_async_engine(settings.database_url, echo=False)
AsyncSessionLocal = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

MEALS = [
    {"name": "Oatmeal with berries",        "calories": 320, "protein_g": 10, "carbs_g": 58, "fat_g": 5},
    {"name": "Greek yogurt parfait",         "calories": 280, "protein_g": 18, "carbs_g": 34, "fat_g": 6},
    {"name": "Chicken & rice bowl",          "calories": 520, "protein_g": 42, "carbs_g": 55, "fat_g": 9},
    {"name": "Salmon with sweet potato",     "calories": 480, "protein_g": 38, "carbs_g": 42, "fat_g": 12},
    {"name": "Quinoa & black bean salad",    "calories": 410, "protein_g": 16, "carbs_g": 62, "fat_g": 8},
    {"name": "Turkey meatballs & zucchini",  "calories": 390, "protein_g": 34, "carbs_g": 18, "fat_g": 14},
    {"name": "Egg white omelette",           "calories": 240, "protein_g": 28, "carbs_g": 8,  "fat_g": 8},
    {"name": "Protein smoothie",             "calories": 310, "protein_g": 30, "carbs_g": 38, "fat_g": 4},
    {"name": "Tuna rice cakes",              "calories": 260, "protein_g": 25, "carbs_g": 22, "fat_g": 5},
    {"name": "Steak & asparagus",            "calories": 560, "protein_g": 48, "carbs_g": 12, "fat_g": 22},
    {"name": "Cottage cheese & pineapple",   "calories": 200, "protein_g": 22, "carbs_g": 18, "fat_g": 3},
    {"name": "Brown rice & veggies",         "calories": 380, "protein_g": 8,  "carbs_g": 70, "fat_g": 5},
]

ACTIVITIES = [
    {"type": "strength",  "label": "Weight training",      "duration_min": 60, "calories_burned": 380},
    {"type": "cardio",    "label": "Running 5k",            "duration_min": 28, "calories_burned": 290},
    {"type": "cardio",    "label": "Cycling 30 min",        "duration_min": 30, "calories_burned": 260},
    {"type": "strength",  "label": "Upper body hypertrophy","duration_min": 55, "calories_burned": 340},
    {"type": "flexibility","label": "Yoga flow",            "duration_min": 45, "calories_burned": 180},
    {"type": "cardio",    "label": "HIIT intervals",        "duration_min": 25, "calories_burned": 310},
    {"type": "strength",  "label": "Leg day",               "duration_min": 65, "calories_burned": 420},
]

PLAN_DAYS = [
    {
        "day": "Monday",
        "meals": [
            {"time": "08:00", "name": "Egg white omelette", "calories": 240, "protein_g": 28, "carbs_g": 8, "fat_g": 8},
            {"time": "12:30", "name": "Chicken & rice bowl", "calories": 520, "protein_g": 42, "carbs_g": 55, "fat_g": 9},
            {"time": "19:00", "name": "Salmon with sweet potato", "calories": 480, "protein_g": 38, "carbs_g": 42, "fat_g": 12},
        ],
    },
    {
        "day": "Tuesday",
        "meals": [
            {"time": "07:30", "name": "Protein smoothie", "calories": 310, "protein_g": 30, "carbs_g": 38, "fat_g": 4},
            {"time": "12:00", "name": "Turkey meatballs & zucchini", "calories": 390, "protein_g": 34, "carbs_g": 18, "fat_g": 14},
            {"time": "18:30", "name": "Steak & asparagus", "calories": 560, "protein_g": 48, "carbs_g": 12, "fat_g": 22},
        ],
    },
    {
        "day": "Wednesday",
        "meals": [
            {"time": "08:00", "name": "Oatmeal with berries", "calories": 320, "protein_g": 10, "carbs_g": 58, "fat_g": 5},
            {"time": "12:30", "name": "Quinoa & black bean salad", "calories": 410, "protein_g": 16, "carbs_g": 62, "fat_g": 8},
            {"time": "19:00", "name": "Chicken & rice bowl", "calories": 520, "protein_g": 42, "carbs_g": 55, "fat_g": 9},
        ],
    },
    {
        "day": "Thursday",
        "meals": [
            {"time": "07:30", "name": "Greek yogurt parfait", "calories": 280, "protein_g": 18, "carbs_g": 34, "fat_g": 6},
            {"time": "12:00", "name": "Tuna rice cakes", "calories": 260, "protein_g": 25, "carbs_g": 22, "fat_g": 5},
            {"time": "18:30", "name": "Salmon with sweet potato", "calories": 480, "protein_g": 38, "carbs_g": 42, "fat_g": 12},
        ],
    },
    {
        "day": "Friday",
        "meals": [
            {"time": "08:00", "name": "Egg white omelette", "calories": 240, "protein_g": 28, "carbs_g": 8, "fat_g": 8},
            {"time": "12:30", "name": "Chicken & rice bowl", "calories": 520, "protein_g": 42, "carbs_g": 55, "fat_g": 9},
            {"time": "19:00", "name": "Steak & asparagus", "calories": 560, "protein_g": 48, "carbs_g": 12, "fat_g": 22},
        ],
    },
    {"day": "Saturday", "meals": [
        {"time": "09:00", "name": "Protein smoothie", "calories": 310, "protein_g": 30, "carbs_g": 38, "fat_g": 4},
        {"time": "13:00", "name": "Quinoa & black bean salad", "calories": 410, "protein_g": 16, "carbs_g": 62, "fat_g": 8},
    ]},
    {"day": "Sunday", "meals": [
        {"time": "10:00", "name": "Oatmeal with berries", "calories": 320, "protein_g": 10, "carbs_g": 58, "fat_g": 5},
        {"time": "14:00", "name": "Turkey meatballs & zucchini", "calories": 390, "protein_g": 34, "carbs_g": 18, "fat_g": 14},
    ]},
]


async def seed() -> None:
    async with AsyncSessionLocal() as db:
        # ── Users ──────────────────────────────────────────────────────────────
        existing = (await db.execute(select(User).where(User.email == "demo.consultant@nutrisync.app"))).scalar_one_or_none()
        if existing:
            print("Seed data already present — skipping.")
            return

        consultant = User(
            email="demo.consultant@nutrisync.app",
            hashed_password=hash_password("Demo1234!"),
            role="consultant",
            name="Dr. Ana Rivera",
        )
        client = User(
            email="demo.client@nutrisync.app",
            hashed_password=hash_password("Demo1234!"),
            role="client",
            name="Julian Reyes",
        )
        db.add_all([consultant, client])
        await db.flush()

        profile = ClientProfile(
            user_id=client.id,
            assigned_consultant_id=consultant.id,
            fitness_goal="gain_muscle",
            dietary_restrictions=["gluten-free"],
            macro_targets={"calories": 2800, "protein_g": 180, "carbs_g": 300, "fat_g": 70},
            dob="1995-06-14",
            height_cm=178.0,
            weight_kg=78.5,
        )
        db.add(profile)
        db.add(AuditEvent(actor_id=consultant.id, target_user_id=client.id, action="claim_client"))

        # ── 30-day health logs ─────────────────────────────────────────────────
        now = datetime.now(timezone.utc)
        logs: list[HealthLog] = []

        for day_offset in range(29, -1, -1):
            ts = now - timedelta(days=day_offset)

            # 2-3 meals per day
            day_meals = random.sample(MEALS, k=random.randint(2, 3))
            for i, meal in enumerate(day_meals):
                meal_ts = ts.replace(hour=7 + i * 5 + random.randint(0, 1), minute=random.randint(0, 59), second=0, microsecond=0)
                logs.append(HealthLog(
                    user_id=client.id,
                    log_type="meal",
                    logged_at=meal_ts,
                    payload={**meal, "source": "demo_seed"},
                ))

            # activity 5 days/week
            if day_offset % 7 not in (0, 6) or random.random() < 0.3:
                act = random.choice(ACTIVITIES)
                act_ts = ts.replace(hour=17 + random.randint(0, 2), minute=random.randint(0, 59), second=0, microsecond=0)
                steps = random.randint(6000, 14000)
                logs.append(HealthLog(
                    user_id=client.id,
                    log_type="activity",
                    logged_at=act_ts,
                    payload={**act, "steps": steps, "source": "demo_seed"},
                ))

            # biometric every 3 days
            if day_offset % 3 == 0:
                weight = round(78.5 - (29 - day_offset) * 0.04 + random.uniform(-0.3, 0.3), 1)
                bio_ts = ts.replace(hour=7, minute=30, second=0, microsecond=0)
                logs.append(HealthLog(
                    user_id=client.id,
                    log_type="biometric",
                    logged_at=bio_ts,
                    payload={"weight_kg": weight, "resting_hr": random.randint(52, 68), "source": "demo_seed"},
                ))

        db.add_all(logs)

        # ── Meal plan ──────────────────────────────────────────────────────────
        from datetime import date
        today = date.today()
        plan = Plan(
            consultant_id=consultant.id,
            client_id=client.id,
            plan_type="meal",
            valid_from=str(today),
            valid_to=str(today + timedelta(days=7)),
            content={"days": PLAN_DAYS},
        )
        db.add(plan)

        await db.commit()
        print(f"✓ Seeded consultant ({consultant.email}) and client ({client.email})")
        print(f"  Password for both: Demo1234!")
        print(f"  {len(logs)} health log entries created")


if __name__ == "__main__":
    asyncio.run(seed())
