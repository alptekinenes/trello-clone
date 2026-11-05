# Faz 13 — Gezinme: Yıldızlı panolar, Inbox, Planlayıcı, Kartlarım, panolar arası taşıma

> `architect` rolüyle hazırlandı (2026-11-05). Kurallar: `CLAUDE.md`. Taslak: `docs/trello-parity-roadmap.md` §3 "Faz 13" ve §5. Desen: `docs/phase-10-card-members.md`, `docs/phase-11-comments-activity.md`.
> Metin Türkçe; kod, dosya ve tanımlayıcı adları İngilizce.

**Önkoşul:** Faz 12 (ekler) bitti ve `docs/phase-12-attachments.md` uygulandı. Bu plan Faz 12'de `Attachment { cardId, boardId, ... }` ve `Card.coverAttachmentId` olacağını varsayar. Faz 12 başka bir `boardId` taşıyan kart tablosu eklerse §4.4'teki DMMF testi bunu yakalar.

## 1. Özet

**Kapsam içi**
- Pano yıldızlama; panolar sayfasında "Yıldızlı panolar" bölümü, pano başlığında yıldız düğmesi, pano değiştiricide yıldızlılar önde.
- Kullanıcı başına gizli **Inbox** panosu (tek liste). İlk istekte tembel olarak oluşturulur.
- Panolar arası kart taşıma (Inbox ↔ pano, pano ↔ pano): kart penceresindeki taşıma seçicisinde pano seçimi.
- **Planlayıcı** (haftalık, pazartesi başlar) ve **Kartlarım** sayfaları.
- Alt gezinme çubuğuna "Inbox" ve "Planlayıcı" eklenir.

**Kapsam dışı:** Pano sayfasında sol Inbox paneli ve panolar arası sürükle-bırak (§9'da ertelenebilir), Planlayıcıda sürükleyerek tarih değiştirme, aylık görünüm, Planlayıcı/Kartlarım için canlı güncelleme, takvim entegrasyonu, arama (Faz 14).

**Taslaktan sapmalar**
| Taslak | Bu plan | Neden |
|---|---|---|
| `model BoardStar { userId, boardId }` | `BoardMember.starredAt DateTime?` | Anahtarı `BoardMember`'ınkiyle aynı olurdu, yani zaten 0..1 bir uzantı. Üyelik silinince yıldız da gider, `GET /boards` join yapmaz, tablo eklenmez. |
| Kaynak room'a `card:deleted` | Yeni `card:transferred { id, fromListId, toBoardId }` | Açık kart penceresi "silindi" yerine "başka panoya taşındı" diyebilir. Pano önbelleği için davranış aynı. |
| `GET /users/me/inbox` Inbox içeriğini döner | Yalnızca Inbox'ın `BoardSummaryDto`'sunu döner (gerekirse oluşturur) | İçerik zaten `GET /boards/:id` ile geliyor. Inbox normal bir pano olduğu için kart, kart penceresi, sürükle-bırak ve realtime ek kod gerektirmeden çalışır. |

## 2. Veritabanı şeması

```prisma
model Board {
  // ... mevcut alanlar
  /// Set only on a user's private Inbox board; one per user.
  inboxOwnerId String? @unique @db.Uuid
  inboxOwner   User?   @relation("InboxOwner", fields: [inboxOwnerId], references: [id], onDelete: Cascade)
}

model BoardMember {
  // ... mevcut alanlar
  /// When this member starred the board; null means not starred. Gone with the membership.
  starredAt DateTime?
}

model User {
  // ... mevcut alanlar
  inbox Board? @relation("InboxOwner")
}

enum ActivityType {
  // ... mevcut 8 değer
  CARD_TRANSFERRED
}
```

- Migration: `npm run prisma:migrate -w backend -- --name navigation_inbox_and_stars`. Yalnızca ekleme yapar (iki nullable kolon, unique index, FK, enum değeri). Backfill yok.
- Index: `inboxOwnerId` için `@unique` yeterli. `starredAt` için index gerekmez (sorgular `BoardMember.userId` index'inden gelir). Planlayıcı için yeni kart index'i eklenmez: sorgu `CardMember [userId, boardId]` index'inden başlar; Inbox kolu `Card [boardId]` index'ini kullanır.
- `test/utils/database.ts` değişmez.

## 3. Contracts (`@trello/contracts`)

```ts
// boards.ts — BoardSummaryDto
starred: boolean;   // the current user's star; per user, never broadcast
isInbox: boolean;   // true only for GET /users/me/inbox and GET /boards/:id of the Inbox
export const INBOX_TITLE = 'Inbox';

// realtime-events.ts
export type BoardInfoDto = Omit<BoardSummaryDto, 'myRole' | 'starred'>;
// BoardEventMap
'card:transferred': { id: string; fromListId: string; toBoardId: string };
// UserEventMap
'board:star-updated': { boardId: string; starred: boolean };

// cards.ts
export interface MoveCardRequest extends CardAnchors {
  listId: string;
  /** Target board; default is the card's board. Another board drops labels and card members. */
  boardId?: string;
}
// MoveCardResponse: + boardId: string

// activity.ts — ActivityType + ActivityDataMap
export interface BoardRefData { id: string; title: string; inbox: boolean }
CARD_TRANSFERRED: { cardTitle: string; fromBoard: BoardRefData; fromList: ListRef; toList: ListRef };

// user-cards.ts (yeni, index.ts'ten dışa açılır)
export interface UserCardDto {
  id: string; title: string; boardId: string; boardTitle: string; boardIsInbox: boolean;
  listId: string; listTitle: string; dueDate: string | null; dueComplete: boolean; completedAt: string | null;
}
export interface UserCardListDto { cards: UserCardDto[]; truncated: boolean }
export const USER_CARD_LIMITS = { MAX: 500, PLANNER_MAX_DAYS: 42 } as const;
export interface PlannerQuery { from: string; to: string }   // ISO 8601, [from, to)
```

Yeni hata kodu yoktur.

## 4. Backend

### 4.1 Yetki ve Inbox kısıtları
- `BoardAccessService.requireRole` üyelik sorgusunda `board.inboxOwnerId`'yi de seçer (ek sorgu yok) ve `{ role, isInbox }` döner. Guard bunu `request.boardAccess`'e yazar.
- Yeni `@NoInbox()` dekoratörü: guard, Inbox panosunda **403 `FORBIDDEN`** ("Bu işlem Inbox'ta yapılamaz") fırlatır (`access.errors.ts` → `inboxRestricted()`). Eklendiği yerler:
  - boards `PATCH`, `DELETE`, star `PUT`/`DELETE`
  - invitations `POST`/`GET`/`DELETE` (`boards/:boardId/invitations`)
  - members `PATCH`/`DELETE`
  - lists `POST`, `PATCH`, `POST move`, `DELETE`
  - labels `POST` (Inbox'ta etiket yok; atama zaten `LABEL_NOT_IN_BOARD` verir)
- Inbox'a yalnızca sahibi erişir: tek üyesi sahibidir (OWNER), davet oluşturulamaz. Başkası için normal kural geçerli: **404**. Inbox silinemez; kullanıcı silinirse FK cascade ile gider (hesap silme yok).
- Kartlar, checklist'ler, yorumlar, ekler, kart üyeliği (yalnızca kendisi), izleme, arşiv Inbox'ta normal çalışır.

### 4.2 Inbox oluşturma (`users/inbox.service.ts`)
`ensureInbox(userId)`:
1. `board.findUnique({ where: { inboxOwnerId: userId } })` varsa döner.
2. Yoksa tek nested `board.create`: `title: INBOX_TITLE`, `inboxOwnerId`, `members: { create: { userId, role: 'OWNER' } }`, `lists: { create: { title: INBOX_TITLE, position: <ilk pozisyon, position.ts> } }`. Etiket oluşturulmaz.
3. `P2002` (`inboxOwnerId` hedefli) gelirse yarışı başka istek kazanmıştır: `findUniqueOrThrow` ile okunur.
- Yayın yok (`membership:added` gönderilmez, Inbox panolar listesinde yer almaz).
- Hariç tutma: `BoardsService.listForUser` → `where: { userId, board: { inboxOwnerId: null } }`. `starred` aynı satırdan (`starredAt !== null`). Arama Faz 14'te aynı filtreyi almalı (riskler).

### 4.3 Yıldız
| Method + path | Yetki | Başarı | Hatalar |
|---|---|---|---|
| `PUT /api/v1/boards/:boardId/star` | `@BoardRole('MEMBER') @NoInbox()` | 204, idempotent. `updateMany({ where: { boardId, userId, starredAt: null }, data: { starredAt: now } })` | 404 üye değil, 403 Inbox |
| `DELETE /api/v1/boards/:boardId/star` | aynı | 204, idempotent (`starredAt: null`) | aynı |
- Commit sonrası `toUsers([userId], boardId, origin, { type: 'board:star-updated', data })` (isteği yapan sekme hariç). Pano room'una gönderilmez.
- `BoardsService.create` ve `membership:added` özetleri `starred: false, isInbox: false`. `getDetail` kendi `starredAt`'ini okur.

### 4.4 Panolar arası taşıma (`POST /api/v1/cards/:cardId/move`)
- `MoveCardDto`'ya `@IsOptional() @IsUUID() boardId`. `boardId` yoksa ya da kaynak panoya eşitse mevcut `move` yolu değişmeden çalışır.
- **Yetki:** guard kaynağı `:cardId` üzerinden MEMBER olarak doğrular (değilse 404 `NOT_FOUND`). Hedef için servis `access.requireRole(boardId, userId, 'MEMBER', boardNotFound)` çağırır: üye değilse (başkasının Inbox'ı dahil) **404 `NOT_FOUND`**. Hedef liste o panoda yok ya da arşivli: **400 `INVALID_TARGET`**. Arşivli kart: 400 `INVALID_TARGET`. Kilit beklerken kart başka listeye gitti: 409 `POSITION_CONFLICT`; başka panoya gitti ya da silindi: 404.
- **Transaction** (`CardsService.transfer`, tek `$transaction`):
  1. Kart kaynakta okunur (`findOnBoard`).
  2. `lockBoards(tx, [src, dst])`: yeni yardımcı (`ordering/locks.ts`), iki pano satırı **id sırasıyla** `FOR NO KEY UPDATE`. Hedef yoksa 404. Sıra Board → List → Card korunur: aynı panoda kart taşıma pano kilidi almadığı ve liste yazımları da önce panoyu kilitlediği için döngü oluşmaz. Pano silme (`lockBoard` → delete) taşımayı bekler; aksi halde silmenin `FOR UPDATE`'i ile kartın FK kontrolündeki `KEY SHARE` arasında deadlock olurdu.
  3. Hedef üyelik kilit altında yeniden okunur (yarışta çıkarılmışsa 404).
  4. `lockLists` genelleştirilir: `boardIds[]` alır, `boardId`'yi de seçer, sonuç yine id sırasıyla kilitlenir. Kaynak liste ve hedef liste tek sorguda kilitlenir; hedef listenin `boardId === dst` olduğu doğrulanır.
  5. Kart kilit altında yeniden okunur (`listId` değiştiyse 409).
  6. `place(tx, targetListId, cardId, anchors)`: mevcut kesirli pozisyon + rebalance.
  7. Bağlı kayıtlar (tablo §4.5).
  8. `card.update({ boardId: dst, listId, position })` → `CARD_SELECT` → özet (`labelIds: []`, `memberIds: []`).
  9. `activity.record(tx, { boardId: dst, cardId, actorId }, [CARD_TRANSFERRED { cardTitle, fromBoard, fromList, toList }])`.
- **Yayın (commit sonrası, bu sırayla):**
  - `toBoard(src)`: `card:transferred { id, fromListId, toBoardId }`.
  - `toBoard(dst)`: `position:rebalanced` (gerekirse), `card:created` (özet), `activity:created`.
  - Düşen izleyicilerin her biri için `toUsers([userId], src, …, card:watch-updated { cardId, watching: false })`.
- Yanıt: `MoveCardResponse` + `boardId`; `rebalanced` hedef listeyi anlatır.

### 4.5 Bağlı kayıtlar
| Kayıt | Karar | Uygulama |
|---|---|---|
| Etiketler (`CardLabel`) | **Düşer** (§5 kararı; etiketler panoya ait) | `cardLabel.deleteMany({ cardId })` |
| Kart üyeleri (`CardMember`) | **Düşer** (§5 kararı) | `cardMember.deleteMany({ cardId })`. Bileşik FK kaynak üyeliğe bağlı olduğu için bırakılırsa yanlış panoyu gösterirdi. |
| İzlemeler (`CardWatch`) | Hedef panonun üyesi olan izleyiciler kalır, diğerleri düşer | `deleteMany({ cardId, userId: { notIn: dstMemberIds } })` (silinenlerin `userId`'leri önce okunur), sonra `updateMany({ cardId }, { boardId: dst })`. Bileşik FK yeni üyeliğe geçer. |
| Yorumlar | Kartla gider | `comment.updateMany({ cardId }, { boardId: dst })`. Hedefte üye olmayan yazarların yorumları kalır, düzenleyemezler (Faz 11 kuralı). `commentCount` değişmez. |
| Etkinlikler | Kartla gider (geçmiş korunur) | `activity.updateMany({ cardId }, { boardId: dst })`. Eski kayıtlardaki liste adları kopya olduğu için geçerli kalır. |
| Ekler (Faz 12) | Kartla gider; depodaki dosyaya dokunulmaz | `attachment.updateMany({ cardId }, { boardId: dst })`. `storageKey` opaktır (uuid), taşınmaz. Hedefte üye olmayan yükleyici silemez; ADMIN+ silebilir. |
| Kapak (`coverAttachmentId`, `coverColor`) | Kalır | Ek aynı kartta kaldığı için geçerli. |
| Checklist ve maddeler | Kalır | `cardId` ile bağlı, işlem yok. |
| Son tarih, tamamlanma, açıklama | Kalır | — |

- **DMMF koruma testi** (`cards/card-transfer.spec.ts`): `Prisma.dmmf.datamodel.models` içinde hem `cardId` hem `boardId` alanı olan modeller, `transfer`'ın işlediği sabit listeyle (`CARD_BOARD_SCOPED_MODELS = ['CardMember','CardWatch','Comment','Activity','Attachment']`) birebir eşleşmeli. İleride eklenen bir tablo bu testi kırar.

### 4.6 Planlayıcı ve Kartlarım (`users/user-cards.controller.ts`, `@Controller('users/me')`)
JWT zorunlu; `:boardId` olmadığı için `@BoardRole` kullanılmaz. Erişim sorgunun kendisinde kurulur: `CardMember` satırı üyelik FK'sı gerektirir, Inbox kolu `inboxOwnerId = me` ile sınırlıdır.

| Method + path | Sorgu | Başarı | Hatalar |
|---|---|---|---|
| `GET /api/v1/users/me/inbox` | — | 200 `BoardSummaryDto` (`isInbox: true`), gerekirse oluşturur | — |
| `GET /api/v1/users/me/planner` | `from`, `to` (ISO 8601, `@IsISO8601({ strict: true })`), `to > from`, en fazla 42 gün | 200 `UserCardListDto`. Kartlar: `dueDate ∈ [from, to)`, arşivsiz kart ve liste; **(bana atanmış) VEYA (benim Inbox'ımda)**. Tamamlananlar dahil. Sıra `dueDate asc, id asc` | 400 `VALIDATION_FAILED` |
| `GET /api/v1/users/me/cards` | — | 200 `UserCardListDto`. Bana atanmış, arşivsiz kart ve listedeki kartlar (Inbox dahil, özel durum yok). Tamamlananlar dahil. Sıra `dueDate asc nulls last, id asc` | — |

- Sayfalama yok: en fazla 500 kart, aşılırsa `truncated: true` (arayüz "İlk 500 kart gösteriliyor." yazar). Tek sorgu, `board`/`list` alanları `select` ile; N+1 yok.
- `UsersModule` → `user-cards.service.ts`, `inbox.service.ts`, `dto/planner-query.dto.ts`.

## 5. Frontend

### 5.1 Routing (lazy, `ProtectedRoute` altında)
- `/inbox` → `features/inbox` `InboxRedirect`: `useInbox()` (`GET /users/me/inbox`) → `<Navigate replace to="/boards/:inboxId">`. Yüklenirken ve hatada mevcut sayfa durum bileşenleri.
- `/planner` → `features/planner` `PlannerPage` (`?week=YYYY-MM-DD`, pazartesi; yoksa bu hafta).
- `/my-cards` → `features/my-cards` `MyCardsPage`.
- Inbox kartı: `/boards/:inboxId/c/:cardId` (mevcut kart penceresi; değişiklik yok).

### 5.2 Inbox görünümü (masaüstü ve mobil aynı: ayrı sayfa)
- `BoardPage`, `detail.board.isInbox` iken:
  - Başlık "Inbox" (düzenlenemez); yıldız, Paylaş ve pano menüsü yok; yalnızca "Arşiv" düğmesi (`ArchiveDialog`, kartlar sekmesi).
  - `BoardCanvas` tek liste çizer: liste menüsü, liste tutamağı ve "Başka liste ekle" yok. Kart sürükle-bırak (fare + klavye) ve "Kart ekle" aynen çalışır.
  - Sütun masaüstünde `max-w` sabit ve ortalı; 640 px altında tam genişlik (scroll-snap gerekmez).
- Sol panel (Trello'daki gibi pano yanında) ertelenir (§9).

### 5.3 Alt gezinme çubuğu (`features/boards/components/navigation-bar.tsx`)
- `<nav aria-label="Gezinme">`: "Inbox" (`/inbox`), "Planlayıcı" (`/planner`), "Pano" (son açılan normal pano; yoksa gösterilmez), "Pano değiştir" (mevcut `BoardSwitcher` menüsü). Etkin olan `aria-current="page"`.
- Son pano id'si: `features/boards/store/last-board-store.ts` (Zustand, yalnızca bellekte). `BoardPage` normal panoda yazar.
- Çubuk pano, Inbox ve Planlayıcı sayfalarında görünür. Dokunmatikte 44 px; 320 px'te dört düğme sığmazsa metinler ikon + `sr-only` olur (ui-designer).
- `BoardSwitcher`: "Yıldızlı panolar" grubu önce, sonra "Panolarım" (yıldızlılar tekrar edilmez).

### 5.4 Yıldız
- `features/boards/api/use-star-board.ts`: `PUT`/`DELETE`; `onMutate` `boardKeys.list()` ve `boardKeys.detail(id)` önbelleklerinde `starred`'ı çevirir, `onError` geri alır, `onSettled` invalidate.
- `StarButton` (`features/boards/components/star-button.tsx`, `index.ts`'ten dışa açılır): ikon düğmesi, sabit ad "Panoyu yıldızla" + `aria-pressed`. Pano başlığında (`board-header.tsx`) ve pano kutucuğunda (üzerine gelince/odakta görünür, dokunmatikte her zaman).
- `BoardsPage`: yıldızlı pano varsa en üstte `<section aria-labelledby>` h2 "Yıldızlı panolar", altında "Panolarım" (tümü).
- `use-board-list-realtime.ts`: `board:star-updated` → iki önbelleği günceller.

### 5.5 Kart penceresinde taşıma
- `card-detail-header.tsx` liste seçici düğmesi kalır ("Liste: X ▾"); menünün sonuna "Başka panoya taşı…" eklenir. Seçilince `CardMoveDialog` açılır (`shared/ui/Dialog`):
  - React Hook Form + Zod (`cardMoveSchema`: `boardId`, `listId` uuid).
  - `<select>` "Pano": Inbox (`useInbox`) + `useBoards()` (yıldızlılar önce); mevcut pano seçili.
  - `<select>` "Liste": `GET /boards/:id/lists` (`use-board-lists.ts`, yeni query `boardKeys.lists(id)`), arşivsiz listeler. Inbox seçiliyse tek liste olduğu için gizlenir ve otomatik seçilir.
  - Kart listenin sonuna gider (anchor gönderilmez). Hedef farklı panoysa uyarı metni: "Etiketler ve kart üyeleri bu panoda kalmaz." (`aria-describedby`).
  - Yalnızca hedef pano/liste kaynakla aynıysa "Taşı" pasif.
- `hooks/use-move-card-to-board.ts` (`mutationKey: boardMutationKey(srcBoardId)`):
  - `onMutate`: kaynak pano önbelleğinden kart çıkarılır, önceki değer saklanır.
  - `onError`: geri alınır; hata pencerede gösterilir (404 → "Bu panoya erişimin yok.", 400 → "Hedef liste artık kullanılamıyor.").
  - `onSuccess`: hedef pano detayı, `['me']` önbellekleri invalidate; pencere kapanır; odak kaynak listenin "Kart ekle" düğmesine; canlı bölge duyurusu "Kart “{pano}” panosuna taşındı."
- Pano karolarındaki `CardActionsDialog` aynı pano içi taşımada kalır (ertelenebilir genişletme).

### 5.6 Açık kart penceresi olan diğer kullanıcı
- `apply-board-event.ts`: `card:transferred` → kartı pano önbelleğinden siler (`card:deleted` ile aynı yol).
- `use-card-realtime.ts`: açık kart için `card:transferred` gelirse kart detay sorgusu durdurulur (yeniden çekilip otomatik yönlendirmesin) ve card-detail store'a `gone: 'transferred'` yazılır. Pencere `card-detail-alert.tsx` ile "Bu kart başka bir panoya taşındı." gösterir; kullanıcı `useBoards` önbelleğinde `toBoardId`'yi görüyorsa "Karta git" bağlantısı (`/boards/:toBoardId/c/:id`), yoksa yalnızca "Kapat". Kaydedilmemiş açıklama metni kaybolur (riskler).
- `describe-activity.ts`: `CARD_TRANSFERRED` → "bu kartı {pano} panosundan {liste} listesine taşıdı"; `fromBoard.inbox` ise "bu kartı Inbox'tan {liste} listesine taşıdı".

### 5.7 Planlayıcı (`features/planner`)
- Haftalık görünüm, hafta pazartesi başlar. `shared/lib/date.ts`'e `startOfWeekMonday(date)` ve `formatWeekRange` (`tr-TR`, ör. "2–8 Kasım 2026").
- `api/use-planner.ts`: key `['me', 'planner', { from, to }]`; `from`/`to` yerel pazartesi 00:00 ve sonraki pazartesi 00:00'ın ISO değeri. `staleTime` 30 sn, `placeholderData: keepPreviousData`.
- Düzen: `lg:` ve üstünde 7 sütun ızgara; altında dikey gün bölümleri. Her gün `<section aria-labelledby>` h2 "Pazartesi, 2 Kasım" (bugün "Bugün" rozeti). Kartlar bağlantıdır (`/boards/:boardId/c/:id`), başlık + pano/liste adı + mevcut son tarih rozeti. Boş gün "Kart yok".
- Gezinme: "Önceki hafta", "Bu hafta", "Sonraki hafta" düğmeleri URL'i günceller; h1 "Planlayıcı", hafta aralığı `aria-live="polite"`.

### 5.8 Kartlarım (`features/my-cards`)
- `api/use-my-cards.ts`: key `['me', 'cards']`. Panoya göre gruplanır (Inbox ilk), her grup h2 + `<ul>`. "Tamamlananları göster" anahtarı (`useState`, varsayılan kapalı). Giriş: hesap menüsüne "Kartlarım" öğesi ve panolar sayfası başlığında bağlantı.

### 5.9 Erişilebilirlik
- Yeni sayfalar ve `CardMoveDialog` `e2e/a11y.spec.ts`'e (açık + koyu, 320 px): Inbox, Planlayıcı, Kartlarım, taşıma penceresi, panolar sayfası (yıldızlı bölüm dolu).
- Tüm akışlar klavyeyle: yıldız `aria-pressed`, native `select`'ler, gün bölümleri başlık gezintisiyle.

## 6. Commit sırası ve ajanlar

Her commit tek başına yeşil olmalı (build, typecheck, lint, unit). Contracts değişip frontend derlemesini kıran commit'ler derleme düzeltmelerini de içerir. Playwright en sonda bir kez.

| # | Commit | Ajan | İçerik |
|---|---|---|---|
| C1 | `feat(api): board stars and private inbox` | backend-nest (+ frontend-react derleme) | Şema + migration (üç değişiklik birlikte, enum dahil), contracts: `starred`, `isInbox`, `BoardInfoDto`, `board:star-updated`, `user-cards.ts` (yalnızca tipler; C4 için hazır), `CARD_TRANSFERRED` tipi. `@NoInbox`, guard, `ensureInbox`, `GET /users/me/inbox`, star uç noktaları, `listForUser` filtresi. Frontend: fixture'lar (`starred: false, isInbox: false`), `describe-activity` için `CARD_TRANSFERRED` case'i, `board:star-updated` için boş handler. |
| C2 | `feat(api): move cards across boards` | backend-nest (+ frontend-react derleme) | `lockBoards`, genelleştirilmiş `lockLists`, `transfer`, §4.5, `card:transferred` + `MoveCardRequest.boardId`/`MoveCardResponse.boardId`. Frontend: `apply-board-event` `card:transferred` case'i (silme gibi). |
| C3 | `feat(api): planner and my cards endpoints` | backend-nest | §4.6 (contracts C1'de geldiği için yalnızca `backend/src/users/` ve yeni e2e dosyası). |
| C4 | `feat(boards): star boards` | frontend-react | §5.4 + `BoardSwitcher` grupları. |
| C5 | `feat(navigation): inbox view and navigation bar` | frontend-react (+ ui-designer 320 px düzeni) | `/inbox` route'u, `BoardPage` Inbox modu, `navigation-bar.tsx` ("Inbox", "Pano", "Pano değiştir"), `last-board-store.ts`. |
| C6 | `feat(card-detail): move a card to another board` | frontend-react | §5.5, §5.6. |
| C7 | `feat(planner): planner and my cards pages` | frontend-react (+ ui-designer) | §5.7, §5.8, `/planner` ve `/my-cards` route'ları, çubuğa "Planlayıcı" düğmesi, hesap menüsü öğesi. |
| C8 | `test(e2e): navigation, inbox and cross-board moves` | tester | §7 Playwright + a11y. |
| C9 | `docs: record phase 13` | — | `docs/PLAN.md` ilerleme satırı; tam test turu, sonra code-reviewer. |

**Paralel yürütülebilir (dosya çakışması yok):**
- **C2 ∥ C3:** C2 `cards/`, `ordering/`, `activity/`, `realtime-events.ts`, `cards.ts`; C3 yalnızca `users/` ve `test/user-cards.e2e-spec.ts`. Contracts C1'de tamamlandığı için ortak dosya yok.
- **C6 ∥ C7:** C6 `features/card-detail/`, `board-detail/lib/apply-board-event.ts`; C7 `features/planner/`, `features/my-cards/`, `app/routes.tsx`, `features/boards/components/navigation-bar.tsx`, `features/auth/components/account-menu.tsx`. C6 bu dosyaların hiçbirine dokunmaz.
- Sıralı olmalı: C1 → (C2, C3) → C4 → C5 → (C6, C7) → C8. C4 ve C5 aynı `board-switcher.tsx`/`board-header.tsx`'e dokunur.
- Not: kullanıcı belleğindeki token ekonomisi kuralına göre varsayılan tek ajanla sıralı yürütmedir; paralellik yalnızca istenirse.

## 7. Test planı

**Backend unit**
- `board-access.guard.spec.ts`: `@NoInbox` → 403; Inbox olmayan pano geçer; `isInbox` sorgusu ek sorgu yapmaz.
- `inbox.service.spec.ts`: var olanı döner; P2002 sonrası okur; diğer hatalar yukarı çıkar.
- `cards.service.spec.ts` (`transfer`): kilit sırası (`lockBoards` id sırası, sonra listeler), hedef üye değil → 404, hedef liste başka panoda → 400, arşivli kart → 400, liste değişti → 409, bağlı kayıt sorguları, yayın sırası ve odalar, düşen izleyicilere `card:watch-updated`.
- `card-transfer.spec.ts`: DMMF koruma testi.
- `planner-query.dto.spec.ts`: `to <= from`, 43 gün, bozuk tarih → 400.
- Prisma `ActivityType` ↔ contracts eşitlik testi (mevcut) yeni değeri kapsar.

**Backend e2e (Supertest)**
- `test/stars.e2e-spec.ts`: PUT/DELETE idempotent; `GET /boards` `starred`; panodan çıkarılınca yıldız gider; Inbox'ta 403; yabancı 404; `board:star-updated` yalnızca kullanıcı room'una.
- `test/inbox.e2e-spec.ts`: ilk istek oluşturur, ikinci aynı id; **iki eşzamanlı istek tek Inbox**; `GET /boards`'ta yok; davet/üye/liste/pano güncelleme ve silme 403; başka kullanıcı `GET /boards/:inboxId` 404; Inbox'ta kart oluşturma, taşıma, yorum çalışır.
- `test/card-transfer.e2e-spec.ts`: pano → pano ve Inbox → pano mutlu yol; etiket ve kart üyeleri düşer; yorum, etkinlik, checklist, ek ve kapak kartla gider (hedef panodan `feed`, ek URL'i erişilebilir; kaynak panodan 404); izleyiciler kural tablosuna göre; `CARD_TRANSFERRED` kaydı; hedefte üye değil → 404; başkasının Inbox'ı → 404; arşivli hedef liste → 400; **iki zıt yönlü eşzamanlı taşıma (A→B ve B→A kartları) deadlock'suz biter**; aynı kartı iki panoya eşzamanlı taşıma: biri 200, diğeri 404; taşıma ile pano silme eşzamanlı: 500 yok.
- `realtime-events.e2e-spec.ts`: kaynağa `card:transferred`, hedefe `card:created` → `activity:created`; isteği yapan socket'e gitmez; kaynak-only üyeye hedef event'leri sızmaz (`expectNoLeak`).
- `test/user-cards.e2e-spec.ts`: planlayıcı aralık sınırları (`from` dahil, `to` hariç), atanmamış kart yok, Inbox kartı var, arşivli kart/liste yok, panodan çıkarılınca kartlar gider; Kartlarım sıra ve `truncated`.

**Frontend unit (Vitest + RTL + MSW)**
- `star-button.test.tsx` (iyimser çevirme, hata geri alma), `boards-page.test.tsx` (yıldızlı bölüm), `board-switcher.test.tsx` (gruplar), `use-board-list-realtime.test.tsx`.
- `navigation-bar.test.tsx` (`aria-current`, son pano), `board-page.test.tsx` Inbox modu (liste denetimleri yok), `inbox-redirect.test.tsx`.
- `card-move-dialog.test.tsx` (Inbox'ta liste seçici gizli, uyarı metni, 404 hata metni, başarıda odak ve duyuru), `apply-board-event.test.ts`, `use-card-realtime.test.tsx` (`transferred` uyarısı, "Karta git" yalnızca erişilebilir panoda), `describe-activity.test.ts`.
- `planner-page.test.tsx` (pazartesi başlangıcı, hafta gezintisi URL'i, gün gruplama, saat dilimi sınırı), `date.test.ts`, `my-cards-page.test.tsx` (gruplar, tamamlanan anahtarı, `truncated` notu).

**Playwright**
- `e2e/navigation.spec.ts`: yıldızla → panolar sayfasında "Yıldızlı panolar"; Inbox'a kart ekle → kart penceresinden panoya taşı → panoda görünür, Inbox'ta yok, yenilemeden sonra da; Planlayıcıda son tarihli atanmış kart doğru günde; Kartlarım'dan karta git.
- `e2e/realtime.spec.ts`: B kaynak panoda kartı açıkken A taşır → B "başka bir panoya taşındı" uyarısını görür, kart B'nin panosundan kalkar.
- `e2e/a11y.spec.ts`: §5.9'daki ekranlar.

## 8. Riskler

- **Eşzamanlılık:** Panolar arası taşıma iki pano satırını id sırasıyla kilitler, ardından listeleri id sırasıyla. Mevcut sıra Board → List → Card bozulmaz; aynı pano içi taşımalar pano kilidi almaz. Bedel: taşıma süresince iki panoda liste yazımları (liste ekleme/taşıma) kısa süre bekler. Kabul edilebilir.
- **Bilgi açığa çıkması:** Taşınan kartın yorumları, etkinlikleri, ekleri ve `CARD_TRANSFERRED` içindeki kaynak pano adı hedef pano üyelerine görünür olur (Trello davranışı). `card:transferred` kaynak üyelerine yalnızca hedef pano id'sini verir (erişim sağlamaz). Pencere uyarısı kullanıcıyı bilgilendirir.
- **Unutulan tablo:** Faz 12 ya da sonrası `boardId`'li yeni kart tablosu eklerse guard yanlış panoyu görür. DMMF testi bunu derleme zamanına yakın yakalar.
- **Inbox sızıntısı:** Inbox'ı listeleyen her yeni sorgu (Faz 14 arama, bildirimler, pano etkinliği) `inboxOwnerId: null` filtresi ya da sahiplik kontrolü almalı. `@NoInbox` yalnızca işaretlenen route'larda çalışır; yeni pano düzeyindeki uç noktalar için code-reviewer kontrol listesine eklenir.
- **Açık pencerede veri kaybı:** Kart başka panoya taşınınca diğer kullanıcının kaydedilmemiş açıklama metni kaybolur (silmede de böyle). Kabul.
- **Planlayıcı saat dilimi:** Aralık istemcinin yerel saatinden hesaplanır; sunucu UTC karşılaştırır. Gün sınırındaki kartlar istemcide `dueDate` yerel güne göre gruplanır, bu yüzden tutarlı kalır.
- **Performans:** Planlayıcı/Kartlarım tek sorgu ve 500 sınırı. Taşıma 6–8 ek yazma yapar; nadir işlem.
- **Geriye dönük uyumluluk:** Migration yalnızca ekleme; DTO'lar yalnızca genişler; `boardId`'siz `move` istekleri aynen çalışır. `BoardInfoDto`'dan `starred` çıkarıldığı için `board:updated` kişiye özel değer taşımaz.

## 9. Açık sorular (önerilen varsayılanla)

1. **`BoardStar` tablosu yerine `BoardMember.starredAt` kabul mü?** Varsayılan: evet (§1).
2. **Kaynak room'a `card:deleted` yerine yeni `card:transferred` kabul mü?** Varsayılan: evet.
3. **Taşımada izleyiciler:** hedef panonun üyesi olanlar kalsın mı? Varsayılan: evet, diğerleri düşer.
4. **`CARD_TRANSFERRED` kaynak pano adını saklasın mı?** Varsayılan: evet (Trello gibi). Alternatif: ad saklanmaz, "başka bir panodan" yazılır.
5. **Planlayıcı kapsamı:** bana atanmış + Inbox kartları mı, yoksa üyesi olduğum panolardaki tüm son tarihli kartlar mı? Varsayılan: atanmış + Inbox.
6. **Planlayıcı görünümü:** Varsayılan haftalık (pazartesi başlar); aylık yok.
7. **Inbox yerleşimi:** Varsayılan ayrı sayfa (masaüstü ve mobil); pano yanında sol panel ertelenir.
8. **Kartlarım'da tamamlanan kartlar:** Varsayılan sunucu döner, arayüz anahtarla gizler.
9. **Inbox'ta liste/etiket işlemleri:** Varsayılan yasak (403), tek liste.

**Kapsamı küçültmek için ertelenebilecekler (bağımsız sırayla):**
- **Planlayıcı** (C3'ün planner kısmı + C7'nin yarısı): en kolay ertelenen parça; diğer adımlar ona bağlı değil. Çubuktaki "Planlayıcı" düğmesi o zaman eklenmez.
- **Kartlarım** (C3 + C7'nin diğer yarısı).
- Pano karolarındaki `CardActionsDialog`'a pano seçimi, Inbox sol paneli ve panolar arası sürükle-bırak, Planlayıcıda sürükleyerek tarih atama.
- En küçük anlamlı Faz 13: C1 + C2 + C4 + C5 + C6 (yıldız, Inbox, panolar arası taşıma).
