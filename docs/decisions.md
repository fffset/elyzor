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