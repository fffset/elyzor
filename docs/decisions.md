# Mimari Kararlar

Bu dosya "neden böyle yaptık?" sorularını yanıtlar. Her karar gerekçesiyle birlikte kayıt altındadır.

---

## 001 — NestJS değil Express seçildi

**Karar:** Framework olarak Express kullanılacak.

**Gerekçe:**
NestJS daha fazla yapı ve convention getirir, büyük ekipler için iyidir. Ama Elyzor V1 için tek geliştirici var ve hız öncelikli. NestJS'in decorator tabanlı yapısı, modül sistemi ve DI container'ı bu aşamada gereksiz karmaşıklık yaratır. Express daha az magic, daha fazla kontrol demek.

TypeScript ile birlikte Express, NestJS'in sağladığı tip güvenliğini büyük ölçüde karşılıyor.

**Trade-off:** Proje büyüdüğünde ve ekip genişlediğinde NestJS'e geçiş düşünülebilir. O zaman katmanlı mimari zaten bu geçişi kolaylaştırır.

---

## 002 — Repository Pattern kullanıldı

**Karar:** Service katmanı MongoDB'ye doğrudan erişmez, Repository üzerinden erişir.

**Gerekçe:**
Service'in Mongoose'u bilmemesi iki şeyi sağlar: test edilebilirlik (repository mock'lanabilir) ve değiştirilebilirlik (ileride farklı bir DB'ye geçiş yapılabilir). Özellikle unit testlerde gerçek DB bağlantısına gerek kalmaz.

**Trade-off:** Küçük projeler için fazla katman gibi görünebilir. Ama verification servisinin doğruluk ve test edilebilirliği kritik olduğu için bu overhead kabul edilebilir.

---

## 003 — JavaScript değil TypeScript seçildi

**Karar:** Tüm kod TypeScript ile yazılacak, strict mode açık.

**Gerekçe:**
Elyzor güvenlik-kritik bir servis. `apiKeyId` yerine yanlışlıkla `projectId` geçmek, `string` yerine `undefined` dönmek gibi hatalar production'da ancak fark edilir. TypeScript bunları derleme anında yakalar.

Repository pattern ve custom error sınıfları zaten TypeScript'e göre kurgulandı — interface'ler, generic tipler, tip güvenli dönüşler JS'de sadece yorum satırı olarak kalırdı.

**Trade-off:** İlk kurulum biraz daha uzun sürer. `ts-node`, `@types/*` paketleri, `tsconfig.json` yönetimi ekstra iş. Uzun vadede kazandırdığı güven buna değer.

---

## 004 — Open-core model benimsendi

**Karar:** Core engine MIT lisansıyla açık kaynak, dashboard ve analytics özellikleri kapalı kaynak / sadece hosted versiyonda.

**Gerekçe:**
Auth altyapısı için güven kritik. Kullanıcılar kodu görmeden bir servise API key yönetimini devretmek istemeyebilir. Açık kaynak bu güven engelini kaldırır.

Self-host seçeneği "veri Türkiye'de kalmalı" veya "KVKK uyumu" gibi gereksinimleri olan kullanıcıları karşılar.

Unkey, Plausible, Cal.com aynı modeli kullanıyor ve işe yarıyor.

**Trade-off:** Fork riski var. Ama Türkiye pazarında bu şu an gerçekçi bir tehdit değil. Asıl değer teknik kodda değil, hosted serviste (operasyonel yük, destek, güvenilirlik).

---

## 005 — Fail closed güvenlik kararı

**Karar:** Altyapı hatası durumunda verification `valid: false` döner, asla `valid: true` döndürülmez.

**Gerekçe:**
Güvenlik sistemlerinde iki hata türü var: false positive (geçersiz erişime izin vermek) ve false negative (geçerli erişimi reddetmek). Auth altyapısı için false positive çok daha tehlikelidir. MongoDB'ye ulaşılamıyorsa "bilmiyoruz" değil "hayır" deriz.

Bu kısa süreli bir outage'da bazı geçerli isteklerin reddedileceği anlamına gelir. Bu kabul edilebilir bir trade-off.

---

## 006 — Usage verisi dashboard için şimdiden doğru yapıda toplanıyor

**Karar:** Usage şeması V1'den itibaren `latencyMs`, `country`, `result` gibi dashboard'da kullanılacak alanları içerecek.

**Gerekçe:**
Dashboard V2'de geliyor ama şema değiştirmek geçmiş logları etkilemez — yeni alanlar eski kayıtlarda olmaz. Dolayısıyla hangi veriyi toplayacağımıza şimdiden karar vermek gerekiyor.

`createdAt` üzerindeki compound index'ler de şimdiden oluşturulacak. Sonradan eklemek mevcut collection üzerinde çalışır ama production'da büyük collection'larda index oluşturmak yavaş ve risklidir.

---

## 007 — Monolith olarak başlandı, microservice yok

**Karar:** V1'de tüm modüller tek bir serviste çalışır. Microservice ayrımı yapılmaz.

**Gerekçe:**
Microservice ayrımı operasyonel karmaşıklık getirir: servisler arası iletişim, distributed tracing, deploy koordinasyonu. Bu karmaşıklığı justify edecek ölçek henüz yok.

Katmanlı mimari ve modüler yapı sayesinde ileride bir modülü (örn. verification) ayrı bir servise çıkarmak mümkün olacak. Ama bunu şimdiden yapmak premature optimization.

**Eşik:** Verification servisi diğer modüllerden farklı ölçekleme ihtiyacı gösterdiğinde veya ekip büyüdüğünde ayrım değerlendirilebilir.

---

## 008 — process.env doğrudan kullanılmaz

**Karar:** Tüm environment değişkenleri `src/config/env.ts` üzerinden okunur.

**Gerekçe:**
`process.env.JWT_SECRET` kod içinde her yerde kullanılırsa iki sorun çıkar: tip güvenliği olmaz (hepsi `string | undefined`) ve hangi env değişkeninin nerede kullanıldığı dağınık kalır. Merkezi `env.ts` hem tip güvenliği sağlar hem de tüm konfigürasyonu tek yerden yönetmeyi mümkün kılar.

Eksik bir env değişkeni uygulama başlarken hata verir, çalışırken değil.

---

## 009 — Refresh token hem Redis hem MongoDB'de saklanır

**Karar:** Refresh token'lar MongoDB'de kalıcı olarak, Redis'te cache olarak tutulur.

**Gerekçe:**
Sadece Redis'te saklamak hızlı ama riskli — Redis uçtuğunda tüm kullanıcılar logout olur. Redis bu projede source of truth değil, performans katmanı. Sadece MongoDB'de saklamak güvenilir ama her refresh isteğinde DB'ye gitmek gereksiz yavaş.

İkisini birlikte kullanmak verification servisindeki Redis → MongoDB fallback mantığının aynısı: Redis cache, MongoDB source of truth.

**Uygulama:**
- Refresh token geldiğinde önce Redis'e bakılır
- Redis'te yoksa MongoDB'ye bakılır, bulunursa Redis'e yazılır
- MongoDB'deki kayıt TTL index ile otomatik temizlenir
- Logout veya token revocation'da hem Redis hem MongoDB güncellenir

**Trade-off:** İki katmanlı yönetim biraz daha karmaşık. Ama tutarsız state riskini ortadan kaldırır.

---

## 010 — Access token kısa, refresh token uzun ömürlü

**Karar:** Access token 15 dakika, refresh token 7 gün geçerli.

**Gerekçe:**
Uzun ömürlü access token çalınırsa uzun süre kullanılabilir. Kısa ömürlü access token bu pencereyi daraltır. Refresh token ile yeni access token alınır, kullanıcı her 15 dakikada tekrar login olmak zorunda kalmaz.

Refresh token HTTP-only cookie'de taşınır — JavaScript erişemez, XSS saldırılarına karşı korumalıdır.

**Trade-off:** Her 15 dakikada bir token yenileme isteği olur. Bu düşük frekanslı bir işlem, performans etkisi ihmal edilebilir.

---

## 011 — Logout token blacklist ile yapılır

**Karar:** Logout olunca access token Redis blacklist'e eklenir, süresi dolana kadar orada kalır.

**Gerekçe:**
JWT stateless olduğu için token imzası geçerli olduğu sürece sunucu tarafında iptal edilemez. Blacklist bu sorunu çözer. Redis'te tutmak mantıklı çünkü token süresi dolunca zaten geçersiz — kalıcı depolamaya gerek yok.

"Tüm cihazlardan çık" özelliği için kullanıcının tüm refresh token'ları MongoDB'den silinir, Redis cache'i temizlenir.

**Trade-off:** Her verification isteğinde Redis'te blacklist kontrolü yapılır. Bu ek bir Redis lookup — ama zaten verification zincirinde Redis kullanılıyor, ekstra maliyet minimal.

---

## 012 — Rate limiting çok katmanlı uygulanır

**Karar:** Rate limiting sadece API key bazında değil, IP bazında ve endpoint bazında da uygulanır.

**Gerekçe:**
Tek boyutlu rate limiting (key başına X istek) brute-force ve credential stuffing saldırılarına karşı yetersiz. Saldırgan key'i bilmese bile `/v1/auth/login`'e yüksek frekansta istek atabilir.

**Üç katman:**
- **IP bazlı** — key olmadan gelen isteklere karşı, `/v1/auth/login` ve `/v1/auth/register` için kritik
- **Key bazlı** — verification endpoint'i için, her projenin kendi limiti var
- **Endpoint bazlı** — `/v1/verify` daha yüksek limit alabilir, yönetim endpoint'leri daha düşük

**Trade-off:** Üç ayrı Redis counter yönetimi. Ama Redis bu iş için tasarlandı, operasyonel yük minimal.

---

## 013 — API key hash algoritması SHA-256, şifre hash algoritması bcrypt

**Karar:** API key'ler SHA-256 ile, kullanıcı şifreleri bcrypt ile hash'lenir.

**Gerekçe:**
API key'ler uzun, rastgele string'lerdir — brute-force'a karşı doğası gereği dayanıklılar. SHA-256 yeterli ve hızlı. Verification path'inde <5ms hedefi var, bcrypt'in intentional yavaşlığı burada istenmiyor.

Kullanıcı şifreleri ise genellikle kısa ve tahmin edilebilir. bcrypt'in yavaşlığı (cost factor) burada bir özellik — brute-force saldırılarını yavaşlatır.

**Kural:** Bu ayrımı asla karıştırma. API key'e bcrypt, şifreye SHA-256 kullanmak her iki tarafta da yanlış sonuç verir.

---

## 014 — Node.js Cluster ile CPU başına worker

**Karar:** Production'da `src/cluster.ts` entrypoint'i kullanılır. Node.js `cluster` modülü ile CPU çekirdeği sayısı kadar worker process fork'lanır.

**Gerekçe:**
Node.js single-threaded çalışır. 8 çekirdekli bir sunucuda tek process çalıştırmak 7 çekirdeği boşa harcamak demektir. Cluster ile her çekirdek bağımsız bir worker'da Express sunucusu çalıştırır — CPU-bound işler paralel yürütülür, bir worker çöktüğünde diğerleri etkilenmez.

`src/index.ts` (development), `src/cluster.ts` (production) ayrımı korunur. Development'ta hot reload ile çalışmak için cluster karmaşıklığı gerekmez.

**RAM dağılımı:**
Primary process `os.totalmem() / os.cpus().length` ile her worker'a düşen RAM payını hesaplar. Worker'lar 10 saniyede bir RSS kullanımlarını primary'e raporlar. Payın %80'ini aşan worker loglanır.

**Trade-off:** Her worker ayrı MongoDB ve Redis bağlantısı açar. 8 worker ile connection pool 8 kat büyür. MongoDB ve Redis'in `maxPoolSize` ayarları buna göre yapılandırılmalıdır.

---

## 015 — Constant-time comparison verification'da zorunlu

**Karar:** API key hash karşılaştırması `crypto.timingSafeEqual()` ile yapılır, normal `===` kullanılmaz.

**Gerekçe:**
Normal string karşılaştırması eşleşen karakter sayısıyla orantılı süre harcar. Saldırgan yeterli sayıda istek göndererek yanıt sürelerindeki farka bakarak geçerli hash prefix'ini kademeli olarak bulabilir (timing attack). `timingSafeEqual` sabit sürede çalışır — karşılaştırma sonucu ne olursa olsun süre değişmez.

**Uygulama:** `src/verification/verification.service.ts` içindeki `timingSafeCompare()` metodu. Buffer uzunlukları da sabit-zamanlı kontrol edilir — uzunluk farkı da bilgi sızdırabilir.

---

## 016 — Request validation class-validator ile HTTP sınırında yapılır

**Karar:** Router'lara gelen request body'leri `validateDto(DtoClass)` middleware'i ile doğrulanır. Her domain kendi DTO sınıfını `src/*/dtos/` altında tanımlar.

**Gerekçe:**
Validation'ı service katmanında yapmak iki sorun çıkarır: service'ler HTTP context'ini bilmemeli (bağımsızlık ilkesi) ve manuel if-check'ler hata yapmaya açık, dağınık kalır. `class-validator` dekoratörleri kuralları DTO tanımıyla birleştirir — bakımı ve okunması kolay.

`whitelist: true` ile tanımsız property'ler otomatik temizlenir. Bu ek bir güvenlik katmanıdır: istemci gönderdiği ekstra alanlar service'e hiç ulaşmaz.

Service katmanında yalnızca iş mantığı kontrolleri kalır (örn. email zaten kayıtlı mı, proje kullanıcıya ait mi).

**Trade-off:** `class-validator` yeni bir bağımlılık. Ama doğrulama ihtiyacı kaçınılmaz; manuel if-check yazmak yerine standart bir kütüphane kullanmak daha güvenilir.

---

## 017 — API dokümantasyonu merkezi OpenAPI spec ile yönetilir

**Karar:** Swagger UI `GET /docs` altında sunulur. Spec `src/config/swagger.ts` içinde tek bir dosyada tanımlıdır. JSDoc annotation kullanılmaz.

**Gerekçe:**
JSDoc annotation'lar router dosyalarına dağılır, büyük yorum blokları kod okunabilirliğini düşürür ve TypeScript tip sistemiyle senkron tutmak güçleşir. Merkezi spec dosyası tüm endpoint tanımlarını tek yerden yönetmeyi sağlar, diff'leri net tutar.

`swagger-jsdoc` spec'i derlemek için kullanılır; `swagger-ui-express` UI'ı sunmak için. Spec'in kod olarak tanımlanması onu versiyon kontrolüne dahil eder ve CI'da lint edilebilir hale getirir.

**Trade-off:** Router dosyasını değiştirince spec dosyasını da güncellemek gerekir — otomatik sync yok. Bu bilinçli bir tercih: spec'in kasıtlı olarak yazılması, gereksiz endpoint'lerin belgelenmesini önler.

---

## 018 — Unit testlerde mock instance'ı modül seviyesinde yakalanır

**Karar:** Service unit testlerinde repository mock instance'ı `jest.mock()` çağrısından hemen sonra, `describe()` bloğunun dışında `instances[0]` ile yakalanır. `beforeEach` içinde yakalanmaz.

**Gerekçe:**

Tüm service'ler repository'lerini modül yüklenirken oluşturur:

```ts
const projectRepo = new ProjectRepository(); // ← new ProjectService() değil, modül load'da
```

`jest.clearAllMocks()` hem çağrı geçmişini hem `.mock.instances` dizisini sıfırlar. Eğer instance `beforeEach` içinde `instances[instances.length - 1]` ile yakalanırsa, `clearAllMocks()` sonrası `instances` boş olduğundan `undefined` döner ve tüm testler patlar.

Çözüm: Instance modül yüklenince bir kez oluşur → `instances[0]` kalıcıdır → modül seviyesinde bir kez yakalanır:

```ts
jest.mock('../../src/projects/projects.repository');

const repo = (ProjectRepository as jest.MockedClass<typeof ProjectRepository>)
  .mock.instances[0] as jest.Mocked<ProjectRepository>;

describe('...', () => {
  beforeEach(() => {
    jest.clearAllMocks(); // artık sorun yok — repo referansımız sabit
  });
});
```

**İkincil kural — jest.mock factory hoisting:**

`jest.mock()` Babel/ts-jest tarafından dosyanın en üstüne hoist edilir. Factory içinde dışarıdaki `const mockFn = jest.fn()` değişkenine referans vermek `ReferenceError: Cannot access before initialization` hatasına yol açar. Çözüm: factory'siz auto-mock + `instances[0]`.

**İstisna:** `redis` gibi default export'lu modüller için factory kullanmak gerekir — bu kabul edilebilir çünkü bu modüller service içinde sınıf değil, nesne olarak kullanılır.

**Trade-off:** Bu pattern service'lerin modül-seviyesi singleton kullandığını varsayar. İleride service'ler constructor DI'a geçerse (örn. `new ProjectService(repo)`) bu pattern değişecektir — o zaman `beforeEach` içinde `new Service(mockRepo)` ile doğrudan geçmek daha temiz olur.

---

## 019 — JWT algorithm açıkça sabitleniyor

**Karar:** `jwt.sign()` çağrısında `algorithm: 'HS256'`, `jwt.verify()` çağrısında `algorithms: ['HS256']` her zaman yazılır.

**Gerekçe:**
`jsonwebtoken` kütüphanesi algorithm belirtilmezse varsayılan olarak HS256 kullanır — ama bu, kütüphane versiyonu değiştiğinde veya payload'daki `alg` header'ı manipüle edildiğinde beklenmedik davranışa yol açabilir. `alg: none` saldırısı: imzasız JWT'nin bazı kütüphane konfigürasyonlarında kabul edilmesi. Algoritmanın kod seviyesinde sabitlenmesi bu risk sınıfını tamamen ortadan kaldırır.

**Uygulama:**
- `src/auth/services/token.service.ts` → `{ expiresIn, algorithm: 'HS256' }`
- `src/middleware/authGuard.ts` → `jwt.verify(token, secret, { algorithms: ['HS256'] })`

**Trade-off:** Küçük bir kod satırı eklemek karşılığında algorithm confusion saldırı vektörü tamamen kapatılıyor. Maliyet sıfır.

---

## 020 — Refresh token rotation zorunlu

**Karar:** Her `/refresh` isteğinde eski refresh token revoke edilir, yeni bir token çifti verilir. Aynı refresh token ikinci kez kullanılamaz.

**Gerekçe:**
Önceki implementasyonda refresh token ömrü boyunca (7 gün) sonsuz kez access token almak için kullanılabiliyordu. Token çalınırsa saldırgan 7 gün boyunca erişimi sürdürebilirdi — kullanıcı logout olmadıkça fark edilmezdi.

Rotation ile:
1. Her kullanımda token değişir → çalınan eski token geçersiz olur
2. Revoke edilmiş token tekrar gelirse → **token theft sinyali** → tüm oturumlar kapatılır
3. Rotation her zaman DB'den yapılır — Redis cache, revoke durumunu gizleyebileceği için refresh path'inde `findRefreshTokenAny` kullanılır

**Uygulama:** `src/auth/auth.service.ts` → `refresh()` metodu. `src/auth/auth.repository.ts` → `findRefreshTokenAny()` eklendi.

**Trade-off:** Her refresh'te bir DB write (revoke) + bir DB read (create) ekleniyor. Frekans düşük (15 dakikada bir), etki ihmal edilebilir.

---

## 021 — Üretim ortamında zorunlu env değişkenleri startup'ta doğrulanır

**Karar:** `src/config/env.ts` içinde `requireInProduction()` fonksiyonu, `NODE_ENV=production` ortamında `JWT_SECRET`, `MONGO_URI`, `REDIS_URL`'in eksikliğinde uygulama başlamadan hata fırlatır.

**Gerekçe:**
Eksik env değişkeni ilk isteğe kadar fark edilmez ve production'da gizli bir güvenlik açığı bırakır (örn. `JWT_SECRET` olmadan varsayılan değerle çalışmak — herkes token forge edebilir). Hızlı-fail prensibi: sorun ne kadar erken yakalanırsa zarar o kadar azdır.

**Uygulama:** Dev ortamında güvenli fallback'ler (`dev_secret_change_in_production`, `localhost:27017`) kalır. Production ortamında bu fallback'ler hata fırlatır.

**Trade-off:** Yanlış `NODE_ENV` ile prod config'ini test etmek mümkün olmaz. Bu bir feature, bug değil.

---

## 022 — Input boyutu HTTP katmanında sınırlandırılır

**Karar:** `express.json({ limit: '16kb' })` ile JSON payload sınırı konulur. Tüm string DTO field'larına `@MaxLength()` eklenir. `Authorization` header'ında 200 karakterden uzun değerler reddedilir.

**Gerekçe:**
Sınırsız input boyutu birden fazla saldırı vektörü açar: büyük JSON payload'lar bellek tüketir, uzun string'ler MongoDB'ye yazılırsa storage şişer ve sorgular yavaşlar, dev-null Authorization header'ları (`Bearer <10MB metin>`) CPU/bellek DoS'a yol açabilir.

**Boyutlar neden bu değerler?**
- 16kb: En büyük meşru JSON payload (proje oluşturma + metadata) 1kb'nin altında. 16kb makul güvenlik marjı bırakır.
- 200 karakter: `sk_live_` + 16 hex + `.` + 64 hex = 89 karakter. 200 karakter 2x marj.
- email max 255: RFC 5321 limiti. password max 128: bcrypt cost'unu yönetilebilir tutar.

**Trade-off:** Gelecekte daha büyük payload gerektiren endpoint eklenirse limit ayarlanabilir, ama bu kasıtlı bir karar olmalıdır.

---

## 023 — Hata mesajları kullanıcı varlığını doğrulamaz

**Karar:** Register endpoint'i email çakışmasında "Bu email zaten kullanımda" değil, "Kayıt tamamlanamadı" döndürür. Login endpoint'i zaten vague mesaj kullanıyordu — bu tutarlılık sağlandı.

**Gerekçe:**
Email-bazlı user enumeration: saldırgan 1 milyon emaili register endpoint'ine göndererek hangileri kayıtlı bul. Veri sızıntısı olmaksızın kullanıcı listesi elde edilir. Bu liste daha sonra phishing, credential stuffing veya hedefli saldırılar için kullanılır.

**Trade-off:** Meşru kullanıcı "email neden çalışmıyor?" diye anlamayabilir. Çözüm: login ekranına "Hesabınız var mı? Giriş yapın" yönlendirmesi — bu UX'te yapılır, hata mesajında değil.