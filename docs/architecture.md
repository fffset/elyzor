# Mimari

## Genel Bakış

Elyzor, API key ve servis key authentication'ı dışa alan bir servisdir. Korunan API'ler kimlik doğrulama mantığını kendileri implement etmek yerine Elyzor'a delege eder.

```
İstemci / Microservice
        │
        │ API İsteği
        ▼
  Korunan API
        │
        │ POST /v1/verify  veya  POST /v1/verify/service
        ▼
      Elyzor
        │
        ├── MongoDB (metadata, loglar)
        └── Redis (cache, rate limiting)
```

**Elyzor asla uygulama trafiğini proxy'lemez.** Sadece "bu key geçerli mi?" sorusunu yanıtlar.

---

## Kimlik Tipleri

Elyzor iki farklı kimlik tipini üretir ve doğrular:

| Tip | Prefix | Endpoint | Amaç |
|---|---|---|---|
| API Key | `sk_live_` | `POST /v1/verify` | External client → Backend trust |
| Service Key | `svc_live_` | `POST /v1/verify/service` | Microservice → Microservice trust |

Bu iki tip birbirinin endpoint'inde çalışmaz. `sk_live_` key `/v1/verify/service`'e, `svc_live_` key `/v1/verify`'a gönderilirse reddedilir.

---

## Katman Yapısı

Bağımlılıklar her zaman tek yönde akar:

```
HTTP İsteği
     │
     ▼
  Router          → Sadece HTTP: isteği al, response gönder
     │
     ▼
validateDto()     → class-validator ile request body doğrulaması (middleware)
     │
     ▼
  Service         → Tüm iş mantığı burada yaşar
     │
     ▼
 Repository       → Sadece veritabanı işlemleri
     │
     ▼
   Model          → Sadece Mongoose şema tanımı
```

Bu yapı **Layered Architecture** olarak adlandırılır. Service Layer Pattern ile Repository Pattern'in birleşimi.

`validateDto(DtoClass)` middleware'i router ile service arasında konumlanır. Request body'yi `plainToInstance` ile DTO sınıfına dönüştürür, `validate` ile kontrol eder. Hata varsa service'e ulaşmadan 400 döner.

---

## Bileşenler

### Auth Modülü

Platform kullanıcılarının (Elyzor müşterilerinin) kayıt ve giriş işlemlerini yönetir.

**Endpoint'ler:**
- `POST /v1/auth/register` — hesap oluştur
- `POST /v1/auth/login` — access + refresh token
- `POST /v1/auth/refresh` — token yenile
- `POST /v1/auth/logout` — oturumu kapat
- `POST /v1/auth/logout-all` — tüm cihazlardan çık
- `GET /v1/auth/me` — mevcut kullanıcı profili

**Token stratejisi:**

| Token | Süre | Taşıma |
|---|---|---|
| Access token | 15 dakika | `Authorization: Bearer` header |
| Refresh token | 7 gün | HTTP-only cookie |

### API Katmanı

Stateless, yatay olarak ölçeklenebilir. HTTP isteklerini alır, `validateDto` middleware'inden geçirir, service'e iletir.

Production'da Node.js Cluster modunda çalışır — her CPU çekirdeğine bir worker atanır. Bkz. [Cluster](#cluster).

### Validation Katmanı

`src/middleware/validateDto.ts` — generic middleware. `class-validator` dekoratörleriyle süslenmiş DTO sınıfları kullanır.

Her domain'in kendi `dtos/` klasörü vardır:
```
src/auth/dtos/register.dto.ts
src/auth/dtos/login.dto.ts
src/projects/dtos/create-project.dto.ts
src/apikeys/dtos/create-apikey.dto.ts
src/services/dtos/create-service.dto.ts
```

Validation hatası varsa service'e hiç ulaşılmaz — 400 `validation_error` döner.

### authGuard

JWT doğrulaması + Redis blacklist kontrolü. Tüm yönetim endpoint'leri bu middleware ile korunur.

Public endpoint'ler (guard dışı):
- `POST /v1/auth/register`, `/login`, `/refresh`
- `POST /v1/verify`, `/v1/verify/service`
- `GET /v1/health`

### Proje Servisi

Tenant izolasyon katmanı. Her kullanıcı birden fazla proje sahibi olabilir. Tüm key ve servis işlemleri proje kapsamında çalışır.

Proje silindiğinde bağlı API key'ler, servis kimlikleri ve usage logları `Promise.all` ile eş zamanlı silinir.

### ApiKey Servisi (`sk_live_`)

Key üretimi, hash'leme, revocation ve rotation.

- Plaintext key asla saklanmaz — `secretPart` SHA-256 ile hash'lenerek MongoDB'ye yazılır
- Key yalnızca oluşturulma / rotation anında gösterilir
- Revocation anlıktır: Redis cache temizlenir (`redis.del("apikey:<hash>")`)

### Services Servisi (`svc_live_`)

Microservice kimlik yönetimi. ApiKey ile aynı güvenlik prensipleri.

- `revokedAt: Date` field'ı kullanır — audit trail için
- Servis adı proje içinde unique: `{ projectId, name }` compound index
- Revocation: Redis cache temizlenir (`redis.del("svckey:<hash>")`)

### Verification Servisi

En performans-kritik bileşen. Hedef: ortalama **<5ms**.

```
POST /v1/verify (Bearer sk_live_xxxxx)
        │
   Key'i ayıkla + prefix kontrol
        │
   Redis lookup (apikey:<hash>)
        │
  ├── Cache hit  → constant-time compare + rate limit kontrolü
  └── Cache miss → MongoDB lookup → cache'e yaz → compare
        │
   { valid, projectId, rateLimitRemaining }
```

Hash karşılaştırması `crypto.timingSafeEqual()` ile yapılır.

**Fail closed:** MongoDB/Redis erişilemezse `valid: false` döner. Asla fail open olmaz.

### Verify-Service Servisi

Service-to-service doğrulama. Verification ile özdeş yapı, farklı namespace.

```
POST /v1/verify/service (Bearer svc_live_xxxxx)
        │
   Key'i ayıkla + svc_live_ prefix kontrol
        │
   Redis lookup (svckey:<hash>)
        │
  ├── Cache hit  → doğrula + revoke/rate limit
  └── Cache miss → MongoDB lookup → cache'e yaz
        │
   { valid, projectId, service: { id, name }, rateLimitRemaining }
```

### Usage Servisi

Her verification olayını asenkron (fire & forget) kaydeder. Verification path'ini asla bloklamaz.

```ts
usageService.log(dto); // await yok — fire and forget
return verificationResult;
```

### Stats Servisi

`GET /v1/projects/:projectId/stats?range=7d`

Verification path'inden tamamen bağımsız. `UsageRepository.getStats()` dört paralel aggregate çalıştırır:
1. Toplam istek, başarı, rate limit, ortalama gecikme
2. Günlük dağılım
3. Top 5 API key (apiKeyId bazlı)
4. Top 5 Service key (serviceId bazlı)

API ve service key'leri birleştirilip `requests` sayısına göre sıralanır. Her entry `keyType: 'api' | 'service'` field'ı ile etiketlenir.

Desteklenen `range`: `1d`, `7d` (varsayılan), `30d`.

---

## Veri Katmanı

### MongoDB

Kalıcı depolama. Kullanıcılar, projeler, API key hash'leri, servis key hash'leri, usage logları burada tutulur. Source of truth.

### Redis

Sıcak yol performans katmanı.

| Namespace | İçerik |
|---|---|
| `apikey:<hash>` | API key cache (TTL: 300s) |
| `svckey:<hash>` | Service key cache (TTL: 300s) |
| `ratelimit:key:<projectId>` | API key rate limit sayacı |
| `ratelimit:svc:<projectId>` | Service key rate limit sayacı |
| `ratelimit:ip:<ip>` | IP rate limit sayacı |
| `blacklist:<token>` | Revoked access token'lar |
| `refresh:<hash>` | Refresh token cache |

Redis çökerse MongoDB'ye fallback yapılır — doğruluk korunur, performans düşer.

---

## Cluster

Production'da `src/cluster.ts` kullanılır. Node.js `cluster` modülü ile CPU çekirdeği başına bir worker çalışır.

```
Primary Process (cluster.ts)
│   ├── os.cpus() kadar worker fork'lar
│   ├── Worker'ları 10sn'de bir memory_check ile sorgular
│   │     → RSS > payın %80'ini geçerse uyarı loglanır
│   └── Çöken worker'ı yeniden başlatır (SIGTERM/SIGINT ile çökme hariç)
│
└── Worker Process × CPU_COUNT
      └── src/index.ts → MongoDB + Redis → Express
```

Her worker bağımsız MongoDB ve Redis bağlantısı açar. 8 worker ile connection pool 8 kat büyür.

```bash
npm run build   # tsc ile derle
npm start       # cluster modunda çalıştır (production)
npm run dev     # tek process, hot reload (development)
```

---

## Ölçeklenme

```
Load Balancer
      │
 ┌────┴────┐
 │ Elyzor  │  (cluster: N worker / sunucu)
 │ Elyzor  │
 │ Elyzor  │
 └────┬────┘
      │
 Redis Cluster
      │
  MongoDB
```

---

## Hata Stratejisi

**Redis çökerse:** MongoDB'ye fallback. Performans düşer, doğruluk korunur.

**MongoDB çökerse:** Verification fail closed — erişim reddedilir. Asla fail open yapılmaz.

---

## API Dokümantasyonu

`GET /docs` — Swagger UI (yalnızca `NODE_ENV !== 'production'`). `src/config/swagger.ts` içinde OpenAPI 3.0 spec tanımlı.

Tüm endpoint'ler, request/response şemaları ve security scheme'leri bu dosyada merkezileştirilmiştir. JSDoc annotation kullanılmaz.

---

## Test Stratejisi

```
tests/
├── unit/           # Servis mantığı — Redis ve MongoDB mock'lanır, Docker gerekmez
└── integration/    # Uçtan uca akışlar — gerçek Docker servisleri gerektirir
    └── helpers/
        └── db.ts   # setupIntegration / teardownIntegration / clearCollections
```

### Unit Testler

Her service metodunun karşılığında bir test bulunur — **yeni metot eklenince aynı commit'te testi de yazılır.** Repository ve Redis mock'lanır. `ts-jest` ile `.ts` uzantılı dosyalar doğrudan çalıştırılır.

**Coverage:** Global eşik: %80 statements/lines, %75 branches/functions. Router, repository, DTO ve infra dosyaları exclude edilir — bunlar integration testlerinde kapsamlanır.

```bash
npm run test:unit                    # testler
npm run test:unit -- --coverage      # testler + coverage raporu
```

### Integration Testler

Gerçek MongoDB ve Redis ile çalışır — Docker Compose gerektirir. `--runInBand` ile serially koşar (paralel = `clearCollections` çakışır).

```bash
docker compose up -d          # MongoDB + Redis başlat
npm run test:integration      # tüm integration testler (sırayla)
```

### Husky Hook'ları

| Hook | Tetikleyici | Eylem |
|---|---|---|
| `pre-commit` | `git commit` | `lint-staged` — staged `.ts` dosyalarına ESLint fix + Prettier |
| `pre-push` | `git push` | Unit testler + coverage threshold kontrolü |

Integration testler `pre-push` hook'una dahil değildir — Docker gerektirdiğinden CI/CD'de koşturulur.

Bkz. [Karar 025](decisions.md#025--husky-ile-commitpush-hookları-ve-coverage-threshold).

---

## V1 Kapsam Dışı

Bunlar bilinçli olarak V1'e alınmadı:

- SDK paketi (`npm install elyzor`)
- Webhook desteği
- Key bazında farklı rate limit
- Key TTL (otomatik expiry)
- IP whitelist per key
- OAuth / sosyal giriş
- Enterprise SSO
- Microservice ayrımı (operasyonel baskı oluşana kadar monolith)
