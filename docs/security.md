# Güvenlik

## Temel İlke

Elyzor **zero-trust** tasarım anlayışını benimser. Servisler arası hiçbir güven varsayımı yapılmaz.

---

## API Key ve Service Key Güvenliği

### Saklama

Key'ler **asla plaintext olarak saklanmaz.** MongoDB'ye yazılmadan önce `secretPart` SHA-256 ile hash'lenir.

Key yapıları:

```
sk_live_<publicPart>.<secretPart>   → API Key
svc_live_<publicPart>.<secretPart>  → Service Key
```

`publicPart` key'i tanımlamak için kullanılır. `secretPart` hash'lenerek saklanır. Key yalnızca oluşturulma veya rotation anında gösterilir — sonrasında erişilemez.

### Doğrulama

Verification sırasında **constant-time comparison** kullanılır (`crypto.timingSafeEqual()`). Bu timing attack'ları önler.

Normal string karşılaştırması (`===`) kullanılmaz — karakterler eşleştiği sürece erken dönebilir ve bu zamanlama farkı saldırgana bilgi sızdırır.

### Namespace İzolasyonu

`sk_live_` ve `svc_live_` key'ler birbirinin endpoint'inde çalışmaz:

- `POST /v1/verify` → yalnızca `sk_live_` prefix'i kabul eder
- `POST /v1/verify/service` → yalnızca `svc_live_` prefix'i kabul eder

Redis cache namespace'leri de ayrıdır: `apikey:<hash>` vs `svckey:<hash>`.

### Revocation

Key revocation **anlıktır.** Revoke edilen key Redis cache'inden temizlenir, bir sonraki verification isteğinde reddedilir.

API Key: `revoked: boolean` field'ı kullanır.
Service Key: `revokedAt: Date | null` field'ı kullanır — audit trail için tarih saklanır.

### Key Rotation

Yeni key oluştur → eski key revoke et → Redis cache temizle sırası uygulanır. Revoke edilmiş key rotate edilemez (`ForbiddenError`). Yeni plaintext key yalnızca rotation response'unda döner.

---

## Kimlik Doğrulama (Platform Kullanıcıları)

### JWT Stratejisi

| Token | Süre | Taşıma | Amaç |
|---|---|---|---|
| Access token | 15 dakika | `Authorization: Bearer` header | Her istekte kimlik doğrulama |
| Refresh token | 7 gün | HTTP-only cookie | Yeni access token alma |

Refresh token JavaScript'ten erişilemez — XSS saldırılarına karşı korumalıdır.

**JWT algorithm sabitleme:** `jwt.sign()` çağrısında `algorithm: 'HS256'`, `jwt.verify()` çağrısında `algorithms: ['HS256']` zorunludur. Algorithm confusion saldırısını (`alg: none`) önler.

### Logout — Token Blacklist

JWT stateless olduğu için token imzası geçerli olduğu sürece sunucu tarafında iptal edilemez. Çözüm:

```
Logout
  ├── Access token → Redis blacklist'e eklenir (TTL = token'ın kalan süresi)
  └── Refresh token → MongoDB'den silinir, Redis cache'i temizlenir

authGuard her istekte:
  1. JWT imzasını doğrular
  2. Redis blacklist'i kontrol eder → blacklist'teyse 401
```

**Logout-all:** Kullanıcının tüm refresh token'ları MongoDB'den silinir (tüm cihazlardan çıkış).

### Refresh Token Rotation

Her `/refresh` isteğinde eski token revoke edilir, yeni token çifti verilir. Aynı refresh token ikinci kez kullanılamaz.

**Token theft detection:** Revoke edilmiş bir refresh token gelirse saldırı sinyali kabul edilir — kullanıcının tüm oturumları derhal kapatılır (`revokeAllUserTokens`).

Rotation her zaman DB'den yapılır — Redis cache revoke durumunu gizleyebileceği için `findRefreshTokenAny` ile MongoDB'den doğrulanır.

---

## Tenant İzolasyonu

Her işlem öncesinde `assertOwnership()` ile isteği yapan kullanıcının ilgili projeye sahip olduğu doğrulanır. Bir projenin ele geçirilmesi diğer projeleri etkilemez.

Tüm yönetim endpoint'leri `authGuard` middleware'i ile korunur.

Public endpoint'ler:
- `POST /v1/auth/register`, `/login`, `/refresh`
- `POST /v1/verify`, `/v1/verify/service`
- `GET /v1/health`

---

## Hata Stratejisi

**Fail closed:** Altyapı hatası durumunda (MongoDB'ye ulaşılamıyor, Redis çökmüş vb.) verification `valid: false` döndürür. Erişim asla varsayılan olarak açık bırakılmaz.

---

## Rate Limiting

Üç katmanlı Redis tabanlı rate limiting:

| Katman | Kapsam | Endpoint | Config |
|---|---|---|---|
| IP bazlı | Tüm IP'ler | `/v1/auth/login`, `/v1/auth/register`, `/v1/verify`, `/v1/verify/service` | `RATE_LIMIT_IP_MAX` / `RATE_LIMIT_IP_WINDOW_SECONDS` |
| Key bazlı | Proje başına | `/v1/verify` | `RATE_LIMIT_KEY_MAX` / `RATE_LIMIT_KEY_WINDOW_SECONDS` |
| Service key bazlı | Proje başına | `/v1/verify/service` | `RATE_LIMIT_KEY_MAX` / `RATE_LIMIT_KEY_WINDOW_SECONDS` |

Limit aşıldığında:

```json
{ "valid": false, "error": "rate_limit_exceeded", "retryAfter": 42 }
```

**Fail-open:** IP rate limit middleware Redis'e ulaşamadığında isteği geçirir. Key/service doğrulaması ise fail-closed'dır.

---

## Input Validation

Tüm request body'leri `validateDto` middleware'i ile HTTP sınırında doğrulanır. `class-validator` dekoratörleri kullanılır.

`whitelist: true` ile tanımsız property'ler otomatik olarak request body'den temizlenir — mass assignment saldırılarına karşı koruma.

**Boyut sınırları:**
- JSON payload: `express.json({ limit: '16kb' })`
- `Authorization` header: 200 karakterden uzunsa reddedilir
- email max 255, password max 128, name max 100 (`@MaxLength()` dekoratörleri)

---

## Hata Mesajı Güvenliği

Register endpoint'i email çakışmasında kullanıcı varlığını teyit eden mesaj döndürmez — user enumeration koruması. Login ve register hata mesajları belirsiz tutulur.

---

## V2 Roadmap

- Webhook imzalama
- IP whitelist per key
- Key TTL (otomatik expiry)
- Key bazında farklı rate limit
- Anomali tespiti
