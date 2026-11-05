import { screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { CARD_PATH, CARD_URL, CARD_ID, cardDialog, openCard, type FeedState } from '../../../test/card-dialog';
import { BOARD_ID, apiError, testComment } from '../../../test/fixtures';
import { gate } from '../../../test/gate';
import { cardKeys } from '../api/card-keys';
import { server } from '../../../test/msw-server';

const COMMENT_URL = '*/api/v1/comments/:commentId';
const CAN = { id: 'user-can', name: 'Can Demir', avatarUrl: null };

const MINE = testComment({ id: 'mine', body: 'Benim yorumum', createdAt: '2026-11-05T10:02:00.000Z' });
const THEIRS = testComment({
  id: 'theirs',
  body: 'Can\'ın yorumu',
  author: CAN,
  createdAt: '2026-11-05T10:01:00.000Z',
});

/** PATCH and DELETE /comments/:id like the server; returns what was sent. */
function writeEndpoints(feed: FeedState) {
  const sent: { method: string; id: string; body?: string }[] = [];
  server.use(
    http.patch(COMMENT_URL, async ({ request, params }) => {
      const { body } = (await request.json()) as { body: string };
      const id = String(params.commentId);
      sent.push({ method: 'PATCH', id, body });
      const edited = { ...feed.items.find((item) => item.id === id), body, editedAt: '2026-11-05T11:00:00.000Z' };
      feed.items = feed.items.map((item) => (item.id === id ? { ...item, ...edited } : item));
      return HttpResponse.json(edited);
    }),
    http.delete(COMMENT_URL, ({ params }) => {
      const id = String(params.commentId);
      sent.push({ method: 'DELETE', id });
      feed.items = feed.items.filter((item) => item.id !== id);
      return new HttpResponse(null, { status: 204 });
    }),
  );
  return sent;
}

/** The "Kaydet" button of the form that holds the field (the comment form has one too). */
const saveButton = (field: HTMLElement) =>
  within(field.closest('form') as HTMLElement).getByRole('button', { name: 'Kaydet' });

const item = (dialog: HTMLElement, text: string) => {
  const found = within(dialog).getByText(text).closest('li');
  if (!found) throw new Error(`No feed item with "${text}"`);
  return within(found);
};

describe('comment buttons', () => {
  it('offers the author both "Düzenle" and "Sil"', async () => {
    openCard(CARD_PATH, {}, [], [], [MINE], 'MEMBER');
    const dialog = await cardDialog();
    await within(dialog).findByText('Benim yorumum');

    expect(item(dialog, 'Benim yorumum').getByRole('button', { name: 'Yorumu düzenle' })).toBeVisible();
    expect(item(dialog, 'Benim yorumum').getByRole('button', { name: 'Yorumu sil' })).toBeVisible();
  });

  it('shows a MEMBER no buttons on someone else\'s comment', async () => {
    openCard(CARD_PATH, {}, [], [], [THEIRS], 'MEMBER');
    const dialog = await cardDialog();
    await within(dialog).findByText('Can\'ın yorumu');

    expect(item(dialog, 'Can\'ın yorumu').queryByRole('button')).not.toBeInTheDocument();
  });

  it('lets an ADMIN delete but not edit someone else\'s comment', async () => {
    openCard(CARD_PATH, {}, [], [], [THEIRS], 'ADMIN');
    const dialog = await cardDialog();
    await within(dialog).findByText('Can\'ın yorumu');

    expect(item(dialog, 'Can\'ın yorumu').queryByRole('button', { name: 'Yorumu düzenle' })).not.toBeInTheDocument();
    expect(item(dialog, 'Can\'ın yorumu').getByRole('button', { name: 'Yorumu sil' })).toBeVisible();
  });

  it('keeps the visible text inside the accessible names', async () => {
    openCard(CARD_PATH, {}, [], [], [MINE]);
    const dialog = await cardDialog();
    await within(dialog).findByText('Benim yorumum');

    expect(item(dialog, 'Benim yorumum').getByRole('button', { name: /düzenle/i })).toHaveTextContent('Düzenle');
    expect(item(dialog, 'Benim yorumum').getByRole('button', { name: /sil/i })).toHaveTextContent('Sil');
  });
});

describe('editing a comment', () => {
  it('edits in place, sends the new text and marks the comment as edited', async () => {
    const { user, feed } = openCard(CARD_PATH, {}, [], [], [MINE]);
    const sent = writeEndpoints(feed);
    const dialog = await cardDialog();
    await within(dialog).findByText('Benim yorumum');

    await user.click(item(dialog, 'Benim yorumum').getByRole('button', { name: 'Yorumu düzenle' }));
    const field = within(dialog).getByRole('textbox', { name: 'Yorumu düzenle' });
    expect(field).toHaveValue('Benim yorumum');
    expect(field).toHaveFocus();
    await user.clear(field);
    await user.type(field, 'Düzeltilmiş');
    await user.click(saveButton(field));

    expect(await within(dialog).findByText('Düzeltilmiş')).toBeInTheDocument();
    expect(within(dialog).getByText('(düzenlendi)')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Yorumu düzenle' })).toHaveFocus();
    await waitFor(() => expect(sent).toEqual([{ method: 'PATCH', id: 'mine', body: 'Düzeltilmiş' }]));
  });

  it('saves with Ctrl+Enter and sends nothing when the text did not change', async () => {
    const { user, feed } = openCard(CARD_PATH, {}, [], [], [MINE]);
    const sent = writeEndpoints(feed);
    const dialog = await cardDialog();
    await within(dialog).findByText('Benim yorumum');

    await user.click(item(dialog, 'Benim yorumum').getByRole('button', { name: 'Yorumu düzenle' }));
    await user.type(within(dialog).getByRole('textbox', { name: 'Yorumu düzenle' }), '{Control>}{Enter}{/Control}');

    expect(within(dialog).queryByRole('textbox', { name: 'Yorumu düzenle' })).not.toBeInTheDocument();
    expect(within(dialog).queryByText('(düzenlendi)')).not.toBeInTheDocument();
    expect(sent).toEqual([]);
  });

  it('closes the editor on Escape without closing the dialog or saving', async () => {
    const { user, feed } = openCard(CARD_PATH, {}, [], [], [MINE]);
    const sent = writeEndpoints(feed);
    const dialog = await cardDialog();
    await within(dialog).findByText('Benim yorumum');

    await user.click(item(dialog, 'Benim yorumum').getByRole('button', { name: 'Yorumu düzenle' }));
    await user.type(within(dialog).getByRole('textbox', { name: 'Yorumu düzenle' }), ' fazla{Escape}');

    expect(within(dialog).queryByRole('textbox', { name: 'Yorumu düzenle' })).not.toBeInTheDocument();
    expect(within(dialog).getByText('Benim yorumum')).toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'Rapor' })).toBeInTheDocument();
    expect(sent).toEqual([]);
  });

  it('refuses an empty text', async () => {
    const { user, feed } = openCard(CARD_PATH, {}, [], [], [MINE]);
    const sent = writeEndpoints(feed);
    const dialog = await cardDialog();
    await within(dialog).findByText('Benim yorumum');

    await user.click(item(dialog, 'Benim yorumum').getByRole('button', { name: 'Yorumu düzenle' }));
    const field = within(dialog).getByRole('textbox', { name: 'Yorumu düzenle' });
    await user.clear(field);
    await user.click(saveButton(field));

    expect(await within(dialog).findByText('Yorum boş olamaz.')).toBeInTheDocument();
    expect(sent).toEqual([]);
  });

  it('shows the new text at once and puts the old one back when saving fails', async () => {
    const { user } = openCard(CARD_PATH, {}, [], [], [MINE]);
    const request = gate();
    server.use(
      http.patch(COMMENT_URL, async () => {
        await request.opened;
        return apiError(500, 'INTERNAL_ERROR');
      }),
    );
    const dialog = await cardDialog();
    await within(dialog).findByText('Benim yorumum');

    await user.click(item(dialog, 'Benim yorumum').getByRole('button', { name: 'Yorumu düzenle' }));
    const field = within(dialog).getByRole('textbox', { name: 'Yorumu düzenle' });
    await user.clear(field);
    await user.type(field, 'Yeni metin{Control>}{Enter}{/Control}');

    expect(await within(dialog).findByText('Yeni metin')).toBeInTheDocument();
    expect(within(dialog).getByText('(düzenlendi)')).toBeInTheDocument();

    request.release();
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Yorum kaydedilemedi. Tekrar dene.');
    expect(within(dialog).getByText('Benim yorumum')).toBeInTheDocument();
    expect(within(dialog).queryByText('(düzenlendi)')).not.toBeInTheDocument();
  });

  it('removes a comment that is gone and says so, leaving the counter to the refetch', async () => {
    const { user, feed, queryClient } = openCard(CARD_PATH, { commentCount: 3 }, [], [], [MINE]);
    server.use(
      http.patch(COMMENT_URL, () => {
        feed.items = [];
        return apiError(404, 'NOT_FOUND');
      }),
    );
    const dialog = await cardDialog();
    await within(dialog).findByText('Benim yorumum');

    await user.click(item(dialog, 'Benim yorumum').getByRole('button', { name: 'Yorumu düzenle' }));
    const refetch = gate();
    server.use(
      http.get(CARD_URL, async () => {
        await refetch.opened;
        return HttpResponse.json({});
      }),
    );
    await user.type(within(dialog).getByRole('textbox', { name: 'Yorumu düzenle' }), ' x{Control>}{Enter}{/Control}');

    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Yorum bulunamadı. Silinmiş olabilir.');
    expect(queryClient.getQueryData<{ commentCount: number }>(cardKeys.detail(BOARD_ID, CARD_ID))?.commentCount).toBe(3);
    refetch.release();
    await waitFor(() => expect(within(dialog).queryByText(/Benim yorumum/)).not.toBeInTheDocument());
  });
});

describe('deleting a comment', () => {
  it('asks first, then deletes and removes the comment', async () => {
    const { user, feed } = openCard(CARD_PATH, {}, [], [], [MINE, THEIRS], 'ADMIN');
    const sent = writeEndpoints(feed);
    const dialog = await cardDialog();
    await within(dialog).findByText('Can\'ın yorumu');

    await user.click(item(dialog, 'Can\'ın yorumu').getByRole('button', { name: 'Yorumu sil' }));
    const confirm = await screen.findByRole('dialog', { name: 'Yorum silinsin mi?' });
    expect(within(confirm).getByText('Bu yorum kalıcı olarak silinecek.')).toBeInTheDocument();
    expect(sent).toEqual([]);
    await user.click(within(confirm).getByRole('button', { name: 'Sil' }));

    await waitFor(() => expect(within(dialog).queryByText('Can\'ın yorumu')).not.toBeInTheDocument());
    expect(screen.queryByRole('dialog', { name: 'Yorum silinsin mi?' })).not.toBeInTheDocument();
    expect(within(dialog).getByText('Benim yorumum')).toBeInTheDocument();
    expect(sent).toEqual([{ method: 'DELETE', id: 'theirs' }]);
  });

  it('moves focus to the next comment\'s button after deleting, so it does not fall to the page', async () => {
    const { user, feed } = openCard(CARD_PATH, {}, [], [], [MINE, THEIRS], 'ADMIN');
    writeEndpoints(feed);
    const dialog = await cardDialog();
    await within(dialog).findByText('Can\'ın yorumu');

    await user.click(item(dialog, 'Benim yorumum').getByRole('button', { name: 'Yorumu sil' }));
    await user.click(within(await screen.findByRole('dialog', { name: 'Yorum silinsin mi?' })).getByRole('button', { name: 'Sil' }));

    await waitFor(() => expect(within(dialog).queryByText('Benim yorumum')).not.toBeInTheDocument());
    expect(item(dialog, 'Can\'ın yorumu').getByRole('button', { name: 'Yorumu sil' })).toHaveFocus();
  });

  it('moves focus to the comment form after deleting the last comment', async () => {
    const { user, feed } = openCard(CARD_PATH, {}, [], [], [MINE]);
    writeEndpoints(feed);
    const dialog = await cardDialog();
    await within(dialog).findByText('Benim yorumum');

    await user.click(item(dialog, 'Benim yorumum').getByRole('button', { name: 'Yorumu sil' }));
    await user.click(within(await screen.findByRole('dialog', { name: 'Yorum silinsin mi?' })).getByRole('button', { name: 'Sil' }));

    await waitFor(() => expect(within(dialog).queryByText('Benim yorumum')).not.toBeInTheDocument());
    expect(within(dialog).getByRole('textbox', { name: 'Yorum yaz' })).toHaveFocus();
  });

  it('keeps the comment when the user backs out', async () => {
    const { user, feed } = openCard(CARD_PATH, {}, [], [], [MINE]);
    const sent = writeEndpoints(feed);
    const dialog = await cardDialog();
    await within(dialog).findByText('Benim yorumum');

    await user.click(item(dialog, 'Benim yorumum').getByRole('button', { name: 'Yorumu sil' }));
    const confirm = await screen.findByRole('dialog', { name: 'Yorum silinsin mi?' });
    await user.click(within(confirm).getByRole('button', { name: 'Vazgeç' }));

    expect(screen.queryByRole('dialog', { name: 'Yorum silinsin mi?' })).not.toBeInTheDocument();
    expect(within(dialog).getByText('Benim yorumum')).toBeInTheDocument();
    expect(sent).toEqual([]);
  });

  it.each([
    ['500', () => apiError(500, 'INTERNAL_ERROR'), 'Yorum silinemedi. Tekrar dene.'],
    ['403', () => apiError(403, 'FORBIDDEN'), 'Bu işlem için yetkin yok.'],
  ])('brings the comment back when the server answers %s', async (_, failure, message) => {
    const { user } = openCard(CARD_PATH, {}, [], [], [MINE]);
    const request = gate();
    server.use(
      http.delete(COMMENT_URL, async () => {
        await request.opened;
        return failure();
      }),
    );
    const dialog = await cardDialog();
    await within(dialog).findByText('Benim yorumum');

    await user.click(item(dialog, 'Benim yorumum').getByRole('button', { name: 'Yorumu sil' }));
    await user.click(within(await screen.findByRole('dialog', { name: 'Yorum silinsin mi?' })).getByRole('button', { name: 'Sil' }));
    await waitFor(() => expect(within(dialog).queryByText('Benim yorumum')).not.toBeInTheDocument());

    request.release();
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(message);
    expect(within(dialog).getByText('Benim yorumum')).toBeInTheDocument();
  });

  it('leaves a comment gone when it was already deleted (404)', async () => {
    const { user, feed } = openCard(CARD_PATH, {}, [], [], [MINE]);
    server.use(
      http.delete(COMMENT_URL, () => {
        feed.items = [];
        return apiError(404, 'NOT_FOUND');
      }),
    );
    const dialog = await cardDialog();
    await within(dialog).findByText('Benim yorumum');

    await user.click(item(dialog, 'Benim yorumum').getByRole('button', { name: 'Yorumu sil' }));
    await user.click(within(await screen.findByRole('dialog', { name: 'Yorum silinsin mi?' })).getByRole('button', { name: 'Sil' }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Yorum bulunamadı. Silinmiş olabilir.');
    expect(within(dialog).queryByText('Benim yorumum')).not.toBeInTheDocument();
  });
});
