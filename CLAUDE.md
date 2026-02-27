# CLAUDE.md — Elyzor

Bu dosya Claude'a bu kod tabanında nasıl çalışması gerektiğini anlatır.

---

## Elyzor Nedir?

Elyzor bir **API Authentication Altyapı Servisi**dir. API key'lerini üretir, doğrular ve takip eder — böylece diğer API'ler kendi auth mantığını implement etmek zorunda kalmaz.

Korunan bir API'nin yapması gereken tek şey şudur:

```ts
const { valid } = await elyzor.verify(req.headers.authorization);
if (!valid) return res.status(401).json({ error: "unauthorized" });
```

Geri kalanını Elyzor halleder: key üretimi, hash'leme, revocation, rate limiting, kullanım loglaması.

**Elyzor asla uygulama trafiğini proxy'lemez.** Sadece "bu key geçerli mi?" sorusunu yanıtlar.

---

## Teknoloji Yığını

| Katman | Teknoloji |
|---|---|
| Runtime | Node.js 18+ |
| Dil | TypeScript (strict mode) |
| Framework | Express |
| Veritabanı | MongoDB (Mongoose ile) |
| Cache / Rate Limiting | Redis (ioredis ile) |
| Auth (platform kullanıcıları) | JWT (jsonwebtoken) |
| Test | Jest + ts-jest |
| Linting | ESLint + Prettier |
| Altyapı | Docker + docker-compose |

---

## TypeScript Kurulumu

### tsconfig.json

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "commonjs",
    "lib": ["ES2020"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noImplicitReturns": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "skipLibCheck": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

### Temel bağımlılıklar

```bash
npm install express mongoose ioredis jsonwebtoken
npm install -D typescript ts-node nodemon @types/express @types/node @types/jsonwebtoken
```

### Scripts (package.json)

```json
{
  "scripts": {
    "dev": "nodemon --exec ts-node src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js",
    "lint": "eslint src/**/*.ts",
    "format": "prettier --write src/**/*.ts",
    "test": "jest",
    "test:unit": "jest tests/unit",
    "test:integration": "jest tests/integration"
  }
}
```

---

## TypeScript Kuralları

Bunlar ihlal edilemez:

- **`any` kullanılmaz.** Tipi bilinmiyorsa `unknown` kullan, sonra type guard ile daralt.
- **`strict: true` kapalı tutulmaz.** tsconfig'deki strict ayarlar değiştirilmez.
- **Her fonksiyonun dönüş tipi açık yazılır.** TypeScript çıkarsa bile.
- **`!` (non-null assertion) kullanılmaz.** Bunun yerine açık null check yap.
- **`as Type` cast'i minimumda tutulur.** Mongoose dönüşleri dışında cast yazmadan önce iki kez düşün.

```ts
// ❌ yanlış
const user = await UserModel.findById(id) as User;
if (user!.email) { ... }

// ✅ doğru
const user = await UserModel.findById(id);
if (!user) throw new NotFoundError("Kullanıcı bulunamadı");
if (user.email) { ... }
```

---

## Express ile TypeScript

### Request tipini genişletme

JWT doğrulamasından sonra `req.user` eklemek için Express'in `Request` tipi genişletilir:

```ts
// src/types/express.d.ts
import { IUser } from "../users/users.types";

declare global {
  namespace Express {
    interface Request {
      user?: IUser;
    }
  }
}
```

### Router tipi

```ts
import { Router, Request, Response, NextFunction } from "express";

const router = Router();

router.post("/register", async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const result = await authService.register(req.body);
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});
```

### Middleware tipi

```ts
import { Request, Response, NextFunction } from "express";

export const authGuard = (req: Request, res: Response, next: NextFunction): void => {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }
  next();
};
```

---

## DTO Pattern

Her endpoint'e giren ve çıkan veri DTO (Data Transfer Object) ile tiplenir. DTO'lar `*.types.ts` içinde yaşar.

```ts
// apikeys.types.ts

export interface CreateApiKeyDto {
  name: string;
  projectId: string;
}

export interface ApiKeyResponse {
  id: string;
  name: string;
  prefix: string;       // sk_live_xxxx (sadece ilk kısım)
  createdAt: Date;
  revoked: boolean;
}

export interface CreatedApiKeyResponse extends ApiKeyResponse {
  key: string;          // tam key — sadece oluşturulma anında döner
}
```

Router'da gelen body doğrudan service'e geçilmez — önce DTO'ya şekillendirilir:

```ts
// ✅ doğru
const dto: CreateApiKeyDto = {
  name: req.body.name,
  projectId: req.params.projectId,
};
const result = await apiKeyService.create(dto);

// ❌ yanlış
const result = await apiKeyService.create(req.body);
```

---

## Proje Yapısı

```
elyzor/
├── src/
│   ├── auth/
│   │   ├── auth.router.ts
│   │   ├── auth.service.ts
│   │   ├── auth.repository.ts        # refresh_tokens koleksiyonu
│   │   └── auth.types.ts
│   ├── users/
│   │   ├── users.model.ts
│   │   └── users.types.ts
│   ├── projects/
│   │   ├── projects.router.ts
│   │   ├── projects.service.ts
│   │   ├── projects.repository.ts
│   │   ├── projects.model.ts
│   │   └── projects.types.ts
│   ├── apikeys/
│   │   ├── apikeys.router.ts
│   │   ├── apikeys.service.ts
│   │   ├── apikeys.repository.ts
│   │   ├── apikeys.model.ts
│   │   └── apikeys.types.ts
│   ├── verification/
│   │   ├── verification.router.ts
│   │   ├── verification.service.ts
│   │   └── verification.types.ts
│   ├── usage/
│   │   ├── usage.service.ts
│   │   ├── usage.repository.ts
│   │   ├── usage.model.ts
│   │   └── usage.types.ts
│   ├── middleware/
│   │   ├── authGuard.ts
│   │   ├── errorHandler.ts
│   │   └── rateLimiter.ts
│   ├── errors/
│   │   ├── AppError.ts
│   │   ├── NotFoundError.ts
│   │   ├── UnauthorizedError.ts
│   │   ├── ForbiddenError.ts
│   │   ├── ValidationError.ts
│   │   └── index.ts
│   ├── types/
│   │   └── express.d.ts
│   ├── config/
│   │   ├── db.ts
│   │   ├── redis.ts
│   │   └── env.ts
│   └── index.ts
├── tests/
│   ├── unit/
│   └── integration/
├── tsconfig.json
├── docker-compose.yml
├── .env.example
└── CLAUDE.md
```

---

## Mimari

### Katman Yapısı

Elyzor **katmanlı mimari** kullanır. Her katmanın tek bir sorumluluğu vardır ve bağımlılıklar **her zaman tek yönde** akar:

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
 Repository       → Sadece veritabanı işlemleri (sorgular, yazma, okuma)
     │
     ▼
   Model          → Sadece Mongoose şema tanımı
```

**Katman kuralları — bunlar ihlal edilemez:**

- `Router` iş mantığı içermez. Validation, hash'leme, business rule — hiçbiri router'a girmez.
- `Service` HTTP'yi bilmez. `req`, `res`, `next` bir service metoduna asla parametre olarak geçilmez.
- `Repository` iş mantığı içermez. Sadece MongoDB sorguları çalıştırır, sonucu döndürür.
- `Model` sadece Mongoose şemasıdır. Başka hiçbir katmanı import etmez.
- `Types` hiçbir katmanı import etmez. Saf tip tanımlarıdır.

---

### Repository Pattern

```ts
// apikeys.repository.ts
import { ApiKeyModel } from "./apikeys.model";
import { ApiKey, CreateApiKeyDto } from "./apikeys.types";

export class ApiKeyRepository {
  async findByHash(hash: string): Promise<ApiKey | null> {
    return ApiKeyModel.findOne({ hash }).lean();
  }

  async create(data: CreateApiKeyDto & { hash: string }): Promise<ApiKey> {
    return ApiKeyModel.create(data);
  }

  async revoke(keyId: string, projectId: string): Promise<void> {
    await ApiKeyModel.updateOne(
      { _id: keyId, projectId },
      { revoked: true, revokedAt: new Date() }
    );
  }
}

// apikeys.service.ts
import { ApiKeyRepository } from "./apikeys.repository";
import { CreateApiKeyDto } from "./apikeys.types";
import { NotFoundError, ForbiddenError } from "../errors";

export class ApiKeyService {
  constructor(private readonly repo: ApiKeyRepository) {}

  async revokeKey(keyId: string, projectId: string): Promise<void> {
    const key = await this.repo.findById(keyId);
    if (!key) throw new NotFoundError("API key bulunamadı");
    if (key.projectId.toString() !== projectId) {
      throw new ForbiddenError("Bu key size ait değil");
    }
    await this.repo.revoke(keyId, projectId);
  }
}
```

---

### Hata Yönetimi

```ts
// errors/AppError.ts
export class AppError extends Error {
  constructor(
    public readonly message: string,
    public readonly statusCode: number,
    public readonly code: string
  ) {
    super(message);
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }
}

// errors/NotFoundError.ts
export class NotFoundError extends AppError {
  constructor(message = "Bulunamadı") {
    super(message, 404, "not_found");
  }
}

// errors/ForbiddenError.ts
export class ForbiddenError extends AppError {
  constructor(message = "Erişim reddedildi") {
    super(message, 403, "forbidden");
  }
}
```

**Merkezi error handler:**

```ts
// middleware/errorHandler.ts
import { Request, Response, NextFunction } from "express";
import { AppError } from "../errors";

export const errorHandler = (
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      error: err.code,
      message: err.message,
    });
    return;
  }
  console.error(err);
  res.status(500).json({ error: "internal_error" });
};
```

**Kurallar:**
- Hatalar **service katmanında** fırlatılır, router'da değil
- `errorHandler` dışında `res.status(500)` yazılmaz
- Hata mesajları iç detay sızdırmaz

---

## Temel Modüller

### auth/
Platform kullanıcı kimlik doğrulamasını yönetir (API tüketicilerini değil).

**Endpoint'ler:**
- `POST /v1/auth/register` — hesap oluştur
- `POST /v1/auth/login` — access token + refresh token döner
- `POST /v1/auth/refresh` — yeni access token al
- `POST /v1/auth/logout` — token'ları iptal et
- `POST /v1/auth/logout-all` — tüm cihazlardan çık

**Token stratejisi:**

```
access token  → 15 dakika, Authorization header'da taşınır
refresh token → 7 gün, HTTP-only cookie'de taşınır
```

Access token expire olunca refresh token ile yenisi alınır. Kullanıcı tekrar login olmak zorunda kalmaz.

**Logout — token blacklist:**

JWT stateless olduğu için logout'ta token'ı direkt iptal edemeyiz. Çözüm: Redis blacklist.

```ts
// Logout akışı
// 1. access token → Redis blacklist'e ekle (TTL = token'ın kalan süresi)
// 2. refresh token → MongoDB'den sil, Redis cache'ini temizle

// Her istekte authGuard blacklist'i kontrol eder
const isBlacklisted = await redis.get(`blacklist:${token}`);
if (isBlacklisted) throw new UnauthorizedError("Token iptal edilmiş");
```

**Refresh token saklama — hem Redis hem MongoDB:**

```
Refresh token geldi
        │
   Redis'te var mı?
        │
  ├── Evet → doğrula, yeni access token ver
  └── Hayır → MongoDB'ye bak
                │
          ├── Var → Redis'e yaz, doğrula
          └── Yok → 401 dön
```

MongoDB source of truth, Redis cache. Redis çökerse MongoDB'ye fallback — aynı verification mantığı.

**refresh_tokens koleksiyonu:**

```ts
{
  userId:     ObjectId,
  tokenHash:  string,       // plaintext değil, SHA-256 hash
  expiresAt:  Date,         // TTL index ile otomatik silinir
  revokedAt:  Date | null,  // null ise aktif
  createdAt:  Date,
}
```

### projects/
Tenant izolasyon katmanı. Her API key bir projeye aittir.
- Kullanıcılar birden fazla proje sahibi olabilir
- Tüm key işlemleri, isteği yapan kullanıcıya ait geçerli bir `projectId` gerektirir

### apikeys/
Temel credential yönetimi.
- Key'ler `sk_live_` prefix'iyle üretilir
- Yapı: `sk_live_<publicPart>.<secretPart>`
- **MongoDB'ye yalnızca hash'lenmiş secret kaydedilir — asla plaintext**
- Key'ler kullanıcıya yalnızca oluşturulma anında gösterilir
- Revocation anlıktır

### verification/
En performans-kritik bileşen. Hedef: **ortalama <5ms**.

Doğrulama akışı:
```
POST /v1/verify (Bearer sk_live_xxxxx)
        │
   Key'i ayıkla
        │
   Redis lookup
        │
  ├── Cache hit  → doğrula + rate limit kontrolü
  └── Cache miss → MongoDB lookup → sonucu cache'e yaz
        │
   { valid, projectId, rateLimitRemaining } döndür
```

**Fail closed:** MongoDB'ye ulaşılamazsa isteği reddet. Asla fail open yapma.

### usage/
Her doğrulama olayını asenkron (non-blocking) olarak kaydeder.

**Usage tipi:**

```ts
// usage.types.ts
export type VerificationResult = "success" | "invalid_key" | "revoked" | "rate_limited";

export interface UsageLogDto {
  projectId: string;
  apiKeyId: string;
  result: VerificationResult;
  latencyMs: number;
  ip: string;
  country?: string;
}
```

**MongoDB index'leri — bunlar olmadan dashboard sorguları MongoDB'yi patlatır:**

```ts
{ projectId: 1, createdAt: -1 }
{ apiKeyId: 1, createdAt: -1 }
{ result: 1, createdAt: -1 }
{ createdAt: -1 }
```

**Kural:** Usage logu asla verification'ı bloklamamalıdır:

```ts
// ✅ doğru
usageService.log(dto).catch(console.error);
return verificationResult;

// ❌ yanlış
await usageService.log(dto);
return verificationResult;
```

---

## Dashboard Temeli (V2 Hazırlığı)

Dashboard V2'de gelecek ama veri **şimdiden doğru yapıda** toplanmalıdır.

**V1'de açılacak stats endpoint'i:**

```
GET /v1/projects/:projectId/stats?range=7d
```

Dönüş tipi:

```ts
export interface ProjectStatsResponse {
  totalRequests: number;
  successRate: number;
  topKeys: Array<{ keyId: string; requests: number }>;
  requestsByDay: Array<{ date: string; count: number; errors: number }>;
  rateLimitHits: number;
  avgLatencyMs: number;
}
```

**Bu endpoint verification path'inden tamamen ayrı durur.** Ağır aggregate sorguları çalıştırabilir — dashboard real-time değildir.

---

## API Endpoint'leri

### Auth
```
POST   /v1/auth/register
POST   /v1/auth/login
POST   /v1/auth/refresh
POST   /v1/auth/logout
POST   /v1/auth/logout-all
```

### Projeler
```
GET    /v1/projects
POST   /v1/projects
DELETE /v1/projects/:id
```

### API Key'leri
```
GET    /v1/projects/:projectId/keys
POST   /v1/projects/:projectId/keys
DELETE /v1/projects/:projectId/keys/:keyId
```

### İstatistikler
```
GET    /v1/projects/:projectId/stats?range=7d
```

### Doğrulama (public, JWT gerekmez)
```
POST   /v1/verify
```

---

## Doğrulama Yanıt Formatları

**200 — geçerli**
```json
{ "valid": true, "projectId": "...", "rateLimitRemaining": 98 }
```

**401 — geçersiz key**
```json
{ "valid": false, "error": "invalid_key" }
```

**403 — iptal edilmiş key**
```json
{ "valid": false, "error": "key_revoked" }
```

**429 — rate limit aşıldı**
```json
{ "valid": false, "error": "rate_limit_exceeded", "retryAfter": 42 }
```

---

## Güvenlik Kuralları

Bunlar pazarlık konusu değildir. Asla ihlal edilmez:

1. **API key'ler SHA-256, şifreler bcrypt ile hash'lenir.** Bu ikisini asla karıştırma. API key brute-force'a doğası gereği dayanıklı — SHA-256 yeterli ve hızlı. Şifreler kısa ve tahmin edilebilir — bcrypt'in intentional yavaşlığı bir özellik.
2. **Key doğrulamada her zaman constant-time comparison kullan.** `crypto.timingSafeEqual()` kullan. Normal `===` timing attack'a açık.
3. **Fail closed.** Altyapı hatası nedeniyle doğrulama tamamlanamazsa `valid: false` döndür.
4. **Tenant izolasyonu.** Herhangi bir key işlemi öncesinde isteği yapan kullanıcının projeye sahip olduğunu doğrula.
5. **Tüm yönetim endpoint'lerinde JWT zorunlu.** Yalnızca `/v1/verify` ve auth endpoint'leri public'tir.
6. **Logout token blacklist ile yapılır.** Access token Redis'e eklenir, refresh token MongoDB'den silinir.
7. **Rate limiting çok katmanlı uygulanır.** IP bazlı + key bazlı + endpoint bazlı. Sadece key bazlı yetmez.

---

## Ortam Değişkenleri

```env
PORT=3000
MONGO_URI=mongodb://localhost:27017/elyzor
REDIS_URL=redis://localhost:6379
JWT_SECRET=production_ortaminda_degistir
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d
RATE_LIMIT_IP_MAX=60
RATE_LIMIT_IP_WINDOW_SECONDS=60
RATE_LIMIT_KEY_MAX=100
RATE_LIMIT_KEY_WINDOW_SECONDS=60
BCRYPT_ROUNDS=12
```

Env değişkenleri `src/config/env.ts` üzerinden okunur — kod içinde `process.env.X` doğrudan kullanılmaz:

```ts
// config/env.ts
export const env = {
  port: Number(process.env.PORT) || 3000,
  mongoUri: process.env.MONGO_URI!,
  redisUrl: process.env.REDIS_URL!,
  jwt: {
    secret: process.env.JWT_SECRET!,
    accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN || "15m",
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || "7d",
  },
  rateLimit: {
    ip: {
      max: Number(process.env.RATE_LIMIT_IP_MAX) || 60,
      windowSeconds: Number(process.env.RATE_LIMIT_IP_WINDOW_SECONDS) || 60,
    },
    key: {
      max: Number(process.env.RATE_LIMIT_KEY_MAX) || 100,
      windowSeconds: Number(process.env.RATE_LIMIT_KEY_WINDOW_SECONDS) || 60,
    },
  },
  bcryptRounds: Number(process.env.BCRYPT_ROUNDS) || 12,
};
```

---

## Yerel Geliştirme

```bash
# MongoDB + Redis'i başlat
docker compose up -d

# Bağımlılıkları yükle
npm install

# Dev server'ı başlat (hot reload ile)
npm run dev
```

---

## Test

```bash
npm test                    # tüm testleri çalıştır
npm run test:unit           # sadece unit testler
npm run test:integration    # integration testler (Docker gerektirir)
```

**Test kuralları:**
- Unit testler Redis ve MongoDB'yi mock'lar
- Integration testler gerçek Docker servislerini kullanır
- Her service metodunun karşılığında bir unit test bulunur
- Verification akışının uçtan uca integration coverage'ı olur
- Implementation detaylarını değil, davranışı test et
- `ts-jest` kullanılır — test dosyaları da `.ts` uzantılıdır

---

## Kod Stili

ESLint + Prettier zorunludur. Commit öncesi çalıştır:

```bash
npm run lint
npm run format
```

**Kurallar:**
- Raw Promise yerine `async/await` kullan
- `any` tipi kullanılmaz — `unknown` kullan ve type guard ile daralt
- Derin iç içe koşullar yerine early return tercih et
- İş mantığı service katmanındadır — router'lar yalnızca HTTP'yi yönetir
- Hatalar service'lerden fırlatılır, merkezi `errorHandler`'da yakalanır
- `process.env` doğrudan kullanılmaz, her zaman `config/env.ts` üzerinden okunur

---

## Claude'un Bilmesi Gerekenler

- Bu **güvenlik-kritik** bir TypeScript + Express kod tabanıdır. Doğruluk her zaman zekilikten önce gelir.
- Bir güvenlik kararında kararsız kalırsan yukarıdaki Güvenlik Kuralları bölümüne bak.
- Verification path'ini olabildiğince sade tut — her ekstra işlem gecikme ekler.
- Kullanım loglaması **async ve non-blocking** olmalıdır — asla verify isteğini yavaşlatmamalıdır.
- V1'de MongoDB şema değişiklikleri geriye dönük uyumlu olmalıdır.
- Redis bir performans katmanıdır, source of truth değildir. Otorite MongoDB'dir.
- Açık bir gerekçe olmadan yeni bağımlılık ekleme.
- `any` yazarsan derleme geçse bile kabul edilmez — tip sorunu varsa düzgün çöz.