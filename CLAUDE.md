# Trello Clone — Proje Rehberi

Trello benzeri bir proje yönetim uygulaması: board → list → card hiyerarşisi, sürükle-bırak, gerçek zamanlı iş birliği.

## Dil

- Kullanıcıyla **her zaman Türkçe** konuş (açıklamalar, özetler, sorular, planlar).
- Kod, değişken/fonksiyon/dosya adları, kod yorumları ve **commit mesajları İngilizce**.
- Arayüz metinleri **Türkçe** (i18n altyapısı yok; tarih/sayı formatları `tr-TR`).

## Tasarım Yönü

Trello'nun bilinen düzenine yakın, **modern ve minimal** bir tasarım dili:

- **Düzen Trello gibi:** üstte board başlığı, altında yatay kayan liste sütunları, sütun içinde dikey kartlar, sütunun sonunda "Kart ekle".
- **Minimal görünüm:** sade yüzeyler, az kenarlık, hafif gölgeler, bol boşluk; süs ve gradyan yok.
- **Renk:** nötr gri tonlar + tek bir vurgu rengi; renk sadece anlam taşıyan yerlerde (etiketler, son tarih durumu, birincil butonlar).
- **Kartlar:** düz yüzey, yuvarlatılmış köşeler, üzerine gelince hafif yükselme; sürüklenirken belirgin gölge ve hafif eğim.
- **Tipografi:** sistem font yığını, sınırlı boyut ölçeği, net hiyerarşi.
- **Tema:** açık ve koyu tema (token'lar üzerinden).
- **Hareket:** kısa ve yumuşak geçişler; `prefers-reduced-motion` desteklenir.

## Teknoloji Seti

| Katman | Teknoloji |
|---|---|
| Runtime | Node 22 LTS |
| Frontend | React + Vite, TypeScript strict |
| Routing | React Router |
| Sunucu verisi | TanStack Query (cache, invalidation, optimistic update) |
| UI state | Zustand |
| Sürükle-bırak | dnd-kit (`@dnd-kit/core`, `@dnd-kit/sortable`) |
| Stil | Tailwind CSS; tema CSS custom properties ile (sabit renk yok) |
| Formlar | React Hook Form + Zod |
| Backend | NestJS, TypeScript strict |
| Veritabanı | PostgreSQL + Prisma ORM |
| Gerçek zamanlı | Socket.io (`@nestjs/websockets` + `socket.io-client`) |
| Auth | JWT (access + refresh token), parola hash için **sadece argon2** |
| Test | Frontend: Vitest + React Testing Library + MSW + Playwright · Backend: Vitest unit + Supertest e2e |
| Lint | oxlint (her iki tarafta) |

### Sürümler (Faz 0 kurulumu, 2026-10-27)
- Node **22 LTS** (`.nvmrc`, kök `package.json` `engines`), npm **11+**.
- React 19.3 · Vite 8.3 · React Router 8.5 · TanStack Query 5.105 · Zustand 5.0 · dnd-kit core 6.3 / sortable 10.0 · React Hook Form 7.91 · Zod 4.6 · Tailwind CSS 4.3 · Vitest 4.1 · Playwright 1.64 · MSW 2.15
- NestJS 12.3 · Prisma 7.10 (`@prisma/adapter-pg`) · TypeScript 6.0 (backend, contracts) / 7.0 (frontend)

### Ortam notları
- **npm 11 gerekli.** Node 22 ile gelen npm 10.9, bu projenin bağımlılıklarında `Cannot read properties of null (reading 'edgesOut')` hatasıyla çöküyor. npm 11 yoksa `npx -y npm@11 install` kullan.
- npm 11, Prisma'nın install script'lerini onaysız çalıştırmaz; gerekmiyor (`prisma generate` ve `migrate diff` script'ler olmadan çalışıyor).
- Bu makinede `C:\Program Files\nodejs` altında ayrıca Node 26 kurulu ve PATH'te nvm'den önce geliyor. Node 22'yi kullanmak için PATH sırasını düzelt ya da komutlardan önce nvm'in Node 22 klasörünü PATH'in başına ekle.

## Klasör Yapısı

```
trello-clone/
├── CLAUDE.md
├── package.json               # npm workspaces: shared/contracts, backend, frontend
├── docker-compose.yml         # Yerel PostgreSQL (dev: trello, test: trello_test)
├── .claude/agents/            # Subagent tanımları
├── docs/                      # Plan ve tasarım dokümanları (docs/PLAN.md)
├── shared/contracts/          # @trello/contracts: ortak tipler, enum'lar, hata kodları, position.ts
├── frontend/                  # React + Vite uygulaması
│   ├── e2e/                   # Playwright testleri
│   └── src/
│       ├── app/               # App kökü: router, provider'lar (QueryClient, tema), layout
│       ├── features/          # Özellik bazlı klasörler
│       │   └── <feature>/     # auth, boards, board-detail, cards, members...
│       │       ├── api/       # API çağrıları + TanStack Query hook'ları (queries/mutations)
│       │       ├── components/
│       │       ├── hooks/     # İş mantığı custom hook'ları
│       │       ├── schemas/   # Zod şemaları
│       │       ├── store/     # Feature'a özel Zustand store (gerekirse)
│       │       ├── types.ts
│       │       └── index.ts   # Feature'ın dışa açık API'si
│       ├── shared/            # Ortak UI bileşenleri, hook'lar, yardımcılar
│       │   ├── ui/
│       │   ├── hooks/
│       │   └── lib/           # http client, socket client, query client, utils
│       ├── styles/tokens.css  # Tema token'ları (tek ham renk kaynağı, açık + koyu)
│       ├── index.css          # Tailwind girişi + @theme eşlemesi
│       └── test/              # Vitest setup, MSW server, renderWithProviders
└── backend/                   # NestJS uygulaması
    ├── prisma.config.ts       # Prisma 7 yapılandırması (DATABASE_URL buradan)
    ├── prisma/
    │   ├── schema.prisma
    │   └── migrations/
    ├── src/
    │   ├── app.setup.ts       # main.ts ve e2e testlerin paylaştığı HTTP kurulumu
    │   ├── config/            # Env doğrulama
    │   ├── common/            # Guard, filter, interceptor, decorator, pipe
    │   ├── generated/prisma/  # Üretilen Prisma client (git'te yok; `npm install` üretir)
    │   ├── prisma/            # PrismaService / PrismaModule
    │   ├── auth/
    │   ├── users/
    │   ├── boards/
    │   ├── lists/
    │   ├── cards/
    │   └── realtime/          # Socket.io gateway
    └── test/                  # e2e testleri
```

## Kod Kuralları

### Genel
- TypeScript `strict: true`; `any` kullanma — gerekirse `unknown` + type guard.
- Dosya adları kebab-case (`board-list.tsx`, `use-move-card.ts`); component'ler PascalCase, değişken/fonksiyon camelCase, hook'lar `use` önekiyle.
- Küçük, tek sorumluluklu fonksiyonlar. Ölü kod ve yorum satırına alınmış kod bırakma.
- Sırlar (`DATABASE_URL`, `JWT_SECRET`) yalnızca `.env` içinde; `.env` commit edilmez, `.env.example` güncel tutulur. Frontend'de sadece `VITE_` önekli, gizli olmayan değişkenler.
- Frontend ve backend arasındaki paylaşılan sözleşmeler (DTO şekilleri, socket event adları) tek yerde tanımlanır ve iki tarafta aynı adlarla kullanılır.

### Frontend (React)
- **Sadece function component + hooks**; class component yok.
- **İş mantığı custom hook'larda**: component'ler sunum odaklı kalır; veri çekme, mutation, türetilmiş state ve olay mantığı `features/<feature>/hooks/` veya `api/` altındaki hook'lara taşınır.
- **Feature bazlı klasör yapısı**: bir feature başka bir feature'ın iç dosyalarını import etmez, sadece `index.ts` üzerinden kullanır. Ortak kod `shared/`'a.
- **State ayrımı**:
  - Sunucu verisi → **TanStack Query** (Zustand'a kopyalanmaz). Query key'ler feature başına bir `queryKeys` fabrikasında.
  - Global/paylaşılan UI state (açık modal, tema, seçili kart) → **Zustand**; selector ile abone ol.
  - Yerel UI state → `useState` / `useReducer`.
- **Optimistic update**: `useMutation` içinde `onMutate` (cache'i güncelle + önceki değeri sakla) → `onError` (geri al) → `onSettled` (invalidate). Sürükle-bırak taşımaları bu desenle yapılır.
- **Sürükle-bırak (dnd-kit)**: `DndContext` + `SortableContext`; listeler arası taşıma `onDragOver`/`onDragEnd` ile. Pointer + keyboard sensor zorunlu; `DragOverlay` ile önizleme. Yeni position değeri komşu öğelerden hesaplanır.
- **Formlar**: React Hook Form + `zodResolver`; Zod şemaları tek doğruluk kaynağı, tipler `z.infer` ile türetilir.
- **Routing**: React Router; sayfa seviyesinde lazy loading (`lazy`), korumalı route'lar için auth guard bileşeni/loader.
- **Stil**: Tailwind v4 utility'leri. Ham renkler sadece `src/styles/tokens.css` içinde (`--ui-*`); `index.css`'teki `@theme inline` bunları semantik sınıflara bağlar (`bg-surface`, `bg-surface-sunken`, `text-fg-muted`, `border-line`, `bg-primary`, `shadow-card`, `bg-label-green`, `bg-board-blue` ...). Tailwind'in varsayılan paleti kapalı (`bg-blue-500` çalışmaz). Sabit hex/rgb veya keyfi değer (`bg-[#123456]`) yazma; yeni renk gerekiyorsa token ekle.
- **API çağrıları**: `shared/lib/http.ts` içindeki `apiRequest` ile. Access token'ı kendisi ekler, 401'de oturumu bir kez yeniler ve isteği tekrarlar. Access token sadece bellekte (`features/auth` store'u); localStorage'a yazılmaz.
- **Testler**: `src/test/render.tsx` içindeki `renderWithProviders` (tek component) veya `renderApp(path)` (gerçek route'larla tüm uygulama) ile render et; giriş yapmış kullanıcı için `useAuthStore.getState().setSession(...)`; ağ istekleri MSW ile (`server.use(...)`), handler'sız istek testi düşürür. Sorgularda `getByRole`/`getByLabelText` öncelikli.
- **Performans**: gereksiz `useEffect` yazma (türetilebilen değeri render'da hesapla); liste öğelerinde stabil `key`; ölçülmüş bir sorun yoksa erken `memo`/`useMemo` kullanma.
- **Güvenlik**: `dangerouslySetInnerHTML` kullanma (zorunluysa sanitize et).
- **Erişilebilirlik**: semantik HTML, klavye ile kullanılabilirlik, görünür odak, ARIA etiketleri, modal'larda odak tuzağı, sürükle-bırak için klavye alternatifi ve ekran okuyucu duyuruları.

### Backend (NestJS)
- Özellik başına modül (`*.module.ts`, `*.controller.ts`, `*.service.ts`, `dto/`).
- Tüm input'lar `class-validator` DTO'ları ile doğrulanır; global `ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true })`.
- İş mantığı service'te, controller ince kalır. Veritabanı erişimi sadece `PrismaService` üzerinden.
- Parolalar **yalnızca argon2** (`argon2id`) ile hash'lenir; bcrypt vb. kullanılmaz.
- Her endpoint'te yetkilendirme: kullanıcının ilgili board'a erişimi var mı kontrol edilir.
- Sıralama (position) için kesirli/aralıklı sayı stratejisi; çoklu yazma işlemleri `prisma.$transaction` içinde.
- REST: `/api/v1/...`, doğru HTTP status kodları, tutarlı hata gövdesi (global exception filter).
- WebSocket: kullanıcılar `board:<id>` room'una katılır; değişiklikler başarılı DB yazımından **sonra** yayınlanır. Event adları `entity:action` formatında (`card:moved`, `list:created`).
- Şema değişikliği = Prisma migration (`npm run prisma:migrate -w backend -- --name <açıklama>`); migration dosyalarını elle düzenleme. DB yokken migration SQL'i `prisma migrate diff` ile üretilebilir.
- Prisma 7: client `src/generated/prisma/client.js`'ten import edilir (`@prisma/client`'tan değil); bağlantı `@prisma/adapter-pg` ile.
- Hata fırlatırken domain kodu ver: `throw new ConflictException({ code: ErrorCode.EMAIL_TAKEN, message: '...' })`. Global filter her hatayı `ApiErrorBody` şekline çevirir; bilinmeyen hatalar 500 + genel mesaj olur.
- Backend ESM (`"type": "module"`, `nodenext`): göreli import'larda `.js` uzantısı zorunlu.
- E2E testleri `test/utils/create-test-app.ts` ile uygulamayı production'daki aynı kurulumla (`configureApp`) başlatır.
- **Auth varsayılan olarak açık**: global `JwtAuthGuard` her route'ta access token ister. Açık route'lar `@Public()` ile işaretlenir; kullanıcı `@CurrentUser()` ile alınır (`{ id, email }`). Kimlik bilgisi alan endpoint'lere `@Throttle(...)` ile sıkı limit konur.
- Refresh token sadece httpOnly `rt` cookie'sinde (path `/api/v1/auth`, SameSite=Strict); response body'sine asla yazılmaz. DB'de sadece sha256 hash'i tutulur.

### Git
- Conventional Commits, İngilizce: `feat:`, `fix:`, `test:`, `refactor:`, `chore:`, `docs:`.
- Küçük, odaklı commit'ler.

## ✅ Zorunlu Kural: Her Özellikten Sonra Test Yaz

**Bir özellik, testleri yazılıp geçmeden "bitti" sayılmaz.**

1. Her yeni özellik / endpoint / component / hook için ilgili **unit testler** yazılır.
2. Kullanıcı akışını etkileyen özellikler için **e2e test** eklenir (backend: Supertest, frontend: Playwright).
3. Bug fix'lerde önce hatayı yeniden üreten bir test yazılır, sonra düzeltilir.
4. Testler çalıştırılır ve **hepsi geçer**; başarısız test atlanmaz, `skip`/`only` bırakılmaz.
5. Mümkün olduğunda `tester` subagent'ı bu adım için kullanılır.

## Subagent'lar (`.claude/agents/`)

| Agent | Ne zaman |
|---|---|
| `architect` | Yeni özellik başlamadan önce: plan, DB şeması, API/socket sözleşmesi |
| `backend-nest` | Endpoint, Prisma modeli, auth, websocket gateway |
| `frontend-react` | Component, custom hook, TanStack Query/Zustand state, dnd-kit |
| `ui-designer` | Tema token'ları, responsive düzen, erişilebilirlik |
| `tester` | Her özellik sonrası: test yaz, çalıştır, düzelt |
| `code-reviewer` | Her özellik/commit öncesi: güvenlik + kalite incelemesi |

Önerilen akış: **architect → backend-nest / frontend-react (+ ui-designer) → tester → code-reviewer**.

## Komutlar

```bash
# Kurulum (kökte; contracts'ı derler ve Prisma client'ı üretir)
npm install
cp backend/.env.example backend/.env
docker compose up -d                         # PostgreSQL (Docker kuruluysa)
npm run prisma:deploy -w backend             # migration'ları uygula

# Geliştirme
npm run dev:backend                          # http://localhost:3000/api/v1
npm run dev:frontend                         # http://localhost:5173 (/api → 3000 proxy)

# Kontroller (kökten hepsi, ya da -w <workspace>)
npm run build
npm test                                     # tüm unit testler
npm run lint
npm run test:e2e -w backend                  # Supertest
npm run test:e2e -w frontend                 # Playwright (dev server'ı kendisi açar)
npm run typecheck -w backend
npm run typecheck -w frontend

# Prisma
npm run prisma:migrate -w backend -- --name <açıklama>
npm run prisma:generate -w backend
```
