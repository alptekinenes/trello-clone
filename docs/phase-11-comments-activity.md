# Faz 11 — Kart yorumları ve etkinlik akışı: Uygulama Planı

> `architect` rolüyle hazırlandı (2026-11-05). Kurallar: `CLAUDE.md`. Taslak: `docs/trello-parity-roadmap.md` §3 "Faz 11". Desen: `docs/phase-10-card-members.md`.
> Metin Türkçe; kod, dosya ve tanımlayıcı adları İngilizce.

**Önkoşul:** Faz 10 bitti (`11b7292`). Çalışma ağacı temiz.

## 1. Özet

**Kapsam içi**
- Kart yorumları: ekleme, düzenleme (yalnızca yazar), silme (yazar ya da ADMIN+). Yorumlar düz metindir.
- Kart etkinlik kaydı: kartla ilgili belirli işlemler `Activity` satırı üretir ve kart penceresinde yorumlarla tek zaman akışında gösterilir.
- Kart penceresinin sağında "Yorumlar ve etkinlik" paneli: üstte yorum formu, altta en yeni öğe başta olacak şekilde akış, "Ayrıntıları göster/gizle" anahtarı ve "Daha fazla göster" düğmesi.
- Kartta yorum sayısı rozeti (`CardSummaryDto.commentCount`).
- Canlı güncelleme: `comment:created|updated|deleted`, `activity:created`.

**Etkinlik üreten işlemler (Faz 11):** kart oluşturma, başka listeye taşıma (aynı liste içinde sıralama değişikliği kayıt üretmez), arşivleme, arşivden geri alma, tamamlama, tamamlanmadı olarak işaretleme, kart üyesi ekleme ve çıkarma.

**Kapsam dışı:** Bahsetme (mention), Markdown ya da otomatik link, emoji tepkileri, bildirimler (Faz 14), pano etkinlik paneli, `GET /boards/:boardId/activity` ve `GET /users/me/activity`, liste ve pano üyeliği etkinlikleri (açık soru 1), eski kartlar için geçmiş üretmek (backfill).

**Taslaktan sapmalar (gerekçeli)**
| Taslak | Bu plan | Neden |
|---|---|---|
| `GET /cards/:cardId/comments` + `GET /cards/:cardId/activity` | Tek `GET /cards/:cardId/feed?details=` uç noktası; birleştirme sunucuda yapılır | Ayrı ayrı sayfalanan iki akış istemcide birleştirilirse sayfa sınırında sıra bozulur. Tek cursor ile sıra her zaman doğru kalır. |
| Pano ve kullanıcı etkinlik uç noktaları | Faz 14'e ertelenir | Okuyacak bir arayüz yok, ölü uç nokta olur. `[boardId, createdAt]` index'i şimdiden eklenir. |
| Yorum ayrıca etkinlik kaydı da üretir | Üretmez | Akışta `Comment` satırının kendisi gösterilir. Ayrıca kayıt üretilirse aynı olay iki kez görünür. |
| `commentCount` okuma sırasında hesaplanır | `Card.commentCount Int @default(0)` sayaç kolonu | Pano yüklenirken ek sorgu gerekmez. Mevcut checklist sayaçları gibi, event'te yeni değer gönderilir. |
| `Comment.updatedAt` + `editedAt?` | Yalnızca `editedAt?` | Değerin tek kaynağı olur; `null` hiç düzenlenmedi demektir. |
| `Activity.cardId?` | Zorunlu (`String`) | Şimdilik bütün tipler kart tipi. Pano tipleri geldiğinde kolonu nullable yapmak ucuz bir migration. |

## 2. Veritabanı şeması

`backend/prisma/schema.prisma` (yeni ve değişen bloklar):

```prisma
enum ActivityType {
  CARD_CREATED
  CARD_MOVED
  CARD_ARCHIVED
  CARD_RESTORED
  CARD_COMPLETED
  CARD_UNCOMPLETED
  CARD_MEMBER_ADDED
  CARD_MEMBER_REMOVED
}

model Comment {
  id        String    @id @default(uuid()) @db.Uuid
  cardId    String    @db.Uuid
  /// Same as the card's boardId; single-query access checks and the board cascade.
  boardId   String    @db.Uuid
  authorId  String    @db.Uuid
  /// Plain text, stored trimmed. Never rendered as HTML.
  body      String    @db.VarChar(5000)
  createdAt DateTime  @default(now())
  /// Set on every edit; null means never edited.
  editedAt  DateTime?

  card   Card  @relation(fields: [cardId], references: [id], onDelete: Cascade)
  board  Board @relation(fields: [boardId], references: [id], onDelete: Cascade)
  author User  @relation(fields: [authorId], references: [id], onDelete: Cascade)

  @@index([cardId, createdAt, id])
  @@index([boardId, createdAt])
}

/// Append-only log. `data` holds copies of names from that moment (ActivityDataMap in contracts).
model Activity {
  id        String       @id @default(uuid()) @db.Uuid
  boardId   String       @db.Uuid
  cardId    String       @db.Uuid
  actorId   String       @db.Uuid
  type      ActivityType
  data      Json
  createdAt DateTime     @default(now())

  board Board @relation(fields: [boardId], references: [id], onDelete: Cascade)
  card  Card  @relation(fields: [cardId], references: [id], onDelete: Cascade)
  actor User  @relation(fields: [actorId], references: [id], onDelete: Cascade)

  @@index([cardId, createdAt, id])
  @@index([boardId, createdAt])
}

// Card'a eklenir:
  /// Number of comments; changed in the comment's own transaction.
  commentCount Int        @default(0)
  comments     Comment[]
  activities   Activity[]
// Board ve User'a eklenir: comments Comment[], activities Activity[]
```

- Migration: `npm run prisma:migrate -w backend -- --name card_comments_activity`. Migration yalnızca ekleme yapar. Eski kartlarda yorum olmadığı için `commentCount = 0` doğru başlangıç değeridir; backfill gerekmez.
- Index'ler:
  - `[cardId, createdAt, id]`: `ORDER BY createdAt DESC, id DESC` sorgusunu ters tarama ile karşılar ve cursor koşulunu da kapsar.
  - `[boardId, createdAt]`: pano silinirken çalışan FK cascade'ini ve Faz 14 pano akışını karşılar.
  - `authorId`/`actorId` index'i eklenmez: hesap silme yok. `/users/me/activity` gelince `[actorId, createdAt]` eklenir.
- Silme davranışı:
  - Kart silinince yorumlar ve etkinlikler cascade ile silinir.
  - Kart arşivlenince ikisi de kalır; arşivli kartın penceresinde okunabilir.
  - Liste ya da pano silinince yorumlar ve etkinlikler kartlarla birlikte gider.
- Panodan çıkarılan üye: yorum ve etkinliklerdeki FK `User` tablosuna bağlıdır, `BoardMember`'a değil. Bu yüzden satırlar kalır ve yazar adı ile avatarı join ile gösterilir. Kişi artık yorumunu düzenleyemez ya da silemez (guard 404 döner); ADMIN+ silebilir. Panoya yeniden katılırsa kendi yorumlarını yine düzenleyebilir.
- `position` kullanılmaz. `test/utils/database.ts` değişmez (`TRUNCATE "User", "Board" CASCADE` yeni tabloları da boşaltır).

## 3. Contracts (`@trello/contracts`)

Yeni `comments.ts` ve `activity.ts` dosyaları `index.ts`'ten dışa açılır. Yeni hata kodu yoktur.

```ts
// activity.ts
export const ActivityType = { CARD_CREATED: 'CARD_CREATED', /* ...Prisma enum'uyla aynı 8 değer */ } as const;
export type ActivityType = (typeof ActivityType)[keyof typeof ActivityType];
export interface UserRefDto { id: string; name: string; avatarUrl: string | null }
export interface ListRef { id: string; title: string }
export interface MemberRefData { id: string; name: string }
/** Payload per type. Shapes only ever gain optional fields; old rows must stay readable. */
export interface ActivityDataMap {
  CARD_CREATED: { cardTitle: string; list: ListRef };
  CARD_MOVED: { cardTitle: string; fromList: ListRef; toList: ListRef };
  CARD_ARCHIVED: { cardTitle: string };
  CARD_RESTORED: { cardTitle: string };
  CARD_COMPLETED: { cardTitle: string };
  CARD_UNCOMPLETED: { cardTitle: string };
  CARD_MEMBER_ADDED: { cardTitle: string; member: MemberRefData };
  CARD_MEMBER_REMOVED: { cardTitle: string; member: MemberRefData };
}
export type ActivityDto = {
  [T in ActivityType]: {
    kind: 'activity'; id: string; cardId: string; actor: UserRefDto;
    createdAt: string; type: T; data: ActivityDataMap[T];
  };
}[ActivityType];
export type FeedItemDto = CommentDto | ActivityDto;            // `kind` ile daraltılır
export interface CardFeedPageDto { items: FeedItemDto[]; nextCursor: string | null }
export const FEED_LIMITS = { PAGE_DEFAULT: 20, PAGE_MAX: 50 } as const;

// comments.ts
export const COMMENT_LIMITS = { BODY_MAX: 5_000 } as const;
export interface CommentDto {
  kind: 'comment'; id: string; cardId: string; author: UserRefDto;
  body: string; createdAt: string; editedAt: string | null;
}
export interface CommentBodyRequest { body: string }           // POST ve PATCH
export function canEditComment(userId: string, authorId: string): boolean;          // yalnızca yazar
export function canDeleteComment(viewer: MemberRef, authorId: string): boolean;     // yazar || hasBoardRole(role,'ADMIN')

// cards.ts — CardSummaryDto
commentCount: number;

// realtime-events.ts — BoardEventMap (+ BOARD_EVENTS kaydı)
'comment:created': { comment: CommentDto; commentCount: number };
'comment:updated': CommentDto;
'comment:deleted': { id: string; cardId: string; commentCount: number };
'activity:created': ActivityDto;
```

## 4. REST API

Bütün uç noktalarda JWT zorunlu ve `@BoardRole('MEMBER')` kullanılır. Pano üyesi olmayan kullanıcıya ya da bulunamayan kayda **404 `NOT_FOUND`** döner.

| Method + path | Gövde / sorgu | Başarı | Hatalar |
|---|---|---|---|
| `GET /api/v1/cards/:cardId/feed` | `?details=true\|false` (varsayılan `false`, `ArchivedQueryDto` dönüşüm deseni), `?cursor=<opak>`, `?limit=1..50` (varsayılan 20) | 200 `CardFeedPageDto`. `details=false` yalnızca yorumları, `true` yorumlar ile etkinlikleri birlikte döner. Sıra `createdAt desc, id desc` | 400 `VALIDATION_FAILED` (bozuk cursor, limit aralık dışında, `details` boolean değil) |
| `POST /api/v1/cards/:cardId/comments` | `{ body }` | 201 `CommentDto` | 400 `VALIDATION_FAILED` (boş, yalnızca boşluk, 5000 karakterden uzun, fazladan alan). 404 (kart o anda silindi: sayaç güncellemesi P2025 verir) |
| `PATCH /api/v1/comments/:commentId` | `{ body }` | 200 `CommentDto` (`editedAt` = şimdi) | 400, 403 `FORBIDDEN` (yazar değil), 404 |
| `DELETE /api/v1/comments/:commentId` | — | 204 | 403 `FORBIDDEN` (yazar değil ve ADMIN altında), 404 (bulunamadı ya da zaten silinmiş) |

- **DTO:** `CommentBodyDto`: `@Trim() @IsString() @IsNotEmpty() @MaxLength(COMMENT_LIMITS.BODY_MAX) body`. Kırpma yalnızca baştaki ve sondaki boşluğu siler, metin içindeki satır sonları korunur. `FeedQueryDto` için `limit` alanı `@Type(() => Number) @IsInt @Min(1) @Max(50)`, `cursor` alanı `@IsString @MaxLength(200)` ile doğrulanır.
- **Guard:** `BoardAccessGuard` param sırasının sonuna `:commentId` eklenir (`labelId`'den sonra). Bunun için `BoardAccessService.boardIdOfComment` yazılır (uuid değilse `null` → 404). Hata fonksiyonu `commentNotFound()` olarak `access.errors.ts`'e eklenir.
- **Yetki:** Kural servistedir. Rol `@CurrentBoardRole()`, kullanıcı `@CurrentUser()` ile alınır. Kontroller contracts'taki `canEditComment` / `canDeleteComment` fonksiyonlarıyla yapılır; frontend düğmeleri de aynı fonksiyonlarla gösterir. Düzenleme için süre sınırı yoktur; arşivli kartta yorum yazmak serbesttir.
- **Cursor:** Değer `base64url("<createdAt ISO>|<id>")`. Kodlama ve çözme yalnızca sunucuda yapılır (`comments/feed-cursor.ts`); istemci değeri opak olarak geri gönderir. Sayfa koşulu `createdAt < t OR (createdAt = t AND id < id)` şeklindedir. İki tablo için aynı koşul kullanılır, bu yüzden birleşik sayfalama tutarlı kalır. Postgres'in uuid sırası küçük harfli hex dizgisinin JS karşılaştırmasıyla aynıdır.
- **Birleştirme** (`comments/merge-feed.ts`, saf fonksiyon):
  - Yorumlar `take: limit + 1` ile okunur; `details` açıksa etkinlikler de aynı şekilde okunur.
  - İki liste `(createdAt, id) desc` sırasıyla birleştirilir ve ilk `limit` öğe alınır.
  - Birleşik listede `limit`'ten fazla öğe varsa `nextCursor` son alınan öğeden üretilir.
  - Yazar ve aktör bilgisi ilişki `select`'i ile gelir (`USER_REF_SELECT`), sayfa başına tek toplu sorgu yapılır, N+1 oluşmaz.
- **Sayaç:**
  - Oluşturma transaction'ı: önce `tx.card.update({ where: { id: cardId, boardId }, data: { commentCount: { increment: 1 } }, select: { commentCount } })`, ardından `tx.comment.create` çalışır.
  - Silme transaction'ı: önce `comment.findFirst({ id, boardId })` ve yetki kontrolü yapılır. Sonra `deleteMany` çalışır; `count === 0` ise 404 döner ve azaltma yapılmaz. Silme olduysa `decrement` uygulanır.
  - Kilit döngüsü oluşmaz. Oluşturmada ilk adım kart satırını kilitler. Silmede yorum satırı yalnızca aynı yorumu silen bir istekle paylaşılır: ikinci istek bekler, ardından `count === 0` görür.
- **Rate limit:** Ek sınır konmaz. Genel `API_RATE_LIMIT_PER_MINUTE` (IP başına 300/dk) yeterli. Yorum kimlik bilgisi almaz, kart oluşturmayla aynı risk sınıfındadır ve Playwright'ın ayarlarını değiştirmeye gerek kalmaz.
- **Dosyalar:**
  - `backend/src/comments/`: `comments.module.ts`, `comments.controller.ts` (`CardCommentsController`: POST, feed GET; `CommentsController`: PATCH, DELETE), `comments.service.ts`, `card-feed.service.ts`, `comment.mapper.ts`, `feed-cursor.ts`, `merge-feed.ts`, `dto/comment.dto.ts`, `comments.errors.ts` (`notCommentAuthor()` → 403 `FORBIDDEN`).
  - `backend/src/activity/`: `activity.module.ts` (`ActivityService`'i dışa açar), `activity.service.ts`, `activity.mapper.ts`.
  - Kart tarafı: `card.mapper.ts` (`CARD_SELECT` ve `CardRow` için `commentCount`).

## 5. Etkinlik kaydı: `ActivityService.record`

```ts
type ActivityEntry = { [T in ActivityType]: { type: T; data: ActivityDataMap[T] } }[ActivityType];
record(tx: Prisma.TransactionClient, ref: { boardId: string; cardId: string; actorId: string },
       entries: readonly ActivityEntry[]): Promise<ActivityDto[]>;   // boş dizi → sorgu yok
```
- Her girdi için `tx.activity.create({ data, select: ACTIVITY_SELECT })` çalışır. `select` aktörü de join'ler, böylece dönen DTO yayına hazır olur. Bir istek en fazla 2 girdi üretir.
- `activity.mapper.ts`, `Prisma.JsonValue` değerini tek yerde daraltır: değerin nesne olduğu ve `cardTitle` alanının string olduğu kontrol edilir. Tipe özel alanlar için tek yazıcı `record()` olduğundan bu kontrol yeterlidir.
- **Yayın:** Transaction callback'i `{ result, rebalanced, activities }` döner. Commit'ten sonra mevcut `toBoard` çağrısına asıl event'lerin **arkasından** `activities.map((a) => ({ type: 'activity:created', data: a }))` eklenir. Transaction başarısız olursa etkinlik kaydı da yayın da olmaz.
- **Değişen servisler ve metotlar:**
  - `CardsService.create`: `CARD_CREATED { cardTitle, list }`. Liste adı için `ordering/locks.ts` içindeki `lockLists` artık `title` da seçer (`LockedList.title`).
  - `CardsService.update`: Durum geçişi varsa `CARD_ARCHIVED`, `CARD_RESTORED`, `CARD_COMPLETED` ya da `CARD_UNCOMPLETED` üretir. Durumu değiştirmeyen istek (zaten arşivli ya da zaten tamamlanmış kart) kayıt üretmez. Bir PATCH iki kayıt üretebilir. Çift kaydı önlemek için `archived` ya da `isCompleted` içeren PATCH'te kart satırı `lockCardRow` ile kilitlenir ve `current` kilit altında okunur. Restore yolunda bu kilit liste kilidinden sonra alınır; Board → List → Card sırası korunur. Kayıttaki `cardTitle` güncellenmiş satırdan alınır.
  - `CardsService.move`: Yalnızca `fromListId !== toListId` ise `CARD_MOVED` üretir. `findOnBoard` select'ine `title` eklenir; iki liste adı `lockLists` satırlarından gelir.
  - `CardMembersService.assign` / `unassign`: Yazma işlemi `$transaction` içine alınır. `count > 0` ise `CARD_MEMBER_ADDED` ya da `CARD_MEMBER_REMOVED` üretir. Üye adı ve kart başlığı transaction öncesindeki okumalardan gelir: `boardMember` select'ine `user.name`, `card` select'ine `title` eklenir. `unassign` bu okumaları `Promise.all` ile yapar.
  - Değişmeyenler: lists, boards, members, invitations, labels, checklists, `CardsService.remove`.
- Modül bağımlılıkları: `CardsModule` ve `CommentsModule`, `ActivityModule`'ü import eder.

## 6. Socket sözleşmesi

Tamamı `board:<id>` room'una, yalnızca commit sonrasında gönderilir. `X-Socket-Id` yankı kuralı geçerlidir: isteği yapan sekme kendi event'ini almaz.

| Event | Payload | Ne zaman | İstemci |
|---|---|---|---|
| `comment:created` | `{ comment, commentCount }` | Yorum eklendi | Pano: `patchCard(cardId, { commentCount })`. Açık kart: detayda `commentCount` güncellenir; iki akış önbelleğine id'ye göre tekrar eklemeden ve sıralı olarak eklenir |
| `comment:updated` | `CommentDto` | Yorum düzenlendi | Pano: yok sayar. Akış: id'ye göre değiştirir |
| `comment:deleted` | `{ id, cardId, commentCount }` | Yorum silindi | Pano: `patchCard`. Akış: id'yi siler |
| `activity:created` | `ActivityDto` | §5'teki işlemlerde, asıl event'ten hemen sonra | Pano: yok sayar. Yalnızca `details=true` akışına eklenir |

- Event'ler idempotenttir: sayaç artırılmaz, gelen yeni değer yazılır; eklemeler id kontrolüyle yapılır.
- Kendi işlemlerimin etkinlikleri yankı kuralı nedeniyle bana socket'ten gelmez. Akış query'si pano key'inin altında durduğu için mevcut mutation'ların `onSettled` sırasında yaptığı pano invalidation'ı akışı da yeniler (§7).
- Panodan çıkarılan üye: mevcut sırayla önce room'dan çıkarılır, sonra `member:removed` gider. Sonraki yorum event'leri ona ulaşmaz.

## 7. Frontend

**Query ve cache**
- `card-keys.ts`: `feed: (boardId, cardId, details: boolean) => [...cardKeys.detail(boardId, cardId), 'feed', { details }]`. Key pano key'inin altında durur. Böylece pano invalidation'ı (kendi işlemlerimin etkinlikleri, yeniden bağlanma) akışı da yeniler ve panodan ayrılınca akış da temizlenir. Kart detayındaki `exact: true` invalidation'lar akışı etkilemez.
- `api/use-card-feed.ts`: `useInfiniteQuery`; `initialPageParam: null`, `getNextPageParam: (last) => last.nextCursor`. Öğeler `pages.flatMap` ile düzleştirilir ve id'ye göre tekrarlar ayıklanır. TanStack v5, sayfaları yeniden çekerken her sonraki sayfanın cursor'ünü yeni gelen önceki sayfadan hesaplar; bu yüzden araya yeni öğe girse bile öğe kaybolmaz.
- `lib/feed-cache.ts` (`insertItem` sıralı ekler, `replaceItem`, `removeItem`) ve `lib/apply-feed-event.ts` (saf; `details` bayrağını alır).
- `hooks/use-card-realtime.ts`: Mevcut kart güncellemesine ek olarak `setQueryData` ile `feed(…, false)` ve `feed(…, true)` önbelleklerine olayı uygular. `activity:created` olayı yalnızca `true` önbelleğine gider.
- `board-detail/lib/apply-board-event.ts` ve `card-detail/lib/apply-card-event.ts`: yeni case'ler (switch exhaustive olduğu için gerekli). `card-detail-cache.ts`: `summaryOf`/`CardSummaryContent`'e `commentCount` eklenir.

**Mutation'lar** (`api/use-comment-mutations.ts`)
- Hepsi `mutationKey: boardMutationKey(boardId)` kullanır. Böylece araya giren bir pano yenilemesi iyimser yorumu silemez; son biten mutation panoyu, kartı ve akışı yeniler (`useCardMutation` ile aynı kural).
- `useAddComment`:
  - `onMutate`: akış query'si iptal edilir, önceki durum saklanır. `feed(…, false)` ve `feed(…, true)` önbelleklerinin ilk sayfasına `id: 'pending:<uuid>'` olan geçici bir yorum eklenir; yazar bilgisi auth store'dan gelir. Form hemen temizlenir.
  - `onError`: saklanan durum geri yüklenir, metin forma geri konur ve `showError(cardId, …)` çağrılır.
  - `onSuccess`: geçici öğe sunucunun döndürdüğü yorumla değiştirilir. Yorum bir yenilemeyle zaten geldiyse geçici öğe yalnızca silinir.
- `useEditComment`: `body` iyimser olarak değiştirilir ve `editedAt` şimdiki zaman yapılır. `useDeleteComment`: öğe iyimser olarak silinir. İkisinde de hata olursa geri alınır. 404 gelirse öğe silinir ve "Yorum bulunamadı. Silinmiş olabilir." gösterilir.
- Geçici öğe "Gönderiliyor…" etiketiyle soluk gösterilir, üzerinde işlem düğmeleri olmaz (`isPendingComment(id)`).

**Bileşenler** (`features/card-detail/components/`)
- `card-detail-content.tsx`: `lg:` (1024 px ve üstü) ekranda iki sütun: `grid-cols-[minmax(0,1fr)_22rem]`. Mevcut içerik soldaki sütuna, `CardActivityPanel` sağdaki sütuna gelir. `lg` altında panel ayrıntıların altına iner, 320 px'te tam genişlik kullanır. `card-detail-route.tsx`: `Dialog size` değeri ui-designer'ın önerisiyle `'2xl'` (`max-w-6xl`) olur; yeni boyut `shared/ui/dialog.tsx`'e eklenir.
- `card-activity-panel.tsx`:
  - `<section aria-labelledby>` içinde h2 "Yorumlar ve etkinlik" başlığı yer alır.
  - Başlığın sağında "Ayrıntıları göster" / "Ayrıntıları gizle" düğmesi durur. Düğmenin metni değişir; `aria-pressed` kullanılmaz.
  - Anahtarın durumu Zustand'da `showFeedDetails` olarak tutulur (varsayılan `false`). `reset()` bu değeri sıfırlamaz; tercih oturum boyunca korunur, localStorage'a yazılmaz.
- `comment-composer.tsx`: React Hook Form ve `commentBodySchema` kullanılır (`z.string().trim().min(1).max(COMMENT_LIMITS.BODY_MAX)`; şema `schemas/card-detail-schemas.ts`'te). Textarea'nın erişilebilir adı "Yorum yaz", placeholder'ı "Yorum yaz…". "Kaydet" düğmesi ve Ctrl/Cmd+Enter formu gönderir. Metin doluyken Escape metni silmez: odağı textarea'dan çıkarır ve olayın pencereye geçmesini durdurur. Metin boşken Escape pencereyi kapatır (`use-description-editor` deseni). Mantık `hooks/use-comment-form.ts`'te.
- `feed-list.tsx`:
  - Liste `<ol aria-label="Yorumlar ve etkinlik">` olarak çizilir. Öğeler `comment-item.tsx` ve `activity-item.tsx` bileşenleridir.
  - Sonsuz kaydırma yerine "Daha fazla göster" düğmesi kullanılır: daha basittir, klavyeyle kullanılabilir ve test edilmesi kolaydır.
  - Yükleme bitince odak yeni gelen ilk öğeye (`tabIndex={-1}`) taşınır.
  - Boş akışta "Henüz yorum yok." yazılır.
- `comment-item.tsx`:
  - Öğede avatar, ad, zaman ve düzenlenmişse "(düzenlendi)" notu bulunur. Gövde `<p className="whitespace-pre-wrap break-words">{body}</p>` ile **düz metin** olarak gösterilir; `dangerouslySetInnerHTML` kullanılmaz, linkler otomatik bağlanmaz.
  - "Düzenle" yerinde açılan bir textarea gösterir (`hooks/use-comment-editor.ts`). "Sil" bir `ConfirmDialog` açar: "Yorum silinsin mi?" / "Bu yorum kalıcı olarak silinecek.".
  - Düğmeler `canEditComment` / `canDeleteComment` sonucuna göre gösterilir.
- `activity-item.tsx` ve `lib/describe-activity.ts` (saf, exhaustive switch). Metinler şöyle:
  - "bu kartı {liste} listesine ekledi"
  - "bu kartı {a} listesinden {b} listesine taşıdı"
  - "bu kartı arşivledi" / "bu kartı arşivden geri aldı"
  - "bu kartı tamamlandı olarak işaretledi" / "… tamamlanmadı olarak işaretledi"
  - Üye kendini eklediyse "bu karta katıldı", başkasını eklediyse "{ad} kişisini bu karta ekledi". Çıkarmada karşılıkları "bu karttan ayrıldı" ve "{ad} kişisini bu karttan çıkardı".
  - Adlar kayıttaki kopyadan gelir.
- Zaman: `shared/lib/date.ts`'e `formatRelativeTime(iso, now)` eklenir (`Intl.RelativeTimeFormat('tr-TR', { numeric: 'auto' })`).
  - 45 saniyeden yeni: "az önce".
  - Bir saatten yeni: "N dakika önce"; bir günden yeni: "N saat önce"; 7 günden yeni: "dün" ya da "N gün önce".
  - Daha eskiler: "5 Kas 14:30" (yıl farklıysa yıl da yazılır).
  - Değer `<time dateTime={iso} title={formatDueLong(iso)}>` içinde gösterilir. Zamanlayıcı yoktur; değer her render'da yeniden hesaplanır.
- Mobil: dokunmatik ekranda (`pointer-coarse:`) "Düzenle", "Sil", "Daha fazla göster", anahtar ve "Kaydet" düğmeleri en az 44 px olur. Textarea tam genişliktedir.
- Kart rozeti (`board-detail/components/card-tile-body.tsx`): `CommentIcon` (`shared/ui/icons.tsx`) ve görünür sayı. Ekran okuyucu metni `sr-only` "{n} yorum". Rozet açıklama rozetinden sonra, checklist rozetinden önce gelir. `hasBadges` koşulu `commentCount > 0` ile genişler.

## 8. Adımlar, etkilenen testler, commit sırası

Her commit kendi başına yeşil olmalı (build, typecheck, lint, unit). Playwright en sonda bir kez çalıştırılır.

**C1 — `feat(api): card comments, comment counts and card feed`** (backend-nest, frontend-react derleme düzeltmeleri, tester)
- Bu commit'te: şema (iki model ve enum birlikte), migration, contracts (§3; `activity:created` hariç), `CommentsModule`, guard için `commentId`, `commentCount`, `ActivityModule` iskeleti (mapper ve select; `record` C2'de). Feed `details=true` iken `Activity` tablosunu da okur; tablo bu commit'te henüz boş kalır.
- Frontend (contracts değişince derleme kırıldığı için bu commit'e giriyor): `test/fixtures.ts` (`commentCount: 0`), `apply-board-event.ts` / `apply-card-event.ts` (`comment:*` case'leri), `card-detail-cache.ts`.
- Yeni testler:
  - Backend unit: `comments.service.spec.ts` (yazar ve ADMIN kuralları, sayaç arttırma ve azaltma, `deleteMany` 0 → 404 ve azaltma yok, yayın commit sonrası), `merge-feed.spec.ts` (eşit zaman damgası, limit, `nextCursor`), `feed-cursor.spec.ts` (gidiş-dönüş, bozuk değer → null), `comment.dto.spec.ts`, `activity.mapper.spec.ts`, Prisma `ActivityType` ↔ contracts eşitlik testi.
  - Contracts: `comments.spec.ts` (`canEditComment`, `canDeleteComment`).
  - E2E: `test/comments.e2e-spec.ts`. Kapsam: mutlu yol; boş, yalnızca boşluk, 5001 karakter ve fazladan alan için 400; yabancı kullanıcı ve başka panonun kartı için 404; yazar olmayanın düzenlemesi 403; MEMBER başkasının yorumunu silerse 403, ADMIN silerse 204; zaten silinmiş yorum 404; pano detayında `commentCount`; 25 yorum `limit=10` ile üç sayfa döner, tekrar ya da boşluk olmaz; bozuk cursor 400; panodan çıkarılan üyenin yorumu yazarıyla birlikte görünür ve çıkarılan kişi 404 alır; kart silinince yorumlar da silinir.
- Güncellenen testler:
  - Backend: `board-access.guard.spec.ts`, `board-access.service.spec.ts`, `card.mapper.spec.ts`, `CardRow` mock'u kuran spec'ler (`cards`, `checklists`, `checklist-items`, `checklist-counts`, `boards`).
  - E2E: tam şekil kontrolü yapan dosyalar (`cards`, `card-detail`, `checklists`, `boards`). `realtime-events.e2e-spec.ts`: `comment:*` event'leri, kendi socket'e gitmemesi, panodan çıkarılan kişiye sızmaması (`expectNoLeak`).
  - Frontend: `apply-board-event.test.ts`, `apply-card-event.test.ts`, `card-detail-cache.test.ts`.

**C2 — `feat(api): record card activity`** (backend-nest, frontend derleme düzeltmeleri, tester)
- `ActivityService.record`, §5'teki servis değişiklikleri, `lockLists`'e `title`, contracts'a `activity:created`. Frontend: iki apply fonksiyonuna `activity:created` için değişiklik yapmayan case.
- Testler:
  - Unit: `activity.service.spec.ts`; `cards.service.spec.ts` (her geçiş bir kayıt, durumu değiştirmeyen istek kayıt üretmez, aynı liste içinde taşıma kayıt üretmez, yayın sırası asıl event → `activity:created`); `card-members.service.spec.ts` (transaction, tekrar atamada kayıt yok).
  - E2E: yeni `test/activity.e2e-spec.ts` (§1'deki listenin tamamı; liste yeniden adlandırılsa da kayıttaki ad değişmez; ikinci kez tamamlama ve iki eşzamanlı tamamlama tek kayıt üretir). `realtime-events.e2e-spec.ts`: `card:moved` ardından `activity:created` gelir.

**C3 — `feat(card-detail): comments and activity panel`** (frontend-react, düzen ve boyut için ui-designer)
- §7: düzen, akış query'si, `useAddComment`, composer, öğeler, anahtar, "Daha fazla göster", realtime akış, `formatRelativeTime`, `describeActivity`, `Dialog` için `'2xl'`.
- Testler:
  - Yeni: `feed-cache.test.ts`, `apply-feed-event.test.ts`, `describe-activity.test.ts`, `card-activity-panel.test.tsx` (anahtar sorguyu değiştirir; "Daha fazla göster" sonraki sayfayı yükler ve odağı taşır; `<img onerror>` içeren gövde düz metin olarak görünür), `comment-composer.test.tsx` (iyimser ekleme; 500 gelince geri alma ve metnin forma dönmesi; Ctrl+Enter; boş ya da çok uzun metinde hata).
  - Güncellenen: `date.test.ts`, `use-card-realtime.test.tsx`, `card-detail-store.test.ts`, `card-detail-route.test.tsx` (düzen ve odak), `dialog.test.tsx`.

**C4 — `feat(card-detail): edit and delete comments`** (frontend-react)
- `useEditComment`, `useDeleteComment`, düzenleme ve silme arayüzü, onay penceresi.
- Testler: `comment-item.test.tsx` (yazar düzenleyebilir; ADMIN başkasının yorumunu silebilir ama düzenleyemez; MEMBER başkasının yorumunda düğme görmez; hata olunca geri alınır; 404 gelince öğe silinir; Escape düzenlemeyi kapatır ama pencereyi kapatmaz).

**C5 — `feat(board): comment count badge on card tiles`** (frontend-react, ui-designer)
- `card-tile-body.tsx`, `CommentIcon`. Testler: `card-badges.test.tsx` (sayı, `sr-only` metin, 0 iken rozet yok), `board-cards.test.tsx`.

**C6 — `test(e2e): comments and activity`** (tester)
- `e2e/card-detail.spec.ts`: yorum ekleme, düzenleme ve silme. Sayfa yenilendikten sonra yorum ve karttaki sayı korunur. "Ayrıntıları göster" açıkken taşıma kaydı ("… listesine taşıdı") görünür.
- `e2e/realtime.spec.ts`: B, A'nın yorumunu ve karttaki sayının artışını canlı görür. A'nın düzenlemesi ve silmesi B'nin ekranına yansır.
- `e2e/a11y.spec.ts` (4 mod): "card dialog with comments and activity", "comment being edited".

**C7 — `docs: record phase 11`**: `docs/PLAN.md` ilerleme satırı. Ardından tam test turu ve code-reviewer.

## 9. Riskler

- **Yazma yükü:** Etkinlik üreten her istek, aynı transaction içinde 1–2 INSERT daha yapar; aktör join'i de aynı sorguda gelir. En sık işlem olan aynı liste içinde sürüklemede ek yazma yoktur. Yorum işlemi kart satırını kısa süre kilitler; kilit sırası değişmediği için deadlock oluşmaz.
- **N+1:** Akış sayfası 2 ana sorgu ve 2 toplu ilişki sorgusundan oluşur. Pano yüklemesi `commentCount` kolonunu okur, ek sorgu yapmaz.
- **Etkinlik tablosunun büyümesi:** Tablo yalnızca ekleme alır, satırlar küçüktür (JSON 300 bayttan az). Kart akışı `[cardId, createdAt, id]` index'i sayesinde tablo boyutundan bağımsız hızda çalışır. Pano silinince satırlar cascade ile silinir ve `[boardId, createdAt]` index'i kullanılır; çok büyük panoda bu silme uzun sürebilir. Saklama süresi politikası kapsam dışıdır (Faz 14'te değerlendirilir).
- **Akışın yeniden çekilmesi:** Pano invalidation'ı yüklenmiş bütün akış sayfalarını sırayla yeniden çeker. Pencere açıkken pratikte 1–3 istek olur; kabul edilebilir.
- **Eşzamanlılık:**
  - Sayaç atomik artırılır ve azaltılır.
  - Aynı yorum iki kez silinmeye çalışılırsa `deleteMany` sayısı sayesinde ikinci istek 404 alır.
  - Durum geçişleri kart satırı kilidi altında okunduğu için çift kayıt oluşmaz.
  - İki kişi aynı yorumu düzenlerse son yazan kazanır, `comment:updated` iki tarafı eşitler.
- **Güvenlik:**
  - Yorum gövdesi ve kayıttaki adlar yalnızca düz metin olarak çizilir (XSS testi var).
  - Yorum gövdesi yalnızca pano room'una yayınlanır.
  - Yazar ve aktör bilgisi `UserRefDto` ile döner, e-posta adresi içermez.
- **Geriye dönük uyumluluk:** Migration yalnızca ekleme yapar; DTO'lar yalnızca genişler. Eski kartların etkinlik akışı boş başlar. `ActivityDataMap` şekilleri yalnızca isteğe bağlı alan ekleyerek değişebilir.
- **Faz 13:** Panolar arası taşımada `Comment.boardId` ve `Activity.boardId` taşıma transaction'ı içinde güncellenmeli, aksi halde guard ve cascade yanlış panoyu görür.

## 10. Açık sorular (önerilen varsayılanla)

1. **Liste oluşturma ve arşivleme ile pano üyeliği etkinlikleri ve pano etkinlik paneli bu fazda mı gelsin?** Varsayılan: hayır. Okuyacak arayüz olmadığı için Faz 14'e ertelenir; enum o zaman genişletilir ve `cardId` nullable yapılır.
2. **Yorum uzunluk sınırı?** Varsayılan: 5000 karakter.
3. **Arşivli karta yorum yazılabilsin mi?** Varsayılan: evet (Trello davranışı, ek kod gerektirmez).
4. **"Ayrıntıları göster" tercihi kalıcı olsun mu?** Varsayılan: oturum boyunca Zustand'da tutulur, başlangıçta kapalıdır, localStorage'a yazılmaz.
5. **Düzenlemeye süre sınırı ya da düzenleme geçmişi olsun mu?** Varsayılan: hayır, yalnızca "(düzenlendi)" notu gösterilir.
6. **Yorumlara ayrı rate limit konsun mu?** Varsayılan: hayır, genel sınır yeterli.
7. **§1'deki altı sapma onaylanıyor mu?** (tek feed uç noktası, ertelenen uç noktalar, yorumun etkinlik kaydı üretmemesi, sayaç kolonu, tek `editedAt`, zorunlu `cardId`)
