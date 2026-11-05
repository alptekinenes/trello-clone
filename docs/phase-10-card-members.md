# Faz 10 — Kart tamamlama, kart üyeleri, izleme, kapak rengi: Uygulama Planı

> `architect` rolüyle hazırlandı (2026-11-05). Kurallar: `CLAUDE.md`. Taslak: `docs/trello-parity-roadmap.md` §3 "Faz 10".
> Metin Türkçe; kod, dosya ve tanımlayıcı adları İngilizce.

**Önkoşul:** Faz 9 görünümü kullanıcı tarafından onaylandı (yol haritası §5.4). Çalışma ağacı temiz.

## 1. Özet

**Kapsam içi**
- Kart tamamlama: kart penceresinde başlığın solunda tamamlama dairesi. Kartta yeşil onay ikonu.
- Kart üyeleri: pano üyeleri karta atanır ya da karttan çıkarılır. Kart penceresinde "Üyeler" bölümü ve seçici var. Kartın sağ altında avatarlar görünür.
- İzleme: kullanıcı kendisi için açar ya da kapatır. Kart penceresinin üst çubuğunda "İzle" düğmesi, kartta göz rozeti. Bilgi kullanıcıya özeldir, yayınlanmaz.
- Kapak rengi: `LabelColor` paletinden biri seçilir ya da kapak kaldırılır. Kartın üstünde ve pencerede renk şeridi gösterilir.
- Panodan çıkarılan üyenin o panodaki kart üyelikleri ve izlemeleri silinir.

**Kapsam dışı:** Bildirimler (Faz 14), kapak görseli (Faz 12), kart üzerinde fareyle gelince çıkan tamamlama dairesi (bkz. açık soru 2), "Katıl" kısayolu, üyeye ya da tamamlanmaya göre filtre (Faz 14), panolar arası taşımada üyelerin düşmesi (Faz 13).

**Taslaktan sapmalar (gerekçeli)**
| Taslak | Bu plan | Neden |
|---|---|---|
| `isCompleted Boolean` + `completedAt DateTime?` | Yalnızca `completedAt DateTime?` (null = tamamlanmadı). İstekte `isCompleted`, DTO'da `completedAt` | Tek doğruluk kaynağı olur. Mevcut `archivedAt` / `archived` deseniyle aynı. |
| `CardMember`/`CardWatch` → `User` FK | `boardId` alanı eklenir. `(boardId, userId)` → `BoardMember` bileşik FK, `onDelete: Cascade` | Üye çıkarılınca temizliği DB kendisi yapar, yarış durumu oluşmaz, uygulama kodu gerekmez (§5). |
| Üye olmayan hedef → 422 | **400** `NOT_BOARD_MEMBER` | Mevcut `LABEL_NOT_IN_BOARD` (400) ile tutarlı. İstemci status'a değil koda bakıyor. |
| `@@index([userId])` | `@@index([userId, boardId])` | Hem FK cascade aramasını hem `myWatchedCardIds` sorgusunu hem de Faz 13 "Kartlarım" sorgusunu karşılar. |

## 2. Veritabanı şeması

`backend/prisma/schema.prisma` (değişen ve yeni bloklar):

```prisma
model BoardMember {
  boardId  String    @db.Uuid
  userId   String    @db.Uuid
  role     BoardRole @default(MEMBER)
  joinedAt DateTime  @default(now())

  board       Board        @relation(fields: [boardId], references: [id], onDelete: Cascade)
  user        User         @relation(fields: [userId], references: [id], onDelete: Cascade)
  cardMembers CardMember[]
  cardWatches CardWatch[]

  @@id([boardId, userId])
  @@index([userId])
}

model Card {
  id          String      @id @default(uuid()) @db.Uuid
  /// Denormalized from List for single-query access checks and room lookup.
  boardId     String      @db.Uuid
  listId      String      @db.Uuid
  title       String      @db.VarChar(512)
  description String?     @db.Text
  dueDate     DateTime?
  dueComplete Boolean     @default(false)
  /// Set when the card was marked complete; null means not complete.
  completedAt DateTime?
  coverColor  LabelColor?
  position    Float
  archivedAt  DateTime?
  createdAt   DateTime    @default(now())
  updatedAt   DateTime    @updatedAt

  board       Board        @relation(fields: [boardId], references: [id], onDelete: Cascade)
  list        List         @relation(fields: [listId], references: [id], onDelete: Cascade)
  labels      CardLabel[]
  checklists  Checklist[]
  members     CardMember[]
  watchers    CardWatch[]

  @@index([listId, position])
  @@index([boardId])
}

/// A board member assigned to a card. Leaving the board drops the row (FK to the membership).
model CardMember {
  cardId     String      @db.Uuid
  /// Same as the card's boardId; with userId it points at the board membership.
  boardId    String      @db.Uuid
  userId     String      @db.Uuid
  assignedAt DateTime    @default(now())

  card       Card        @relation(fields: [cardId], references: [id], onDelete: Cascade)
  membership BoardMember @relation(fields: [boardId, userId], references: [boardId, userId], onDelete: Cascade)

  @@id([cardId, userId])
  @@index([userId, boardId])
}

/// A user watching a card. Private to that user; never broadcast to the board.
model CardWatch {
  cardId    String      @db.Uuid
  boardId   String      @db.Uuid
  userId    String      @db.Uuid
  createdAt DateTime    @default(now())

  card       Card        @relation(fields: [cardId], references: [id], onDelete: Cascade)
  membership BoardMember @relation(fields: [boardId, userId], references: [boardId, userId], onDelete: Cascade)

  @@id([cardId, userId])
  @@index([userId, boardId])
}
```

- Migration: `npm run prisma:migrate -w backend -- --name card_completion_members_watch`. Yalnızca ekleme yapar; eski satırlarda değerler null kalır, backfill gerekmez. Migration dosyası elle düzenlenmez.
- `position` alanına dokunulmaz. Kart üyeleri `assignedAt asc, userId asc` sırasıyla döner.
- `test/utils/database.ts` değişmez: `TRUNCATE "User", "Board" CASCADE` yeni tabloları da boşaltır.

## 3. REST API

Hepsinde JWT zorunlu. `BoardAccessGuard` panoyu `:cardId` üzerinden bulur. Pano üyesi olmayana ya da kart yoksa **404 `NOT_FOUND`**. Hepsi `@BoardRole('MEMBER')` (Trello'daki gibi her üye herkesi atayabilir).

| Method + path | Gövde | Başarı | Hatalar |
|---|---|---|---|
| `PATCH /api/v1/cards/:cardId` | `UpdateCardDto` + `isCompleted?: boolean` (`@ValidateIf(≠undefined) @IsBoolean`), `coverColor?: LabelColor \| null` (`@ValidateIf(≠undefined && ≠null) @IsIn(LABEL_COLORS)`) | 200 `CardSummaryDto` | 400 `VALIDATION_FAILED` (`isCompleted: null`, `coverColor: 'red'`) |
| `PUT /api/v1/cards/:cardId/members/:userId` | — | 204. Zaten atanmışsa yine 204, event gitmez | 400 `VALIDATION_FAILED` (uuid değil, `ParseUUIDPipe`), 400 `NOT_BOARD_MEMBER` (hedef panonun üyesi değil), 409 `CONFLICT` (yarış: kart silindi ya da üye çıkarıldı → P2003) |
| `DELETE /api/v1/cards/:cardId/members/:userId` | — | 204. Atanmamışsa yine 204, event gitmez | 400 `VALIDATION_FAILED` |
| `PUT /api/v1/cards/:cardId/watch` | — | 204, tekrar edilirse de 204 | 409 `CONFLICT` (kart silindi) |
| `DELETE /api/v1/cards/:cardId/watch` | — | 204 | — |
| `GET /api/v1/boards/:boardId` | — | `BoardDetailDto` + `myWatchedCardIds` | (değişmez) |

Servis kuralları:
- `isCompleted: true` → `completedAt = current.completedAt ?? new Date()`: ilk tamamlanma anı korunur; bunun için `findOnBoard`'un select'ine `completedAt` eklenir. `false` → `null`. `dueComplete` alanından bağımsızdır (açık soru 1).
- Kart üyesi ataması (`CardMembersService.assign`): önce kart panoda mı diye bakılır (`card.findFirst({ id, boardId })`) ve hedefin `boardMember` kaydı aranır. Kayıt yoksa `notBoardMember()` fırlatılır. Sonra `cardMember.createMany({ data: [{ cardId, boardId, userId }], skipDuplicates: true })` çalışır; `count === 0` ise yayın yapılmaz. Desen `LabelsService.assign` ile aynı.
- İzleme (`CardWatchService`): `userId` her zaman `@CurrentUser().id` olur; başkası adına izleme yapılamaz.
- `BoardsService.getDetail(boardId, userId, myRole)`: `cardWatch.findMany({ where: { boardId, userId }, select: { cardId } })` sorgusu `Promise.all`'a eklenir. Arşivli kartlar da dahildir (arşivli kart penceresi için gerekli). Controller'a `@CurrentUser()` eklenir.
- Dosyalar:
  - `cards/card-members.controller.ts`: `CardMembersController` ve `CardWatchController`.
  - `cards/card-members.service.ts`, `cards/card-watch.service.ts`, `cards/card-members.errors.ts`.
  - `card.mapper.ts`: `CARD_SELECT`'e `completedAt`, `coverColor` ve `members: { select: { userId }, orderBy: [...] }` eklenir; `CardRow` ve `toCardSummary` güncellenir.
  - `cards.module.ts`.

## 4. Contracts (`@trello/contracts`)

```ts
// errors.ts
NOT_BOARD_MEMBER: 'NOT_BOARD_MEMBER',

// cards.ts — CardSummaryDto (CardDetailDto otomatik alır)
completedAt: string | null;
coverColor: LabelColor | null;
/** Board members on the card, in assignment order. */
memberIds: string[];

// cards.ts — UpdateCardRequest
/** true marks the card complete (keeps the first completion time); false clears it. */
isCompleted?: boolean;
/** null removes the cover. */
coverColor?: LabelColor | null;

export interface CardMemberChange { cardId: string; userId: string; }

// boards.ts — BoardDetailDto
/** Cards (active or archived) the current user watches. Per user; never broadcast. */
myWatchedCardIds: string[];

// realtime-events.ts
BoardEventMap: 'card:member-added': CardMemberChange; 'card:member-removed': CardMemberChange;
UserEventMap:  'card:watch-updated': { cardId: string; watching: boolean };
// BOARD_EVENTS / USER_EVENTS kayıtlarına eklenir (eksik kalırsa derleme kırılır).
```

**Socket sözleşmesi** (yalnızca commit sonrası, `X-Socket-Id` yankı kuralıyla):
| Event | Room | Payload | Ne zaman |
|---|---|---|---|
| `card:updated` (mevcut) | `board:<id>` | `{ card, descriptionChanged: false }`; `card` artık `completedAt`, `coverColor`, `memberIds` taşır | `isCompleted` / `coverColor` içeren PATCH |
| `card:member-added` | `board:<id>` | `{ cardId, userId }` | Yeni atama (`count > 0`) |
| `card:member-removed` | `board:<id>` | `{ cardId, userId }` | Silinen satır varsa |
| `card:watch-updated` | `user:<id>` (yalnızca izleyen kullanıcı; envelope `boardId` = pano) | `{ cardId, watching }` | Durum değiştiyse. Kullanıcının diğer sekmeleri bu event'le eşitlenir |
| `member:removed` (mevcut) | `board:<id>` | `{ userId }` | Çıkarılan kullanıcının kart üyelikleri DB'de cascade ile silindi; istemci bu `userId`'yi tüm kartların `memberIds` listesinden çıkarır. Kart başına ayrı event gönderilmez |

## 5. Panodan çıkarılan üyenin temizliği

- `MembersService.remove` içindeki `boardMember.delete` çağrısı, `CardMember` ve `CardWatch` satırlarını aynı SQL ifadesi içinde FK cascade ile siler. Uygulama kodu değişmez; işlem atomik olduğu için ayrıca `$transaction` gerekmez.
- Yarış durumu: atama, FK kontrolü sırasında `BoardMember` satırını `FOR KEY SHARE` ile kilitler. Bu yüzden eşzamanlı çıkarma ya bekler ya da atama P2003 alır → 409. Sonuçta üye olmayan birine ait satır kalamaz.
- Frontend: `applyBoardEvent('member:removed')` → `removeMember` artık kartlardan da `memberIds` siler. `applyCardEvent('member:removed')` → açık kartın `memberIds` listesinden çıkarır. Çıkarılan kişinin kendisi zaten panodan atılır (mevcut davranış).
- Faz 13 notu: panolar arası taşıma, taşıma transaction'ında `CardMember` ve `CardWatch` satırlarını açıkça silmeli. Silinmezse satırlarda eski `boardId` kalır.

## 6. Adımlar, etkilenen testler, commit sırası

Her commit kendi başına yeşil olmalı (build, typecheck, lint, unit). Playwright en sonda bir kez çalıştırılır (token ekonomisi).

**C1 — `feat(api): card completion, cover color, members and watching`** (backend-nest → frontend-react yalnızca cache katmanı → tester)
- Backend: şema, migration, contracts, §3 servisleri. `boards.controller` artık kullanıcıyı da geçirir.
- Frontend: contracts değişince derleme kırılacağı için bu commit'e giriyor.
  - `test/fixtures.ts`: `testCard` için `completedAt: null, coverColor: null, memberIds: []`, `boardDetail` için `myWatchedCardIds: []`.
  - `board-cache.ts`: `setCardMember(detail, cardId, userId, assigned)` ve `setCardWatched(detail, cardId, watching)` eklenir; `removeMember` kartlardan da siler.
  - `apply-board-event.ts` ve `apply-card-event.ts`: yeni case'ler; `member:removed` artık açık karttan da siler.
  - `card-detail-cache.ts`: `summaryOf`/`CardSummaryContent` üç yeni alanla genişler; `applyCardUpdate` `isCompleted` (iyimser `completedAt = now`) ve `coverColor` alanlarını işler; yeni `setMemberAssigned`.
  - `use-board-realtime.ts`: `card:watch-updated` gelince `setCardWatched` çağrılır.
  - `apply-board-list-event.ts`: yeni user event için değişiklik yapmayan case.
- Yeni testler:
  - Backend unit: `card-members.service.spec.ts` (üye değil → `NOT_BOARD_MEMBER`, tekrar atama → event yok, atanmamışı silme → event yok), `card-watch.service.spec.ts` (yalnızca `toUsers`, `toBoard` yok).
  - Backend e2e: `test/card-members.e2e-spec.ts` (mutlu yol; üye olmayan hedef 400; yabancı kullanıcı 404; başka panonun kartı 404; uuid değil 400; üye çıkarılınca o panodaki `CardMember`/`CardWatch` satırları silinir, başka panodakiler kalır; A'nın izlemesi B'nin `myWatchedCardIds` listesinde görünmez).
  - Frontend unit: `board-cache.test.ts`, `apply-board-event.test.ts`, `apply-card-event.test.ts`, `card-detail-cache.test.ts`, `apply-board-list-event.test.ts`, `use-board-realtime.test.tsx` (watch event).
- Güncellenen testler:
  - Backend: `card.dto.spec.ts` (`isCompleted` boolean, `coverColor` enum veya null), `card.mapper.spec.ts`, `cards.service.spec.ts` (ilk `completedAt` korunur, `false` temizler, `coverColor: null`), `boards.service.spec.ts` (imza + `myWatchedCardIds`), `checklist-items.service.spec.ts`, `checklists.service.spec.ts`, `checklist-counts.spec.ts` (`CardRow` mock'ları).
  - E2E: `cards.e2e-spec.ts` (PATCH round trip), `card-detail.e2e-spec.ts`, `checklists.e2e-spec.ts`, `boards.e2e-spec.ts` (tam şekil kontrolleri). `realtime-events.e2e-spec.ts`: üye ekle/çıkar ve etkisiz istek satırları, PATCH `isCompleted` → `card:updated`; izleme board room'a sızmıyor (`expectNoLeak`) ve yalnızca kendi diğer socket'ine gidiyor.
  - Frontend: literal `CardSummaryDto` kuran testler (`card-badges.test.tsx`, `use-card-realtime.test.tsx`, `use-move-checklist-item.test.tsx`) `testCard` kullanacak şekilde düzeltilir.

**C2 — `feat(card-detail): card members section and picker`** (frontend-react, ui-designer ikon ve boyut için)
- `card-detail-store.ts`: `CardPanel`'e `'members'` eklenir. `card-detail-content.tsx`: "Kart işlemleri" grubunun başına `PanelButton panel="members"` "Üyeler" gelir.
- Yeni dosyalar: `components/card-members-section.tsx` (başlık "Üyeler", liste `aria-label="Kartın üyeleri"`, avatar + ad), `components/member-picker.tsx` (pano üyeleri; checkbox'ın adı kişinin adı, yanında avatar), `hooks/use-card-members.ts` (desen `useCardLabels` ile aynı; `board.members` içinde olmayan id'ler gösterilmez).
- `api/use-card-mutations.ts`: `useToggleCardMember` (`useCardMutation` ile; `touches: member:<userId>`). `NOT_BOARD_MEMBER` için mesaj "Bu kişi artık panonun üyesi değil.". 409 durumunda mevcut çakışma mesajı ve refetch.
- `api/card-detail-api.ts`: `assignMember`, `unassignMember`. `shared/ui/avatar.tsx`: `size?: 'sm' | 'md'` prop'u (`Avatar` ve `AvatarStack`). `icons.tsx`: `MembersIcon`.
- Testler: yeni `card-members.test.tsx` (ata/çıkar iyimser görünür, 500'de geri alınır, `NOT_BOARD_MEMBER` mesajı, Escape paneli kapatıp odağı "Üyeler" düğmesine verir). `avatar.test.tsx` (`size`). Panel listesini sayan RTL testleri (`card-detail-route.test.tsx`).

**C3 — `feat(card-detail): complete a card and pick a cover color`** (frontend-react + ui-designer)
- Yeni `components/card-complete-toggle.tsx`: başlığın solunda yuvarlak native checkbox, adı **"Kartı tamamla"**. "Tamamlandı" adı kullanılmaz; o ad son tarih bölümünde var ve Playwright'ın alt dize eşleşmesiyle çakışır. Dokunmatikte 44 px. `card-detail-content.tsx`'te `CardTitleEditor` ile yan yana durur.
- `CardPanel`'e `'cover'` eklenir; "Kapak" `PanelButton`. Yeni `components/cover-picker.tsx`: `BackgroundPicker` deseninde native radio grubu, legend "Kapak rengi". Seçenekler "Kapak yok" ve `LABEL_COLORS` (`LABEL_COLOR_NAME` ile adlandırılır).
- Pencerenin üstünde `aria-hidden` kapak şeridi (`LABEL_COLOR_CLASS`); üzerine metin yazılmaz.
- `use-card-mutations.ts`: `CardEdit`'e `isCompleted` ve `coverColor` eklenir; `editParts` (`completedAt`, `coverColor`), `revertEdit` ve `applyAnswer` genişler.
- Testler: yeni `card-complete-toggle.test.tsx` ve `card-cover.test.tsx` (iyimser görünüm, hata olunca geri alma, ok tuşuyla seçim). `use-card-mutation.test.tsx` / `concurrent-card-mutations.test.tsx` (aynı parçaya iki istek gelirse son istek kazanır).

**C4 — `feat(card-detail): watch a card`** (frontend-react)
- `card-detail-header.tsx`: Kart menüsünün solunda `aria-pressed` düğmesi; görünen metin "İzle", erişilebilir adı "Kartı izle". Arşivli kartta da görünür. `icons.tsx`: `EyeIcon`.
- Yeni `api/use-toggle-card-watch.ts`: board cache'te iyimser `setCardWatched`. Hata olursa yalnızca o id geri alınır ve `showError` çağrılır; `boardMutationKey` paylaşılır, son mutation bitince invalidate yapılır. Durum `board.myWatchedCardIds` listesinden okunur; ayrı bir kopya tutulmaz. `board-detail/index.ts` `setCardWatched` fonksiyonunu dışa açar.
- Testler: yeni `card-watch.test.tsx` (aç/kapat, hata olunca geri alma), `card-detail-header.test.tsx`.

**C5 — `feat(board): card tile cover, completion, watch badge and member avatars`** (frontend-react + ui-designer)
- `card-tile-body.tsx`:
  - En üstte kenardan kenara kapak şeridi (`aria-hidden`).
  - Başlığın önünde, tamamlanmışsa `text-success` onay ikonu ve `sr-only` "Kart tamamlandı".
  - Rozet sırası: izleme (göz, `sr-only` "İzliyorsun"), açıklama, checklist, son tarih.
  - Sağ altta `AvatarStack` (`size="sm"`, `max={3}`, etiket "Kart üyeleri"). Avatarlar `badgesId` kapsayıcısının içinde durur; böylece tutamağın `aria-describedby` metnine girer.
  - `hasBadges` koşulu genişler.
- `board-canvas.tsx`: `members` map'i ve `watched` set'i bir kez kurulur; `board-list.tsx` → `card-tile.tsx` / `CardDragPreview` üzerinden aşağı geçirilir.
- Testler: `card-badges.test.tsx` (kapak, onay, göz, avatarlar, "+N", silinmiş üye gösterilmez), `board-cards.test.tsx`, `board-canvas.test.tsx` (prop zinciri).

**C6 — `test(e2e): card members, completion, cover and watching`** (tester)
- `e2e/card-detail.spec.ts`: Üye atama ve çıkarma, tamamlama, kapak, izleme; sayfa yenilendikten sonra karttaki ve penceredeki durum korunur. "Kart işlemleri" grubunda iki yeni düğme olduğu için `sideButton` kullanan testler gözden geçirilir.
- `e2e/realtime.spec.ts` (iki bağlam):
  - A, B'yi karta atar ve kapak seçer; B kartta avatarı ve kapağı canlı görür.
  - A, B'yi panodan çıkarır; B'nin avatarı A'nın ekranında kartlardan düşer.
  - B'nin izlemesi A'da görünmez.
- `e2e/a11y.spec.ts` (4 mod): "card members panel open", "card cover panel open", "board with a covered, completed, watched card with members".

**C7 — `docs: record phase 10`**: `docs/PLAN.md` ilerleme satırı. Ardından tam test turu ve code-reviewer.

## 7. Riskler

- **Eşzamanlılık:** Atama ile üye çıkarma yarışı §5'te çözülüyor. İki kullanıcı aynı anda tamamlar ya da kapak seçerse son yazan kazanır; `card:updated` iki tarafı eşitler. Ok tuşuyla kapak gezinirken her adımda bir PATCH gider; `touches: coverColor` claim'i yalnızca son cevabın uygulanmasını sağlar.
- **Gizlilik:** İzleme hiçbir board event'inde ve `CardSummaryDto`'da yer almaz; yalnızca kişiye özel `BoardDetailDto.myWatchedCardIds` ile döner. Bu, e2e'de `expectNoLeak` ile doğrulanır.
- **Performans:** `CARD_SELECT`'e eklenen `members` ilişkisi pano başına bir ek sorgu getirir (`@@id` öneki `cardId` index'i kullanılır). `myWatchedCardIds` sorgusu `[userId, boardId]` index'ini kullanır.
- **Geriye dönük uyumluluk:** Migration yalnızca ekleme yapıyor. DTO'lar yalnızca genişliyor; istemci ve sunucu birlikte deploy ediliyor.
- **Faz 13:** Panolar arası taşımada `CardMember`/`CardWatch` satırları silinmezse `boardId` tutarsızlaşır (§5 notu).

## 8. Açık sorular (önerilen varsayılanla)

1. **Kart tamamlama ile `dueComplete` bağlı olsun mu?** Varsayılan: hayır, ikisi bağımsız alanlar.
2. **Trello'daki gibi kartın üzerine gelince tamamlama dairesi çıksın mı?** Varsayılan: hayır. Sürükleme tutamağının içine etkileşimli öğe gerekiyor; kart penceresi ve kartın üzerindeki onay ikonu yeterli.
3. **Karta atanan kişi kartı otomatik izlesin mi?** Varsayılan: hayır. Bildirim olmadan bir etkisi yok; Faz 14'te yeniden değerlendirilir.
4. **Kapak yalnızca şerit mi olsun, yoksa Trello'daki "tam kapak" kipi de gelsin mi?** Varsayılan: yalnızca şerit.
5. **§1'deki dört sapma onaylanıyor mu?** (tek `completedAt` kolonu, `BoardMember` FK'sı, 400 `NOT_BOARD_MEMBER`, index sırası)
