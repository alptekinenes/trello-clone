import { screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { CARD_PATH, FEED_URL, cardDialog, openCard } from '../../../test/card-dialog';
import { apiError, testActivity, testComment } from '../../../test/fixtures';
import { server } from '../../../test/msw-server';

const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();

const panel = (dialog: HTMLElement) =>
  within(within(dialog).getByRole('region', { name: 'Yorumlar ve etkinlik' }));

describe('comments and activity panel', () => {
  it('says so when there are no comments yet', async () => {
    openCard(CARD_PATH);
    const dialog = await cardDialog();

    expect(await panel(dialog).findByText('Henüz yorum yok.')).toBeInTheDocument();
  });

  it('lists the comments newest first with author, relative time and the edited note', async () => {
    openCard(CARD_PATH, {}, [], [], [
      testComment({ id: 'c2', body: 'Yeni yorum', createdAt: minutesAgo(5) }),
      testComment({
        id: 'c1',
        body: 'Eski yorum',
        createdAt: minutesAgo(180),
        editedAt: minutesAgo(170),
      }),
    ]);
    const dialog = await cardDialog();

    const list = await panel(dialog).findByRole('list', { name: 'Yorumlar ve etkinlik' });
    const items = within(list).getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent('Ayşe Yılmaz');
    expect(items[0]).toHaveTextContent('Yeni yorum');
    expect(within(items[0]!).getByText('5 dakika önce')).toBeInTheDocument();
    expect(within(items[0]!).queryByText('(düzenlendi)')).not.toBeInTheDocument();
    expect(items[1]).toHaveTextContent('Eski yorum');
    expect(within(items[1]!).getByText('3 saat önce')).toBeInTheDocument();
    expect(within(items[1]!).getByText('(düzenlendi)')).toBeInTheDocument();
  });

  it('shows a comment body as plain text, never as HTML', async () => {
    const body = '<img src=x onerror=alert(1)> <b>kalın</b>\nikinci satır';
    openCard(CARD_PATH, {}, [], [], [testComment({ id: 'c1', body })]);
    const dialog = await cardDialog();

    const text = await panel(dialog).findByText(/<img src=x onerror=alert\(1\)>/);
    expect(text.textContent).toBe(body);
    expect(text).toHaveClass('whitespace-pre-wrap');
    expect(dialog.querySelector('b, img[src="x"]')).toBeNull();
  });

  it('shows activity only after "Ayrıntıları göster", and asks the server for it', async () => {
    const { user, feed } = openCard(CARD_PATH, {}, [], [], [
      testActivity({
        id: 'a1',
        type: 'CARD_MOVED',
        createdAt: minutesAgo(10),
        data: {
          cardTitle: 'Rapor',
          fromList: { id: 'l1', title: 'Yapılacaklar' },
          toList: { id: 'l2', title: 'Bitti' },
        },
      }),
      testComment({ id: 'c1', body: 'Bir yorum', createdAt: minutesAgo(20) }),
    ]);
    const dialog = await cardDialog();
    await panel(dialog).findByText('Bir yorum');
    expect(panel(dialog).queryByText(/listesine taşıdı/)).not.toBeInTheDocument();
    expect(feed.requests.at(-1)).toMatchObject({ details: 'false' });

    await user.click(panel(dialog).getByRole('button', { name: 'Ayrıntıları göster' }));

    expect(
      await panel(dialog).findByText('bu kartı Yapılacaklar listesinden Bitti listesine taşıdı', {
        exact: false,
      }),
    ).toBeInTheDocument();
    expect(feed.requests.at(-1)).toMatchObject({ details: 'true' });
    expect(panel(dialog).getByText('Bir yorum')).toBeInTheDocument();

    await user.click(panel(dialog).getByRole('button', { name: 'Ayrıntıları gizle' }));
    await waitFor(() => expect(panel(dialog).queryByText(/listesine taşıdı/)).not.toBeInTheDocument());
  });

  it('loads the next page with "Daha fazla göster" and moves the focus to its first item', async () => {
    const { user, feed } = openCard(
      CARD_PATH,
      {},
      [],
      [],
      ['c4', 'c3', 'c2', 'c1'].map((id, i) =>
        testComment({ id, body: `Yorum ${id}`, createdAt: minutesAgo(i + 1) }),
      ),
    );
    feed.pageSize = 2;
    const dialog = await cardDialog();
    await panel(dialog).findByText('Yorum c3');
    expect(panel(dialog).queryByText('Yorum c2')).not.toBeInTheDocument();

    await user.click(panel(dialog).getByRole('button', { name: 'Daha fazla göster' }));

    const next = (await panel(dialog).findByText('Yorum c2')).closest('li');
    expect(next).toHaveFocus();
    expect(panel(dialog).getByText('Yorum c1')).toBeInTheDocument();
    expect(panel(dialog).queryByRole('button', { name: 'Daha fazla göster' })).not.toBeInTheDocument();
    expect(feed.requests.map((request) => request.cursor)).toEqual([null, '2']);
  });

  it('offers a retry when the feed cannot be loaded', async () => {
    const { user, feed } = openCard(CARD_PATH, {}, [], [], [testComment({ id: 'c1', body: 'Geldi' })]);
    let failures = 1;
    server.use(
      http.get(FEED_URL, () => {
        if (failures-- > 0) return apiError(500, 'INTERNAL_ERROR');
        return HttpResponse.json({ items: feed.items, nextCursor: null });
      }),
    );
    const dialog = await cardDialog();

    expect(await panel(dialog).findByRole('alert')).toHaveTextContent('Sunucuya şu an ulaşılamıyor');
    await user.click(panel(dialog).getByRole('button', { name: 'Tekrar dene' }));

    expect(await panel(dialog).findByText('Geldi')).toBeInTheDocument();
  });

  it('keeps the "Ayrıntıları göster" choice for the session', async () => {
    const first = openCard(CARD_PATH);
    const dialog = await cardDialog();
    await first.user.click(panel(dialog).getByRole('button', { name: 'Ayrıntıları göster' }));
    expect(panel(dialog).getByRole('button', { name: 'Ayrıntıları gizle' })).toBeInTheDocument();
    first.unmount();

    openCard(CARD_PATH);
    const again = await cardDialog();
    expect(panel(again).getByRole('button', { name: 'Ayrıntıları gizle' })).toBeInTheDocument();
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
  });
});
