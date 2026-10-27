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
| Test | Frontend: Vitest + React Testing Library + Playwright · Backend: Jest unit + Supertest e2e |

### Sürümler
- Node: **22 LTS** (`.nvmrc` ve `package.json` `engines` alanında sabitlenir).
- React, Vite, NestJS: kurulum anındaki **güncel kararlı** sürümler. _Kurulumdan sonra kesin sürüm numaralarını buraya yaz._
  - React: `TBD`
  - Vite: `TBD`
  - NestJS: `TBD`

## Klasör Yapısı

```
trello-clone/
├── CLAUDE.md
├── .claude/agents/            # Subagent tanımları
├── docs/                      # Plan ve tasarım dokümanları
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
│       └── styles/            # Tema token'ları (CSS custom properties), Tailwind girişi
└── backend/                   # NestJS uygulaması
    ├── prisma/
    │   ├── schema.prisma
    │   └── migrations/
    ├── src/
    │   ├── common/            # Guard, filter, interceptor, decorator, pipe
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
- **Stil**: Tailwind utility'leri, renkler/boşluklar/gölgeler tema token'larına (CSS custom properties) bağlı Tailwind teması üzerinden. Sabit hex/rgb renk veya keyfi değer (`bg-[#123456]`) yazma.
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
- Şema değişikliği = Prisma migration (`prisma migrate dev --name <açıklama>`); migration dosyalarını elle düzenleme.

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

## Komutlar (kurulumdan sonra güncellenecek)

```bash
# Backend
cd backend && npm run start:dev
cd backend && npm test && npm run test:e2e
cd backend && npx prisma migrate dev

# Frontend
cd frontend && npm run dev
cd frontend && npm test            # Vitest
cd frontend && npx playwright test
```
