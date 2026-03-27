# NutriSync

AI-powered nutrition coaching platform — connecting clients and consultants across web and mobile.

| Package | Stack | Purpose |
|---|---|---|
| `packages/api` | FastAPI · PostgreSQL/TimescaleDB · Redis | REST API + WebSocket hub |
| `packages/web` | Next.js 15 · Tailwind · Recharts | Consultant & client web portal |
| `packages/mobile` | React Native (Expo) | Client mobile app (iOS & Android) |

---

## Features

- **AI Nutritionist** — Claude-powered chat with tool use (macro calculation, USDA food search, recipe saving)
- **Photo meal logging** — Claude Vision analyses food photos and extracts macros automatically
- **Proactive health insights** — 7-rule engine detects deficits, inactivity, and plateaus from 30-day history
- **Streak tracking** — consecutive meal-logging days persisted per client
- **Field-level encryption** — biometric PHI encrypted at rest with Fernet (AES-128-CBC + HMAC-SHA256)
- **Real-time sync** — Redis Pub/Sub → WebSocket pushes new logs to the consultant dashboard live
- **Role isolation** — consultants can only access their own clients; enforced at the route level + audit log

---

## Quick Start

### Prerequisites

- Python 3.12+, Node 20+, Docker
- [USDA FoodData Central API key](https://fdc.nal.usda.gov/api-key-signup) (free; `DEMO_KEY` works for dev)
- [Anthropic API key](https://console.anthropic.com)

### 1 — Infrastructure

```bash
cd infra
cp .env.example .env        # edit if you want non-default Postgres credentials
docker-compose up -d
# Enable TimescaleDB extension (first run only):
docker exec -it infra-postgres-1 psql -U nutrisync -c "CREATE EXTENSION IF NOT EXISTS timescaledb;"
```

### 2 — API

```bash
cd packages/api
cp .env.example .env        # fill in JWT_SECRET and API keys
pip install -r requirements.txt
uvicorn api.main:app --reload --port 8000
# Alembic migrations run automatically on startup.
```

Seed demo accounts (optional):

```bash
python scripts/seed.py
# Creates demo.consultant@nutrisync.app and demo.client@nutrisync.app (password: Demo1234!)
```

### 3 — Web portal

```bash
cd packages/web
cp .env.local.example .env.local
npm install
npm run dev     # http://localhost:3000
```

### 4 — Mobile (Expo Go — no native modules)

```bash
cd packages/mobile
npm install
npx expo start
```

For HealthKit / Google Fit / camera features, use a Dev Client build:

```bash
# Install EAS CLI and run: eas init (first time only)
npm run build:dev:ios      # EAS cloud build → simulator .app
npx expo start --dev-client
```

---

## Environment Variables

See [`packages/api/.env.example`](packages/api/.env.example) for the full API reference.

| Variable | Required | Notes |
|---|---|---|
| `DATABASE_URL` | ✅ | `postgresql+asyncpg://user:pass@host/db` |
| `JWT_SECRET` | ✅ | Generate: `python -c "import secrets; print(secrets.token_hex(32))"` |
| `ANTHROPIC_API_KEY` | ✅ | From [console.anthropic.com](https://console.anthropic.com) |
| `REDIS_URL` | — | Default: `redis://localhost:6379/0` |
| `USDA_API_KEY` | — | Default: `DEMO_KEY` (1 000 req/day) |
| `ENCRYPTION_KEY` | — | Required for biometric encryption. Generate: `python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"` |

---

## Running Tests

```bash
cd packages/api
pytest --tb=short -q
# Uses async SQLite in-memory — no external DB needed.
```

---

## Project Structure

```
nutrisync/
├── infra/                  # docker-compose (Postgres + Redis)
├── packages/
│   ├── api/
│   │   ├── api/
│   │   │   ├── routes/     # auth, logs, ai, clients, plans, insights
│   │   │   ├── services/   # encryption, insights engine, session manager, USDA
│   │   │   ├── db/         # SQLAlchemy models + Alembic engine
│   │   │   ├── middleware/  # JWT auth, request ID, error handler
│   │   │   └── schemas/    # Pydantic payload schemas (strict validation)
│   │   ├── migrations/     # Alembic versions
│   │   └── tests/          # pytest suite
│   ├── web/
│   │   ├── app/
│   │   │   ├── dashboard/  # consultant portal
│   │   │   └── client/     # client portal
│   │   ├── components/     # charts, plan editor, insights feed, toast
│   │   └── lib/            # typed API client, auth context, WebSocket hook
│   └── mobile/
│       ├── app/(tabs)/     # dashboard, AI chat, photo log, food scanner
│       ├── hooks/          # useBiometricSync, useWebSocket
│       └── lib/            # api client, offline queue
```

---

## License

MIT
