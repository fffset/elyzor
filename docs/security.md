# Güvenlik

## Temel İlke

Elyzor **zero-trust** tasarım anlayışını benimser. Servisler arası hiçbir güven varsayımı yapılmaz.

---

## API Key Güvenliği

### Saklama

API key'ler **asla plaintext olarak saklanmaz.** MongoDB'ye yazılmadan önce SHA-256 ile hash'lenir.

Kullanıcıya key yalnızca bir kez gösterilir — oluşturulma anında. Sonrasında erişilemez.

Key yapısı:

```
sk_live_<publicPart>.<secretPart>
```

`publicPart` key'i tanımlamak için kullanılır. `secretPart` hash'lenerek saklanır.

### Doğrulama

Verification sırasında **constant-time comparison** kullanılır (`crypto.timingSafeEqual()`). Bu timing attack'ları önler.

Normal string karşılaştırması (`===`) kullanılmaz — karakterler eşleştiği sürece erken dönebilir ve bu zamanlama farkı saldırgana bilgi sızdırır.

### Revocation

Key revocation **anlıktır.** Revoke edilen key Redis cache'inden temizlenir, bir sonraki verification isteğinde reddedilir.

---

## Kimlik Doğrulama

### Token Tipi İzolasyonu (userType)

JWT payload'ında `userType` claim'i zorunludur:

```
Platform token: { userId, email, userType: 'platform', tokenType: 'access' }
Project token:  { userId, email, userType: 'project',  projectId, tokenType: 'access' }
```

`platformGuard` → `userType !== 'platform'` ise 401 — project token ile platform endpoint'ine erişilemez.
`projectGuard` → `userType !== 'project'` veya `projectId` eksikse 401 — platform token ile project endpoint'ine erişilemez.

Bu izolasyon kritik bir güvenlik sınırıdır: XYZ'nin son kullanıcısı (alice), platform yönetim API'sine erişemez.

### Platform Kullanıcıları (JWT)

Proje ve key yönetimi için iki katmanlı JWT stratejisi:

| Token | Süre | Taşıma | Amaç |
|---|---|---|---|
| Access token | 15 dakika | `Authorization: Bearer` header | Her istekte kimlik doğrulama |
| Refresh token | 7 gün | HTTP-only cookie | Yeni access token alma |

Access token expire olunca client `POST /v1/auth/refresh` ile yeni access token alır. Refresh token JavaScript'ten erişilemez — XSS saldırılarına karşı korumalı.

**Logout — token blacklist:**

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

Tüm yönetim endpoint'leri `authGuard` middleware'i ile korunur.

Yalnızca şunlar public'tir:
- `POST /v1/auth/register`
- `POST /v1/auth/login`
- `POST /v1/auth/refresh`
- `POST /v1/verify`

### Tenant İzolasyonu

Her işlem öncesinde isteği yapan kullanıcının ilgili projeye sahip olduğu doğrulanır. Bir projenin ele geçirilmesi diğer projeleri etkilemez.

---

## Hata Stratejisi

**Fail closed:** Altyapı hatası durumunda (MongoDB'ye ulaşılamıyor, Redis çökmüş vb.) verification `valid: false` döndürür. Erişim asla varsayılan olarak açık bırakılmaz.

---

## Rate Limiting

Üç katmanlı Redis tabanlı rate limiting:

| Katman | Kapsam | Endpoint | Config |
|---|---|---|---|
| IP bazlı | Tüm IP'ler | `/v1/auth/login`, `/v1/auth/register` | `RATE_LIMIT_IP_MAX` / `RATE_LIMIT_IP_WINDOW_SECONDS` |
| Key bazlı | Proje başına | `/v1/verify` | `RATE_LIMIT_KEY_MAX` / `RATE_LIMIT_KEY_WINDOW_SECONDS` |

Limit aşıldığında:

```json
{ "valid": false, "error": "rate_limit_exceeded", "retryAfter": 42 }
```

---

## Input Validation

Tüm request body'leri `validateDto` middleware'i ile HTTP sınırında doğrulanır. `class-validator` dekoratörleri kullanılır.

Her domain kendi DTO sınıfını tanımlar (`src/*/dtos/`). Validation hatası durumunda istek service katmanına ulaşmadan `400 validation_error` döner.

`whitelist: true` seçeneği ile tanımsız property'ler otomatik olarak request body'den temizlenir — mass assignment saldırılarına karşı koruma sağlar.

---

## V1 Kapsam Dışı

- Webhook imzalama
- IP whitelist/blacklist
- Key rotation otomasyonu
- Anomali tespiti

Bunlar V2/V3 roadmap'inde.
