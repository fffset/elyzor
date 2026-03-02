# Elyzor

**API authentication as a service.** Issue, verify, and track API keys and service identities — without building any of it yourself.

```
# Verify an external API key
POST /v1/verify
Authorization: Bearer sk_live_xxxxx
→ { "valid": true, "projectId": "...", "rateLimitRemaining": 98 }

# Verify a service-to-service call
POST /v1/verify/service
Authorization: Bearer svc_live_xxxxx
→ { "valid": true, "projectId": "...", "service": { "id": "...", "name": "billing-service" } }
```

---

## Why Elyzor?

Every backend eventually needs the same boring stuff: key generation, secure storage, revocation, rate limiting, usage logs. Most teams build it from scratch — and most teams build it wrong.

Elyzor handles all of it so you don't have to.

| Feature | Roll your own | Elyzor |
|---|---|---|
| Key generation & hashing | Manual | ✅ Built-in |
| Rate limiting | Redis setup required | ✅ Built-in |
| Key revocation | Custom logic | ✅ One API call |
| Usage tracking | Build from scratch | ✅ Automatic |
| Verification latency | Varies | ✅ <5ms target |
| Service-to-service auth | Roll your own | ✅ Built-in |

**Alternatives like Unkey** exist in this space — Elyzor's differentiator is its open-source, self-hostable architecture designed for teams who don't want their auth layer locked behind a third-party SaaS.

---

## Two Identity Types

Elyzor manages two distinct credential types that never cross:

### API Keys (`sk_live_`)

For external clients authenticating against your API.

```
Client → Your API → POST /v1/verify (sk_live_...) → Elyzor
```

### Service Keys (`svc_live_`)

For internal microservices authenticating with each other.

```
billing-service → order-service → POST /v1/verify/service (svc_live_...) → Elyzor
```

Elyzor answers only "is this credential valid?" — it never sits in the request path.

---

## Quickstart

### 1. Clone and install

```bash
git clone https://github.com/your-username/elyzor
cd elyzor
npm install
```

### 2. Set up environment

```bash
cp .env.example .env
```

Edit `.env`:

```env
PORT=3000
MONGO_URI=mongodb://localhost:27017/elyzor
REDIS_URL=redis://localhost:6379
JWT_SECRET=change_me_in_production
```

### 3. Start services

```bash
docker compose up -d  # starts MongoDB + Redis
npm run dev           # starts Elyzor on :3000
```

### 4. Create an account and project

```bash
curl -X POST http://localhost:3000/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{ "email": "you@example.com", "password": "yourpassword" }'

curl -X POST http://localhost:3000/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{ "email": "you@example.com", "password": "yourpassword" }'

curl -X POST http://localhost:3000/v1/projects \
  -H "Authorization: Bearer <your_jwt>" \
  -H "Content-Type: application/json" \
  -d '{ "name": "my-api" }'
```

### 5. Issue credentials

```bash
# Issue an API key (for external clients)
curl -X POST http://localhost:3000/v1/projects/<projectId>/keys \
  -H "Authorization: Bearer <your_jwt>" \
  -H "Content-Type: application/json"
# → { "key": "sk_live_xxxxx", ... }

# Register a service identity (for internal microservices)
curl -X POST http://localhost:3000/v1/projects/<projectId>/services \
  -H "Authorization: Bearer <your_jwt>" \
  -H "Content-Type: application/json" \
  -d '{ "name": "billing-service" }'
# → { "key": "svc_live_xxxxx", ... }

# Save both keys — they won't be shown again.
```

### 6. Verify credentials

```bash
# Verify an API key (from your protected API)
curl -X POST http://localhost:3000/v1/verify \
  -H "Authorization: Bearer sk_live_xxxxx"
# → { "valid": true, "projectId": "...", "rateLimitRemaining": 98 }

# Verify a service identity (from your internal service)
curl -X POST http://localhost:3000/v1/verify/service \
  -H "Authorization: Bearer svc_live_xxxxx"
# → { "valid": true, "projectId": "...", "service": { "id": "...", "name": "billing-service" } }
```

---

## API Reference

### `POST /v1/verify` — API Key Verification

**Success (200)**
```json
{ "valid": true, "projectId": "64f1a...", "rateLimitRemaining": 98 }
```

**Invalid key (401)** `{ "valid": false, "error": "invalid_key" }`

**Revoked key (403)** `{ "valid": false, "error": "key_revoked" }`

**Rate limit (429)** `{ "valid": false, "error": "rate_limit_exceeded", "retryAfter": 42 }`

---

### `POST /v1/verify/service` — Service Key Verification

**Success (200)**
```json
{
  "valid": true,
  "projectId": "64f1a...",
  "service": { "id": "...", "name": "billing-service" },
  "rateLimitRemaining": 98
}
```

**Invalid key (401)** `{ "valid": false, "error": "invalid_key" }`

**Revoked service (403)** `{ "valid": false, "error": "service_revoked" }`

**Rate limit (429)** `{ "valid": false, "error": "rate_limit_exceeded", "retryAfter": 42 }`

---

### Management Endpoints (JWT required)

```
# Auth
POST   /v1/auth/register
POST   /v1/auth/login
POST   /v1/auth/refresh
POST   /v1/auth/logout
POST   /v1/auth/logout-all

# Projects
GET    /v1/projects
POST   /v1/projects
DELETE /v1/projects/:id

# API Keys
GET    /v1/projects/:projectId/keys
POST   /v1/projects/:projectId/keys
DELETE /v1/projects/:projectId/keys/:keyId

# Services
GET    /v1/projects/:projectId/services
POST   /v1/projects/:projectId/services
DELETE /v1/projects/:projectId/services/:serviceId

# Stats
GET    /v1/projects/:projectId/stats?range=7d
```

### `GET /v1/health` — Deep Health Check

**All healthy (200)**
```json
{ "status": "ok", "mongo": "ok", "redis": "ok" }
```

**Degraded (503)**
```json
{ "status": "degraded", "mongo": "ok", "redis": "error" }
```

### `GET /v1/projects/:projectId/stats` — Usage Statistics

**Success (200)**
```json
{
  "totalRequests": 1204,
  "successRate": 0.97,
  "topKeys": [{ "keyId": "...", "requests": 842 }],
  "requestsByDay": [{ "date": "2026-03-01", "count": 310, "errors": 9 }],
  "rateLimitHits": 12,
  "avgLatencyMs": 3.2
}
```

Supports `range` query param: `1d`, `7d` (default), `30d`.

---

## Architecture

```
                ┌──────────────┐
Client ───────▶ │   Elyzor API  │
                └──────┬───────┘
                       │
        ┌──────────────┴──────────────┐
        │                              │
   MongoDB                      Redis Cache
(metadata & logs)         (verification cache,
                            rate limiting)
```

**Stack:** Node.js · Express · MongoDB · Redis · Docker

---

## Security

- Credentials are **never stored in plaintext** — only SHA-256 hashes
- **Constant-time comparison** during verification (prevents timing attacks)
- `sk_live_` and `svc_live_` prefixes are mutually exclusive — a service key cannot verify as an API key and vice versa
- **Immediate revocation** — revoked credentials fail on next request
- Redis-backed rate limiting per key
- **JWT algorithm pinned to HS256** — algorithm confusion attacks prevented
- **Refresh token rotation** — each `/refresh` issues a new token and invalidates the old one
- **Token theft detection** — using a revoked refresh token triggers full session wipe
- Production startup validation — missing `JWT_SECRET`, `MONGO_URI`, or `REDIS_URL` crashes the process before accepting traffic
- Request payload capped at 16kb; `Authorization` header capped at 200 characters

---

## Project Structure

```
elyzor/
├── src/
│   ├── auth/
│   ├── users/
│   ├── projects/
│   ├── apikeys/           # sk_live_ credentials (external clients)
│   ├── services/          # svc_live_ credentials (internal microservices)
│   ├── verification/      # POST /v1/verify
│   ├── verify-service/    # POST /v1/verify/service
│   ├── stats/             # GET /v1/projects/:id/stats
│   ├── usage/
│   ├── middleware/
│   └── config/
├── docs/
├── tests/
│   ├── unit/
│   └── integration/
├── docker-compose.yml
├── .env.example
└── README.md
```

---

## Roadmap

**V1 (current)**
- [x] API key lifecycle (create, list, revoke)
- [x] Service identity lifecycle (create, list, revoke)
- [x] API key verification (`POST /v1/verify`)
- [x] Service key verification (`POST /v1/verify/service`)
- [x] Usage logging (per key, per service)
- [x] JWT auth with access + refresh tokens
- [x] Refresh token rotation with theft detection
- [x] Multi-layer rate limiting (IP + key-based)
- [x] Token blacklisting on logout
- [x] Usage statistics (`GET /v1/projects/:id/stats`)
- [x] Deep health check (MongoDB + Redis probe)
- [x] Graceful shutdown (SIGTERM/SIGINT)

**V2**
- [ ] Web dashboard
- [ ] Project roles & team access

**V3**
- [ ] Key rotation
- [ ] Webhook events
- [ ] SDK support (Node, Python, Go)

---

## Testing

```bash
# Unit tests (no Docker required)
npm run test:unit

# Unit tests with coverage report
npm run test:unit -- --coverage

# Integration tests (requires Docker)
docker compose up -d
npm run test:integration
```

**Unit tests** mock Redis and MongoDB — no external dependencies. Coverage is enforced at push time via Husky: 80% statements/lines, 75% branches/functions.

**Integration tests** run against real services and must run serially (`--runInBand`) to avoid database state conflicts between suites.

---

## Contributing

Contributions are welcome! Here's how to get started:

1. Fork the repo and create a branch: `git checkout -b feature/your-feature`
2. Make your changes and write tests if applicable
3. Run the test suite: `npm test`
4. Open a pull request with a clear description of what you changed and why

For larger changes, open an issue first so we can discuss the approach.

**Found a security issue?** Please don't open a public issue — email us directly instead.

---

## Requirements

- Node.js 18+
- Docker
- MongoDB
- Redis

---

## License

MIT — do whatever you want with it.
