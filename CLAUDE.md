# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

NutriSync — cross-platform AI wellness ecosystem. Three packages in one monorepo:

| Package | Stack | Port |
|---|---|---|
| `packages/api` | FastAPI + PostgreSQL/TimescaleDB + Redis | 8000 |
| `packages/mobile` | React Native (Expo) | 19006 |
| `packages/web` | Next.js 15 (not yet scaffolded) | 3000 |

## Commands

```bash
# Start local infra (Postgres + Redis — TimescaleDB image)
cd infra && docker-compose up -d

# Enable TimescaleDB extension (once, after first docker-compose up)
docker exec -it infra-postgres-1 psql -U nutrisync -c "CREATE EXTENSION IF NOT EXISTS timescaledb;"

# API
cd packages/api
cp .env.example .env          # fill ANTHROPIC_API_KEY, USDA_API_KEY
uv pip install -r requirements.txt
uvicorn api.main:app --reload --port 8000
# Alembic runs automatically on startup — or run manually:
alembic upgrade head

# Web portal
cd packages/web
cp .env.local.example .env.local
npm install
npm run dev                   # http://localhost:3000

# Mobile (Expo Go — no native modules)
cd packages/mobile
npm install
npx expo start

# Mobile (Dev Client — required for HealthKit / Google Fit)
npm run build:dev:ios         # builds simulator .app via EAS
npm run build:dev:android     # builds APK via EAS
# Then: npx expo start --dev-client
```

## API Architecture

- `api/main.py` — FastAPI app; registers routers; creates DB tables on startup; WebSocket at `/ws`
- `api/config.py` — pydantic-settings; all config from `.env`
- `api/db/models.py` — SQLAlchemy ORM: `User`, `ClientProfile`, `HealthLog`, `Plan`, `AISession`, `AuditEvent`
- `api/middleware/auth.py` — JWT helpers (`create_access_token`, `get_current_user`, `require_role`)
- `api/routes/ai.py` — Claude `claude-sonnet-4-6` agentic loop with tool use; tools: `calculate_macros`, `search_usda`, `save_recipe`
- `api/routes/logs.py` — health log CRUD; posts Redis Pub/Sub event after every write
- `api/services/realtime.py` — `publish_update(user_id, data)` fires into Redis channel `user:{id}:updates`
- `api/ws.py` — WebSocket handler subscribes to Redis channels and pushes JSON frames to connected clients

**Role isolation:** Consultants can only access clients where `ClientProfile.assigned_consultant_id == consultant.id`. Enforced at the route level, not just UI. Every consultant read of client data writes an `AuditEvent` row.

**HealthLog.payload schema:**
- `meal`:      `{name, calories, protein_g, carbs_g, fat_g, ingredients[]}`
- `activity`:  `{type, duration_min, steps, avg_heart_rate, source}`
- `biometric`: `{steps, avg_heart_rate, weight_kg, body_fat_pct, source}`

**TimescaleDB:** Hypertable creation is baked into migration `0001` — no manual SQL needed. The `timescaledb` extension must exist in Postgres before the first `alembic upgrade head` (`CREATE EXTENSION IF NOT EXISTS timescaledb;`). Alembic runs automatically at API startup.

## Mobile Architecture

- `hooks/useBiometricSync.ts` — HealthKit (iOS) / Google Fit (Android) adapter; posts to `/api/v1/logs`
- `hooks/useWebSocket.ts` — WebSocket client with exponential backoff reconnect; emits typed `SyncEvent` objects
- `lib/api.ts` — typed fetch wrapper; reads token from AsyncStorage; throws `ApiError` on non-2xx
- `app/(tabs)/dashboard.tsx` — today's stats; subscribes to WebSocket so new logs appear live
- `app/(tabs)/ai-chat.tsx` — Smart Nutritionist chat; ingredient pill input; session continuity via `session_id`

## AI Chat Flow

1. `POST /api/v1/ai/chat` with `{message, ingredients[], session_id?}`
2. Route loads/creates `AISession`, builds system prompt from user profile + 7-day meal aggregate
3. `_run_agent_loop` calls Claude with `TOOLS`; executes tool calls until model returns final text
4. Full message history persisted to `AISession.messages` (JSONB)
5. `session_id` returned to client for conversation continuity

**USDA integration:** `api/services/usda.py` wraps FoodData Central. `search(food_name)` returns the best SR Legacy match. `get_nutrients(fdc_id, grams)` scales per-100g data to the requested portion. `parse_grams(portion)` converts human strings ("2 tbsp", "1 cup") to grams. Set `USDA_API_KEY` in `.env` (free key at https://fdc.nal.usda.gov/api-key-signup; `DEMO_KEY` works for dev at 1 000 req/day).

## Web Portal (`packages/web/`)

- Next.js 15 App Router; Tailwind; Recharts; `@dnd-kit` for plan editor
- `app/dashboard/[clientId]/page.tsx` — live client detail with WebSocket indicator + three charts
- `components/charts/` — `MacroTrendChart` (AreaChart, daily macro totals), `WeightProgressLine` (LineChart with delta badge), `ActivityHeatmap` (GitHub-style 30-day step grid)
- `components/plan-editor/PlanBuilder.tsx` — 7-column weekly planner; items drag between days with `@dnd-kit/sortable`; inline edit on click
- `lib/ws.ts` — `useClientWebSocket(clientId, onEvent)` auto-reconnects with backoff; consultant-only

## Alembic

- Config: `alembic.ini` + `migrations/env.py` (reads `DATABASE_URL` from `.env`)
- Migrations run automatically at API startup via `lifespan`
- `migrations/versions/0001_initial_schema.py` creates all tables + converts `health_logs` to TimescaleDB hypertable (`1 week` chunks)
- New migration: `alembic revision --autogenerate -m "description"` then edit and `alembic upgrade head`

## Native Module Linking

`react-native-health` and `@react-native-google-fit/google-fit` require a Dev Client build (no Expo Go):

```bash
npm run build:dev:ios     # EAS cloud build → .app for simulator
npx expo start --dev-client
```

- `app.config.ts` — HealthKit entitlements (iOS) + Health Connect permissions (Android)
- `eas.json` — three profiles: `development`, `preview`, `production`
- Background sync task `NUTRISYNC_BIOMETRIC_SYNC` registered in `app/_layout.tsx` via `expo-background-fetch`; fires every 30 min, survives app termination

## Environment Variables

| Variable | Used by | Notes |
|---|---|---|
| `DATABASE_URL` | API | `postgresql+asyncpg://...` |
| `REDIS_URL` | API | default `redis://localhost:6379/0` |
| `JWT_SECRET` | API | change in production |
| `ANTHROPIC_API_KEY` | API | Claude API key |
| `USDA_API_KEY` | API | `DEMO_KEY` for dev (1k req/day); get free key at fdc.nal.usda.gov |
| `EXPO_PUBLIC_API_URL` | Mobile | API base URL |
| `EXPO_PUBLIC_WS_URL` | Mobile | WebSocket base URL (`ws://...`) |
| `NEXT_PUBLIC_API_URL` | Web | API base URL |
| `NEXT_PUBLIC_WS_URL` | Web | WebSocket base URL |
