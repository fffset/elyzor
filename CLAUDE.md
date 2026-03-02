# CLAUDE.md — Elyzor

Bu dosya Claude'a bu kod tabanında nasıl çalışması gerektiğini anlatır.

---

## Elyzor Nedir?

Elyzor bir **API Authentication Altyapı Servisi**dir. İki farklı kimlik tipini üretir, doğrular ve takip eder:

- **API Key** (`sk_live_`) — External client → Backend trust
- **Service Key** (`svc_live_`) — Microservice → Microservice trust

Korunan bir API'nin yapması gereken tek şey şudur:

```ts
const { valid } = await elyzor.verify(req.headers.authorization);
if (!valid) return res.status(401).json({ error: "unauthorized" });
```

Geri kalanını Elyzor halleder: key üretimi, hash'leme, revocation, rate limiting, kullanım loglaması.

**Elyzor asla uygulama trafiğini proxy'lemez.** Sadece "bu kimlik geçerli mi?" sorusunu yanıtlar.

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
| Validation | class-validator + class-transformer |
| API Dokümantasyonu | swagger-jsdoc + swagger-ui-express |
| Test | Jest + ts-jest |
| Linting | ESLint + Prettier |
| Git Hooks | Husky + lint-staged |
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
    "skipLibCheck": true,
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true
  },
  "include": ["src/**/*"],
  "files": ["src/types/express.d.ts"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

### Temel bağımlılıklar

```bash
npm install express mongoose ioredis jsonwebtoken bcrypt cookie-parser class-validator class-transformer swagger-jsdoc swagger-ui-express
npm install -D typescript ts-node nodemon @types/express @types/node @types/jsonwebtoken @types/bcrypt @types/cookie-parser @types/swagger-jsdoc @types/swagger-ui-express
```

### Scripts (package.json)

```json
{
  "scripts": {
    "dev": "nodemon --exec ts-node src/index.ts",
    "build": "tsc",
    "start": "node dist/cluster.js",
    "lint": "eslint src/**/*.ts",
    "format": "prettier --write src/**/*.ts",
    "test": "jest",
    "test:unit": "jest tests/unit",
    "test:integration": "jest tests/integration --runInBand"
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
import { validateDto } from "../middleware/validateDto";
import { RegisterDto } from "./dtos/register.dto";

const router = Router();

router.post("/register", validateDto(RegisterDto), async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const dto: RegisterDto = req.body; // validateDto geçtikten sonra güvenli
    const result = await authService.register(dto);
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

## DTO Pattern ve Validation

### Request DTO'ları — class-validator sınıfları

Request body'ye giren veriler `class-validator` dekoratörleriyle süslenmiş DTO **sınıfları** ile doğrulanır. Her domain kendi `dtos/` klasörüne sahiptir:

```ts
// src/auth/dtos/register.dto.ts
import { IsEmail, IsString, MinLength, MaxLength } from 'class-validator';

export class RegisterDto {
  @IsEmail({}, { message: 'Geçerli bir email adresi giriniz' })
  @MaxLength(255)
  email!: string;

  @IsString()
  @MinLength(8, { message: 'Şifre en az 8 karakter olmalıdır' })
  @MaxLength(128)
  password!: string;
}
```

```ts
// src/projects/dtos/create-project.dto.ts
import { IsString, IsNotEmpty, MaxLength } from 'class-validator';

export class CreateProjectDto {
  @IsString()
  @IsNotEmpty({ message: 'Proje adı zorunludur' })
  @MaxLength(100)
  name!: string;
}
```

### validateDto middleware

`src/middleware/validateDto.ts` — generic middleware, her POST endpoint'inde kullanılır:

```ts
import { validateDto } from '../middleware/validateDto';
import { RegisterDto } from './dtos/register.dto';

router.post('/register', validateDto(RegisterDto), async (req, res, next) => {
  const dto: RegisterDto = req.body; // zaten doğrulanmış ve dönüştürülmüş
  const result = await authService.register(dto);
  res.status(201).json(result);
});
```

`whitelist: true` ile tanımsız property'ler otomatik temizlenir. Hata varsa service'e hiç ulaşılmaz — 400 döner.

### Response DTO'ları — plain interface

Yanıt tipleri `*.types.ts` içinde **interface** olarak kalır (doğrulama gerekmez):

```ts
// apikeys.types.ts
export interface ApiKeyResponse {
  id: string;
  projectId: string;
  publicPart: string;
  label: string;
  revoked: boolean;
  createdAt: Date;
}

export interface CreatedApiKeyResponse extends ApiKeyResponse {
  key: string; // plaintext — sadece oluşturulma anında döner
}
```

---

## Proje Yapısı

```
elyzor/
├── src/
│   ├── auth/
│   │   ├── dtos/
│   │   │   ├── register.dto.ts
│   │   │   └── login.dto.ts
│   │   ├── services/
│   │   │   └── token.service.ts      # generateAccessToken
│   │   ├── auth.router.ts
│   │   ├── auth.service.ts
│   │   ├── auth.repository.ts        # refresh_tokens koleksiyonu
│   │   ├── auth.model.ts
│   │   └── auth.types.ts
│   ├── users/
│   │   ├── users.model.ts
│   │   ├── users.repository.ts
│   │   └── users.types.ts
│   ├── projects/
│   │   ├── dtos/
│   │   │   └── create-project.dto.ts
│   │   ├── projects.router.ts
│   │   ├── projects.service.ts
│   │   ├── projects.repository.ts
│   │   ├── projects.model.ts
│   │   └── projects.types.ts
│   ├── apikeys/                      # sk_live_ — external client credentials
│   │   ├── dtos/
│   │   │   └── create-apikey.dto.ts
│   │   ├── apikeys.router.ts
│   │   ├── apikeys.service.ts
│   │   ├── apikeys.repository.ts
│   │   ├── apikeys.model.ts
│   │   └── apikeys.types.ts
│   ├── services/                     # svc_live_ — microservice identity credentials
│   │   ├── dtos/
│   │   │   └── create-service.dto.ts
│   │   ├── services.router.ts
│   │   ├── services.service.ts
│   │   ├── services.repository.ts
│   │   ├── services.model.ts
│   │   └── services.types.ts
│   ├── verification/                 # POST /v1/verify — sk_live_ doğrulama
│   │   ├── verification.router.ts
│   │   ├── verification.service.ts
│   │   └── verification.types.ts
│   ├── verify-service/               # POST /v1/verify/service — svc_live_ doğrulama
│   │   ├── verify-service.router.ts
│   │   ├── verify-service.service.ts
│   │   └── verify-service.types.ts
│   ├── stats/                        # GET /v1/projects/:id/stats
│   │   ├── stats.router.ts
│   │   ├── stats.service.ts
│   │   └── stats.types.ts
│   ├── usage/
│   │   ├── usage.service.ts
│   │   ├── usage.repository.ts
│   │   ├── usage.model.ts            # apiKeyId? + serviceId? — her ikisi aynı anda dolu olmaz
│   │   └── usage.types.ts
│   ├── middleware/
│   │   ├── authGuard.ts              # JWT doğrulama + Redis blacklist
│   │   ├── errorHandler.ts
│   │   ├── validateDto.ts
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
│   │   ├── env.ts
│   │   └── swagger.ts                # OpenAPI 3.0 spec
│   ├── app.ts
│   ├── index.ts
│   └── cluster.ts                    # production entrypoint
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
  Router          → Sadece HTTP: isteği al, response gönder
     │
     ▼
validateDto()     → class-validator ile request body doğrulaması (middleware)
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

- `Router` iş mantığı içermez. Hash'leme, business rule — hiçbiri router'a girmez.
- `validateDto` middleware'i input validation'ı halleder — service'e geçmeden önce çalışır.
- `Service` HTTP'yi bilmez. `req`, `res`, `next` bir service metoduna asla parametre olarak geçilmez.
- `Service` yalnızca iş mantığı kurallarını kontrol eder (örn. email zaten kayıtlı mı) — format/tip validasyonu değil.
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

**Refresh token rotation — her `/refresh` çağrısında token değişir:**

```
POST /refresh (cookie: refreshToken=xxx)
        │
   DB'den doğrula (findRefreshTokenAny)
        │
  ├── Yok veya süresi dolmuş → 401
  ├── revokedAt != null → token theft! → tüm oturumları kapat → 401
  └── Geçerli
        │
   Eski token revoke et (MongoDB + Redis)
        │
   Yeni token çifti ver
        │
   { accessToken } body'de, yeni refreshToken cookie'de
```

**Token theft detection:** Revoke edilmiş bir token geldiğinde saldırı sinyali kabul edilir — o kullanıcının tüm oturumları derhal kapatılır (`revokeAllUserTokens`).

**Önemli:** Rotation için her zaman DB'den sorgula — Redis cache'e güvenme. Eski token Redis'te cached olsa bile revoke kontrolü DB'den yapılmalıdır.

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
External client credential yönetimi.
- Key'ler `sk_live_` prefix'iyle üretilir
- Yapı: `sk_live_<publicPart>.<secretPart>`
- **MongoDB'ye yalnızca hash'lenmiş secret kaydedilir — asla plaintext**
- Key'ler kullanıcıya yalnızca oluşturulma anında gösterilir
- Revocation anlıktır — Redis cache de temizlenir (`redis.del("apikey:<hash>")`)

### services/
Microservice identity yönetimi. ApiKey ile aynı güvenlik prensipleri, farklı domain.
- Key'ler `svc_live_` prefix'iyle üretilir
- Yapı: `svc_live_<publicPart>.<secretPart>`
- `revokedAt?: Date` kullanır (`revoked: boolean` değil) — audit trail
- Service name project içinde unique: `{ projectId, name }` compound unique index
- Revocation → Redis cache temizlenir (`redis.del("svckey:<hash>")`)

**ÖNEMLİ:** `sk_live_` ve `svc_live_` key'ler birbirinin endpoint'inde çalışmaz. `verification.service` yalnızca `sk_live_` kabul eder; `verify-service.service` yalnızca `svc_live_` kabul eder.

### verification/
En performans-kritik bileşen. Hedef: **ortalama <5ms**.

Doğrulama akışı:
```
POST /v1/verify (Bearer sk_live_xxxxx)
        │
   Key'i ayıkla + sk_live_ prefix kontrol
        │
   Redis lookup (apikey:<hash>)
        │
  ├── Cache hit  → doğrula + rate limit kontrolü
  └── Cache miss → MongoDB lookup → sonucu cache'e yaz
        │
   { valid, projectId, rateLimitRemaining } döndür
```

**Fail closed:** MongoDB/Redis'e ulaşılamazsa isteği reddet. Asla fail open yapma.

### verify-service/
Service-to-service doğrulama. `verification/` ile özdeş yapı, farklı kimlik tipi.

Doğrulama akışı:
```
POST /v1/verify/service (Bearer svc_live_xxxxx)
        │
   Key'i ayıkla + svc_live_ prefix kontrol
        │
   Redis lookup (svckey:<hash>)
        │
  ├── Cache hit  → doğrula + revoke/rate limit kontrolü
  └── Cache miss → MongoDB lookup → sonucu cache'e yaz
        │
   { valid, projectId, service: { id, name }, rateLimitRemaining } döndür
```

**Redis namespace'leri:** `apikey:` vs `svckey:` — karışmaz.

### usage/
Her doğrulama olayını asenkron (non-blocking) olarak kaydeder.

**Usage tipi:**

```ts
// usage.types.ts
export type VerificationResult = "success" | "invalid_key" | "revoked" | "rate_limited";

export interface UsageLogDto {
  projectId: string;
  apiKeyId?: string;   // ApiKey verify'da dolu
  serviceId?: string;  // Service verify'da dolu — ikisi aynı anda dolu OLMAZ
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

## Stats Modülü

`src/stats/` — `GET /v1/projects/:projectId/stats?range=7d`

Kullanım verisi üzerinde MongoDB aggregate sorgular çalıştırır. **Verification path'inden tamamen ayrı durur** — dashboard real-time değildir; ağır sorgular güvenle çalıştırılabilir.

Desteklenen `range` değerleri: `1d`, `7d` (varsayılan), `30d`.

`UsageRepository.getStats(projectId, since)` üç paralel aggregate çalıştırır:
1. Toplam istek sayısı, başarı sayısı, rate limit vuruşları, ortalama gecikme
2. Günlük dağılım (hata vs. başarı)
3. Top 5 en çok kullanan ApiKey

Dönüş tipi (`src/stats/stats.types.ts`):

```ts
export interface ProjectStatsResponse {
  totalRequests: number;
  successRate: number;           // 0-1 arası oran
  topKeys: Array<{ keyId: string; requests: number }>;
  requestsByDay: Array<{ date: string; count: number; errors: number }>;
  rateLimitHits: number;
  avgLatencyMs: number;
}
```

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

### Servisler
```
GET    /v1/projects/:projectId/services
POST   /v1/projects/:projectId/services
DELETE /v1/projects/:projectId/services/:serviceId
```

### İstatistikler
```
GET    /v1/projects/:projectId/stats?range=7d
```

### Doğrulama (public, JWT gerekmez)
```
POST   /v1/verify           # sk_live_ API key doğrulama
POST   /v1/verify/service   # svc_live_ service key doğrulama
```

---

## Doğrulama Yanıt Formatları

### `POST /v1/verify` (sk_live_)

**200 — geçerli**
```json
{ "valid": true, "projectId": "...", "rateLimitRemaining": 98 }
```

**401** `{ "valid": false, "error": "invalid_key" }`

**403** `{ "valid": false, "error": "key_revoked" }`

**429** `{ "valid": false, "error": "rate_limit_exceeded", "retryAfter": 42 }`

### `POST /v1/verify/service` (svc_live_)

**200 — geçerli**
```json
{ "valid": true, "projectId": "...", "service": { "id": "...", "name": "billing-service" }, "rateLimitRemaining": 98 }
```

**401** `{ "valid": false, "error": "invalid_key" }`

**403** `{ "valid": false, "error": "service_revoked" }`

**429** `{ "valid": false, "error": "rate_limit_exceeded", "retryAfter": 42 }`

---

## Güvenlik Kuralları

Bunlar pazarlık konusu değildir. Asla ihlal edilmez:

1. **API key'ler SHA-256, şifreler bcrypt ile hash'lenir.** Bu ikisini asla karıştırma. API key brute-force'a doğası gereği dayanıklı — SHA-256 yeterli ve hızlı. Şifreler kısa ve tahmin edilebilir — bcrypt'in intentional yavaşlığı bir özellik.
2. **Key doğrulamada her zaman constant-time comparison kullan.** `crypto.timingSafeEqual()` kullan. Normal `===` timing attack'a açık.
3. **Fail closed.** Altyapı hatası nedeniyle doğrulama tamamlanamazsa `valid: false` döndür.
4. **Tenant izolasyonu.** Herhangi bir key işlemi öncesinde isteği yapan kullanıcının projeye sahip olduğunu doğrula.
5. **Tüm yönetim endpoint'lerinde JWT zorunlu.** Yalnızca `/v1/verify`, `/v1/verify/service` ve auth endpoint'leri public'tir.
6. **Logout token blacklist ile yapılır.** Access token Redis'e eklenir, refresh token MongoDB'den silinir.
7. **Rate limiting çok katmanlı uygulanır.** IP bazlı + key bazlı + endpoint bazlı. Sadece key bazlı yetmez.
8. **JWT algorithm açıkça belirtilir.** `jwt.sign()` çağrısında `algorithm: 'HS256'`, `jwt.verify()` çağrısında `algorithms: ['HS256']` zorunludur. Algorithm confusion saldırısını (`alg: none`) önler.
9. **Refresh token rotation zorunludur.** Her `/refresh` çağrısında eski token revoke edilip yeni token verilir. Aynı refresh token ikinci kez kullanılamaz. Revoke edilmiş token gelirse tüm kullanıcı oturumları kapatılır (token theft signal).
10. **Input boyutu sınırlandırılır.** `express.json({ limit: '16kb' })` zorunludur. DTO'lardaki tüm string field'lara `@MaxLength()` dekoratörü eklenir. Authorization header 200 karakterden uzunsa reddedilir.
11. **Hata mesajları bilgi sızdırmaz.** Register endpoint'i "email zaten kayıtlı" gibi kullanıcı varlığını teyit eden mesaj döndürmez — saldırgan bunu user enumeration için kullanamaz.
12. **Her yönetim endpoint'i `authGuard` kullanır.** Yalnızca `/v1/verify`, `/v1/verify/service` ve `/v1/auth/*` endpoint'leri guard dışındadır.
13. **`sk_live_` ve `svc_live_` key'ler birbirinin endpoint'inde çalışmaz.** `verification.service.ts` yalnızca `sk_live_` prefix'ini kabul eder; `verify-service.service.ts` yalnızca `svc_live_` prefix'ini kabul eder. Cross-contamination yoktur.
14. **Service revoke, API key revoke'tan farklıdır.** API key'de `revoked: boolean`, Service'de `revokedAt?: Date`. Redis cache key'leri de farklı: `apikey:<hash>` vs `svckey:<hash>`.

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
// Zorunlu env değişkenleri eksikse uygulama başlamaz (ortamdan bağımsız)
function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

export const env = {
  port: Number(process.env.PORT) || 3000,
  mongoUri: requireEnv('MONGO_URI'),
  redisUrl: requireEnv('REDIS_URL'),
  jwt: {
    secret: requireEnv('JWT_SECRET'),
    accessExpiresIn: requireEnv('JWT_ACCESS_EXPIRES_IN') as SignOptions['expiresIn'],
    refreshExpiresIn: requireEnv('JWT_REFRESH_EXPIRES_IN') as SignOptions['expiresIn'],
  },
  rateLimit: {
    ip: {
      max: Number(requireEnv('RATE_LIMIT_IP_MAX')),
      windowSeconds: Number(requireEnv('RATE_LIMIT_IP_WINDOW_SECONDS')),
    },
    key: {
      max: Number(requireEnv('RATE_LIMIT_KEY_MAX')),
      windowSeconds: Number(requireEnv('RATE_LIMIT_KEY_WINDOW_SECONDS')),
    },
  },
  bcryptRounds: Number(requireEnv('BCRYPT_ROUNDS')),
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
npm run test:unit                    # unit testler (Docker gerekmez)
npm run test:unit -- --coverage      # unit testler + coverage raporu
npm run test:integration             # integration testler (Docker gerektirir, --runInBand)
```

**Test kuralları:**
- Unit testler Redis ve MongoDB'yi mock'lar
- Integration testler gerçek Docker servislerini kullanır; `--runInBand` ile serially koşar
- Her service metodunun karşılığında bir unit test bulunur
- Verification akışının uçtan uca integration coverage'ı olur
- Implementation detaylarını değil, davranışı test et
- `ts-jest` kullanılır — test dosyaları da `.ts` uzantılıdır

**Husky hook'ları:**
- `pre-commit` → `lint-staged`: staged `.ts` dosyalarına ESLint fix + Prettier (otomatik düzeltir)
- `pre-push` → unit testler + coverage: global eşik %80 statements/lines, %75 branches/functions

**Coverage scope** (`jest.config.js` → `collectCoverageFrom`):
Router, repository, DTO ve infra dosyaları threshold kapsamı dışındadır — bunlar integration testlerinde kapsamlanır. Threshold service, guard ve middleware gibi iş mantığı içeren dosyalara uygulanır.

### Unit Test Mock Pattern

Bu projede tüm service'ler repository'lerini **modül yüklenirken** oluşturur:

```ts
// projects.service.ts
const projectRepo = new ProjectRepository(); // ← modül load'da, new ProjectService()'de değil
```

Bu nedenle Jest'te **`instances[0]` modül seviyesinde yakalanmalıdır** — `beforeEach` içinde değil.

```ts
// ✅ DOĞRU
jest.mock('../../src/projects/projects.repository');

// jest.mock() çağrısından hemen sonra, describe() bloğunun dışında yakala
const repo = (ProjectRepository as jest.MockedClass<typeof ProjectRepository>)
  .mock.instances[0] as jest.Mocked<ProjectRepository>;

describe('ProjectService', () => {
  beforeEach(() => {
    jest.clearAllMocks(); // clearAllMocks instances'ı temizler ama repo referansımız zaten sabit
    service = new ProjectService();
  });

  it('...', async () => {
    repo.findAllByUser.mockResolvedValue([mockProject] as never);
    // ...
  });
});
```

```ts
// ❌ YANLIŞ — instances her test sonrası clearAllMocks tarafından temizlenir
beforeEach(() => {
  jest.clearAllMocks();
  service = new ProjectService();
  const instances = (ProjectRepository as jest.MockedClass<typeof ProjectRepository>).mock.instances;
  repo = instances[instances.length - 1]; // undefined! clearAllMocks instances'ı temizledi
});
```

**Neden:** `jest.clearAllMocks()` hem mock çağrı geçmişini hem de `.mock.instances` dizisini sıfırlar. Ama `new ProjectService()` yeni bir repository oluşturmaz — repo `const projectRepo = new ProjectRepository()` ile modül yüklenirken zaten bir kez oluşturulmuştur. Dolayısıyla `instances[0]` herzaman doğru referanstır ve modül seviyesinde bir kez yakalanmalıdır.

**jest.mock factory'sinde dışarıdaki değişkene referans verme:**

```ts
// ❌ YANLIŞ — jest.mock() Babel/ts-jest tarafından dosyanın en üstüne hoist edilir
// Bu yüzden const mockFn henüz initialize olmamış olur → ReferenceError
const mockFn = jest.fn();
jest.mock('../../src/foo/foo.repository', () => ({
  FooRepository: jest.fn().mockImplementation(() => ({
    findById: mockFn, // ReferenceError: Cannot access 'mockFn' before initialization
  })),
}));

// ✅ DOĞRU — factory'siz auto-mock kullan, instances[0]'dan al
jest.mock('../../src/foo/foo.repository');
const repo = (FooRepository as jest.MockedClass<typeof FooRepository>)
  .mock.instances[0] as jest.Mocked<FooRepository>;
```

**Redis gibi named export olmayan modüller** için factory kullanmak gerekir, bu kabul edilebilir:

```ts
jest.mock('../../src/config/redis', () => ({
  __esModule: true,
  default: { get: jest.fn(), setex: jest.fn(), del: jest.fn() },
}));
```

**Mock dönüş değerlerinde TypeScript tip uyuşmazlığı** için `as never` kullan:

```ts
repo.findById.mockResolvedValue(mockUser as never); // ✅
```

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
- Yeni bir POST endpoint'i eklenince mutlaka `validateDto(DtoClass)` middleware'i de eklenir. Validation router'da middleware olarak yapılır, service içinde manuel if-check olarak değil.
- Service katmanında yalnızca iş mantığı kontrolleri bulunur (email zaten kayıtlı mı, proje kullanıcıya ait mi vb.). Format ve tip validasyonu `validateDto`'nun işidir.
- Swagger spec'i (`src/config/swagger.ts`) yeni endpoint eklendiğinde güncellenir. JSDoc annotation kullanılmaz.
- JWT `sign()` çağrısında `algorithm: 'HS256'`, `verify()` çağrısında `algorithms: ['HS256']` her zaman yazılır. Varsayılana güvenme.
- Refresh token response body'ye asla yazılmaz — sadece HTTP-only cookie olarak gönderilir.
- Register/login gibi sensitif endpoint'lerde hata mesajı kullanıcı varlığını teyit etmemelidir (enumeration koruması).
- `apikeys/` ve `services/` modülleri birbirinden tamamen bağımsızdır. `sk_live_` key `/v1/verify/service`'te geçersizdir; `svc_live_` key `/v1/verify`'da geçersizdir.
- `UsageLogDto`'da `apiKeyId` ve `serviceId` aynı anda dolu olamaz — biri doluysa diğeri `undefined`.
- `GET /v1/health` MongoDB ve Redis'i aktif olarak probe eder (`mongoose.connection.readyState` + `redis.ping()`). Biri erişilemezse 503 + `{ status: "degraded" }` döner.
- `src/index.ts` SIGTERM ve SIGINT sinyallerini yakalar. Shutdown akışı: `server.close()` → `mongoose.disconnect()` → `redis.quit()`. 10 saniye içinde tamamlanmazsa `process.exit(1)`.
- `src/stats/` modülü verification path'inden bağımsızdır. `UsageRepository.getStats()` üç paralel aggregate çalıştırır — bu sorgular yavaş olabilir, doğrulama gecikmeyi etkilemez.
- Stats endpoint `range` query param alır: `1d`, `7d` (varsayılan), `30d`. Geçersiz değer sessizce `7d`'ye düşürülür — 400 fırlatılmaz.