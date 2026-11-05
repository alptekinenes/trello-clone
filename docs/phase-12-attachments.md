# Faz 12 — Kart ekleri ve kapak görseli: Uygulama Planı

> `architect` rolüyle hazırlandı (2026-11-05). Kurallar: `CLAUDE.md`. Taslak: `docs/trello-parity-roadmap.md` §3 "Faz 12". Desen: `docs/phase-10-card-members.md`, `docs/phase-11-comments-activity.md`.
> Metin Türkçe; kod, dosya ve tanımlayıcı adları İngilizce.

**Önkoşul:** Faz 11 bitti (`48ef7b9`). Çalışma ağacı temiz.

## 1. Özet ve kapsam kararı

**Kapsam içi**
- Karta dosya yükleme (çoklu seçim, sürükle-bırak, ilerleme, iptal), listeleme, indirme, görsel önizleme (yeni sekme), silme (yükleyen ya da ADMIN+).
- Görsel ekin kapak yapılması / kaldırılması; kartta ve pencerede kapak görseli; kartta ek sayısı rozeti.
- Etkinlik kaydı: ek ekleme ve silme. Canlı güncelleme: `attachment:created|deleted`.
- Yetim dosya temizliği: commit sonrası silme + periyodik süpürme.

**Kapsam dışı:** S3 sürücüsü (aşağıda), bağlantı (URL) eki, ek adını değiştirme, küçük resim üretimi, uygulama içi görsel/PDF önizleyici, panoya bırakılan dosyayla kart oluşturma, panodan karta dosya bırakma, panoya/kullanıcıya kota, virüs taraması.

**S3 kararı: bu fazda yok.** Yalnız `StorageService` arayüzü + `LocalDiskStorage`. Gerekçe:
- `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner` onlarca geçişli `@smithy/*` paketi getirir; şu an onu isteyen bir dağıtım hedefi yok.
- Gerçek testi MinIO/LocalStack ister; bu makinede PostgreSQL yerel servis, Docker garanti değil. Mock'lu S3 testi az şey kanıtlar.
- Arayüz S3'e uyacak şekilde tasarlandı (§4). Ayrı adımda gelir: `STORAGE_DRIVER=local|s3`, `S3_*` env'leri; dosya rotası yetki kontrolünden sonra 60 sn'lik presigned GET'e 302 yönlendirir; süpürme `ListObjectsV2.LastModified` kullanır. `STORAGE_DRIVER` env'i tek değerle şimdiden eklenmez (ölü yapılandırma).

**Yeni bağımlılıklar (tam liste)**
| Paket | Workspace | Sürüm | Not |
|---|---|---|---|
| `file-type` | backend (dependencies) | `^22.2.0` | Magic byte tespiti. `@nestjs/common` 12.3.1 aynı sürümü zaten getiriyor; kilit dosyasında var, indirme olmaz. Yalnız ESM (backend ESM, sorun yok). |

Kurulum: `npx -y npm@11 install file-type@^22.2.0 -w backend`.
Gerekmeyenler: `multer` (`@nestjs/platform-express` 12.3.1 ile multer 2.5.0 geliyor; `storage` verilmezse bellek deposu kullanılır, `multer` import edilmez, `@types/multer` gerekmez). Frontend'e paket eklenmez (yükleme ilerlemesi için yerleşik `XMLHttpRequest`).

**Taslaktan sapmalar (gerekçeli)**
| Taslak | Bu plan | Neden |
|---|---|---|
| `S3Storage` + `STORAGE_DRIVER` | Yalnız arayüz + `LocalDiskStorage` | Yukarıdaki maliyet. |
| `GET /attachments/:id/url` (ek başına imzalı URL) | `GET /boards/:boardId/file-token`: pano + kullanıcıya bağlı HMAC anahtarı; URL'yi istemci kurar | 30 kapaklı pano tek istekle yüklenir (N+1 yok). Socket'ten gelen yeni kapak hemen gösterilir. Anahtar 5 dk'lık pencerede sabit olduğu için URL ve tarayıcı önbelleği sabit kalır. Ek id'leri tahmin edilemez uuid; sızan bir URL pratikte tek dosyayı açar. |
| `StorageService.signedUrl` | Arayüzde yok | Yerel sürücüde dosyayı kendi rotamız yetkiyle sunar. S3 adımı isteğe bağlı `redirectUrl` ekler. |
| Ek sayısı belirtilmemiş | `Card.attachmentCount` sayaç kolonu | `commentCount` ile aynı desen; pano yüklemesinde ek sorgu yok; sınır kontrolü de bu sayaçla kilit altında yapılır. |
| `@@index([cardId, createdAt])` | `[cardId, createdAt, id]` + `[boardId]` | Sıralı liste; pano silme cascade'i ve dosya anahtarlarının toplanması. |
| Süre "5 dk" | Geçerlilik 5–10 dk (pencereye yuvarlanır) | Sabit URL ile önbellek; §4.3. |

## 2. Veritabanı şeması

```prisma
enum ActivityType {
  // ...mevcut 8 değer
  CARD_ATTACHMENT_ADDED
  CARD_ATTACHMENT_REMOVED
}

model Attachment {
  id         String   @id @default(uuid()) @db.Uuid
  cardId     String   @db.Uuid
  /// Same as the card's boardId: single-query access checks and the board cascade.
  boardId    String   @db.Uuid
  uploaderId String   @db.Uuid
  /// Cleaned display name (no path, no control/bidi characters). Never part of a storage path.
  fileName   String   @db.VarChar(255)
  /// Detected from the content (magic bytes), never the client's claim. One of ATTACHMENT_MIME_TYPES.
  mimeType   String   @db.VarChar(100)
  /// Bytes, at most ATTACHMENT_LIMITS.MAX_BYTES.
  size       Int
  /// Server-generated uuid v4; the file's name in storage.
  storageKey String   @unique @db.VarChar(64)
  createdAt  DateTime @default(now())

  card     Card  @relation("CardAttachments", fields: [cardId], references: [id], onDelete: Cascade)
  board    Board @relation(fields: [boardId], references: [id], onDelete: Cascade)
  uploader User  @relation(fields: [uploaderId], references: [id], onDelete: Cascade)
  coverOf  Card? @relation("CardCover")

  @@index([cardId, createdAt, id])
  @@index([boardId])
}

// Card'a eklenir:
  /// Number of attachments; changed in the attachment's own transaction.
  attachmentCount   Int          @default(0)
  /// Image cover. Never set together with coverColor: the service clears the other one.
  coverAttachmentId String?      @unique @db.Uuid
  attachments       Attachment[] @relation("CardAttachments")
  coverAttachment   Attachment?  @relation("CardCover", fields: [coverAttachmentId], references: [id], onDelete: SetNull)
// Board ve User'a eklenir: attachments Attachment[]
```

- Migration: `npm run prisma:migrate -w backend -- --name card_attachments` (fazın tek migration'ı; enum değerleri dahil). Yalnız ekleme yapar; eski kartlarda `attachmentCount = 0` doğru başlangıç, backfill yok. PG 17'de `ALTER TYPE ... ADD VALUE` transaction içinde sorunsuz (yeni değer migration'da kullanılmıyor).
- **Kapak rengi ile kapak görseli birbirini dışlar** (Trello davranışı). Biri null olmayan değere ayarlanınca diğeri null yapılır; null yalnız o alanı temizler. İkisi birden null olmayan istek 400. Check constraint Prisma şemasında ifade edilemediği ve migration elle düzenlenmediği için kural serviste.
- Ek silinince `SetNull` kartın kapağını aynı ifadede temizler. Kart / liste / pano silinince ekler cascade ile gider (Card ↔ Attachment döngüsel FK; e2e ile doğrulanır, sorun çıkarsa `CardsService.remove` aynı transaction'da önce `coverAttachmentId = null` yazar).
- Panodan çıkarılan yükleyicinin ekleri kalır (FK `User`'a). `test/utils/database.ts` değişmez (`TRUNCATE ... CASCADE`); diskteki dosyalar için §9.

## 3. Contracts (`@trello/contracts`)

Yeni `attachments.ts` (`index.ts`'ten dışa açılır):
```ts
export const ATTACHMENT_LIMITS = { MAX_BYTES: 10 * 1024 * 1024, MAX_PER_CARD: 20, FILE_NAME_MAX: 255 } as const;
export const INLINE_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'] as const;
export const ATTACHMENT_MIME_TYPES = [
  ...INLINE_IMAGE_TYPES, 'application/pdf', 'application/zip', 'text/plain', 'text/csv', 'text/markdown',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',   // docx
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',         // xlsx
  'application/vnd.openxmlformats-officedocument.presentationml.presentation', // pptx
  'application/vnd.oasis.opendocument.text', 'application/vnd.oasis.opendocument.spreadsheet',
  'application/vnd.oasis.opendocument.presentation',
] as const;
export type AttachmentMimeType = (typeof ATTACHMENT_MIME_TYPES)[number];
/** For <input accept>; the server decides by content. */
export const ATTACHMENT_ACCEPT = '.png,.jpg,.jpeg,.gif,.webp,.pdf,.zip,.txt,.csv,.md,.docx,.xlsx,.pptx,.odt,.ods,.odp';
export function isInlineImage(mimeType: string): boolean;          // yalnız INLINE_IMAGE_TYPES; SVG asla
export interface AttachmentDto {
  id: string; cardId: string; fileName: string; mimeType: AttachmentMimeType; size: number;
  uploader: UserRefDto; createdAt: string;                         // storageKey hiçbir DTO'da yok
}
export interface AttachmentCreatedDto { attachment: AttachmentDto; attachmentCount: number }  // POST cevabı = event
export interface FileTokenDto { token: string; expiresAt: string }
export const FILE_TOKEN_REFRESH_MS = 4 * 60_000;
/** Path under /api/v1. Images are inline unless `download`; everything else is always a download. */
export function fileUrlPath(attachmentId: string, token: string, download?: boolean): string;
// → `/files/${id}?token=${encodeURIComponent(token)}` (+ `&download=true`)
export function canDeleteAttachment(viewer: MemberRef, uploaderId: string): boolean; // yükleyen || ADMIN+
```
- `cards.ts`: `CardSummaryDto` + `attachmentCount: number`, `coverAttachmentId: string | null`. `CardDetailDto` + `attachments: AttachmentDto[]` (en yeni başta, en fazla 20; ayrı liste uç noktası yok). `UpdateCardRequest` + `coverAttachmentId?: string | null`.
- `activity.ts`: iki tip; `AttachmentRefData { id: string; fileName: string }`; `CARD_ATTACHMENT_ADDED|REMOVED: { cardTitle: string; attachment: AttachmentRefData }`.
- `errors.ts`: `PAYLOAD_TOO_LARGE` (413), `UNSUPPORTED_FILE_TYPE` (415), `ATTACHMENT_LIMIT_REACHED` (409), `INVALID_COVER` (400), `FILE_TOKEN_INVALID` (403).
- `realtime-events.ts` (`BOARD_EVENTS` kaydı dahil): `'attachment:created': AttachmentCreatedDto`, `'attachment:deleted': { id: string; cardId: string; attachmentCount: number }`.

## 4. Backend

### 4.1 Depolama (`backend/src/storage/`)
```ts
export interface StoredFile { stream: Readable; size: number }
/** DI token; one driver per process. Keys are server-made uuids, never user input. */
export abstract class StorageService {
  abstract put(key: string, body: Buffer, contentType: string): Promise<void>;
  abstract open(key: string): Promise<StoredFile | null>;   // dosya yoksa null
  abstract delete(key: string): Promise<void>;              // yoksa hata değil
  abstract listOlderThan(cutoff: Date): AsyncIterable<string>;
  /** After a commit: logs failures, never throws (the sweep retries). */
  async deleteQuietly(keys: readonly string[]): Promise<void>;
}
```
- `LocalDiskStorage`: kök `path.resolve(UPLOAD_DIR)`, düz dizin, dosya adı = anahtar (uzantısız).
  - **Path traversal:** her metot önce anahtarı `STORAGE_KEY_PATTERN` (uuid v4, küçük harf) ile doğrular, değilse `Error` (500, programcı hatası). Yol `path.join(root, key)`; kullanıcı girdisi yola hiç ulaşmaz (dosya rotası id → DB → anahtar).
  - `put`: `writeFile(path, body, { flag: 'wx', mode: 0o600 })` (üzerine yazmaz). `open`: `stat` + `createReadStream`, ENOENT → null. `delete`: `rm(path, { force: true })`. `listOlderThan`: `opendir`, yalnız desene uyan adlar, `mtime < cutoff`.
  - `onModuleInit`: `mkdir(root, { recursive: true })`; yazılamıyorsa uygulama açılmaz.
- `StorageModule`: `{ provide: StorageService, useClass: LocalDiskStorage }`, `StorageSweepService`; `StorageService`'i dışa açar.

### 4.2 Env (`config/env.validation.ts`, `.env.example`, README tablosu, `.gitignore`)
| Değişken | Zorunlu | Varsayılan | Kural |
|---|---|---|---|
| `UPLOAD_DIR` | Production'da evet | `uploads` (backend çalışma dizinine göre) | Boş olamaz; production'da ayarlı ve mutlak yol olmalı (`productionProblems`). Statik sunulan bir dizinde olmamalı. |
| `UPLOAD_RATE_LIMIT_PER_MINUTE` | Hayır | `30` | 1–10000; lazy okuma `uploadRateLimit()` (diğer limitler gibi). |
| `STORAGE_SWEEP_INTERVAL_MINUTES` | Hayır | `60` | 0–1440; 0 süpürmeyi kapatır. |

`.gitignore`: `backend/uploads/`. İmza anahtarı için yeni env yok: `hkdfSync('sha256', JWT_ACCESS_SECRET, '', 'trello-clone/file-token/v1', 32)` (açık soru 7).

### 4.3 Dosya erişim anahtarı ve dosya rotası (`backend/src/attachments/file-token.ts`, saf fonksiyonlar)
- Üretim: `exp = (floor(nowSec / 300) + 2) * 300` → kalan süre 300–600 sn; aynı pencerede aynı kullanıcı + pano için aynı anahtar. `sig = base64url(HMAC-SHA256(key, "file-token|<boardId>|<userId>|<exp>"))`. Anahtar: `<boardId>.<userId>.<exp>.<sig>`.
- Doğrulama sırası (ilk üçü DB'ye dokunmaz): 4 parça + iki uuid + tamsayı `exp` → `now < exp ≤ now + 600` → eşit uzunlukta `timingSafeEqual` → tek sorgu `attachment.findFirst({ where: { id, boardId, board: { members: { some: { userId } } } }, select: { storageKey, mimeType, fileName, size } })`. Üyelik her istekte bakılır: panodan çıkarılan kişinin anahtarı hemen işe yaramaz.
- **`GET /api/v1/files/:attachmentId?token=&download=`** — `@Public()` (`<img>` Bearer gönderemez), genel rate limit (throttler kovası rota başına). `FileQueryDto`: `token` `@IsString @MaxLength(200)`, `download` `ArchivedQueryDto` dönüşüm deseniyle boolean.
- Yanıt başlıkları (`@Res({ passthrough: true })` + `StreamableFile`):
  - `Content-Type`: kayıttaki tür; `text/*` için `; charset=utf-8`. İstemcinin beyanı hiç kullanılmaz.
  - `Content-Disposition`: `isInlineImage && !download` → `inline`, aksi halde her zaman `attachment`. Ad `content-disposition.ts` ile: `filename="<ASCII yedek>"; filename*=UTF-8''<RFC 5987>`. Yedekte Türkçe harfler sadeleşir (ç→c, ğ→g, ı→i, İ→I, ö→o, ş→s, ü→u; büyükleri de), kalan ASCII dışı karakterler, `"`, `\` ve kontrol karakterleri `_` olur; `filename*` `encodeURIComponent` + `'()*` kodlaması.
  - `X-Content-Type-Options: nosniff` (Helmet zaten koyuyor; açıkça yazılır ve test edilir).
  - `Content-Security-Policy: default-src 'none'; style-src 'unsafe-inline'; sandbox` (Helmet'in API CSP'sinin yerine).
  - `Cache-Control: private, max-age=<exp - now>`; `Content-Length`; `Accept-Ranges: none`. **Range desteklenmez** (Range başlığı yok sayılır, her zaman 200 tam gövde): en fazla 10 MB, video/ses yok, PDF satır içi açılmıyor.
  - Helmet varsayılanları kalır: `Cross-Origin-Resource-Policy: same-origin`, `Referrer-Policy: no-referrer`.
- Hatalar: `token` yok → 400 `VALIDATION_FAILED`; bozuk / kurcalanmış / süresi dolmuş → 403 `FILE_TOKEN_INVALID`; `attachmentId` uuid değil, ek yok, başka panonun eki ya da kişi üye değil → 404; DB satırı var ama dosya yok → 404 + `warn` log.
- **CSP etkisi:** Dosyalar SPA ile aynı origin'den (`/api/v1/files`) gelir; SPA CSP'sinde `img-src 'self'` yeterli, `blob:`/`data:` gerekmez (README "SPA için CSP" notuna eklenir).

### 4.4 Uç noktalar
JWT zorunlu (dosya rotası hariç). Guard param sırasının sonuna `:attachmentId` eklenir (`commentId`'den sonra): `BoardAccessService.boardIdOfAttachment`, `access.errors.ts` → `attachmentNotFound()`. Üye olmayana / bulunamayana 404.

| Method + path | Rol | Gövde | Başarı | Hatalar |
|---|---|---|---|---|
| `POST /api/v1/cards/:cardId/attachments` | MEMBER | multipart, tek alan `file` | 201 `AttachmentCreatedDto` | 400 `VALIDATION_FAILED` (dosya yok, boş dosya, iki dosya, fazladan alan, yanlış alan adı); 404; 409 `ATTACHMENT_LIMIT_REACHED`; 413 `PAYLOAD_TOO_LARGE`; 415 `UNSUPPORTED_FILE_TYPE`; 429 |
| `DELETE /api/v1/attachments/:attachmentId` | MEMBER (+ servis kuralı) | — | 204 | 403 `FORBIDDEN` (yükleyen değil ve ADMIN altı); 404 (yok ya da zaten silinmiş) |
| `GET /api/v1/boards/:boardId/file-token` | MEMBER | — | 200 `FileTokenDto`, `Cache-Control: no-store` | 404 |
| `PATCH /api/v1/cards/:cardId` | MEMBER | + `coverAttachmentId?: uuid \| null` (`@ValidateIf(≠undefined && ≠null) @IsUUID`) | 200 `CardSummaryDto` | 400 `VALIDATION_FAILED` (`coverColor` ve `coverAttachmentId` ikisi birden null değil); 400 `INVALID_COVER` (ek bu kartta değil ya da görsel değil); 409 (ek o anda silindi, P2003) |
| `GET /api/v1/files/:attachmentId` | Public + anahtar | §4.3 | 200 akış | §4.3 |

**Multer** (`attachments/upload.options.ts`): `FileInterceptor('file', { limits: { fileSize: MAX_BYTES, files: 1, fields: 0, parts: 1, headerPairs: 20 }, defParamCharset: 'utf8' })`.
- `storage` verilmez → **bellek** (`file.buffer`, istek başına en fazla 10 MB). Akış yerine bellek seçildi: geçici dosya ve temizliği yok, magic byte kontrolü buffer üzerinde. Guard'lar interceptor'dan önce çalıştığı için gövde ancak kimliği doğrulanmış pano üyesi için okunur.
- `defParamCharset: 'utf8'` zorunlu: varsayılan latin1, tarayıcının gönderdiği UTF-8 Türkçe dosya adını bozar.
- Nest, multer'ın `LIMIT_FILE_SIZE` hatasını 413'e, diğer limit hatalarını 400'e çevirir. `error-shape.ts` `CODE_BY_STATUS`'a `413 → PAYLOAD_TOO_LARGE` eklenir.

**Rate limit:** `@Throttle({ default: { limit: uploadRateLimit, ttl: 60_000 } })` + `@UseGuards(UserThrottlerGuard)` (`common/guards/user-throttler.guard.ts`, `ThrottlerGuard`'ı genişletir, `getTracker` → `user:<id>`). Global throttler JWT'den önce çalıştığı için kullanıcıyı bilemez; metot seviyesindeki guard ondan sonra çalışır. Sonuç: bu rotada kullanıcı başına ve IP başına dakikada `UPLOAD_RATE_LIMIT_PER_MINUTE`.

**Tür tespiti** (`attachments/detect-file-type.ts`): `fileTypeFromBuffer` sonucu varsa ve `ATTACHMENT_MIME_TYPES` içindeyse o tür; tespit yoksa yalnız `.txt/.csv/.md` uzantısında, `buffer.isUtf8` ve NUL / C0 kontrol karakteri yoksa (`\t \n \r` hariç) ilgili `text/*`; diğer her durum `null` → 415. SVG, HTML, XML, legacy Office (`x-cfb`), çalıştırılabilirler reddedilir. Satır içi yalnız png/jpeg/gif/webp.

**Dosya adı** (`attachments/file-name.ts`): NFC; son `/` ya da `\`'den sonrası; C0/C1 kontrol ve bidi karakterleri (U+200E/F, U+202A–202E, U+2066–2069) silinir; boşluklar sadeleşir, kırpılır; 255'i aşarsa uzantı korunarak kısaltılır; boşsa `dosya`.

**`AttachmentsService.upload`**
1. Tür tespiti ve boş dosya kontrolü (diske yazmadan önce).
2. Ön kontrol: `card.findFirst({ id, boardId }, select attachmentCount)`; yoksa 404, sınırdaysa 409 (gereksiz yazmayı önler, asıl kontrol 4. adımda).
3. `key = randomUUID()`, `storage.put`.
4. `$transaction`: `card.update({ where: { id, boardId }, data: { attachmentCount: { increment: 1 } }, select: { attachmentCount, title } })` (kart satırını kilitler, silinmişse P2025 → 404); `attachmentCount > MAX_PER_CARD` → 409 (geri alınır); `attachment.create`; `activity.record(CARD_ATTACHMENT_ADDED)`.
5. 3'ten sonra herhangi bir hata → `storage.deleteQuietly([key])` ve hata yeniden fırlatılır.
6. Commit sonrası: `attachment:created`, ardından `activity:created`.

**`AttachmentsService.remove`** (yorum silme deseni): `findFirst({ id, boardId })` → `canDeleteAttachment` → `card.update(decrement)` (önce kart satırı) → `deleteMany`; `count === 0` → 404 (geri alınır) → `activity.record(CARD_ATTACHMENT_REMOVED)`. Commit sonrası `attachment:deleted` + `activity:created`, sonra `storage.deleteQuietly([storageKey])`.

**`CardsService.update` (kapak):** `coverAttachmentId` null değilse aynı transaction'da `attachment.findFirst({ id, cardId, boardId }, select mimeType)`; yoksa ya da `!isInlineImage` → `INVALID_COVER`; `coverColor = null` yazılır. `coverColor` null değilse `coverAttachmentId = null`. (Checked input'ta ilişki `connect`/`disconnect` ile yazılır.) Kapak değişikliği etkinlik üretmez (Faz 10'daki kapak rengi gibi).

**Mapper'lar:** `attachments/attachment.mapper.ts` (`ATTACHMENT_SELECT` + `USER_REF_SELECT`). `card.mapper.ts`: `CARD_SELECT` + `attachmentCount`, `coverAttachmentId`; `CARD_DETAIL_SELECT` + `attachments` (`createdAt desc, id desc`); `CardRow`, `toCardSummary`, `toCardDetail`.

**Dosyalar:** `backend/src/attachments/`: `attachments.module.ts`, `attachments.controller.ts` (`CardAttachmentsController`, `AttachmentsController`, `FileTokenController`, `FilesController`), `attachments.service.ts`, `file-access.service.ts` (anahtar + dosya sunumu), `file-token.ts`, `content-disposition.ts`, `detect-file-type.ts`, `file-name.ts`, `upload.options.ts`, `attachment.mapper.ts`, `attachments.errors.ts`, `dto/file-query.dto.ts`. `AttachmentsModule` → `StorageModule`, `ActivityModule`, `RealtimeModule`.

## 5. Silme ve yetim dosyalar

Kural: önce DB, commit'ten sonra dosya. Ters sıra (dosya gitti, satır kaldı) hiç olmaz. Dosya silme başarısızsa istek yine başarılıdır; dosya yetim kalır ve süpürme siler. Dosya rotası her istekte DB'ye baktığı için yetim dosya hiçbir zaman sunulmaz; yetim kalma yalnız disk alanı sorunudur.

| İşlem | Anahtarlar | Sonra |
|---|---|---|
| Ek silme | silinen satırdan | `deleteQuietly` |
| `CardsService.remove` | silmeden önce `attachment.findMany({ cardId, boardId })` | `deleteQuietly` |
| `ListsService.remove` | `findMany({ boardId, card: { listId } })` | `deleteMany` sonrası `deleteQuietly` |
| `BoardsService.remove` | mevcut transaction'da `lockBoard`'dan sonra `findMany({ boardId })` | commit sonrası `deleteQuietly` |
| Yükleme hatası | yeni anahtar | `deleteQuietly` |

Okuma ile silme arasında araya giren bir yükleme ya da süreç çökmesi yetim bırakabilir; bunun için kilit eklenmez, süpürme kapatır.

**Periyodik süpürme bu fazda gerekli** (`storage/storage-sweep.service.ts`, yeni bağımlılık yok, ~60 satır): Commit sonrası silme hatası, çökmeler ve Windows'ta açık dosyanın silinememesi (indirme sürerken) aksi halde sonsuza kadar yer kaplar.
- `OnApplicationBootstrap`: aralık > 0 ise 60 sn sonra ilk tur, sonra `setInterval(..., interval).unref()`; `OnModuleDestroy` temizler. Aynı anda iki tur çalışmaz (bayrak).
- `sweepOnce(now)`: `listOlderThan(now - 1 saat)` → 500'lük gruplar → `attachment.findMany({ where: { storageKey: { in } } })` → satırı olmayanlar silinir, sayı loglanır. 1 saatlik bekleme süresi devam eden yüklemeyi korur (dosya yazılır, satır saniyeler içinde gelir). Birden çok örnek aynı dizini süpürürse işlem idempotent.

## 6. Etkinlik

- `CARD_ATTACHMENT_ADDED` / `CARD_ATTACHMENT_REMOVED`; `data` dosya adının o anki kopyasını taşır. Prisma enum ↔ contracts eşitlik testi güncellenir.
- Kapak değişikliği etkinlik üretmez. Kart silinince ek etkinlikleri cascade ile gider.
- Frontend `describe-activity.ts` (exhaustive switch, contracts değişince derleme kırılır): "bu karta {dosya} dosyasını ekledi", "bu karttan {dosya} dosyasını sildi". Ad düz metin.

## 7. Socket sözleşmesi

`board:<id>` room'u, yalnız commit sonrası, `X-Socket-Id` yankı kuralıyla (yükleme isteği de başlığı gönderir).

| Event | Payload | Ne zaman | İstemci |
|---|---|---|---|
| `attachment:created` | `{ attachment, attachmentCount }` | Yükleme commit'i | Pano: `patchCard(cardId, { attachmentCount })`. Açık kart: id kontrolüyle sıralı ekleme + sayaç |
| `attachment:deleted` | `{ id, cardId, attachmentCount }` | Ek silindi | Pano ve kart: sayaç; `coverAttachmentId === id` ise null (DB'de FK zaten temizledi). Kart: listeden çıkar |
| `card:updated` (mevcut) | `card` artık `coverAttachmentId` taşır | Kapak PATCH'i | mevcut |
| `activity:created` (mevcut) | `ActivityDto` | Yukarıdaki iki event'ten hemen sonra | mevcut (`details=true` akışı) |

Event'ler idempotent (sayaç değeri yazılır). Anahtar ve URL hiçbir event'te yoktur; `AttachmentDto` e-posta taşımaz. Panodan çıkarılan üye önce room'dan çıkarılır (mevcut sıra).

## 8. Frontend

**Paylaşılan**
- `shared/lib/upload.ts`: `apiUpload<T>(path, formData, { onProgress, signal })` — `XMLHttpRequest` (fetch yükleme ilerlemesi vermez). `Authorization`, `Accept`, `x-socket-id` başlıkları; 401'de bir kez yenileyip yeniden gönderir; hata gövdesi `ApiError`; iptal `AbortError`.
- `shared/lib/file-size.ts`: `formatFileSize(bytes)` → "512 B", "1,2 KB", "3,4 MB" (`Intl.NumberFormat('tr-TR')`). `shared/ui/icons.tsx`: `PaperclipIcon`, `FileIcon`.

**board-detail** (kart ve pencere birlikte kullanır; `index.ts`'ten dışa açılır)
- `api/file-token-keys.ts`: `fileTokenKeys.token(boardId) = ['file-token', boardId]`. **Bilerek pano key'inin dışında:** her mutation sonrası pano invalidation'ı anahtarı yeniden çekmesin.
- `api/use-file-token.ts`: `staleTime` ve `refetchInterval` = `FILE_TOKEN_REFRESH_MS` (4 dk; anahtar en az 5 dk geçerli), `refetchIntervalInBackground: false`; sekmeye dönünce bayat olduğu için yeniden çekilir.
- `hooks/use-file-url.ts`: `(attachmentId, { download }) => string | null` (`API_BASE_PATH + fileUrlPath`).
- `components/attachment-image.tsx` + `lib/pinned-image-src.ts`: Bir ekin ilk kullanılan `src`'si modül düzeyindeki `Map`'te sabitlenir; anahtar yenilense de değişmez. Böylece yüklenmiş görsel her 5 dakikada bir yeniden indirilmez; aynı belgede yeniden mount olunca tarayıcı bellekten verir. `onError` → sabitleme silinir, anahtar query'si bir kez invalidate edilir, yeni URL denenir; ikinci hatada yer tutucu. `alt=""` + `aria-hidden`, `loading="lazy"`, `decoding="async"`, `draggable={false}` (yerel görsel sürüklemesi dnd-kit'i bozmasın). URL yokken aynı boyutta `bg-surface-sunken` yer tutucu (düzen kayması yok).
- `apply-board-event.ts`: iki yeni case. `card-tile-body.tsx`: `coverAttachmentId` varsa kapak görseli (`h-32 w-full object-cover rounded-t-md`), yoksa mevcut renk şeridi. Ek rozeti yorumdan sonra, checklist'ten önce: `PaperclipIcon` + sayı, `sr-only` "{n} ek"; `hasBadges` genişler.

**card-detail**
- `card-keys.ts` değişmez: ekler `CardDetailDto.attachments` içinde gelir.
- `store/attachment-upload-store.ts` (Zustand): `uploads: { id, cardId, fileName, size, loaded, status: 'queued' | 'uploading' | 'failed', error }[]` + eylemler. Yükleme pencereden bağımsızdır: pencere kapanırsa sürer, hata `showError` ile toast olur.
- `lib/upload-runner.ts`: `startUploads({ queryClient, boardId, cardId, files })`.
  - İstemci ön kontrolleri (istek yok): 10 MB üstü, `ATTACHMENT_ACCEPT` dışı uzantı, mevcut sayı + kuyruk > 20 (fazlalar hata satırı olur).
  - Kart başına sırayla bir yükleme. `AbortController`'lar modül `Map`'inde.
  - Başarı: kart önbelleğine id kontrolüyle ekler, pano kartına `attachmentCount`, sonra `refreshUnlessMutating`. `boardMutationKey` kullanılmaz: uzun yükleme diğer mutation'ların pano yenilemesini bekletmesin.
  - İptal: satır kalkar, "Yükleme iptal edildi." duyurulur ve `refreshUnlessMutating` çağrılır (sunucu iptalden hemen önce bitirmişse yankı kuralı yüzünden event gelmez).
- `hooks/use-attachment-uploads.ts` (seçiciler + `addFiles`, `cancel`, `dismiss`), `hooks/use-attachment-picker.ts` (gizli `<input type="file" multiple accept={ATTACHMENT_ACCEPT}>` + `open()`), `hooks/use-file-drop.ts` (yalnız `dataTransfer.types` içinde `Files` varsa; pencere açıkken `window` `dragover`/`drop` için `preventDefault`, böylece hedef dışına bırakılan dosya tarayıcıyı başka sayfaya götürmez).
- `api/attachments-api.ts` (`upload`, `remove`), `api/use-delete-attachment.ts` (`useCardMutation`: iyimser çıkarma + sayaç + kapak temizliği; `touches: attachment:<id>` ve `cover`; hata → geri alma; 404 → öğe silinir, "Ek bulunamadı. Silinmiş olabilir.").
- Kapak: `CardEdit`'e `coverAttachmentId`. `editParts` iki kapak alanı için tek `cover` parçası üretir (Faz 10'daki `coverColor` parçasının yerine). `applyCardUpdate`, `revertEdit`, `applyAnswer` iki alanı birlikte işler (dışlama kuralı). `use-card-cover.ts`: "Kapak yok" `{ coverColor: null, coverAttachmentId: null }` gönderir. Görsel kapak etkinken hiçbir radyo seçili değildir; üstte "Kapak olarak bir görsel kullanılıyor." yazar.
- `card-detail-cache.ts`: `summaryOf` + `attachmentCount`, `coverAttachmentId`; `insertAttachment`, `removeAttachment`. `apply-card-event.ts`: iki case.
- Bileşenler:
  - `card-detail-content.tsx`: "Kart işlemleri" grubunun sonuna "Ek" düğmesi (`PaperclipIcon`; panel değil, doğrudan dosya seçiciyi açar; arşivli kartta grup zaten gizli). Kök öğe bırakma hedefidir; sürüklerken üstte "Dosyaları karta eklemek için bırak" katmanı (`border-dashed border-primary`, reduced-motion'da animasyon yok). Pencere üstünde kapak görseli `card-cover-image.tsx` (`max-h-48 object-contain bg-surface-sunken`, `aria-hidden`), yoksa renk şeridi.
  - `card-attachments-section.tsx`: ek ya da yükleme varsa görünür; açıklamadan sonra, checklist'lerden önce. h3 "Ekler" (`tabIndex={-1}`, silmeden sonra odak buraya; son ek silinince "Ek" düğmesine), sağda "Ekle". `<ul aria-label="Ekler">`.
  - `attachment-item.tsx`:
    - Solda görselse 64×48 küçük resim (`AttachmentImage`), değilse `FileIcon` + uzantı.
    - Ad bağlantısı: görselse satır içi URL, `target="_blank" rel="noopener noreferrer"`; diğerleri indirir. Altında "1,2 MB · 5 Kas 14:30 · Ayşe".
    - Düğmeler: "“a.pdf” ekini indir" (`download=true`); yalnız görsellerde "“a.png” görselini kapak yap" / "Kapağı kaldır"; `canDeleteAttachment` ise "“a.pdf” ekini sil".
    - Silmede `ConfirmDialog`: "Ek silinsin mi?" / "“a.pdf” kalıcı olarak silinecek.".
  - `upload-item.tsx`: ad, `<progress max={size} value={loaded} aria-label="“a.pdf” yükleniyor">`, yüzde, "“a.pdf” yüklemesini iptal et"; hatada mesaj + "Kapat". Duyurular (mevcut `role=status`): başlangıç, "“a.pdf” eklendi", hata metni. Yüzde duyurulmaz.
- Hata metinleri:
  - `PAYLOAD_TOO_LARGE` / ön kontrol: "“a” 10 MB'tan büyük, yüklenemedi."
  - `UNSUPPORTED_FILE_TYPE`: "“a” türü desteklenmiyor."
  - `ATTACHMENT_LIMIT_REACHED`: "Bir karta en fazla 20 dosya eklenebilir."
  - 429: "Çok fazla yükleme yapıldı. Biraz bekleyip tekrar dene."
  - 404: "Kart bulunamadı. Silinmiş olabilir."
  - `INVALID_COVER`: "Bu dosya kapak yapılamaz."
  - Diğerleri: "“a” yüklenemedi. Tekrar dene."
- Mobil: dokunmatikte (`pointer-coarse:`) bütün düğmeler 44 px; satırlar tam genişlik, adlar görsel olarak `truncate` olur (erişilebilir adın tamamı okunur); bırakma katmanı dokunmatikte devreye girmez, seçici kamera / galeri sunar.

## 9. Test stratejisi

**Dosya temizliği:**
- Backend e2e: `vitest.config.e2e.ts` env'ine `UPLOAD_DIR=<os.tmpdir()>/trello-clone-e2e-uploads`, `UPLOAD_RATE_LIMIT_PER_MINUTE=1000` ve `STORAGE_SWEEP_INTERVAL_MINUTES=0` eklenir. `test/utils/uploads.ts` içindeki `resetUploads()` dizini boşaltıp yeniden oluşturur; ek kullanan spec'lerde `beforeEach`'te çağrılır. Bir `globalSetup` dizini koşu sonunda siler.
- Unit testleri her testte `mkdtemp` kullanır.
- Playwright dev backend'in `backend/uploads` dizinini kullanır (git dışı). Fixture'lar küçüktür (1×1 PNG, birkaç baytlık PDF; `e2e/fixtures/files.ts` ve `test/utils/files.ts` içinde base64 sabitleri, depoya ikili dosya girmez). Dosyalar dev DB satırlarıyla birlikte kalır.

**Backend unit (yeni):**
- `detect-file-type.spec.ts`: dört görsel türü, pdf, docx; UTF-8 txt/csv/md; `.png` adlı HTML, `.pdf` adlı MZ, SVG, NUL içeren `.txt` ve boş dosya → null.
- `file-name.spec.ts`: `../../x`, `C:\a\b.txt`, bidi, kontrol karakteri, NFC, 300 karakter (uzantı korunur), boş ad.
- `content-disposition.spec.ts`: "Şirket raporu (son).pdf", tırnak ve ters bölü, inline ve attachment.
- `file-token.spec.ts`:
  - Gidiş-dönüş; aynı pencerede aynı anahtar, geçerlilik 300–600 sn.
  - Değiştirilmiş imza, pano, kullanıcı ya da `exp` → geçersiz. Süresi dolmuş, çok ileri tarihli `exp`, bozuk biçim ve farklı uzunlukta imza → hata fırlatmadan geçersiz.
- `local-disk.storage.spec.ts`: put/open/delete; `wx` üzerine yazmaz; `../x`, `a/b` ve uuid olmayan anahtar reddedilir; olmayan dosyayı açmak → null; olmayanı silmek hata vermez; `listOlderThan` (`utimes` ile) desene uymayanları atlar.
- `storage-sweep.service.spec.ts`: yalnız eski ve satırı olmayan silinir; taze dosya ve satırı olan kalır; gruplama; çakışan tur yok; aralık 0 → zamanlayıcı yok.
- `attachments.service.spec.ts`:
  - Mutlu yol: sayaç, etkinlik, commit sonrası yayın, sıra `attachment:created` → `activity:created`.
  - 415 ve ön kontrol 409'da `put` yok. Transaction hatasında ve içerideki 21. dosyada `deleteQuietly(key)` çağrılır.
  - Silme: yükleyen ve ADMIN silebilir, diğer MEMBER 403; `deleteMany` 0 → 404 ve depo silmesi yok; depo silme hatası isteği düşürmez.
- `user-throttler.guard.spec.ts`.

**Backend unit (güncellenen):**
- `cards.service.spec.ts`: kapak doğrulaması, dışlama kuralı, `remove` sonrası dosya silme.
- `boards.service.spec.ts`, `lists.service.spec.ts`: anahtar toplama + commit sonrası silme.
- `card.dto.spec.ts`, `card.mapper.spec.ts`, `CardRow` mock'u kuran spec'ler (cards, checklists, checklist-items, checklist-counts, boards, comments).
- `board-access.guard.spec.ts`, `board-access.service.spec.ts`, `env.validation.spec.ts` (production'da mutlak `UPLOAD_DIR`), `error-shape.spec.ts` (413), Prisma ↔ contracts `ActivityType` eşitliği.
- `route-authorization.spec.ts` değişmez; dosya rotası `@Public`, diğerleri `@BoardRole`.

**Backend e2e: `test/attachments.e2e-spec.ts` (gerçek multipart, Supertest `.attach`)**
- PNG, adı "Şirket logosu.png": 201, şekil doğru, ad bozulmadan korunur. Diskteki dosya adı uuid; kullanıcının verdiği ad dizinde görünmez.
- Kart detayında `attachments`, panoda `attachmentCount`.
- 415: `.png` adlı HTML (beyan `image/png`), `.pdf` adlı MZ, SVG. UTF-8 `.txt` → `text/plain`.
- 400: boş dosya, `file` alanı yok, iki dosya, fazladan metin alanı.
- Tam 10 MB → 201. 10 MB + 1 → 413 `PAYLOAD_TOO_LARGE` ve diskte dosya kalmaz.
- 20 yükleme geçer, 21. → 409; biri silinince yeniden yüklenebilir.
- Yetki:
  - Token yok → 401.
  - Üye olmayan ve başka panonun kartı → 404.
  - Yükleyen 204 (dosya diskten gider), diğer MEMBER 403, ADMIN 204, ikinci silme 404.
- Dosya rotası:
  - Anahtar uç noktası `no-store` döner.
  - PNG satır içi gelir: tür, `inline` + `filename*`, `nosniff`, CSP `sandbox`, `private, max-age ≤ 600`, gövde baytları aynı.
  - `download=true` → `attachment`. PDF her zaman `attachment`. Metin `text/plain; charset=utf-8`.
  - `Range` başlığı → 200 tam gövde + `Accept-Ranges: none`.
- Anahtar:
  - Kurcalanmış imza → 403 `FILE_TOKEN_INVALID`. Süresi dolmuş anahtar (`signFileToken` geçmiş `now` ile) → 403.
  - A panosunun anahtarıyla B'nin eki → 404. Silinmiş ek → 404. Panodan çıkarılan üyenin hâlâ geçerli anahtarı → 404. `token` yok → 400.
- Kapak:
  - Görsel → `coverColor: null`. Ardından renk → `coverAttachmentId: null`. İkisi birden → 400.
  - PDF ve başka kartın eki → 400 `INVALID_COVER`. Kapak olan ek silinince kapak null olur.
- Cascade: kapaklı ve ekli kart, liste ve pano silinir → 204; satırlar da dosyalar da gider.
- Rate limit: `vi.stubEnv('UPLOAD_RATE_LIMIT_PER_MINUTE', '2')` ile aynı kullanıcının 3. yüklemesi 429.
- Güncellenen e2e:
  - Şekil kontrolü yapan dosyalar: `cards`, `card-detail`, `checklists`, `boards`.
  - `activity.e2e-spec.ts`: iki yeni tip ve dosya adı kopyası.
  - `realtime-events.e2e-spec.ts`: iki event, ardından `activity:created`; kendi socket'ine gitmez; çıkarılan üyeye sızmaz (`expectNoLeak`).

**Frontend unit (RTL + MSW):**
- Yeni:
  - `upload.test.ts`: sahte XHR (`vi.stubGlobal`) ile ilerleme, iptal, 401 → yenile → yeniden dene, `ApiError`. MSW'nin XHR yükleme ilerlemesi jsdom'da güvenilir değil.
  - `file-size.test.ts`.
  - `upload-runner.test.ts`: ön kontroller istek atmaz; sıralı çalışır; iptal satırı kaldırır; başarı önbellek ve pano sayacına yazar.
  - `card-attachments.test.tsx`: `userEvent.upload` ile yükleme ve yükleme satırı; 413, 415 ve 409 metinleri; silme onayı, iyimser silme ve 500'de geri alma. MEMBER başkasının ekinde "Sil" görmez, ADMIN görür. İndirme `href`'inde `download=true`; kapak yap/kaldır; `fireEvent.drop`.
  - `attachment-image.test.tsx`: anahtar değişince `src` sabit kalır; `onError` → bir kez yeniden çekme; yer tutucu.
- Güncellenen: `card-badges.test.tsx` (rozet, görsel kapak renkten önceliklidir), `card-cover.test.tsx` ("Kapak yok" iki alanı da null gönderir), `apply-board-event.test.ts`, `apply-card-event.test.ts`, `card-detail-cache.test.ts`, `describe-activity.test.ts`, `use-card-realtime.test.tsx`, `use-card-mutation.test.tsx` (`cover` parçası), `test/fixtures.ts`, `test/card-dialog.ts`.

**Playwright** (`playwright.config.ts` webServer env'ine `UPLOAD_RATE_LIMIT_PER_MINUTE: '1000'`):
- Yeni `e2e/attachments.spec.ts`:
  - "Ek" düğmesi → `page.waitForEvent('filechooser')` → `setFiles` ile PNG + PDF; liste görünür ve sayfa yenilenince korunur.
  - Kapak yap → karttaki `img`'nin `naturalWidth` değeri 0'dan büyük.
  - PDF indirme: `waitForEvent('download')`, `suggestedFilename()` Türkçe ad.
  - Onaylı silme; 10 MB + 1 dosyada ön kontrol mesajı.
- `e2e/realtime.spec.ts`: B, A'nın yüklemesini (rozet ve açık penceredeki liste) ve kapağını canlı görür.
- `e2e/a11y.spec.ts` (4 mod): "card dialog with attachments" (görsel kapak + PDF), "attachment upload in progress" (`page.route` isteği bekletir), "attachment upload error", "delete attachment confirm", "board with an image cover card".

## 10. Commit sırası

Her commit kendi başına yeşil olmalı (build, typecheck, lint, unit; backend e2e ilgili spec'lerle). Playwright en sonda bir kez çalıştırılır.

**C1 — `feat(api): card attachments upload, delete and counts`** (backend-nest → frontend-react derleme düzeltmeleri → tester)
- Bu commit'te:
  - Şema ve migration (§2'nin tamamı); contracts §3 (`FileTokenDto`, `fileUrlPath`, `coverAttachmentId` isteği ve `INVALID_COVER` / `FILE_TOKEN_INVALID` hariç).
  - `file-type` bağımlılığı; `UPLOAD_DIR` ve `UPLOAD_RATE_LIMIT_PER_MINUTE` (`.env.example`, README, `.gitignore`); `StorageModule`.
  - `POST` ve `DELETE` uç noktaları, tespit, dosya adı, guard için `attachmentId`, mapper'lar, 413 eşlemesi, `UserThrottlerGuard`, etkinlik kaydı.
- Frontend (contracts değişince exhaustive switch'ler ve fixture'lar kırılacağı için bu commit'e girer): `test/fixtures.ts`, `card-dialog.ts`, iki apply fonksiyonunun case'leri, `summaryOf`, `describeActivity`.
- Testler: §9'daki ilgili unit ve e2e testleri (dosya rotası ve kapak hariç).

**C2 — `feat(api): file access token, file route and image covers`** (backend-nest → tester)
- Anahtar, `GET /boards/:boardId/file-token`, `GET /files/:attachmentId`, `content-disposition.ts`, PATCH `coverAttachmentId` + dışlama kuralı. Contracts'taki kalan eklemeler yalnız genişletme yapar; frontend derlemesi kırılmaz.
- Testler: `file-token`, `content-disposition`, `cards.service` / `card.dto` kapak testleri; e2e'de dosya rotası, anahtar ve kapak bölümleri.

**C3 — `feat(api): delete stored files after card, list and board deletes and sweep orphans`** (backend-nest → tester)
- §5; `STORAGE_SWEEP_INTERVAL_MINUTES`.
- README production notları:
  - `UPLOAD_DIR` DB ile birlikte yedeklenir.
  - Yerel disk tek örnek ya da paylaşılan disk demektir.
  - Nginx'te `client_max_body_size 11m` gerekir; varsayılan 1m yüklemeleri 413 ile keser.
  - SPA CSP'sinde `img-src 'self'` yeterlidir.
- Testler: `storage-sweep`, `boards` / `lists` / `cards` servis spec'leri, e2e cascade bölümü.

**C4 — `feat(card-detail): attachments section with upload, download and delete`** (frontend-react; bırakma katmanı, ilerleme ve satır düzeni için ui-designer)
- `apiUpload`, `formatFileSize`, ikonlar; board-detail anahtar hook'u, `useFileUrl`, `AttachmentImage` (dışa açılır); upload store, runner ve hook'lar; "Ek" düğmesi, bölüm, öğeler, silme.
- Testler: `upload`, `file-size`, `upload-runner`, `card-attachments`, `attachment-image`, `card-detail-route.test.tsx` (işlem grubundaki düğme sayısı).

**C5 — `feat(board): image covers and attachment badge`** (frontend-react + ui-designer)
- Kapak yap/kaldır, pencere üstündeki kapak görseli, karttaki kapak görseli, rozet, kapak seçicide dışlama, `cover` parçası.
- Testler: `card-badges`, `card-cover`, `card-detail-cache`, `use-card-mutation`, `board-cards.test.tsx`.

**C6 — `test(e2e): attachments and covers`** (tester): §9 Playwright ve a11y ekranları, `playwright.config.ts` env'i.

**C7 — `docs: record phase 12`**: `docs/PLAN.md` ilerleme satırı; yol haritasında S3'ün ertelendiği notu. Ardından tam test turu ve code-reviewer.

## 11. Riskler

- **Eşzamanlılık:**
  - Sınır, kart satırı kilidi altındaki sayaçla korunur; iki paralel 20. yüklemeden biri 409 alır.
  - Ek silme ve kart silme önce kart satırını kilitler, deadlock oluşmaz.
  - Kapak PATCH'i ile ek silme yarışırsa ya `SetNull` çalışır ya da PATCH P2003 → 409 alır.
  - Çift silmede `deleteMany` 0 → 404.
  - İki kişi aynı anda kapak seçerse son yazan kazanır; `card:updated` iki tarafı eşitler.
- **Aynı origin'den dosya sunumu (XSS):** Asıl risk budur. Önlemler:
  - İçerikten tespit edilen izin listesi; SVG, HTML ve XML yok.
  - `nosniff` ve dosya yanıtına `sandbox` CSP.
  - Görsel dışındaki her şey `attachment` olarak iner.
  - Hepsi e2e'de başlık bazında doğrulanır.
- **Anahtarın URL'de olması:** Vekil erişim loglarına düşebilir (en fazla 10 dk geçerli, üyelik her istekte kontrol edilir, ek id'leri tahmin edilemez). `Referrer-Policy: no-referrer` Helmet'ten gelir.
- **Kaynak tüketimi:**
  - Bellek: aynı anda yükleme başına en fazla 10 MB; guard'lar gövdeden önce çalışır; yüklemeye kullanıcı ve IP başına limit var.
  - Disk: kota yok; bir üye kart açarak diski doldurabilir (limitle dakikada en fazla ~300 MB). İzleme operasyonun işi (açık soru 9).
- **Performans:** Küçük resim yok; kapak olarak tam boy (10 MB'a kadar) görsel indirilir. `loading="lazy"` ve sabitlenmiş `src` yeniden indirmeyi önler; küçük resim üretimi `sharp` gerektirir, ileri faz. Kart detayına 1 ek sorgu gelir; pano yüklemesi değişmez (sayaç kolonu).
- **Gizlilik ve güvenlik dışı:** EXIF (konum) verisi olduğu gibi saklanır; virüs taraması yok.
- **Yetim dosyalar ve Windows:** Açık okuma akışı silmeyi engelleyebilir; `deleteQuietly` loglar, süpürme sonra siler.
- **Döngüsel FK silmesi** (Card ↔ Attachment): e2e ile doğrulanır; geri dönüş yolu §2'de.
- **Operasyon:** Yerel disk yatay ölçeklenmez (S3 adımı çözer). Vekil gövde sınırı (Nginx 1m) README'de.
- **Geriye dönük uyumluluk:** Migration yalnız ekleme yapar; DTO'lar yalnız genişler; enum'a değer eklenir; istemci ve sunucu birlikte deploy edilir.
- **Faz 13:** Panolar arası taşımada `Attachment.boardId` taşıma transaction'ında güncellenmeli; aksi halde guard, anahtar kontrolü ve cascade yanlış panoyu görür.

## 12. Açık sorular (önerilen varsayılanla)

1. **S3 bu fazda mı?** Varsayılan: hayır. Yalnız arayüz + yerel disk; S3 production öncesi ayrı adım.
2. **Ek başına imzalı URL yerine pano + kullanıcı anahtarı (§1 sapma tablosu) onaylanıyor mu?** Varsayılan: evet.
3. **İzinli türler?** Varsayılan: §3 listesi. SVG, HEIC, video/ses ve eski Office (doc/xls/ppt) reddedilir.
4. **İlk görsel ek otomatik kapak olsun mu (Trello varsayılanı)?** Varsayılan: hayır, kapak açıkça "Kapak yap" ile seçilir.
5. **Görsel önizleme?** Varsayılan: yeni sekmede açılır; uygulama içi lightbox yok.
6. **Kartta kapak görseli düzeni?** Varsayılan: sabit yükseklik (`h-32`) ve `object-cover`. Doğal en-boy oranı boyut bilgisi ister (`image-size` bağımlılığı).
7. **İmza anahtarı?** Varsayılan: `JWT_ACCESS_SECRET`'tan HKDF ile türetilir, yeni zorunlu env yok. Alternatif: ayrı `FILE_TOKEN_SECRET`.
8. **Yükleme limiti?** Varsayılan: kullanıcı başına (ve bu rotada IP başına) dakikada 30.
9. **Pano ya da kullanıcı kotası?** Varsayılan: yok; kart başına 20 × 10 MB yeterli sınır.
10. **Arşivli karta yükleme?** Varsayılan: arayüzde yok (işlem grubu gizli), API izin verir (yorumlarla aynı).
11. **Süpürme ayarları?** Varsayılan: 60 dakikada bir, 1 saatlik bekleme süresi; testlerde kapalı.
12. **Range desteği?** Varsayılan: yok. Video/ses eklenirse gelir.
