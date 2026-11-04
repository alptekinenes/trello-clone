# Trello'ya Yakınlık — Yol Haritası (Faz 9+)

Kaynak: 3 referans ekran (pano, kart detayı, hesap menüsü) ve MVP kodu (Faz 0–8). Kural: marka kullanılmaz (logo, "Trello" adı yok). Arayüz metinleri Türkçe kalır.

## 1. Fark analizi

Gösterim: VAR / KISMEN / YOK → önerilen faz. "—" yapılmayacak demek (bkz. §2).

| Öğe | Durum | Not (mevcut kod) | Faz |
|---|---|---|---|
| **Üst uygulama çubuğu** (logo, arama, Oluştur, bildirim, yardım, avatar) | KISMEN | `root-layout.tsx`: metin "Trello Clone" + `UserMenu` (ad + "Çıkış yap"). Arama, bildirim ve avatar yok | 9 (avatar, Oluştur) / 14 (arama, bildirim) |
| Pano adı | VAR | `board-header.tsx` `InlineEdit` | 9 (stil) |
| Görünüm seçici | YOK | Tek görünüm var | 13 (Planner) |
| Üye avatarları | VAR | `AvatarStack`; avatarlar tek renk (`bg-surface-sunken`) | 9 (renkli avatar) |
| Power-up / otomasyon ikonları | YOK | | — |
| Filtre | YOK | | 14 |
| Yıldız | YOK | | 13 |
| Görünürlük (kilit) | YOK | Tüm panolar zaten özel | 9 (pasif) |
| Paylaş | KISMEN | "Üyeler" düğmesi `MembersDialog`'u açıyor | 9 |
| Pano "…" menüsü | KISMEN | Etiketler / Arşiv / Arka plan / Panoyu sil ayrı metin düğmeleri | 9 |
| Liste sütunu (koyu yüzey) | KISMEN | `bg-surface-sunken`; koyu temada `#161a1d`, açık temada açık gri | 9 |
| Liste başlığında kart sayısı | YOK | | 9 |
| Liste "…" menüsü | KISMEN | Görünür arşiv ikonu + tutamak (grip) düğmesi | 9 |
| Kartta etiket şeritleri | KISMEN | `LabelChip` adı yazılı çip olarak gösteriyor; şerit hali yok | 9 |
| Tamamlanmış kart onay ikonu | YOK | Sadece `dueComplete` var | 10 |
| Rozet: izleme | YOK | | 10 |
| Rozet: açıklama | VAR | `card-tile-body.tsx` | — |
| Rozet: yorum sayısı | YOK | | 11 |
| Rozet: checklist (tamamlanınca yeşil) | VAR | `bg-success-subtle` | — |
| Rozet: son tarih | VAR | `DueBadge` | — |
| Kart üyesi avatarları | YOK | Kart üyesi modeli yok | 10 |
| "Kart ekle" | VAR | `add-card-composer.tsx` | 9 (stil) |
| Kart şablonu ikonu | YOK | | — |
| Yarı saydam "Başka liste ekle" | VAR | `bg-board-control` (koyulaştırıyor, Trello açıyor) | 9 |
| Alttaki yüzen çubuk (Inbox / Planner / Pano / Pano değiştir) | YOK | | 9 (Pano + Pano değiştir) / 13 |
| Sol Inbox paneli | YOK | | 13 |
| **Kart detayı:** liste seçici | KISMEN | Metin olarak "“X” listesinde"; taşıma sadece panodaki `CardActionsDialog`'da | 9 |
| Kapak / izleme / "…" / kapat | KISMEN | Sadece Kapat var; Arşivle yan panelde | 9 ("…", Kapat) / 10 (izleme, kapak rengi) / 12 (kapak görseli) |
| Başlık solunda tamamlama dairesi | YOK | | 10 |
| Ekle / Tarihler / Checklist / Ek düğmeleri | KISMEN | Sağdaki dikey `aside`: Etiketler, Checklist, Son tarih, Arşivle | 9 (yatay satır) / 12 (Ek) |
| Üyeler bölümü | YOK | | 10 |
| Etiketler bölümü + "+" | VAR | `card-labels-section.tsx` | 9 (stil) |
| Açıklama + Düzenle | VAR | `card-description.tsx` | 9 (stil) |
| Checklist + ilerleme + Sil + "Öğe ekle" | VAR | `checklist.tsx`; Sil ikon olarak | 9 (stil) |
| Sağdaki "Yorumlar ve etkinlik" paneli + Ayrıntıları göster | YOK | | 11 |
| **Hesap menüsü:** avatar, ad, e-posta | KISMEN | Yalnızca ad metni var | 9 |
| Hesap değiştir / Hesabı yönet / Çalışma alanı oluştur / Labs | YOK | | — |
| Profil ve görünürlük | KISMEN | Backend'de `PATCH /users/me` (ad, https avatar URL'si) var, arayüzü yok | 9 |
| Etkinlik / Kartlar | YOK | | 11 / 13 |
| Ayarlar | YOK | | 9 (Tema menüde) |
| Tema alt menüsü | KISMEN | Token'larda `data-theme` desteği var, seçme arayüzü yok (yalnızca işletim sistemine uyuyor) | 9 |
| Yardım / Kısayollar | YOK | | 9 (Kısayollar) / — (Yardım) |
| Çıkış yap | VAR | | 9 (menüye taşınır) |

## 2. Kapsam kararı

| Öğe | Karar |
|---|---|
| Power-ups, Automations, Labs, kart şablonu | **Yapılmaz.** İkonları da konmaz (çalışmayan düğme olmaz). |
| Switch accounts, Manage account (dış sayfa) | **Yapılmaz.** Yerine "Profil" penceresi gelir (ad, avatar URL'si; parola değiştirme Faz 14'te isteğe bağlı). |
| Workspace / Create Workspace | **Yapılmaz.** Panolar kullanıcıya bağlı kalır. |
| Görünürlük ikonu | **Pasif görünüm.** Kilit ikonu, ipucu: "Özel pano: yalnızca üyeler görebilir". Herkese açık pano yok. |
| Görünüm seçici | Faz 13'e kadar yok, sonra "Pano / Planlayıcı". |
| Help | **Yapılmaz.** "Klavye kısayolları" penceresi yeterli. |
| Inbox entegrasyonları (e-posta, Slack…) | **Yapılmaz.** Inbox sadece kişisel kart toplama yeri olur. |
| Marka | Logo ve "Trello" adı kullanılmaz. Uygulama adı tek bir sabitten gelir (bkz. açık soru 1). |

## 3. Faz yol haritası

**Faz 9: Görsel yeniden tasarım (yalnızca frontend).** Trello tarzı token'lar, koyu liste yüzeyi, kart düzeni, liste başlığında sayı ve "…" menüsü, pano çubuğu (Paylaş, "…", kilit), kart penceresinin yeni yerleşimi (liste seçici, "…", yatay işlem satırı), hesap menüsü (Profil, Tema, Kısayollar, Çıkış), alt gezinme çubuğu (Pano + Pano değiştir). Yeni bağımlılık yok. Ayrıntı §4'te.

**Faz 10: Kart tamamlama, kart üyeleri, izleme, kapak rengi.**
- Şema:
  - `Card`'a `isCompleted Boolean @default(false)`, `completedAt DateTime?`, `coverColor LabelColor?` eklenir.
  - `model CardMember { cardId, userId, assignedAt; @@id([cardId,userId]); @@index([userId]) }`. İki ilişki de `onDelete: Cascade`.
  - `model CardWatch { cardId, userId, createdAt; @@id([cardId,userId]); @@index([userId]) }`.
  - Migration adı: `card_completion_members_watch`.
- API:
  - `PATCH /cards/:cardId` alanları `isCompleted` ve `coverColor` ile genişler.
  - `PUT|DELETE /cards/:cardId/members/:userId` (hedef kullanıcı panonun üyesi olmalı, değilse 422).
  - `PUT|DELETE /cards/:cardId/watch` (sadece kendisi için).
- DTO'lar: `CardSummaryDto`'ya `isCompleted`, `coverColor`, `memberIds` eklenir. İzleme kullanıcıya özel olduğu için `BoardDetailDto.myWatchedCardIds` ayrı tutulur.
- Socket: `card:updated` (mevcut), `card:member-added`, `card:member-removed`. Kullanıcı room'una `card:watch-updated`.
- Riskler:
  - Üye panodan çıkarılınca `CardMember` satırları aynı `$transaction` içinde silinmeli.
  - İzleme bilgisi yayına konmamalı (kullanıcıya özel).

**Faz 11: Yorumlar ve etkinlik akışı.**
- Şema:
  - `model Comment { id, cardId, boardId, authorId, body Text, createdAt, updatedAt, editedAt?; @@index([cardId, createdAt]) }`
  - `model Activity { id, boardId, cardId?, actorId, type ActivityType, data Json, createdAt; @@index([boardId, createdAt]); @@index([cardId, createdAt]) }`
  - `data` liste ve kart adlarının o anki kopyasını tutar; sonradan yeniden adlandırma geçmişi bozmaz.
- API:
  - `GET|POST /cards/:cardId/comments` (cursor sayfalama).
  - `PATCH|DELETE /comments/:commentId`: düzenlemeyi yalnızca yazar yapar; silmeyi yazar ya da ADMIN+ yapar.
  - `GET /cards/:cardId/activity`, `GET /boards/:boardId/activity`, `GET /users/me/activity`.
- Socket: `comment:created|updated|deleted`, `activity:created`. `CardSummaryDto.commentCount` eklenir.
- Riskler:
  - Kayıt yükü: mevcut tüm servislerin `$transaction`'larına `ActivityService.record(tx, …)` eklenir.
  - Yorum düz metin olarak gösterilir (XSS).
  - Bahsetme (mention) kapsam dışı.

**Faz 12: Ek dosyalar ve kapak görseli.**
- Şema:
  - `model Attachment { id, cardId, boardId, uploaderId, fileName VarChar(255), mimeType, size Int, storageKey @unique, createdAt; @@index([cardId, createdAt]) }`
  - `Card.coverAttachmentId String? @unique`, `onDelete: SetNull`.
- Depolama: `StorageService` arayüzü (`put`, `getStream`, `delete`, `signedUrl`). Sürücüler `LocalDiskStorage` (dev, `UPLOAD_DIR`) ve `S3Storage`; seçim `STORAGE_DRIVER` ile.
- API:
  - `POST /cards/:cardId/attachments`: multipart, en fazla 10 MB, kart başına en fazla 20 dosya.
  - `GET /attachments/:id/url`: 5 dakikalık imzalı URL döner. `<img>` Bearer başlığı gönderemediği için bu yol gerekli.
  - `DELETE /attachments/:id`: yükleyen ya da ADMIN+.
- Socket: `attachment:created|deleted`. Kapak değişikliği `card:updated` ile gider.
- Yeni bağımlılıklar: `@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner`, `file-type` (magic byte kontrolü).
- Güvenlik:
  - MIME izin listesi; anahtar her zaman uuid olur, kullanıcının dosya adı anahtarda kullanılmaz.
  - `Content-Disposition: attachment` ve `nosniff`. Yalnızca png/jpeg/gif/webp satır içi gösterilir; SVG asla.
  - Yüklemeye kullanıcı başına rate limit.
- Riskler: kart veya pano silinince depoda yetim dosyalar kalır. Silme işlemi transaction'dan sonra yapılır, ayrıca periyodik temizlik görevi gerekir.

**Faz 13: Gezinme (yıldızlı panolar, pano değiştirici, Inbox, Planlayıcı).**
- Şema:
  - `model BoardStar { userId, boardId, createdAt; @@id([userId,boardId]) }`.
  - `Board.inboxOwnerId String? @unique`: her kullanıcıya gerektiğinde oluşturulan tek bir gizli pano.
- API:
  - `PUT|DELETE /boards/:boardId/star`.
  - `GET /users/me/inbox`.
  - `POST /cards/:cardId/move` gövdesine `boardId` eklenir: panolar arası taşıma. Kullanıcı iki panonun da üyesi olmalı. Etiket ve kart üyeleri düşer.
  - `GET /users/me/planner?from&to`: son tarihi aralıkta olan kartlar.
  - `GET /users/me/cards`: "Kartlarım".
- Socket: panolar arası taşımada kaynak room'a `card:deleted`, hedef room'a `card:created`. Kullanıcı room'una `board:star-updated`.
- Riskler:
  - Panolar arası taşıma şu an kapsam dışı ve fazın en riskli parçası. İki pano kilidi gerekir; deadlock olmaması için kilitler id sırasıyla alınır.
  - Inbox panosu `GET /boards` sonucundan ve davetlerden hariç tutulmalı.

**Faz 14 (isteğe bağlı): Filtre, arama, bildirimler.**
- İstemci tarafı pano filtresi: anahtar kelime, etiket, üye, son tarih durumu, tamamlanma. Zustand + URL parametresi.
- `GET /search?q=` (`pg_trgm` index'i).
- `Notification` modeli: izlenen kartlar için zil + kullanıcı room'una `notification:created`.
- Parola değiştirme.

## 4. Faz 9 ayrıntılı planı

Faz 9 sadece frontend'i değiştirir; backend ve contracts'a dokunulmaz.

### 4.1 CLAUDE.md "Tasarım Yönü" ile çelişen noktalar (kullanıcı onayı gerekir)

1. **"Tek vurgu rengi; renk sadece anlam taşıyan yerlerde":** Trello avatarları kişiye göre renkli. Öneri: 8 renklik sabit bir avatar paleti (`--ui-avatar-1..8`). Renk, kullanıcı id'sinin hash'inden seçilir ve kişiyi ayırt etmeye yarar.
2. **"Süs ve gradyan yok":** Referans panonun arka planı gradyan (turuncu→kırmızı). Öneri: düz renkler kalsın; gradyan arka planlar ayrıca onaylanırsa eklenir (açık soru 4).
3. **"Az kenarlık, hafif gölgeler":** Koyu temada Trello listeleri neredeyse siyah ve kartlar gölgesiz. Öneri: kart üzerine gelince "hafif yükselme" yerine ince odak halkası (`ring`) kullanılsın.
4. **`--ui-board-control` koyulaştırıyor:** Trello "Başka liste ekle"yi beyaz yarı saydam yapıyor. Beyaz %24 katman ve beyaz yazı bazı arka planlarda 4.5:1 kontrastı tutturamayabilir. Öneri: token açıklaştıran bir değere değiştirilir, kontrast 9 arka planın hepsinde ölçülür; tutmayan arka planda koyulaştırma kalır.

CLAUDE.md için önerilen ek (onaydan sonra eklenir): "Tasarım Yönü" altına şu madde. "Referans Trello'nun güncel görünümüdür. Kişi avatarları sabit bir paletten renklendirilir. Kart üzerine gelince ince halka çıkar. Uygulama adı `APP_NAME` sabitinden gelir; marka kullanılmaz."

### 4.2 Adımlar

Her adım bir commit. Her adımda değişen ekranın açık ve koyu temada, 320 px genişlikte axe taramasından (critical/serious = 0) geçmesi, 44 px dokunma hedefleri ve klavyeyle sürükle-bırakın korunması zorunlu.

**1. Token'lar ve renkli avatar** (ui-designer)
- Dosyalar: `src/styles/tokens.css`, `src/index.css` (`@theme`), `shared/ui/avatar.tsx`, yeni `shared/lib/avatar-color.ts`.
- Yeni token'lar:
  - Liste yüzeyi: `--ui-list`. Açık temada `#f1f2f4`, koyu temada `#101204`.
  - Kart yüzeyi: `--ui-card`. Koyu temada `#22272b`.
  - `--ui-card-hover-ring`, `--ui-avatar-1..8`, `--ui-board-bar` (daha koyu), `--ui-menu`.
- Testler: `avatar-color.test.ts` (aynı id → aynı renk). Kontrast ölçümü sonuçları token yorumlarına yazılır.
- Bitti: yeni token'lar iki temada tanımlı ve mevcut ekranlar bozulmadan axe'den geçiyor.

**2. Paylaşılan `Menu` bileşeni ve tema tercihi** (frontend-react)
- Dosyalar:
  - Yeni `shared/ui/menu.tsx`: tetikleyici düğme, `role="menu"`, `menuitem` / `menuitemradio`. Ok tuşları, Home/End, Esc odağı tetikleyiciye geri verir; dışarı tıklama ve Tab menüyü kapatır.
  - Yeni `shared/lib/theme.ts`: Zustand store, `localStorage['theme']` = `light | dark | system`, `documentElement.dataset.theme` ayarlanır.
  - `index.html`: boyama öncesi küçük bir satır içi betik (tema yanıp sönmesin diye).
- Testler: `menu.test.tsx` (klavye, odak iadesi), `theme.test.ts`.
- Bitti: menü tamamen klavyeyle kullanılabiliyor ve tema seçimi yeniden yüklemeden sonra korunuyor.

**3. Üst çubuk ve hesap menüsü** (frontend-react)
- Dosyalar:
  - `app/root-layout.tsx`: `APP_NAME`, "Yeni pano" düğmesi, avatar.
  - `features/auth/components/user-menu.tsx` → `account-menu.tsx`. İçerik: avatar, ad, e-posta / Profil / Tema ▸ (Açık, Koyu, Sistem) / Klavye kısayolları / Çıkış yap.
  - Yeni `profile-dialog.tsx` (`PATCH /users/me`) ve `shortcuts-dialog.tsx`.
  - `features/boards/index.ts`: `CreateBoardDialog` dışa açılır.
- Etkilenen testler:
  - `e2e/auth.spec.ts:23` ("Çıkış yap" artık menünün içinde).
  - `route-guards.test.tsx:70,84`.
  - `routes.test.tsx:19`, `e2e/boards.spec.ts:34`, `smoke.spec.ts:6` (uygulama adı).
- Yeni testler: `account-menu.test.tsx`, `profile-dialog.test.tsx`; a11y e2e'ye "hesap menüsü açık" ekranı.
- Bitti: tema hesap menüsünden değişiyor; profil adı kaydediliyor; çıkış menüden çalışıyor.

**4. Pano çubuğu** (frontend-react)
- Dosyalar: `board-header.tsx`, `use-board-actions.ts`.
- Değişiklikler:
  - "Üyeler" düğmesi "Paylaş" olur.
  - Pasif kilit ikonu (`title` + `sr-only` metin).
  - "Pano menüsü" ("…"): Etiketler, Arşiv, Arka plan, Panoyu sil (rolüne göre).
- Etkilenen testler:
  - `e2e/a11y.spec.ts` `openToolbarDialog`.
  - `e2e/lists.spec.ts:222`.
  - `e2e/realtime.spec.ts:136,268,281,361`.
  - `e2e/invitations.spec.ts:49`.
  - `board-header.test.tsx`.
  - Çözüm: `e2e/helpers.ts`'e `openBoardMenuItem(page, 'Arşiv')` yardımcı fonksiyonu eklenir.
- Bitti: pano işlemlerinin hepsine "…" menüsünden ve klavyeyle ulaşılabiliyor.

**5. Liste sütunu** (frontend-react + ui-designer)
- Dosyalar: `board-list.tsx`, `add-list-composer.tsx`, `add-card-composer.tsx`.
- Değişiklikler:
  - `bg-list` yüzeyi.
  - Başlıkta kart sayısı (`aria-label="3 kart"`).
  - "“A” listesinin işlemleri" menüsü: Kart ekle, Listeyi arşivle.
  - Tutamak düğmesi kalır (klavye tutamağı), ince cihazlarda sadece üzerine gelince ve odakta görünür. Dokunmatikte her zaman görünür ve 44 px.
- Etkilenen testler: `e2e/lists.spec.ts:218` (arşivleme artık menüden), `board-canvas.test.tsx`, `board-cards.test.tsx`.
- Bitti: sayı ve menü çalışıyor; fare ve klavyeyle liste taşıma e2e testleri geçiyor.

**6. Kart görünümü** (frontend-react + ui-designer)
- Dosyalar: `card-tile-body.tsx`, `card-tile.tsx`, `shared/ui/label-chip.tsx`, yeni `board-detail/store/label-display-store.ts`.
- Değişiklikler:
  - Etiketler şerit olarak gösterilir; şeride tıklanınca adlar açılır (Zustand + localStorage). Adlar her zaman `sr-only` olarak durur.
  - Rozet sırası: açıklama, checklist, son tarih.
  - Sağ altta avatar yuvası (Faz 10'da dolacak).
  - Üzerine gelince ince halka.
- Etkilenen testler: `card-badges.test.tsx`. `e2e/card-detail.spec.ts:153` (`toContainText` metin `sr-only` olduğu için yine geçer).
- Bitti: kartlar referans ekrana benziyor ve sürüklenirken eğim ile gölge korunuyor.

**7. Kart penceresi: üst çubuk ve yerleşim** (frontend-react)
- Dosyalar: `shared/ui/dialog.tsx` (`xl` boyutu + `header` slotu), `card-detail-route.tsx`, `card-title-editor.tsx`.
- Değişiklikler:
  - Üst çubuk: liste seçici düğmesi ("Liste: Yapılacaklar ▾"). Taşıma formu `CardActionsDialog`'dan yeniden kullanılır; bunun için `board-detail/index.ts`'ten `CardMoveForm` dışa açılır.
  - Üst çubukta "Kart menüsü" ("…" → Arşivle) ve Kapat.
- Etkilenen testler:
  - `src/test/card-dialog.ts:79` (bekledeği metin "“Yapılacaklar” listesinde").
  - `card-detail-route.test.tsx`.
  - `use-focus-archive-after-restore.ts` + `ARCHIVE_BUTTON_ID`: arşivden geri yüklenince odak artık "Kart menüsü" düğmesine döner.
- Bitti: kart pencereden başka listeye taşınabiliyor ve arşivle/geri yükle sonrası odak doğru yerde.

**8. Kart penceresi: işlem satırı ve bölümler** (frontend-react)
- Dosyalar: `card-detail-content.tsx`, `panel-button.tsx`, `card-labels-section.tsx`, `card-description.tsx`, `checklist.tsx`.
- Değişiklikler:
  - Dikey `aside` yerine başlığın altında yatay bir satır: `role="group"`, `aria-label="Kart işlemleri"`; düğmeler Etiketler, Son tarih, Checklist.
  - Bölüm başlıkları ikonlu; "Düzenle" ve "Sil" metinli düğmeler (erişilebilir adlar aynı kalır).
- Etkilenen testler: `e2e/card-detail.spec.ts` içindeki `sideButton` yardımcı fonksiyonu ve `e2e/realtime.spec.ts:151` (`complementary` → `group`), kart penceresi RTL testleri.
- Bitti: pencere referans düzende; mevcut kart detayı testleri yeni seçicilerle geçiyor.

**9. Alt gezinme çubuğu ve pano değiştirici** (frontend-react)
- Dosyalar: yeni `features/boards/components/board-switcher.tsx` (`useBoards` ile), `board-page.tsx`, `board-canvas.tsx` (alt boşluk, kartlar çubuğun altında kalmasın).
- Değişiklikler:
  - `<nav aria-label="Pano gezintisi">`: "Pano" (`aria-current`), "Panolar arası geçiş" (arama kutulu popover).
  - Inbox ve Planlayıcı Faz 13'te eklenir; devre dışı düğme konmaz.
- Testler: `board-switcher.test.tsx`; `e2e/boards.spec.ts`'te değiştiriciyle başka panoya geçiş.
- Bitti: 320 px'te çubuk içeriği kapatmıyor ve klavyeyle pano değiştirilebiliyor.

**10. Doğrulama** (tester → code-reviewer)
- Tüm unit testler, lint, typecheck, Playwright (a11y 4 mod dahil). `docs/PLAN.md` ilerleme tablosuna Faz 9 satırı.
- Bitti: tüm testler yeşil ve inceleme bulguları kapandı.

### 4.3 Korunacaklar
- Erişilebilir adlar Türkçe kalır ("Kart ekle", "Başka liste ekle", "“A” listesini taşı", "Kart başlığı", "Kapat"). Değişmesi gereken adlar sadece yukarıda listelenenler.
- `prefers-reduced-motion`, `DragOverlay` eğimi, klavye sürükle-bırak duyuruları.
- Tailwind'de ham renk yok; her yeni renk `tokens.css`'e eklenir.

## 5. Kullanıcı kararları (2026-11-04) — aşağıdaki varsayılanların yerine geçer

1. **Uygulama adı: "Trello Klonu"** (`APP_NAME` sabiti; Trello logosu yok).
2. **Tasarım sapmaları onaylandı:** kişiye göre renkli avatarlar, kartta hover halkası, **gradyan pano arka planları** (her arka planda kontrast ölçülür; tutmayanda koyulaştırma). CLAUDE.md "Tasarım Yönü" buna göre güncellendi.
3. **Etiketler kartta adlı rozet** olarak kalır (adsız şerit değil).
4. **Akış:** Faz 9 bitince durulur; kullanıcı yeni görünümü onaylamadan Faz 10'a geçilmez.
5. Faz 14 isteğe bağlı kalır; panolar arası kart taşıma Faz 13'te kabul (varsayılan).

## 6. Açık sorular (önerilen varsayılan; yukarıdaki kararlar önceliklidir)

1. **Uygulama adı?** Varsayılan: "Kanban". `APP_NAME` sabiti ve `<title>` bu addan gelir.
2. **§4.1'deki CLAUDE.md değişiklikleri onaylanıyor mu?** Varsayılan: renkli avatar ve hover halkası evet; gradyan hayır.
3. **Kartta etiket gösterimi?** Varsayılan: Trello gibi adsız şerit, tıklayınca adlar açılır. Adlar ekran okuyucuya her zaman okunur.
4. **Gradyan pano arka planları eklensin mi?** Varsayılan: hayır (Faz 9'da düz renkler).
5. **Faz 14 (arama, bildirim, filtre) yol haritasında kalsın mı?** Varsayılan: evet, isteğe bağlı olarak; Faz 10–13'ten sonra yeniden değerlendirilir.
6. **Panolar arası kart taşıma (Inbox için gerekli) Faz 13'te kabul edilebilir mi?** Varsayılan: evet. Etiketler ve kart üyeleri taşımada düşer; kullanıcı iki panonun da üyesi olmalı.
