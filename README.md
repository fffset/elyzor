# Elyzor

**API authentication as a service.** Issue, verify, and track API keys — without building any of it yourself.

```
POST /v1/verify
Authorization: Bearer sk_live_xxxxx

→ { "valid": true, "projectId": "...", "rateLimitRemaining": 98 }
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

**Alternatives like Unkey** exist in this space — Elyzor's differentiator is its open-source, self-hostable architecture designed for teams who don't want their auth layer locked behind a third-party SaaS.

---

## Quickstart

Get up and running in 5 minutes.

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
# Register
curl -X POST http://localhost:3000/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{ "email": "you@example.com", "password": "yourpassword" }'

# Login → get JWT token
curl -X POST http://localhost:3000/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{ "email": "you@example.com", "password": "yourpassword" }'

# Create a project
curl -X POST http://localhost:3000/v1/projects \
  -H "Authorization: Bearer <your_jwt>" \
  -H "Content-Type: application/json" \
  -d '{ "name": "my-api" }'
```

### 5. Create an API key

```bash
curl -X POST http://localhost:3000/v1/projects/<projectId>/keys \
  -H "Authorization: Bearer <your_jwt>" \
  -H "Content-Type: application/json"

# → { "key": "sk_live_xxxxx", "id": "...", "publicPart": "...", ... }
# Save this key — it won't be shown again.
```

### 6. Verify a key (from your protected API)

```bash
curl -X POST http://localhost:3000/v1/verify \
  -H "Authorization: Bearer sk_live_xxxxx"

# → { "valid": true, "projectId": "...", "rateLimitRemaining": 98 }
```

That's it. Your API just needs to check `valid === true`.

---

## API Reference

### Verification Endpoint

`POST /v1/verify`

Pass the API key in the `Authorization` header.

**Success (200)**
```json
{
  "valid": true,
  "projectId": "64f1a...",
  "rateLimitRemaining": 98
}
```

**Invalid key (401)**
```json
{
  "valid": false,
  "error": "invalid_key"
}
```

**Revoked key (403)**
```json
{
  "valid": false,
  "error": "key_revoked"
}
```

**Rate limit exceeded (429)**
```json
{
  "valid": false,
  "error": "rate_limit_exceeded",
  "retryAfter": 42
}
```

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

- API keys are **never stored in plaintext** — only SHA-256 hashes
- **Constant-time comparison** during verification (prevents timing attacks)
- Keys use a `sk_live_` prefix for easy identification and scanning
- **Immediate revocation** — revoked keys fail on next request
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
│   ├── apikeys/
│   ├── verification/
│   ├── usage/
│   ├── middleware/
│   └── config/
├── docs/
│   ├── architecture.md
│   ├── security.md
│   └── api-spec.md
├── docker-compose.yml
├── .env.example
└── README.md
```

---

## Roadmap

**V1 (current)**
- [x] API key lifecycle (create, list, revoke)
- [x] Verification endpoint
- [x] Usage logging
- [x] JWT auth with access + refresh tokens
- [x] Refresh token rotation with theft detection
- [x] Multi-layer rate limiting (IP + key-based)
- [x] Token blacklisting on logout

**V2**
- [ ] Web dashboard
- [ ] Analytics
- [ ] Project roles & team access

**V3**
- [ ] Key rotation
- [ ] Webhook events
- [ ] SDK support (Node, Python, Go)

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
