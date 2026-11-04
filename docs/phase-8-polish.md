# Faz 8 — Cilalama (plan)

> `architect`, 2026-11-04. Kaynaklar: `PLAN.md` §8 (Faz 8), §9, "Not (prod)", §10; `phase-7-realtime.md` §9 R8/R15, §10–11; panodaki Backlog kartları.
> Akış: tek seferde bir agent, her adımda yalnız ilgili testler, tam suite G10'da bir kez.

## 1. Hedef ve kapsam dışı

**Hedef:** Uygulamayı "bitmiş" hissettirmek: tutarlı yükleme/boş/hata/409 durumları, toast'lar, axe ile erişilebilirlik turu (critical/serious ihlal yok), mobilde tek sütun + snap, ekran yüksekliğiyle sınırlı sütunlar, arka plan değiştirme, production ayarları (proxy, `NODE_ENV`, rate limit), güvenlik checklist'i, README. Faz 8'e bağlı Backlog borçları kapanır (§2 tablo).

**Varsayımlar**
- "Arşiv paneli" = mevcut "Arşiv" diyaloğu (`archive-dialog.tsx`). Yan panel yapılmaz, yalnız cilalanır (G8).
- Yeni DB modeli/migration yok. Tek sözleşme değişikliği: taşıma yanıtlarına `rebalanced` (G2).

**Kapsam dışı:** Gerçek e-posta gönderimi, bildirimler, OWNER devri, Redis adapter/çoklu sunucu (R5), `updatedAt` ile iyimser kilit (R1), socket rate limit (R10), checklist/madde taşıma yanıtlarında `rebalanced`, sonraya bırakılan Backlog kartları (§2 tablo).

## 2. Görevler (commit boyutunda, sırayla)

**G1 · backend-nest** — `feat(api): harden production config`
- `TRUST_PROXY` (tam sayı 0–10, varsayılan 0). >0 ise `configureApp` Express'e `trust proxy = n` verir; throttler `req.ip` ile gerçek IP'yi görür.
- `NODE_ENV` varsayılansız ve zorunlu olur; yoksa açılış hatası verir (aksi halde production davet bağlantılarını loglar ve cookie `secure` olmaz).
- `API_RATE_LIMIT_PER_MINUTE` (varsayılan 300) mevcut `authRateLimit()` deseniyle tembel okunur ve `ThrottlerModule.forRoot`'ta kullanılır. Playwright backend env'ine `1000` eklenir.
- Dosyalar: `backend/src/config/env.validation.ts` (+spec), `backend/src/app.module.ts`, `backend/src/app.setup.ts`, `backend/.env.example`, `frontend/playwright.config.ts`.
- Test: env spec (`NODE_ENV` yok → hata; yeni değişkenlerin varsayılanı ve geçersiz değerleri). `test/auth.e2e-spec.ts` rate-limit bloğu: `TRUST_PROXY=1` iken farklı `X-Forwarded-For` ayrı sayılır, 0 iken başlık yok sayılır; genel limit env ile düşürülünce 429 döner.
- **Bitti:** Üç ayar doğrulanıyor, XFF e2e'si yeşil.

**G2 · backend-nest** — `feat(api): return rebalanced positions from move endpoints`
- `PositionUpdate`/`PositionRebalancedData` `shared/contracts/src/position.ts`'e taşınır (`realtime-events.ts` yeniden export eder, döngü olmaz). `MoveCardResponse` ve `MoveListResponse`'a `rebalanced: PositionRebalancedData | null` eklenir.
- `cards.service.ts` ve `lists.service.ts` `move`, `position:rebalanced` event'ine giden veriyi yanıta da koyar.
- Test: servis spec'leri (rebalance olunca dolu, olmazsa `null`). `test/cards.e2e-spec.ts` ve `test/lists.e2e-spec.ts` zorla rebalance senaryosunda yanıtı doğrular; tam eşitlik bekleyen eski assert'ler güncellenir.
- **Bitti:** REST yanıtı ve socket event'i aynı pozisyonları taşıyor.

**G3 · frontend-react** — `fix(board-detail): apply server rebalance at once and clear stale card UI state`
- `applyRebalance` `apply-board-event.ts`'ten `lib/board-cache.ts`'e taşınır. `useMoveCard`/`useMoveList` `onSuccessCache` önce onu, sonra yamayı uygular; başka bir mutation sürerken bile sıra hemen doğru olur.
- Kart cache'ten düşünce (uzaktan silme/arşiv, liste arşivi, 409 refetch'i) `card-ui-store` tamamen temizlenir: `actionsCardId/ListId`, o karta ait `focusTarget` ve asılı kalan `actionsCardVanished` duyurusu. `board-canvas.tsx`'teki effect bu işi yapan küçük bir hook'a taşınır.
- Dosyalar: `features/board-detail/api/use-card-mutations.ts`, `api/use-list-mutations.ts`, `lib/board-cache.ts`, `lib/apply-board-event.ts`, `store/card-ui-store.ts`, `components/board-canvas.tsx`; MSW fixture'ları (`src/test/fixtures.ts`).
- Test: `use-card-mutations.test.tsx` ve `use-list-mutations.test.tsx` (rebalanced yanıt + yolda ikinci mutation → sıra doğru), `board-cache.test.ts`, `board-cards.test.tsx` (kart uzaktan silinir → store temiz, odak "Kart ekle"de, duyuru bir kez).
- **Bitti:** İki borcun senaryosu önce kırmızı, sonra yeşil.

**G4 · frontend-react** — `fix(realtime): keep retrying token renewal after a network error`
- `shared/lib/realtime-client.ts` `renew()`: `refreshAccessToken()` null döndüğünde oturum hâlâ varsa (`getAccessToken() !== null`, yani 401 değil ağ hatası) durum `reconnecting` kalır ve artan beklemeyle (1, 2, 5, 10 sn) yeniden denenir. `online` olayı beklemeyi kısa keser. Oturum düştüyse ya da 5 deneme dolduysa `offline` olur. Bekleyen zamanlayıcı `renewEpoch` ile `stop`'ta iptal edilir.
- Test: `realtime-client.test.ts` fake timer'larla: ağ hatası → yeniden deneme → `connected`; 401 → hemen `offline`; beklerken `stop` → zamanlayıcı iptal.
- **Bitti:** Geçici ağ hatası "Yeniden bağlan"a basmadan toparlanıyor.

**G5 · ui-designer** — `fix(ui): board control contrast, touch targets, dialog gutters, role names`
- `--ui-board-control(-hover)` (`styles/tokens.css`): beyaz metin 9 arka planın hepsinde ve iki temada ≥ 4.5:1 olmalı. Lime şu an ≈3.2, mavi ≈3.7. Öneri: `--ui-board-bar` gibi koyu yarı saydam. Kullananlar: `button-styles.ts` (`on-board`), `add-list-composer.tsx`, `board-header.tsx`.
- Dokunmatikte 44px (`pointer-coarse:`): `board-list.tsx` `ICON_BUTTON`, `card-tile.tsx`, `add-card-composer.tsx`, `add-list-composer.tsx` form düğmeleri, `shared/ui/inline-edit.tsx`, `checklist-item-row.tsx`, `label-picker.tsx`, `shared/ui/toaster.tsx`.
- Kart penceresi mobilde dört kenarda boşluk bırakır: `index.css` `dialog` kuralına `max-height: calc(100dvh - 2rem)`, `dialog.tsx` `lg` içeride kayar.
- Rol adları cümle içinde küçük harfle yazılır (ör. "Ayşe artık yönetici."). Bunun için `shared/lib/board-role.ts`'e `roleInSentence()` (`toLocaleLowerCase('tr-TR')`) eklenir; kullanan yerler `hooks/use-member-actions.ts` ve `invitation-accept-page.tsx`. Seçim kutusu ve etiket konumunda büyük harf kalır.
- Test: `members-dialog.test.tsx` (duyuru metni), `dialog.test.tsx`. Playwright'ta `invitations.spec.ts`'teki 320 px dokunma deseniyle pano sayfasında hedef boyutları ölçülür.
- **Bitti:** 320 px dokunmatikte tüm hedefler ≥ 44px; kontrast G9 axe taramasında temiz.

**G6 · ui-designer → frontend-react** — `feat(board-detail): bounded list columns and single-column mobile layout`
- Yükseklik zinciri: `app/root-layout.tsx` (`main` `min-h-0`), `board-page.tsx`, `board-canvas.tsx`. `board-list.tsx`'te başlık ve "Kart ekle" sabit kalır, yalnız kart alanı `overflow-y-auto` olur.
- Mobilde (`max-sm`) sütun genişliği görünür alanın ~%85'i olur; kanvas `snap-x snap-mandatory`, sütunlar ve "Liste ekle" `snap-start`. Sürükleme sırasında (`draggingType`) snap kapanır.
- frontend-react şunları doğrular: dnd-kit'in kart alanında otomatik kaydırması, boş listeye bırakma, `DragOverlay`, klavye ile taşıma.
- Test: `board-canvas.test.tsx` (sürüklemede snap sınıfı kalkar). `lists.spec.ts` ve `cards.spec.ts` değişmeden geçer. Yeni Playwright testleri: 30 kartlı liste ekrana sığar ve sürüklenen kart alta kayar; 375 px'te tek sütun görünür ve kaydırınca snap olur.
- **Bitti:** Masaüstünde sayfa dikey kaymıyor; mobilde bir sütun tam görünüyor.

**G7 · frontend-react** — `feat(board-detail): change board background`
- Renk seçici `boards/components/create-board-dialog.tsx`'ten `shared/ui/background-picker.tsx`'e taşınır (iki feature kullanacak).
- `board-header.tsx`'e "Arka plan" düğmesi eklenir (ADMIN+, `use-board-actions.ts` `canChangeBackground`). Düğme `Dialog` içinde seçiciyi açar. Seçim `useUpdateBoard` (zaten iyimser) ile `PATCH /boards/:boardId { background }` gönderir; hata olursa geri alınır ve toast çıkar. `renameError` şu an `updateBoard.error`'a bağlı; ad hatasıyla karışmasın diye ayrı mutation örneği kullanılır.
- Diğer üyeler mevcut `board:updated` event'iyle görür; yeni sözleşme yok.
- Test: `board-header.test.tsx` (MEMBER düğmeyi görmez; ADMIN seçer → istek gövdesi doğru; 500 → eski renk + toast). `boards-page.test.tsx` değişmeden geçer. `boards.spec.ts`: değiştir → reload → kalıcı.
- **Bitti:** ADMIN arka planı değiştirebiliyor; değişiklik ikinci sekmede canlı görünüyor.

**G8 · frontend-react** — `feat(ui): consistent loading, empty, error and conflict states`
- `shared/lib/api-error-message.ts`'e 409 ("Bu sırada başka biri değiştirdi. Sayfa yenilendi.") ve ağ hatası (`TypeError`: "Bağlantı kurulamadı…") metinleri eklenir.
- 409 tek yerde ele alınır: `use-board-mutation.ts` `onError`'da 409 → board hemen invalidate edilir ve çakışma toast'u çıkar (hook kendi metnini veriyorsa o kullanılır). Kart detayında `card-detail/api/use-card-mutation.ts` aynı kuralı uygular.
- Durum turu: boş liste, kart detayı, davet sayfası ve Arşiv diyaloğu (mobilde `max-h-96` yerine görünür yükseklik) için eksik yükleme/boş/hata durumları tamamlanır. Panolar ve pano sayfasında bu durumlar zaten var; aynı metin ve desen korunur.
- Toast (`shared/store/toast-store.ts`, `shared/ui/toaster.tsx`): hover/odakta süre durur ("Geri al" için), en fazla 3 toast üst üste durur.
- Davet sayfası geri tuşu: kabul ve `returnUrl` yönlendirmeleri `replace` ile yapılır (`invitations/hooks/use-invitation-page.ts`, login/register).
- Test: `api-error-message.test.ts`, `use-board-mutation.test.tsx` (409 → invalidate + toast), `toast-store.test.ts`, `invitation-accept-page.test.tsx`. Playwright, iki context: silinmiş anchor → toast + doğru sıra.
- **Bitti:** Her 409 aynı toast ve otomatik yenilemeyle sonuçlanıyor.

**G9 · tester → ui-designer + frontend-react** — `test(e2e): accessibility audit with axe`
- `frontend/e2e/a11y.spec.ts` ve `e2e/helpers.ts`'e `expectNoA11yViolations(page)` eklenir. Etiketler WCAG 2.2 AA; `critical` ve `serious` testi düşürür.
- Taranacaklar: giriş, kayıt, panolar (boş ve dolu), pano (lime, mavi ve gök mavisi dahil arka planlar), kart detayı, Üyeler, Etiketler, Arşiv, Kart işlemleri, onay diyaloğu, davet sayfası, 404. Hepsi açık ve koyu temada (`emulateMedia({ colorScheme })`) ve 320 px'te.
- R8: Odaktaki kart kutucuğu ya da liste uzaktan silinir/taşınırsa odak o listenin "Kart ekle"sine, liste yoksa "Listeler" bölgesine düşer (`hooks/use-board-realtime.ts`, `store/card-ui-store.ts`). Test: `use-board-realtime.test.tsx`.
- **Bitti:** `a11y.spec.ts` yeşil; kalan `moderate` bulgular Backlog'a kart olarak açıldı.

**G10 · backend-nest + tester** — `docs: add README and security review` + `test: stabilise flaky suites`
- Aşağıdaki güvenlik checklist'i madde madde uygulanır. Bulgular düzeltilir ya da Backlog kartı olur.
- `README.md` (kökte yok): amaç, teknoloji, kurulum (Node 22, npm 11, PostgreSQL), env tablosu (yeni üç değişken dahil), komutlar, testler. Prod notları: aynı origin reverse proxy, `TRUST_PROXY`, `/socket.io` için `Upgrade`/`Connection` başlıkları, SPA CSP `connect-src 'self' wss:` (R15). `docs/` bağlantıları.
- tester: kararsız FE testleri için frontend unit 3 kez koşulur ve tekrar edenler düzeltilir. Sonra tam suite bir kez: unit (contracts/backend/frontend), backend e2e, Playwright, build/lint/typecheck. Ardından `docs/PLAN.md` İlerleme ve "Not (test)" güncellenir, son olarak `code-reviewer` incelemesi.
- **Bitti:** Tam suite yeşil, checklist işaretli, `code-reviewer` onayı alındı, panodaki Faz 8 kartı güncel.

**Güvenlik checklist'i (G10)**
- [ ] Prod env: `NODE_ENV=production`, `APP_URL`, tek origin `CORS_ORIGIN`, güçlü `JWT_ACCESS_SECRET`, doğru `TRUST_PROXY` hop sayısı.
- [ ] `rt` cookie: httpOnly + Secure (production) + SameSite=Strict + path `/api/v1/auth`.
- [ ] Rate limit: auth 10, davet 30, genel 300/dk; proxy arkasında gerçek IP üzerinden (G1 e2e).
- [ ] Production loglarında token, davet bağlantısı, parola ya da `Authorization` yok (`mail.service.ts` maskeli; grep ile kontrol).
- [ ] Bilinmeyen hata 500 + genel mesaj döner, stack gövdede yok.
- [ ] Her controller route'unda `@BoardRole`, `@Public` ya da açık bir sahiplik kontrolü var; işaretsiz route kalmadı (grep).
- [ ] FE: `dangerouslySetInnerHTML` yok, token localStorage'da değil, env olarak yalnız `VITE_` önekli gizli olmayan değerler.
- [ ] `npm audit --omit=dev` her iki workspace'te high/critical bulgu vermiyor.
- [ ] Socket: handshake'te JWT, `exp`'te kapatma, join'de üyelik kontrolü (Faz 7 e2e'leri yeşil).

**Backlog eşlemesi**

| Backlog kartı | Karar |
|---|---|
| Liste sütunlarını ekran yüksekliğiyle sınırla | G6 |
| Pano arka planını değiştirme arayüzü | G7 |
| Prod: `trust proxy` / `NODE_ENV` zorunlu / genel rate limit env | G1 |
| Dokunmatikte 44px + mobilde kenar boşluklu kart penceresi | G5 |
| Lime/mavi `--ui-board-control` kontrastı | G5 (G9 doğrular) |
| Üyeler diyaloğunda rol adları küçük harfle | G5 |
| Taşımada rebalance → sırayı hemen yenile | G2 + G3 |
| Kart cache'ten düşünce "Kart işlemleri" durumunu temizle | G3 |
| Realtime: token yenilemede geçici ağ hatası | G4 |
| Davet sayfası geri tuşu | Bu faza al (G8) |
| Kararsız FE testleri | Bu faza al (G10; "tam suite yeşil" şartı) |
| Rebalance tek UPDATE | Sonraya (ölçülmüş bir performans sorunu yok) |
| P2025 yardımcısı | Sonraya (kullanıcıya etkisi olmayan refactor) |
| Kilit sırası e2e | Sonraya (bu fazda kilit kodu değişmiyor) |
| Checkbox üstünden madde sürükleme | Sonraya (DnD davranış değişikliği; kapsamı büyütür) |

## 3. Yeni bağımlılıklar

- `@axe-core/playwright` (frontend devDependency, güncel 4.x): `npx -y npm@11 install -D @axe-core/playwright -w frontend`.
- Başka paket yok. `trust proxy` Express'in yerleşik ayarı; seçici ve toast mevcut kodla yapılır.

## 4. CLAUDE.md'de kullanıcı onayı gerektiren değişiklikler

1. "Sürümler": `@axe-core/playwright` kesin sürümü (Faz 8).
2. "Ortam notları"/"Komutlar": `backend/.env`'de `NODE_ENV` zorunlu; yeni `TRUST_PROXY` ve `API_RATE_LIMIT_PER_MINUTE`; Playwright notunda yerelde genel limitin de yüksek tutulması.
3. "Klasör Yapısı": kökte `README.md`.
4. "Zorunlu Kural": yeni sayfa/diyalog `e2e/a11y.spec.ts` taramasına eklenir (critical/serious ihlal yok).
5. (İsteğe bağlı) "Tasarım Yönü": mobilde tek sütun + yatay snap, dokunmatikte ≥ 44px hedef.

## 5. Riskler ve açık sorular

1. **İç içe kaydırma, snap ve dnd-kit:** Sütun içi kaydırma ve `snap-mandatory`, sürüklemedeki otomatik kaydırma ve dokunmatik sensörle çakışabilir. Önlem: sürüklemede snap kapanır; mevcut DnD Playwright spec'leri yeni düzende koşulur.
2. **`NODE_ENV` zorunlu:** `NODE_ENV` içermeyen yerel `.env`'lerle backend açılmaz (Playwright de bu `.env`'i kullanır). Açık hata mesajı ve README notu eklenir; geçişte `backend/.env` kontrol edilir.
3. **axe eşiği:** PLAN "kritik ihlal yok" diyor. Öneri `critical` + `serious`, çünkü kontrast `serious` sayılıyor. Kullanıcı kararı gerekiyor.
4. **Borç kapsamı:** Rol adı (varsayım: yalnız cümle içi) ve "Kart işlemleri" borçlarının kapsamı koddan çıkarıldı; panodaki kart açıklamalarıyla doğrulanmalı.
5. **Yanıt şekli:** `rebalanced` eklemek geriye uyumlu, ama tam eşitlik bekleyen e2e assert'leri ve MSW handler'ları aynı commit'te güncellenmeli.
