# Trello Clone — Proje Rehberi

Trello benzeri bir proje yönetim uygulaması: board → list → card hiyerarşisi, sürükle-bırak, gerçek zamanlı iş birliği.

## Teknoloji Seti

| Katman | Teknoloji |
|---|---|
| Frontend | Angular (standalone components, signals), Angular CDK drag-drop, TypeScript strict |
| Backend | NestJS, TypeScript strict |
| Veritabanı | PostgreSQL + Prisma ORM |
| Gerçek zamanlı | Socket.io (`@nestjs/websockets` + `socket.io-client`) |
| Auth | JWT (access + refresh token), bcrypt/argon2 ile parola hash |
| Test | Frontend: Jest/Karma unit + Playwright e2e · Backend: Jest unit + Supertest e2e |

## Klasör Yapısı

```
trello-clone/
├── CLAUDE.md
├── .claude/agents/          # Subagent tanımları
├── frontend/                # Angular uygulaması
│   └── src/app/
│       ├── core/            # Singleton servisler, interceptor, guard, socket servisi
│       ├── shared/          # Yeniden kullanılabilir UI bileşenleri, pipe, directive
│       ├── features/        # Özellik bazlı klasörler (auth, boards, board-detail, cards...)
│       │   └── <feature>/
│       │       ├── components/
│       │       ├── services/
│       │       ├── state/   # Signal tabanlı store'lar
│       │       └── <feature>.routes.ts
│       └── styles/          # Design token'lar, global stiller
└── backend/                 # NestJS uygulaması
    ├── prisma/
    │   ├── schema.prisma
    │   └── migrations/
    ├── src/
    │   ├── common/          # Guard, filter, interceptor, decorator, pipe
    │   ├── prisma/          # PrismaService / PrismaModule
    │   ├── auth/
    │   ├── users/
    │   ├── boards/
    │   ├── lists/
    │   ├── cards/
    │   └── realtime/        # Socket.io gateway
    └── test/                # e2e testleri
```

## Kod Kuralları

### Genel
- TypeScript `strict: true`; `any` kullanma — gerekirse `unknown` + type guard.
- Dosya adları kebab-case (`board-list.component.ts`), sınıflar PascalCase, değişken/fonksiyon camelCase.
- Küçük, tek sorumluluklu fonksiyonlar. Ölü kod ve yorum satırına alınmış kod bırakma.
- Sırlar (`DATABASE_URL`, `JWT_SECRET`) yalnızca `.env` içinde; `.env` commit edilmez, `.env.example` güncel tutulur.
- Frontend ve backend arasındaki paylaşılan sözleşmeler (DTO şekilleri, socket event adları) tek yerde tanımlanır ve iki tarafta aynı adlarla kullanılır.

### Frontend (Angular)
- Sadece **standalone** component; NgModule yok.
- State için **signals** (`signal`, `computed`, `effect`); RxJS sadece HTTP/socket akışları için, UI'a `toSignal` ile bağla.
- `ChangeDetectionStrategy.OnPush` her component'te.
- Yeni kontrol akışı sözdizimi: `@if`, `@for` (`track` zorunlu), `@switch`.
- `inject()` fonksiyonu ile DI; constructor injection yerine.
- Sürükle-bırak: Angular CDK `cdkDropList` / `cdkDrag`; sıralama değişikliği önce optimistic olarak UI'da uygulanır, hata olursa geri alınır.
- Lazy-loaded route'lar (`loadComponent` / `loadChildren`).
- Stil: design token'lar (CSS custom properties) üzerinden; sabit renk/px değerleri yazma.
- Erişilebilirlik: semantik HTML, klavye ile kullanılabilirlik, ARIA etiketleri.

### Backend (NestJS)
- Özellik başına modül (`*.module.ts`, `*.controller.ts`, `*.service.ts`, `dto/`).
- Tüm input'lar `class-validator` DTO'ları ile doğrulanır; global `ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true })`.
- İş mantığı service'te, controller ince kalır. Veritabanı erişimi sadece `PrismaService` üzerinden.
- Her endpoint'te yetkilendirme: kullanıcının ilgili board'a erişimi var mı kontrol edilir.
- Sıralama (position) için kesirli/aralıklı sayı stratejisi; çoklu yazma işlemleri `prisma.$transaction` içinde.
- REST: `/api/v1/...`, doğru HTTP status kodları, tutarlı hata gövdesi (global exception filter).
- WebSocket: kullanıcılar `board:<id>` room'una katılır; değişiklikler başarılı DB yazımından **sonra** yayınlanır. Event adları `entity:action` formatında (`card:moved`, `list:created`).
- Şema değişikliği = Prisma migration (`prisma migrate dev --name <açıklama>`); migration dosyalarını elle düzenleme.

### Git
- Conventional Commits: `feat:`, `fix:`, `test:`, `refactor:`, `chore:`, `docs:`.
- Küçük, odaklı commit'ler.

## ✅ Zorunlu Kural: Her Özellikten Sonra Test Yaz

**Bir özellik, testleri yazılıp geçmeden "bitti" sayılmaz.**

1. Her yeni özellik / endpoint / component için ilgili **unit testler** yazılır.
2. Kullanıcı akışını etkileyen özellikler için **e2e test** eklenir (backend: Supertest, frontend: Playwright).
3. Bug fix'lerde önce hatayı yeniden üreten bir test yazılır, sonra düzeltilir.
4. Testler çalıştırılır ve **hepsi geçer**; başarısız test atlanmaz, `skip`/`only` bırakılmaz.
5. Mümkün olduğunda `tester` subagent'ı bu adım için kullanılır.

## Subagent'lar (`.claude/agents/`)

| Agent | Ne zaman |
|---|---|
| `architect` | Yeni özellik başlamadan önce: plan, DB şeması, API/socket sözleşmesi |
| `backend-nest` | Endpoint, Prisma modeli, auth, websocket gateway |
| `frontend-angular` | Component, servis, signal state, drag-drop |
| `ui-designer` | Design token, responsive düzen, erişilebilirlik |
| `tester` | Her özellik sonrası: test yaz, çalıştır, düzelt |
| `code-reviewer` | Her özellik/commit öncesi: güvenlik + kalite incelemesi |

Önerilen akış: **architect → backend-nest / frontend-angular (+ ui-designer) → tester → code-reviewer**.

## Komutlar (kurulumdan sonra güncellenecek)

```bash
# Backend
cd backend && npm run start:dev
cd backend && npm test && npm run test:e2e
cd backend && npx prisma migrate dev

# Frontend
cd frontend && npm start
cd frontend && npm test
cd frontend && npx playwright test
```
