# Elyzor — Microservice Trust Architecture

Bu doküman, Elyzor’un **microservice ortamında nasıl kullanılacağını** ve sistemin mimari amacını açık şekilde tanımlar.

Bu belge Claude Code veya başka bir AI agent’a verilerek implementasyon yapılması hedeflenmiştir.

---

## 1. Amaç

Elyzor bir **User Authentication sistemi değildir**.

Elyzor’un amacı:

> Microservice'ler ve backend servisleri arasında güvenli kimlik doğrulama (service authentication) sağlamaktır.

Elyzor şunu çözer:

* Hangi servis isteği gönderdi?
* Bu servis gerçekten tanımlı mı?
* Bu servis bu project’e ait mi?
* Servis yetkili mi?

Elyzor **insan kullanıcıları yönetmez**.

---

## 2. Temel Kavramlar

### Elyzor User

Elyzor dashboard’una giriş yapan developer veya founder’dır.

Görevleri:

* Project oluşturmak
* Service tanımlamak
* Service key üretmek

Bu kullanıcılar sadece Elyzor müşterileridir.

---

### Project (Tenant)

Her müşteri kendi backend sistemini temsil eden bir Project oluşturur.

Örnek:

```
Project: xyz-production
```

Project izolasyon boundary’sidir.

Tüm servisler project altında çalışır.

---

### Service Identity

Her microservice bir kimliğe sahiptir.

Örnek servisler:

```
api-gateway
billing-service
order-service
notification-worker
```

Her servis Elyzor tarafından tanımlanır.

---

### Service Key

Her servis için Elyzor bir key üretir:

```
svc_live_xxxxxxxxx
```

Bu key:

* Servisin kimliğidir
* Environment variable olarak saklanır
* Servisler arası çağrılarda kullanılır

Örnek:

```
ELYZOR_SERVICE_KEY=svc_live_billing_xxx
```

---

## 3. Production Akışı

### Senaryo

API Gateway → Billing Service çağrısı yapıyor.

---

### Step 1 — Request Gönderimi

Gateway billing servisine istek gönderir:

```
POST /charge
Authorization: Bearer svc_live_gateway_xxx
```

Gateway kendi servis kimliğini gönderir.

---

### Step 2 — Service Verification

Billing servisi isteğe direkt güvenmez.

İlk olarak Elyzor’a doğrulama isteği gönderir:

```
POST /v1/verify/service
Authorization: Bearer svc_live_gateway_xxx
```

---

### Step 3 — Elyzor Doğrulama Süreci

Elyzor içinde:

1. Key prefix kontrolü
2. Key parse edilmesi
3. Hash lookup
4. Project resolve
5. Service resolve
6. Revoked kontrolü
7. Rate limit kontrolü
8. Usage log kaydı

---

### Step 4 — Elyzor Response

```
{
  "valid": true,
  "projectId": "xyz-production",
  "service": {
    "id": "svc_123",
    "name": "api-gateway"
  }
}
```

---

### Step 5 — Local Authorization

Billing servisi artık çağıranın kim olduğunu bilir.

Servis kendi authorization kararını verir:

```
gateway → billing ✅
worker → billing ❌
```

Elyzor authorization yapmaz.

Sadece authentication yapar.

---

## 4. Kritik Mimari Kural

Elyzor request path’inde değildir.

YANLIŞ:

```
Gateway → Elyzor → Billing
```

DOĞRU:

```
Gateway → Billing
            ↓
        Elyzor Verify
```

Elyzor sadece trust authority’dir.

---

## 5. Elyzor’un Sorumluluğu

Elyzor:

✅ Service identity üretir
✅ Service doğrular
✅ Project boundary korur
✅ Usage log tutar
✅ Rate limit uygular

Elyzor:

❌ User login yönetmez
❌ Session yönetmez
❌ Business authorization yapmaz

---

## 6. Mimari Hedef

Elyzor’un hedefi:

> Backend sistemleri için Zero-Trust Service Authentication katmanı olmak.

Her servis birbirine değil,
Elyzor’a güvenir.

```
Service → Trust → Elyzor
```

---

## 7. Implementasyon Hedefleri (Claude Code Görevi)

Claude aşağıdaki özellikleri implemente etmelidir:

### 1. Service Model

Alanlar:

* id
* projectId
* name
* keyHash
* createdAt
* revokedAt (optional)

---

### 2. Service Key Generation

Prefix:

```
svc_live_
```

Key plaintext saklanmaz.
Sadece hash saklanır.

---

### 3. Verify Service Endpoint

Endpoint:

```
POST /v1/verify/service
```

Davranış:

* Bearer token al
* Key parse et
* Hash doğrula
* Service bul
* Project resolve et
* Rate limit uygula
* Usage log oluştur

Response:

```
valid
projectId
serviceId
serviceName
```

---

### 4. Usage Tracking

Her verify çağrısında:

* serviceId
* projectId
* timestamp
* latency
* ip

loglanmalıdır.

Verify işlemi bloklanmamalıdır (fire-and-forget).

---

## 8. Nihai Tanım

Elyzor:

> Developer-friendly Service Authentication Infrastructure

User authentication sistemi değildir.

---
