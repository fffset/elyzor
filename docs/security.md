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

### Platform Kullanıcıları (JWT)

Proje ve key yönetimi için JWT kullanılır. Tüm yönetim endpoint'leri `authGuard` middleware'i ile korunur.

Yalnızca şunlar public'tir:
- `POST /v1/auth/register`
- `POST /v1/auth/login`
- `POST /v1/verify`

### Tenant İzolasyonu

Her işlem öncesinde isteği yapan kullanıcının ilgili projeye sahip olduğu doğrulanır. Bir projenin ele geçirilmesi diğer projeleri etkilemez.

---

## Hata Stratejisi

**Fail closed:** Altyapı hatası durumunda (MongoDB'ye ulaşılamıyor, Redis çökmüş vb.) verification `valid: false` döndürür. Erişim asla varsayılan olarak açık bırakılmaz.

---

## Rate Limiting

Redis tabanlı rate limiting her API key için ayrı uygulanır. Limit aşıldığında:

```json
{ "valid": false, "error": "rate_limit_exceeded", "retryAfter": 42 }
```

---

## V1 Kapsam Dışı

- Webhook imzalama
- IP whitelist/blacklist
- Key rotation otomasyonu
- Anomali tespiti

Bunlar V2/V3 roadmap'inde.
