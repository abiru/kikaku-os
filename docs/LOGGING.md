# Logging Guide

## Architecture

All API logs use structured JSON format via `createLogger()` (`apps/api/src/lib/logger.ts`).

```
┌─────────────────┐    console.log     ┌───────────────────────┐
│  Workers Code    │ ───────────────→   │  Cloudflare Analytics │
│  createLogger()  │                    │  (real-time + 72h)    │
└─────────────────┘                    └───────────────────────┘
        │                                        │
        │ (if SENTRY_DSN set)                    │ (Logpush, Enterprise)
        ▼                                        ▼
┌─────────────────┐                    ┌───────────────────────┐
│  Sentry          │                    │  External Storage     │
│  (errors only)   │                    │  (R2 / Datadog / etc) │
└─────────────────┘                    └───────────────────────┘
```

## Log Format

Every log entry is a single-line JSON object:

```json
{
  "level": "info",
  "msg": "request",
  "context": "http",
  "data": { "method": "GET", "path": "/health", "status": 200, "duration": 12 },
  "ts": "2026-01-15T07:00:00.000Z"
}
```

| Field | Type | Description |
|-------|------|-------------|
| `level` | `debug` / `info` / `warn` / `error` | Log severity |
| `msg` | `string` | Human-readable message |
| `context` | `string` | Module name (e.g., `payments`, `stripe-webhook`, `app`) |
| `data` | `object` | Structured metadata (optional) |
| `ts` | `string` | ISO 8601 timestamp |

## Sensitive Data Masking

The logger automatically masks sensitive fields in `data`:

| Field Pattern | Masking Rule | Example |
|--------------|--------------|---------|
| `email`, `customer_email` | `a***@domain.com` | `alice@example.com` -> `a***@example.com` |
| `phone` | First 4 chars + `***` | `090-1234-5678` -> `090-***` |
| `token`, `api_key`, `secret` | First 4 chars + `***` | `sk_test_abc123` -> `sk_t***` |
| `password`, `cvv`, `cvc` | `***` | (fully masked) |
| `stripe_customer_id` | First 4 chars + `***` | `cus_abc123` -> `cus_***` |

Masking is recursive — nested objects are also masked.

## Log Levels

| Level | When to Use | Examples |
|-------|-------------|---------|
| `debug` | Detailed diagnostic info | SQL queries, cache hits/misses |
| `info` | Normal operations | Request completed, order created |
| `warn` | Unexpected but handled | Rate limit hit, deprecated API usage |
| `error` | Failures requiring attention | DB error, Stripe API failure, unhandled exception |

## Viewing Logs

### Real-time (development)
```bash
# Stream all logs from local dev server
pnpm dev:api
# Logs appear directly in terminal

# Stream logs from deployed worker
wrangler tail
wrangler tail --format json   # Machine-readable
wrangler tail --search "error" # Filter by keyword
```

### Cloudflare Dashboard
Workers & Pages > [worker] > Logs

- Real-time log streaming
- 72-hour retention (free plan)
- Filter by status code, method, path

### Sentry (errors only)
Sentry captures all `error`-level exceptions with:
- Full stack trace
- Request context (path, method, user)
- Breadcrumbs (preceding actions)

## Log Retention

| Tier | Retention | Access |
|------|-----------|--------|
| Cloudflare (free) | 72 hours | Dashboard + `wrangler tail` |
| Sentry | 90 days (errors) | Sentry web UI |
| D1 `audit_logs` table | Indefinite | SQL queries via admin API |
| D1 `events` table | Indefinite | SQL queries via admin API |

### Extending Retention

For 30+ day log retention, choose one:

1. **Cloudflare Logpush** (Enterprise) — push to R2, S3, or Datadog
2. **R2 Log Archival** — custom cron to batch-write logs to R2 (cost-effective)
3. **Betterstack / Datadog** — external SaaS with alerting

## Usage

```typescript
import { createLogger } from '../lib/logger';

const logger = createLogger('my-service');

// Basic logging
logger.info('Order created', { orderId: 123 });

// Error logging (with sensitive data auto-masked)
logger.error('Payment failed', {
  email: 'alice@example.com',  // → a***@example.com
  orderId: 123,
  error: 'Card declined'
});
```

## Audit Logs

Business-critical operations are recorded in the `audit_logs` D1 table:

```typescript
import { logAuditEvent } from '../lib/audit';

await logAuditEvent(db, {
  actor: 'admin@example.com',
  action: 'order.update_status',
  target: 'orders',
  targetId: 123,
  metadata: { oldStatus: 'pending', newStatus: 'shipped' }
});
```

Audit logs are non-blocking (failures are logged but don't interrupt the operation).
