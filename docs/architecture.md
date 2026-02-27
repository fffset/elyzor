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
  Router          → Sadece HTTP: isteği al, DTO oluştur, response gönder
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

---

## Bileşenler

### API Katmanı
Stateless, yatay olarak ölçeklenebilir. HTTP isteklerini alır, DTO'ya dönüştürür, service'e iletir.

### Auth Modülü
Platform kullanıcılarının kimlik doğrulaması. JWT tabanlı. API tüketicilerini değil, Elyzor hesap sahiplerini yönetir.

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
  ├── Cache hit  → doğrula + rate limit kontrolü
  └── Cache miss → MongoDB lookup → cache'e yaz
        │
   { valid, projectId, rateLimitRemaining }
```

### Usage Servisi
Her verification olayını asenkron kaydeder. Dashboard için veri tabanı bu servistir.

---

## Veri Katmanı

### MongoDB
Kalıcı depolama. Kullanıcılar, projeler, API key hash'leri, usage logları burada tutulur. Source of truth.

### Redis
Sıcak yol performans katmanı. Verification cache, revoked key cache, rate limiting sayaçları. Redis çökerse MongoDB'ye fallback yapılır — doğruluk korunur, performans düşer.

---

## Ölçeklenme

API katmanı stateless olduğu için yatay ölçekleme yapılabilir:

```
Load Balancer
      │
 ┌────┴────┐
 │ Elyzor  │
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

## V1 Kapsam Dışı

Bunlar bilinçli olarak V1'e alınmadı:

- OAuth / sosyal giriş
- Enterprise SSO
- Identity federation
- Session yönetimi
- Microservice ayrımı (operasyonel baskı oluşana kadar monolith)