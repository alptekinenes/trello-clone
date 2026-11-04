# Trello Klonu

Trello benzeri bir proje yönetim uygulaması: pano → liste → kart hiyerarşisi, sürükle-bırak ile sıralama, kart ayrıntıları (açıklama, etiket, son tarih, kontrol listesi), rol tabanlı pano üyeliği, e-posta ile davet ve Socket.io ile gerçek zamanlı iş birliği. Arayüz Türkçedir; açık ve koyu tema desteklenir.

## Teknoloji

| Katman | Teknoloji |
|---|---|
| Frontend | React, Vite, TypeScript, React Router, TanStack Query, Zustand, dnd-kit, Tailwind CSS, React Hook Form + Zod |
| Backend | NestJS, TypeScript, Prisma (PostgreSQL), Socket.io |
| Auth | JWT access token (bellekte) + dönen refresh token (httpOnly çerez), parola hash'i için argon2id |
| Test | Vitest, React Testing Library, MSW, Supertest, Playwright (+ axe ile erişilebilirlik taraması) |
| Lint | oxlint |

Depo bir npm workspaces projesidir: `shared/contracts` (ortak tipler, hata kodları, socket olayları), `backend`, `frontend`.

## Kurulum

Gereksinimler: **Node 22 LTS** (`.nvmrc`), **npm 11 veya üstü** ve **PostgreSQL** (17 ile denendi).

> Node 22 ile gelen npm 10.9 bu projenin bağımlılıklarında çöker. npm 11 yoksa `npx -y npm@11 install` kullanın.

```bash
# 1. Bağımlılıklar (kökte). Ayrıca contracts paketini derler ve Prisma client'ı üretir.
npm install

# 2. Ortam dosyası
cp backend/.env.example backend/.env      # değerleri düzenleyin (aşağıdaki tabloya bakın)

# 3. PostgreSQL
docker compose up -d                       # trello (geliştirme) ve trello_test (e2e) veritabanlarını açar
# Docker kullanmıyorsanız: `trello` kullanıcısıyla `trello` ve `trello_test` veritabanlarını elle oluşturun.

# 4. Migration'ları geliştirme veritabanına uygulayın
npm run prisma:deploy -w backend
# e2e veritabanı için (backend klasöründe): DATABASE_URL=<TEST_DATABASE_URL> npx prisma migrate deploy

# 5. Geliştirme sunucuları (ayrı terminallerde)
npm run dev:backend                        # http://localhost:3000/api/v1
npm run dev:frontend                       # http://localhost:5173 (/api ve /socket.io 3000'e yönlenir)
```

Uygulamayı http://localhost:5173 adresinden açın. Kayıt olup ilk panonuzu oluşturabilirsiniz.

## Ortam değişkenleri

Hepsi `backend/.env` dosyasındadır; şablon `backend/.env.example`. Uygulama geçersiz ya da eksik zorunlu değerle **başlamaz**. Frontend'in ortam değişkeni yoktur.

| Değişken | Zorunlu | Varsayılan | Açıklama |
|---|---|---|---|
| `NODE_ENV` | Evet | yok | `development`, `test` veya `production`. Varsayılanı yoktur; çerezin `Secure` bayrağını ve davet bağlantısı günlüğünü belirler. |
| `PORT` | Hayır | `3000` | HTTP portu (1–65535). |
| `DATABASE_URL` | Evet | yok | Uygulamanın PostgreSQL bağlantı adresi. |
| `TEST_DATABASE_URL` | Hayır | yok | Yalnızca e2e veritabanı için başvuru değeri (yukarıdaki `migrate deploy` komutunda kullanılır). Backend e2e testleri `trello_test` adresini kendi yapılandırmasında sabitler. |
| `CORS_ORIGIN` | Production'da evet | `http://localhost:5173` | CORS ve Socket.io için izin verilen tek frontend origin'i. Production'da açıkça verilmeli; yol, `*` ya da liste olamaz (örn. `https://app.example.com`). |
| `JWT_ACCESS_SECRET` | Evet | yok | Access token imza anahtarı, en az 32 karakter. Production'da `.env.example` içindeki `change-me…` değeri reddedilir. Üretmek için: `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"` |
| `JWT_ACCESS_TTL_SECONDS` | Hayır | `900` | Access token ömrü, 60–86400 sn. |
| `REFRESH_TOKEN_TTL_DAYS` | Hayır | `7` | Refresh token ömrü, 1–90 gün. |
| `AUTH_RATE_LIMIT_PER_MINUTE` | Hayır | `10` | Giriş/kayıt isteği sınırı (IP başına dakikada, 1–10000). Production'da 10 bırakın. |
| `APP_URL` | Production'da evet | `http://localhost:5173` | Frontend'in herkese açık adresi; davet bağlantıları buradan üretilir. Sondaki `/` atılır. |
| `INVITATION_RATE_LIMIT_PER_MINUTE` | Hayır | `30` | Davet oluşturma/önizleme/kabul isteği sınırı (IP başına dakikada, her rota için ayrı, 1–10000). |
| `API_RATE_LIMIT_PER_MINUTE` | Hayır | `300` | Daha sıkı sınırı olmayan tüm rotalar için genel sınır (IP başına dakikada, 1–100000). |
| `TRUST_PROXY` | Hayır | `0` | `X-Forwarded-For` başlığına güvenilen ters vekil sayısı (0–10). Doğrudan erişimde 0; tek bir vekilin arkasında 1. |

Yerelde Playwright'ı tekrar tekrar çalıştırırken sınırlara takılmamak için `AUTH_RATE_LIMIT_PER_MINUTE`, `INVITATION_RATE_LIMIT_PER_MINUTE` ve `API_RATE_LIMIT_PER_MINUTE` değerlerini yükseltin (örn. `1000`). Dev backend `.env` değişikliğini izlemez; değişince yeniden başlatın.

## Komutlar

Kökten çalıştırılır; `-w backend`, `-w frontend` ile tek workspace seçilebilir.

```bash
npm run build                          # contracts + backend + frontend
npm test                               # tüm birim testleri
npm run lint                           # oxlint
npm run typecheck -w backend
npm run typecheck -w frontend

npm run prisma:migrate -w backend -- --name <açıklama>   # şema değişikliği = yeni migration
npm run prisma:generate -w backend
npm run prisma:deploy -w backend                         # bekleyen migration'ları uygula
```

## Testler

```bash
npm test                               # birim testleri: contracts, backend (Vitest), frontend (Vitest + RTL + MSW)
npm run test:e2e -w backend            # Supertest; trello_test veritabanını her testte sıfırlar
npm run test:e2e -w frontend           # Playwright; backend ve frontend'i kendisi açar
```

- Backend e2e için `trello_test` veritabanı oluşturulmuş ve migration'ları uygulanmış olmalıdır (Kurulum, adım 4).
- Playwright **geliştirme veritabanını** kullanır ve çok sayıda kayıt oluşturur. İlk kullanımdan önce `npx playwright install chromium` gerekebilir. Çalışan bir backend'i yeniden kullanıyorsa yukarıdaki hız sınırı değişkenleri yüksek olmalıdır; aksi halde 429 alınır. 3000 ya da 5173 portunda `--watch` ile çalışan bir sunucu varsa testlerden önce durdurun.
- `e2e/a11y.spec.ts` ekranları axe ile (açık/koyu tema ve 320 px) tarar.

## Production notları

- **Derleme ve çalıştırma:** `npm run build`, ardından migration'lar için `npm run prisma:deploy -w backend`, sunucu için `npm run start:prod -w backend`. Frontend derlemesi (`frontend/dist`) statik dosyadır; bilinmeyen yolları `index.html`'e düşüren (SPA yedeği) bir sunucudan verilir.
- **Aynı origin ters vekil:** Uygulamayı ve API'yi tek origin altında yayınlayın: statik frontend `/`, backend `/api` ve `/socket.io` için vekile yönlendirilir. Refresh çerezi `SameSite=Strict` ve yalnızca `/api/v1/auth` yoluna gönderilir; farklı origin'lerde çalışmaz. `CORS_ORIGIN` ve `APP_URL` bu tek origin olmalıdır.
- **`NODE_ENV=production`:** Refresh çerezini `Secure` yapar (HTTPS gerekir), davet bağlantılarını ve tam e-posta adreslerini günlüğe yazmaz. `CORS_ORIGIN`, `APP_URL` ve güçlü bir `JWT_ACCESS_SECRET` verilmeden uygulama başlamaz.
- **`TRUST_PROXY`:** Ters vekilin arkasında bunu vekil sayısına (genelde `1`) ayarlayın; aksi halde hız sınırı her istemciyi vekilin IP'si olarak görür ve herkes aynı kovayı paylaşır. Doğrudan erişimde `0` bırakın; çünkü `X-Forwarded-For` istemci tarafından sahtelenebilir. Değer gerçek vekil sayısıyla tam eşleşmelidir (fazlası sahte IP ile hız sınırını atlatmaya açar) ve `TRUST_PROXY` 0'dan büyükken uygulama portuna vekil atlanarak erişilememelidir (güvenlik duvarı ya da yalnızca `localhost` dinleme).
- **`/socket.io` için WebSocket başlıkları:** Vekil `Upgrade` ve `Connection` başlıklarını iletmeli ve HTTP/1.1 kullanmalıdır. Sunucu yalnızca WebSocket taşıması kabul eder (long-polling yok). Nginx örneği:

  ```nginx
  location /socket.io/ {
      proxy_pass http://127.0.0.1:3000;
      proxy_http_version 1.1;
      proxy_set_header Upgrade $http_upgrade;
      proxy_set_header Connection "upgrade";
      proxy_set_header Host $host;
      proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
      proxy_read_timeout 1h;
  }
  ```

- **SPA için CSP:** Frontend'i sunan katman Content-Security-Policy başlığını kendisi ekler (backend'in Helmet başlıkları yalnızca API yanıtlarını kapsar). Gerçek zamanlı bağlantı için `connect-src` içinde WebSocket'e izin verin: `connect-src 'self' wss:`.
- **Sağlık kontrolü:** `GET /api/v1/health`.
- **Sırlar:** `.env` dosyası depoya girmez; production'da sırları ortam değişkeni olarak verin.

## Dokümanlar

- [`docs/PLAN.md`](docs/PLAN.md): genel plan, veri modeli, API ve ilerleme tablosu
- [`docs/phase-5-card-detail.md`](docs/phase-5-card-detail.md): kart ayrıntıları
- [`docs/phase-6-invitations.md`](docs/phase-6-invitations.md): davetler
- [`docs/phase-7-realtime.md`](docs/phase-7-realtime.md): gerçek zamanlı iş birliği ve socket sözleşmesi
- [`docs/phase-8-polish.md`](docs/phase-8-polish.md): cilalama, güvenlik kontrol listesi
- [`CLAUDE.md`](CLAUDE.md): kod kuralları ve proje rehberi
