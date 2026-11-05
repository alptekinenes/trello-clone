import { QueryClient } from '@tanstack/react-query';
import { ErrorCode, type BoardDetailDto, type CardDetailDto } from '@trello/contracts';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FakeXhr, installFakeXhr, restoreXhr } from '../../../test/fake-xhr';
import { BOARD_ID, boardDetail, testCardDetail, testLists } from '../../../test/fixtures';
import { boardKeys } from '../../boards';
import { cardKeys } from '../api/card-keys';
import { useAttachmentUploadStore } from '../store/attachment-upload-store';
import { useCardDetailStore } from '../store/card-detail-store';
import { cancelUpload, dismissUpload, startUploads } from './upload-runner';

const [LIST] = testLists('Yapılacaklar');
const CARD_ID = 'card-1';

const file = (name: string, bytes = 100) => new File([new Uint8Array(bytes)], name);
const bigFile = (name: string) => {
  const big = file(name, 1);
  Object.defineProperty(big, 'size', { value: 10 * 1024 * 1024 + 1 });
  return big;
};
const uploads = () => useAttachmentUploadStore.getState().uploads;
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

const created = (name: string, count: number) => ({
  attachment: {
    id: `att-${name}`,
    cardId: CARD_ID,
    fileName: name,
    mimeType: 'application/pdf' as const,
    size: 100,
    uploader: { id: 'u', name: 'Ayşe', avatarUrl: null },
    createdAt: '2026-11-05T10:00:00.000Z',
  },
  attachmentCount: count,
});

function setup(card: Partial<CardDetailDto> = {}) {
  const queryClient = new QueryClient();
  const detail = testCardDetail({ id: CARD_ID, listId: LIST.id, title: 'Rapor', ...card });
  queryClient.setQueryData(cardKeys.detail(BOARD_ID, CARD_ID), detail);
  queryClient.setQueryData(boardKeys.detail(BOARD_ID), boardDetail('OWNER', 'Pano', [LIST], [detail]));
  const start = (...files: File[]) =>
    startUploads({ queryClient, boardId: BOARD_ID, cardId: CARD_ID, files });
  return { queryClient, start };
}

beforeEach(() => installFakeXhr());
afterEach(() => restoreXhr());

describe('startUploads: checks before the request', () => {
  it('rejects a file over 10 MB, an unknown type and the 21st file without any request', () => {
    const { start } = setup({ attachmentCount: 19 });

    start(bigFile('büyük.pdf'), file('virus.exe'), file('a.pdf'), file('b.pdf'));

    expect(FakeXhr.instances).toHaveLength(1);
    const rows = uploads().map((row) => [row.fileName, row.status, row.error]);
    expect(rows).toEqual([
      ['büyük.pdf', 'failed', '“büyük.pdf” 10 MB\'tan büyük, yüklenemedi.'],
      ['virus.exe', 'failed', '“virus.exe” türü desteklenmiyor.'],
      ['a.pdf', 'uploading', null],
      ['b.pdf', 'failed', 'Bir karta en fazla 20 dosya eklenebilir.'],
    ]);
  });

  it('tells the open dialog about a rejected file', () => {
    const { start } = setup();
    useCardDetailStore.getState().open(CARD_ID);

    start(file('virus.exe'));

    expect(useCardDetailStore.getState().announcement).toBe('“virus.exe” türü desteklenmiyor.');
  });

  it('matches the extension case-insensitively', () => {
    const { start } = setup();

    start(file('FOTO.PNG'));

    expect(FakeXhr.instances).toHaveLength(1);
  });

  it('does nothing without files', () => {
    const { start } = setup();

    start();

    expect(uploads()).toEqual([]);
  });
});

describe('startUploads: running', () => {
  it('uploads one file at a time, in order', async () => {
    const { start } = setup();

    start(file('a.pdf'), file('b.pdf'));
    expect(FakeXhr.instances).toHaveLength(1);
    expect(uploads().map((row) => row.status)).toEqual(['uploading', 'queued']);

    FakeXhr.last.respond(201, created('a.pdf', 1));
    await flush();
    expect(FakeXhr.instances).toHaveLength(2);
    expect(uploads().map((row) => [row.fileName, row.status])).toEqual([['b.pdf', 'uploading']]);
  });

  it('follows the progress of the body as a share of the file size', () => {
    const { start } = setup();
    start(file('a.pdf', 200));

    FakeXhr.last.progress(50, 100);

    expect(uploads()[0]?.loaded).toBe(100);
  });

  it('writes the answer into the card and its tile, and announces it', async () => {
    const { start, queryClient } = setup();
    useCardDetailStore.getState().open(CARD_ID);
    start(file('a.pdf'));

    FakeXhr.last.respond(201, created('a.pdf', 1));
    await flush();

    expect(uploads()).toEqual([]);
    const card = queryClient.getQueryData<CardDetailDto>(cardKeys.detail(BOARD_ID, CARD_ID));
    expect(card?.attachments.map((a) => a.id)).toEqual(['att-a.pdf']);
    expect(card?.attachmentCount).toBe(1);
    const board = queryClient.getQueryData<BoardDetailDto>(boardKeys.detail(BOARD_ID));
    expect(board?.cards[0]?.attachmentCount).toBe(1);
    expect(useCardDetailStore.getState().announcement).toBe('“a.pdf” eklendi.');
  });

  it('keeps a failed row and goes on with the next file', async () => {
    const { start } = setup();
    start(file('a.pdf'), file('b.pdf'));

    FakeXhr.last.respond(415, { statusCode: 415, code: ErrorCode.UNSUPPORTED_FILE_TYPE, message: 'x' });
    await flush();

    expect(uploads()[0]).toMatchObject({
      fileName: 'a.pdf',
      status: 'failed',
      error: '“a.pdf” türü desteklenmiyor.',
    });
    expect(FakeXhr.instances).toHaveLength(2);
  });

  it.each([
    [413, ErrorCode.PAYLOAD_TOO_LARGE, '“a.pdf” 10 MB\'tan büyük, yüklenemedi.'],
    [409, ErrorCode.ATTACHMENT_LIMIT_REACHED, 'Bir karta en fazla 20 dosya eklenebilir.'],
    [429, ErrorCode.TOO_MANY_REQUESTS, 'Çok fazla yükleme yapıldı. Biraz bekleyip tekrar dene.'],
    [404, ErrorCode.NOT_FOUND, 'Kart bulunamadı. Silinmiş olabilir.'],
    [500, ErrorCode.INTERNAL_ERROR, '“a.pdf” yüklenemedi. Tekrar dene.'],
  ])('explains a %d answer', async (status, code, message) => {
    const { start } = setup();
    start(file('a.pdf'));

    FakeXhr.last.respond(status, { statusCode: status, code, message: 'x' });
    await flush();

    expect(uploads()[0]?.error).toBe(message);
  });

  it('reports a network failure as a plain failure', async () => {
    const { start } = setup();
    start(file('a.pdf'));

    FakeXhr.last.fail();
    await flush();

    expect(uploads()[0]).toMatchObject({ status: 'failed', error: '“a.pdf” yüklenemedi. Tekrar dene.' });
  });
});

describe('cancelUpload and dismissUpload', () => {
  it('aborts a running upload, removes its row and announces it', async () => {
    const { start } = setup();
    useCardDetailStore.getState().open(CARD_ID);
    start(file('a.pdf'));

    cancelUpload(uploads()[0]!.id);
    await flush();

    expect(FakeXhr.last.aborted).toBe(true);
    expect(uploads()).toEqual([]);
    expect(useCardDetailStore.getState().announcement).toBe('Yükleme iptal edildi.');
  });

  it('refetches the board after an abort, as the server may have finished first', async () => {
    const { start, queryClient } = setup();
    start(file('a.pdf'));

    cancelUpload(uploads()[0]!.id);
    await flush();

    expect(queryClient.getQueryState(boardKeys.detail(BOARD_ID))?.isInvalidated).toBe(true);
  });

  it('removes a waiting file without ever sending it', async () => {
    const { start } = setup();
    start(file('a.pdf'), file('b.pdf'));
    const waiting = uploads()[1]!;

    cancelUpload(waiting.id);
    FakeXhr.last.respond(201, created('a.pdf', 1));
    await flush();

    expect(FakeXhr.instances).toHaveLength(1);
    expect(uploads()).toEqual([]);
  });

  it('dismisses a failed row', () => {
    const { start } = setup();
    start(file('virus.exe'));

    dismissUpload(uploads()[0]!.id);

    expect(uploads()).toEqual([]);
  });
});
