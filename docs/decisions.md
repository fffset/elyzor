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