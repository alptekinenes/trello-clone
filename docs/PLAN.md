# Trello Klonu — MVP Planı

> `architect` rolüyle hazırlandı; frontend bölümleri React kararına göre güncellendi.
> Kurallar için bkz. `CLAUDE.md`. Arayüz metinleri Türkçe.

## İlerleme

| Faz | Durum | Not |
|---|---|---|
| 0 – Kurulum | ✅ Bitti | Seed yok (DB gerekiyor). |
| 1 – Auth | ✅ Bitti | DB'li e2e (`test/auth-flow.e2e-spec.ts`) ve Playwright kayıt→çıkış→giriş akışı (`e2e/auth.spec.ts`) dahil. |
| 2 – Board + Üyeler | ✅ Bitti | Board CRUD, varsayılan 6 etiket, `@BoardRole` + `BoardAccessGuard` (`src/access/`), üye listeleme/rol değiştirme/çıkarma/ayrılma. FE: `/boards` (liste + oluşturma diyaloğu), `/boards/:id` (başlık yeniden adlandırma, üye avatarları, sahip için silme). **Plandan farklar:** `BoardDetailDto` şimdilik `{ board, members, labels }`; `lists`/`cards` Faz 3–4'te eklenecek. Üye yönetimi arayüzü (rol değiştirme, çıkarma, ayrılma) davetlerle birlikte Faz 6'da; arka plan değiştirme arayüzü Faz 8'de (API hazır). |
| 3 – Listeler | ✅ Bitti | Liste CRUD, arşiv/geri yükleme, kalıcı silme (ADMIN), board kilidiyle sıralama + rebalance (`src/ordering/`), `POST /lists/:id/move`. FE: yatay liste sütunları, fare/klavye ile sürükle-bırak (dnd-kit), Liste ekle, arşiv diyaloğu, toast. Playwright: fare ve klavye ile taşıma → reload → sıra kalıcı, arşiv/geri yükleme. |
| 4–8 | ⏳ Başlamadı | |

**Ortam:** PostgreSQL 17 yerel olarak kurulu (Windows servisi, sadece localhost). `trello` kullanıcısı; `trello` (dev) ve `trello_test` (e2e) veritabanları. Docker yok.

**İş takibi:** Bundan sonra işler uygulamanın kendisinde, demo hesabındaki "Trello Clone — Geliştirme" panosunda yönetilir (kartlar Faz 4 ile gelir).

**Not (prod):** Reverse proxy arkasında rate limit'in doğru IP'yi görmesi için Express `trust proxy` ayarı gerekecek (Faz 8).

---

## 1. Özet & Kapsam

**Amaç:** Board → List → Card hiyerarşisi; sürükle-bırak, kart detayı (açıklama, etiket, son tarih, checklist), rol tabanlı board üyeliği ve Socket.io ile gerçek zamanlı iş birliği.

**Kapsam içi (MVP)**
- E-posta + parola ile kayıt/giriş. Parola hash: **argon2id**. Access token JWT (15 dk, sadece bellekte), refresh token opak (7 gün, rotasyonlu, httpOnly cookie).
- `GET/PATCH /users/me`
- Board CRUD. Oluşturan OWNER olur; board açılırken 6 varsayılan etiket eklenir.
- Listeler: oluşturma, yeniden adlandırma, sıralama, arşivleme/geri alma, kalıcı silme.
- Kartlar: oluşturma, düzenleme, arşivleme, silme; liste içinde ve listeler arasında sürükle-bırak.
- Kart detayı: açıklama (düz metin), board seviyesinde etiketler, `dueDate` + `dueComplete`, birden çok checklist ve sıralanabilir maddeler.
- Üyelik: OWNER / ADMIN / MEMBER rolleri, hibrit davet akışı (aşağıda).
- Realtime: board başına `board:<id>`, kullanıcı başına `user:<id>` room'u.

**Davet akışı (hibrit)**
1. ADMIN+ `POST /boards/:id/invitations {email, role}` çağırır.
2. E-posta **kayıtlı bir kullanıcıya** aitse kullanıcı doğrudan `BoardMember` olur; `member:added` + `membership:added` yayınlanır.
3. **Kayıtlı değilse** token'lı `Invitation` kaydı oluşur (7 gün). MVP'de SMTP yok: `MailService` linki loglar, response `inviteUrl` döndürür; davet eden linki paylaşır.
4. Davetli `/invitations/:token` sayfasını açar → kayıt/giriş → `accept`. **Token + e-posta eşleşmesi zorunlu.**
5. Kayıtta e-postaya göre **otomatik kabul yok**: e-posta doğrulaması olmadığı için biri davetli adresle kayıt olup board'a girebilirdi.

**Rol matrisi**

| İşlem | OWNER | ADMIN | MEMBER |
|---|---|---|---|
| Board görme; liste/kart/checklist/etiket CRUD; kart taşıma | ✓ | ✓ | ✓ |
| Liste kalıcı silme | ✓ | ✓ | ✗ |
| Board güncelleme (başlık, arka plan) | ✓ | ✓ | ✗ |
| Davet gönderme/iptal, MEMBER çıkarma | ✓ | ✓ | ✗ |
| ADMIN çıkarma, rol değiştirme | ✓ | ✗ | ✗ |
| Board silme | ✓ | ✗ | ✗ |
| Board'dan ayrılma | ✗ | ✓ | ✓ |

Üye olmayana **404** (board'un varlığı açığa çıkmaz); üye ama rolü yetersiz olana **403**.

**Kapsam dışı:** e-posta doğrulama ve gerçek e-posta gönderimi, parola sıfırlama, OAuth, sahiplik devri, ek dosyalar, yorumlar, activity log, kart üyeleri (assignee), board dışına kart taşıma/kopyalama, markdown, arama/filtre, bildirimler, workspace, offline mod, presence, kartlarda optimistic locking (last-write-wins kabul).

---

## 2. Prisma Şeması

Migration adı: `init_schema` (Faz 0). Sonraki her değişiklik yeni migration ile.

> Prisma ≥7 kurulursa `url` `prisma.config.ts`'e taşınır ve generator `provider = "prisma-client"` + `output` olur; modeller aynı kalır.

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

enum BoardRole {
  OWNER
  ADMIN
  MEMBER
}

enum InvitationStatus {
  PENDING
  ACCEPTED
  REVOKED
}

enum LabelColor {
  GREEN
  YELLOW
  ORANGE
  RED
  PURPLE
  BLUE
  SKY
  LIME
  PINK
  BLACK
}

model User {
  id              String         @id @default(uuid()) @db.Uuid
  email           String         @unique @db.VarChar(254) // servis katmanında trim + lowercase
  passwordHash    String                                  // argon2id
  name            String         @db.VarChar(100)
  avatarUrl       String?        @db.VarChar(2048)
  createdAt       DateTime       @default(now())
  updatedAt       DateTime       @updatedAt

  refreshTokens   RefreshToken[]
  memberships     BoardMember[]
  sentInvitations Invitation[]   @relation("InvitationInvitedBy")
}

model RefreshToken {
  id           String    @id @default(uuid()) @db.Uuid
  userId       String    @db.Uuid
  tokenHash    String    @unique             // sha256(opaque token)
  familyId     String    @db.Uuid            // rotasyon zinciri; reuse tespitinde tüm aile iptal
  expiresAt    DateTime
  revokedAt    DateTime?
  replacedById String?   @db.Uuid
  userAgent    String?   @db.VarChar(512)
  createdAt    DateTime  @default(now())

  user         User      @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
  @@index([familyId])
}

model Board {
  id          String        @id @default(uuid()) @db.Uuid
  title       String        @db.VarChar(100)
  background  String        @default("blue") @db.VarChar(32) // tema token anahtarı; DTO'da @IsIn
  createdAt   DateTime      @default(now())
  updatedAt   DateTime      @updatedAt

  members     BoardMember[]
  invitations Invitation[]
  lists       List[]
  cards       Card[]
  labels      Label[]
}

model BoardMember {
  boardId  String    @db.Uuid
  userId   String    @db.Uuid
  role     BoardRole @default(MEMBER)
  joinedAt DateTime  @default(now())

  board    Board     @relation(fields: [boardId], references: [id], onDelete: Cascade)
  user     User      @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@id([boardId, userId])
  @@index([userId])
}

model Invitation {
  id          String           @id @default(uuid()) @db.Uuid
  boardId     String           @db.Uuid
  email       String           @db.VarChar(254)  // lowercase
  role        BoardRole        @default(MEMBER)  // OWNER kabul edilmez (DTO)
  tokenHash   String           @unique           // sha256(token); düz token saklanmaz
  status      InvitationStatus @default(PENDING)
  invitedById String           @db.Uuid
  expiresAt   DateTime
  acceptedAt  DateTime?
  createdAt   DateTime         @default(now())
  updatedAt   DateTime         @updatedAt

  board       Board            @relation(fields: [boardId], references: [id], onDelete: Cascade)
  invitedBy   User             @relation("InvitationInvitedBy", fields: [invitedById], references: [id], onDelete: Cascade)

  @@unique([boardId, email])   // yeniden davet = aynı kaydı upsert (yeni token, PENDING, yeni expiresAt)
  @@index([email])
}

model List {
  id         String    @id @default(uuid()) @db.Uuid
  boardId    String    @db.Uuid
  title      String    @db.VarChar(100)
  position   Float                        // double precision
  archivedAt DateTime?
  createdAt  DateTime  @default(now())
  updatedAt  DateTime  @updatedAt

  board      Board     @relation(fields: [boardId], references: [id], onDelete: Cascade)
  cards      Card[]

  @@index([boardId, position])
}

model Card {
  id          String      @id @default(uuid()) @db.Uuid
  boardId     String      @db.Uuid            // denormalize: yetki + room çözümü tek sorguda
  listId      String      @db.Uuid
  title       String      @db.VarChar(512)
  description String?     @db.Text
  dueDate     DateTime?
  dueComplete Boolean     @default(false)
  position    Float
  archivedAt  DateTime?
  createdAt   DateTime    @default(now())
  updatedAt   DateTime    @updatedAt

  board       Board       @relation(fields: [boardId], references: [id], onDelete: Cascade)
  list        List        @relation(fields: [listId], references: [id], onDelete: Cascade)
  labels      CardLabel[]
  checklists  Checklist[]

  @@index([listId, position])
  @@index([boardId])
}

model Label {
  id        String      @id @default(uuid()) @db.Uuid
  boardId   String      @db.Uuid
  name      String      @default("") @db.VarChar(50)
  color     LabelColor
  createdAt DateTime    @default(now())
  updatedAt DateTime    @updatedAt

  board     Board       @relation(fields: [boardId], references: [id], onDelete: Cascade)
  cards     CardLabel[]

  @@index([boardId])
}

model CardLabel {
  cardId     String   @db.Uuid
  labelId    String   @db.Uuid
  assignedAt DateTime @default(now())

  card       Card     @relation(fields: [cardId], references: [id], onDelete: Cascade)
  label      Label    @relation(fields: [labelId], references: [id], onDelete: Cascade)

  @@id([cardId, labelId])
  @@index([labelId])
}

model Checklist {
  id        String          @id @default(uuid()) @db.Uuid
  cardId    String          @db.Uuid
  title     String          @db.VarChar(200)
  position  Float
  createdAt DateTime        @default(now())
  updatedAt DateTime        @updatedAt

  card      Card            @relation(fields: [cardId], references: [id], onDelete: Cascade)
  items     ChecklistItem[]

  @@index([cardId, position])
}

model ChecklistItem {
  id          String    @id @default(uuid()) @db.Uuid
  checklistId String    @db.Uuid
  content     String    @db.VarChar(500)
  isCompleted Boolean   @default(false)
  position    Float
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt

  checklist   Checklist @relation(fields: [checklistId], references: [id], onDelete: Cascade)

  @@index([checklistId, position])
}
```

**Servis katmanında zorlanan kurallar** (DB'de değil)
- Board başına tam olarak bir OWNER.
- `CardLabel`: `label.boardId === card.boardId`.
- `Card.boardId === List.boardId`.
- `(parentId, position)` için unique kısıt **yok** (float'ta kırılgan). Sıralama her yerde `ORDER BY position ASC, id ASC`.

---

## 3. Sıralama Yöntemi (kartlar, listeler, checklist'ler, maddeler)

**Karşılaştırma**

| Yöntem | Artı | Eksi |
|---|---|---|
| Integer index + kaydırma | En basit | Her taşımada O(n) UPDATE, kilit çakışması, socket payload'ı tüm liste |
| **Float + aralık (seçilen)** | Normalde tek satır UPDATE; basit matematik; client aynı fonksiyonla optimistic pozisyon hesaplar | Double hassasiyeti ~30 ardışık bölmede biter → seyrek rebalance |
| LexoRank / fractional-indexing string | Pratikte sınırsız hassasiyet | Ek kütüphane, uzayan string'ler, Postgres collation tuzağı (`COLLATE "C"`), zor debug |
| Linked list (`prevId`) | O(1) yazma | Sıralı okuma için recursive CTE, eşzamanlılıkta zincir kopması, index'le sıralama yok |

**Seçim: `Float` + aralık + gerektiğinde rebalance.**
Gerekçe: MVP'de bir listede yüzlerce kart olur, binlerce değil. Bu yüzden rebalance hem ucuz hem nadir. Normal bir taşıma tek satır günceller, bu da kilit çakışmasını ve socket payload'ını küçük tutar. Aynı `positionBetween` fonksiyonu frontend'de de çalıştığı için optimistic update'te sunucuyla aynı sonucu verir. String tabanlı yöntemin getirdiği collation riski ve ek kütüphane bu ölçekte gereksiz.

**Algoritma** (`shared/contracts/src/position.ts`, backend ve frontend aynı kodu kullanır)

```ts
export const POSITION_GAP = 1024;
export const MIN_POSITION_GAP = 1e-6;

export function positionBetween(prev: number | null, next: number | null): number {
  if (prev === null && next === null) return POSITION_GAP; // boş konteyner
  if (prev === null) return next! / 2;                     // en üste
  if (next === null) return prev + POSITION_GAP;           // en alta
  return (prev + next) / 2;                                // araya
}

export function needsRebalance(prev: number | null, next: number | null, pos: number): boolean {
  const lo = prev ?? 0;
  return pos - lo < MIN_POSITION_GAP || (next !== null && next - pos < MIN_POSITION_GAP);
}
```

**Client ham pozisyon değil, komşu id'leri gönderir**

`POST /cards/:id/move { listId, afterCardId?: uuid | null, beforeCardId?: uuid | null }`

Neden: client'taki pozisyonlar bayat olabilir (başka biri araya ekledi, rebalance oldu). Sunucu authoritative kalır. `NaN`/`Infinity`/dev sayılarla manipülasyon engellenir. Rebalance client'tan gizli kalır. Client yine de `positionBetween` ile optimistic değer hesaplar; sunucu cevabındaki `position` bunun yerine yazılır.

**Sunucu prosedürü** (generic `OrderingService`, tek `prisma.$transaction`)
1. **Kilitle:** parent satırlar `SELECT … FOR UPDATE` (tagged `$queryRaw`) ile, id sırasına göre kilitlenir (deadlock önlemi). Kart taşıma → kaynak + hedef liste; liste → Board; checklist → Card; madde → Checklist(ler).
2. **Komşuları çöz** (arşivsiz kardeşler, taşınan öğe hariç):
   - `afterId` varsa: hedef konteynerde olmalı, yoksa **409 `POSITION_CONFLICT`**; `prev = after`, `next` = ondan büyük ilk kardeş (DB'den).
   - Yoksa `beforeId` varsa: `next = before`, `prev` = ondan önceki.
   - İkisi de yoksa sona ekle.
   - İkisi verildi ama komşu değilse **`afterId` kazanır**.
3. `pos = positionBetween(prev, next)`.
4. `needsRebalance` ise: tüm kardeşler `(position, id)` sırasıyla okunur, taşınan öğe hedef index'e yerleştirilir, her öğeye `(i + 1) * POSITION_GAP` yazılır; commit sonrası `position:rebalanced` yayınlanır.
5. Öğe güncellenir (`listId`, `position`); commit sonrası `card:moved` yayınlanır.

**Diğer kurallar:** arşivden çıkan öğe sona eklenir; yeni öğe oluşturma da aynı servisi kullanır (varsayılan: sona); 409 alan client board verisini yeniden çeker ve toast gösterir; hedef liste aynı board'da ve arşivsiz olmalı, yoksa 400 `INVALID_TARGET`.

---

## 4. REST API (`/api/v1`)

**Ortak kurallar**
- Global `JwtAuthGuard`; açık endpoint'ler `@Public()`.
- Board yetkisi `BoardAccessGuard` + `@BoardRole(min)`; guard `boardId`'yi route param'ından veya `listId`/`cardId`/`labelId`/`checklistId`/`itemId` üzerinden tek sorguyla çözer.
- Hata gövdesi: `{ statusCode, code, message, details?, path, timestamp }`. Prisma: P2002 → 409, P2025 → 404.
- Client her istekte `X-Socket-Id` gönderir; sunucu yayında bu socket'i hariç tutar (yankı engelleme).

### Auth & Kullanıcı

| Method | Path | Auth | Body | Response | Önemli hatalar |
|---|---|---|---|---|---|
| POST | `/auth/register` | Public, throttled | `{email, password(8–128), name}` | 201 `{accessToken, user}` + `Set-Cookie: rt` (httpOnly, Secure, SameSite=Strict, Path=/api/v1/auth) | 400, 409 `EMAIL_TAKEN`, 429 |
| POST | `/auth/login` | Public, throttled | `{email, password}` | 200 `{accessToken, user}` + cookie | 401 `INVALID_CREDENTIALS`, 429 |
| POST | `/auth/refresh` | Public (cookie) | – | 200 `{accessToken, user}` + yeni cookie | 401 `INVALID_REFRESH` (reuse → aile iptal) |
| POST | `/auth/logout` | Public (cookie) | – | 204, revoke + cookie silinir | – |
| GET | `/users/me` | ✓ | – | `UserDto {id,email,name,avatarUrl}` | 401 |
| PATCH | `/users/me` | ✓ | `{name?, avatarUrl?}` | `UserDto` | 400 |

### Board & Üyeler

| Method | Path | Rol | Body | Response | Hatalar |
|---|---|---|---|---|---|
| GET | `/boards` | (üyesi olduğu) | – | `BoardSummaryDto[] {id,title,background,myRole,updatedAt}` | – |
| POST | `/boards` | – | `{title(1–100), background?}` | 201 `BoardSummaryDto` (OWNER üyeliği + varsayılan etiketler aynı transaction'da) | 400 |
| GET | `/boards/:boardId` | MEMBER | – | `BoardDetailDto { board, myRole, members[], labels[], lists[], cards[] }` — kartlar `CardSummary` (id, listId, title, position, dueDate, dueComplete, labelIds, hasDescription, checklistTotal, checklistDone) | 404 |
| PATCH | `/boards/:boardId` | ADMIN | `{title?, background?}` | `BoardSummaryDto` | 403, 404 |
| DELETE | `/boards/:boardId` | OWNER | – | 204 | 403 |
| GET | `/boards/:boardId/members` | MEMBER | – | `MemberDto[] {userId,name,email,avatarUrl,role,joinedAt}` | – |
| PATCH | `/boards/:boardId/members/:userId` | OWNER | `{role: ADMIN\|MEMBER}` | `MemberDto` | 400 `CANNOT_CHANGE_OWNER` |
| DELETE | `/boards/:boardId/members/:userId` | ADMIN (kendisi için herkes) | – | 204; socket'leri room'dan çıkarılır | 400 `OWNER_CANNOT_LEAVE`, 403 |

### Davetler

| Method | Path | Auth/Rol | Body | Response | Hatalar |
|---|---|---|---|---|---|
| POST | `/boards/:boardId/invitations` | ADMIN | `{email, role: ADMIN\|MEMBER}` | 201 `{result:'MEMBER_ADDED', member}` veya `{result:'INVITATION_CREATED', invitation, inviteUrl}` | 409 `ALREADY_MEMBER`, 400 |
| GET | `/boards/:boardId/invitations` | ADMIN | – | `InvitationDto[]` (PENDING, süresi dolmamış) | – |
| DELETE | `/boards/:boardId/invitations/:invitationId` | ADMIN | – | 204 (REVOKED) | 404 |
| GET | `/invitations/:token` | Public | – | `{boardTitle, inviterName, email, role, expiresAt}` | 404, 410 `INVITATION_EXPIRED` |
| POST | `/invitations/:token/accept` | ✓ | – | 200 `{boardId}` (zaten üyeyse idempotent) | 403 `EMAIL_MISMATCH`, 410 |

### Listeler

| Method | Path | Rol | Body | Response | Hatalar |
|---|---|---|---|---|---|
| GET | `/boards/:boardId/lists?archived=true` | MEMBER | – | `ListDto[]` (arşiv paneli) | – |
| POST | `/boards/:boardId/lists` | MEMBER | `{title, afterListId?, beforeListId?}` | 201 `ListDto {id,boardId,title,position,archivedAt}` | 409 |
| PATCH | `/lists/:listId` | MEMBER | `{title?, archived?}` | `ListDto` | 404 |
| POST | `/lists/:listId/move` | MEMBER | `{afterListId?, beforeListId?}` | `{id, position}` | 409, 400 |
| DELETE | `/lists/:listId` | ADMIN | – | 204 (kartlar cascade) | 403 |

### Kartlar

| Method | Path | Rol | Body | Response | Hatalar |
|---|---|---|---|---|---|
| GET | `/boards/:boardId/cards?archived=true` | MEMBER | – | `CardSummaryDto[]` | – |
| POST | `/lists/:listId/cards` | MEMBER | `{title(1–512), afterCardId?, beforeCardId?}` | 201 `CardSummaryDto` | 400, 409 |
| GET | `/cards/:cardId` | MEMBER | – | `CardDetailDto` (summary + description + `checklists[{id,title,position,items[]}]`) | 404 |
| PATCH | `/cards/:cardId` | MEMBER | `{title?, description?: string\|null (≤10k), dueDate?: ISO\|null, dueComplete?, archived?}` | `CardSummaryDto` | 400 |
| POST | `/cards/:cardId/move` | MEMBER | `{listId, afterCardId?, beforeCardId?}` | `{id, listId, position}` | 400 `INVALID_TARGET`, 409 |
| DELETE | `/cards/:cardId` | MEMBER | – | 204 | 404 |

### Etiketler

| Method | Path | Rol | Body | Response | Hatalar |
|---|---|---|---|---|---|
| GET | `/boards/:boardId/labels` | MEMBER | – | `LabelDto[] {id,boardId,name,color}` | – |
| POST | `/boards/:boardId/labels` | MEMBER | `{name?(≤50), color}` | 201 `LabelDto` | 400 |
| PATCH | `/labels/:labelId` | MEMBER | `{name?, color?}` | `LabelDto` | 404 |
| DELETE | `/labels/:labelId` | MEMBER | – | 204 | 404 |
| PUT | `/cards/:cardId/labels/:labelId` | MEMBER | – | 204 (idempotent) | 400 `LABEL_NOT_IN_BOARD` |
| DELETE | `/cards/:cardId/labels/:labelId` | MEMBER | – | 204 (idempotent) | – |

### Checklist & Maddeler

| Method | Path | Rol | Body | Response | Hatalar |
|---|---|---|---|---|---|
| POST | `/cards/:cardId/checklists` | MEMBER | `{title}` | 201 `ChecklistDto` | 400 |
| PATCH | `/checklists/:checklistId` | MEMBER | `{title}` | `ChecklistDto` | 404 |
| POST | `/checklists/:checklistId/move` | MEMBER | `{afterChecklistId?, beforeChecklistId?}` | `{id, position}` | 409 |
| DELETE | `/checklists/:checklistId` | MEMBER | – | 204 | – |
| POST | `/checklists/:checklistId/items` | MEMBER | `{content(1–500)}` | 201 `ChecklistItemDto` | 400 |
| PATCH | `/checklist-items/:itemId` | MEMBER | `{content?, isCompleted?}` | `ChecklistItemDto` | 404 |
| POST | `/checklist-items/:itemId/move` | MEMBER | `{checklistId?, afterItemId?, beforeItemId?}` (aynı kart içinde) | `{id, checklistId, position}` | 400, 409 |
| DELETE | `/checklist-items/:itemId` | MEMBER | – | 204 | – |

---

## 5. WebSocket Sözleşmesi

- Namespace `/realtime`; bağlantıda `auth: { token }`. Middleware JWT doğrular, geçersizse `connect_error: UNAUTHORIZED`.
- Socket otomatik `user:<userId>` room'una katılır. Token süresi dolunca client refresh yapar, yeniden bağlanır ve aktif board'a tekrar `board:join` gönderir.
- Yayın sadece **commit sonrası**, `RealtimeService.emitToBoard(boardId, event, payload, excludeSocketId)` ile.
- Envelope: `{ boardId, actorId, emittedAt, data }`. Event adları ve payload tipleri `shared/contracts/src/realtime-events.ts` içinde.

| Event | Yön | Room | `data` |
|---|---|---|---|
| `board:join` | C→S (ack) | – | `{boardId}` → `{ok:true}` / `{ok:false, code:'NOT_FOUND'}` |
| `board:leave` | C→S | – | `{boardId}` |
| `board:updated` / `board:deleted` | S→C | board | `BoardSummaryDto` / `{boardId}` |
| `member:added` / `member:updated` | S→C | board | `MemberDto` |
| `member:removed` | S→C | board | `{userId}` (çıkarılanın socket'leri room'dan atılır) |
| `membership:added` / `membership:removed` | S→C | user | `BoardSummaryDto` / `{boardId}` |
| `list:created` / `list:updated` | S→C | board | `ListDto` |
| `list:moved` | S→C | board | `{id, position}` |
| `list:deleted` | S→C | board | `{id}` |
| `card:created` / `card:updated` | S→C | board | `CardSummaryDto` |
| `card:moved` | S→C | board | `{id, fromListId, toListId, position}` |
| `card:deleted` | S→C | board | `{id, listId}` |
| `card:label-added` / `card:label-removed` | S→C | board | `{cardId, labelId}` |
| `label:created` / `label:updated` / `label:deleted` | S→C | board | `LabelDto` / `{id}` |
| `checklist:created` / `checklist:updated` / `checklist:deleted` | S→C | board | `ChecklistDto` / `{id, cardId}` |
| `checklist-item:created` / `checklist-item:updated` | S→C | board | `ChecklistItemDto & {cardId}` |
| `checklist-item:moved` | S→C | board | `{id, fromChecklistId, toChecklistId, position, cardId}` |
| `checklist-item:deleted` | S→C | board | `{id, checklistId, cardId}` |
| `position:rebalanced` | S→C | board | `{entity, parentId, positions:[{id, position}]}` |

Checklist maddesi değişikliklerinden sonra kart sayaçları için ayrıca `card:updated` yayınlanır. Client event'leri **idempotent** uygular (id ile upsert; aynıysa no-op).

---

## 6. React Ekranları ve Bileşenleri

### Route'lar (React Router, `createBrowserRouter`, sayfalar `lazy`)

| Path | Sayfa | Koruma |
|---|---|---|
| `/login`, `/register` | `LoginPage`, `RegisterPage` | `GuestRoute` |
| `/boards` | `BoardsPage` | `ProtectedRoute` |
| `/boards/:boardId` | `BoardPage` | `ProtectedRoute` |
| `/boards/:boardId/c/:cardId` (nested) | `CardDetailDialog` (route ile açılan modal; paylaşılabilir URL) | – |
| `/invitations/:token` | `InvitationAcceptPage` (public önizleme; giriş yoksa `returnUrl` ile login/register) | – |
| `/` → `/boards`, `*` → `NotFoundPage` | | |

Açılışta `useAuthBootstrap` `/auth/refresh` dener; access token sadece bellekte (Zustand `authStore`).

### Board sayfası component ağacı

```
BoardPage
├── BoardHeader              (InlineEdit başlık, MemberAvatarStack, Davet butonu, board menüsü)
│   ├── InviteMemberDialog
│   ├── MembersPanel          (rol değiştirme, çıkarma, bekleyen davetler)
│   ├── LabelsManager
│   └── ArchivedItemsPanel
├── BoardCanvas              (DndContext + yatay SortableContext → listeler, DragOverlay)
│   ├── BoardList ×N         (useSortable; tutamaç = ListHeader; dikey SortableContext → kartlar)
│   │   ├── ListHeader        (yeniden adlandır, menü: arşivle/sil)
│   │   ├── CardTile ×M       (useSortable; etiket çipleri, son tarih rozeti, checklist x/y)
│   │   └── AddCardComposer
│   └── AddListComposer
└── <Outlet/> → CardDetailDialog
    ├── CardTitleEditor, CardDescription
    ├── CardLabelsSection → LabelPicker (popover)
    ├── DueDateSection → DueDatePicker
    ├── Checklist ×K (SortableContext) → ChecklistItem
    └── CardActions           (arşivle, sil, "Taşı…" listbox'ı: klavye ile erişilebilir taşıma)
```

### Sürükle-bırak (dnd-kit)
- Tek `DndContext`; sortable id'ler tip önekli (`list:<id>`, `card:<id>`), `data.type` ile ayrılır. Böylece kartlar listelerin arasına bırakılamaz.
- Sensörler: `PointerSensor` (aktivasyon mesafesi 5px), `TouchSensor` (gecikme ~200ms), `KeyboardSensor` (`sortableKeyboardCoordinates`).
- Boş listeye bırakma için her `BoardList` aynı zamanda `useDroppable`.
- Akış:
  1. `onDragStart`: board cache'inin snapshot'ı alınır, `dragStore.activeId` set edilir.
  2. `onDragOver`: kart başka listeye geçerse cache'te geçici olarak taşınır (önizleme).
  3. `onDragEnd`: son index'ten `afterId`/`beforeId` türetilir (`getMoveAnchors` saf fonksiyonu), `positionBetween` ile optimistic pozisyon hesaplanır, `useMoveCard`/`useMoveList` mutation'ı çağrılır.
  4. `onDragCancel` veya mutation hatası: snapshot'a dönülür, toast. 409 → board query invalidate.
- `DragOverlay` ile önizleme (belirgin gölge, hafif eğim); `accessibility.announcements` Türkçe ("Kart 'X', 'Yapılacaklar' listesine taşındı").
- Checklist maddeleri aynı desenle sıralanır.

### Sunucu verisi (TanStack Query)
- `queryKeys` fabrikaları: `boardKeys.all / list() / detail(id)`, `cardKeys.detail(id)`, `invitationKeys.preview(token)`, `memberKeys.list(boardId)`.
- Board sayfası tek bir `['boards', id]` query'si üzerinden çalışır (`BoardDetailDto`); `useCardsByList(boardId)` gibi hook'lar `select` ile sıralı/gruplu görünüm üretir (`position, id`).
- Mutation hook'ları (feature'ın `api/` klasöründe): `useCreateList`, `useUpdateList`, `useMoveList`, `useDeleteList`, `useCreateCard`, `useUpdateCard`, `useMoveCard`, `useDeleteCard`, `useToggleCardLabel`, `useCreateChecklist`, `useToggleChecklistItem`, `useMoveChecklistItem`, `useInviteMember` vb.
- Hepsi aynı desen: `onMutate` (cancelQueries + snapshot + cache güncelle) → `onError` (geri al + toast; 409 ise invalidate) → `onSettled` (ilgili key'leri invalidate). Kart detayındaki değişiklikler hem `cardKeys.detail` hem board cache'indeki `CardSummary`'ye yansıtılır.

### Realtime
- `shared/lib/socket.ts`: tek Socket.io bağlantısı; `socket.id` http client'a `X-Socket-Id` olarak verilir.
- `useBoardRealtime(boardId)`: room'a katılır/ayrılır; gelen event'leri saf `applyBoardEvent(cache, event)` fonksiyonu ile `queryClient.setQueryData`'ya uygular.
- Sürükleme sırasında gelen event'ler `dragStore` kuyruğuna alınır, bırakma sonrası uygulanır.
- `membership:removed` → board açıksa `/boards`'a yönlendir + toast.

### UI state (Zustand)
- `authStore`: `user`, `accessToken`, `status`.
- `dragStore`: `activeId`, `activeType`, `queuedEvents`.
- `uiStore`: toast kuyruğu, açık paneller (üyeler, etiketler, arşiv).
- `themeStore`: açık/koyu/sistem (persist).

### Formlar (React Hook Form + Zod)
`LoginForm`, `RegisterForm`, `CreateBoardForm`, `InviteMemberForm`, `AddListComposer`, `AddCardComposer`, `ChecklistItemForm`. Şemalar `features/<feature>/schemas/`; Türkçe hata mesajları.

### Paylaşılan
- `shared/lib`: `http.ts` (base URL, Bearer, `X-Socket-Id`, 401'de tek uçuşlu refresh + retry, `ApiError` normalizasyonu), `socket.ts`, `query-client.ts`, `date.ts` (`tr-TR` formatlama, `getDueStatus`: overdue / soon / done).
- `shared/ui`: `Button`, `Avatar`, `AvatarStack`, `Dialog` (odak tuzağı + odak iadesi), `Popover`, `InlineEdit`, `LabelChip`, `ConfirmDialog`, `Toaster`, `Spinner`, `EmptyState`.
- `shared/hooks`: `useAutofocus`, `useClickOutside`, `useEscape`.

---

## 7. Klasör Yapısı

```
trello-clone/
├── CLAUDE.md
├── .nvmrc                          # 22
├── docker-compose.yml              # postgres (dev: trello, test: trello_test)
├── docs/PLAN.md
├── shared/contracts/               # TS tipleri + sabitler; runtime bağımlılığı yok
│   └── src/{index, dtos, enums, realtime-events, error-codes, position}.ts
├── backend/
│   ├── .env.example
│   ├── prisma/{schema.prisma, migrations/, seed.ts}
│   ├── src/
│   │   ├── main.ts                 # helmet, CORS, cookie-parser, ValidationPipe, prefix api/v1
│   │   ├── app.module.ts
│   │   ├── config/{configuration.ts, env.validation.ts}
│   │   ├── common/
│   │   │   ├── decorators/{public, current-user, board-role, socket-id}.decorator.ts
│   │   │   ├── guards/{jwt-auth.guard.ts, board-access.guard.ts}
│   │   │   ├── filters/all-exceptions.filter.ts
│   │   │   ├── access/board-access.service.ts
│   │   │   └── ordering/ordering.service.ts
│   │   ├── prisma/{prisma.module.ts, prisma.service.ts}
│   │   ├── auth/  users/  boards/  members/  invitations/
│   │   ├── lists/  cards/  labels/  checklists/
│   │   ├── mail/                    # MVP: console logger
│   │   └── realtime/{realtime.module, realtime.gateway, realtime.service, ws-auth.middleware}.ts
│   └── test/
│       ├── utils/create-test-app.ts (vitest.config.e2e.ts backend kökünde)
│       ├── utils/{create-test-app, factories, auth-helper, socket-client}.ts
│       └── *.e2e-spec.ts
└── frontend/
    ├── index.html, vite.config.ts, playwright.config.ts   # Tailwind 4: config dosyası yok, tema src/index.css içinde
    ├── e2e/{fixtures, auth, boards, board-dnd, card-detail, invitations, realtime}.spec.ts
    └── src/
        ├── main.tsx
        ├── app/{router.tsx, providers.tsx, root-layout.tsx, protected-route.tsx, guest-route.tsx}
        ├── features/
        │   ├── auth/{api, components/{login-page, register-page, login-form, register-form}, hooks/use-auth-bootstrap.ts, schemas, store/auth-store.ts, index.ts}
        │   ├── boards/{api, components/{boards-page, board-tile, create-board-dialog}, schemas, index.ts}
        │   ├── board-detail/
        │   │   ├── api/{query-keys, use-board-query, use-list-mutations, use-card-mutations, use-label-mutations, use-member-mutations}.ts
        │   │   ├── components/{board-page, board-header, board-canvas, board-list, list-header, card-tile, add-card-composer, add-list-composer, members-panel, invite-member-dialog, labels-manager, archived-items-panel}.tsx
        │   │   ├── hooks/{use-board-dnd, use-board-realtime, use-cards-by-list}.ts
        │   │   ├── lib/{apply-board-event, get-move-anchors}.ts
        │   │   ├── store/drag-store.ts
        │   │   └── index.ts
        │   ├── card-detail/{api, components/{card-detail-dialog, card-description, card-labels-section, label-picker, due-date-section, checklist, checklist-item, card-actions}, hooks, schemas, index.ts}
        │   └── invitations/{api, components/invitation-accept-page.tsx, index.ts}
        ├── shared/{ui/, hooks/, lib/{http, socket, query-client, date}.ts, store/{ui-store, theme-store}.ts}
        ├── styles/{tokens.css, index.css}   # tema token'ları + label renkleri
        └── test/{setup.ts, msw/handlers.ts, render.tsx}
```

**Contracts paylaşımı:** `@trello/contracts` alias'ı `shared/contracts/src`'i gösterir (frontend: `vite.config` `resolve.alias` + `tsconfig` `paths`; backend: `tsconfig` `paths`). Nest build'inde path alias sorun çıkarırsa npm workspaces'e geçilir (Faz 0'da doğrulanır).

**Dev ortamı:** Vite dev server `/api` ve `/socket.io` isteklerini `localhost:3000`'e proxy'ler; böylece frontend ve API aynı origin'den çalışır, `SameSite=Strict` refresh cookie'si sorunsuz olur.

---

## 8. Geliştirme Fazları

**Her fazın bitti tanımı (DoD):** build + lint temiz; yeni unit ve e2e testler yazılmış ve **hepsi geçiyor** (`skip`/`only` yok); `code-reviewer` onayı; İngilizce conventional commit.

| Faz | Teslimatlar | Agent'lar | Testler |
|---|---|---|---|
| **0 – Kurulum** | Nest + Vite/React iskeleti (strict), Node 22 (`.nvmrc`), docker-compose, Prisma `init_schema` + seed, `shared/contracts` + `position.ts`, global ValidationPipe / exception filter / helmet / CORS / throttler, `GET /health`, Tailwind + tema token'ları (açık/koyu), ESLint/Prettier, `.env.example`, Vite proxy. CLAUDE.md'ye kesin sürümler ve komutlar yazılır. | backend-nest, frontend-react, ui-designer | `positionBetween`/`needsRebalance` unit; health e2e; App smoke testi (Vitest); Playwright smoke |
| **1 – Auth** | register/login/refresh/logout (argon2id), rotasyon + reuse tespiti, `JwtAuthGuard`, `@Public`, `/users/me`. FE: `authStore`, http client (refresh + retry), `ProtectedRoute`/`GuestRoute`, login/register formları (RHF + Zod), `useAuthBootstrap`. | backend-nest, frontend-react, ui-designer | Unit: AuthService, TokenService (rotasyon, reuse → aile iptali). E2e: kayıt→me, hatalı giriş 401, eski refresh 401, 429. FE: http 401→refresh→retry, form validasyon hataları. Playwright: kayıt→boards |
| **2 – Board + Üyeler** | Board CRUD, varsayılan etiketler, `BoardAccessGuard`, members GET/PATCH/DELETE (leave dahil). FE: BoardsPage, CreateBoardDialog, BoardPage iskeleti, board query'leri. | backend-nest, frontend-react | E2e: üye olmayana 404, MEMBER PATCH 403, OWNER silme, OWNER leave 400. Playwright: board oluştur→aç |
| **3 – Listeler** | Liste CRUD, arşiv, `OrderingService` (kilit + rebalance), `POST /lists/:id/move`. FE: BoardCanvas, yatay liste DnD, composer'lar, liste mutation'ları. | backend-nest, frontend-react | Unit: OrderingService (after/before/sona, rebalance, 409). E2e: liste sıralama; 10 paralel taşıma sonrası sıra tutarlı. FE: `useMoveList` optimistic + rollback |
| **4 – Kartlar + DnD** | Kart create/patch/archive/delete, `POST /cards/:id/move`. FE: CardTile, kart DnD (listeler arası), `getMoveAnchors`, klavye ile "Taşı…". | backend-nest, frontend-react, ui-designer | E2e: liste içi/arası taşıma, başka board'un listesi 400, silinmiş anchor 409. FE: `getMoveAnchors`, `useMoveCard` rollback. Playwright: kartı başka listeye sürükle → reload → kalıcı |
| **5 – Kart detayı** | Kart detayı, açıklama, son tarih, etiket CRUD + atama, checklist/madde CRUD/move/toggle, sayaçlar. FE: route-modal CardDetailDialog, LabelPicker, LabelsManager. | backend-nest, frontend-react, ui-designer | E2e: başka board'un etiketi 400, cascade silme, madde taşıma, sayaçlar. FE: checklist toggle'ın kart rozetine yansıması. Playwright: etiket + tarih + checklist ekle → rozetler doğru |
| **6 – Davetler** | Invitation endpoint'leri, MailService (console), InvitationAcceptPage (`returnUrl`), MembersPanel'de bekleyen davetler + iptal. | backend-nest, frontend-react | E2e: kayıtlı → doğrudan üye; kayıtsız → token; yanlış e-posta 403; süresi dolmuş/iptal 410; tekrar davet upsert. Playwright: A davet eder, B kayıt olup kabul eder |
| **7 – Realtime** | Gateway (JWT middleware, join üyelik kontrolü), RealtimeService, tüm servislerde commit sonrası emit, `X-Socket-Id` hariç tutma, çıkarılan üyenin room'dan atılması. FE: socket client, `useBoardRealtime`, `applyBoardEvent`, sürükleme sırasında kuyruk, reconnect + rejoin. | backend-nest, frontend-react | E2e (socket.io-client): A taşır → B alır, A almaz, başka board'daki C almaz; geçersiz token → disconnect. FE: her event için `applyBoardEvent` (idempotent). Playwright: iki browser context |
| **8 – Cilalama** | Boş/yükleme/hata durumları, toast'lar, erişilebilirlik turu, responsive (mobilde tek sütun + snap), arşiv paneli, 409 UX, güvenlik turu, README. | ui-designer, frontend-react, tester, code-reviewer | Tam suite yeşil; Playwright + axe (kritik ihlal yok); güvenlik checklist'i |

Her fazdaki akış: **backend-nest (API + e2e) → frontend-react (+ ui-designer) → tester → code-reviewer**.

---

## 9. Test Planı

**Backend unit (Vitest, Prisma mock)**
- `position.ts`: dört kenar durumu; ~30 ardışık ara eklemeden sonra `needsRebalance` true.
- `OrderingService`: anchor çözümü, `afterId` önceliği, 409, rebalance sonrası `GAP*(i+1)`, id sıralı kilitleme.
- `TokenService`: rotasyon, reuse, süresi dolmuş token. `AuthService`: argon2 hash/verify.
- `BoardAccessService`, `InvitationsService` (kayıtlı/kayıtsız dalı, e-posta normalizasyonu), `MembersService` (OWNER korumaları).

**Backend e2e (Supertest + ayrı test DB)**
- Her controller: mutlu yol, 400 (whitelist), 401, 404 (üye değil), 403 (rol).
- Sıralama: taşımalardan sonra `GET /boards/:id` sırası doğru; 20 paralel taşıma → deadlock yok, sıra tutarlı; zorla rebalance sonrası sıra korunuyor.
- Cascade: board silinince alt kayıtlar yok; liste silinince kartları yok.
- Realtime: Faz 7 senaryoları; payload'lar contracts tipleriyle uyumlu.

**Frontend unit/integration (Vitest + RTL + MSW)**
- `applyBoardEvent`: her event tipi; aynı event iki kez → state değişmez.
- `getMoveAnchors`: liste başı/sonu/ortası, boş liste, listeler arası.
- Mutation hook'ları (`renderHook`): optimistic güncelleme, hata → rollback, 409 → invalidate.
- `http.ts`: 401'de tek refresh, paralel isteklerin beklemesi, refresh başarısızsa logout.
- `ProtectedRoute` / `GuestRoute` yönlendirmeleri.
- Formlar: Zod hata mesajları görünür ve `aria-describedby` ile bağlı.
- Kart detayı: checklist toggle → board cache'indeki `checklistDone` güncellenir.

**Playwright e2e**
- Kayıt → board → 2 liste → 3 kart → kartı listeler arasında sürükle (fare ve klavye) → reload → sıra kalıcı.
- Liste sıralama, arşivleme/geri alma.
- Kart detayı: açıklama, etiket, son tarih, checklist yüzdesi karttaki rozette.
- Davet: kayıtlı kullanıcı anında üye; kayıtsız kullanıcı link → kayıt → kabul.
- Realtime: iki context; A'nın değişikliği B'de reload olmadan görünür; A, B'yi çıkarınca B yönlendirilir.
- Yetki: MEMBER'da "Board'u sil" görünmez ve API 403 döner.

---

## 10. Riskler & Açık Sorular

**Riskler**
1. **Sürükle-bırak ve realtime çakışması:** sürükleme sırasında gelen event'ler dnd-kit'in gördüğü listeyi değiştirebilir → `dragStore` kuyruğu, bırakma sonrası uygulama.
2. **Optimistic update ve refetch yarışı:** taşıma sırasında başlayan bir refetch optimistic state'i ezebilir → `onMutate`'te `cancelQueries`, `onSettled`'da invalidate.
3. **Kart düzenlemede last-write-wins:** eşzamanlı açıklama düzenlemesinde biri kaybolur; MVP'de kabul. Sonraki adım: `updatedAt` ile 409.
4. **Float hassasiyeti:** rebalance ile çözülüyor.
5. **Kilitleme:** `FOR UPDATE` aynı listedeki taşımaları seri hale getirir; MVP trafiğinde sorun değil, deadlock id sıralı kilitle önleniyor.
6. **Refresh cookie / CORS:** dev'de Vite proxy ile aynı origin. Prod'da da reverse proxy ile aynı origin önerilir; farklı domain olursa `SameSite=None` + CSRF önlemi gerekir.
7. **Süresi dolan access token ile açık socket:** yeniden bağlanmada yeni token; üye çıkarma, socket'lerin room'dan atılmasıyla güvence altında.
8. **Davet linki sızması:** token + e-posta eşleşmesi, 7 gün TTL, iptal edilebilir, hash olarak saklanıyor.
9. **Contracts paylaşımı:** Vite ve Nest build'lerinde path alias Faz 0'da doğrulanmalı; sorun olursa npm workspaces.
10. **Erişilebilir dialog/popover:** odak tuzağı, odak iadesi ve popover konumlandırmayı elle yazmak hataya açık. Faz 0'da headless bir kütüphane (ör. Radix UI) eklenmesi değerlendirilmeli.

**Açık sorular (varsayımlar parantez içinde)**
1. OWNER devri MVP'de gerekli mi? (Hayır.)
2. Board arşivleme mi silme mi? (Sadece kalıcı silme; liste ve kartlarda arşiv var.)
3. MEMBER kalıcı liste silebilir mi? (Hayır, ADMIN+; kart silme MEMBER'a açık.)
4. Etiket CRUD'u MEMBER'a açık mı? (Evet, Trello gibi.)
5. Gerçek e-posta gönderimi ne zaman? (MVP sonrası; şimdilik `inviteUrl` response'ta.)
6. Board arka planları sabit bir set mi? (Evet: `blue|green|orange|red|purple|pink|lime|sky|grey`, tema token'larına bağlı.)
7. Son tarih saat dilimi: UTC saklanır, kullanıcının yerel saatinde `tr-TR` formatıyla gösterilir; hatırlatma kapsam dışı.
8. Headless UI kütüphanesi (Radix vb.) teknoloji setine eklensin mi? (Öneri: evet, sadece dialog/popover/menu için.)
