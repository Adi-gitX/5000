# Production Architecture

## Runtime Topology
- **Web/API service**: Express + TypeScript (`src/index.ts`)
- **Worker scheduler**: `node-cron` in-process (`src/scheduler.ts`)
- **Data store**: SQLite (`data/prototype.db`) with idempotency and ops tables
- **Outbound integrations**: SMTP, n8n, Make, OpenClaw/OpenAI/Anthropic
- **Operator control center**: `/agents` route with admin session + CSRF

## Core Data Tables
- `leads` (prospects + suppression state + timezone)
- `outreach_log` (delivery status, error codes, provider metadata)
- `replies_inbox` (idempotent reply ingestion by `reply_id`)
- `deals`, `payments`, `delivery`
- `settings`
- `workflow_events` (queued/sent/retry/completed/failed)
- `connector_health`, `job_controls`, `manual_tasks`, `event_feed`, `agent_sessions`

## Public Interfaces
- Strict webhook ingress:
  - `POST /exec?route=reply-hook`
  - `POST /exec?route=stripe-webhook`
- Agents APIs:
  - `GET /api/agents/overview`
  - `GET /api/agents/connectors`
  - `POST /api/agents/connectors/test/:name`
  - `GET /api/agents/jobs`
  - `POST /api/agents/jobs/:jobKey/run`
  - `POST /api/agents/jobs/:jobKey/pause`
  - `POST /api/agents/manual-tasks`
  - `PATCH /api/agents/manual-tasks/:id`

## Automation Jobs
- `runDailyProspectingBatch()`
- `runOutreachBatch()`
- `runFollowUpBatch()`
- `runReplyTriage()`
- `runPipelineDigest()`
- `workflow-dispatch` (n8n/Make retry queue drain)
- `runSmokeChecks()`

## Safety and Compliance Controls
- Terminal suppression statuses:
  - `suppressed_optout`
  - `suppressed_bounce`
- Send caps:
  - hourly `MAX_SENDS_PER_HOUR`
  - daily warmup `WARMUP_DAILY_LIMIT`
- Quiet-hours block by lead timezone with default fallback (`DEFAULT_OWNER_TZ`)
- Idempotency:
  - reply webhook by `reply_id`
  - stripe webhook by `event_id`
  - workflow queue by `event_id`

## Provider Routing and Resilience
- Ordered provider chain via `MODEL_PROVIDER_CHAIN`
- Circuit breaker:
  - `MODEL_CB_FAILURE_THRESHOLD`
  - `MODEL_CB_OPEN_SECONDS`
- Deterministic template fallback when provider chain is unavailable

## Observability
- Sentry initialization via `SENTRY_DSN`
- Langfuse-ready trace emission via:
  - `LANGFUSE_BASE_URL`
  - `LANGFUSE_PUBLIC_KEY`
  - `LANGFUSE_SECRET_KEY`
- In-app event feed (`event_feed`) for operator diagnostics
