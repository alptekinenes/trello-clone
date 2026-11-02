# Faz 6 — Davetler ve Üye Yönetimi: Uygulama Planı

> `architect` rolüyle hazırlandı (2026-11-02). Kurallar: `CLAUDE.md`. Genel plan: `docs/PLAN.md` (§1 Davet akışı + rol matrisi, §4 Davetler, §6, §8 Faz 6, §9, §10). Biçim: `docs/phase-5-card-detail.md`.
> Metin Türkçe; kod, dosya ve tanımlayıcı adları İngilizce.

**Önkoşul:** Faz 5 commit'lendi (`d8b9791` itibarıyla çalışma ağacı temiz). Bu faz Faz 2'de ertelenen üye yönetimi arayüzünü de kapsar (PLAN "İlerleme" Faz 2 notu).

---

## 1. Özet

**Amaç:** Board yöneticisi bir e-posta adresini panoya davet eder. Adres kayıtlı bir kullanıcıya aitse kullanıcı hemen üye olur. Değilse 7 gün geçerli, tek kullanımlık bir davet bağlantısı üretilir; yönetici bu bağlantıyı kopyalayıp paylaşır. Davetli bağlantıyı açar, giriş yapar ya da hesap oluşturur ve daveti kabul eder. Ayrıca board'daki "Üyeler" penceresinden rol değiştirme, üye çıkarma ve panodan ayrılma yapılır.

**Kapsam içi**
- `POST/GET /boards/:boardId/invitations`, `DELETE /boards/:boardId/invitations/:invitationId`, `GET /invitations/:token` (public), `POST /invitations/:token/accept`.
- Hibrit akış (PLAN §1): kayıtlı e-posta → doğrudan `BoardMember`; kayıtsız → token'lı `Invitation` + response'ta `inviteUrl`.
- Token sadece sha256 hash'i olarak saklanır; 7 gün TTL; aynı `(boardId, email)` için upsert (yeni token, yeni süre); kabulde token + e-posta eşleşmesi zorunlu.
- `MailService` (MVP: console logger, gerçek gönderim yok).
- Rate limit (davet oluşturma, public önizleme, kabul).
- FE: `/invitations/:token` sayfası (public önizleme, giriş yoksa `returnUrl` ile login/register, dönüşte kabul, sonra board'a yönlendirme).
- FE: login/register için `returnUrl` desteği (şu an yok, bkz. §6.2).
- FE: "Üyeler" penceresi: davet formu (e-posta + rol), kopyalanabilir davet bağlantısı, üye listesi, rol değiştirme, çıkarma, ayrılma, bekleyen davetler + iptal + yeni bağlantı.

**Kapsam dışı:** gerçek e-posta gönderimi (SMTP), e-posta doğrulama, kayıtta e-postaya göre otomatik kabul (PLAN §1 madde 5), kullanıcının kendi bekleyen davetlerini gördüğü sayfa, sahiplik devri, davet sayısı üst sınırı (bkz. §10 S7), süresi dolmuş davetleri temizleyen iş, socket yayınları (Faz 7; hazırlık §5'te), çıkarılan üyenin açık board'dan anında atılması (Faz 7).

**Ana kararlar (kısa)**
| Konu | Karar |
|---|---|
| Migration | **Gerekmiyor.** `Invitation` modeli, `InvitationStatus` enum'u, `tokenHash` unique, `(boardId, email)` unique ve `email` index'i `init_schema`'da var (§2). |
| Modüller | Yeni `invitations/` (iki controller: board kapsamlı + token kapsamlı) ve `mail/`. `members/` sadece kaldırma kuralını contracts'a taşır. |
| Kilit | Davet/üyelik **oluşturan** her yazım (davet, kabul, iptal) önce **board satırını** kilitler (`lockBoard`, `FOR NO KEY UPDATE`). Aynı board'daki davet yazımları sıraya girer; Faz 5 kilit sırasıyla (`Board → List → Card → checklist`) çakışmaz (§4.4). |
| Token | `randomBytes(32).toString('base64url')` (43 karakter). DB'de sadece `sha256(token)`. Ham token sadece `inviteUrl` içinde ve sadece `POST` yanıtında döner; dev ortamında `MailService` logu hariç hiçbir yere yazılmaz. |
| Durumlar | `PENDING` → `ACCEPTED` / `REVOKED`. Süre dolması ayrı durum değil, `expiresAt <= now` ile hesaplanır. Yeni hata kodları: `INVITATION_REVOKED`, `INVITATION_USED` (§3.3). |
| ADMIN rolüyle davet | Sadece OWNER davet edebilir. ADMIN yalnız MEMBER davet eder (rol değiştirme OWNER'a ait olduğundan, PLAN rol matrisiyle tutarlı). §10 S1. |
| Kabul sonrası | `200 { boardId }`. Kullanıcı zaten üyeyse rolü değişmez, davet `ACCEPTED` olur (idempotent). |
| Dönüşte kabul | Davetli sayfadaki "Giriş yap"/"Kayıt ol"a bastığında bellekte bir **niyet** tutulur. Giriş sonrası sayfaya dönünce bu niyet varsa ve e-posta eşleşiyorsa kabul otomatik yapılır. Niyet yoksa (doğrudan link, sayfa yenileme) "Daveti kabul et" butonu gösterilir. URL ile tetiklenemez (§6.7). |
| FE feature sınırları | Board kapsamlı davet ve üye API'leri `board-detail` içinde (board cache'ini günceller). Token akışı yeni `features/invitations` içinde. Bağımlılık: `invitations → auth, boards` (index üzerinden); `board-detail` `invitations`'ı import etmez. |
| Üye listesi kaynağı | Ayrı `memberKeys` query'si **yok**: üyeler `BoardDetailDto.members`'tan gelir (PLAN §6'daki `memberKeys.list` düşer). Bekleyen davetler ayrı query (sadece ADMIN+). |
| Arayüz | Tek "Üyeler" diyaloğu (davet formu + üyeler + bekleyen davetler). PLAN'daki ayrı `InviteMemberDialog` birleştirildi. |

---

## 2. Veritabanı Şeması

**Değişiklik yok, migration yok.** Doğrulama (`backend/prisma/schema.prisma` + `migrations/20261027000000_init_schema/migration.sql`):

| İhtiyaç | Mevcut |
|---|---|
| `Invitation { id, boardId, email(254), role, tokenHash, status, invitedById, expiresAt, acceptedAt, createdAt, updatedAt }` | ✓ |
| Token ile arama | `Invitation_tokenHash_key` (unique) ✓ |
| Yeniden davet = upsert | `Invitation_boardId_email_key` (unique) ✓ |
| Board'un bekleyen davetleri | `(boardId, email)` unique index'inin `boardId` öneki ✓ (board başına az satır) |
| Board silinince davetler | `Invitation_boardId_fkey ON DELETE CASCADE` ✓ |
| Davet eden silinince | `Invitation_invitedById_fkey ON DELETE CASCADE` ✓ (kullanıcı silme API'si yok) |
| Üyelik | `BoardMember` PK `(boardId, userId)` → çift üyelik DB'de imkânsız ✓ |

**Durum makinesi (servis katmanında)**

```
           create (kayıtsız e-posta)               accept (token + e-posta eşleşmesi)
   (yok) ───────────────────────────► PENDING ───────────────────────────────────► ACCEPTED
                                        │  ▲                                          │
                       revoke (ADMIN+)  │  │ re-invite (upsert: yeni token,           │ re-invite: e-posta artık kayıtlı
                                        ▼  │ yeni expiresAt, role, invitedById)       │ → doğrudan üye (409 ALREADY_MEMBER
                                     REVOKED ─┘                                       │   ya da MEMBER_ADDED)
   PENDING + expiresAt <= now  ⇒  "süresi dolmuş" (ayrı durum değil; listede görünmez, önizleme/kabul 410)
   create (kayıtlı e-posta) + aynı e-posta için PENDING davet varsa ⇒ o davet ACCEPTED (acceptedAt = now)
```

**Servis katmanı kuralları (DB'de değil)**
- `Invitation.email` her zaman `normalizeEmail` (trim + lowercase, `users.service.ts`) ile yazılır ve karşılaştırılır. `User.email` de aynı fonksiyonla yazıldığı için eşitlik kontrolü doğrudan `===`. Gmail nokta/artı normalizasyonu **yapılmaz** (farklı adresler).
- `Invitation.role` asla `OWNER` olmaz (DTO `ASSIGNABLE_BOARD_ROLES`).
- Board başına tek OWNER kuralı değişmez; davet OWNER üretemez.
- Yeniden davet eski bağlantıyı geçersiz kılar (hash değişir; eski token → 404). Ham token saklanmadığı için başka yol yok.
- Süresi dolmuş/iptal edilmiş satırlar silinmez; aynı e-postaya yeni davet aynı satırı günceller (unique kısıt sayesinde birikme board × e-posta ile sınırlı).

**Sıralama stratejisi:** Bu fazda `position` yok. Liste sıraları: davetler `updatedAt desc, id asc` (en son gönderilen üstte); üyeler mevcut `MEMBER_ORDER` (rol, katılma tarihi).

**Migration adı önerisi:** — (gerekmiyor). İleride `acceptedById`/`revokedAt` gerekirse `add_invitation_audit_fields`.

---

## 3. Paylaşılan Sözleşmeler (`shared/contracts/src/`)

### 3.1 Yeni `invitations.ts`
```ts
import type { AssignableBoardRole, MemberDto } from './boards.js';

export const INVITATION_LIMITS = {
  /** An invitation link works for this many days after it was (re)sent. */
  TTL_DAYS: 7,
  /** base64url of 32 random bytes. */
  TOKEN_LENGTH: 43,
} as const;

const INVITATION_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

/** Cheap shape check before any lookup; anything else is "not found". */
export function isInvitationToken(value: string): boolean {
  return INVITATION_TOKEN_PATTERN.test(value);
}

export interface CreateInvitationRequest {
  /** Trimmed and lowercased by the server. */
  email: string;
  /** ADMIN only when the inviter is the board owner. */
  role: AssignableBoardRole;
}

/** A pending invitation as board admins see it. Never carries the token or its hash. */
export interface InvitationDto {
  id: string;
  boardId: string;
  email: string;
  role: AssignableBoardRole;
  invitedBy: { userId: string; name: string };
  expiresAt: string;
}

export type CreateInvitationResponse =
  | { result: 'MEMBER_ADDED'; member: MemberDto }
  | {
      result: 'INVITATION_CREATED';
      invitation: InvitationDto;
      /** `${APP_URL}/invitations/<token>`; the only place the raw token is ever returned. */
      inviteUrl: string;
    };

/** Public preview behind GET /invitations/:token. */
export interface InvitationPreviewDto {
  boardTitle: string;
  inviterName: string;
  /** The address the invitation was sent to; the accepting account must use it. */
  email: string;
  role: AssignableBoardRole;
  expiresAt: string;
}

export interface AcceptInvitationResponse {
  boardId: string;
}
```

### 3.2 Yeni `members.ts` (FE ve BE aynı kuralları kullanır)
`MembersService` içindeki özel `assertCanRemove` buraya saf fonksiyon olarak taşınır. FE butonları bu fonksiyonlarla gösterir/gizler; BE aynı fonksiyonla hata fırlatır.
```ts
import { type AssignableBoardRole, hasBoardRole } from './boards.js';
import type { BoardRole } from './enums.js';

export interface MemberRef { userId: string; role: BoardRole; }

/** Removing yourself is leaving. ADMIN+ removes members, only the OWNER removes admins, nobody removes the owner. */
export type MemberRemovalCheck = 'ALLOWED' | 'OWNER_CANNOT_LEAVE' | 'FORBIDDEN';
export function checkMemberRemoval(actor: MemberRef, target: MemberRef): MemberRemovalCheck;

/** Only the owner changes roles, and never the owner's own role. */
export function canChangeMemberRole(actorRole: BoardRole, targetRole: BoardRole): boolean;

/** ADMIN+ invites members; only the OWNER invites admins. */
export function canInviteAs(actorRole: BoardRole, role: AssignableBoardRole): boolean;
```
`index.ts`'e `export * from './invitations.js'` ve `'./members.js'` eklenir.

### 3.3 Hata kodları (`errors.ts`)
Mevcut: `ALREADY_MEMBER`, `EMAIL_MISMATCH`, `INVITATION_EXPIRED` (ilk kez kullanılıyor). **Yeni:**
```ts
INVITATION_REVOKED: 'INVITATION_REVOKED',
INVITATION_USED: 'INVITATION_USED',
```
Gerekçe: PLAN'da süresi dolmuş ve iptal edilmiş davet aynı koda (410 `INVITATION_EXPIRED`) düşüyordu. Kullanıcıya gösterilecek metinler farklı ("süresi doldu, yeni davet iste" / "iptal edildi" / "zaten kullanıldı"). Ayrı kodlar FE'de `switch` ile çözülür, ek alan gerektirmez.

| Kod | Status | Ne zaman |
|---|---|---|
| `NOT_FOUND` | 404 | Token biçimi bozuk / bilinmiyor / yeniden davetle değişmiş; davet başka board'da; board silinmiş |
| `INVITATION_EXPIRED` | 410 | `PENDING` ama `expiresAt <= now` |
| `INVITATION_REVOKED` | 410 | `REVOKED` |
| `INVITATION_USED` | 410 (önizleme/kabul), 409 (iptal) | `ACCEPTED` (kabulde: aynı kullanıcı zaten üyeyse 200, bkz. §4.5) |
| `EMAIL_MISMATCH` | 403 | Kabul eden hesabın e-postası davet e-postasından farklı |
| `ALREADY_MEMBER` | 409 | Davet edilen e-posta zaten board üyesi |
| `FORBIDDEN` | 403 | ADMIN rolünde ADMIN daveti; MEMBER davet işlemleri |

### 3.4 Ortam değişkenleri (backend, `env.validation.ts` + `.env.example`)
| Değişken | Varsayılan | Kural | Not |
|---|---|---|---|
| `APP_URL` | `http://localhost:5173` | `@IsUrl({ require_tld: false, protocols: ['http','https'] })`, sondaki `/` atılır | `inviteUrl` tabanı. CORS_ORIGIN'den ayrı (prod'da farklı olabilir). |
| `INVITATION_RATE_LIMIT_PER_MINUTE` | `30` | `@IsInt() @Min(1) @Max(10_000)` | `invitationRateLimit()` ile **istek anında** okunur (`authRateLimit` deseni), böylece testler `vi.stubEnv` ile değiştirebilir. |

`vitest.config.e2e.ts` env: `APP_URL: 'http://localhost:5173'`, `INVITATION_RATE_LIMIT_PER_MINUTE: '1000'` (rate-limit testi kendi app'inde stub'lar). `frontend/playwright.config.ts` backend `webServer.env`'e `INVITATION_RATE_LIMIT_PER_MINUTE: '1000'` eklenir.

---

## 4. Backend

### 4.1 Dosyalar
```
backend/src/
├── common/crypto/opaque-token.ts       newOpaqueToken(bytes = 32) (base64url), hashToken(token) (sha256 hex)
├── auth/token.service.ts               hashToken/newRefreshToken bu yardımcıyı kullanır (davranış aynı; hashToken re-export edilir)
├── config/env.validation.ts            + APP_URL, INVITATION_RATE_LIMIT_PER_MINUTE, invitationRateLimit()
├── mail/
│   ├── mail.module.ts                  @Global değil; InvitationsModule import eder
│   └── mail.service.ts                 sendInvitation(mail: InvitationMail): Promise<void>
├── members/members.service.ts          assertCanRemove → checkMemberRemoval (contracts) + hata eşlemesi
├── invitations/
│   ├── invitations.module.ts           imports: MailModule
│   ├── board-invitations.controller.ts 'boards/:boardId/invitations' — POST, GET, DELETE :invitationId
│   ├── invitations.controller.ts       'invitations' — GET :token (@Public), POST :token/accept
│   ├── invitations.service.ts          create, listPending, revoke, preview, accept
│   ├── invitation.mapper.ts            INVITATION_SELECT, INVITATION_ORDER, PREVIEW_SELECT, toInvitationDto, toInvitationPreview
│   ├── invitations.errors.ts           invitationNotFound, invitationExpired, invitationRevoked, invitationUsed(status), emailMismatch, alreadyMember, cannotInviteAs
│   └── dto/create-invitation.dto.ts
└── app.module.ts                       + InvitationsModule
backend/test/
├── utils/users.ts                      createUser(app, name, email?) — e-posta verilirse normalize edip kullanır
├── utils/invitations.ts                invite(app, as, boardId, email, role), tokenOf(inviteUrl)
└── invitations.e2e-spec.ts
```

### 4.2 Yetki
| Route | Koruma | Ek kontrol (servis) |
|---|---|---|
| `POST /boards/:boardId/invitations` | JWT + `@BoardRole('ADMIN')` | `canInviteAs(myRole, role)` değilse 403 `FORBIDDEN` ("Only the board owner can invite admins") |
| `GET /boards/:boardId/invitations` | JWT + `@BoardRole('ADMIN')` | – |
| `DELETE /boards/:boardId/invitations/:invitationId` | JWT + `@BoardRole('ADMIN')`, `ParseUUIDPipe` | Davet `{ id, boardId }` ile aranır; başka board'unki 404 |
| `GET /invitations/:token` | `@Public()` + throttle | Token sahibi her şeyi görür (token = yetki) |
| `POST /invitations/:token/accept` | JWT (varsayılan) + throttle | Token + `user.email === invitation.email` |
| Mevcut `PATCH/DELETE /boards/:boardId/members/:userId` | Değişmez | Kaldırma kuralı contracts'tan (§3.2) |

- Guard `:boardId`'yi önce çözdüğü için `/boards/:boardId/invitations/:invitationId` board üzerinden yetkilendirilir; servis ikinci id'yi `boardId` ile kapsar (Faz 5'teki iki id'li route deseni).
- Üye olmayan → 404 `Board not found`, MEMBER → 403 (PLAN rol matrisi: davet gönderme/iptal ADMIN+).
- Kabulde e-posta JWT claim'inden değil **DB'den** okunur (`user.findUnique({ where: { id }, select: { email } })`); kullanıcı yoksa 401 `UNAUTHORIZED`.

### 4.3 Token ve gizlilik
- Üretim: `newOpaqueToken()` → 43 karakterlik base64url. Saklama: `hashToken(token)` (sha256 hex) → `tokenHash`. Arama: `where: { tokenHash: hashToken(token) }`.
- Gelen `:token` önce `isInvitationToken` ile kontrol edilir; uymuyorsa DB'ye gitmeden 404 (bozuk id → 404 deseniyle aynı).
- Ham token şunlarda **bulunmaz**: `InvitationDto`, `GET` listesi, önizleme, hata mesajları, uygulama logları. Mapper'lar açık `select` kullanır (`tokenHash` hiç seçilmez). Global filter yalnız 5xx'te stack loglar; HTTP istek logu yok (URL'deki token loglanmaz). Hata gövdesindeki `path` alanı token'ı içerir ama yalnızca token'ı zaten gönderen istemciye döner.
- `MailService` dev/test ortamında bağlantıyı loglar (PLAN §1 madde 3: "MailService linki loglar"). **Production'da** bağlantı ve tam e-posta loglanmaz: `Invitation <id> created for b***@example.com (link not logged in production)`. Log toplayıcıya token sızmasın diye.
- Token tahmini: 256 bit rastgelelik, sayım pratikte imkânsız. Rate limit (§4.8) bunun yerine kötüye kullanım ve yük için.
- Tarayıcı tarafı: token URL path'inde; varsayılan `strict-origin-when-cross-origin` referrer politikası path'i üçüncü taraflara göndermez; uygulamada harici kaynak yok.
- Bilinen ve kabul edilen sızıntı: hibrit akış, davet edene e-postanın kayıtlı olup olmadığını gösterir (`MEMBER_ADDED` / `INVITATION_CREATED`). Kayıt endpoint'i `EMAIL_TAKEN` ile zaten aynı bilgiyi veriyor; davet oluşturma rate limit'lidir (§9 R5).

### 4.4 Kilitleme, transaction'lar ve yarışlar
**Kural:** Davet oluşturma, kabul ve iptal tek `prisma.$transaction` içinde çalışır ve **ilk iş** `lockBoard(tx, boardId)` çağırır (`src/ordering/locks.ts`, `FOR NO KEY UPDATE`). `false` dönerse board silinmiştir: oluşturma/iptal → 404 `Board not found`, kabul → 404 `Invitation not found`.

**Kilit sırası (uygulama geneli, Faz 5'ten genişletilmiş):** `Board → List → Card → (Checklist / ChecklistItem)`; davet yazımları `Board → (Invitation, BoardMember satırları)`. Davet yazımları hiçbir List/Card kilidi almaz; List/Card yazımları Invitation/BoardMember satırı kilitlemez. Döngü oluşmaz. `BoardMember` insert'inin `Board`/`User` FK kontrolü (`KEY SHARE`) `FOR NO KEY UPDATE` ile çakışmaz (`locks.ts`'teki gerekçe). Board silme (`DELETE`, `FOR UPDATE` gücünde) bizim kilidimizi bekler; sonra cascade ile yeni üyeliği de siler.

Neden board satırı (davet satırı değil): oluşturma yolunda henüz satır olmayabilir (insert), kayıtlı/kayıtsız kararı `User` tablosuna bakar ve "üye mi" kontrolü `BoardMember`'a bakar. Tek bir board kilidi bu üç okumayı ve yazımı aynı board'daki diğer davet yazımlarına karşı atomik yapar. Bedeli: aynı board'daki liste yazımlarıyla milisaniyelik sıralanma (MVP'de önemsiz).

| İşlem | Tx | Kilit | Notlar |
|---|---|---|---|
| Davet oluşturma | var | `lockBoard` | §4.5 prosedürü; mail commit'ten **sonra** |
| Bekleyen davetleri listeleme | yok | yok | Tek sorgu |
| İptal | var | `lockBoard` | Kabulle sıraya girer; sonuç deterministik |
| Önizleme | yok | yok | Tek sorgu, salt okuma |
| Kabul | var | `lockBoard` | Önce tx dışında `tokenHash → boardId` bulunur, sonra kilit ve **kilit altında yeniden okuma** |
| Rol değiştirme / üye çıkarma / ayrılma | mevcut (yok) | yok | Davet satırlarıyla etkileşmez; eşzamanlı silmede P2025 → 404 (mevcut davranış) |

**Yarış senaryoları ve beklenen sonuçlar** (hepsi e2e'de, §8)
| Senaryo | Sonuç |
|---|---|
| Aynı kullanıcı aynı token'la N paralel kabul (çift tıklama, StrictMode) | Hepsi 200 `{ boardId }`, tek `BoardMember` satırı. İlk gelen kabul eder; diğerleri kilit sonrası `ACCEPTED + üye + e-posta eşleşmesi` görüp idempotent döner. |
| Kabul ↔ iptal | İptal önce: kabul 410 `INVITATION_REVOKED`, üyelik yok. Kabul önce: iptal 409 `INVITATION_USED`, üyelik var. 500 yok. |
| Kabul ↔ yeniden davet (token rotasyonu) | Yeniden davet önce ve e-posta kayıtlıysa: doğrudan üye + davet `ACCEPTED` → eski token'la kabul 200 (idempotent). Kayıtsız görünürse yeni token → eski token 404. Kabul önce: yeniden davet 409 `ALREADY_MEMBER`. Her durumda tek üyelik. |
| İki yönetici aynı kayıtsız e-postayı aynı anda davet eder | İkisi de 201; tek `Invitation` satırı; yalnızca **son** yazılan token çalışır, diğeri 404 (beklenen: yeniden davet eski linki geçersiz kılar). |
| İki yönetici aynı kayıtlı e-postayı aynı anda davet eder | Biri 201 `MEMBER_ADDED`, diğeri 409 `ALREADY_MEMBER`; tek üyelik. (`createMany({ skipDuplicates: true })` + `count === 0` → `ALREADY_MEMBER`; kilit olmasa da P2002 oluşmaz.) |
| Kabul ↔ board silme | 200 ya da 404; kalıntı satır yok; 500 yok. |
| Davet eden, istek sırasında rolünü kaybeder | Guard kontrolünden sonraki TOCTOU; davet geçerli sayılır (diğer endpoint'lerle aynı kabul). |
| Nadir deadlock/serileştirme hatası | Global filter → 409 `CONFLICT` (mevcut eşleme). |

### 4.5 Servis prosedürleri (`InvitationsService`)

**`create(boardId, actor: BoardActor, input)`**
1. `canInviteAs(actor.role, input.role)` değilse 403 `FORBIDDEN`.
2. `email = normalizeEmail(input.email)`, `now = new Date()`.
3. Tx: `lockBoard` → `user = tx.user.findUnique({ where: { email }, select: { id } })`.
4. **Kayıtlı:** `tx.boardMember.createMany({ data: [{ boardId, userId, role }], skipDuplicates: true })`. `count === 0` → 409 `ALREADY_MEMBER`. Aynı `(boardId, email)` için `PENDING` davet varsa `updateMany → ACCEPTED, acceptedAt: now`. Üye `MEMBER_SELECT` ile okunur → `{ result: 'MEMBER_ADDED', member }`.
5. **Kayıtsız:** `token = newOpaqueToken()`. `tx.invitation.upsert({ where: { boardId_email }, create: {...}, update: { role, tokenHash, invitedById: actor.userId, expiresAt: now + TTL, status: 'PENDING', acceptedAt: null }, select: INVITATION_SELECT })` (select ayrıca mail için `board.title` ve `invitedBy.name` içerir). Yanıt: `{ result: 'INVITATION_CREATED', invitation, inviteUrl: `${APP_URL}/invitations/${token}` }`.
6. Commit sonrası (sadece 5. dal): `mail.sendInvitation({ to: email, boardTitle, inviterName, inviteUrl, expiresAt })`. Hata yakalanır ve token'sız loglanır (`invitationId` ile); istek başarılı kalır.

**`listPending(boardId)`**: `findMany({ where: { boardId, status: 'PENDING', expiresAt: { gt: now } }, select: INVITATION_SELECT, orderBy: INVITATION_ORDER })` → `InvitationDto[]`.

**`revoke(boardId, invitationId)`** (tx + `lockBoard`): `findFirst({ where: { id, boardId }, select: { status } })`. Yok → 404 `Invitation not found`. `ACCEPTED` → 409 `INVITATION_USED`. `REVOKED` → no-op (204, idempotent). `PENDING` (süresi dolmuş olsa da) → `REVOKED`.

**`preview(token)`**: biçim kontrolü → `findUnique({ where: { tokenHash }, select: PREVIEW_SELECT })` (email, role, status, expiresAt, `board.title`, `invitedBy.name`). Yok → 404. Durum kontrolü (aşağıdaki sıra) → `InvitationPreviewDto`.

**`accept(token, userId)`**
1. Biçim kontrolü → `found = findUnique({ where: { tokenHash }, select: { boardId } })`; yok → 404.
2. Tx: `lockBoard(found.boardId)` (`false` → 404) → daveti `tokenHash` ile **yeniden oku** (yok → 404: yeniden davetle token değişmiş ya da board silinmiş) → kullanıcının e-postasını oku (yok → 401).
3. Durum sırası (önizleme de aynı sırayı kullanır, kullanıcıya bağlı adımlar hariç):
   1. `REVOKED` → 410 `INVITATION_REVOKED`
   2. `ACCEPTED` → e-posta eşleşiyor **ve** kullanıcı üyeyse 200 `{ boardId }`; değilse 410 `INVITATION_USED` (ör. kabul edip sonra ayrılmış kullanıcı eski linkle geri giremez; yeniden davet gerekir)
   3. `expiresAt <= now` → 410 `INVITATION_EXPIRED`
   4. e-posta eşleşmiyor → 403 `EMAIL_MISMATCH`
4. `boardMember.createMany({ data: [{ boardId, userId, role: invitation.role }], skipDuplicates: true })` — kullanıcı zaten üyeyse (başka yoldan eklenmiş) rolü **değişmez**.
5. `invitation.update({ where: { id }, data: { status: 'ACCEPTED', acceptedAt: now } })` → `{ boardId }`.

`InvitationsService` `ConfigService`'ten `APP_URL`'i constructor'da bir kez okur. Saat `new Date()` ile işlem başına bir kez alınır (unit testte fake timer).

### 4.6 Validasyon (class-validator)
| DTO | Alan | Kural |
|---|---|---|
| `CreateInvitationDto` | `email` | `@Trim() @IsEmail() @MaxLength(AUTH_LIMITS.EMAIL_MAX)` (lowercase serviste) |
| | `role` | `@IsIn(ASSIGNABLE_BOARD_ROLES)` (zorunlu; `OWNER` → 400) |
| `:invitationId` | – | `ParseUUIDPipe` → bozuksa 400 `VALIDATION_FAILED` (members route'larıyla aynı) |
| `:token` | – | Pipe yok; servis `isInvitationToken` ile 404 döner |

Global `ValidationPipe` (`whitelist`, `forbidNonWhitelisted`) bilinmeyen alanları 400 ile reddeder; `RejectNulPipe` NUL karakterini reddeder (mevcut).

### 4.7 Endpoint tablosu (`/api/v1`)
| Method | Path | Auth / Rol | Body | Başarı | Hatalar |
|---|---|---|---|---|---|
| POST | `/boards/:boardId/invitations` | JWT, ADMIN; throttle | `CreateInvitationRequest` | 201 `CreateInvitationResponse` | 400 validasyon; 403 `FORBIDDEN` (MEMBER, ya da ADMIN→ADMIN daveti); 404 `Board not found`; 409 `ALREADY_MEMBER`; 429 |
| GET | `/boards/:boardId/invitations` | JWT, ADMIN | – | 200 `InvitationDto[]` (PENDING, süresi dolmamış, `updatedAt desc`) | 403; 404 |
| DELETE | `/boards/:boardId/invitations/:invitationId` | JWT, ADMIN | – | 204 (REVOKED; zaten REVOKED ise de 204) | 400 bozuk id; 403; 404 `Invitation not found`; 409 `INVITATION_USED` |
| GET | `/invitations/:token` | Public; throttle | – | 200 `InvitationPreviewDto` | 404 `Invitation not found`; 410 `INVITATION_EXPIRED` / `INVITATION_REVOKED` / `INVITATION_USED`; 429 |
| POST | `/invitations/:token/accept` | JWT; throttle | – (boş gövde; alan gönderilirse 400) | **200** `AcceptInvitationResponse` (`@HttpCode(200)`) | 401; 403 `EMAIL_MISMATCH`; 404; 410 (üç kod); 429 |

Ortak 401 her korumalı route'ta geçerli. `GoneException` (410) Nest'te mevcut; her 410 açık `code` ile fırlatılır (filter'ın status→kod tablosuna 410 eklenmez).

**PLAN §4'ten sapmalar**
1. İptal edilmiş ve kullanılmış davet için yeni kodlar: `INVITATION_REVOKED`, `INVITATION_USED` (PLAN'da hepsi `INVITATION_EXPIRED`).
2. ADMIN rolüyle davet sadece OWNER'a açık (PLAN belirtmiyordu; rol matrisinden türetildi).
3. `DELETE` iptali idempotent; kabul edilmiş davette 409 `INVITATION_USED`.
4. Kabulde zaten üye olan kullanıcının rolü değişmez.
5. Kayıtlı e-postaya doğrudan eklemede aynı e-postanın bekleyen daveti `ACCEPTED` yapılır (eski link tıklanırsa kullanıcı sorunsuz board'a gider).

### 4.8 Rate limit
`ThrottlerModule`'ün mevcut `default` throttler'ı route bazında sayar (anahtar = controller + handler + IP). Üç route'a `@Throttle({ default: { limit: invitationRateLimit, ttl: 60_000 } })`:
- `POST /boards/:boardId/invitations` (spam ve kayıtlı-e-posta sorgulama sınırı),
- `GET /invitations/:token` (public; yük/kötüye kullanım),
- `POST /invitations/:token/accept`.

Diğer davet route'ları genel 300/dk sınırında kalır. Reverse proxy arkasında doğru IP için `trust proxy` PLAN'daki gibi Faz 8'de.

### 4.9 `MailService` (`src/mail/mail.service.ts`)
```ts
export interface InvitationMail {
  to: string;
  boardTitle: string;
  inviterName: string;
  inviteUrl: string;
  expiresAt: Date;
}

/** MVP: logs instead of sending. A real transport replaces the body, not the signature. */
@Injectable()
export class MailService {
  sendInvitation(mail: InvitationMail): Promise<void>;
}
```
- `NODE_ENV !== 'production'`: `Logger('MailService').log(...)` ile alıcı, board adı ve bağlantı.
- `production`: bağlantı yok, e-posta maskelenmiş (`b***@example.com`).
- Kayıtlı kullanıcıyı doğrudan eklemede mail **yok** (bildirimler kapsam dışı).

---

## 5. WebSocket Sözleşmesi

Bu fazda **yayın yok** (Faz 7). Faz 7'de commit sonrası eklenecekler (PLAN §5 ile aynı adlar):

| Tetikleyen | Event | Room | `data` |
|---|---|---|---|
| Davet → `MEMBER_ADDED`, kabul | `member:added` | `board:<id>` | `MemberDto` |
| aynı | `membership:added` | `user:<eklenen>` | `BoardSummaryDto` (alıcının `myRole`'üyle) |
| Rol değiştirme | `member:updated` | `board:<id>` | `MemberDto` |
| Çıkarma / ayrılma | `member:removed` + `membership:removed` | board + `user:<çıkan>` | `{ userId }` / `{ boardId }`; çıkanın socket'leri room'dan atılır |

`invitation:*` event'i **eklenmez**: board room'unda MEMBER'lar da var, davet e-postaları ise sadece ADMIN+'a açık. ADMIN'in açık bekleyen davet listesi `member:added` geldiğinde `boardInvitationKeys.list(boardId)`'yi invalidate eder (Faz 7 notu). Hazırlık: `accept` ve `create` servis metotları Faz 7'de `MemberDto`'yu da döndürecek şekilde genişletilir; controller yanıtı değişmez.

---

## 6. Frontend

### 6.1 Route
`frontend/src/app/routes.tsx`: `RootLayout`'un **doğrudan** çocuğu (ne `ProtectedRoute` ne `GuestRoute` altında), lazy:
```ts
{
  path: 'invitations/:token',
  lazy: async () => {
    const { InvitationAcceptPage } = await import('../features/invitations');
    return { Component: InvitationAcceptPage };
  },
},
```
`main.tsx`'teki `bootstrapSession()` her sayfada çalıştığı için sayfa açılışta oturum durumu `unknown → authenticated/anonymous` olur.

### 6.2 `returnUrl` desteği (şu an **yok**)
Mevcut durum: `ProtectedRoute` girişe router state ile (`state.from`) yönlendirir; `GuestRoute` girişten sonra `redirectTarget(location.state)`'e gider. Login ↔ register bağlantıları state'i taşımaz; query tabanlı `returnUrl` okunmaz.

Değişiklikler (`features/auth`):
- `lib/redirect-target.ts`:
  - `safeReturnPath(value: string | null): string | null` — sadece aynı origin'e göreli yol. `new URL(value, 'https://app.invalid')` ile çözülür; origin farklıysa (`//evil`, `/\evil`, `https:`, `javascript:`), `/` ile başlamıyorsa ya da 2048 karakteri aşıyorsa `null`. Dönüş: `pathname + search + hash`.
  - `redirectTarget(location: { state: unknown; search: string }): string` — öncelik: `state.from` (mevcut) → `?returnUrl=` → `'/'`.
  - `authPageLink(page: 'login' | 'register', returnUrl: string): To` → `{ pathname: '/login', search: '?returnUrl=…' }`.
  - `prefillEmail(state: unknown): string` — `state.email` string ise.
- `route-guards.tsx`: `GuestRoute` → `redirectTarget(location)`. `ProtectedRoute` değişmez (state ile devam; §10 S10).
- `login-page.tsx` / `register-page.tsx`: alttaki çapraz bağlantı mevcut `location.search` ve `location.state`'i taşır (returnUrl kaybolmaz).
- `use-login-form.ts` / `use-register-form.ts`: `defaultValues.email = prefillEmail(location.state)`.
- `index.ts`: `+ authPageLink`, `useLogout` (davet sayfasındaki "Çıkış yap" için).
- E-posta Zod şeması `auth-schemas.ts`'ten `shared/lib/email-schema.ts`'e taşınır (davet formu da kullanır; davranış aynı).

### 6.3 Klasörler ve bağımlılık yönü
```
frontend/src/
├── app/routes.tsx                         + invitations/:token
├── shared/
│   ├── lib/board-role.ts                  ROLE_LABEL: { OWNER: 'Sahip', ADMIN: 'Yönetici', MEMBER: 'Üye' }
│   ├── lib/email-schema.ts                (taşındı)
│   ├── hooks/use-copy-to-clipboard.ts     copy(text) → 'idle' | 'copied' | 'failed'
│   └── ui/centered-card.tsx               AuthCard buraya taşınır (useId ile başlık id'si); auth ve davet sayfası kullanır
├── features/auth/                          §6.2
├── features/board-detail/
│   ├── api/members-api.ts                  updateRole(boardId, userId, body), remove(boardId, userId)
│   ├── api/invitations-api.ts              create(boardId, body), list(boardId), revoke(boardId, invitationId)
│   ├── api/board-invitation-keys.ts
│   ├── api/use-member-mutations.ts         useUpdateMemberRole, useRemoveMember, useLeaveBoard
│   ├── api/use-board-invitations.ts        useBoardInvitations, useCreateInvitation, useRevokeInvitation
│   ├── lib/board-cache.ts                  + upsertMember, patchMember, removeMember (MEMBER_ORDER ile sıralı)
│   ├── schemas/invite-schemas.ts           inviteSchema { email, role }
│   ├── hooks/use-invite-form.ts            form + sonuç (link ya da "eklendi") + odak
│   ├── hooks/use-member-actions.ts         onay durumu, durum mesajı, silme sonrası odak
│   ├── hooks/use-board-actions.ts          + membersOpen / openMembers / closeMembers
│   ├── components/members-dialog.tsx
│   ├── components/invite-member-form.tsx
│   ├── components/invite-link-field.tsx
│   ├── components/member-list.tsx          (MemberRow dahil)
│   ├── components/pending-invitations.tsx
│   └── components/board-header.tsx         + "Üyeler" butonu
└── features/invitations/                   (yeni)
    ├── api/invitation-keys.ts
    ├── api/invitations-api.ts              preview(token), accept(token)
    ├── api/use-invitation-preview.ts
    ├── api/use-accept-invitation.ts
    ├── hooks/use-invitation-page.ts        görünüm durumu, e-posta eşleşmesi, otomatik kabul
    ├── lib/invitation-error-message.ts
    ├── store/invitation-intent-store.ts
    ├── components/invitation-accept-page.tsx
    └── index.ts                            export { InvitationAcceptPage }
```
Bağımlılık: `invitations → auth (index), boards (index: boardKeys)`; `board-detail → boards, auth` (auth'tan yalnız `useCurrentUser`, index üzerinden; diyalogda "(sen)" ve ayrılma için); `card-detail → board-detail` (değişmez). `board-detail` ve `invitations` birbirini import etmez. `src/test/setup.ts` `afterEach`'e `resetInvitationIntent()` eklenir.

### 6.4 Sorgu anahtarları ve cache
```ts
// features/board-detail/api/board-invitation-keys.ts
export const boardInvitationKeys = {
  all: ['board-invitations'] as const,
  list: (boardId: string) => [...boardInvitationKeys.all, boardId] as const,
};

// features/invitations/api/invitation-keys.ts
export const invitationKeys = {
  all: ['invitations'] as const,
  preview: (token: string) => [...invitationKeys.all, 'preview', token] as const,
};
```
| Veri | Kaynak | Not |
|---|---|---|
| Üyeler | `boardKeys.detail(boardId)` → `detail.members` | Ayrı query yok. Diyalog sırası: `joinedAt asc, userId` (render'da hesaplanır; rol değişince satır yer değiştirmez, odak kaybolmaz). Avatar yığını sunucu sırasını (`MEMBER_ORDER`) kullanır. |
| Bekleyen davetler | `useBoardInvitations(boardId, enabled)` → `boardInvitationKeys.list` | `enabled = dialogOpen && hasBoardRole(myRole, 'ADMIN')`. MEMBER hiç istek atmaz. Varsayılan `staleTime` 30 sn. |
| Önizleme | `useInvitationPreview(token)` → `invitationKeys.preview` | `enabled = isInvitationToken(token)` (bozuksa istek yok, doğrudan "bulunamadı"). 4xx tekrar denenmez (`query-client.ts`). Kabulden sonra `removeQueries`. |

### 6.5 Mutation hook'ları
| Hook (dosya) | API | Optimistic | Cache etkisi / hata |
|---|---|---|---|
| `useUpdateMemberRole(boardId)` (`use-member-mutations.ts`) | `PATCH /boards/:id/members/:userId` | ✓ `useBoardMutation` + `patchMember` | `onSuccessCache: upsertMember`. Hata → geri al + diyalog içi alert; 404/400 → `useBoardMutation` son mutation'da board'u yeniler. |
| `useRemoveMember(boardId)` | `DELETE /boards/:id/members/:userId` | ✗ (`ConfirmDialog` bekler) | `useBoardMutation` + `onSuccessCache: removeMember`. Hata `ConfirmDialog error`'da. |
| `useLeaveBoard(boardId)` | `DELETE /boards/:id/members/:myId` | ✗ (onaylı) | **`useBoardMutation` değil** (`useDeleteBoard` deseni): `onSuccess` → `removeQueries(boardKeys.detail)`, `boardKeys.list` cache'inden çıkar, `removeQueries(boardInvitationKeys.list)`. Çağıran: `navigate('/boards', { replace: true })` + toast. |
| `useCreateInvitation(boardId)` (`use-board-invitations.ts`) | `POST /boards/:id/invitations` | ✗ (sunucu sonucu gerekli) | `useBoardMutation` (ortak `mutationKey`). `MEMBER_ADDED` → `onSuccessCache: upsertMember` + davet listesinden aynı e-postayı çıkar. `INVITATION_CREATED` → davet listesine en üste upsert. Her başarıda `boardInvitationKeys.list` invalidate. `ALREADY_MEMBER` → e-posta alanına hata. |
| `useRevokeInvitation(boardId)` | `DELETE /boards/:id/invitations/:invitationId` | ✓ (davet listesinden çıkar) | Düz `useMutation`: `onMutate` cancel + snapshot + çıkar; `onError` geri al + alert; `INVITATION_USED` → "Davet az önce kabul edildi." + `boardKeys.detail` ve davet listesi invalidate; `onSettled` davet listesi invalidate. |
| `useAcceptInvitation(token)` (`invitations/api`) | `POST /invitations/:token/accept` | ✗ | `onSuccess` → `removeQueries(invitationKeys.preview(token))`, `invalidateQueries(boardKeys.list())`; sayfa `navigate('/boards/:boardId', { replace: true })` + toast "“X” panosuna katıldın." |

"Yeni bağlantı" butonu ayrı bir hook değildir: aynı `useCreateInvitation`'ı satırdaki `{ email, role }` ile çağırır; sonuç formdaki bağlantı alanında gösterilir.

### 6.6 Bileşen ağacı: Üyeler diyaloğu
```
BoardPage
└── BoardHeader             + "Üyeler" (variant on-board; herkes görür) → membersOpen
    └── MembersDialog       Dialog title="Pano üyeleri" showCloseButton (size md; dar ekranda satırlar sarar)
        ├── <p role="status">  durum duyuruları ("Ayşe panoya eklendi.", "Davet iptal edildi." …)
        ├── InviteMemberForm   (sadece ADMIN+) <section aria-labelledby> h3 "Davet et"
        │   ├── TextField "E-posta" (type=email, autoComplete=off)
        │   ├── SelectField "Rol" (Üye / Yönetici) — sadece OWNER'a gösterilir; ADMIN için gizli, rol MEMBER
        │   ├── Button "Davet et" (primary, loading)
        │   └── InviteLinkField    (son sonuç INVITATION_CREATED ise)
        ├── MemberList          <section> h3 "Üyeler" (tabIndex=-1, silme sonrası odak hedefi) → <ul aria-labelledby>
        │   └── MemberRow ×N    Avatar · ad (+ "(sen)") · e-posta (text-fg-muted)
        │                       · rol: canChangeMemberRole → SelectField (görünmez etiket "Ayşe Yılmaz rolü"), değilse metin
        │                       · checkMemberRemoval === 'ALLOWED' && başkası → Button ghost "Çıkar" (aria-label "Ayşe Yılmaz kişisini panodan çıkar")
        │                       · kendisi && OWNER değil → Button ghost "Panodan ayrıl"
        │                       → ConfirmDialog (iç içe dialog; Faz 5'teki close olayı ayrımı geçerli)
        └── PendingInvitations  (sadece ADMIN+) h3 "Bekleyen davetler" (tabIndex=-1) → <ul>
            ├── yükleniyor / hata (FormAlert + "Tekrar dene") / boş: "Bekleyen davet yok."
            └── InvitationRow   e-posta · ROLE_LABEL · "5 Kasım 2026 14:30'a kadar geçerli" (formatDueLong) · "Davet eden: Ali"
                                · Button "Yeni bağlantı" · Button "İptal et" (onaysız, optimistic)
```
- Diyalog açık durumu `useBoardActions` içindeki yerel state (etiket ve arşiv diyaloglarıyla aynı desen); Zustand gerekmez.
- Diyalog modal olduğu için toast'lar görünmez (Faz 5 risk 1). Diyalog içi hatalar `FormAlert`/`role="alert"` ile, başarılar `role="status"` ile verilir. Ayrılma başarılı olunca diyalog board'la birlikte kapanır; toast `/boards`'ta görünür.
- **Odak:** "Davet et" `MEMBER_ADDED` → alan temizlenir, odak e-posta alanında kalır. `INVITATION_CREATED` → odak "Bağlantıyı kopyala" butonuna. Rol değişimi: satır yerinde kalır, odak select'te. Çıkarma/iptal sonrası: sonraki satırın aynı butonuna, yoksa bölüm başlığına (`tabIndex=-1`). ConfirmDialog "Vazgeç" ilk odak (mevcut).
- **ConfirmDialog metinleri:**
  - Çıkar: başlık "Üye çıkarılsın mı?", gövde "**Ayşe Yılmaz** panodan çıkarılacak. Tekrar erişmesi için yeniden davet edilmesi gerekir.", buton "Çıkar".
  - Ayrıl: başlık "Panodan ayrılınsın mı?", gövde "**Yol haritası** panosundan ayrılacaksın. Tekrar katılmak için yeniden davet edilmen gerekir.", buton "Panodan ayrıl". Başarı toast'ı: "“Yol haritası” panosundan ayrıldın."

### 6.7 `InvitationAcceptPage` (`/invitations/:token`)
`CenteredCard` içinde, h1 "Panoya davet". Durumlar (`useInvitationPage` türetir, bileşen sadece çizer):

| Durum | İçerik |
|---|---|
| Token biçimi bozuk | "Davet bulunamadı" görünümü (istek yok) |
| Önizleme yükleniyor | `PageLoader` "Davet yükleniyor…" |
| 404 / 410 | h1 "Davet kullanılamıyor" + `invitationErrorMessage` (§6.9) + bağlantı: girişliyse "Panolarına git" (`/boards`), değilse "Giriş yap" (`/login`) |
| Önizleme var | "**Ali Demir** seni **Yol haritası** panosuna **Üye** olarak davet etti." · "Davet **b@example.com** adresine gönderildi." · "5 Kasım 2026 14:30'a kadar geçerli." |
| + oturum `unknown` | Eylem alanında küçük yükleyici |
| + `anonymous` | "Daveti kabul etmek için hesap oluştur ya da giriş yap." · `Link` "Kayıt ol" (primary görünüm) + `Link` "Giriş yap" (secondary). İkisi de `authPageLink(..., '/invitations/<token>')`, `state={{ email: preview.email }}` ve `onClick → rememberIntent(token)` |
| + `authenticated`, e-posta eşleşiyor | Button "Daveti kabul et" (primary). Niyet varsa otomatik kabul; bu sırada `role="status"` "Davet kabul ediliyor…" |
| + `authenticated`, e-posta farklı | Uyarı (role="alert" değil, düz metin; `text-warning` tonu): "Bu davet **b@example.com** adresine gönderildi. Şu an **c@example.com** olarak giriş yaptın. Daveti kabul etmek için davet edilen adresle giriş yap." · Button "Çıkış yap" (`useLogout` → sayfa `anonymous` görünümüne döner). Kabul butonu yok (sunucu yine 403 verir). |
| Kabul hatası | `FormAlert` (§6.9). 410/403/404'te buton gizlenir; 5xx/ağ hatasında buton "Tekrar dene" olarak kalır. |

**Dönüşte kabul (otomatik):**
- `store/invitation-intent-store.ts` (Zustand, **sadece bellek**): `{ token: string | null; remember(token); consume(token): boolean }`. `consume` eşleşirse `true` döner ve temizler (tek seferlik).
- `useInvitationPage` içindeki effect: `status === 'authenticated' && preview && emailMatches` olduğunda `useInvitationIntentStore.getState().consume(token)` `true` dönerse `accept.mutate()`. `getState()` + tek seferlik `consume`, StrictMode'un çift effect çalıştırmasında ikinci isteği engeller; sunucu da idempotent.
- Niyet yalnızca kullanıcı bu sayfadaki butona bastığında yazılır. Bu yüzden başkasının gönderdiği bir URL, girişli kullanıcıyı onay almadan board'a sokamaz (`?accept=1` gibi bir query **kullanılmaz**). Sayfa yenilenirse niyet kaybolur, buton gösterilir.
- Akış: anonim → "Kayıt ol" → `/register?returnUrl=%2Finvitations%2F<token>` (e-posta dolu) → kayıt → `setSession` → `GuestRoute` `redirectTarget` ile davet sayfasına → otomatik kabul → `/boards/:boardId` (replace) + toast.

### 6.8 Kopyalanabilir davet bağlantısı (`InviteLinkField`)
- `TextField` label "Davet bağlantısı", `readOnly`, `value={inviteUrl}`, `onFocus` → `select()`. Hint (`aria-describedby`): "Bağlantı 7 gün geçerli ve yalnızca b@example.com adresiyle açılan bir hesapla kabul edilebilir. Yeniden davet edersen bu bağlantı geçersiz olur."
- Button "Bağlantıyı kopyala" → `useCopyToClipboard().copy(inviteUrl)`:
  - başarı → diyaloğun `role="status"` bölgesinde "Bağlantı kopyalandı." (buton metni değişmez; erişilebilir ad sabit kalır)
  - `navigator.clipboard` yok/hata (güvensiz origin) → input seçilir + "Kopyalanamadı. Bağlantıyı seçip elle kopyala."
- Bağlantı diyalog kapanınca kaybolur (sunucu tekrar veremez). Kaybolursa "Yeni bağlantı".
- Bağlantının başına davet e-postası yazılır ("b@example.com için davet bağlantısı"), böylece birden çok davet arka arkaya üretildiğinde hangisi olduğu belli olur.

### 6.9 Hata metinleri (`invitation-error-message.ts` ve davet formu)
| Kod / status | Metin |
|---|---|
| 404 | "Davet bulunamadı. Bağlantı hatalı olabilir ya da davet yenilenmiş olabilir." |
| `INVITATION_EXPIRED` | "Bu davetin süresi dolmuş. Seni davet eden kişiden yeni bir davet iste." |
| `INVITATION_REVOKED` | "Bu davet iptal edilmiş." |
| `INVITATION_USED` (sayfa) | "Bu davet zaten kullanılmış. Panoya erişimin varsa Panolarım sayfasında görebilirsin." |
| `INVITATION_USED` (iptal) | "Davet az önce kabul edildi." |
| `EMAIL_MISMATCH` | "Bu davet başka bir e-posta adresine gönderilmiş. Davet edilen adresle giriş yap." |
| `ALREADY_MEMBER` (e-posta alanı) | "Bu kişi zaten panonun üyesi." |
| 403 `FORBIDDEN` (davet) | `apiErrorMessage` → "Bu işlem için yetkin yok." |
| 429 | "Çok fazla istek gönderildi. Biraz bekleyip tekrar dene." (mevcut `apiErrorMessage`) |
| Zod | "E-posta adresini gir." / "Geçerli bir e-posta adresi gir." / "E-posta adresi çok uzun." (taşınan şema) |

### 6.10 Erişilebilirlik özeti
Diyalog adı "Pano üyeleri"; bölümler h3 ile adlandırılmış listeler. Rol select'lerinin adı kişiye özel ("Ayşe Yılmaz rolü"). Çıkar/iptal butonlarının adları kişiye/e-postaya özel ("b@example.com davetini iptal et"). Durum duyuruları tek bir kalıcı `role="status"` bölgesinde (içerik değişir, eleman yeniden mount olmaz). Davet sayfasında bağlantılar gerçek `<a>`; yükleme `role="status"`, hatalar `role="alert"`. Kopyalama klavyeyle yapılabilir; başarısızlıkta elle kopyalama yolu var. `ui-designer`: yeni token beklenmiyor; `text-warning` metnin iki temada kontrastı ve diyalogdaki satır düzeninin 320 px genişlikte sarması kontrol edilir.

---

## 7. Görev Dağılımı (sıralı, commit boyutunda)

Her adım kendi testleriyle commit'lenir (Conventional Commits, İngilizce). **Her adımın ortak "bitti" ölçütü:** ilgili workspace'te `npm run build` + `npm run typecheck` temiz, adımın yeni ve mevcut testleri geçiyor (`skip`/`only` yok), lint çalıştırılabiliyorsa temiz (bu makinede oxlint Smart App Control yüzünden çalışmıyorsa "lint çalıştırılamadı" diye raporlanır, kullanılmayan import ve yüzen promise elle kontrol edilir).

### 1. `backend-nest` — B1 `feat(contracts): add invitation contracts and member rules`
- §3.1–3.3: `invitations.ts`, `members.ts`, iki yeni `ErrorCode`.
- Testler: `shared/contracts/src/invitations.spec.ts` (`isInvitationToken`: 43 karakter base64url ✓, 42/44 ✗, `+`/`/`/`=` ✗), `members.spec.ts` (`checkMemberRemoval` tam matris: 3 aktör rolü × 3 hedef rolü × kendisi/başkası; `canChangeMemberRole`; `canInviteAs`).
- **Bitti:** contracts build + iki tarafta typecheck geçer.

### 2. `backend-nest` — B2 `refactor(members): use shared removal rules`
- `MembersService.remove` → `checkMemberRemoval`; `OWNER_CANNOT_LEAVE` → `ownerCannotLeave()`, `FORBIDDEN` → `insufficientRole()`.
- **Bitti:** `members.service.spec.ts` ve `boards.e2e-spec.ts` "members" bölümü değişmeden geçer.

### 3. `backend-nest` — B3 `feat(mail): add console mail service and invitation config`
- `common/crypto/opaque-token.ts` (+ `TokenService` bunu kullanır), `APP_URL`, `INVITATION_RATE_LIMIT_PER_MINUTE`, `invitationRateLimit()`, `.env.example`, `vitest.config.e2e.ts` env, `MailModule`/`MailService`.
- Testler: `opaque-token.spec.ts` (uzunluk 43, base64url, hash deterministik ve 64 hex), `env.validation.spec.ts` (APP_URL varsayılanı, geçersiz URL reddi, `invitationRateLimit` geri dönüşü), `mail.service.spec.ts` (dev: log bağlantıyı içerir; production: bağlantı ve tam e-posta yok), `token.service.spec.ts` değişmeden geçer.
- **Bitti:** yukarıdaki testler + mevcut auth e2e geçer.

### 4. `backend-nest` — B4 `feat(invitations): invite by email and manage pending invitations`
- `invitations/` modülü: `BoardInvitationsController` (POST/GET/DELETE), servis `create/listPending/revoke`, mapper, hatalar, DTO; `app.module.ts`; `test/utils/users.ts` `email?` parametresi; `test/utils/invitations.ts`.
- Unit: `create-invitation.dto.spec.ts` (trim, geçersiz e-posta, 255 karakter, `OWNER` → hata, rol eksik, ek alan); `invitations.service.spec.ts` create/list/revoke dalları (§8); `invitation.mapper.spec.ts` (DTO'da `tokenHash`/token yok).
- E2e: `invitations.e2e-spec.ts` §8 "Oluşturma", "Liste", "İptal", oluşturma yarışları.
- **Bitti:** B4 testleri + tüm backend e2e geçer.

### 5. `backend-nest` — B5 `feat(invitations): preview and accept invitations by token`
- `InvitationsController` (`@Public()` GET, POST accept `@HttpCode(200)`), `@Throttle` (üç route), servis `preview/accept`.
- Unit: `invitations.service.spec.ts` preview/accept dalları; `$queryRaw` (kilit) ilk tx çağrısı; kilit `false` → 404.
- E2e: §8 "Önizleme", "Kabul", kabul yarışları, rate limit, cascade.
- **Bitti:** `npm test -w backend` + `npm run test:e2e -w backend` tamamen yeşil.

### 6. `tester` — backend doğrulama turu
- Tüm backend unit + e2e'yi iki kez arka arkaya çalıştırır (yarış testlerinin kararsız olmadığını görmek için); eksik senaryo varsa ekler.
- **Bitti:** iki koşu da yeşil; kararsız test yok.

### 7. `frontend-react` — F1 `feat(auth): support returnUrl on login and register`
- §6.2; `shared/lib/email-schema.ts` taşıma; `CenteredCard` taşıma.
- Testler: `redirect-target.test.ts` (`returnUrl` geçerli; `//evil.example`, `/\evil.example`, `https://evil.example`, `javascript:alert(1)`, `boards`, 2049 karakter → `'/'`; `state.from` `returnUrl`'den önce gelir; search + hash korunur), `login-page.test.tsx` / `register-page.test.tsx` (`renderApp('/login?returnUrl=%2Fboards%2FB')` → başarıdan sonra `/boards/B`; çapraz bağlantı `returnUrl`'i taşır; `state.email` alanı doldurur), `route-guards.test.tsx` (girişli kullanıcı `/login?returnUrl=…` açınca hedefe gider).
- **Bitti:** frontend testleri yeşil; mevcut auth Playwright testi (`e2e/auth.spec.ts`) geçer.

### 8. `frontend-react` (+ `ui-designer`) — F2 `feat(board-detail): manage board members`
- `members-api.ts`, `use-member-mutations.ts`, `board-cache.ts` üye yardımcıları, `ROLE_LABEL`, `MembersDialog` (üye listesi, rol select, çıkar, ayrıl; davet bölümleri bu adımda yok), header "Üyeler".
- Testler: `board-cache.test.ts` (`upsertMember`/`patchMember`/`removeMember`, sıra = `MEMBER_ORDER`); `use-member-mutations.test.tsx` (rol optimistic + hata geri alma; çıkarma cache'ten düşer; ayrılma board detayını ve listedeki board'u kaldırır); `members-dialog.test.tsx` (§8 FE "Üyeler").
- `ui-designer`: satır düzeni, 320 px, iki tema, odak halkaları.
- **Bitti:** testler yeşil; MEMBER rolünde davet isteği atılmadığı MSW ile kanıtlanmış (handler'sız istek testi düşürür).

### 9. `frontend-react` (+ `ui-designer`) — F3 `feat(board-detail): invite members and manage pending invitations`
- `invitations-api.ts`, `board-invitation-keys.ts`, `use-board-invitations.ts`, `invite-schemas.ts`, `use-invite-form.ts`, `InviteMemberForm`, `InviteLinkField`, `PendingInvitations`, `use-copy-to-clipboard.ts`.
- Testler: `use-copy-to-clipboard.test.ts` (başarı, clipboard yok → `failed`); `use-board-invitations.test.tsx` (MEMBER_ADDED board cache'e üye ekler + aynı e-postalı daveti listeden çıkarır; INVITATION_CREATED listeye en üste ekler; iptal optimistic + geri alma; `INVITATION_USED` → board ve liste invalidate); `members-dialog.test.tsx` davet senaryoları (§8).
- **Bitti:** testler yeşil; `ui-designer` kontrast/klavye kontrolünü onaylamış.

### 10. `frontend-react` — F4 `feat(invitations): add the invitation accept page`
- `features/invitations/` tamamı, route, `setup.ts` reset, `auth` index export'ları.
- Testler: `invitation-intent-store.test.ts` (`consume` tek sefer, farklı token `false`); `invitation-accept-page.test.tsx` (§8 FE "Davet sayfası"); `routes.test.tsx` (`/invitations/:token` girişsiz açılır, login'e yönlendirmez).
- **Bitti:** tüm frontend unit testleri yeşil; `npm run build -w frontend` lazy chunk üretir.

### 11. `tester` — F5 `test(e2e): cover invitation and member flows`
- `frontend/e2e/invitations.spec.ts`, `e2e/helpers.ts`'e geriye uyumlu yardımcılar: `signUpAs(page, name, email?) → { token, email }` (mevcut `signUp` değişmez), `apiInvite(page, token, boardId, email, role)`, `inviteTokenPath(inviteUrl)`; `playwright.config.ts` env.
- §8 Playwright senaryoları.
- **Bitti:** `npm run test:e2e -w frontend` tamamen yeşil (yeni + eski spec'ler; koşular arasında ~1 dk, PLAN notu). Tam `npm test` + backend e2e son kez yeşil.

### 12. `code-reviewer` — faz incelemesi
- Odak: token'ın hiçbir log/response/DTO'ya sızmaması (`grep` ile `tokenHash` ve `inviteUrl` kullanım yerleri), e-posta normalizasyonu her yazım/karşılaştırma yolunda, `lockBoard` her davet yazımında ilk çağrı, `returnUrl` açık yönlendirme koruması, rate limit dekoratörleri, rol kontrollerinin FE ve BE'de aynı contracts fonksiyonundan gelmesi, `dangerouslySetInnerHTML` yok.
- **Bitti:** bulgular düzeltilmiş ya da gerekçeyle kabul edilmiş.

**Faz sonu:** `docs/PLAN.md` "İlerleme" Faz 6 satırı (sapmalar: §4.7, §1 kararlar). "Trello Clone — Geliştirme" panosundaki Faz 6 kartının "Bitti" checklist'i. `CLAUDE.md` "Komutlar" notuna "Playwright dev backend'i yeniden kullanıyorsa `INVITATION_RATE_LIMIT_PER_MINUTE` de yüksek olmalı" eklenmesi önerilir (kullanıcı onayıyla).

---

## 8. Test Planı

### Backend unit (Vitest, Prisma mock)
- **`invitations.service.spec.ts`**
  - create: ADMIN + `role: ADMIN` → 403, DB'ye gidilmez; tx'teki ilk çağrı `$queryRaw` (board kilidi); kilit `false` → 404; e-posta `"  B@Example.COM "` → `b@example.com` ile aranır; kayıtlı + `createMany count 0` → `ALREADY_MEMBER`; kayıtlı + `count 1` → `MEMBER_ADDED` ve PENDING davet `ACCEPTED` yapılır; kayıtsız → upsert'e giden `tokenHash` = `sha256(token)` ve ham token upsert argümanlarında **yok**; `expiresAt = now + 7 gün` (fake timer); `inviteUrl = APP_URL + '/invitations/' + token`; mail commit'ten sonra çağrılır; mail hata fırlatınca yanıt yine başarılı ve log'da token yok; `MEMBER_ADDED` dalında mail çağrılmaz.
  - list: `where` `PENDING` + `expiresAt > now`, `orderBy` doğru.
  - revoke: PENDING → REVOKED; REVOKED → yazım yok; ACCEPTED → 409 `INVITATION_USED`; başka board → 404.
  - preview: bozuk token → DB çağrısı yok + 404; durum sırası; `expiresAt === now` → expired.
  - accept: bozuk → 404; kilit sonrası yeniden okuma `null` → 404; REVOKED → 410; ACCEPTED + eşleşme + üye → 200; ACCEPTED + üye değil → 410 `INVITATION_USED`; expired → 410; mismatch → 403; başarı → `createMany skipDuplicates` + `update ACCEPTED`.
- `invitation.mapper.spec.ts`, `create-invitation.dto.spec.ts`, `opaque-token.spec.ts`, `mail.service.spec.ts`, `env.validation.spec.ts` (§7).

### Backend e2e (`backend/test/invitations.e2e-spec.ts`, Supertest, `trello_test`)
**Oluşturma**
1. Kayıtlı e-posta → 201 `MEMBER_ADDED`, `member.role` istenen rol; `GET /boards/:id` üyeler arasında; davetli `GET /boards`'ta board'u `myRole` ile görür.
2. `" Davetli@Example.COM "` ↔ kayıtlı `davetli@example.com` → `MEMBER_ADDED` (normalizasyon).
3. Kayıtsız → 201 `INVITATION_CREATED`; `inviteUrl` `^http://localhost:5173/invitations/[A-Za-z0-9_-]{43}$`; DB satırında `tokenHash === sha256(token)` ve satırın **hiçbir kolonu** ham token'ı içermiyor; e-posta lowercase.
4. Yeniden davet (aynı e-posta, rol `ADMIN`, OWNER ile) → aynı `id`, yeni token; eski token önizleme 404, yeni 200; rol ADMIN; `expiresAt` yenilendi; süresi dolmuş ve iptal edilmiş davet de aynı yolla PENDING'e döner.
5. Üye e-postası (kendisi/OWNER dahil) → 409 `ALREADY_MEMBER`.
6. Yetki: ADMIN → MEMBER daveti 201; ADMIN → ADMIN daveti 403; OWNER → ADMIN daveti 201; `role: 'OWNER'` → 400; MEMBER POST/GET/DELETE → 403; yabancı → 404 `Board not found`; token yok → 401; geçersiz e-posta / 255 karakter / ek alan → 400.
7. Kayıtlı e-postaya doğrudan ekleme, aynı e-postanın PENDING davetini ACCEPTED yapar; eski token'la kabul → 200 (idempotent).

**Liste**
8. Sadece PENDING ve süresi dolmamışlar, `updatedAt desc`; yanıt nesnelerinde `token`, `tokenHash`, `inviteUrl` alanı yok; başka board'un davetleri yok.

**İptal**
9. 204 → listede yok, önizleme 410 `INVITATION_REVOKED`; ikinci iptal 204; kabul edilmiş davet → 409 `INVITATION_USED`; başka board'un daveti → 404; bozuk id → 400; olmayan → 404.

**Önizleme** (Authorization başlığı **olmadan**)
10. 200 ve tam olarak `{ boardTitle, inviterName, email, role, expiresAt }` (başka alan yok: `id`, `boardId`, token yok).
11. Bozuk token (`abc`, 44 karakter) → 404; bilinmeyen 43 karakter → 404; `expiresAt` geçmişe çekilmiş (Prisma ile) → 410 `INVITATION_EXPIRED`; iptal → 410 `INVITATION_REVOKED`; kabul edilmiş → 410 `INVITATION_USED`.

**Kabul**
12. Davetli e-postasıyla kullanıcı (`createUser(app, 'Davetli', email)`) → 200 `{ boardId }`; üyelik davet rolüyle; davet `ACCEPTED` + `acceptedAt`; `GET /boards/:id` 200.
13. İkinci kabul → 200, tek üyelik.
14. Farklı kullanıcı → 403 `EMAIL_MISMATCH`, üye olmaz, davet PENDING kalır.
15. Kabul edip ayrılan kullanıcı aynı token'la → 410 `INVITATION_USED`.
16. Süresi dolmuş / iptal → 410 ilgili kod; token yok → 401; gövdede alan → 400.
17. PENDING davet varken kullanıcı Prisma ile başka rolde üye yapılmış → kabul 200, **rol değişmez**, davet ACCEPTED.

**Yarışlar** (`Promise.all`; her biri 5 tekrar; hiçbir yanıt 500 değil)
18. Aynı kullanıcı 10 paralel kabul → hepsi 200, `boardMember.count({ where: { boardId, userId } }) === 1`.
19. Kabul ↔ iptal → (200 & 409 & üye & ACCEPTED) ya da (410 & 204 & üye yok & REVOKED).
20. Aynı kayıtsız e-postaya 5 paralel davet → hepsi 201; tek `Invitation` satırı; 5 token'dan tam biri önizlemede 200, diğerleri 404.
21. Aynı kayıtlı e-postaya 5 paralel davet → bir 201 `MEMBER_ADDED`, dört 409 `ALREADY_MEMBER`, tek üyelik.
22. Kabul ↔ yeniden davet (kullanıcı kayıtlı) → sonuçta tek üyelik; yanıtlar {200, 201 `MEMBER_ADDED`} ya da {200, 409}.
23. Kabul ↔ board silme → kabul 200 ya da 404; sonunda `Invitation` ve `BoardMember` satırı yok.

**Diğer**
24. Cascade: board silinince davetler silinir.
25. Rate limit (kendi `createTestApp`'i olan ayrı `describe`, `vi.stubEnv('INVITATION_RATE_LIMIT_PER_MINUTE', '3')`): aynı IP'den 4. önizleme → 429 `TOO_MANY_REQUESTS`; ayrı sayaç olduğu için bu sırada `POST /auth/login` etkilenmez.

### Frontend unit/integration (Vitest + RTL + MSW)
- **Auth (F1):** §7 adım 7.
- **Üyeler (`members-dialog.test.tsx`, `renderApp('/boards/B')` + "Üyeler"):**
  - MEMBER: üye listesi görünür; "Davet et" bölümü, rol select'i, "Çıkar" yok; kendi satırında "Panodan ayrıl"; davet isteği yok.
  - ADMIN: rol select'i yok (OWNER değil); MEMBER satırında "Çıkar" var, ADMIN/OWNER satırında yok; davet formunda rol alanı yok ve gönderilen `role: 'MEMBER'`.
  - OWNER: diğerlerinin rol select'i; değişim → `PATCH { role }`, select yeni değeri hemen gösterir; 500 → eski değer + alert; kendi satırında "Panodan ayrıl" yok.
  - Çıkar → onay → `DELETE` → satır kalkar, avatar yığını güncellenir, odak sonraki satıra/başlığa.
  - Ayrıl → onay → `DELETE /members/<me>` → URL `/boards`, toast "“Yol haritası” panosundan ayrıldın.", `GET /boards` yanıtında board yok.
- **Davet (`members-dialog.test.tsx`):**
  - Geçersiz e-posta → Zod mesajı, istek yok.
  - `MEMBER_ADDED` → status "Ayşe Yılmaz panoya eklendi.", üye listede ve avatar yığınında, alan boş, odak alanda.
  - `INVITATION_CREATED` → "Davet bağlantısı" alanı URL'yi içerir; "Bağlantıyı kopyala" (userEvent clipboard) → panoda URL + status "Bağlantı kopyalandı."; bekleyen listede en üstte; odak kopyala butonunda.
  - `ALREADY_MEMBER` → e-posta alanında "Bu kişi zaten panonun üyesi." (`aria-describedby` ile bağlı).
  - Bekleyen davetler: yükleme/boş/hata durumları; "İptal et" → satır hemen kalkar; 500 → geri gelir + alert; 409 `INVITATION_USED` → "Davet az önce kabul edildi." + board yeniden çekilir.
  - "Yeni bağlantı" → aynı e-posta ve rolle `POST` → yeni bağlantı gösterilir.
- **Davet sayfası (`invitation-accept-page.test.tsx`, `renderApp('/invitations/<43 karakter>')`):**
  - Anonim: önizleme metni (davet eden, board, rol, e-posta, tarih); "Kayıt ol" `href`'i `/register?returnUrl=%2Finvitations%2F<token>`.
  - 404 / 410 ×3 → ilgili metin ve bağlantı.
  - Bozuk token (`/invitations/abc`) → "Davet bulunamadı", **istek yok**.
  - Girişli + eşleşen e-posta, niyet yok → `POST` atılmaz (sayaçla), buton var; tıklayınca `POST` → URL `/boards/B`, toast.
  - Girişli + farklı e-posta → uyarı, kabul butonu yok; "Çıkış yap" → anonim görünüm.
  - Tam akış: anonim → "Giriş yap" → login formu doldur → gönder → davet sayfası → **tam bir** `POST /accept` → `/boards/B`.
  - Kabul 403/410 → `FormAlert`, buton gizli; 500 → "Tekrar dene".
- `invitation-intent-store.test.ts`, `use-copy-to-clipboard.test.ts`, `board-cache.test.ts`, hook testleri: §7.

### Playwright (`frontend/e2e/invitations.spec.ts`)
1. **A davet eder, B kayıt olup kabul eder:** A (`signUpAs`) board oluşturur, açar → "Üyeler" → kayıtsız `b-<rastgele>@example.com` + "Davet et" → "Davet bağlantısı" görünür, `inputValue()` okunur → "Bekleyen davetler"de e-posta. Yeni context B → bağlantının path'i → önizlemede board adı ve A'nın adı → "Kayıt ol" → e-posta dolu → ad + parola → "Kayıt ol" → URL `/boards/<id>`, board başlığı görünür, toast. A reload → avatar yığınında B; diyalogda bekleyen davet yok.
2. **Kayıtlı kullanıcı anında üye:** B API ile kayıt olur. A davet eder → "… panoya eklendi." B context'inde `/boards` → board kartı görünür, açılır.
3. **Giriş yolu:** A kayıtsız X'i davet eder; sonra B API ile X e-postasıyla kayıt olur (oturum açmadan). B context'i bağlantıyı açar → "Giriş yap" → giriş → otomatik kabul → board.
4. **Yanlış hesap:** C girişliyken bağlantıyı açar → uyarı, kabul butonu yok → "Çıkış yap" → "Kayıt ol"/"Giriş yap" görünür.
5. **İptal:** A daveti iptal eder → B bağlantıyı açar → "Bu davet iptal edilmiş."
6. **Üye yönetimi:** A (OWNER) B'nin rolünü "Yönetici" yapar → reload → kalıcı. A, B'yi çıkarır → B `/boards/<id>` → "Pano bulunamadı". Ayrı board'da MEMBER olan B "Panodan ayrıl" → `/boards`, toast, board listede yok.
7. **Yetki görünümü:** MEMBER olarak "Üyeler" diyaloğunda "Davet et" ve "Bekleyen davetler" yok.

### Dosya listesi
| Katman | Yeni | Güncellenen |
|---|---|---|
| contracts | `invitations.ts`, `invitations.spec.ts`, `members.ts`, `members.spec.ts` | `errors.ts`, `index.ts` |
| backend src | `common/crypto/opaque-token.ts` (+spec), `mail/mail.module.ts`, `mail/mail.service.ts` (+spec), `invitations/*` (module, 2 controller, service +spec, mapper +spec, errors, `dto/create-invitation.dto.ts` +spec) | `auth/token.service.ts`, `config/env.validation.ts` (+spec), `members/members.service.ts`, `app.module.ts`, `.env.example` |
| backend test | `invitations.e2e-spec.ts`, `utils/invitations.ts` | `utils/users.ts`, `vitest.config.e2e.ts` |
| frontend src | `features/invitations/**`, `board-detail/api/{members-api, invitations-api, board-invitation-keys, use-member-mutations, use-board-invitations}.ts`, `board-detail/schemas/invite-schemas.ts`, `board-detail/hooks/{use-invite-form, use-member-actions}.ts`, `board-detail/components/{members-dialog, invite-member-form, invite-link-field, member-list, pending-invitations}.tsx`, `shared/lib/{board-role, email-schema}.ts`, `shared/hooks/use-copy-to-clipboard.ts`, `shared/ui/centered-card.tsx` | `app/routes.tsx`, `features/auth/{lib/redirect-target, components/login-page, components/register-page, components/route-guards, hooks/use-login-form, hooks/use-register-form, schemas/auth-schemas, index}.ts(x)`, `auth-card.tsx` (kaldırılır), `board-detail/{lib/board-cache, hooks/use-board-actions, components/board-header}`, `test/setup.ts` |
| frontend test | `invitation-accept-page.test.tsx`, `invitation-intent-store.test.ts`, `members-dialog.test.tsx`, `use-member-mutations.test.tsx`, `use-board-invitations.test.tsx`, `use-copy-to-clipboard.test.ts` | `redirect-target.test.ts`, `login-page.test.tsx`, `register-page.test.tsx`, `route-guards.test.tsx`, `routes.test.tsx`, `board-cache.test.ts` |
| Playwright | `e2e/invitations.spec.ts` | `e2e/helpers.ts`, `playwright.config.ts` |

---

## 9. Riskler

1. **R1 Eşzamanlılık:** Davet/kabul/iptal board kilidiyle sıraya girer; tüm yarışların beklenen sonucu §4.4'te tanımlı ve e2e'de (18–23) doğrulanıyor. Kilit sırası Faz 5'le uyumlu (`Board` önce). Kalan deadlock/serileştirme hataları 409 `CONFLICT`.
2. **R2 Token'ın tek sır olması:** E-posta doğrulaması olmadığı için, henüz kayıtlı olmayan davetli adresiyle kayıt olan herkes bağlantıyla kabul edebilir (PLAN §1 kabulü). Önlemler: 7 gün TTL, iptal, yeniden davetle eski linkin ölmesi, hash'li saklama, kayıtta otomatik kabulün olmaması, FE'nin bağlantıyı "yalnızca davet ettiğin kişiyle paylaş" uyarısıyla göstermesi.
3. **R3 Token sızıntısı:** Ham token sadece `POST` yanıtında ve dev logunda; production logunda yok. URL path'inde olduğu için tarayıcı geçmişinde kalır (kaçınılmaz). Kod incelemesinde `grep` kontrolü (adım 12).
4. **R4 Açık yönlendirme:** `returnUrl` sadece aynı origin'e göreli yol olarak kabul edilir (`safeReturnPath`); testli.
5. **R5 Kayıtlı e-posta sorgulama:** Hibrit akış bir board yöneticisine e-postanın kayıtlı olup olmadığını gösterir; her kullanıcı board açıp yönetici olabildiği için bu bir sorgulama kanalıdır. Kayıt endpoint'i aynı bilgiyi zaten veriyor; davet oluşturma IP başına 30/dk ile sınırlı. Kabul edilen risk (§10 S11).
6. **R6 Kaybolan bağlantı:** Sunucu bağlantıyı tekrar üretemez; yönetici diyaloğu kapatırsa "Yeni bağlantı" ile yenisini alır (eskisi ölür). Metinle açıklanır.
7. **R7 Optimistic yarışlar:** Üye ve davet mutation'ları board cache'ine dokunduğunda ortak `mutationKey` kullanılır; refetch son mutation'a kalır. Ayrılma `useBoardMutation` dışında olduğu için board detayını invalidate etmez (404 flaşı yok).
8. **R8 Çıkarılan üyenin açık board'u:** Faz 7'ye kadar çıkarılan kullanıcı açık board'unda kalır; ilk yazımda 404 alır, yeniden yüklemede "Pano bulunamadı". Kabul edilmiş.
9. **R9 Native select ve klavye:** Windows'ta kapalı `<select>`'te ok tuşu her basışta `change` üretir; iki seçenekli rol alanında birkaç istek gidebilir, son yazım kazanır ve refetch son mutation'da yapılır. Kabul edilebilir; sorun olursa "Kaydet" butonuna geçilir.
10. **R10 Geriye dönük uyumluluk:** API sadece ekleniyor; `MemberDto`, `BoardDetailDto` değişmiyor. `redirectTarget` imzası değişiyor (tek çağıran `GuestRoute`). `AuthCard` → `CenteredCard` taşıması görünümü değiştirmez. Yeni env değişkenlerinin varsayılanları var; mevcut `.env` dosyaları çalışmaya devam eder. Mevcut Playwright testleri "Üyeler" butonundan etkilenmez (yeni buton, mevcut adlarla çakışmaz).
11. **R11 Rate limit ve testler:** Backend e2e ve Playwright yüksek limitle çalışır; dev backend yeniden kullanılıyorsa `.env`'de `INVITATION_RATE_LIMIT_PER_MINUTE` yükseltilmeli (Faz sonu notu).
12. **R12 Performans:** Davet yazımları board satırını kısa süre kilitler; aynı board'daki liste yazımları milisaniyelik bekler. Davet listesi board başına küçük; ek index gerekmez.

---

## 10. Açık Sorular (önerilen varsayılan parantez içinde; hepsi bu varsayımlarla uygulanabilir)

1. **S1:** ADMIN, ADMIN rolüyle davet edebilsin mi? (Hayır, sadece OWNER. ADMIN başka ADMIN'i çıkaramadığı için ADMIN üretmesi sahibin kontrolünü zayıflatır. Trello'daki gibi serbest bırakmak istenirse `canInviteAs` tek satırda değişir.)
2. **S2:** Giriş/kayıttan dönünce kabul otomatik mi olsun? (Evet, ama sadece kullanıcı sayfadaki butona bastıysa (bellekteki niyet). Doğrudan açılan linkte ve sayfa yenilemede "Daveti kabul et" butonu.)
3. **S3:** Süresi dolmuş davetler yöneticinin listesinde "Süresi doldu" olarak görünsün mü? (Hayır, PLAN'daki gibi sadece geçerli PENDING'ler. Yönetici formdan yeniden davet eder.)
4. **S4:** Rate limit değerleri? (Oluşturma, önizleme ve kabul için IP başına route başına 30/dk, `INVITATION_RATE_LIMIT_PER_MINUTE` ile.)
5. **S5:** `MailService` production'da bağlantıyı loglasın mı? (Hayır; dev/test'te loglar.)
6. **S6:** Davet iptali onay istesin mi? (Hayır; geri alınabilir (yeniden davet), optimistic. Üye çıkarma ve ayrılma onaylı.)
7. **S7:** Board başına bekleyen davet üst sınırı? (Yok; rate limit yeterli. Gerekirse `LIMIT_REACHED` kodu.)
8. **S8:** Ayrı "Davet et" diyaloğu mu, tek "Üyeler" diyaloğu mu? (Tek diyalog, davet formu üstte; header'da tek "Üyeler" butonu.)
9. **S9:** Kabul yanıtı board özetini de dönsün mü? (Hayır, `{ boardId }`; sayfa board'a gider ve detayı zaten çeker, board listesi invalidate edilir.)
10. **S10:** `ProtectedRoute` da router state yerine `?returnUrl=` kullansın mı? (Şimdilik hayır; iki yol da desteklenir, mevcut testler değişmez. Faz 8'de tekleştirilebilir.)
11. **S11:** Kayıtlı e-posta bilgisinin davet edene görünmesi kabul mü? (Evet, PLAN'ın hibrit akışı bunu gerektiriyor; R5.)
12. **S12:** Önizleme davet e-postasını tam göstersin mi? (Evet; davetli doğru adresle kayıt olabilsin diye gerekli, ve sadece token sahibine görünür.)
13. **S13:** `inviteUrl` sunucuda mı (`APP_URL`) yoksa FE'de mi (`window.location.origin` + token) üretilsin? (Sunucuda: gelecekteki gerçek e-posta da aynı URL'yi kullanacak; tek kaynak.)
14. **S14:** Davet ve kabul board satırını mı, davet satırını mı kilitlesin? (Board satırı: oluşturmada satır henüz yok ve kayıtlı/üye kontrolleri başka tablolara bakıyor; §4.4.)
