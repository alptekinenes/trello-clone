import { screen, waitFor, within } from '@testing-library/react';
import type { ChecklistDto, ChecklistItemDto } from '@trello/contracts';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { fakeRealtime } from '../../../test/fake-realtime';
import {
  BOARD_ID,
  apiError,
  boardDetail,
  testActivity,
  testCard,
  testComment,
  testLists,
} from '../../../test/fixtures';
import {
  BOARD_URL,
  CARD_ID,
  CARD_PATH,
  CARD_URL,
  FEED_URL,
  LIST,
  cardDialog,
  openCard,
} from '../../../test/card-dialog';
import { gate } from '../../../test/gate';
import { server } from '../../../test/msw-server';
import { cardKeys } from '../api/card-keys';

const here = { boardId: BOARD_ID };

function item(id: string, content: string, position: number, isCompleted = false): ChecklistItemDto {
  return { id, checklistId: 'cl-1', content, isCompleted, position };
}

const CHECKLIST: ChecklistDto = {
  id: 'cl-1',
  cardId: CARD_ID,
  title: 'Yapılacaklar',
  position: 1024,
  items: [item('i-1', 'Taslak', 1024), item('i-2', 'Gözden geçir', 2048)],
};

/** Opens the card dialog, then connects the socket and waits for the join's refetch to settle. */
async function openLiveCard(
  detail: Parameters<typeof openCard>[1] = {},
  feedItems: Parameters<typeof openCard>[4] = [],
) {
  const opened = openCard(CARD_PATH, detail, [], [], feedItems);
  const dialog = await cardDialog();
  fakeRealtime.connect();
  await waitFor(() => expect(fakeRealtime.joins).toEqual([BOARD_ID]));
  await waitFor(() => expect(opened.queryClient.isFetching()).toBe(0));
  return { ...opened, dialog };
}

const summary = (changes: Partial<Parameters<typeof testCard>[0]> = {}) =>
  testCard({ id: CARD_ID, listId: LIST.id, title: 'Rapor', ...changes });

describe('useCardRealtime: checklists', () => {
  it('ticks an item and updates the progress when someone else ticks it', async () => {
    const { dialog } = await openLiveCard({ checklists: [CHECKLIST] });
    expect(within(dialog).getByRole('checkbox', { name: 'Taslak' })).not.toBeChecked();

    fakeRealtime.serverEmit(
      'checklist-item:updated',
      {
        item: item('i-1', 'Taslak', 1024, true),
        cardId: CARD_ID,
        counts: { checklistTotal: 2, checklistDone: 1 },
      },
      here,
    );

    await waitFor(() => expect(within(dialog).getByRole('checkbox', { name: 'Taslak' })).toBeChecked());
    expect(within(dialog).getByRole('progressbar')).toHaveAttribute(
      'aria-valuetext',
      "2 öğeden 1'si tamamlandı",
    );
  });

  it('shows a checklist added by someone else', async () => {
    const { dialog } = await openLiveCard();

    fakeRealtime.serverEmit(
      'checklist:created',
      { id: 'cl-9', cardId: CARD_ID, title: 'Yayın', position: 1024, items: [] },
      here,
    );

    expect(await within(dialog).findByRole('heading', { name: 'Yayın' })).toBeInTheDocument();
  });

  it('shows the tile counter on the board after the dialog follows the event', async () => {
    const { dialog } = await openLiveCard({ checklists: [CHECKLIST] });

    fakeRealtime.serverEmit(
      'checklist-item:deleted',
      { id: 'i-2', checklistId: 'cl-1', cardId: CARD_ID, counts: { checklistTotal: 1, checklistDone: 0 } },
      here,
    );

    await waitFor(() =>
      expect(within(dialog).queryByRole('checkbox', { name: 'Gözden geçir' })).not.toBeInTheDocument(),
    );
    expect(screen.getByText('0/1')).toBeInTheDocument();
  });
});

describe('useCardRealtime: card fields', () => {
  it('follows a new title', async () => {
    await openLiveCard();

    fakeRealtime.serverEmit(
      'card:updated',
      { card: summary({ title: 'Yeni başlık' }), descriptionChanged: false },
      here,
    );

    expect(await screen.findByRole('dialog', { name: 'Yeni başlık' })).toBeInTheDocument();
  });

  it('fetches the card again for a changed description and shows the new text', async () => {
    const { serverCard } = await openLiveCard({ description: 'Eski metin' });
    let gets = 0;
    server.use(
      http.get(CARD_URL, () => {
        gets += 1;
        return HttpResponse.json(serverCard.card);
      }),
    );
    serverCard.card = { ...serverCard.card, description: 'Yeni metin' };

    fakeRealtime.serverEmit(
      'card:updated',
      { card: summary({ hasDescription: true }), descriptionChanged: true },
      here,
    );

    expect(await screen.findByText('Yeni metin')).toBeInTheDocument();
    expect(gets).toBe(1);
  });

  it('keeps the description draft being typed when the card changes', async () => {
    const { user, dialog } = await openLiveCard({ description: 'Eski' });
    await user.click(within(dialog).getByRole('button', { name: 'Açıklamayı düzenle' }));
    await user.type(within(dialog).getByRole('textbox', { name: 'Açıklama' }), ' taslak');

    fakeRealtime.serverEmit(
      'card:updated',
      { card: summary({ title: 'Yeni başlık', hasDescription: true }), descriptionChanged: false },
      here,
    );

    await screen.findByRole('dialog', { name: 'Yeni başlık' });
    expect(screen.getByRole('textbox', { name: 'Açıklama' })).toHaveValue('Eski taslak');
  });

  it('shows the archive banner when the card is archived by someone else', async () => {
    const { dialog } = await openLiveCard();

    fakeRealtime.serverEmit(
      'card:updated',
      { card: summary({ archivedAt: '2026-11-03T10:00:00.000Z' }), descriptionChanged: false },
      here,
    );

    expect(await within(dialog).findByText('Bu kart arşivde.')).toBeInTheDocument();
  });

  it('updates the list selector when someone else moves the card to another list', async () => {
    const [todo, done] = testLists('Yapılacaklar', 'Bitti');
    const placed = { listId: todo.id };
    const opened = openCard(CARD_PATH);
    server.use(
      http.get(BOARD_URL, () =>
        HttpResponse.json(
          boardDetail('OWNER', 'Pano', [todo, done], [summary({ listId: placed.listId })]),
        ),
      ),
    );
    const dialog = await cardDialog();
    fakeRealtime.connect();
    await waitFor(() => expect(fakeRealtime.joins).toEqual([BOARD_ID]));
    await waitFor(() => expect(opened.queryClient.isFetching()).toBe(0));

    placed.listId = done.id;
    fakeRealtime.serverEmit(
      'card:moved',
      { id: CARD_ID, fromListId: todo.id, toListId: done.id, position: 2048 },
      here,
    );

    expect(await within(dialog).findByRole('button', { name: 'Liste: Bitti' })).toBeInTheDocument();
  });

  it('ignores events of another board and of other cards', async () => {
    const { queryClient } = await openLiveCard();
    const before = queryClient.getQueryData(cardKeys.detail(BOARD_ID, CARD_ID));

    fakeRealtime.serverEmit(
      'card:updated',
      { card: summary({ title: 'Başka pano' }), descriptionChanged: false },
      { boardId: 'other-board' },
    );
    fakeRealtime.serverEmit(
      'card:updated',
      { card: testCard({ id: 'card-9', listId: LIST.id, title: 'Başka kart' }), descriptionChanged: false },
      here,
    );

    expect(queryClient.getQueryData(cardKeys.detail(BOARD_ID, CARD_ID))).toBe(before);
    expect(screen.getByRole('dialog', { name: 'Rapor' })).toBeInTheDocument();
  });
});

describe('useCardRealtime: the card is deleted', () => {
  it('tells the user once and offers the way back to the board', async () => {
    const { dialog, router, user } = await openLiveCard();

    fakeRealtime.serverEmit('card:deleted', { id: CARD_ID, listId: LIST.id }, here);

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'Bu kart başka biri tarafından silindi.',
    );
    expect(within(dialog).queryByRole('button', { name: 'Rapor' })).not.toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Panoya dön' }));
    await waitFor(() => expect(router.state.location.pathname).toBe(`/boards/${BOARD_ID}`));
  });

  it('says the same when the list of the card is deleted', async () => {
    const { dialog } = await openLiveCard();

    fakeRealtime.serverEmit('list:deleted', { id: LIST.id }, here);

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'Bu kart başka biri tarafından silindi.',
    );
  });

  it('keeps the plain "not found" message for a card that was never there', async () => {
    openCard(CARD_PATH);
    server.use(http.get(CARD_URL, () => apiError(404, 'NOT_FOUND')));

    expect(await screen.findByText('Kart bulunamadı. Silinmiş olabilir.')).toBeInTheDocument();
    expect(screen.queryByText('Bu kart başka biri tarafından silindi.')).not.toBeInTheDocument();
  });
});

describe('useCardRealtime: comments and activity', () => {
  const list = (dialog: HTMLElement) =>
    within(within(dialog).getByRole('region', { name: 'Yorumlar ve etkinlik' }));

  it('shows a comment from someone else at the top and updates the counter', async () => {
    const { dialog, queryClient } = await openLiveCard({}, [testComment({ id: 'c1', body: 'Eski' })]);
    await list(dialog).findByText('Eski');
    const created = testComment({
      id: 'c2',
      body: 'Canlı yorum',
      createdAt: '2026-11-05T11:00:00.000Z',
      author: { id: 'u2', name: 'Can Demir', avatarUrl: null },
    });

    fakeRealtime.serverEmit('comment:created', { comment: created, commentCount: 2 }, here);

    expect(await list(dialog).findByText('Canlı yorum')).toBeInTheDocument();
    const items = list(dialog).getAllByRole('listitem');
    expect(items[0]).toHaveTextContent('Can Demir');
    expect(queryClient.getQueryData<{ commentCount: number }>(cardKeys.detail(BOARD_ID, CARD_ID))).toMatchObject({
      commentCount: 2,
    });

    // The same event again changes nothing.
    fakeRealtime.serverEmit('comment:created', { comment: created, commentCount: 2 }, here);
    expect(list(dialog).getAllByText('Canlı yorum')).toHaveLength(1);
  });

  it('keeps an event that arrives while a feed request is in flight', async () => {
    const { dialog, queryClient, feed } = await openLiveCard({}, [testComment({ id: 'c1', body: 'Eski' })]);
    await list(dialog).findByText('Eski');
    const created = testComment({ id: 'c2', body: 'Canlı yorum', createdAt: '2026-11-05T11:00:00.000Z' });
    const stale = [...feed.items];
    const request = gate();
    let calls = 0;
    server.use(
      http.get(FEED_URL, async () => {
        calls += 1;
        if (calls > 1) return HttpResponse.json({ items: [created, ...stale], nextCursor: null });
        await request.opened;
        return HttpResponse.json({ items: stale, nextCursor: null });
      }),
    );

    const refetch = queryClient.refetchQueries({ queryKey: cardKeys.feeds(BOARD_ID, CARD_ID) });
    await waitFor(() => expect(calls).toBe(1));
    fakeRealtime.serverEmit('comment:created', { comment: created, commentCount: 2 }, here);
    request.release();
    await refetch;

    expect(await list(dialog).findByText('Canlı yorum')).toBeInTheDocument();
  });

  it('follows an edit and a delete', async () => {
    const { dialog } = await openLiveCard({ commentCount: 2 }, [
      testComment({ id: 'c2', body: 'İkinci', createdAt: '2026-11-05T10:02:00.000Z' }),
      testComment({ id: 'c1', body: 'Birinci', createdAt: '2026-11-05T10:01:00.000Z' }),
    ]);
    await list(dialog).findByText('Birinci');

    fakeRealtime.serverEmit(
      'comment:updated',
      testComment({
        id: 'c1',
        body: 'Düzeltildi',
        createdAt: '2026-11-05T10:01:00.000Z',
        editedAt: '2026-11-05T10:09:00.000Z',
      }),
      here,
    );
    expect(await list(dialog).findByText('Düzeltildi')).toBeInTheDocument();
    expect(list(dialog).getByText('(düzenlendi)')).toBeInTheDocument();

    fakeRealtime.serverEmit('comment:deleted', { id: 'c2', cardId: CARD_ID, commentCount: 1 }, here);
    await waitFor(() => expect(list(dialog).queryByText('İkinci')).not.toBeInTheDocument());
    expect(list(dialog).getByText('Düzeltildi')).toBeInTheDocument();
  });

  it('adds activity only while details are shown', async () => {
    const { dialog, user } = await openLiveCard();
    await list(dialog).findByText('Henüz yorum yok.');
    const activity = testActivity({ id: 'a1', createdAt: new Date().toISOString() });

    fakeRealtime.serverEmit('activity:created', activity, here);
    expect(list(dialog).queryByText(/tamamlandı olarak işaretledi/)).not.toBeInTheDocument();

    await user.click(list(dialog).getByRole('button', { name: 'Ayrıntıları göster' }));
    await list(dialog).findByText('Henüz yorum yok.');
    fakeRealtime.serverEmit('activity:created', activity, here);

    expect(await list(dialog).findByText(/bu kartı tamamlandı olarak işaretledi/)).toBeInTheDocument();
  });

  it('ignores comments of another card', async () => {
    const { dialog } = await openLiveCard();
    await list(dialog).findByText('Henüz yorum yok.');

    fakeRealtime.serverEmit(
      'comment:created',
      { comment: testComment({ id: 'x', body: 'Başka kart', cardId: 'card-2' }), commentCount: 1 },
      here,
    );

    expect(list(dialog).queryByText('Başka kart')).not.toBeInTheDocument();
  });
});
