"""
Smart Nutritionist — Claude-powered chat with tool use.

Tools available to the model:
  - calculate_macros:  sum macros for a list of ingredients + quantities
  - search_usda:       look up nutritional data by food name (stubbed; wire to USDA FoodData API)
  - save_recipe:       persist an AI-generated recipe to the user's log

Context injected per request (never sent to Claude raw):
  - User's macro targets and dietary restrictions
  - 7-day meal log summary (aggregated, not individual rows)
  - Current session message history
"""
from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone

import anthropic
import structlog
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from api.config import settings
from api.db.engine import get_db
from api.db.models import AISession, ClientProfile, HealthLog, User
from api.middleware.auth import get_current_user
from api.services import usda as usda_svc
from api.services.realtime import get_redis
from api.services.session_manager import trim_session

router = APIRouter(prefix="/ai", tags=["ai"])
log = structlog.get_logger()

client = anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)

# ── Tool definitions ───────────────────────────────────────────────────────────

TOOLS: list[anthropic.types.ToolParam] = [
    {
        "name": "calculate_macros",
        "description": (
            "Calculate total macronutrients (calories, protein, carbs, fat) "
            "for a list of ingredients with quantities. Use this to verify "
            "that a recipe meets the user's macro targets."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "ingredients": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "name":     {"type": "string"},
                            "quantity": {"type": "string", "description": "e.g. '100g', '1 cup', '2 tbsp'"},
                        },
                        "required": ["name", "quantity"],
                    },
                }
            },
            "required": ["ingredients"],
        },
    },
    {
        "name": "search_usda",
        "description": "Look up nutritional information for a food item by name.",
        "input_schema": {
            "type": "object",
            "properties": {
                "food_name": {"type": "string"},
                "portion":   {"type": "string", "description": "e.g. '100g' or '1 medium'"},
            },
            "required": ["food_name"],
        },
    },
    {
        "name": "save_recipe",
        "description": (
            "Save a finalized recipe to the user's meal log. "
            "Only call this when the user explicitly confirms they want to save the recipe."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "name":        {"type": "string"},
                "ingredients": {"type": "array", "items": {"type": "string"}},
                "calories":    {"type": "number"},
                "protein_g":   {"type": "number"},
                "carbs_g":     {"type": "number"},
                "fat_g":       {"type": "number"},
                "prep_time_min": {"type": "integer"},
                "instructions":  {"type": "string"},
            },
            "required": ["name", "ingredients", "calories", "protein_g", "carbs_g", "fat_g"],
        },
    },
]


# ── Tool handlers ──────────────────────────────────────────────────────────────

async def _handle_calculate_macros(tool_input: dict) -> str:
    """
    Sum macros for a list of {name, quantity} ingredients.
    Each ingredient is searched in USDA FoodData Central, nutrients are
    fetched per 100 g and scaled to the requested quantity.
    """
    ingredients: list[dict] = tool_input.get("ingredients", [])
    totals = {"calories": 0.0, "protein_g": 0.0, "carbs_g": 0.0, "fat_g": 0.0, "fiber_g": 0.0}
    breakdown = []

    for item in ingredients:
        name     = item.get("name", "")
        quantity = item.get("quantity", "100g")
        grams    = usda_svc.parse_grams(quantity)

        food = await usda_svc.search(name)
        if not food:
            breakdown.append({"ingredient": name, "error": "not found in USDA database"})
            continue

        nutrients = await usda_svc.get_nutrients(food["fdcId"], grams)
        for key in totals:
            totals[key] = round(totals[key] + nutrients.get(key, 0.0), 2)

        breakdown.append({
            "ingredient":  name,
            "quantity":    quantity,
            "grams":       grams,
            "usda_match":  food.get("description", name),
            **nutrients,
        })

    return json.dumps({"totals": totals, "breakdown": breakdown})


async def _handle_search_usda(tool_input: dict) -> str:
    """
    Search USDA FoodData Central for a food item and return its macros
    scaled to the requested portion.
    """
    food_name = tool_input["food_name"]
    portion   = tool_input.get("portion", "100g")
    grams     = usda_svc.parse_grams(portion)

    food = await usda_svc.search(food_name)
    if not food:
        return json.dumps({"error": f"'{food_name}' not found in USDA FoodData Central"})

    nutrients = await usda_svc.get_nutrients(food["fdcId"], grams)
    return json.dumps({
        "food":         food.get("description"),
        "fdc_id":       food["fdcId"],
        "data_type":    food.get("dataType"),
        "portion":      portion,
        "grams":        grams,
        "nutrients":    nutrients,
    })


async def _handle_save_recipe(tool_input: dict, user_id: str, db: AsyncSession) -> str:
    from api.schemas.logs import MealPayload
    from pydantic import ValidationError

    raw_payload = {
        "name":        tool_input.get("name", "AI Recipe")[:200],
        "calories":    min(max(float(tool_input.get("calories", 0)), 0), 10000),
        "protein_g":   min(max(float(tool_input.get("protein_g", 0)), 0), 1000),
        "carbs_g":     min(max(float(tool_input.get("carbs_g", 0)), 0), 1000),
        "fat_g":       min(max(float(tool_input.get("fat_g", 0)), 0), 1000),
        "ingredients": [str(i)[:200] for i in tool_input.get("ingredients", [])[:50]],
        "source":      "ai_generated",
    }
    try:
        validated = MealPayload.model_validate(raw_payload)
    except ValidationError as exc:
        return json.dumps({"error": f"Invalid recipe data: {exc.error_count()} validation error(s)"})

    log_entry = HealthLog(
        user_id=user_id,
        log_type="meal",
        payload=validated.model_dump(exclude_none=False),
    )
    db.add(log_entry)
    await db.commit()
    return json.dumps({"saved": True, "log_id": log_entry.id})


TOOL_HANDLERS = {
    "calculate_macros": _handle_calculate_macros,
    "search_usda":      _handle_search_usda,
    "save_recipe":      _handle_save_recipe,
}


# ── Context helpers ────────────────────────────────────────────────────────────

async def _check_rate_limit(user_id: str) -> None:
    """10 AI requests per minute per user. Uses Redis sliding window."""
    import time
    redis = get_redis()
    key = f"ai_rate:{user_id}:{int(time.time() // 60)}"
    count = await redis.incr(key)
    if count == 1:
        await redis.expire(key, 120)
    if count > 10:
        raise HTTPException(status_code=429, detail="Too many requests — please wait a moment")


async def _build_system_prompt(user: User, db: AsyncSession, subject_id: str | None = None) -> str:
    """Build system prompt. If subject_id is set, use that user's profile/logs (consultant view)."""
    target_id = subject_id or user.id
    result = await db.execute(
        select(ClientProfile).where(ClientProfile.user_id == target_id)
    )
    profile = result.scalar_one_or_none()

    # Load subject's name if different from caller
    subject_name = user.name
    if subject_id and subject_id != user.id:
        u = (await db.execute(select(User).where(User.id == subject_id))).scalar_one_or_none()
        subject_name = u.name if u else "Client"

    since = datetime.now(timezone.utc) - timedelta(days=7)
    logs_result = await db.execute(
        select(HealthLog).where(
            HealthLog.user_id == target_id,
            HealthLog.log_type == "meal",
            HealthLog.logged_at >= since,
        )
    )
    meal_logs = logs_result.scalars().all()

    avg_calories = (
        sum(l.payload.get("calories", 0) for l in meal_logs) / max(len(meal_logs), 1)
    )

    restrictions = profile.dietary_restrictions if profile else []
    targets = profile.macro_targets if profile else {}
    goal = profile.fitness_goal if profile else "general wellness"

    return f"""You are a certified nutritionist assistant embedded in the NutriSync app.

User profile:
- Name: {subject_name}
- Goal: {goal}
- Dietary restrictions: {', '.join(restrictions) if restrictions else 'none'}
- Daily macro targets: {json.dumps(targets) if targets else 'not set'}
- Average daily calories this week: {avg_calories:.0f} kcal ({len(meal_logs)} meals logged)

Your responsibilities:
1. Suggest practical, personalized recipes based on the user's available ingredients.
2. Always verify macros using the calculate_macros tool before presenting a recipe.
3. Respect all dietary restrictions — never suggest restricted ingredients.
4. Explain your reasoning in plain language the user can act on.
5. Only save a recipe to the user's log when explicitly asked to.

Keep responses concise and structured. Format recipes with: Ingredients, Macros, Prep Time, Instructions."""


# ── Agentic loop ───────────────────────────────────────────────────────────────

async def _run_agent_loop(
    messages: list[dict],
    system: str,
    user_id: str,
    db: AsyncSession,
    max_iterations: int = 8,
) -> str:
    """
    Run the Claude tool-use loop until the model returns a text response
    or we hit max_iterations.
    """
    for _ in range(max_iterations):
        response = await client.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=2048,
            system=system,
            messages=messages,
            tools=TOOLS,
        )

        # Collect all tool calls in this turn
        tool_uses = [b for b in response.content if b.type == "tool_use"]
        text_blocks = [b for b in response.content if b.type == "text"]

        if not tool_uses:
            # Final text response
            return "\n".join(b.text for b in text_blocks)

        # Execute tools and build tool_result messages
        tool_results = []
        for tool_use in tool_uses:
            handler = TOOL_HANDLERS.get(tool_use.name)
            if not handler:
                result_text = json.dumps({"error": f"Unknown tool: {tool_use.name}"})
            elif tool_use.name == "save_recipe":
                result_text = await handler(tool_use.input, user_id, db)
            else:
                result_text = await handler(tool_use.input)

            tool_results.append({
                "type": "tool_result",
                "tool_use_id": tool_use.id,
                "content": result_text,
            })

        # Append assistant turn + tool results and continue loop
        messages = messages + [
            {"role": "assistant", "content": response.content},
            {"role": "user",      "content": tool_results},
        ]

    return "I wasn't able to complete the analysis in time. Please try a more specific question."


# ── Route ──────────────────────────────────────────────────────────────────────

class ChatRequest(BaseModel):
    session_id: str | None = Field(default=None, max_length=100)
    message: str = Field(..., min_length=1, max_length=4000)
    ingredients: list[str] = Field(default_factory=list, max_length=50)
    on_behalf_of_client_id: str | None = Field(default=None, max_length=100)  # consultants only


class ChatResponse(BaseModel):
    session_id: str
    reply: str


@router.post("/chat", response_model=ChatResponse)
async def chat(
    body: ChatRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _check_rate_limit(current_user.id)

    # Validate on_behalf_of_client_id — must be consultant's own client
    subject_id: str | None = None
    if body.on_behalf_of_client_id:
        if current_user.role != "consultant":
            raise HTTPException(status_code=403, detail="Only consultants can use on_behalf_of_client_id")
        from api.db.models import ClientProfile
        cp = (await db.execute(
            select(ClientProfile).where(
                ClientProfile.user_id == body.on_behalf_of_client_id,
                ClientProfile.assigned_consultant_id == current_user.id,
            )
        )).scalar_one_or_none()
        if not cp:
            raise HTTPException(status_code=403, detail="Not your client")
        subject_id = body.on_behalf_of_client_id

    # Load or create session
    session = None
    if body.session_id:
        result = await db.execute(
            select(AISession).where(
                AISession.id == body.session_id,
                AISession.user_id == current_user.id,
            )
        )
        session = result.scalar_one_or_none()

    if not session:
        session = AISession(user_id=current_user.id, messages=[])
        db.add(session)
        await db.flush()

    # Append new user message (include ingredients in first message if provided)
    user_text = body.message
    if body.ingredients:
        user_text = f"{body.message}\n\nIngredients I have: {', '.join(body.ingredients)}"

    messages: list[dict] = list(session.messages) + [
        {"role": "user", "content": user_text}
    ]

    # Trim session if it has grown large; also log estimated token usage
    messages, estimated_tokens = await trim_session(messages, client)
    log.info("ai.request", user_id=current_user.id, estimated_tokens=estimated_tokens,
             message_count=len(messages))

    system = await _build_system_prompt(current_user, db, subject_id)

    try:
        reply = await _run_agent_loop(messages, system, current_user.id, db)
    except anthropic.APIError as exc:
        log.error("ai.api_error", exc=str(exc), user_id=current_user.id)
        raise HTTPException(status_code=502, detail="AI service unavailable")

    # Persist updated history (store only role+content for compactness)
    full_messages = messages + [{"role": "assistant", "content": reply}]
    session.messages = full_messages
    await db.commit()

    return ChatResponse(session_id=session.id, reply=reply)


# ── Photo-to-Macro Analysis ────────────────────────────────────────────────────

class PhotoAnalysisRequest(BaseModel):
    image_b64: str           # base64-encoded image bytes
    mime_type: str = "image/jpeg"
    save_log: bool = False   # if True, auto-create a meal HealthLog
    on_behalf_of_client_id: str | None = None  # consultants only


class DetectedFood(BaseModel):
    name: str
    portion: str
    calories: float
    protein_g: float
    carbs_g: float
    fat_g: float
    confidence: str   # "high" | "medium" | "low"


class PhotoAnalysisResponse(BaseModel):
    foods: list[DetectedFood]
    totals: dict
    log_id: str | None = None
    note: str | None = None


_PHOTO_PROMPT = """\
You are a precise nutrition analyst. Analyse the meal photo and return ONLY valid JSON — no markdown, no explanation.

JSON schema:
{
  "foods": [
    {
      "name": "string",
      "portion": "string (e.g. '150g', '1 cup', '1 medium')",
      "calories": number,
      "protein_g": number,
      "carbs_g": number,
      "fat_g": number,
      "confidence": "high|medium|low"
    }
  ],
  "totals": { "calories": number, "protein_g": number, "carbs_g": number, "fat_g": number },
  "note": "string or null  (mention any assumptions, e.g. sauce type, cooking method)"
}

Rules:
- Identify every distinct food item visible.
- Estimate portion sizes visually — use plate size, utensils, and context clues.
- Use standard nutritional values per 100g scaled to the estimated portion.
- Mark confidence 'low' if the food is partially obscured or difficult to identify.
- Return only the JSON object. No preamble, no trailing text.
"""


@router.post("/analyze-photo", response_model=PhotoAnalysisResponse)
async def analyze_photo(
    body: PhotoAnalysisRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _check_rate_limit(current_user.id)

    # Validate consultant access if on_behalf_of
    target_user_id = current_user.id
    if body.on_behalf_of_client_id:
        if current_user.role != "consultant":
            raise HTTPException(status_code=403, detail="Only consultants can use on_behalf_of_client_id")
        cp = (await db.execute(
            select(ClientProfile).where(
                ClientProfile.user_id == body.on_behalf_of_client_id,
                ClientProfile.assigned_consultant_id == current_user.id,
            )
        )).scalar_one_or_none()
        if not cp:
            raise HTTPException(status_code=403, detail="Not your client")
        target_user_id = body.on_behalf_of_client_id

    try:
        response = await client.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=1024,
            messages=[{
                "role": "user",
                "content": [
                    {
                        "type": "image",
                        "source": {
                            "type": "base64",
                            "media_type": body.mime_type,
                            "data": body.image_b64,
                        },
                    },
                    {"type": "text", "text": _PHOTO_PROMPT},
                ],
            }],
        )
    except anthropic.APIError as exc:
        log.error("ai.photo_error", exc=str(exc), user_id=current_user.id)
        raise HTTPException(status_code=502, detail="AI vision service unavailable")

    raw = response.content[0].text.strip()

    # Strip markdown code fences if Claude wraps output
    if raw.startswith("```"):
        raw = raw.split("\n", 1)[1].rsplit("```", 1)[0].strip()

    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        raise HTTPException(status_code=502, detail="Could not parse vision response")

    foods = [DetectedFood(**f) for f in data.get("foods", [])]
    totals = data.get("totals", {})
    note   = data.get("note")

    log_id: str | None = None
    if body.save_log and foods:
        from api.db.models import HealthLog
        from api.services.encryption import should_encrypt
        meal_payload = {
            "name":        ", ".join(f.name for f in foods),
            "calories":    totals.get("calories", 0),
            "protein_g":   totals.get("protein_g", 0),
            "carbs_g":     totals.get("carbs_g", 0),
            "fat_g":       totals.get("fat_g", 0),
            "ingredients": [f"{f.name} ({f.portion})" for f in foods],
            "source":      "photo_ai",
        }
        entry = HealthLog(
            user_id=target_user_id,
            log_type="meal",
            payload=meal_payload,
            is_encrypted=False,
        )
        db.add(entry)

        # Update streak
        from api.routes.logs import _update_streak
        today_str = datetime.now(timezone.utc).date().isoformat()
        await _update_streak(target_user_id, today_str, db)

        await db.commit()
        await db.refresh(entry)
        log_id = entry.id

        from api.services.realtime import publish_update
        await publish_update(target_user_id, {
            "event": "new_log",
            "log_type": "meal",
            "logged_at": entry.logged_at.isoformat(),
            "payload": meal_payload,
        })

    return PhotoAnalysisResponse(foods=foods, totals=totals, log_id=log_id, note=note)
