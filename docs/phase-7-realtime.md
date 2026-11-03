# Faz 7 — Gerçek Zamanlı İş Birliği: Uygulama Planı

> `architect` rolüyle hazırlandı (2026-11-03). Kurallar: `CLAUDE.md`. Genel plan: `docs/PLAN.md` (§1 Realtime, §3 sunucu prosedürü, §4 ortak kurallar / `X-Socket-Id`, §5 WebSocket Sözleşmesi, §6 Realtime + Sürükle-bırak, §8 Faz 7, §9, §10 R1/R2/R7). Biçim: `docs/phase-6-invitations.md`.
> Metin Türkçe; kod, dosya ve tanımlayıcı adları İngilizce.

**Önkoşul:** Faz 6 commit'lendi (`6259a62`, `d427c5f`); çalışma ağacı temiz. Şu an socket kodu **yok**: `backend/src/realtime/` yok, backend'de `@nestjs/websockets` / `socket.io` bağımlılığı yok. Hazır olanlar: frontend'de `socket.io-client ^4.8.4`, Vite'ta `/socket.io` proxy'si (`ws: true`), `ordering/placement.ts`'te `Placement.rebalanced`, FE'de saf cache yardımcıları (`board-detail/lib/board-cache.ts`, `card-detail/lib/card-detail-cache.ts`). Faz 5 §4.3 ve Faz 6 §5'teki "Faz 7'ye hazırlık" notları bu planda karşılanır.

---

## 1. Özet

**Amaç:** Aynı panoyu açmış kullanıcılar birbirlerinin değişikliklerini sayfayı yenilemeden görür: liste ve kart ekleme, taşıma, düzenleme, arşivleme, silme; etiketler; açık kart detayındaki checklist'ler; üyelik değişiklikleri. Panodan çıkarılan kullanıcı panodan atılır. Silinen pano herkesin listesinden düşer. Kullanıcının kendi değişikliği kendi sekmesine geri yankılanmaz.

**Kapsam içi**
- Backend: Socket.io gateway (`/realtime` namespace). Handshake'te JWT doğrulama. Kullanıcı başına `user:<id>`, pano başına `board:<id>` room'u. `board:join`'de üyelik kontrolü, üye olmayana ret.
- `RealtimeService`: yazan her serviste başarılı commit **sonrası** yayın. `X-Socket-Id` ile isteği yapan sekme yayından çıkarılır.
- Üye çıkarılınca/ayrılınca ve pano silinince socket'ler room'dan atılır. Access token süresi dolunca bağlantıyı sunucu kapatır.
- `@trello/contracts`: event adları, payload tipleri, ack tipleri, socket.io için tipli event haritaları. Tek kaynak, iki tarafta aynı adlar.
- Frontend: tek socket istemcisi (`shared/lib`), bağlantı yaşam döngüsü (refresh + yeniden bağlanma), `useBoardRealtime`, saf ve idempotent `applyBoardEvent` / `applyCardEvent` / `applyBoardListEvent`, sürükleme sırasında event'leri bekletme, yeniden bağlanınca rejoin + refetch, küçük bir bağlantı durumu göstergesi.
- Testler: backend unit + `socket.io-client` ile e2e, FE unit (reducer'lar, istemci, hook'lar), Playwright iki tarayıcı bağlamı.

**Kapsam dışı:** presence ("kim çevrimiçi", imleçler), bildirim ve aktivite akışı, çoklu sunucu (Redis adapter, sticky session), kaçırılan event'lerin sunucuda saklanıp yeniden oynatılması (socket.io connection state recovery), çevrimdışı yazma kuyruğu, kartlarda optimistic locking (PLAN: last-write-wins), `PATCH /users/me` sonrası ad ve avatarın başka panolara canlı yansıması, davet listesi için event (`invitation:*` yok, Faz 6 §5 kararı), reverse proxy'de WebSocket ayarı (Faz 8).

**Ana kararlar (kısa)**
| Konu | Karar |
|---|---|
| Migration | **Gerekmiyor** (§2). |
| Transport | Yalnız WebSocket (`transports: ['websocket']`, iki tarafta). Long-polling yok, bu yüzden ileride çoklu sunucuda sticky session gerekmez (§11 K2). |
| Kimlik | Handshake'te `auth.token` (access token). Geçersizse bağlantı reddedilir (`connect_error`, mesaj `UNAUTHORIZED`). Token'ın `exp` anında sunucu socket'i kapatır; istemci refresh edip yeniden bağlanır (§4.4). |
| Room | Socket bağlanınca `user:<userId>` room'una girer. `board:join` üyelik kontrolünden sonra `board:<id>`'ye sokar. Bir socket aynı anda **tek** board room'unda olur (§4.5). |
| Yayın zamanı | Yalnız transaction ya da tek yazım `await`'i başarıyla döndükten sonra. Transaction callback'i içinde asla. Yayın hatası isteği düşürmez, sadece loglanır. |
| Yankı | İstek `X-Socket-Id` taşır. Sunucu bu socket'i yalnızca **istek sahibine aitse** yayından çıkarır (§4.7). |
| Payload | Mevcut DTO mapper'ları üzerinden. Açıklama metni, davet bilgisi ve token'ı, socket id'leri, başka kullanıcının `myRole`'ü asla yayınlanmaz (§5.4). |
| Sayaçlar | Checklist ve madde event'leri kartın yeni `checklistTotal/checklistDone` değerini (`counts`) taşır. PLAN'daki ek `card:updated` yayınlanmaz. Sayaç kart kilidi altında sayılır; bunun için madde güncellemesi de artık kart kilidi alır (§4.8). |
| Rebalance | `placeAndRebalance` `Placement` döndürür. Rebalance olduysa ana event'ten **önce** `position:rebalanced` gider. |
| Pano silme | `board:deleted` tüm üyelerin `user:` room'larına gider, böylece panolar sayfasındakiler de görür. Sonra board room boşaltılır. |
| FE uygulama | Saf reducer'lar: `applyBoardEvent` (board cache), `applyCardEvent` (açık kart detayı), `applyBoardListEvent` (panolar listesi). Cache event'i tek başına izleyemiyorsa `refetch: true` döner. |
| FE kuyruk | Sürüklerken event'ler socket istemcisinde bekletilir (`hold()`). İyimser taşıma cache'e girdikten sonra sırayla uygulanır. PLAN'daki Zustand `dragStore` yerine geçer (kuyruk render edilmiyor). |
| Kaçırılan event | Her başarılı `board:join`'den sonra (ilk açılış ve yeniden bağlanma) board sorgusu bir kez yenilenir. Sunucu event saklamaz. |
| Gösterge | Yalnız pano sayfasında. Bağlantı 3 sn'den uzun kopukken küçük bir durum satırı görünür (§6.11). |

---

## 2. Veritabanı Şeması

**Değişiklik yok, migration yok.** Doğrulama (`backend/prisma/schema.prisma`):

| İhtiyaç | Mevcut |
|---|---|
| `board:join` üyelik kontrolü | `BoardMember` PK `(boardId, userId)`: tek index araması ✓ (`BoardAccessService.getRole`) |
| Pano silinirken üye id'leri | Aynı PK'nin `boardId` öneki ✓ |
| Kart başına checklist sayacı | `Checklist(cardId, position)` + `ChecklistItem(checklistId, position)` index'leri ✓ (kart başına az satır) |
| Silinen kartın listesi | `Card` PK ✓ (`delete … select: { listId }`) |

**Davranış değişiklikleri (şema değil)**
- `PATCH /checklist-items/:itemId` artık önce kart satırını kilitler (`lockCardRow`). Sayaçlar böylece sıralı yazımlarla sayılır ve yayın sırası commit sırasını izler (§4.8). Kilit sırası değişmez: `Board → List → Card → checklist satırları`.
- `DELETE /boards/:boardId` tek transaction olur: `lockBoard` → üye id'lerini oku → sil. Davet kabulüyle (o da `lockBoard` alıyor) sıraya girer; yayın listesi kesin olur.

**Sıralama stratejisi:** Değişmez (Float + aralık + seyrek rebalance, PLAN §3). Rebalance yapan yazımlar yeni pozisyonları `position:rebalanced` ile yayınlar. Sona ekleme (`positionBetween(last, null)`) hiçbir zaman rebalance gerektirmez; rebalance yalnız anchor'lı yazımlarda olur (liste/kart oluşturma, tüm `move` endpoint'leri).

**Migration adı önerisi:** — (gerekmiyor).

---

## 3. Paylaşılan Sözleşmeler (`shared/contracts/src/`)

### 3.1 Yeni `realtime-events.ts`
```ts
import type { BoardSummaryDto, MemberDto } from './boards.js';
import type { CardSummaryDto } from './cards.js';
import type { ChecklistDto, ChecklistItemDto } from './checklists.js';
import type { ErrorCode } from './errors.js';
import type { LabelDto } from './labels.js';
import type { ListDto } from './lists.js';

/** Socket.io namespace of the app. The HTTP path is socket.io's default. */
export const REALTIME_NAMESPACE = '/realtime';
export const REALTIME_PATH = '/socket.io';

/** Header naming the sender's socket, so its own change is not echoed back. Lower case: Node lower-cases header names. */
export const SOCKET_ID_HEADER = 'x-socket-id';

/** `connect_error` message when the handshake token is missing, invalid or expired. */
export const REALTIME_UNAUTHORIZED = 'UNAUTHORIZED';

/** Board fields every member may see. `myRole` differs per member, so it is never broadcast. */
export type BoardInfoDto = Omit<BoardSummaryDto, 'myRole'>;

/** A card's checklist counters after a checklist change, for its tile. */
export type CardChecklistCounts = Pick<CardSummaryDto, 'checklistTotal' | 'checklistDone'>;

export interface PositionUpdate {
  id: string;
  position: number;
}

/** New positions of the other siblings after the gap ran out. Sent right before the event that caused it. */
export type PositionRebalancedData =
  | { entity: 'list'; positions: PositionUpdate[] }
  | { entity: 'card'; listId: string; positions: PositionUpdate[] }
  | { entity: 'checklist'; cardId: string; positions: PositionUpdate[] }
  | { entity: 'checklist-item'; cardId: string; checklistId: string; positions: PositionUpdate[] };

/** Events for everyone in `board:<id>`. */
export interface BoardEventMap {
  'board:updated': BoardInfoDto;
  'member:added': MemberDto;
  'member:updated': MemberDto;
  'member:removed': { userId: string };
  'list:created': ListDto;
  'list:updated': ListDto;
  'list:moved': { id: string; position: number };
  'list:deleted': { id: string };
  'card:created': CardSummaryDto;
  /** Never carries the description text; `descriptionChanged` tells an open card to reload it. */
  'card:updated': { card: CardSummaryDto; descriptionChanged: boolean };
  'card:moved': { id: string; fromListId: string; toListId: string; position: number };
  'card:deleted': { id: string; listId: string };
  'card:label-added': { cardId: string; labelId: string };
  'card:label-removed': { cardId: string; labelId: string };
  'label:created': LabelDto;
  'label:updated': LabelDto;
  'label:deleted': { id: string };
  'checklist:created': ChecklistDto;
  'checklist:updated': { id: string; cardId: string; title: string };
  'checklist:moved': { id: string; cardId: string; position: number };
  'checklist:deleted': { id: string; cardId: string; counts: CardChecklistCounts };
  'checklist-item:created': { item: ChecklistItemDto; cardId: string; counts: CardChecklistCounts };
  'checklist-item:updated': { item: ChecklistItemDto; cardId: string; counts: CardChecklistCounts };
  'checklist-item:moved': {
    id: string;
    cardId: string;
    fromChecklistId: string;
    toChecklistId: string;
    position: number;
  };
  'checklist-item:deleted': {
    id: string;
    checklistId: string;
    cardId: string;
    counts: CardChecklistCounts;
  };
  'position:rebalanced': PositionRebalancedData;
}

/** Events for one user's sockets (`user:<id>`), on whatever page they are. */
export interface UserEventMap {
  /** The recipient's own summary (its `myRole` is theirs). */
  'membership:added': BoardSummaryDto;
  'membership:removed': { boardId: string };
  'board:deleted': { boardId: string };
}

export type BoardEventName = keyof BoardEventMap;
export type UserEventName = keyof UserEventMap;
export type RealtimeEventName = BoardEventName | UserEventName;
export type RealtimeEventMap = BoardEventMap & UserEventMap;

/** What goes over the wire with every event. */
export interface RealtimeEnvelope<T> {
  boardId: string;
  /** The user whose request caused the change. */
  actorId: string;
  /** ISO time of the broadcast (debugging only; never used for ordering). */
  emittedAt: string;
  data: T;
}

/** An event as code passes it around: name and payload, narrowed by `type`. */
export type BoardEvent = { [K in BoardEventName]: { type: K; data: BoardEventMap[K] } }[BoardEventName];
export type UserEvent = { [K in UserEventName]: { type: K; data: UserEventMap[K] } }[UserEventName];

/** A received event with its envelope fields. */
export type RealtimeMessage = (BoardEvent | UserEvent) & Omit<RealtimeEnvelope<unknown>, 'data'>;

/** Records, so a new event name that is not listed here fails to compile. */
const BOARD_EVENTS: Record<BoardEventName, true> = { /* every BoardEventMap key: true */ };
const USER_EVENTS: Record<UserEventName, true> = {
  'membership:added': true,
  'membership:removed': true,
  'board:deleted': true,
};
export const BOARD_EVENT_NAMES = Object.keys(BOARD_EVENTS) as BoardEventName[];
export const USER_EVENT_NAMES = Object.keys(USER_EVENTS) as UserEventName[];

/** Own-property checks (not `in`), so `toString` and friends are never event names. */
export function isBoardEventName(name: string): name is BoardEventName;
export function isUserEventName(name: string): name is UserEventName;

export interface BoardRoomRequest {
  boardId: string;
}

export type JoinBoardAck =
  | { ok: true }
  | { ok: false; code: Extract<ErrorCode, 'NOT_FOUND' | 'VALIDATION_FAILED' | 'CONFLICT' | 'INTERNAL_ERROR'> };

/** Typed maps for `Server<…>` / `Socket<…>` on both sides. */
export type ServerToClientEvents = {
  [K in RealtimeEventName]: (envelope: RealtimeEnvelope<RealtimeEventMap[K]>) => void;
};

export interface ClientToServerEvents {
  'board:join': (request: BoardRoomRequest, ack: (result: JoinBoardAck) => void) => void;
  'board:leave': (request: BoardRoomRequest, ack?: (result: { ok: true }) => void) => void;
}
```
`index.ts`'e `export * from './realtime-events.js'` eklenir. Contracts'ın runtime bağımlılığı yok kuralı korunur (yalnız tipler, sabitler ve iki küçük guard).

### 3.2 Hata kodları
**Yeni kod yok.** `JoinBoardAck` mevcut `NOT_FOUND`, `VALIDATION_FAILED`, `CONFLICT`, `INTERNAL_ERROR`'u kullanır. Handshake reddi `Error('UNAUTHORIZED')` + `data: { code: 'UNAUTHORIZED' }` (§4.4).

### 3.3 Envelope ve sıra garantileri
- Her event aynı envelope'la gider: `{ boardId, actorId, emittedAt, data }`. Kullanıcı event'lerinde de `boardId` vardır (hepsi bir panoyla ilgili).
- **Socket başına sıra:** socket.io aynı bağlantıdaki event'leri gönderildiği sırayla teslim eder. Bir isteğin event'leri dizi sırasıyla gider (`position:rebalanced` önce, ana event sonra).
- **İstekler arası sıra:** Kilit alan yazımlarda (liste/kart sıralama, kart taşıma, checklist/madde yazımları, davet/üyelik) yayın sırası commit sırasıdır. Bir sonraki yazım kilidi ancak öncekinin commit'inden sonra alabilir; öncekinin yayını bu sürede çoktan yapılmış olur. Kilit almayan yazımlarda (kart başlığı/açıklama `PATCH`, etiket, checklist adı, rol değişikliği, pano başlığı) aynı alanın iki eşzamanlı yazımı ters sırada yayınlanabilir. Bir istemci bir sonraki refetch'e kadar eski değeri görebilir. PLAN'daki last-write-wins kabulünün parçası (§9 R1).
- `emittedAt` sıralama için **kullanılmaz** (saat kayması, eşzamanlı yazımlar).

---

## 4. Backend

### 4.1 Bağımlılıklar
| Paket | Tür | Not |
|---|---|---|
| `@nestjs/websockets`, `@nestjs/platform-socket.io` | dependency | NestJS ile aynı major (`^12`). |
| `socket.io` | dependency | 4.8 hattı. Frontend'deki `socket.io-client ^4.8.4` ile uyumlu. |
| `socket.io-client` | devDependency | e2e testleri için. Frontend'deki sürümle aynı. |

Kurulum npm 11 ile yapılır (CLAUDE.md ortam notu). Kesin sürümler kurulumdan sonra CLAUDE.md "Sürümler" satırına yazılır (kullanıcı onayıyla).

### 4.2 Dosyalar
```
backend/src/
├── realtime/
│   ├── realtime.module.ts            @Global; imports: AuthModule (TokenService); providers: RealtimeGateway, RealtimeService; exports: RealtimeService
│   ├── realtime.gateway.ts           namespace /realtime; afterInit, handleConnection, handleDisconnect, board:join, board:leave
│   ├── realtime.service.ts           attach, toBoard, toUsers, removeUserFromBoard, closeBoardRoom
│   ├── realtime-io.adapter.ts        IoAdapter alt sınıfı: path, transports, cors, maxHttpBufferSize, serveClient
│   ├── ws-auth.middleware.ts         createWsAuthMiddleware(tokens)
│   ├── rooms.ts                      boardRoom(id) → `board:${id}`, userRoom(id) → `user:${id}`, isBoardRoom(name)
│   ├── board-events.ts               rebalanceEvents(target, rebalanced): BoardEvent[]
│   ├── event-origin.ts               EventOrigin tipi, parseSocketId(header), @CurrentEventOrigin()
│   └── *.spec.ts
├── auth/token.service.ts             + verifyAccessTokenWithExpiry(token) → { user, expiresAt }
├── auth/guards/jwt-auth.guard.ts     ws bağlamı: socket.data.user varsa izin (§4.10)
├── app.setup.ts                      + app.useWebSocketAdapter(new RealtimeIoAdapter(app, CORS_ORIGIN))
├── app.module.ts                     + RealtimeModule
├── ordering/place-and-rebalance.ts   number yerine Placement döndürür
├── boards/, members/, invitations/, lists/, cards/, labels/, checklists/
│                                     servisler RealtimeService alır; controller'lar EventOrigin geçirir (§4.8)
└── checklists/checklist-counts.ts    countChecklistItems(tx, cardId): CardChecklistCounts
backend/test/
├── utils/create-test-app.ts          createTestApp({ listen?: boolean }) → listen ise app.listen(0, '127.0.0.1')
├── utils/realtime.ts                 connectAs, connectExpectingError, join, leave, recordEvents, expectNext, expectNextAfterSentinel
├── realtime.e2e-spec.ts              bağlantı, join, hariç tutma, üyelik, pano silme, token süresi
└── realtime-events.e2e-spec.ts       §5.5 tablosu (tablo güdümlü), rebalance, sayaçlar, sızıntı taraması, sıra
```

### 4.3 Socket.io kurulumu
- `RealtimeIoAdapter extends IoAdapter`; `createIOServer(port, options)` şu seçenekleri ekler: `path: REALTIME_PATH`, `transports: ['websocket']`, `cors: { origin: CORS_ORIGIN, credentials: true }`, `maxHttpBufferSize: 16_384` (istemciden gelen tek mesaj join/leave; büyük gövde gerekmez), `serveClient: false`. Varsayılan `pingInterval`/`pingTimeout` korunur.
- `configureApp` adapter'ı kurar. Böylece `main.ts` ve e2e aynı kurulumu kullanır (CLAUDE.md kuralı).
- Socket.io aynı HTTP sunucusuna bağlanır. Global prefix (`/api/v1`) `/socket.io`'ya uygulanmaz. Vite proxy'si zaten `/socket.io`'yu `ws: true` ile 3000'e iletiyor.
- Gateway: `@WebSocketGateway({ namespace: REALTIME_NAMESPACE })` ve `@SkipThrottle()` (§4.10). Sunucu tipi `Namespace<ClientToServerEvents, ServerToClientEvents, DefaultEventsMap, SocketData>`. `SocketData = { user: AuthUser; expiresAt: number; roomSeq: number }`.
- Varsayılan namespace (`/`) handler'sızdır. Oraya bağlanan socket hiçbir şey alamaz ve gönderemez.

### 4.4 Kimlik doğrulama ve token süresi
**Middleware (`ws-auth.middleware.ts`, `afterInit`'te `namespace.use(...)`)**
1. `token = socket.handshake.auth?.token`. String değilse ya da boşsa → `next(unauthorized())`.
2. `{ user, expiresAt } = await tokens.verifyAccessTokenWithExpiry(token)`. Hata → `next(unauthorized())`.
3. `socket.data.user = user`, `socket.data.expiresAt = expiresAt` (ms), `socket.data.roomSeq = 0` → `next()`.

`unauthorized()` = `Object.assign(new Error(REALTIME_UNAUTHORIZED), { data: { code: 'UNAUTHORIZED' } })`. Token **asla** loglanmaz. `handshake.query.token` kabul edilmez (URL'ler log'lara düşer). Kullanıcının DB'de varlığı kontrol edilmez (HTTP guard'ı da etmiyor). Yetki `board:join`'deki üyelik kontrolünden gelir.

**`TokenService.verifyAccessTokenWithExpiry(token)`**: `verifyAccessToken` ile aynı doğrulama (HS256 sabit, `sub`/`email` string), ek olarak `exp` (saniye) okunur ve sayı değilse `invalidAccessToken()`. Dönüş `{ user: AuthUser; expiresAt: number /* ms */ }`. `verifyAccessToken` bunu çağırıp `user`'ı döndürecek şekilde sadeleşir (davranış aynı).

**Bağlantı (`handleConnection`)**
- `socket.join(userRoom(user.id))`.
- Süre zamanlayıcısı: `setTimeout(() => socket.disconnect(true), Math.max(0, expiresAt - Date.now()))`. Zamanlayıcı gateway'deki `Map<socketId, Timeout>`'ta tutulur (`socket.data`'da değil: ileride bir adapter `data`'yı serileştirebilir) ve `unref()` edilir. `handleDisconnect` zamanlayıcıyı temizler.
- Sonuç: Hiçbir socket, token'ının süresinden uzun yaşamaz. Çıkış yapan ya da refresh ailesi iptal edilen kullanıcının açık socket'i en geç 15 dk içinde kapanır. İstemci tarafı §6.3'te.

### 4.5 Room'lar, `board:join` ve `board:leave`
**`board:join` prosedürü** (handler ack nesnesini döndürür, asla throw etmez):
1. `seq = ++socket.data.roomSeq`.
2. Gövde `{ boardId: string }` değilse ya da `boardId` UUID değilse → `{ ok: false, code: 'VALIDATION_FAILED' }`.
3. `role = await access.getRole(boardId, user.id)`. `null` → `{ ok: false, code: 'NOT_FOUND' }`. Olmayan pano ile üye olunmayan pano aynı cevabı alır; panonun varlığı açığa çıkmaz.
4. `seq !== socket.data.roomSeq` ise (bu arada daha yeni bir join/leave geldi) → `{ ok: false, code: 'CONFLICT' }`, room'a girilmez. Bu, A→B pano geçişinde geç dönen A join'inin socket'i A'ya geri sokmasını engeller.
5. Socket'in diğer `board:*` room'larından çıkılır (`isBoardRoom`). Socket aynı anda tek panoda olur. Unutulmuş bir leave room sızdırmaz, join yağdırarak çok room'a girilemez.
6. `socket.join(boardRoom(boardId))`.
7. **Yeniden kontrol:** `getRole` tekrar çağrılır. `null` ise `socket.leave(...)` → `NOT_FOUND`. Gerekçe: join (3) ile (6) arasında üye çıkarılırsa, çıkarma işleminin `socketsLeave` adımı socket henüz room'da değilken çalışmış olabilir. (7) bunu yakalar. Çıkarma (6)'dan sonra commit edilirse `socketsLeave` socket'i zaten bulur. In-memory adapter işlemleri senkron olduğu için iki sıranın ikisi de güvenli.
8. `{ ok: true }`.

Beklenmeyen hata (DB erişimi vb.) → socket bu join için room'a girdiyse çıkarılır, `Logger.warn` (token yok), `{ ok: false, code: 'INTERNAL_ERROR' }`.

**`board:leave`**: `seq = ++roomSeq`, geçerli UUID ise `socket.leave(boardRoom(boardId))`, ack varsa `{ ok: true }`. Geçersiz gövde sessizce yok sayılır.

**Kötüye kullanım sınırları:** join başına iki PK araması, socket başına tek board room, 16 KB mesaj sınırı. Ayrı bir socket rate limit yok (§9 R10).

### 4.6 `RealtimeService` ve yayın kuralı
```ts
export interface EventOrigin {
  /** The user whose request caused the change. */
  actorId: string;
  /** The request's X-Socket-Id; left out of the broadcast when it is one of the actor's sockets. */
  socketId: string | null;
}

@Injectable()
export class RealtimeService {
  /** Called once by the gateway (afterInit). Until then every method is a no-op (unit tests, startup). */
  attach(namespace: RealtimeNamespace): void;
  /** Sends the events to board:<id> in array order. Call only after the write committed. Never throws. */
  toBoard(boardId: string, origin: EventOrigin, events: readonly BoardEvent[]): void;
  /** Sends one event to the user rooms (each socket once, even if listed twice). Never throws. */
  toUsers(userIds: readonly string[], boardId: string, origin: EventOrigin, event: UserEvent): void;
  /** Takes every socket of the user out of board:<id> (removed member, left board). */
  removeUserFromBoard(boardId: string, userId: string): void;
  /** Empties board:<id> (board deleted). */
  closeBoardRoom(boardId: string): void;
}
```
- Envelope burada kurulur: `{ boardId, actorId: origin.actorId, emittedAt: new Date().toISOString(), data }`.
- Hariç tutma: `except = namespace.sockets.get(origin.socketId)?.data.user.id === origin.actorId ? origin.socketId : undefined`. `toBoard`: `namespace.to(boardRoom(id)).except(except).emit(...)`. `toUsers`: `namespace.to(userIds.map(userRoom)).except(except).emit(...)`. Socket.io, room listesindeki aynı socket'e bir kez gönderir.
- Her emit `try/catch` içinde. Hata `Logger.error` ile event adı ve `boardId` ile loglanır (payload loglanmaz). Veri commit edildiği için istek başarılı kalır.

**Yayın kuralı (kod incelemesinde zorunlu):**
1. `realtime.*` çağrıları yalnızca `await this.prisma.$transaction(...)` ya da tek yazım `await`'i **döndükten sonra**, servis metodunun en sonunda yapılır. Transaction callback'i içinde asla çağrılmaz.
2. Transaction, yayın için gereken her şeyi döndürür (DTO, `Placement.rebalanced`, eski `listId`, `counts`, üye id'leri).
3. Başarısız istek (throw) hiçbir event üretmez.
4. Hiçbir değişiklik yapmayan idempotent çağrı event üretmez: zaten atanmış etiket, zaten kaldırılmış etiket, tekrar kabul edilen davet. İstisna: değişiklik içermeyen `PATCH` gövdeleri yine yayınlanır (basitlik; idempotent uygulanır).

### 4.7 `@CurrentEventOrigin()` ve `X-Socket-Id`
- `parseSocketId(value: unknown): string | null`: string, 1–64 karakter, `/^[A-Za-z0-9_-]+$/` (socket.io id'leri 20 karakter base64url). Aksi halde `null`. Dizi başlık (aynı başlık iki kez) → `null`.
- `@CurrentEventOrigin()` param decorator'ı: `request.user.id` (yoksa `CurrentUser` gibi 401) + `parseSocketId(request.headers[SOCKET_ID_HEADER])`.
- Bozuk başlık **400 değildir**, yalnızca yok sayılır. Eski ya da kopuk bir socket id'si yazımı bozmamalı.
- Sahiplik kontrolü (§4.6) olmadan bir istemci, bildiği bir socket id'sini göndererek başkasının o event'i almasını engelleyebilirdi. Kontrol bunu kapatır. Socket id'leri hiçbir payload'da yer almaz.
- CORS: `enableCors` varsayılan olarak istek başlıklarını yansıtır, dev'de zaten aynı origin. Production'da aynı origin önerisi geçerli (PLAN §10 R6).

### 4.8 Servis değişiklikleri
Servisler `RealtimeService`'i constructor'da alır (modül `@Global`). Yazan her controller handler'ı `@CurrentEventOrigin() origin: EventOrigin` alır ve servise geçirir. Silme handler'ları `@CurrentBoardId()` de alır. Controller yanıtları **değişmez**.

| Servis | Metot | Değişiklik |
|---|---|---|
| `ordering/place-and-rebalance.ts` | `placeAndRebalance` | `number` yerine `Placement` (`{ position, rebalanced }`) döndürür. Dört servisin özel `place()`'i de `Placement` döndürür. |
| `realtime/board-events.ts` | `rebalanceEvents(target, rebalanced)` | `rebalanced` null ise `[]`, değilse `[{ type: 'position:rebalanced', data: { ...target, positions } }]`. `target`: `{ entity: 'card', listId }` vb. |
| `BoardsService` | `create(userId, input, origin)` | Commit sonrası `toUsers([userId], …, membership:added)`. İstek sahibi sekme hariç; diğer sekmeleri güncellenir. |
| | `update(…, origin)` | `board:updated` (`BoardInfoDto`: `myRole` atılır). |
| | `remove(boardId, origin)` | Tx: `lockBoard` (`false` → 404) → `boardMember.findMany({ select: { userId } })` → `board.delete`. Sonra `toUsers(memberIds, board:deleted)` → `closeBoardRoom`. |
| `MembersService` | `updateRole(…, origin)` | `member:updated` (dönen `MemberDto`). |
| | `remove(boardId, actor, userId, origin)` | Silmeden sonra sırayla §4.9. |
| `InvitationsService` | `create` | `MEMBER_ADDED` dalında tx ayrıca `board`'u `BOARD_SELECT` ile okur. Commit sonrası `member:added` (board) + `membership:added` (`toBoardSummary(board, input.role)`, `user:<eklenen>`). `INVITATION_CREATED` dalı **yayın yapmaz**. Yayın mail'den önce yapılır. |
| | `accept` | `createMany` sonucu `count === 1` ise tx `MemberDto` + `BOARD_SELECT` okur. Commit sonrası `member:added` + `membership:added` (kabul eden, `myRole` = davet rolü). İdempotent yollar (zaten üye, `ACCEPTED`) yayın yapmaz. Controller yanıtı `{ boardId }` olarak kalır (Faz 6 §5 hazırlık notu). |
| `ListsService` | `create`, `update`, `move` | Tx `{ dto, rebalanced }` döndürür. Commit sonrası `[...rebalanceEvents({ entity: 'list' }, rebalanced), list:created / list:updated / list:moved]`. |
| | `remove(boardId, listId, origin)` | `deleteMany({ where: { id: listId, boardId } })`; `count === 0` → 404 `List not found`. Sonra `list:deleted`. |
| `CardsService` | `create` | `[...rebalance(card, listId), card:created]` |
| | `update` | `card:updated { card, descriptionChanged: input.description !== undefined }`. Geri yüklemede önce rebalance (sona eklendiği için pratikte boş). |
| | `move` | Tx eski `listId`'yi döndürür (`lockCard` zaten okuyor) → `[...rebalance(card, toListId), card:moved { id, fromListId, toListId, position }]`. |
| | `remove(boardId, cardId, origin)` | `delete({ where: { id: cardId, boardId }, select: { listId: true } })` (P2025 → mevcut 404 eşlemesi) → `card:deleted { id, listId }`. |
| `LabelsService` | `create`, `update`, `remove` | `label:created` / `label:updated` / `label:deleted` (`remove`'da `count === 1` iken). |
| | `assign`, `unassign` | `createMany` / `deleteMany` sonucu `count === 1` ise `card:label-added` / `card:label-removed`. |
| `ChecklistsService` | `create` | `[...rebalance(checklist, cardId), checklist:created]` (yeni checklist boş; sayaç değişmez). |
| | `rename` | `checklist:updated { id, cardId, title }`. |
| | `move` | `[...rebalance, checklist:moved { id, cardId, position }]`. |
| | `remove` | Tx'te silmeden sonra `countChecklistItems` → `checklist:deleted { id, cardId, counts }`. |
| `ChecklistItemsService` | `create`, `remove` | Tx (kart kilidi zaten var) yazımdan sonra `countChecklistItems` → `checklist-item:created { item, cardId, counts }` / `checklist-item:deleted { id, checklistId, cardId, counts }`. |
| | `update` | **Artık tx + `lockCardRow`** (önce `findFirst` ile `cardId`, sonra kilit, sonra `update`, sonra sayım; kilitten sonra satır yoksa 404). `checklist-item:updated { item, cardId, counts }`. İçerik düzenlemesi de aynı yoldan geçer (tek yol, basit). |
| | `move` | Tx kaynak `checklistId`'yi döndürür → `[...rebalance(checklist-item, cardId, toChecklistId), checklist-item:moved { … }]`. |

`countChecklistItems(tx, cardId)`: aynı tx içinde iki `count` sorgusu (toplam, tamamlanan). `CardChecklistCounts` döndürür.

Yeni bir yazım endpoint'i eklendiğinde §5.5 tablosuna satır eklemek ve e2e tablo testine bir giriş yazmak zorunludur (§12).

### 4.9 Üye çıkarma, ayrılma ve pano silme sırası
**Üye çıkarma / ayrılma** (`MembersService.remove`, silme commit'inden sonra):
1. `removeUserFromBoard(boardId, userId)`: `namespace.in(userRoom(userId)).socketsLeave(boardRoom(boardId))`.
2. `toBoard(boardId, origin, [member:removed { userId }])`. Çıkarılan kişi artık room'da değil, bu event'i almaz.
3. `toUsers([userId], boardId, origin, membership:removed { boardId })`. Çıkarılanın tüm sekmeleri alır. Ayrılmada istek sahibi sekme hariç tutulur; o sekme kendi yönlendirmesini zaten yapar.

**Pano silme**: (1) `toUsers(memberIds, board:deleted)`. Silen sekme hariç, sahibin diğer sekmeleri dahil. (2) `closeBoardRoom(boardId)`.

**Rol değişikliği**: room üyeliği değişmez (her rol MEMBER+). Yalnız `member:updated`.

**Join ile çıkarma yarışı:** §4.5 adım 7.

### 4.10 Global guard, pipe ve filter etkileşimi
- **`JwtAuthGuard`** (`APP_GUARD`) gateway handler'larında da çalışabilir. Şu anki kod `getType() !== 'http'` için `false` döndürüyor; bu, `board:join`'i "Forbidden" ile kırar. Değişiklik: `context.getType() === 'ws'` ise `Boolean(context.switchToWs().getClient<Socket>().data?.user)`. Kimlik handshake'te doğrulandı; guard yalnızca doğrulanmamış socket'i reddeder. Diğer türler (`rpc`) `false` kalır. Mevcut unit testi ("ws → false") yeni kurala göre güncellenir.
- **`ThrottlerGuard`** (`APP_GUARD`) ws bağlamında HTTP response nesnesine dokunur. Gateway sınıfına `@SkipThrottle()` konur.
- **Global filter ve pipe'lar** (`useGlobalFilters`, `useGlobalPipes`) gateway'lere uygulanmaz. Handler'lar bu yüzden hiç throw etmez, ack nesnesi döndürür. Girdi doğrulaması elle yapılır (UUID regex'i NUL'u da dışlar).
- **`BoardAccessGuard`** HTTP param'larını okur ve gateway'de kullanılmaz. Join, `BoardAccessService.getRole`'u doğrudan çağırır.
- Bu dört varsayım B2'de e2e ile doğrulanır: join çalışıyorsa guard'lar engellemiyor demektir.

### 4.11 Güvenlik özeti
| Tehdit | Önlem |
|---|---|
| Kimliksiz bağlantı | Handshake middleware'i. Token yoksa/geçersizse bağlantı yok. |
| Üye olmayanın pano event'lerini dinlemesi | Yalnız `board:join` room'a sokar ve üyelik ister. Yayın sadece room'a. |
| Çıkarılan üyenin dinlemeye devam etmesi | Commit sonrası `socketsLeave` + join'de yeniden kontrol. |
| İptal edilmiş oturumun açık socket'i | `exp` anında sunucu kapatır (≤ 15 dk). |
| Başkasının event'ini bastırmak (sahte `X-Socket-Id`) | Socket istek sahibine ait değilse hariç tutulmaz. |
| Payload sızıntısı | §5.4. e2e'de sızıntı taraması. |
| Büyük/çok mesajla yük | 16 KB sınırı, tek board room, join'de iki PK araması. |
| Cross-site WebSocket hijacking | Kimlik cookie ile değil handshake `auth` gövdesiyle taşınıyor; başka site token'ı bilmeden bağlanamaz. |
| Token'ın log'a düşmesi | Middleware ve gateway token loglamaz; `query.token` kabul edilmez. |

---

## 5. WebSocket Sözleşmesi

### 5.1 Bağlantı yaşam döngüsü
```
Client (girişli)                         Server (/realtime)
  io('/realtime', { auth: { token } }) ──► middleware: verify JWT ── hata ──► connect_error "UNAUTHORIZED"
                                          ok: socket.data.user, join user:<id>, exp zamanlayıcısı
  ◄── connect
  board:join { boardId } (ack) ─────────► getRole → join board:<id> → yeniden kontrol → { ok: true }
  ack ok → board sorgusunu bir kez yenile (kaçırılan event'ler)
  ◄── card:moved / list:created / … (board:<id>, istek sahibi socket hariç)
  ◄── membership:added / membership:removed / board:deleted (user:<id>)
  board:leave { boardId } ──────────────► leave board:<id>
  …exp anı ─────────────────────────────── disconnect(true)  ("io server disconnect")
  refresh (gerekirse) → connect → rejoin → yenile
```

### 5.2 Client → server
| Event | Payload | Ack | Hatalar |
|---|---|---|---|
| `board:join` | `{ boardId }` | `JoinBoardAck` | `VALIDATION_FAILED` (gövde/UUID), `NOT_FOUND` (üye değil ya da pano yok), `CONFLICT` (daha yeni join/leave geldi), `INTERNAL_ERROR` |
| `board:leave` | `{ boardId }` | isteğe bağlı `{ ok: true }` | Geçersiz gövde yok sayılır |

Başka client→server event'i yoktur. Bilinmeyen event'ler handler'sız kalır ve yok sayılır.

### 5.3 Server → client event kataloğu
| Event | Room | `data` | Ne zaman |
|---|---|---|---|
| `board:updated` | board | `BoardInfoDto` | Pano başlığı/arka planı değişti |
| `member:added` | board | `MemberDto` | Kayıtlı e-postaya davet ya da davet kabulü yeni üyelik oluşturdu |
| `member:updated` | board | `MemberDto` | Rol değişti |
| `member:removed` | board | `{ userId }` | Üye çıkarıldı ya da ayrıldı (çıkan bu event'i almaz) |
| `list:created` | board | `ListDto` | Liste oluşturuldu |
| `list:updated` | board | `ListDto` | Ad değişti, arşivlendi ya da geri yüklendi (`archivedAt` söyler) |
| `list:moved` | board | `{ id, position }` | Liste taşındı |
| `list:deleted` | board | `{ id }` | Liste kalıcı silindi (kartları da) |
| `card:created` | board | `CardSummaryDto` | Kart oluşturuldu |
| `card:updated` | board | `{ card: CardSummaryDto, descriptionChanged }` | Başlık, açıklama, son tarih, tamamlandı, arşiv/geri yükleme |
| `card:moved` | board | `{ id, fromListId, toListId, position }` | Kart taşındı (liste içi ya da listeler arası) |
| `card:deleted` | board | `{ id, listId }` | Kart kalıcı silindi |
| `card:label-added` / `card:label-removed` | board | `{ cardId, labelId }` | Etiket karta eklendi/çıkarıldı (gerçekten değiştiyse) |
| `label:created` / `label:updated` | board | `LabelDto` | Etiket oluşturuldu/düzenlendi |
| `label:deleted` | board | `{ id }` | Etiket silindi (kart atamaları da) |
| `checklist:created` | board | `ChecklistDto` (madde yok) | Checklist eklendi |
| `checklist:updated` | board | `{ id, cardId, title }` | Checklist adı değişti |
| `checklist:moved` | board | `{ id, cardId, position }` | Checklist sırası değişti |
| `checklist:deleted` | board | `{ id, cardId, counts }` | Checklist silindi |
| `checklist-item:created` / `checklist-item:updated` | board | `{ item, cardId, counts }` | Madde eklendi / içerik ya da işaret değişti |
| `checklist-item:moved` | board | `{ id, cardId, fromChecklistId, toChecklistId, position }` | Madde taşındı |
| `checklist-item:deleted` | board | `{ id, checklistId, cardId, counts }` | Madde silindi |
| `position:rebalanced` | board | `PositionRebalancedData` | Aralık bitti, kardeşler yeniden dağıtıldı. Ana event'ten hemen önce gelir. |
| `membership:added` | user | `BoardSummaryDto` (alıcının rolüyle) | Alıcı bir panoya eklendi. Ayrıca pano oluşturanın diğer sekmeleri. |
| `membership:removed` | user | `{ boardId }` | Alıcı panodan çıkarıldı ya da başka sekmede ayrıldı |
| `board:deleted` | user (tüm üyeler) | `{ boardId }` | Pano silindi |

### 5.4 Payload gizliliği
**Asla yayınlanmayanlar**
- Kart açıklama metni. Yalnız `hasDescription` ve `descriptionChanged` gider; açık kart detayı metni `GET /cards/:id` ile, normal yetki kontrolünden geçerek çeker. Gerekçe: 10k karakterlik metni her üyeye itmemek, room üyeliğinin bir anlık bayatlığında içerik sızdırmamak, log/araç çıktılarında metin taşımamak.
- Davetler: token, `tokenHash`, `inviteUrl`, davet e-postası, davet id'si. `invitation:*` event'i yok. Kayıtsız e-postaya davet ve iptal hiçbir event üretmez.
- Başka bir kullanıcının `myRole`'ü. Board room'a giden pano bilgisi `BoardInfoDto`. `membership:added` yalnızca alıcının kendi rolünü taşır.
- Socket id'leri, `passwordHash`, refresh token, kullanıcıların başka panolardaki üyelikleri.

**Yayınlananlar ve gerekçe:** `MemberDto` e-posta içerir; aynı bilgi her üyeye `GET /boards/:id` ile zaten açık. Madde içerikleri (≤ 500) ve checklist adları kart detayında her üyeye açık. `actorId` kullanıcı id'sidir; üye listesinde zaten var.

**Uygulama kuralı:** Payload'lar her zaman mevcut mapper'larla üretilir (`toListDto`, `toCardSummary`, `toMemberDto`, `toLabelDto`, `toChecklistDto`, `toChecklistItemDto`, `toBoardSummary` + `myRole` atma). Prisma satırı asla doğrudan yayınlanmaz. e2e'deki sızıntı taraması (§8) bunu doğrular.

### 5.5 Mutation → event tablosu
`[rebalance]` = rebalance olduysa önce `position:rebalanced` (§4.8). "Hariç" = isteği yapan socket (`X-Socket-Id`, sahiplik kontrolüyle).

| Endpoint | Servis metodu | FE hook | Event(ler), sırayla | Room |
|---|---|---|---|---|
| `POST /boards` | `BoardsService.create` | `useCreateBoard` | `membership:added` | `user:<oluşturan>` |
| `PATCH /boards/:boardId` | `BoardsService.update` | `useUpdateBoard` | `board:updated` | board |
| `DELETE /boards/:boardId` | `BoardsService.remove` | `useDeleteBoard` | `board:deleted` → room boşaltılır | her üyenin `user:` room'u |
| `PATCH /boards/:boardId/members/:userId` | `MembersService.updateRole` | `useUpdateMemberRole` | `member:updated` | board |
| `DELETE /boards/:boardId/members/:userId` (başkası) | `MembersService.remove` | `useRemoveMember` | room'dan atma → `member:removed` → `membership:removed` | board, `user:<çıkarılan>` |
| `DELETE /boards/:boardId/members/:myId` (ayrılma) | `MembersService.remove` | `useLeaveBoard` | aynı | aynı |
| `POST /boards/:boardId/invitations` → `MEMBER_ADDED` | `InvitationsService.create` | `useCreateInvitation` | `member:added`, `membership:added` | board, `user:<eklenen>` |
| `POST /boards/:boardId/invitations` → `INVITATION_CREATED` | `InvitationsService.create` | `useCreateInvitation` | **yok** | – |
| `DELETE /boards/:boardId/invitations/:invitationId` | `InvitationsService.revoke` | `useRevokeInvitation` | **yok** | – |
| `POST /invitations/:token/accept` (yeni üyelik) | `InvitationsService.accept` | `useAcceptInvitation` | `member:added`, `membership:added` | board, `user:<kabul eden>` |
| `POST /boards/:boardId/lists` | `ListsService.create` | `useCreateList` | [rebalance] `list:created` | board |
| `PATCH /lists/:listId` | `ListsService.update` | `useRenameList`, `useArchiveList`, `useRestoreList` | [rebalance] `list:updated` | board |
| `POST /lists/:listId/move` | `ListsService.move` | `useMoveList` | [rebalance] `list:moved` | board |
| `DELETE /lists/:listId` | `ListsService.remove` | `useDeleteList` | `list:deleted` | board |
| `POST /lists/:listId/cards` | `CardsService.create` | `useCreateCard` | [rebalance] `card:created` | board |
| `PATCH /cards/:cardId` | `CardsService.update` | `useUpdateCard`, `useArchiveCard`, `useRestoreCard`, `useRestoreOpenCard` | [rebalance] `card:updated` | board |
| `POST /cards/:cardId/move` | `CardsService.move` | `useMoveCard` (DnD + "Kart işlemleri") | [rebalance] `card:moved` | board |
| `DELETE /cards/:cardId` | `CardsService.remove` | `useDeleteCard` | `card:deleted` | board |
| `POST /boards/:boardId/labels` | `LabelsService.create` | `useCreateLabel` | `label:created` | board |
| `PATCH /labels/:labelId` | `LabelsService.update` | `useUpdateLabel` | `label:updated` | board |
| `DELETE /labels/:labelId` | `LabelsService.remove` | `useDeleteLabel` | `label:deleted` | board |
| `PUT /cards/:cardId/labels/:labelId` | `LabelsService.assign` | `useToggleCardLabel` | `card:label-added` (yalnız yeni atamada) | board |
| `DELETE /cards/:cardId/labels/:labelId` | `LabelsService.unassign` | `useToggleCardLabel` | `card:label-removed` (yalnız silindiyse) | board |
| `POST /cards/:cardId/checklists` | `ChecklistsService.create` | `useCreateChecklist` | [rebalance] `checklist:created` | board |
| `PATCH /checklists/:checklistId` | `ChecklistsService.rename` | `useRenameChecklist` | `checklist:updated` | board |
| `POST /checklists/:checklistId/move` | `ChecklistsService.move` | `useMoveChecklist` | [rebalance] `checklist:moved` | board |
| `DELETE /checklists/:checklistId` | `ChecklistsService.remove` | `useDeleteChecklist` | `checklist:deleted` | board |
| `POST /checklists/:checklistId/items` | `ChecklistItemsService.create` | `useCreateChecklistItem` | [rebalance] `checklist-item:created` | board |
| `PATCH /checklist-items/:itemId` | `ChecklistItemsService.update` | `useUpdateChecklistItem` | `checklist-item:updated` | board |
| `POST /checklist-items/:itemId/move` | `ChecklistItemsService.move` | `useMoveChecklistItem` | [rebalance] `checklist-item:moved` | board |
| `DELETE /checklist-items/:itemId` | `ChecklistItemsService.remove` | `useDeleteChecklistItem` | `checklist-item:deleted` | board |

**Event üretmeyenler:** tüm `GET`'ler, `/auth/*`, `PATCH /users/me` (kapsam dışı), davet önizleme, kayıtsız e-postaya davet, iptal, başarısız (4xx/5xx) her istek.

---

## 6. Frontend

### 6.1 Bağımlılık
Yeni paket yok (`socket.io-client ^4.8.4` mevcut). Vite proxy'si hazır.

### 6.2 Klasörler ve bağımlılık yönü
```
frontend/src/
├── app/root-layout.tsx                       + useRealtimeConnection(status === 'authenticated'), useBoardListRealtime()
├── shared/
│   ├── lib/http.ts                           + X-Socket-Id başlığı; getAuthHandlers() export
│   ├── lib/realtime-client.ts                tek socket: start/stop/retry, joinBoard/leaveBoard, subscribe, hold, socketId; setSocketFactory (test)
│   ├── store/realtime-store.ts               status: 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'offline'
│   ├── hooks/use-realtime-connection.ts      enabled → realtime.start() / stop()
│   ├── hooks/use-realtime-events.ts          subscribe; en son listener ref'te, unmount'ta bırakır
│   ├── hooks/use-realtime-hold.ts            { hold(), release() }; release idempotent, unmount'ta otomatik
│   └── ui/realtime-status.tsx                bağlantı göstergesi (§6.11)
├── features/boards/
│   ├── lib/apply-board-list-event.ts         saf: BoardSummaryDto[] × message → BoardSummaryDto[]
│   ├── hooks/use-board-list-realtime.ts      boardKeys.list() cache'ini günceller
│   └── index.ts                              + useBoardListRealtime
├── features/board-detail/
│   ├── lib/apply-board-event.ts              saf: (detail, event, myUserId) → { detail, refetch }
│   ├── api/refresh-board.ts                  refreshUnlessMutating(queryClient, boardId, queryKey)
│   ├── hooks/use-board-realtime.ts           join/leave/rejoin, event uygulama, yönlendirme
│   ├── hooks/use-board-dnd.ts                + hold/release
│   ├── api/use-list-mutations.ts             useMoveList: + onMoved / onRollback seçenekleri (useMoveCard gibi)
│   ├── components/board-page.tsx             + useBoardRealtime(boardId)
│   ├── components/board-header.tsx           + <RealtimeStatus />
│   ├── components/board-canvas.tsx           "Kart işlemleri"nin kartı yok olunca kapanış + odak (§6.12)
│   └── index.ts                              + refreshUnlessMutating
├── features/card-detail/
│   ├── lib/apply-card-event.ts               saf: (card, event) → { card, gone, refetch }
│   ├── hooks/use-card-realtime.ts            açık kartın cache'i
│   ├── hooks/use-checklist-dnd.ts            + hold/release
│   ├── api/use-card-mutation.ts              + onOptimistic (useBoardMutation'daki gibi)
│   ├── store/card-detail-store.ts            + goneCardId, markGone(cardId); open/reset temizler
│   └── components/card-detail-route.tsx      + useCardRealtime; "silindi" görünümü
└── test/
    ├── fake-realtime.ts                      FakeSocket + fakeRealtime (connect, drop, serverEmit, joins, ackJoin)
    └── setup.ts                              beforeEach: setSocketFactory(fake); afterEach: realtime.stop() + reset
```
**Bağımlılık yönü:** `shared/*` hiçbir feature'ı import etmez. `realtime-client` token'ı `http.ts`'teki ortak `AuthHandlers`'tan okur (`installAuth` ikisini birden besler). `app → auth, boards (index)`. `board-detail → boards, auth (index)`. `card-detail → board-detail (index)` (mevcut yön). Board ve kart event'leri iki ayrı feature'da, ortak socket istemcisine ayrı ayrı abone olarak işlenir; feature'lar arası yeni bağımlılık doğmaz.

### 6.3 Socket istemcisi (`shared/lib/realtime-client.ts`)
```ts
export type RealtimeListener = (message: RealtimeMessage) => void;

export const realtime: {
  /** Connects (idempotent). The socket is created lazily with autoConnect: false. */
  start(): void;
  /** Disconnects, drops held events and joins; status 'idle'. Called on sign-out. */
  stop(): void;
  /** One more attempt after 'offline' (the indicator's button). */
  retry(): void;
  /** Only when connected; 5 s ack timeout → { ok: false, code: 'INTERNAL_ERROR' }. */
  joinBoard(boardId: string): Promise<JoinBoardAck>;
  /** Only when connected (never buffered for a later connection). */
  leaveBoard(boardId: string): void;
  subscribe(listener: RealtimeListener): () => void;
  /** Holds events until every hold is released; returns an idempotent release. */
  hold(): () => void;
  socketId(): string | null;
};
export function setSocketFactory(factory: SocketFactory | null): void; // tests
```
- Socket: `io(REALTIME_NAMESPACE, { path: REALTIME_PATH, transports: ['websocket'], autoConnect: false, auth: (cb) => cb({ token }), reconnectionDelay: 1_000, reconnectionDelayMax: 10_000 })`. `auth` her bağlantı denemesinde çağrılır. Gönderilen token `tokenUsed` olarak saklanır.
- Event'ler `socket.onAny(name, envelope)` ile alınır. `isBoardEventName(name) || isUserEventName(name)` değilse yok sayılır. Mesaj `{ type: name, ...envelope }` olur. Hold varsa tampona, yoksa sırayla her listener'a gider. Her listener `try/catch` içinde çağrılır; biri hata verirse diğerleri yine alır.
- **Durumlar** (`useRealtimeStore`):

| Socket olayı | Durum / tepki |
|---|---|
| `start()` ilk kez | `connecting` |
| `connect` | `connected`, kimlik hatası sayacı sıfırlanır |
| `disconnect` `io client disconnect` | `idle` (`stop()` çağrıldı) |
| `disconnect` `io server disconnect` (token süresi doldu) | `renew()` |
| `disconnect` diğer (ağ, sunucu yeniden başladı) | `reconnecting`; socket.io kendisi dener |
| `connect_error` mesajı `UNAUTHORIZED` | `renew()` |
| `connect_error` diğer | `reconnecting` (socket.io denemeye devam eder) |

- **`renew()`**: Sayaç artar; arka arkaya 2'yi geçerse `offline`. Store'daki token `tokenUsed`'dan farklıysa (HTTP katmanı zaten yeniledi) refresh'e gitmeden `socket.connect()`. Aynıysa `await refreshAccessToken()` (`session.ts`'teki tek uçuşlu refresh; paralel HTTP refresh'leriyle paylaşılır). Sonuç `null` ise `offline`: oturum bitmiş, auth store temizlenmiştir ve `stop()` sign-out ile gelir. Token geldiyse `socket.connect()`.
- Proaktif yenileme yok. Boşta duran bir panoda her 15 dk'da bir refresh + yeniden bağlanma + tek board refetch olur (§9 R6).
- **Hold**: `hold()` sayacı artırır. Tüm hold'lar bırakılınca tampon aynı sırayla ve senkron boşaltılır. Bir hold 2 dk içinde bırakılmazsa kendiliğinden bırakılır (dev'de `console.warn`). Unutulan bir release realtime'ı kalıcı dondurmasın diye bir güvenlik ağı.

### 6.4 `X-Socket-Id` (`shared/lib/http.ts`)
`skipAuth` olmayan her istekte `realtime.socketId()` null değilse `X-Socket-Id` başlığı eklenir. Bağlantı yoksa başlık gitmez; o istekten gelen yankı idempotent uygulanır (§6.10). `getAuthHandlers()` export edilir; `realtime-client` aynı token kaynağını kullanır.

### 6.5 Bağlantı ve panolar listesi
- **`useRealtimeConnection(enabled)`** (`app/root-layout.tsx`'te `useAuthStatus() === 'authenticated'` ile): `enabled` true olunca `realtime.start()`, false olunca `stop()`. Böylece çıkışta socket kapanır, girişte açılır. Davet sayfası dahil girişli her sayfada bağlıdır (`user:` event'leri için).
- **`useBoardListRealtime()`** (`features/boards`, root layout'ta): `user:` event'leri `applyBoardListEvent` ile `boardKeys.list()` cache'ine uygulanır (cache yoksa dokunulmaz):

| Event | Etki |
|---|---|
| `membership:added` | Pano listede yoksa başa eklenir (sunucu `updatedAt desc`). Varsa değiştirilir. |
| `membership:removed`, `board:deleted` | Pano listeden çıkar. |

  Bu hook toast göstermez. Açık panodan atılma `useBoardRealtime`'ın işi (§6.6).

### 6.6 `useBoardRealtime(boardId)` (`board-detail`, `BoardPage`'in en üstünde)
**Join / rejoin**
```
effect [boardId, status === 'connected']:
  connected değilse çık
  realtime.joinBoard(boardId).then(ack =>
    aktif değil ya da ack.code === 'CONFLICT' → yok say
    ack.ok → refreshUnlessMutating(board detayı)   // ilk açılış ve yeniden bağlanma: kaçırılan event'ler
    NOT_FOUND → bir şey yapma (board GET'i 404 → "Pano bulunamadı")
  )
  cleanup: aktif = false; realtime.leaveBoard(boardId)
```
`refreshUnlessMutating(queryClient, boardId, key)`: o panoda `boardMutationKey` ile çalışan mutation varsa **hiçbir şey yapmaz**, çünkü son mutation'ın `onSettled`'ı zaten yeniler ve event commit'ten sonra geldiği için o refetch event'i içerir. Yoksa `invalidateQueries({ queryKey: key })`. Board detayının prefix'i kart detayı ve arşiv sorgularını da kapsar; yalnız aktif olanlar yeniden çekilir.

**Event işleme** (`useRealtimeEvents`; `message.boardId !== boardId` olanlar yok sayılır)
1. **Panodan atılma**: `membership:removed`, `board:deleted`, ya da `member:removed` + `data.userId === me`:
   - Pano başlığı cache'ten okunur, `navigate('/boards', { replace: true })`, sonra `removeQueries(boardKeys.detail(boardId))` ve `removeQueries(boardInvitationKeys.list(boardId))` (`useLeaveBoard` ile aynı sıra).
   - Toast: `board:deleted` → "“Yol haritası” panosu silindi." · `actorId === me` (başka sekmede ayrıldı) → "“Yol haritası” panosundan ayrıldın." · diğer → "“Yol haritası” panosundan çıkarıldın."
2. **Board event'leri**: `fetching = isFetching({ queryKey: detailKey, exact: true }) > 0` → `setQueryData(detailKey, d => d && (result = applyBoardEvent(d, event, me)).detail)` → `result.refetch || fetching` ise `refreshUnlessMutating`. Gerekçe (`fetching`): yolda olan bir GET, event'ten önceki DB anını okumuş olabilir. Cevabı geldiğinde event'i ezerdi; invalidate o GET'i iptal edip yenisini başlatır.
3. **Yan cache'ler**
   - `board:updated` → `boardKeys.list()`'teki özet yamalanır (`myRole` korunur).
   - `member:added` → `boardInvitationKeys.list(boardId)` invalidate (ADMIN'in açık bekleyen davet listesi).
   - `member:updated` ve `userId === me` → board'un `myRole`'ü (reducer yapar) ve `boardKeys.list()`'teki `myRole`. Yeni rol ADMIN altıysa `removeQueries(boardInvitationKeys.list(boardId))`.
   - `list:updated`, `list:deleted`, `card:updated`, `card:deleted`, `label:deleted` → `archivedListsKey` ve `archivedCardsKey` exact invalidate. Arşiv diyaloğu kapalıysa sadece bayat işaretlenir.

### 6.7 `applyBoardEvent` (`board-detail/lib/apply-board-event.ts`)
```ts
export interface AppliedBoardEvent {
  detail: BoardDetailDto;
  /** The cache cannot follow this event alone (e.g. a restored list's cards); refetch the board. */
  refetch: boolean;
}
export function applyBoardEvent(detail: BoardDetailDto, event: BoardEvent, myUserId: string): AppliedBoardEvent;
```
Saf; `board-cache.ts` yardımcılarını kullanır. `switch (event.type)` `never` ile tamamlanır: yeni bir event adı eklendiğinde derleme hatası verir. **İdempotent:** aynı event iki kez uygulanırsa sonuç bir kez uygulanmışla eşittir (`toEqual`). Referans kararlılığı ayrıca TanStack Query'nin `setQueryData`'daki structural sharing'iyle gelir: eşit veri eski referansı korur. Bu, DnD'deki `dropped.cards === detail.cards` kontrolü için önemli.

| Event | Board cache | `refetch` |
|---|---|---|
| `board:updated` | `board` alanları (title, background, updatedAt); `myRole` korunur | – |
| `member:added` / `member:updated` | `upsertMember`; `userId === me` ise `board.myRole = role` | – |
| `member:removed` | `removeMember` (kendisi ise §6.6/1 zaten yakaladı) | – |
| `list:created` | `archivedAt` null ise `upsertList` | – |
| `list:updated` | Arşivlendiyse liste **ve kartları** çıkar. Değilse `upsertList`. | Liste cache'te yoktu ve aktifse (geri yükleme: kartları cache'te yok) |
| `list:moved` | `patchList(position)` | Liste yoksa |
| `list:deleted` | Liste ve kartları çıkar | – |
| `card:created` | Liste cache'te ve kart arşivsizse `upsertCard` | Liste cache'te yoksa |
| `card:updated` | `archivedAt` doluysa `removeCard`. Değilse `upsertCard` (özetin tamamı). | Liste cache'te yoksa |
| `card:moved` | `patchCard({ listId: toListId, position })` | Kart ya da hedef liste yoksa |
| `card:deleted` | `removeCard` | – |
| `card:label-added` / `-removed` | `labelIds`'e yoksa sona ekle / çıkar | – |
| `label:created` / `label:updated` | `upsertLabel` | – |
| `label:deleted` | `removeLabel` (kartların `labelIds`'inden de) | – |
| `checklist:deleted`, `checklist-item:created/updated/deleted` | `patchCard(cardId, counts)` (kart yoksa no-op) | – |
| `checklist:created/updated/moved`, `checklist-item:moved` | Değişmez (sayaç değişmiyor) | – |
| `position:rebalanced` `list` | Cache'teki listelerin `position`'ı | Listelenen bir id cache'te yoksa |
| `position:rebalanced` `card` | `listId`'deki kartların `position`'ı | Listelenen bir kart cache'te yoksa |
| `position:rebalanced` `checklist` / `checklist-item` | Değişmez | – |

### 6.8 Açık kart detayı (`card-detail`)
**`useCardRealtime(boardId, cardId)`** (`CardDetailRoute` içinde). Yalnız **açık** kartın cache'i canlı tutulur. Kapalı kartların cache'leri yeniden açılışta `refetchOnMount: 'always'` ile tazelenir (mevcut davranış).
- `message.boardId === boardId` olan board event'leri için: `setQueryData(cardKeys.detail(boardId, cardId), c => c && (r = applyCardEvent(c, event)).card)`.
- `r.gone` → `useCardDetailStore.markGone(cardId)`.
- `r.refetch` ya da kart sorgusu o an çekiliyorsa → `refreshUnlessMutating(queryClient, boardId, cardKey)` (exact).

**`applyCardEvent(card, event): { card, gone, refetch }`** (saf, idempotent; `card-detail-cache.ts` yardımcılarıyla)
| Event (bu karta ait olanlar) | Etki |
|---|---|
| `card:updated` (`card.id`) | Özet alanları birleştirilir (title, dueDate, dueComplete, archivedAt, labelIds, hasDescription, sayaçlar, listId, position). `descriptionChanged` + `hasDescription: false` → `description = null`. `descriptionChanged` + `hasDescription: true` → `refetch`. |
| `card:moved` | `listId`, `position` |
| `card:deleted` (`id`) ya da `list:deleted` (`card.listId`) | `gone` |
| `card:label-added` / `-removed` | `setLabelAssigned` |
| `label:deleted` | `labelIds`'ten çıkar |
| `checklist:created` | `upsertChecklist` |
| `checklist:updated` / `checklist:moved` | `patchChecklist(title / position)` |
| `checklist:deleted` | `removeChecklist` |
| `checklist-item:created` / `updated` | `upsertItem`. Checklist yoksa `refetch`. |
| `checklist-item:moved` | `moveItem`. Madde yoksa `refetch`. |
| `checklist-item:deleted` | `removeItem` |
| `position:rebalanced` `checklist` (`cardId`) / `checklist-item` (`cardId`, `checklistId`) | İlgili `position`'lar |
| Diğerleri / başka kart | Aynı referans |

Kart detayı sayaçları mevcut `withCounters` ile checklist'lerden yeniden hesaplanır. Kutucuk sayaçları board reducer'ında event'teki `counts`'tan gelir. Cache tutarlıysa ikisi aynıdır.

**"Silindi" görünümü:** `goneCardId === cardId` iken `CardDetailRoute` içerik yerine şunu gösterir: "Bu kart başka biri tarafından silindi." (`role="alert"`, bir kez) + "Panoya dön" (mevcut `MissingCard` düzeni). Yayın değil fetch'ten gelen 404 mevcut "Kart bulunamadı. Silinmiş olabilir." metnini korur. `open`/`reset` `goneCardId`'yi temizler.

**Taslaklar korunur:** Açıklama editörü (`useDescriptionEditor`) ve `InlineEdit` taslakları yerel state'te; cache değişince ezilmez. Kullanıcı kaydederse son yazım kazanır (PLAN kabulü). Uzaktan arşivlenen kartta mevcut `ArchivedCardBanner` görünür.

### 6.9 Sürükleme sırasında event'ler (hold)
| Yer | Hold başlar | Bırakılır |
|---|---|---|
| `useBoardDnd`, kart | `onDragStart` | `useMoveCard` `onMoved` (iyimser değişiklik cache'te) ya da `onRollback`. Taşıma yoksa (`samePlace`, `over` yok) `dropCard` içinde hemen. `onDragCancel`. Unmount. |
| `useBoardDnd`, liste | `onDragStart` | `useMoveList`'e eklenen `onMoved` / `onRollback`. Anchor yoksa hemen. `onDragCancel`. Unmount. |
| `useChecklistDnd`, madde | `onDragStart` | `useMoveChecklistItem` için `useCardMutation`'a eklenen `onOptimistic` ya da `onRollback`. Taşıma yoksa hemen. İptal. Unmount. |

Neden bırakma iyimser güncellemeden **sonra**: `onDragEnd`'de hemen bırakılsaydı, bekleyen event'ler `onMutate`'in `await cancelQueries`'inden önce cache'e girerdi. `detail.cards` değişir, `dropped` gösterimi düşer ve bırakılan kart bir kare eski yerine zıplardı (Faz 4'te önlenen sorun). Bekletme süresince dnd-kit yalnız kendi `dragColumns` kopyasını görür. Bırakılınca event'ler sırayla uygulanır. Eski anchor kullanılmışsa sunucu 409 verir ve mevcut "Pano yenilendi" yolu çalışır.

### 6.10 İyimser mutation'larla etkileşim
1. **Refetch zamanı:** Event yüzünden yapılan her yenileme `refreshUnlessMutating` üzerinden gider. Mutation sürerken başlayan bir refetch iyimser durumu ezerdi; son mutation'ın `onSettled` refetch'i zaten event'i içerir.
2. **Rollback anlık görüntüsü:** Başarısız bir `useBoardMutation` `previous` snapshot'ını geri yazar ve arada uygulanmış uzak event'leri de geri alır. Hemen ardından (son mutation ise) gelen refetch onları geri getirir. Kısa bir geri dönüş kabul edilir (§9 R4).
3. **Kart detayı claim'leri:** Uzak event, bekleyen yerel bir değişikliğin alanını geçici olarak ezebilir. Yerel cevap claim'i hâlâ tutuyorsa yazılır. Sonda refetch sunucu gerçeğini getirir.
4. **Yankı:** `X-Socket-Id` gitmediyse (istek bağlantıdan önce atıldı) kendi event'in geri gelir. Reducer'lar idempotent, structural sharing referansı korur, görünür bir etki olmaz.
5. **Sıra:** `position:rebalanced` ve ana event ayrı mesajlardır. Nadiren arada bir render olabilir (taşınan kart bir kare yanlış sırada). Rebalance seyrek olduğu için kabul (§9 R1).

### 6.11 Bağlantı durumu göstergesi
**Gerekli mi? Evet, minimal.** Kopuk bağlantıda kullanıcı kendi yazımlarını yapmaya devam eder (HTTP çalışır) ama başkalarınınkini görmez. Sessiz bayatlık, iş birliği uygulamasında yanıltıcı olur. Gösterge yalnız sorun varken görünür; normalde hiçbir şey çizilmez.
- `RealtimeStatus` `BoardHeader`'ın sonunda yer alır. Yalnız pano sayfasında; panolar sayfası anlık güncellemeye daha az bağımlı.
- `reconnecting` durumu **3 sn'den uzun** sürerse: ikon + "Bağlantı koptu. Yeniden bağlanılıyor…" Kısa kopmalarda ve ilk `connecting`'de görünmez (titreme olmasın).
- `offline`: "Canlı güncellemeler kapalı." + `Button` (`on-board`, küçük) "Yeniden bağlan" → `realtime.retry()`.
- `connected`'a dönünce kaybolur. Bağlantı geri gelince rejoin + refetch zaten yapılır.
- Erişilebilirlik: kalıcı bir `role="status"` kapsayıcısı (içerik değişir, eleman yeniden mount olmaz). İkon `aria-hidden`.
- Stil (`ui-designer`): `bg-surface` üstünde `text-fg-muted` pill; `offline`'da `text-warning`. Yeni token beklenmiyor. Pano arka planı renkleri üzerinde iki temada kontrast kontrol edilir. 320 px'te başlık satırı sarar. `prefers-reduced-motion`'da dönen ikon durur.

### 6.12 Erişilebilirlik
- Uzak değişiklikler tek tek **duyurulmaz** (gürültü). İstisnalar: panodan atılma/silinme toast'ları, kart detayındaki "silindi" uyarısı, bağlantı göstergesi.
- Klavyeyle sürükleme sırasında event'ler beklediği için dnd-kit duyuruları ve odak bozulmaz (§6.9).
- "Kart işlemleri" diyaloğunun kartı uzaktan silinir/arşivlenirse (`actionsCard` null olur) diyalog kapanır, odak o listenin "Kart ekle" düğmesine gider (`focusAddCard`) ve `role="status"` ile "Kart başka biri tarafından kaldırıldı." duyurulur.
- Odaktaki bir kart kutucuğu uzaktan silinir/taşınırsa odak kaybolabilir. MVP'de kabul edildi; Faz 8 erişilebilirlik turunda ele alınacak (§9 R8).

### 6.13 Test altyapısı
- `src/test/fake-realtime.ts`: `FakeSocket` istemcinin kullandığı alt kümeyi uygular (`on/off/onAny/emit` + ack, `timeout`, `connect/disconnect`, `id`, `connected`, `active`). `fakeRealtime` yardımcıları: `connect()`, `drop(reason)`, `rejectHandshake(message)`, `serverEmit(type, data, { boardId, actorId })`, `joins` / `leaves` dizileri, `ackJoin(fn)` (varsayılan `{ ok: true }`).
- `setup.ts`: `beforeEach(() => setSocketFactory(createFakeSocket))`, `afterEach(() => { realtime.stop(); resetRealtimeStore(); })`.
- **Fake varsayılan olarak bağlanmaz** (`connecting`'de kalır). Mevcut testler join yapmaz, ek GET atmaz, davranışları değişmez. Realtime testleri `fakeRealtime.connect()` çağırır.
- Hiçbir test gerçek ağa çıkmaz. MSW websocket'e karışmaz.

---

## 7. Görev Dağılımı (uygulama sırası, commit boyutunda)

Önce backend, sonra frontend. Her adım kendi testleriyle commit'lenir (Conventional Commits, İngilizce). **Her adımın ortak "bitti" ölçütü:** ilgili workspace'te `npm run build` + `npm run typecheck` + `npm run lint` temiz. Adımın yeni testleri ve tüm mevcut testler geçiyor (`skip`/`only` yok).

### 1. `backend-nest` — B1 `feat(contracts): add realtime event contracts`
- §3.1 `realtime-events.ts`, `index.ts` export'u.
- Test `realtime-events.spec.ts`: `BOARD_EVENT_NAMES`/`USER_EVENT_NAMES` tekrarsız ve kesişmiyor; her ad `^[a-z-]+:[a-z-]+$`; `isBoardEventName('card:moved')` ✓, `('toString')` ✗, `('membership:added')` ✗; `isUserEventName` simetrik.
- **Bitti:** contracts build; backend ve frontend typecheck geçer.

### 2. `backend-nest` — B2 `feat(realtime): add the socket gateway with token auth and board rooms`
- Bağımlılıklar (§4.1), `RealtimeIoAdapter`, `configureApp`, `RealtimeModule`, gateway, middleware, `RealtimeService` (yayın metotları dahil, henüz çağıran yok), `rooms.ts`, `event-origin.ts` (`parseSocketId`, `@CurrentEventOrigin`), `TokenService.verifyAccessTokenWithExpiry`, `JwtAuthGuard` ws dalı, `@SkipThrottle`. Test altyapısı: `createTestApp({ listen })`, `test/utils/realtime.ts`.
- Unit: `ws-auth.middleware.spec.ts`, `realtime.gateway.spec.ts`, `realtime.service.spec.ts`, `event-origin.spec.ts`, `jwt-auth.guard.spec.ts` (güncellenir), `token.service.spec.ts` (+ exp).
- E2e: `realtime.e2e-spec.ts` "Bağlantı" ve "Join" bölümleri (§8).
- **Bitti:** guard varsayımları (§4.10) e2e ile doğrulanmış; tüm backend testleri yeşil.

### 3. `backend-nest` — B3 `feat(realtime): broadcast list and card changes`
- `placeAndRebalance` → `Placement`, `rebalanceEvents`, `ListsService`/`CardsService` + controller'lar (origin, silmede board kapsamı).
- Unit: `placement.spec.ts` / `place-and-rebalance` dönüşü; `board-events.spec.ts`; `lists.service.spec.ts` ve `cards.service.spec.ts` yayın dalları (§8).
- E2e: `realtime-events.e2e-spec.ts` liste ve kart satırları, rebalance, sıra testi; `realtime.e2e-spec.ts` "Yayın ve hariç tutma".
- **Bitti:** mevcut `lists`/`cards` e2e'leri değişmeden geçer.

### 4. `backend-nest` — B4 `feat(realtime): broadcast labels and checklists`
- `LabelsService`, `ChecklistsService`, `ChecklistItemsService` (`update`'e kart kilidi), `countChecklistItems`.
- Unit + e2e: ilgili tablo satırları, sayaçlar, açıklama sızıntısı yok, no-op etiket ataması event'siz.
- **Bitti:** mevcut `checklists`/`card-detail`/`labels` e2e'leri (eşzamanlılık testleri dahil) geçer.

### 5. `backend-nest` — B5 `feat(realtime): broadcast board and membership changes`
- `BoardsService` (`create`, `update`, `remove` tx), `MembersService` (§4.9 sırası), `InvitationsService` (`create`, `accept` çıktıları).
- Unit + e2e: "Üyelik" bölümü, davet satırları, pano silme, sızıntı taraması.
- **Bitti:** `npm test -w backend` + `npm run test:e2e -w backend` tamamen yeşil.

### 6. `tester` — backend doğrulama turu
- Backend unit + e2e iki kez arka arkaya çalıştırılır (zamanlama/sıra testleri kararsız mı). §5.5'teki her satırın e2e tablo testinde karşılığı olduğu kontrol edilir. Eksik senaryolar eklenir.
- **Bitti:** iki koşu da yeşil; tablo eksiksiz.

### 7. `frontend-react` — F1 `feat(realtime): add the socket client and connection lifecycle`
- `realtime-client.ts`, `realtime-store.ts`, `use-realtime-connection.ts`, `use-realtime-events.ts`, `use-realtime-hold.ts`, `http.ts` (`X-Socket-Id`, `getAuthHandlers`), `root-layout.tsx`, `test/fake-realtime.ts`, `setup.ts`.
- Testler: `realtime-client.test.ts`, `http.test.ts` eklemeleri (§8).
- **Bitti:** tüm mevcut FE testleri değişmeden geçer (fake bağlanmıyor).

### 8. `frontend-react` — F2 `feat(boards): keep the board list in sync with memberships`
- `apply-board-list-event.ts`, `use-board-list-realtime.ts`, index export'u, root layout.
- Testler: `apply-board-list-event.test.ts`, `use-board-list-realtime.test.tsx`.

### 9. `frontend-react` — F3 `feat(board-detail): apply board events from other users`
- `apply-board-event.ts`, `refresh-board.ts`, `use-board-realtime.ts`, `BoardPage`, DnD hold (`use-board-dnd.ts`, `useMoveList` seçenekleri), "Kart işlemleri" kapanışı.
- Testler: `apply-board-event.test.ts`, `use-board-realtime.test.tsx`, `board-cards.test.tsx`'e sürükleme + event senaryosu.
- **Bitti:** `board-canvas`/`board-cards`/`members-dialog` testleri değişmeden geçer.

### 10. `frontend-react` — F4 `feat(card-detail): live updates in the open card`
- `apply-card-event.ts`, `use-card-realtime.ts`, `card-detail-store` (`goneCardId`), `CardDetailRoute`, `useCardMutation.onOptimistic`, checklist DnD hold.
- Testler: `apply-card-event.test.ts`, `use-card-realtime.test.tsx`.

### 11. `frontend-react` + `ui-designer` — F5 `feat(realtime): show the connection status on the board`
- `realtime-status.tsx`, `BoardHeader`.
- Testler: `realtime-status.test.tsx`. `ui-designer`: iki tema × birkaç pano arka planı kontrastı, 320 px, odak halkası, reduced motion.
- **Bitti:** `npm test -w frontend` + `npm run build -w frontend` yeşil.

### 12. `tester` — F6 `test(e2e): cover realtime collaboration`
- `frontend/e2e/realtime.spec.ts` (§8 Playwright), `e2e/helpers.ts`'e gerekirse `openBoardAs(context, …)`.
- **Bitti:** `npm run test:e2e -w frontend` tamamen yeşil (yeni ve eski spec'ler; koşular arasında ~1 dk, PLAN notu). Tam `npm test` ve backend e2e son kez yeşil.

### 13. `code-reviewer` — faz incelemesi
- Odak: (1) her `realtime.*` çağrısı commit'ten sonra mı (`grep -n "realtime\." backend/src` ile tx callback'leri taranır); (2) payload'larda §5.4 ihlali; (3) `X-Socket-Id` sahiplik kontrolü; (4) join'deki seq ve yeniden kontrol; (5) token'ın log'a düşmemesi; (6) FE'de feature sınırları (`shared` feature import etmiyor); (7) hold'ların her yolda bırakılması; (8) reducer'larda `never` tamlığı; (9) `dangerouslySetInnerHTML` yok.
- **Bitti:** bulgular düzeltilmiş ya da gerekçesiyle kabul edilmiş.

**Faz sonu:** `docs/PLAN.md` "İlerleme" tablosunda Faz 7 satırı (sapmalar: §10) ve PLAN §5'e "ayrıntılı ve güncel sözleşme: `docs/phase-7-realtime.md`" notu. "Trello Clone — Geliştirme" panosunda Faz 7 kartının "Bitti" checklist'i (§12). CLAUDE.md "Sürümler" satırına socket.io paketleri eklenir (kullanıcı onayıyla).

---

## 8. Test Planı

### Backend unit (Vitest, Prisma ve namespace mock'u)
- **`ws-auth.middleware.spec.ts`:** `auth` yok / `token` sayı / boş string → `UNAUTHORIZED` (+ `data.code`); `verify` hata → aynı; başarı → `socket.data.user`, `expiresAt`, `roomSeq === 0`, `next()` argümansız; logger'a token geçmiyor (spy).
- **`realtime.gateway.spec.ts`:** bağlantıda `user:<id>` join + zamanlayıcı (fake timer: `expiresAt`'te `disconnect(true)`); disconnect zamanlayıcıyı temizler; join: geçersiz gövde → `VALIDATION_FAILED`, `getRole` null → `NOT_FOUND` ve room'a girilmez, seq değişti → `CONFLICT`, başarı → diğer `board:*` room'larından çıkar ve hedefe girer, yeniden kontrol null → leave + `NOT_FOUND`, `getRole` throw → `INTERNAL_ERROR` ve throw yok; leave seq'i artırır.
- **`realtime.service.spec.ts`:** `attach` öncesi no-op; `toBoard` event'leri dizi sırasıyla ve envelope'la gönderir; istek sahibinin socket'i hariç, başkasının socket id'si hariç **değil**, bilinmeyen id hariç değil; `toUsers` room listesine tek emit; emit throw → log, rethrow yok; `removeUserFromBoard` / `closeBoardRoom` doğru room'larla.
- **`event-origin.spec.ts`:** `parseSocketId`: 20 karakter id ✓; boş, 65 karakter, boşluk, `/`, dizi, `undefined` → null.
- **`jwt-auth.guard.spec.ts`:** ws + `data.user` → true; ws, user yok → false; rpc → false; http davranışı aynı.
- **`token.service.spec.ts`:** `verifyAccessTokenWithExpiry` `exp * 1000` döndürür; `exp` yoksa 401.
- **`placement.spec.ts` / `board-events.spec.ts`:** `placeAndRebalance` `Placement` döndürür; `rebalanceEvents(null)` → `[]`; dolu → tek `position:rebalanced`, target alanları + positions.
- **Servis spec'leri** (lists, cards, labels, checklists, checklist-items, boards, members, invitations): her yazım metodu için (a) `$transaction` çözülünce `toBoard`/`toUsers` beklenen event'lerle **bir kez** çağrılır; (b) tx callback'i bittiği anda henüz çağrılmamıştır (mock tx, callback'i çalıştırdıktan sonra spy sayısını kaydeder); (c) tx reject → hiç çağrılmaz; (d) rebalance varsa `position:rebalanced` dizide önce. Ek: `card:updated.descriptionChanged` yalnız `description` gönderildiğinde true ve payload'da `description` alanı yok; `assign` `count 0` → event yok; `ChecklistItemsService.update` tx içinde önce `$queryRaw` (kart kilidi), sonra sayım; `InvitationsService.create` `INVITATION_CREATED` → event yok, `MEMBER_ADDED` → `member:added` + `membership:added` (`myRole` = davet rolü); `accept` idempotent yol → event yok; `MembersService.remove` sırası `removeUserFromBoard → toBoard → toUsers`; `BoardsService.remove` tx'te ilk çağrı kilit, `toUsers` silme anındaki üye id'leriyle, sonra `closeBoardRoom`.

### Backend e2e (`socket.io-client`, `createTestApp({ listen: true })`)
**Teknik: sentinel event.** "X almaz" iddiaları süre beklemesiyle değil sırayla kanıtlanır. Socket.io aynı bağlantıda sırayı koruduğu için, eylemden sonra X'in kesin alacağı ikinci bir "nöbetçi" event tetiklenir (ör. başka biri X'in panosundaki listenin adını değiştirir ya da X'i başka panoya ekler). X'in sıradaki ilk event'i nöbetçiyse, ilk event ona hiç gelmemiştir. Yardımcılar: `recordEvents(socket)` (`onAny` ile sıralı kayıt), `expectNext(rec, type, timeoutMs = 2000)`, `expectNextAfterSentinel(rec, sentinelType)`. Tüm socket'ler `afterEach`'te kapatılır. `reconnection: false`, `forceNew: true`, `transports: ['websocket']`.

**`realtime.e2e-spec.ts`**

*Bağlantı*
1. Token yok / bozuk / yanlış imza / süresi dolmuş → `connect_error.message === 'UNAUTHORIZED'`, `connected === false`. `query: { token }` ile geçerli token → yine reddedilir.
2. Geçerli token → bağlanır. Başka bir kullanıcı onu bir panoya eklediğinde (`POST …/invitations`, kayıtlı e-posta) `membership:added` gelir: `user:` room'una otomatik girdiği kanıtlanır.
3. `expiresIn: 1` ile imzalanmış token → bağlanır → ≤ 3 sn içinde `disconnect` (`io server disconnect`).

*Join*
4. Üye → `{ ok: true }`. Üye değil → `NOT_FOUND`. Olmayan UUID → `NOT_FOUND`. `'abc'`, gövde yok, `{ boardId: 1 }` → `VALIDATION_FAILED`.
5. Join'i reddedilen yabancı, o panodaki yazımın event'ini almaz (sentinel: yabancının user room'una event).
6. Pano 1'e join → pano 2'ye join → pano 1 yazımı gelmez, pano 2 yazımı gelir (sentinel).
7. `board:leave` → yazım gelmez (sentinel).

*Yayın ve hariç tutma*
8. A'nın iki socket'i (a1, a2), B (b1), başka panoda C (c1). A, `X-Socket-Id: a1` ile kart taşır → b1 ve a2 `card:moved`'u yanıt gövdesine eşit alır (`fromListId` dahil); a1 almaz (sentinel); c1 almaz (sentinel).
9. `X-Socket-Id` yok → a1 de alır. `X-Socket-Id: <b1>` (başkasının socket'i) → b1 yine alır. `X-Socket-Id: 'x'.repeat(500)` ve `'a b'` → istek 2xx, event herkese.
10. Başarısız istekler (400 validasyon, 403 MEMBER liste silme, 404 başka panonun kartı, 409 bayat anchor) → hiçbir event (sentinel).

*Üyelik*
11. OWNER, B'yi çıkarır → b1 `membership:removed { boardId }` alır, `member:removed` almaz. A'nın diğer socket'i `member:removed { userId: B }` alır. Sonraki pano yazımı b1'e gelmez (sentinel: b1'in user room'una event). b1 yeniden join → `NOT_FOUND`.
12. B, `X-Socket-Id: b1` ile ayrılır → b2 `membership:removed` alır, b1 almaz.
13. Rol değişikliği → `member:updated` (yeni rol, `MemberDto` anahtarları tam).
14. Kayıtlı e-postaya davet → board'a `member:added`; davetlinin socket'ine `membership:added` (`myRole` = davet edilen rol). Kayıtsız e-postaya davet ve iptal → board room'a event yok (sentinel).
15. Davet kabulü → `member:added` + `membership:added`. Aynı token'la ikinci kabul → event yok (sentinel).
16. Pano silme → panoya hiç join etmemiş üyenin socket'i dahil tüm üyeler `board:deleted { boardId }` alır; silen socket almaz; silenin ikinci socket'i alır.
17. Pano oluşturma → oluşturanın ikinci socket'i `membership:added` alır; istek sahibi socket almaz.

**`realtime-events.e2e-spec.ts`**
18. **Tablo güdümlü:** §5.5'teki her satır için A (`X-Socket-Id: a1`) isteği yapar, B beklenen event'leri sırayla alır. Payload yanıt gövdesine ya da DB durumuna eşit (`counts` = DB sayımı). `Object.keys(data)` tipteki anahtar kümesine eşit (fazla alan yok).
19. **Rebalance:** Prisma ile kart pozisyonları `[1, 1 + 1e-7, 1 + 2e-7]` yapılır → ikisinin arasına taşıma → B önce `position:rebalanced { entity: 'card', listId, positions }`, sonra `card:moved` alır; pozisyonlar DB'yle aynı. Liste, checklist ve madde için birer kısa varyant.
20. **Sızıntı taraması:** 18'de toplanan tüm envelope'ların `JSON.stringify`'ı şunları içermez: açıklama metni (`'GİZLİ-AÇIKLAMA-…'`), `tokenHash`, `inviteUrl`, davet token'ı, `passwordHash`, herhangi bir socket id'si; `myRole` yalnız `membership:added`'da.
21. **Sıra:** A iki listede 20 paralel kart taşıması yapar. B event'leri basit bir reducer'la (`id → { listId, position }` + rebalance) uygular. Sonuç sırası `GET /boards/:id` sırasına eşit. 5 tekrar.
22. **Sayaçlar:** madde ekle / işaretle / sil / checklist sil → her event'in `counts`'u DB'ye eşit. 10 paralel işaretleme → son event'in `counts`'u DB'ye eşit (kart kilidi sayesinde).

### Frontend unit/integration (Vitest + RTL + MSW + fake socket)
- **`realtime-client.test.ts`:** `start` → `connecting` → `connect` → `connected`; `stop` → `idle` ve sonraki event'ler listener'a gitmez. `io server disconnect`: store'daki token değişmişse refresh **çağrılmadan** `connect`; aynıysa refresh (MSW `/auth/refresh` sayacı 1) + `connect` (yeni token `auth`'ta). `connect_error UNAUTHORIZED` üst üste 3 kez → refresh en fazla 2 kez, sonra `offline`. Refresh 401 → `offline`. `onAny` bilinmeyen adı yok sayar. Hold: tamponlar, release sırayla boşaltır, iç içe hold'da son release'te boşalır, çift release zararsız, 2 dk'da otomatik release (fake timer). Bir listener throw edince diğeri yine alır. `joinBoard` bağlı değilken emit etmez; ack zaman aşımı → `INTERNAL_ERROR`. `leaveBoard` bağlı değilken emit etmez.
- **`http.test.ts`:** bağlıyken `X-Socket-Id` gider; bağlı değilken ve `skipAuth` isteklerinde gitmez.
- **`apply-board-event.test.ts`:** `BOARD_EVENT_NAMES` üzerinde döngü; her ad için en az bir senaryo yoksa test düşer. Her event: beklenen sonuç + iki kez uygulama = bir kez uygulama. Bilinmeyen liste → `refetch`; arşivlenen liste kartlarıyla düşer; geri yüklenen liste → `refetch`; arşivlenen kart düşer; `label:deleted` `labelIds`'i temizler; kendi rolü `myRole`'ü değiştirir; rebalance yalnız ilgili listedeki kartları etkiler; checklist event'leri yalnız sayaçları değiştirir.
- **`apply-card-event.test.ts`:** §6.8 tablosunun her satırı + idempotency; başka kartın event'i aynı referans; `descriptionChanged` iki dalı; `list:deleted` (kendi listesi) → `gone`.
- **`apply-board-list-event.test.ts`:** ekleme (başa), tekrar ekleme (değiştirme), çıkarma, bilinmeyen pano no-op.
- **`use-board-realtime.test.tsx`** (`renderApp('/boards/B')`, `fakeRealtime.connect()`): `joins` `['B']` ve board GET'i bir kez daha atılır (MSW sayacı); başka panoya gidince `leaves` `['B']`. `card:created` → kutucuk görünür. `card:moved` → kart yeni listede doğru sırada. Aynı event iki kez → `getQueryData` referansı değişmez. `boardId` farklı event → etkisiz. `membership:removed` → URL `/boards`, toast "“…” panosundan çıkarıldın.". `actorId === me` → "… ayrıldın.". `board:deleted` → "… panosu silindi.". `member:updated` (ben, ADMIN → MEMBER) açık "Üyeler" diyaloğunda davet bölümünü kaldırır. `fakeRealtime.drop('transport close')` → `connect()` → ikinci join + GET. Board GET yoldayken event → GET yeniden başlatılır ve sonuç event'i içerir. Board mutation sürerken `refetch` gerektiren event → ek GET yok, mutation bitince tek GET.
- **`board-cards.test.tsx` eki:** klavyeyle kart tutulur (Space) → `serverEmit('card:created')` → DOM'da yok → bırakılır → yeni kart görünür, bırakılan kart yeni yerinde kalır (geri zıplamaz). İptal (Escape) → event hemen uygulanır.
- **`use-card-realtime.test.tsx`** (`renderApp('/boards/B/c/C')`): `checklist-item:updated` → onay kutusu işaretli + ilerleme metni; `checklist:created` → yeni checklist başlığı; `card:updated` başlık → dialog başlığı; `descriptionChanged` → `GET /cards/C` tekrar ve yeni metin görünür; açıklama düzenlenirken aynı event → textarea taslağı korunur; `card:deleted` → "Bu kart başka biri tarafından silindi." + "Panoya dön"; kendi listesinin `list:deleted`'ı → aynı; `card:updated` arşiv → arşiv bandı.
- **`use-board-list-realtime.test.tsx`** (`renderApp('/boards')`): `membership:added` → yeni pano kutusu; `board:deleted` / `membership:removed` → kutu kaybolur, toast yok.
- **`realtime-status.test.tsx`:** `reconnecting` 2,9 sn → görünmez, 3 sn → "Bağlantı koptu. Yeniden bağlanılıyor…"; `offline` → "Canlı güncellemeler kapalı." + "Yeniden bağlan" → `retry` çağrılır; `connected` → boş; `role="status"` kalıcı.

### Playwright (`frontend/e2e/realtime.spec.ts`, iki tarayıcı bağlamı A ve B)
B'nin socket'inin A'nın eyleminden önce join etmiş olması **varsayılmaz**: join'den sonraki refetch, kaçırılan değişikliği de getirir. Testler hangi sırada olursa olsun sağlamdır.
1. **Pano içi canlı güncelleme:** A panoyu oluşturur, kayıtlı B'yi `apiInvite` ile ekler; ikisi de panoyu açar. A liste ve iki kart ekler → B'de görünür. A bir kartı fareyle diğer listeye sürükler → B'de yeni listede, doğru sırada. A listeyi yeniden adlandırır → B'de yeni ad. Hiç reload yok. Son olarak B reload eder → aynı düzen.
2. **Açık kart detayı:** B kartı açar. A (API) checklist ekler, maddeyi işaretler, başlığı değiştirir → B'nin diyaloğunda checklist, işaret, yeni başlık; diyalog kapanınca kutucukta `1/1` rozeti. A kartı siler → B'de "Bu kart başka biri tarafından silindi."
3. **Üye çıkarma:** A, "Üyeler" diyaloğundan B'yi çıkarır → B `/boards`'a gider, toast "“…” panosundan çıkarıldın.", pano kutusu yok.
4. **Pano silme:** B `/boards`'tayken A panoyu siler → B'de kutu kaybolur. Varyant: B panodayken → yönlendirme + "… panosu silindi."
5. **Canlı davet:** B `/boards`'ta. A kayıtlı B'yi davet eder → B'de kutu belirir ve açılır.
6. **Sürükleme sırasında event:** B klavyeyle bir kartı tutar (Space). A API ile aynı listeye kart ekler. B ok tuşuyla taşıyıp bırakır → hata toast'ı yok; iki değişiklik de görünür; reload sonrası aynı sıra.
7. **Arşiv:** A kartı arşivler → B'de kaybolur; A geri yükler → B'de listenin sonunda.

Ağ kopması ve token süresi senaryoları Playwright'ta **yok** (zamanlamaya bağlı, kararsız olur). Bunlar FE unit (fake socket) ve backend e2e (gerçek sunucu) ile kapsanıyor.

### Dosya listesi
| Katman | Yeni | Güncellenen |
|---|---|---|
| contracts | `realtime-events.ts` (+spec) | `index.ts` |
| backend src | `realtime/*` (module, gateway, service, io adapter, ws-auth middleware, rooms, board-events, event-origin; +spec'ler), `checklists/checklist-counts.ts` | `app.setup.ts`, `app.module.ts`, `auth/token.service.ts`, `auth/guards/jwt-auth.guard.ts`, `ordering/place-and-rebalance.ts`, `boards/*`, `members/*`, `invitations/*`, `lists/*`, `cards/*`, `labels/*`, `checklists/*` (servis + controller + spec), `package.json` |
| backend test | `realtime.e2e-spec.ts`, `realtime-events.e2e-spec.ts`, `utils/realtime.ts` | `utils/create-test-app.ts` |
| frontend src | `shared/lib/realtime-client.ts`, `shared/store/realtime-store.ts`, `shared/hooks/{use-realtime-connection, use-realtime-events, use-realtime-hold}.ts`, `shared/ui/realtime-status.tsx`, `boards/{lib/apply-board-list-event, hooks/use-board-list-realtime}.ts`, `board-detail/{lib/apply-board-event, api/refresh-board, hooks/use-board-realtime}.ts`, `card-detail/{lib/apply-card-event, hooks/use-card-realtime}.ts` | `shared/lib/http.ts`, `app/root-layout.tsx`, `boards/index.ts`, `board-detail/{index, hooks/use-board-dnd, api/use-list-mutations, components/board-page, components/board-header, components/board-canvas}`, `card-detail/{api/use-card-mutation, hooks/use-checklist-dnd, store/card-detail-store, components/card-detail-route}`, `test/setup.ts` |
| frontend test | `test/fake-realtime.ts`, `realtime-client.test.ts`, `apply-board-event.test.ts`, `apply-card-event.test.ts`, `apply-board-list-event.test.ts`, `use-board-realtime.test.tsx`, `use-card-realtime.test.tsx`, `use-board-list-realtime.test.tsx`, `realtime-status.test.tsx` | `http.test.ts`, `board-cards.test.tsx` |
| Playwright | `e2e/realtime.spec.ts` | `e2e/helpers.ts` (gerekirse) |

---

## 9. Riskler

1. **R1 Sıra ve last-write-wins:** Kilitli yazımlarda yayın sırası commit sırasını izler (§3.3). Kilitsiz alan yazımlarında (başlık, açıklama, etiket, rol) iki eşzamanlı yazım ters sırayla yayınlanabilir; bir istemci bir sonraki refetch'e kadar eski değeri görür. Rebalance ile ana event arasında nadir bir ara render olabilir. PLAN'ın LWW kabulüyle uyumlu. Sonraki adım gerekirse: DTO'lara `updatedAt` ve reducer'da "daha eskiyse yok say".
2. **R2 Kaçırılan event'ler:** Sunucu event saklamaz. Kopma, token yenileme ya da ilk açılıştaki join gecikmesinde kaçanlar join sonrası refetch ile kapanır. Bedeli: her pano açılışı ve yeniden bağlanmada +1 board GET (300/dk genel limit için önemsiz).
3. **R3 Eski GET'in event'i ezmesi:** Yolda olan board GET'i event'ten önceki anı okumuş olabilir. Event geldiğinde GET çekiliyorsa invalidate ile yenilenir (§6.6/2).
4. **R4 İyimser rollback uzak değişikliği geri alır:** Başarısız mutation snapshot'ı geri yazar; son mutation'ın refetch'i uzak değişikliği geri getirir. Kısa bir geri dönüş görülebilir.
5. **R5 Çoklu sunucu:** In-memory adapter tek süreçte çalışır. Birden fazla backend örneğinde Redis adapter gerekir (`socketsLeave`, `except`, sahiplik kontrolü `fetchSockets`'e taşınır). WebSocket-only seçimi sticky session ihtiyacını kaldırır. Kapsam dışı.
6. **R6 Token süresi:** Sunucu `exp`'te bağlantıyı kapatır. Boşta duran panoda 15 dk'da bir refresh + yeniden bağlanma + refetch olur ve arada < 1 sn'lik kopukluk yaşanır (gösterge 3 sn eşiği yüzünden görünmez). Refresh rotasyonu tek uçuşlu `refreshSession` ile HTTP katmanıyla paylaşılır; yarış yok. Sonraki adım gerekirse: süre dolmadan yeni token'ı bant içi göndermek.
7. **R7 Sürükleme ve event:** Hold sayesinde dnd-kit'in gördüğü düzen sürükleme boyunca değişmez. Bırakılınca bayat anchor 409 alırsa mevcut "Pano yenilendi" yolu çalışır. Unutulan hold için 2 dk güvenlik ağı var.
8. **R8 Erişilebilirlik:** Uzak değişiklikler duyurulmuyor. Odaktaki öğe uzaktan silinir/taşınırsa odak kaybolabilir. "Kart işlemleri" ve kart detayı için özel davranış tanımlandı (§6.8, §6.12); kalanı Faz 8 turunda.
9. **R9 Payload sızıntısı:** §5.4 kuralları + mapper zorunluluğu + e2e sızıntı taraması + kod incelemesi maddesi. Yeni bir event eklendiğinde aynı kontroller geçerli (§12).
10. **R10 Kötüye kullanım:** Socket başına mesaj sınırı yok; join iki PK araması ve tek board room ile ucuz. Kullanıcı başına socket sayısı sınırsız (her sekme bir socket). Ölçülmüş bir sorun yoksa MVP'de kabul. Gerekirse kullanıcı başına ~20 socket ve join için basit bir sayaç.
11. **R11 Mevcut testlere etki:** FE unit testleri fake socket bağlanmadığı için etkilenmez. Playwright'ta gerçek socket bağlanır: join sonrası refetch ve API ile yapılan değişikliklerin artık canlı görünmesi mevcut spec'lerdeki zamanlama varsayımlarını etkileyebilir. F6'da tam suite iki kez koşulur.
12. **R12 Guard/filter varsayımları:** `APP_GUARD`'ların gateway'e uygulanma biçimi Nest sürümüne bağlı. §4.10 değişiklikleri savunmacı; B2 e2e'si doğrular.
13. **R13 Performans:** Event başına bir `setQueryData` ve board yeniden render'ı; büyük rebalance'ta (yüzlerce kart) tek event'te yüzlerce pozisyon. MVP ölçeğinde sorun değil. Ölçülürse event'ler bir animasyon karesinde toplu uygulanır.
14. **R14 Geriye dönük uyumluluk:** REST yanıtları değişmiyor. Yeni isteğe bağlı başlık (`X-Socket-Id`) eski istemcileri bozmaz. `PATCH /checklist-items/:id` artık kart kilidi alıyor: davranış aynı, eşzamanlı işaretlemeler sıraya giriyor. `DELETE /boards/:id` transaction'a alındı: nadir board silme ↔ kart ekleme deadlock'ı yine 409 `CONFLICT` (PLAN "Kilitler" notu). Controller imzaları yeni param alıyor ve bu yüzden servis unit testlerindeki `new XService(prisma)` çağrıları güncellenecek.
15. **R15 Production ağ katmanı:** Reverse proxy'nin `/socket.io` için `Upgrade`/`Connection` başlıklarını iletmesi ve CSP `connect-src`'nin `ws:`/`wss:` içermesi gerekir. Faz 8 güvenlik/dağıtım turuna not.

---

## 10. PLAN'dan Farklar

1. **`board:deleted` user room'larına gider** (PLAN: board room). Panolar sayfasındaki üyeler de görür. Sahibin diğer sekmeleri dahil.
2. **`board:updated` payload'ı `BoardInfoDto`** (`BoardSummaryDto` değil). `myRole` kişiye özel olduğu için yayınlanmaz.
3. **`card:updated` = `{ card, descriptionChanged }`.** Açıklama metni yayınlanmaz; açık kart metni GET ile çeker.
4. **Checklist/madde event'leri `counts` taşır.** PLAN'daki ek `card:updated` yayınlanmaz. `checklist:updated` yalnız `{ id, cardId, title }` taşır (maddeler gitmez). Yeni event: **`checklist:moved`** (PLAN'da yoktu, endpoint var). `checklist-item:created/updated` = `{ item, cardId, counts }`.
5. **`position:rebalanced`** varlığa göre ayrışan birleşim tipi: `listId` / `cardId` / `checklistId`. Bu sayede FE hangi cache'e dokunacağını arama yapmadan bilir. Ana event'ten önce gönderilir.
6. **`membership:added` pano oluşturmada da** yayınlanır (oluşturanın diğer sekmeleri).
7. **Sürükleme kuyruğu** Zustand `dragStore` yerine socket istemcisinde (`hold()`). Kuyruk render edilmez, store'a gerek yok. Checklist sürüklemesi de kapsanır.
8. **Socket aynı anda tek board room'unda.** `board:join` önceki board room'larından çıkarır. Ack'e `CONFLICT` (eski join) eklendi.
9. **Token süresi sunucuda zorlanır** (`exp`'te `disconnect`). PLAN yalnız istemci tarafını tarif ediyordu.
10. **`PATCH /checklist-items/:id` kart kilidi alır** (Faz 5: "kilit almaz"). Gerekçe: tutarlı sayaçlar ve commit sırasıyla yayın.
11. **`DELETE /boards/:id` transaction'a alındı** (`lockBoard` + üye okuma + silme).
12. **Yalnız WebSocket transport'u** (PLAN belirtmiyordu).
13. **FE reducer'ları üçe ayrıldı:** `applyBoardEvent` (board-detail), `applyCardEvent` (card-detail), `applyBoardListEvent` (boards). Tek bir `applyBoardEvent` feature sınırlarını delerdi.
14. **Event'ler yalnızca gerçek değişiklikte:** no-op etiket ataması ve idempotent davet kabulü yayın yapmaz.

---

## 11. Açık Kararlar (önerilen varsayılan parantez içinde; hepsi bu varsayımlarla uygulanabilir)

1. **K1 Bağlantı göstergesi gerekli mi?** (Evet, minimal: yalnız pano sayfasında, ≥ 3 sn kopuklukta ya da `offline`'da; §6.11.)
2. **K2 Transport:** yalnız WebSocket mı, polling yedeği de mi? (Yalnız WebSocket. Polling'i engelleyen ağlar nadir, polling ise çoklu sunucuda sticky session ister. Gerekirse iki taraftan `transports` satırı kaldırılır.)
3. **K3 Token süresi dolunca:** sunucu bağlantıyı kapatsın mı, yoksa istemci bant içinde yeni token mı göndersin? (Sunucu kapatsın; istemci refresh + yeniden bağlanır, refetch kaçanları kapatır. Daha basit ve güvenli.)
4. **K4 Açıklama metni event'te gitsin mi?** (Hayır; `descriptionChanged` + açık kartta GET.)
5. **K5 Sayaçlar:** ayrı `card:updated` mi, event içinde `counts` mu? (`counts`; tek event, atomik uygulama.)
6. **K6 Socket başına tek board room kuralı?** (Evet; FE zaten tek pano açıyor, kural sızıntı ve kötüye kullanımı keser.)
7. **K7 Panoya eklenince toast?** (Hayır; `/boards` listesi sessizce güncellenir. Bildirimler kapsam dışı. Atılma ve silinme toast'lı, çünkü kullanıcının bulunduğu sayfa kayboluyor.)
8. **K8 `board:updated` panolar listesindeki herkese (user room'ları) gitsin mi?** (Hayır; yalnız board room. Açık olmayan panoların listedeki başlığı bir sonraki liste çekiminde güncellenir (30 sn staleTime).)
9. **K9 Uzak değişiklikler ekran okuyucuya duyurulsun mu?** (Hayır, gürültü; yalnız atılma, silinme, "kart silindi" ve bağlantı durumu.)
10. **K10 Socket rate limit / kullanıcı başına socket sınırı?** (MVP'de yok; §9 R10.)
11. **K11 Sürükleme hold'unun güvenlik süresi?** (2 dk; dev'de uyarı.)
12. **K12 CLAUDE.md güncellemesi:** socket.io paket sürümleri "Sürümler"e eklensin mi? (Evet, kurulumdan sonra **kullanıcı onayıyla**.)

---

## 12. "Bitti" Checklist'i (Faz 7 kartı)

- [ ] `@trello/contracts` `realtime-events.ts` iki tarafta kullanılıyor. Event adları yalnız contracts'tan geliyor (kodda serbest string yok).
- [ ] Handshake: token yok/geçersiz/süresi dolmuş → bağlantı reddi. `exp`'te sunucu kapatıyor. Token hiçbir log'da yok.
- [ ] `board:join` üyelik kontrolü, yeniden kontrol, seq (`CONFLICT`), tek board room. Üye olmayana `NOT_FOUND`.
- [ ] §5.5'teki **her** yazım satırı commit sonrası yayın yapıyor ve e2e tablo testinde karşılığı var. Başarısız ve no-op istekler event üretmiyor.
- [ ] `X-Socket-Id` hariç tutma sahiplik kontrollü. Bozuk başlık yok sayılıyor.
- [ ] Üye çıkarma/ayrılma: room'dan atma → `member:removed` → `membership:removed`. Pano silme: `board:deleted` tüm üyelere → room boşaltma.
- [ ] Sızıntı taraması yeşil (açıklama, davet bilgisi, socket id, başkasının `myRole`'ü yok).
- [ ] FE: tek socket; giriş/çıkışta aç/kapa; `io server disconnect` ve `UNAUTHORIZED` için refresh + yeniden bağlanma; `offline` durumu.
- [ ] FE: `applyBoardEvent`, `applyCardEvent`, `applyBoardListEvent` her event için test edildi ve idempotent. `switch`'ler `never` ile tam.
- [ ] FE: join sonrası refetch; mutation sürerken refetch yok; yolda olan GET varken event gelirse yeniden çekiliyor.
- [ ] FE: kart ve liste sürüklemesinde, checklist madde sürüklemesinde hold her yolda bırakılıyor (iyimser sonrası, rollback, iptal, unmount).
- [ ] FE: panodan atılma/silinme yönlendirme + toast; açık kartta "silindi" görünümü; "Kart işlemleri" kapanış + odak.
- [ ] Bağlantı göstergesi: 3 sn eşiği, `offline` + "Yeniden bağlan", iki temada kontrast, 320 px (`ui-designer` onayı).
- [ ] Backend unit + e2e (iki koşu), FE unit, Playwright tam suite yeşil. `skip`/`only` yok.
- [ ] `npm run build`, `npm run typecheck` (iki workspace), `npm run lint` temiz.
- [ ] `code-reviewer` onayı (§7 adım 13 maddeleri).
- [ ] Commit'ler İngilizce Conventional Commits, adım başına bir tane (§7).
- [ ] `docs/PLAN.md` İlerleme satırı + §5 notu. CLAUDE.md sürüm satırı (onaylandıysa). Panodaki Faz 7 kartı güncel.
