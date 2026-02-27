# Mimari

## Genel Bakış

Elyzor, API key authentication'ı dışa alan bir servisdir. Korunan API'ler kimlik doğrulama mantığını kendileri implement etmek yerine Elyzor'a delege eder.

```
İstemci Uygulaması
        │
        │ API İsteği
        ▼
  Korunan API
        │
        │ POST /v1/verify
        ▼
      Elyzor
        │
        ├── MongoDB (metadata, loglar)
        └── Redis (cache, rate limiting)
```

**Elyzor asla uygulama trafiğini proxy'lemez.** Sadece "bu key geçerli mi?" sorusunu yanıtlar.

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

Bu yapı **Layered Architecture** olarak adlandırılır. DDD veya MVC değil — daha pragmatik bir yaklaşım. Service Layer Pattern ile Repository Pattern'in birleşimi.

`validateDto(DtoClass)` middleware'i router ile service arasında konumlanır. Request body'yi `plainToInstance` ile DTO sınıfına dönüştürür, `validate` ile kontrol eder. Hata varsa service'e ulaşmadan 400 döner.

---

## Bileşenler

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
```

Validation hatası varsa service'e hiç ulaşılmaz — 400 `validation_error` döner. Service katmanı yalnızca iş mantığı kurallarını kontrol eder (örn. email zaten kayıtlı mı).

### Auth Modülü
Platform kullanıcılarının kimlik doğrulaması. Access token (15dk, Bearer) + refresh token (7 gün, HTTP-only cookie) stratejisi. API tüketicilerini değil, Elyzor hesap sahiplerini yönetir.

Refresh token'lar MongoDB'de SHA-256 hash olarak saklanır, Redis'te cache'lenir. Logout'ta access token Redis blacklist'e eklenir.

### Project Servisi
Tenant izolasyon katmanı. Her kullanıcı birden fazla proje sahibi olabilir. Tüm key işlemleri proje kapsamında çalışır.

### ApiKey Servisi
Key üretimi, hash'leme, revocation. Plaintext key asla saklanmaz.

### Verification Servisi
En performans-kritik bileşen. Hedef: ortalama <5ms.

```
POST /v1/verify
        │
   Key'i ayıkla
        │
   Redis lookup
        │
  ├── Cache hit  → constant-time compare + rate limit kontrolü
  └── Cache miss → MongoDB lookup → constant-time compare → cache'e yaz
        │
   { valid, projectId, rateLimitRemaining }
```

Hash karşılaştırması `crypto.timingSafeEqual()` ile yapılır — timing attack'lara karşı.

Rate limit: key bazlı (`rateLimit.key`) Redis counter. IP bazlı limit auth endpoint'lerinde uygulanır.

### Usage Servisi
Her verification olayını asenkron (fire & forget) kaydeder. `latencyMs`, `result`, `ip`, `country` alanları V2 dashboard için şimdiden toplanmaktadır.

---

## Veri Katmanı

### MongoDB
Kalıcı depolama. Kullanıcılar, projeler, API key hash'leri, usage logları burada tutulur. Source of truth.

### Redis
Sıcak yol performans katmanı. Verification cache, revoked key cache, rate limiting sayaçları. Redis çökerse MongoDB'ye fallback yapılır — doğruluk korunur, performans düşer.

---

## Cluster

Production'da `src/cluster.ts` kullanılır. Node.js `cluster` modülü ile tek process yerine CPU çekirdeği başına bir worker çalışır.

```
Primary Process (cluster.ts)
│   ├── Sistem kaynaklarını okur: os.cpus(), os.totalmem()
│   ├── CPU_COUNT kadar worker fork'lar
│   ├── Her worker'a RAM payı hesaplar: totalRAM / CPU_COUNT
│   ├── Worker'ları 10 sn'de bir memory_check ile sorgular
│   │     → RSS > payın %80'ini geçerse uyarı loglanır
│   └── Çöken worker'ı otomatik yeniden başlatır
│
└── Worker Process × CPU_COUNT
      └── src/index.ts → MongoDB + Redis bağlantısı → Express dinleme
```

**Örnek (8 çekirdek / 16 GB):**
- 8 worker
- Worker başına RAM payı: 2048 MB
- Uyarı eşiği: 1638 MB (payın %80'i)

**Önemli:** Her worker bağımsız bir process'tir. MongoDB ve Redis bağlantıları her worker'da ayrı açılır. Bu Redis ve MongoDB'nin connection pool kapasitesini göz önünde bulundurarak planlanmalıdır.

```bash
npm run build   # tsc ile derle
npm start       # cluster modunda çalıştır (production)
npm run dev     # tek process, hot reload (development — cluster yok)
```

---

## Ölçeklenme

Tek sunucuda cluster, birden fazla sunucuda yatay ölçekleme:

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

`GET /docs` — Swagger UI. `src/config/swagger.ts` içinde OpenAPI 3.0 spec tanımlı.

Tüm endpoint'ler, request/response şemaları ve security scheme'leri bu dosyada merkezileştirilmiştir. JSDoc annotation kullanılmaz — spec doğrudan kod olarak yönetilir.

---

## V1 Kapsam Dışı

Bunlar bilinçli olarak V1'e alınmadı:

- OAuth / sosyal giriş
- Enterprise SSO
- Identity federation
- Session yönetimi
- Microservice ayrımı (operasyonel baskı oluşana kadar monolith)