# Faz 5 — Kart Detayı: Uygulama Planı

> `architect` rolüyle hazırlandı (2026-10-28). Kurallar: `CLAUDE.md`. Genel plan: `docs/PLAN.md` (§2, §3, §4 Kartlar/Etiketler/Checklist, §6, §8 Faz 5, §9).
> Metin Türkçe; kod, dosya ve tanımlayıcı adları İngilizce.

**Önkoşul:** Faz 4 commit'lendi (`efe7e01`, `7fbaae0`). B1, B4, F1 adımları Faz 4'te eklenen dosyalara dokunur (`card.mapper.ts`, `boards.service.ts`, `error-shape.ts`, `card-columns.ts`, `dnd-sensors.ts`).

---

## 1. Özet

**Amaç:** Kartın tıklanınca açılan, URL'si paylaşılabilen detay penceresi (`/boards/:boardId/c/:cardId`). Bu pencerede başlık, açıklama, son tarih, etiketler ve checklist'ler düzenlenir. Board'daki kart kutucukları da özet rozetleri gösterir.

**Kapsam içi**
- Route modal `CardDetailDialog`: tıklama veya Enter ile açılır, Escape / Kapat ile kapanır, doğrudan URL ile de açılabilir.
- Başlık düzenleme. Açıklama: düz metin, en fazla 10.000 karakter, boşsa `null`.
- `dueDate` (UTC'de saklanır, `tr-TR` yerel saatiyle gösterilir) + `dueComplete`.
- Etiket CRUD (`LabelsManager`) ve karta etiket ekleme/çıkarma (`LabelPicker`).
- Kart başına birden çok checklist: oluşturma, yeniden adlandırma, sıralama (yukarı/aşağı), silme.
- Maddeler: ekleme, düzenleme, tamamlandı işaretleme, silme, sürükle-bırak ile sıralama (aynı kartın checklist'leri arasında taşıma dahil; fare + klavye).
- Kutucuk rozetleri: etiket çipleri, son tarih (gecikti / yaklaşıyor / tamamlandı), checklist `x/y`, açıklama göstergesi.
- Teknik borç kartı: "Board detayında açıklamanın tamamını çekmeden hasDescription hesapla" → **bu fazda çözülür (B1)**. Açıklama yazımı bu fazda başlıyor; çözülmezse board yüklemesi her kartın 10k'lık metnini taşır.

**Kapsam dışı:** socket yayınları (Faz 7), markdown/link algılama, yorum, ek dosya, kart üyeleri, hatırlatma/bildirim, başka checklist'ten kopyalama, kart detayında "Taşı…" ve kalıcı silme (bkz. §10 S1–S2), checklist'leri sürükle-bırakla sıralama (yerine yukarı/aşağı butonları), `GET /boards/:boardId/labels` (bkz. §4.6).

**Ana kararlar (kısa)**
| Konu | Karar |
|---|---|
| Migration | **Gerekmiyor.** Tüm kolonlar ve index'ler `init_schema`'da var (§2). |
| `hasDescription` | Açıklama metni çekilmez. Ayrı bir id-kümesi sorgusu kullanılır (`description IS NOT NULL`). Boş metin `null`'a normalize edilir. |
| Modüller | `labels/` (etiket + kart-etiket) ve `checklists/` (checklist + madde, iki servis). Kart detayı `cards/` içinde. |
| Checklist/madde kilidi | Sıra değiştiren ya da satır silen her yazım önce **kart satırını** kilitler (`FOR NO KEY UPDATE`). Tek kilit olduğu için checklist'ler arası taşıma da güvenli. |
| Sayaçlar | DB'de tutulmaz; okurken hesaplanır. FE, kart detay cache'inden türetip board cache'indeki `CardSummary`'ye yazar. |
| Popover | **Kullanılmaz.** Dialog içinde açılıp kapanan satır içi bölümler kullanılır (§6.6). |
| Toast | Modal açıkken toast backdrop'un altında kalır ve inert olur. Kart detayındaki hatalar dialog içinde (`role="alert"`) gösterilir (§6.9). |
| FE feature | Yeni `features/card-detail/`. Bağımlılık tek yönlü: `card-detail → board-detail` (`index.ts` üzerinden). |

---

## 2. Veritabanı Şeması

**Değişiklik yok, migration yok.** Doğrulama (`backend/prisma/schema.prisma` + `migrations/20261027000000_init_schema/migration.sql`):

| İhtiyaç | Mevcut |
|---|---|
| `Card.description` (Text, null), `dueDate`, `dueComplete` | ✓ |
| Etiketler board'a göre | `Label_boardId_idx` ✓ |
| Kartın etiketleri / etiketin kartları | `CardLabel` PK `(cardId, labelId)` + `CardLabel_labelId_idx` ✓ |
| Kartın checklist'leri sıralı | `Checklist_cardId_position_idx` ✓ |
| Checklist'in maddeleri sıralı | `ChecklistItem_checklistId_position_idx` ✓ |
| Cascade | Board→Label, Card→CardLabel/Checklist, Label→CardLabel, Checklist→ChecklistItem hepsi `ON DELETE CASCADE` ✓ |

**Servis katmanı kuralları (DB'de değil)**
- `CardLabel`: `label.boardId === card.boardId`, aksi halde 400 `LABEL_NOT_IN_BOARD`.
- Madde ancak **aynı kartın** checklist'ine taşınabilir, aksi halde 400 `INVALID_TARGET`.
- `description` trim edilir; boşsa `null` yazılır. Böylece `hasDescription ⇔ description IS NOT NULL` olur. Faz 5'ten önce açıklama yazan bir API yoktu, yani mevcut satırların hepsi `null`.
- `dueDate: null` yazılınca `dueComplete` de `false` olur.
- Sıralama `ORDER BY position ASC, id ASC`. Unique kısıt yok (§3, PLAN).

**Sıralama stratejisi:** Listeler ve kartlarla aynı: `Float` + `POSITION_GAP` + gerektiğinde rebalance (`backend/src/ordering/placement.ts`, `place-and-rebalance.ts`). Yeni checklist/madde sona eklenir.

---

## 3. Paylaşılan Sözleşmeler (`shared/contracts/src/`)

### 3.1 Yeni `labels.ts`
`LabelDto` `boards.ts`'ten buraya taşınır. `boards.ts` bunu `import type` ile alır; dışarıdan import yolu (`@trello/contracts`) değişmez.

```ts
import type { LabelColor } from './enums.js';

export const LABEL_LIMITS = { NAME_MAX: 50 } as const;

export interface LabelDto {
  id: string;
  boardId: string;
  /** May be empty: a color-only label. */
  name: string;
  color: LabelColor;
}

export interface CreateLabelRequest {
  /** Trimmed; defaults to "". */
  name?: string;
  color: LabelColor;
}

export interface UpdateLabelRequest {
  name?: string;
  color?: LabelColor;
}
```

`enums.ts`'e ekle: `export const LABEL_COLORS: readonly LabelColor[] = Object.values(LabelColor);`. Bu dizi hem Postgres enum sırasıyla hem de renk seçicideki sırayla aynıdır.

### 3.2 Yeni `checklists.ts`
```ts
export const CHECKLIST_LIMITS = { TITLE_MAX: 200, ITEM_CONTENT_MAX: 500 } as const;

export interface ChecklistItemDto {
  id: string;
  checklistId: string;
  content: string;
  isCompleted: boolean;
  position: number;
}

export interface ChecklistDto {
  id: string;
  cardId: string;
  title: string;
  position: number;
  /** Ordered by (position, id). */
  items: ChecklistItemDto[];
}

/** New checklists go to the end of the card. */
export interface CreateChecklistRequest { title: string; }
export interface UpdateChecklistRequest { title: string; }

export interface ChecklistAnchors {
  afterChecklistId?: string | null;
  beforeChecklistId?: string | null;
}
export type MoveChecklistRequest = ChecklistAnchors;
export interface MoveChecklistResponse { id: string; position: number; }

/** New items go to the end of the checklist. */
export interface CreateChecklistItemRequest { content: string; }
export interface UpdateChecklistItemRequest { content?: string; isCompleted?: boolean; }

export interface ChecklistItemAnchors {
  afterItemId?: string | null;
  beforeItemId?: string | null;
}
export interface MoveChecklistItemRequest extends ChecklistItemAnchors {
  /** Target checklist on the same card; may be the item's current one. */
  checklistId: string;
}
export interface MoveChecklistItemResponse { id: string; checklistId: string; position: number; }
```

### 3.3 `cards.ts` değişiklikleri
```ts
export const CARD_LIMITS = { TITLE_MAX: 512, DESCRIPTION_MAX: 10_000 } as const;

export interface UpdateCardRequest {
  title?: string;
  /** Plain text. null, or only whitespace, clears it. */
  description?: string | null;
  /** ISO 8601 date-time with `Z` or an offset; null clears the due date (and dueComplete). */
  dueDate?: string | null;
  dueComplete?: boolean;
  /** true archives the card; false restores it to the end of its list. */
  archived?: boolean;
}

/** Everything the card dialog needs. Label names and colors come from the board detail. */
export interface CardDetailDto extends CardSummaryDto {
  boardId: string;
  description: string | null;
  /** Ordered by (position, id). */
  checklists: ChecklistDto[];
}
```
`index.ts`'e `export * from './labels.js'` ve `'./checklists.js'` eklenir.

### 3.4 Hata kodları
**Yeni `ErrorCode` gerekmiyor.** Kullanılanlar: `LABEL_NOT_IN_BOARD` (zaten var, ilk kez kullanılıyor), `INVALID_TARGET`, `POSITION_CONFLICT`, `NOT_FOUND`, `VALIDATION_FAILED`, `CONFLICT`. Ek olarak global filter'a Prisma `P2003` (FK ihlali; ebeveyn satır eşzamanlı silindi) → **409 `CONFLICT`** eşlemesi eklenir (`backend/src/common/filters/error-shape.ts`).

---

## 4. Backend

### 4.1 Dosyalar
```
backend/src/
├── access/
│   ├── access.errors.ts            + labelNotFound, checklistNotFound, checklistItemNotFound
│   ├── board-access.service.ts     + boardIdOfLabel, boardIdOfChecklist, boardIdOfChecklistItem
│   ├── board-access.guard.ts       resolveTarget sırası: boardId → listId → cardId → checklistId → itemId → labelId
│   └── board-role.decorator.ts     (JSDoc güncellemesi)
├── common/decorators/blank-to-null.decorator.ts   (trim; boşsa null; string değilse olduğu gibi)
├── common/filters/error-shape.ts   + P2003 → 409 CONFLICT
├── ordering/locks.ts               + lockCardRow(tx, boardId, cardId)
├── cards/
│   ├── card.mapper.ts              CARD_SELECT'ten description çıkar; toCardSummary(row, hasDescription); toCardDetail
│   ├── card-summaries.ts           findCardSummaries(db, where, orderBy?) — açıklamasız özetler
│   ├── cards.controller.ts         + @Get() detail (CardsController, 'cards/:cardId')
│   ├── cards.service.ts            + getDetail; update: description/dueDate/dueComplete
│   └── dto/card.dto.ts             UpdateCardDto genişler
├── boards/boards.service.ts        kartlar findCardSummaries ile; etiket mapper'ı labels/'tan
├── labels/
│   ├── labels.module.ts
│   ├── labels.controller.ts        BoardLabelsController, LabelsController, CardLabelsController
│   ├── labels.service.ts
│   ├── label.mapper.ts             LABEL_SELECT, LABEL_ORDER, toLabelDto (boards/board.mapper.ts'ten taşınır)
│   ├── labels.errors.ts            labelNotInBoard()
│   └── dto/label.dto.ts
├── checklists/
│   ├── checklists.module.ts
│   ├── checklists.controller.ts    CardChecklistsController, ChecklistsController, ChecklistItemsController (POST items)
│   ├── checklist-items.controller.ts   'checklist-items/:itemId'
│   ├── checklists.service.ts
│   ├── checklist-items.service.ts
│   ├── checklist.mapper.ts         CHECKLIST_SELECT/ORDER, ITEM_SELECT/ORDER, toChecklistDto, toChecklistItemDto
│   └── dto/checklist.dto.ts
└── app.module.ts                   + LabelsModule, ChecklistsModule
backend/test/
├── utils/board-fixtures.ts         createBoard/createList/createCard/addMember (yeni spec'ler için ortak)
├── card-detail.e2e-spec.ts
├── labels.e2e-spec.ts
└── checklists.e2e-spec.ts
```
`DEFAULT_LABEL_COLORS` `boards/board.mapper.ts`'te kalır. `LABEL_ORDER = [{ color: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }]`. Bu, mevcut sıraya deterministik bir eşitlik bozucu ekler.

### 4.2 Yetki çözümü (`BoardAccessGuard` / `BoardAccessService`)
- Guard parametreyi route'taki sıraya göre değil, **sabit öncelik sırasıyla** çözer: `boardId → listId → cardId → checklistId → itemId → labelId`. PLAN'daki "ilk id" notunun doğru anlamı budur.
- İki id'li route'lar:
  - `/cards/:cardId/labels/:labelId`: board kart üzerinden çözülür. Servis etiketi `{ id: labelId, boardId }` ile arar; bulamazsa 400 `LABEL_NOT_IN_BOARD`. Etiket hiç yoksa ya da başka bir board'daysa yanıt aynıdır, böylece başka board'ların etiketlerinin varlığı sızmaz. Bozuk `labelId` için `ParseUUIDPipe` → 400 `VALIDATION_FAILED` (members route'larıyla aynı).
  - `/checklists/:checklistId/items`: checklist üzerinden çözülür.
- Yeni çözümleyiciler. Hepsi önce `isUUID` kontrolü yapar, değilse `null` döner; sonuç `404 <X> not found` olur:
  ```ts
  boardIdOfLabel(labelId)        // label.findUnique({ select: { boardId } })
  boardIdOfChecklist(id)         // checklist.findUnique({ select: { card: { select: { boardId: true } } } })
  boardIdOfChecklistItem(id)     // checklistItem.findUnique({ select: { checklist: { select: { card: { select: { boardId: true } } } } } })
  ```
- Ek koruma: servislerdeki her sorgu `boardId` ile kapsanır (`where: { id, card: { boardId } }` vb.). Böylece guard yanlış yapılandırılsa bile başka board'un verisine yazılmaz. Servis metotları `boardId`'yi `@CurrentBoardId()` ile alır.

### 4.3 Kilitleme ve transaction sınırları
Yeni yardımcı (`backend/src/ordering/locks.ts`):
```ts
/** Locks the card row; checklist and item writes that change positions or delete rows take it first. */
export async function lockCardRow(tx, boardId, cardId): Promise<boolean>
// SELECT id FROM "Card" WHERE id = $cardId::uuid AND "boardId" = $boardId::uuid FOR NO KEY UPDATE
```
**Kilit sırası (uygulama geneli):** `Board → List → Card → (Checklist / ChecklistItem satırları)`. Hiçbir checklist yazımı List ya da Board kilitlemez. Kart taşıma da (List → Card) checklist kilitlemez. Bu yüzden döngü oluşmaz. `FOR NO KEY UPDATE`, checklist/madde insert'lerinin FK `KEY SHARE` kontrolüyle çakışmaz (`locks.ts`'teki gerekçeyle aynı).

| İşlem | Tx | Kilit | Notlar |
|---|---|---|---|
| `PATCH /cards/:id` (başlık/açıklama/tarih) | var (mevcut) | yok (sadece restore list kilidi alır) | Last-write-wins (PLAN risk 3) |
| `GET /cards/:id` | yok | yok | Tek sorgu, iç içe select |
| Etiket create/update/delete | yok | yok | Sıralama yok. Delete → `CardLabel` cascade |
| `PUT /cards/:cardId/labels/:labelId` | yok | yok | Önce etiket kontrolü, sonra `cardLabel.createMany({ skipDuplicates: true })` (`ON CONFLICT DO NOTHING`). Eşzamanlı etiket/kart silinirse P2003 → 409 |
| `DELETE /cards/:cardId/labels/:labelId` | yok | yok | `deleteMany` → her zaman 204 |
| Checklist create | var | `lockCardRow` | Kardeşler: kartın checklist'leri → `placeAndRebalance` (sona) |
| Checklist rename | yok | yok | `update where { id, card: { boardId } }`; P2025 → 404 |
| Checklist move | var | `lockCardRow` | Kilitten sonra checklist yeniden okunur (silinmişse 404). Checklist kart değiştiremez |
| Checklist delete | var | `lockCardRow` | Maddeler cascade. Kart kilidi, aynı anda o checklist'e madde taşınmasını sıraya sokar |
| Madde create | var | `lockCardRow` | `checklistId → cardId` çözülür → kilit → checklist hâlâ var mı (yoksa 404) → sona yerleştir |
| Madde update (content/isCompleted) | yok | yok | `update where { id, checklist: { card: { boardId } } }`; P2025 → 404 |
| Madde move | var | `lockCardRow` | Aşağıdaki prosedür |
| Madde delete | var | `lockCardRow` | Eşzamanlı bir rebalance'ın silinmiş satırı güncelleyip P2025 almasını önler |

**Madde taşıma prosedürü** (`ChecklistItemsService.move`, tek `$transaction`):
1. `cardId`'yi bul: `checklistItem.findFirst({ where: { id, checklist: { card: { boardId } } }, select: { checklist: { select: { cardId } } } })`. Yoksa 404 `Checklist item not found`.
2. `lockCardRow(tx, boardId, cardId)`. `false` dönerse kart silinmiştir → 404.
3. Maddeyi kilit altında yeniden oku; silinmişse 404. Maddeler kart değiştiremediği için kartlardaki "kilitten önce başka listeye geçti → 409" kontrolüne gerek yok: kart kilidi kartın **bütün** checklist'lerini kapsar.
4. Hedef: `checklist.findFirst({ where: { id: input.checklistId, cardId } })`. Yoksa (başka kart, başka board ya da silinmiş) → 400 `INVALID_TARGET`.
5. Kardeşler: hedef checklist'in maddeleri, taşınan madde hariç, `ITEM_ORDER` ile → `placeAndRebalance(siblings, { afterId, beforeId }, write)`. Anchor hedefte değilse 409 `POSITION_CONFLICT`.
6. `update { checklistId, position }` → `{ id, checklistId, position }`.

**Faz 7'ye hazırlık:** Emit yok. Her yazım `await this.prisma.$transaction(...)` ile biter, controller'a DTO döner. Transaction callback'i `cardId`'yi elinde tutar (madde/checklist yazımlarından sonra Faz 7'de `card:updated` için gerekecek). `placeAndRebalance` şu an sadece pozisyon döndürüyor; `position:rebalanced` yayını için Faz 7'de `Placement` döndürecek şekilde genişletilir.

### 4.4 Validasyon (class-validator)
Mevcut desen korunur: opsiyonel alanlar için `@ValidateIf((_, v) => v !== undefined)` (null reddedilir), metinler için `@Trim()`, anchor'lar için `@IsOptional() @IsUUID()`.

| DTO | Alan | Kural |
|---|---|---|
| `UpdateCardDto` | `description?` | `@BlankToNull()` + `@ValidateIf(v => v !== undefined && v !== null)` + `@IsString()` + `@MaxLength(CARD_LIMITS.DESCRIPTION_MAX)` (trim'den sonra sayılır) |
| | `dueDate?` | `null` olabilir. Değilse `@IsISO8601({ strict: true })` + `@Matches(ISO_DATETIME_WITH_ZONE)`. **Saat dilimi zorunlu** (`Z` ya da `±hh:mm`): dilimsiz değer sunucunun yerel saatiyle yorumlanırdı. Servis `new Date(dueDate)` yazar |
| | `dueComplete?` | `@IsBoolean()`, null reddedilir |
| `CreateLabelDto` | `name?` | null reddedilir, `@Trim() @IsString() @MaxLength(50)`, boş olabilir |
| | `color` | `@IsIn(LABEL_COLORS)` |
| `UpdateLabelDto` | `name?`, `color?` | Aynı kurallar, ikisi de opsiyonel |
| `CreateChecklistDto` / `UpdateChecklistDto` | `title` | `@Trim() @IsString() @IsNotEmpty() @MaxLength(200)` |
| `ChecklistAnchorsDto` | `afterChecklistId?`, `beforeChecklistId?` | `@IsOptional() @IsUUID()` |
| `CreateChecklistItemDto` | `content` | `@Trim() @IsString() @IsNotEmpty() @MaxLength(500)` |
| `UpdateChecklistItemDto` | `content?`, `isCompleted?` | null reddedilir; content kuralları aynı; `@IsBoolean()` |
| `MoveChecklistItemDto` | `checklistId` + `afterItemId?`, `beforeItemId?` | `@IsUUID()` (zorunlu) + anchor kuralları |

Global `ValidationPipe` (`whitelist`, `forbidNonWhitelisted`) bilinmeyen alanları zaten 400 ile reddeder (ör. ham `position`).

### 4.5 `hasDescription` (B1, teknik borç)
- `CARD_SELECT`'ten `description` çıkar. `toCardSummary(card: CardRow, hasDescription: boolean)`.
- `findCardSummaries(db, where, orderBy = CARD_ORDER)` iki sorguyu birlikte çalıştırır: biri özet satırları (`CARD_SELECT`), diğeri `{ AND: [where, { description: { not: null } }] }` ile sadece `id`'ler. İkincisinin sonucu bir `Set` olur. `IS NOT NULL` kontrolü TOAST'lanmış metni okumaz.
- Kullanım: `BoardsService.getDetail` (kartlar board sorgusundan ayrılır, `Promise.all`) ve `CardsService.listForBoard`.
- Tek kart yazımları: `create` → `false`. `update` → `select: { ...CARD_SELECT, description: true }` (tek satır olduğu için kabul) → `description !== null`.
- `getDetail` zaten `description` döndürür: `toCardDetail(row)`. Sayaçlar tam checklist'lerden hesaplanır.

### 4.6 Endpoint tablosu (`/api/v1`, hepsi JWT + `@BoardRole('MEMBER')`)

| Method | Path | Body | Başarı | Hatalar |
|---|---|---|---|---|
| GET | `/cards/:cardId` | – | 200 `CardDetailDto` (arşivli kart da döner) | 404 `Card not found` (yok/bozuk id/üye değil) |
| PATCH | `/cards/:cardId` | `UpdateCardRequest` | 200 `CardSummaryDto` | 400 (validasyon, `INVALID_TARGET` restore), 404 |
| POST | `/boards/:boardId/labels` | `CreateLabelRequest` | 201 `LabelDto` | 400, 404 `Board not found` |
| PATCH | `/labels/:labelId` | `UpdateLabelRequest` | 200 `LabelDto` | 400, 404 `Label not found` |
| DELETE | `/labels/:labelId` | – | 204 (kart atamaları cascade) | 404 |
| PUT | `/cards/:cardId/labels/:labelId` | – | 204 (idempotent) | 400 `VALIDATION_FAILED` (bozuk labelId), 400 `LABEL_NOT_IN_BOARD`, 404 `Card not found`, 409 `CONFLICT` (eşzamanlı silme) |
| DELETE | `/cards/:cardId/labels/:labelId` | – | 204 (idempotent; atanmamışsa da) | 400 (bozuk labelId), 404 `Card not found` |
| POST | `/cards/:cardId/checklists` | `CreateChecklistRequest` | 201 `ChecklistDto` (`items: []`) | 400, 404 |
| PATCH | `/checklists/:checklistId` | `UpdateChecklistRequest` | 200 `ChecklistDto` (maddeler dahil) | 400, 404 `Checklist not found` |
| POST | `/checklists/:checklistId/move` | `MoveChecklistRequest` | 200 `MoveChecklistResponse` | 400, 404, 409 `POSITION_CONFLICT` |
| DELETE | `/checklists/:checklistId` | – | 204 (maddeler cascade) | 404 |
| POST | `/checklists/:checklistId/items` | `CreateChecklistItemRequest` | 201 `ChecklistItemDto` | 400, 404 |
| PATCH | `/checklist-items/:itemId` | `UpdateChecklistItemRequest` | 200 `ChecklistItemDto` | 400, 404 `Checklist item not found` |
| POST | `/checklist-items/:itemId/move` | `MoveChecklistItemRequest` | 200 `MoveChecklistItemResponse` | 400 `INVALID_TARGET` / validasyon, 404, 409 `POSITION_CONFLICT` |
| DELETE | `/checklist-items/:itemId` | – | 204 | 404 |

Üye olmayan her durumda 404 alır. Rol kontrolü sadece MEMBER, dolayısıyla 403 oluşmaz. Ortak 401 her yerde geçerli.

**PLAN §4'ten sapmalar**
1. `GET /boards/:boardId/labels` **yapılmıyor**: etiketler board detayında geliyor ve FE'nin başka ihtiyacı yok. Gerekirse Faz 7'de eklenir.
2. `POST /checklist-items/:id/move` içindeki `checklistId` **zorunlu** (PLAN'da opsiyonel). `MoveCardRequest.listId` ile simetrik ve belirsizlik yok.
3. `PUT /cards/:cardId/labels/:labelId`: bozuk `labelId` 400 `VALIDATION_FAILED`, yok/başka board 400 `LABEL_NOT_IN_BOARD`.
4. `PATCH /checklists/:id` ve `POST /cards/:cardId/checklists` tam `ChecklistDto` döner (maddeler dahil).

---

## 5. WebSocket Sözleşmesi

Bu fazda **yayın yok** (Faz 7). PLAN §5'teki `card:updated`, `card:label-added/removed`, `label:*`, `checklist:*`, `checklist-item:*`, `position:rebalanced` olayları Faz 7'de commit'ten sonra eklenecek. Hazırlık maddeleri §4.3'te. FE'deki cache yardımcıları (`card-detail/lib/card-detail-cache.ts`) saf fonksiyonlardır ve id ile upsert yapar; böylece Faz 7'deki `applyBoardEvent` ve kart detayı olay işleyicisi bunları doğrudan kullanabilir.

---

## 6. Frontend

### 6.1 Route
`frontend/src/app/routes.tsx`. `boards/:boardId` route'una lazy bir child route eklenir:
```ts
{
  path: 'boards/:boardId',
  lazy: async () => { const { BoardPage } = await import('../features/board-detail'); return { Component: BoardPage }; },
  children: [
    {
      path: 'c/:cardId',
      lazy: async () => { const { CardDetailRoute } = await import('../features/card-detail'); return { Component: CardDetailRoute }; },
    },
  ],
},
```
`BoardPage` (`board-detail/components/board-page.tsx`) yüklenmiş durumda `<BoardCanvas/>`'ın kardeşi olarak `<Outlet />` render eder. Dialog board'un `DndContext`'i dışında kalır.

**Açma:** Kutucuk tıklanınca ya da Enter'a basılınca `navigate(`/boards/${boardId}/c/${cardId}`, { state: { fromBoard: true } })` çalışır.
**Kapatma:** `location.state?.fromBoard` doluysa `navigate(-1)`, değilse (URL ile açıldıysa) `navigate(`/boards/${boardId}`, { replace: true })`. Böylece geçmiş temiz kalır ve paylaşılan bir link "geri" ile uygulamadan çıkarmaz.
**Yanlış board:** `card.boardId !== boardId` ise `<Navigate replace to={`/boards/${card.boardId}/c/${card.id}`} />`. **404:** dialog içinde "Kart bulunamadı. Silinmiş olabilir." + "Panoya dön" (effect içinde navigate/toast yok).

### 6.2 Klasörler ve bağımlılık yönü
```
frontend/src/features/card-detail/
├── api/{card-keys, card-detail-api, checklists-api}.ts
├── api/{use-card-detail, use-card-mutation, use-card-mutations, use-checklist-mutations}.ts
├── components/{card-detail-route, card-detail-dialog, card-detail-alert, archived-card-banner,
│              card-title-editor, card-labels-section, label-picker, due-date-section, due-date-form,
│              card-description, checklists-section, checklist, checklist-item-row,
│              add-checklist-form, add-checklist-item-composer, checklist-progress}.tsx
├── hooks/{use-card-detail-close, use-description-editor, use-due-date-form,
│          use-add-checklist-item-form, use-checklist-dnd}.ts
├── lib/card-detail-cache.ts
├── schemas/card-detail-schemas.ts
├── store/card-detail-store.ts        (openPanel, error mesajı, duyuru metni)
└── index.ts                          (export { CardDetailRoute })
```
`board-detail/index.ts` şunları dışa açar (card-detail sadece bunları kullanır): `useBoard`, `boardMutationKey`, `patchCard`, `LabelsManager`, `useArchiveCardWithFocus`, `useRestoreCard`, `focusCardTile(card)` (`useCardUiStore.getState().focusCard` sarmalayıcısı). `board-detail` hiçbir zaman `card-detail`'i import etmez.

**Ortak koda taşınacaklar (F1, davranış değişikliği yok):**
- `board-detail/lib/card-columns.ts` içindeki id tabanlı genel fonksiyonlar → `shared/lib/sortable-columns.ts`. Genel adlar: `Columns`, `findColumn`, `moveToColumn`, `dropColumns`, `neighboursOf(columns, id) → { containerId, index, afterId, beforeId }`, `sameNeighbours`. `board-detail`'de `buildColumns(lists, cards)` ve kart adlarıyla `placeOf` ince bir adaptör olarak kalır.
- `board-detail/lib/dnd-sensors.ts` → `shared/lib/dnd-sensors.ts`.
- `sortByPosition` (`board-cache.ts`) → `shared/lib/sort-by-position.ts`.

### 6.3 Sorgu anahtarları
```ts
// features/card-detail/api/card-keys.ts
export const cardKeys = {
  all: ['cards'] as const,
  detail: (cardId: string) => [...cardKeys.all, 'detail', cardId] as const,
};
```
`useCardDetail(cardId)` → `cardDetailApi.get(cardId)`. Varsayılan `staleTime` 30 sn. Yüklenirken dialog, board cache'indeki özetten başlığı hemen gösterir, gövde için yükleniyor durumu gösterir.

### 6.4 Mutation altyapısı: `useCardMutation`
`card-detail/api/use-card-mutation.ts`, `useBoardMutation` ile aynı desende ama kart cache'i için:
- `mutationKey: boardMutationKey(boardId)` paylaşılır. Böylece "son mutation biterse yenile" kuralı board ve kart mutation'larını birlikte sayar.
- `onMutate`: `cardKeys.detail` ve `boardKeys.detail` için `cancelQueries` → kart snapshot'ı alınır → `optimistic(card, vars)` uygulanır → **`syncSummary()`**.
- `syncSummary()`: `patchCard(board, cardId, summaryOf(card))`. `summaryOf` sadece içerik alanlarını yazar: `title, description→hasDescription, dueDate, dueComplete, labelIds, checklistTotal, checklistDone`. `listId`/`position` **yazılmaz**, çünkü kart bu sırada board'da taşınmış olabilir. Kart board cache'inde yoksa (arşivli) no-op.
- `onError`: kart snapshot'ı geri yüklenir → `syncSummary()` tekrar çalışır. Tüm board snapshot'ı geri **yüklenmez**, böylece eşzamanlı başka board değişiklikleri ezilmez. Ardından dialog içi hata (`useCardDetailStore.showError`) gösterilir. 409/400 durumunda kart detayı invalidate edilir.
- `onSuccess`: `onSuccessCard(card, data, vars)`. **Sadece bu isteğin değiştirdiği alanlar** yazılır (ör. PATCH yanıtındaki `labelIds`, yolda olan bir etiket değişikliğini ezmesin diye kullanılmaz). Sonra `syncSummary()`.
- `onSettled`: `isMutating({ mutationKey }) === 1` ise `boardKeys.detail(boardId)` ve `cardKeys.detail(cardId)` invalidate edilir.

### 6.5 Mutation hook'ları

| Hook (dosya) | API | Optimistic | Kart özeti etkisi |
|---|---|---|---|
| `useUpdateCard(boardId, cardId)` (`use-card-mutations.ts`) | `PATCH /cards/:id` | ✓ alanları birleştir; `dueDate: null` ⇒ `dueComplete: false` | title, hasDescription, dueDate, dueComplete |
| `useToggleCardLabel` | `PUT`/`DELETE /cards/:id/labels/:labelId`; vars `{ labelId, assigned }` | ✓ labelIds'e ekle/çıkar | labelIds. `LABEL_NOT_IN_BOARD` → geri al + "Etiket bulunamadı, silinmiş olabilir." + board invalidate |
| `useCreateChecklist` (`use-checklist-mutations.ts`) | `POST /cards/:id/checklists` | ✗ (form bekler, buton `loading`) | – |
| `useRenameChecklist` | `PATCH /checklists/:id` | ✓ | – |
| `useMoveChecklist` | `POST /checklists/:id/move` | ✓ `positionBetween` | – |
| `useDeleteChecklist` | `DELETE /checklists/:id` | ✗ (`ConfirmDialog` bekler, `pending`/`error`) | sayaçlar |
| `useCreateChecklistItem` | `POST /checklists/:id/items` | ✗ (composer açık kalır, alan hemen boşalır; `useAddCardForm` deseni) | checklistTotal |
| `useUpdateChecklistItem` | `PATCH /checklist-items/:id` | ✓ content / isCompleted | checklistDone |
| `useMoveChecklistItem` | `POST /checklist-items/:id/move` | ✓ `positionBetween` + `checklistId` | – (toplamlar değişmez) |
| `useDeleteChecklistItem` | `DELETE /checklist-items/:id` | ✓ | checklistTotal/Done |
| `useCreateLabel` (`board-detail/api/use-label-mutations.ts`) | `POST /boards/:id/labels` | ✗ (`onSuccessCache` ekler) | – |
| `useUpdateLabel` | `PATCH /labels/:id` | ✓ (`useBoardMutation`) | – |
| `useDeleteLabel` | `DELETE /labels/:id` | ✗ (onaylı) → `onSuccessCache`: etiket + tüm kartların `labelIds`'inden çıkar | labelIds |

**Saf cache yardımcıları** (`card-detail/lib/card-detail-cache.ts`): `withCounters`, `summaryOf`, `upsertChecklist`, `patchChecklist`, `removeChecklist`, `upsertItem`, `patchItem`, `moveItem(card, itemId, checklistId, position)`, `removeItem`. Hepsi `sortByPosition` ile sıralar ve sayaçları yeniden hesaplar.

**Silinmiş etiket:** Dialog etiketleri `card.labelIds` ile `board.labels`'ın kesişiminden render eder (board etiket sırasıyla). Bu yüzden kart cache'inde kalan bayat bir `labelId` görünmez ve `board-detail`'in kart cache'ine dokunması gerekmez. Kutucuk çipleri de board etiket sırasıyla gösterilir, dolayısıyla `labelIds` sırası önemsizdir ve optimistic ekleme sona yapılabilir.

### 6.6 Bileşen ağacı ve popover kararı
```
BoardPage
├── BoardHeader            + "Etiketler" butonu → Dialog("Etiketler") → LabelsManager
├── BoardCanvas → BoardList → CardTile
│     └── CardTileBody (LabelChip ×n, başlık, CardBadges: DueBadge, açıklama ikonu, checklist x/y)
└── <Outlet/> → CardDetailRoute
    └── CardDetailDialog            (Dialog size="lg" hideTitle showCloseButton)
        ├── CardDetailAlert         (role="alert", kapatılabilir; card-detail-store)
        ├── ArchivedCardBanner      (archivedAt → "Bu kart arşivde" + "Geri yükle")
        ├── CardTitleEditor         (InlineEdit wrap) + "“Yapılacaklar” listesinde"
        ├── ana sütun
        │   ├── CardLabelsSection   çipler + "Etiketler" aç/kapa → LabelPicker | LabelsManager
        │   ├── DueDateSection      DueBadge + "Tamamlandı" checkbox + DueDateForm (aç/kapa)
        │   ├── CardDescription     görünüm (whitespace-pre-wrap) | DescriptionForm
        │   └── ChecklistsSection   DndContext (maddeler) + DragOverlay + duyuru konteyneri
        │       └── Checklist ×K    başlık (InlineEdit), ChecklistProgress, ↑/↓, Sil → ConfirmDialog
        │           ├── SortableContext → ChecklistItemRow ×N (tutamaç, checkbox, InlineEdit, sil)
        │           └── AddChecklistItemComposer
        └── yan sütun: "Etiketler", "Son tarih", "Checklist" (AddChecklistForm), "Arşivle"
```
**Popover yok, satır içi bölüm var.** Yan sütundaki butonlar (`aria-expanded` + `aria-controls`) ilgili bölümü dialog içinde açar ve odağı bölümün ilk alanına taşır. Kapatınca (Vazgeç/Escape) odak butona döner. Bölüm içindeki Escape `preventDefault + stopPropagation` ile dialog'u kapatmaz (`InlineEdit`'teki mevcut desen). Açık bölüm `card-detail-store.openPanel`'de tutulur.

Gerekçe:
1. Bağımlılık eklenmez.
2. Kart dialog'u zaten modal; içine ikinci bir top-layer katmanı, konumlandırma ve odak yönetimi eklemek hataya açık (PLAN risk 10).
3. Native `popover` jsdom'da yok, stand-in gerekirdi. CSS anchor positioning de henüz her tarayıcıda yok.
4. Satır içi bölüm mobilde ve klavyede doğal çalışır.

`LabelsManager` bir dialog değil, düz bir bileşendir: BoardHeader onu `Dialog`'a sarar, LabelPicker'ın "Etiketleri düzenle" modu ise satır içi gösterir.

**LabelPicker:** `<fieldset><legend>Etiketler</legend>` ve her etiket için `<input type="checkbox">` (renk örneği + ad; ad boşsa Türkçe renk adı, ör. "Yeşil etiket"). Değişim → `useToggleCardLabel`.
**LabelsManager:** satır başına renk örneği + ad + "Düzenle"; düzenleme formu: ad (`TextField`, ≤50) + renk radyo grubu (`<fieldset>`, 10 renk, `sr-only` renk adları) + Kaydet / Sil (`ConfirmDialog`: "Etiket tüm kartlardan kaldırılacak."); "Yeni etiket" formu. RHF + Zod (`board-detail/schemas/label-schemas.ts`). Hatalar bileşen içinde `FormAlert` ile.

### 6.7 Kutucuk (CardTile) değişiklikleri
- Aktivatör (`div`, dnd-kit `role="button"`): `aria-labelledby={titleId}`; erişilebilir ad sadece başlıktır (mevcut testler `getByRole('button', { name: title })` ile çalışmaya devam eder). `aria-describedby = [badgesId, CARD_OPEN_HINT_ID, attributes['aria-describedby']]`.
- **Açma:** `onClick` → aç. `onKeyDown` sarmalayıcısı: `Enter` + `!isDragging` + `!event.repeat` ise aç ve dnd-kit'e iletme; diğer tuşlar `listeners.onKeyDown`'a gider. **Space tutmaya devam eder** (mevcut Playwright testleri Space kullanıyor). Bırakma için Space/Enter değişmez.
- `SCREEN_READER_INSTRUCTIONS` → "Tutmak için boşluk tuşuna bas. Tutarken ok tuşlarıyla taşı, bırakmak için yine boşluk ya da Enter, vazgeçmek için Escape tuşuna bas." Listelerde de Space çalıştığı için doğru kalır. `BoardCanvas` bir kez gizli `<p id={CARD_OPEN_HINT_ID} hidden>Kartı açmak için Enter tuşuna bas.</p>` render eder.
- Rozetler sadece anlamlıysa render edilir (etiket yok, tarih yok, toplam 0, açıklama yok → hiçbiri). Böylece mevcut `textContent` tabanlı test yardımcıları (`board-cards.test.tsx` `cardTitles`, `e2e/cards.spec.ts` `board()`) bozulmaz. Yeni testler başlığı rol + ad ile sorgular.
- `CardDragPreview` aynı `CardTileBody`'yi kullanır.
- `labels` prop'u `BoardCanvas → BoardList → CardTile` yoluyla geçer (`Map<id, LabelDto>`).

### 6.8 Checklist maddesi sürükle-bırak (`card-detail/hooks/use-checklist-dnd.ts`)
- `use-board-dnd.ts`'in sadeleştirilmiş kopyası, sadece maddeler için. Id önekleri `item:<id>`, boş checklist droppable'ı `checklist-items:<id>`. `Columns = Record<checklistId, itemId[]>` (`shared/lib/sortable-columns.ts`). `onDragStart`'ta sütunlar kopyalanır, `onDragOver`'da başka checklist'e geçiş önizlenir, `onDragEnd`'de `neighboursOf` → `useMoveChecklistItem.mutate({ itemId, checklistId, afterItemId, beforeItemId })`. Bir kare geri zıplamayı önlemek için `dropped` deseni korunur.
- Satır işaretçi tutamacıdır (`{...listeners}`); grip butonu klavye tutamacıdır (`setActivatorNodeRef` + `{...attributes}`, `aria-label="“X” öğesini taşı"`). Bu, `BoardList`'teki liste deseninin aynısı. dnd-kit `KeyboardSensor` olay hedefi aktivatör değilse başlamaz, yani checkbox'taki Space işaretlemeye devam eder.
- Sensörler: `shared/lib/dnd-sensors.ts` (Mouse 5px, Touch 200ms) + `KeyboardSensor(sortableKeyboardCoordinates)`. Checklist'ler alt alta olduğu için ok tuşları checklist'ler arasında doğal olarak geçer.
- **Modal içi zorunluluklar:** `DndContext accessibility={{ container: <dialog içindeki eleman>, announcements, screenReaderInstructions }}`. dnd-kit live region'ı varsayılan olarak `document.body`'ye portal'lar; modal açıkken orası inert olduğundan duyurular okunmaz. `DragOverlay` portal'lanmaz, dialog içinde kalır (body'ye portal'lanırsa backdrop'un altında kalır).
- Türkçe duyurular: "“X” öğesi tutuldu. “Checklist” içinde 2. sırada.", "… “Test” checklist'inde 1. sıraya geldi/bırakıldı.", "Taşıma iptal edildi…".
- **Checklist sıralama** DnD değil: başlıkta "Yukarı taşı" / "Aşağı taşı" butonları (ilk/son durumda disabled). Taşıdıktan sonra odak aynı butona ref ile geri verilir (React'in yeniden sıralaması düğümü taşıyıp odağı düşürebilir) ve dialog içi live region'da "“X” checklist'i 2. sıraya taşındı." duyurulur.

### 6.9 Dialog, odak ve hata gösterimi
**`shared/ui/dialog.tsx` eklemeleri** (geriye uyumlu):
- `size?: 'md' | 'lg'`. `lg` → `max-w-3xl`, küçük ekranda tam genişlik, dikey kaydırma.
- `hideTitle?: boolean`. h2 `sr-only` olur, dialog'un erişilebilir adı korunur. Görünen başlık `CardTitleEditor`'dadır.
- `showCloseButton?: boolean`. Sağ üstte "Kapat" ikon butonu, **native** `dialog.close()` çağırır.
- `useDialogClose()` context hook'u: alt bileşenler native kapatmayı tetikler (`close` olayı → `onClose`).

**Odak**
- Açılış: kutucuk tıklama/Enter ile odaklıdır (opener). `showModal` ilk odaklanabilir elemana (başlık) odaklanır.
- Kapanış her zaman **native close** ile olur (Escape, Kapat, "Arşivle"). Tarayıcı odağı opener'a geri verir, sayfa inert olmaktan çıkar. Ardından `onClose` → navigate + `focusCardTile(summary)`; bu, URL ile açıldığı için opener'ın olmadığı durumu da kapsar. Sıra önemli: inert sayfada `focus()` sessizce başarısız olur.
- "Arşivle": native close → `useArchiveCardWithFocus(card)` (`useCardActions.archive`'daki "alttaki/üstteki kart ya da Kart ekle" mantığı bu hook'a taşınır) → toast "Geri al" (dialog kapandığı için görünür ve tıklanabilir).
- Tarayıcı "geri" butonuyla kapanma: dialog native close olmadan unmount olur, odak body'ye düşebilir. Kabul edilir (§9).

**Hata gösterimi:** Modal açıkken `RootLayout`'taki `Toaster` backdrop'un altında ve inert kalır: görünmez, okunmaz, tıklanamaz. Kart detayı mutation'ları hatayı `useCardDetailStore.showError(msg)` ile dialog içindeki `CardDetailAlert`'e (`role="alert"`) yazar. Board seviyesindeki toast'lar etkilenmez. (Toaster'ı top-layer'a taşımak Faz 8 konusu.)

### 6.10 Son tarih
- Yardımcılar `frontend/src/shared/lib/date.ts`'te (PLAN §6), saf ve `now` parametreli:
  ```ts
  export type DueStatus = 'done' | 'overdue' | 'soon' | 'upcoming';
  export const DUE_SOON_MS = 24 * 60 * 60 * 1000;
  export function getDueStatus(dueDate: string | null, dueComplete: boolean, now = Date.now()): DueStatus | null;
  export function formatDueShort(iso: string, now = Date.now()): string; // "5 Kas" (yıl farklıysa "5 Kas 2027")
  export function formatDueLong(iso: string): string;                    // "5 Kasım 2026 14:30"
  export function toDateTimeLocalValue(iso: string): string;            // yerel "YYYY-MM-DDTHH:mm"
  export function fromDateTimeLocalValue(value: string): string | null; // yerel → toISOString() (UTC), geçersizse null
  ```
  `Intl.DateTimeFormat('tr-TR', …)` modül seviyesinde bir kez oluşturulur. Durum render sırasında hesaplanır, canlı sayaç yok.
- `DueDateForm`: tek bir native `<input type="datetime-local">` (`TextField`, etiket "Son tarih"). Varsayılan değer mevcut tarih ya da yarın 12:00 (yerel). Butonlar: "Kaydet", "Kaldır" (tarih varsa), "Vazgeç". Zod: `z.string().min(1, 'Bir tarih ve saat seç.').refine(v => fromDateTimeLocalValue(v) !== null, 'Geçerli bir tarih gir.')`.
- "Tamamlandı" checkbox'ı sadece tarih varken görünür → `useUpdateCard({ dueComplete })`.

### 6.11 Açıklama
- Görünüm: `whitespace-pre-wrap break-words` ile düz metin, link algılama yok, `dangerouslySetInnerHTML` yok. Boşsa "Daha ayrıntılı bir açıklama ekle…" butonu.
- Düzenleme: `TextArea` (RHF + Zod `z.string().max(CARD_LIMITS.DESCRIPTION_MAX, …)`), "Kaydet" / "Vazgeç". Ctrl/Cmd+Enter kaydeder, Escape vazgeçer (dialog'u kapatmaz). Gönderilen değer trim edilir, boşsa `null`.

### 6.12 Yeni UI parçaları ve token'lar
- `shared/lib/label-color.ts`: `LABEL_COLOR_CLASS: Record<LabelColor, string>` (`bg-label-green` …), `LABEL_COLOR_NAME` (Yeşil, Sarı, Turuncu, Kırmızı, Mor, Mavi, Gök mavisi, Açık yeşil, Pembe, Siyah). `board-background.ts` ile aynı desen.
- `shared/ui/label-chip.tsx` (`size: 'sm' | 'md'`; adsız etiket kısa bir renk çubuğu, `sr-only` renk adı), `shared/ui/due-badge.tsx` (overdue → `bg-danger-subtle text-danger`, soon → `bg-warning-subtle text-warning`, done → `bg-success-subtle text-success`, upcoming → `text-fg-muted`; `sr-only` "Son tarih: 5 Kas 14:30, gecikti").
- `shared/ui/icons.tsx`: `ClockIcon`, `DescriptionIcon`, `ChecklistIcon`, `LabelIcon`, `TrashIcon`, `ChevronUpIcon`, `ChevronDownIcon`.
- `InlineEdit`'e `wrap?: boolean` (`truncate` yerine `whitespace-normal break-words`) eklenir; kart başlığı uzun olabilir.
- Checkbox: native + `accent-primary`. İlerleme: `div role="progressbar"` (`aria-valuenow`, `aria-valuetext="5 öğeden 2'si tamamlandı"`), dolgu `bg-primary`, %100'de `bg-success`, iz `bg-surface-sunken`.
- **Yeni renk token'ı beklenmiyor.** `ui-designer` iki temada şu kontrastları doğrular: `text-warning`/`bg-warning-subtle`, `text-on-label`/tüm `bg-label-*`, `text-success` küçük metin. Yetersizse `tokens.css`'e token ekler (ham renk başka yerde yazılmaz).

### 6.13 Erişilebilirlik özeti
Dialog adı = kart başlığı. Bölüm butonlarında `aria-expanded` var. Checkbox'ların adı madde metni. Grip/sil butonlarının adı "“X” öğesini taşı/sil". Silme sonrası odak bir sonraki maddenin checkbox'ına ya da composer butonuna gider; checklist silinince yan sütundaki "Checklist" butonuna. Duyurular dialog içindeki live region'dadır. Kutucukta Enter açar, Space tutar. `prefers-reduced-motion` için `DragOverlay dropAnimation={reduced ? null : undefined}` (board ile aynı).

---

## 7. Görev Dağılımı (sıralı, commit boyutunda)

Her adım kendi testleriyle birlikte commit'lenir (Conventional Commits, İngilizce). Akış: backend-nest → tester (e2e) → frontend-react (+ ui-designer) → tester → code-reviewer.

### Backend (`backend-nest`)
| # | Commit | İçerik | Eklenecek testler |
|---|---|---|---|
| B1 | `refactor(cards): compute hasDescription without loading descriptions` | §4.5; `card-summaries.ts`; `BoardsService.getDetail`, `CardsService.listForBoard` | `card.mapper.spec.ts` (hasDescription parametresi), `boards.service.spec.ts` güncellemesi. E2e: board detayındaki kartlarda `description` alanı **yok**; DB'de açıklama yazılan kart `hasDescription: true` |
| B2 | `feat(contracts): add card detail, label and checklist contracts` | §3; `LabelDto` taşıma, `LABEL_COLORS` | `npm run build -w shared/contracts` + iki tarafta typecheck |
| B3 | `feat(cards): edit description and due date, add card detail` | `UpdateCardDto`, `BlankToNull`, servis kuralları, `GET /cards/:cardId`, `checklist.mapper.ts` (detay için) | DTO spec: boş açıklama → null, 10.000 geçer / 10.001 reddedilir, null kabul, sayı reddedilir; `dueDate` dilimsiz → hata, `+03:00` kabul, null kabul. Service spec: `dueDate: null` ⇒ `dueComplete: false`. E2e `card-detail.e2e-spec.ts` (§8) |
| B4 | `feat(access): resolve the board from label, checklist and item ids` | §4.2 + `error-shape.ts` P2003 → 409 | Guard spec: `:checklistId`, `:itemId`, `:labelId` çözümü + doğru 404 mesajı; `cardId` + `labelId` birlikteyken kart kazanır. Service spec: bozuk/yok id → null. `error-shape.spec.ts`: P2003 → 409 `CONFLICT` |
| B5 | `feat(labels): add label CRUD and card label assignment` | `labels/` modülü, mapper taşıma, `LABEL_ORDER` | DTO spec. Service spec: başka board etiketi → `LABEL_NOT_IN_BOARD`, `skipDuplicates`, `deleteMany`. E2e `labels.e2e-spec.ts` |
| B6 | `feat(checklists): add checklists with ordering` | `lockCardRow`, `ChecklistsService` + controller'lar | Service spec: yazımdan önce kilit (`$queryRaw` ilk çağrı), kilit boşsa 404, anchor yoksa 409, rebalance yazımları. E2e (checklist kısmı) |
| B7 | `feat(checklists): add checklist items with toggle and move` | `ChecklistItemsService` + controller | Service spec: hedef başka kartta → `INVALID_TARGET`, aynı/farklı checklist yerleşimi. E2e (madde kısmı + eşzamanlılık + cascade) |

### Frontend (`frontend-react`, işaretli adımlarda `ui-designer`)
| # | Commit | İçerik | Eklenecek testler |
|---|---|---|---|
| F1 | `refactor(frontend): share sortable columns, dnd sensors and position sort` | §6.2 taşımaları | Mevcut testler taşınır, hepsi geçer (`card-columns.test.ts` → `sortable-columns.test.ts`, `dnd-sensors.test.ts`) |
| F2 | `feat(frontend): add due date helpers, label colors and badges` (+ ui-designer) | `date.ts`, `label-color.ts`, `LabelChip`, `DueBadge`, ikonlar, `Dialog` eklemeleri, `InlineEdit wrap` | `date.test.ts`: dört durum + sınırlar (tam şimdi, +24 sa, tamamlanmış ama geçmiş), yıl gösterimi, datetime-local gidiş-dönüş (DST günü dahil). `dialog.test.tsx`: `hideTitle` ad korunur, Kapat → `onClose`, `useDialogClose`. `inline-edit.test.tsx`: wrap |
| F3 | `feat(board-detail): show labels, due date and checklist badges on cards` (+ ui-designer) | §6.7 rozetler, `labels` prop'u | `board-cards.test.tsx`: çip adları / renk adı, tarih durumları (`vi.setSystemTime`), `2/5` ve tamamlanınca başarı tonu, açıklama göstergesi, rozetsiz kartta ek metin yok |
| F4 | `feat(board-detail): manage board labels` | labels API + `use-label-mutations.ts`, `LabelsManager`, header "Etiketler" | Hook: create (başarıda ekleme), update optimistic + rollback, delete → kartların `labelIds`'inden düşer. Bileşen: yeni etiket, yeniden adlandırma, onaylı silme, ad > 50 hata mesajı |
| F5 | `feat(card-detail): open cards in a route modal` | route, `Outlet`, feature iskeleti, `useCardDetail`, `useCardMutation`, başlık düzenleme, kapatma/odak, kutucuk tıklama/Enter, arşiv banner'ı + geri yükleme, "Arşivle", 404 durumu | `renderApp('/boards/B/c/C')` → dialog adı = başlık; Kapat/Escape → URL board, kutucuk odakta; kutucuk tıklaması ve Enter açar; Space hâlâ "tutuldu" duyurur; 404 → "Kart bulunamadı"; yanlış board → yönlendirme; başlık kaydı board kutucuğunda da görünür, hata → geri alma + dialog içi alert. `routes.test.tsx`: yeni route |
| F6 | `feat(card-detail): edit description and due date` | `CardDescription`, `DueDateSection`, şemalar | Açıklama: kaydet/vazgeç, Escape dialog'u kapatmaz, HTML düz metin görünür (`<b>` literal), boş → `null` gönderilir, kutucukta gösterge açılır/kapanır. Tarih: gönderilen ISO UTC, "Kaldır" → `null`, "Tamamlandı" → `dueComplete` |
| F7 | `feat(card-detail): assign labels to cards` | `CardLabelsSection`, `LabelPicker`, `useToggleCardLabel`, yönetim modu | Checkbox → PUT/DELETE gövdesiz istek; kutucukta çip hemen görünür; `LABEL_NOT_IN_BOARD` → geri alma + alert + board yenileme; silinmiş etiket id'si render edilmez |
| F8 | `feat(card-detail): add checklists and items` | checklist API/mutation'ları, bileşenler, yukarı/aşağı | **PLAN §9: madde işaretleme → board cache'inde `checklistDone` ve kutucuk `1/2` anında güncellenir; hata → ikisi de geri alınır.** Ayrıca: composer açık kalır, onaylı checklist silme sayaçları düşürür, yukarı/aşağı taşıma doğru anchor'ları gönderir ve odak butonda kalır |
| F9 | `feat(card-detail): drag checklist items within and across checklists` | `use-checklist-dnd.ts`, duyurular, live region konteyneri | `card-detail-cache.test.ts`: `moveItem` farklı checklist'e. Hook: `useMoveChecklistItem` optimistic pozisyon + rollback + 409 → kart yenilenir. DnD etkileşimi Playwright'ta |
| F10 | `test(e2e): cover card detail flows` (`tester`) | `frontend/e2e/card-detail.spec.ts`, `helpers.ts`'e geriye uyumlu yardımcılar (`seedCard`, `apiPatchCard`) | §8 Playwright |

**Faz sonu:** `code-reviewer` incelemesi. `docs/PLAN.md` "İlerleme" satırının güncellenmesi (sapmalar §4.6). Teknik borç kartının kapatılması. Demo board'daki ("Trello Clone — Geliştirme") açık kartlara "Bitti" checklist'i ekleme (dogfooding notu).

---

## 8. Test Planı

**Backend e2e (Supertest, `trello_test`)**
- `card-detail.e2e-spec.ts`: `GET` tam detay (boş checklist'ler, `description: null`); arşivli kart okunur; üye olmayana, `MISSING_ID`'ye ve `nope`'a 404 `Card not found`. `PATCH` açıklama (yaz → özet `hasDescription: true`, `"   "` → null/false, 10.001 → 400, sayı → 400). `dueDate` (`...Z` geri aynı döner, `+03:00` → UTC'ye çevrilir, dilimsiz → 400, `"yarın"` → 400). `dueComplete`; `dueDate: null` ⇒ `dueComplete: false`. Board detayında `description` alanı yok.
- `labels.e2e-spec.ts`: oluşturma (ad opsiyonel ve trim, geçersiz renk/uzun ad/bilinmeyen alan → 400); güncelleme (null ad → 400); silme → kartların `labelIds`'inden düşer. Atama: PUT iki kez → 204/204 ve tek kayıt; DELETE atanmamış → 204. **Başka board'un etiketi → 400 `LABEL_NOT_IN_BOARD`**, olmayan etiket → aynı, bozuk → 400 `VALIDATION_FAILED`. MEMBER rolü tüm CRUD'u yapabilir. Yabancıya 404 (`Label not found`, `Card not found`, `Board not found`). Board silinince etiketler gider.
- `checklists.e2e-spec.ts`: checklist sona eklenir (`GAP`, `2·GAP`), başlık trim, boş/201+ → 400, yeniden adlandırma, after/before/sona taşıma, bayat anchor ve başka kartın checklist'i anchor olunca → 409. Madde ekleme/düzenleme/işaretleme → **board detayında `checklistTotal/Done` doğru**. Checklist içinde taşıma; **aynı kartta başka checklist'e taşıma** (sayaçlar korunur, `GET` sırası doğru); başka kartın checklist'i → 400 `INVALID_TARGET`; başka board'un checklist'i → 400; başka checklist'teki anchor → 409; zorla rebalance → `GAP·(i+1)` ve sıra korunur. 20 paralel madde taşıma/ekleme/silme (iki checklist arasında) → 200/409 dışında yanıt yok, her checklist'te pozisyonlar benzersiz, toplam doğru. **Cascade:** checklist silinince maddeler, kart silinince checklist + maddeler + `CardLabel`, liste silinince hepsi gider. Yabancıya 404 (`Checklist not found`, `Checklist item not found`); bozuk id → 404.

**Backend unit:** §7 B1–B7 sütunu.

**Frontend unit/integration (Vitest + RTL + MSW):** §7 F1–F9 sütunu. Ek olarak:
- `card-detail-cache.test.ts`: `summaryOf` sayaçları, her saf yardımcı.
- `use-card-mutation.test.tsx`: iki eşzamanlı mutation'da yeniden çekme sadece sonuncusunda olur; hatada board'un geri kalanı ezilmez.

**Playwright (`frontend/e2e/card-detail.spec.ts`)**
1. **Rozetler:** Kutucuğa tıkla → URL `/boards/:id/c/:cardId`. "Yeşil" etiketini ata, son tarihi şimdi+2 saat olarak `fill` et (`YYYY-MM-DDTHH:mm`), açıklama yaz, "Yapılacaklar" checklist'ine 2 madde ekle ve 1'ini işaretle. Kapat → kutucukta çip, "yaklaşıyor" açıklamalı tarih rozeti, `1/2`, açıklama göstergesi var. Reload → hepsi kalıcı.
2. **URL ile açma:** API ile kart oluştur, `page.goto('/boards/B/c/C')` → dialog görünür, adı başlık. Escape → URL board, kutucuk odakta.
3. **Klavye:** Kutucuğa odaklan → Enter açar → Escape kapatır, odak kutucuğa döner. Space hâlâ "tutuldu" duyurusu yapar.
4. **Madde DnD:** fareyle maddeyi ikinci checklist'e taşı; grip butonuyla klavyede (Space, ArrowDown, Space) taşı ve duyuruları bekle. Reload → kalıcı.
5. **Gecikmiş tarih:** API ile geçmiş tarih yaz → kutucukta "gecikti". "Tamamlandı" işaretle → "tamamlandı".
6. **Etiket yönetimi:** Header "Etiketler" → "Acil"/kırmızı oluştur → kartta ata → yeniden adlandır → çip güncellenir → sil (onay) → çip kaybolur.
7. **Sürükleme kartı açmaz:** kartı başka listeye sürükledikten sonra dialog yok ve URL değişmemiş.

---

## 9. Riskler

1. **Modal ve global UI katmanları:** Toast'lar, dnd-kit live region'ı ve body'ye portal'lanan her şey modal açıkken inert olur. Önlem: dialog içi alert, `accessibility.container`, portal'sız `DragOverlay` (§6.8, §6.9). Faz 8'de Toaster top-layer'a taşınabilir.
2. **Odak iadesi:** Unmount native close'u tetiklemediği için tüm kapanışlar native `close()` üzerinden yapılır, sonra `focusCardTile` çağrılır. Tarayıcı "geri" butonuyla kapanmada odak body'ye düşebilir (kabul).
3. **Kutucukta tıklama ve sürükleme:** 5px aktivasyon mesafesi tıklamayla sürüklemeyi ayırır. Bırakma anında imleç `DragOverlay` üzerindedir, kutucuğa `click` düşmez. Playwright 7. senaryo bunu korur.
4. **Eşzamanlılık:** Checklist/madde sıralaması kart kilidiyle seri yapılır. Etiket/kart eşzamanlı silinirse FK P2003 → 409. Açıklama ve başlıkta last-write-wins (PLAN risk 3). İki kullanıcı aynı maddeyi aynı anda taşırsa ikincisi ilkinin sonucuna göre yerleşir ya da anchor bayatsa 409 alıp yeniden çeker.
5. **Optimistic yarışlar:** Ortak `mutationKey` sayesinde yeniden çekme sonuncuya kalır. Kart mutation'ları board snapshot'ını değil sadece özet alanlarını geri yazar. PATCH yanıtı sadece kendi alanlarını yazar.
6. **Saat dilimi:** Sunucu dilimsiz ISO'yu reddeder. FE yerel `datetime-local` değerini `toISOString()` ile UTC'ye çevirir. DST günleri birim testte. "Yaklaşıyor" durumu render anında hesaplanır, sayfa açık kaldıkça kendiliğinden güncellenmez (kabul).
7. **Performans:** Board detayı açıklama metnini artık taşımaz (B1). Bütün maddelerin `isCompleted` değerini çekmek MVP ölçeğinde sorun değil; gerekirse `groupBy` ile sayıma geçilir. Rebalance O(n), madde/checklist sayısında üst sınır yok (§10 S4).
8. **Güvenlik:** İki id'li route'larda ikinci id board/kart kapsamıyla doğrulanır. Etiket hatası başka board'daki etiketin varlığını sızdırmaz. Açıklama düz metin olarak render edilir (XSS yok). Tüm sorgular `boardId` ile kapsanır.
9. **Geriye dönük uyumluluk:** `UpdateCardRequest` sadece genişliyor. `CardSummaryDto` değişmiyor. `LabelDto` taşınıyor ama import yolu aynı. `SCREEN_READER_INSTRUCTIONS` metni değişiyor; mevcut testler Space kullandığı için etkilenmez. Kutucuk rozetleri `textContent` tabanlı yardımcıları sadece rozetli kartlarda etkiler.
10. **Faz 4 ile çakışma:** Giderildi; Faz 4 commit'lendi.
11. **Etiket sırası:** Yeni ya da rengi değişen etiket, optimistic olarak renk sırasına göre yerleşir. Aynı renkte eşitlik varsa yeniden çekmeden sonra küçük bir yer değişimi olabilir (kozmetik).

---

## 10. Açık Sorular (önerilen varsayılan parantez içinde)

1. **S1:** Kart detayında "Taşı…" olsun mu? (Hayır; kutucuktaki "…" diyaloğu yeterli. Sonra `CardMoveForm` olarak çıkarılabilir.)
2. **S2:** Aktif kart detayda kalıcı silinebilsin mi? (Hayır; önce arşiv, silme Arşiv diyaloğunda. Arşivli kart detayında sadece "Geri yükle".)
3. **S3:** Arşivli kart düzenlenebilsin mi? (Evet, backend kontrol etmez; banner gösterilir.)
4. **S4:** Checklist/madde/etiket sayısına üst sınır? (Faz 5'te yok; 300/dk rate limit var. Gerekirse `LIMIT_REACHED` kodu eklenir.)
5. **S5:** `GET /boards/:boardId/labels` gerekli mi? (Hayır, ertelendi.)
6. **S6:** Madde taşımada `checklistId` zorunlu mu? (Evet.)
7. **S7:** Tarih kaldırılınca `dueComplete` sıfırlansın mı? (Evet.)
8. **S8:** "Yaklaşıyor" eşiği? (24 saat.)
9. **S9:** Checklist'ler sürükle-bırakla sıralansın mı? (Hayır; yukarı/aşağı butonları. Talep olursa aynı DndContext'e eklenir.)
10. **S10:** Kaydedilmemiş açıklama taslağı dialog kapanınca? (Kaybolur, onay sorulmaz. Taslak saklama sonraki faz.)
11. **S11:** Kutucukta etiket adları mı, sadece renk mi? (Adlar kısaltılarak gösterilir; adsız etiketler renk çubuğu.)
12. **S12:** `hasDescription` için ayrı sorgu mu, `hasDescription` kolonu mu? (Ayrı id sorgusu: şema değişmez, denormalizasyon yok.)
