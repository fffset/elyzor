# Elyzor — Microservice Trust Architecture

Bu doküman Elyzor'un microservice ortamında nasıl konumlandığını ve iki kimlik tipinin kullanım senaryolarını açıklar.

---

## 1. Amaç

Elyzor bir **User Authentication sistemi değildir**.

Elyzor şunu çözer:

- Hangi client bu isteği gönderdi?
- Bu client tanımlı mı?
- Bu client bu projeye ait mi?
- Bu client yetkili mi?

**Elyzor insan kullanıcıları yönetmez.**

---

## 2. Kimlik Tipleri

### API Key (`sk_live_`)

External client → Backend trust için kullanılır.

Örnek: Bir mobil uygulama veya üçüncü taraf integration, backend API'nize istek atarken `sk_live_` key gönderir. Backend, bu key'i Elyzor'a doğrulattırır.

```
Mobil Uygulama
      │  Authorization: Bearer sk_live_xxxxx
      ▼
  Backend API
      │  POST /v1/verify
      ▼
   Elyzor
      │  { valid: true, projectId, rateLimitRemaining }
      ▼
  Backend API → isteği işler
```

### Service Key (`svc_live_`)

Microservice → Microservice trust için kullanılır.

Örnek: API Gateway, Billing Service'e istek atarken kendi `svc_live_` key'ini gönderir. Billing Service bu kimliği Elyzor'a doğrulattırır.

```
API Gateway
      │  Authorization: Bearer svc_live_xxxxx
      ▼
  Billing Service
      │  POST /v1/verify/service
      ▼
   Elyzor
      │  { valid: true, projectId, service: { id, name } }
      ▼
  Billing Service → authorization kararını verir
```

---

## 3. Temel Kavramlar

### Elyzor User

Elyzor dashboard'una giriş yapan developer veya kurucu. Görevleri:

- Project oluşturmak
- API key ve service key üretmek / yönetmek
- Usage istatistiklerini izlemek

### Project (Tenant)

Her müşteri kendi backend sistemini temsil eden bir Project oluşturur. Project izolasyon boundary'sidir — tüm key'ler proje altında çalışır.

### Key Yapısı

```
sk_live_<publicPart>.<secretPart>   → 16 + 64 hex karakter
svc_live_<publicPart>.<secretPart>  → 16 + 64 hex karakter
```

Key'ler environment variable olarak saklanır:

```bash
ELYZOR_API_KEY=sk_live_xxxxxxxx.yyyyyyyy
ELYZOR_SERVICE_KEY=svc_live_xxxxxxxx.yyyyyyyy
```

---

## 4. Verification Akışı

### API Key Doğrulama

```
POST /v1/verify
Authorization: Bearer sk_live_xxxxx.yyyyy

─── Elyzor içinde ───────────────────────────────
1. sk_live_ prefix kontrolü
2. publicPart.secretPart parse
3. SHA-256(secretPart) → hash
4. Redis lookup (apikey:<hash>)
   ├── Cache hit  → constant-time compare
   └── Cache miss → MongoDB lookup → cache'e yaz
5. Revoke kontrolü (revoked: boolean)
6. Rate limit kontrolü (proje bazında)
7. Usage log (fire & forget)
─────────────────────────────────────────────────

200 OK: { "valid": true, "projectId": "...", "rateLimitRemaining": 98 }
401:    { "valid": false, "error": "invalid_key" }
403:    { "valid": false, "error": "key_revoked" }
429:    { "valid": false, "error": "rate_limit_exceeded", "retryAfter": 42 }
```

### Service Key Doğrulama

```
POST /v1/verify/service
Authorization: Bearer svc_live_xxxxx.yyyyy

─── Elyzor içinde ───────────────────────────────
1. svc_live_ prefix kontrolü
2. publicPart.secretPart parse
3. SHA-256(secretPart) → hash
4. Redis lookup (svckey:<hash>)
   ├── Cache hit  → constant-time compare + revokedAt kontrolü
   └── Cache miss → MongoDB lookup → cache'e yaz
5. Revoke kontrolü (revokedAt != null)
6. Rate limit kontrolü (proje bazında)
7. Usage log (fire & forget)
─────────────────────────────────────────────────

200 OK: { "valid": true, "projectId": "...", "service": { "id": "...", "name": "api-gateway" }, "rateLimitRemaining": 98 }
401:    { "valid": false, "error": "invalid_key" }
403:    { "valid": false, "error": "service_revoked" }
429:    { "valid": false, "error": "rate_limit_exceeded", "retryAfter": 42 }
```

---

## 5. Kritik Mimari Kural

Elyzor request path'inde **değildir**.

```
YANLIŞ:
Gateway → Elyzor → Billing

DOĞRU:
Gateway → Billing
              ↓
          Elyzor Verify
```

Elyzor sadece trust authority'dir. Uygulama trafiğini proxy'lemez.

---

## 6. Authorization Elyzor'un Sorumluluğu Değildir

Elyzor yalnızca **authentication** yapar: "bu kimlik geçerli mi?"

**Authorization** ("bu kimlik X'i yapabilir mi?") uygulamanın kendisine aittir:

```ts
const result = await elyzor.verifyService(req.headers.authorization);

if (!result.valid) {
  return res.status(401).json({ error: 'unauthorized' });
}

// Elyzor'dan gelen service.name ile kendi authorization kararını ver
if (result.service.name !== 'api-gateway') {
  return res.status(403).json({ error: 'forbidden' });
}
```

---

## 7. Elyzor'un Sorumlulukları

Elyzor yapar:

- Service identity üretir
- API key ve service key doğrular
- Project boundary korur
- Usage log tutar
- Rate limit uygular

Elyzor yapmaz:

- User login yönetmez
- Session yönetmez
- Business authorization yapmaz
- Uygulama trafiğini proxy'lemez
