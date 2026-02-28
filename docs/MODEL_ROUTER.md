# Model Router (OpenClaw + OpenAI + Anthropic)

The backend uses ordered fallback model routing from `MODEL_PROVIDER_CHAIN`.

Default:
`openclaw,openai,anthropic`

## Required Keys
### OpenClaw (OpenAI-compatible)
- `OPENCLAW_BASE_URL`
- `OPENCLAW_MODEL`
- `OPENCLAW_API_KEY`

### OpenAI
- `OPENAI_BASE_URL`
- `OPENAI_MODEL`
- `OPENAI_API_KEY`

### Anthropic
- `ANTHROPIC_MODEL`
- `ANTHROPIC_API_KEY`

## Behavior
1. Router tries providers in order.
2. On failure, logs attempt and falls back to next provider.
3. Circuit breaker opens per provider after repeated failures:
   - `MODEL_CB_FAILURE_THRESHOLD` (default `3`)
   - `MODEL_CB_OPEN_SECONDS` (default `120`)
4. If all providers fail, returns deterministic template fallback.
5. Telemetry:
   - Sentry captures failures if `SENTRY_DSN` is configured.
   - Langfuse trace push runs when `LANGFUSE_*` keys are configured.

## Test Endpoint

```bash
curl -X POST http://localhost:8787/api/agent/generate \
  -H 'Content-Type: application/json' \
  -d '{"prompt":"Generate outreach for a Dallas dental clinic"}'
```

Response includes:
- `providerUsed`
- `attempts[]`
- `fallbackUsed`
