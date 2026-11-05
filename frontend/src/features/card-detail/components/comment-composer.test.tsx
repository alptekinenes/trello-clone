import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { CARD_PATH, CARD_URL, cardDialog, openCard, type FeedState } from '../../../test/card-dialog';
import { apiError, testComment } from '../../../test/fixtures';
import { gate } from '../../../test/gate';
import { server } from '../../../test/msw-server';

/** POST /cards/:id/comments like the server: the comment joins the feed; returns the bodies sent. */
function commentEndpoint(feed: FeedState, hold?: Promise<void>) {
  const sent: string[] = [];
  server.use(
    http.post(`${CARD_URL}/comments`, async ({ request }) => {
      const { body } = (await request.json()) as { body: string };
      sent.push(body);
      await hold;
      const comment = testComment({ id: `real-${sent.length}`, body, createdAt: new Date().toISOString() });
      feed.items = [comment, ...feed.items];
      return HttpResponse.json(comment, { status: 201 });
    }),
  );
  return sent;
}

const composer = (dialog: HTMLElement) => within(dialog).getByRole('textbox', { name: 'Yorum yaz' });

describe('comment composer', () => {
  it('shows the comment at once as pending, clears the field and swaps in the saved comment', async () => {
    const { user, feed } = openCard(CARD_PATH);
    const request = gate();
    const sent = commentEndpoint(feed, request.opened);
    const dialog = await cardDialog();
    expect(await within(dialog).findByText('Henüz yorum yok.')).toBeInTheDocument();

    await user.type(composer(dialog), 'İlk yorum');
    await user.click(within(dialog).getByRole('button', { name: 'Kaydet' }));

    const list = await within(dialog).findByRole('list', { name: 'Yorumlar ve etkinlik' });
    expect(within(list).getByText('İlk yorum')).toBeInTheDocument();
    expect(within(list).getByText('Gönderiliyor…')).toBeInTheDocument();
    expect(composer(dialog)).toHaveValue('');
    expect(within(dialog).queryByText('Henüz yorum yok.')).not.toBeInTheDocument();

    request.release();
    await waitFor(() => expect(within(list).queryByText('Gönderiliyor…')).not.toBeInTheDocument());
    expect(within(list).getAllByText('İlk yorum')).toHaveLength(1);
    expect(sent).toEqual(['İlk yorum']);
  });

  it('sends the trimmed text with its line breaks kept', async () => {
    const { user, feed } = openCard(CARD_PATH);
    const sent = commentEndpoint(feed);
    const dialog = await cardDialog();

    await user.type(composer(dialog), '  satır 1{Enter}satır 2  ');
    await user.click(within(dialog).getByRole('button', { name: 'Kaydet' }));

    await waitFor(() => expect(sent).toEqual(['satır 1\nsatır 2']));
  });

  it('sends with Ctrl+Enter', async () => {
    const { user, feed } = openCard(CARD_PATH);
    const sent = commentEndpoint(feed);
    const dialog = await cardDialog();

    await user.type(composer(dialog), 'Hızlı{Control>}{Enter}{/Control}');

    await waitFor(() => expect(sent).toEqual(['Hızlı']));
  });

  it('takes the comment back and puts the text in the field again when saving fails', async () => {
    const { user } = openCard(CARD_PATH);
    server.use(http.post(`${CARD_URL}/comments`, () => apiError(500, 'INTERNAL_ERROR')));
    const dialog = await cardDialog();

    await user.type(composer(dialog), 'Kaybolmasın');
    await user.click(within(dialog).getByRole('button', { name: 'Kaydet' }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Yorum gönderilemedi. Tekrar dene.');
    expect(composer(dialog)).toHaveValue('Kaybolmasın');
    expect(within(dialog).queryByRole('list', { name: 'Yorumlar ve etkinlik' })).not.toBeInTheDocument();
    expect(within(dialog).getByText('Henüz yorum yok.')).toBeInTheDocument();
  });

  it('keeps what was typed meanwhile when saving fails', async () => {
    const { user } = openCard(CARD_PATH);
    const request = gate();
    server.use(
      http.post(`${CARD_URL}/comments`, async () => {
        await request.opened;
        return apiError(500, 'INTERNAL_ERROR');
      }),
    );
    const dialog = await cardDialog();

    await user.type(composer(dialog), 'Birinci');
    await user.click(within(dialog).getByRole('button', { name: 'Kaydet' }));
    await user.type(composer(dialog), 'İkinci');
    request.release();

    expect(await within(dialog).findByRole('alert')).toBeInTheDocument();
    expect(composer(dialog)).toHaveValue('İkinci');
  });

  it('refuses an empty or blank comment and links the error to the field', async () => {
    const { user, feed } = openCard(CARD_PATH);
    const sent = commentEndpoint(feed);
    const dialog = await cardDialog();

    await user.click(within(dialog).getByRole('button', { name: 'Kaydet' }));
    expect(await within(dialog).findByText('Yorum boş olamaz.')).toBeInTheDocument();
    expect(composer(dialog)).toHaveAccessibleDescription('Yorum boş olamaz.');

    await user.type(composer(dialog), '   ');
    await user.click(within(dialog).getByRole('button', { name: 'Kaydet' }));
    expect(within(dialog).getByText('Yorum boş olamaz.')).toBeInTheDocument();
    expect(sent).toEqual([]);
  });

  it('refuses a comment over 5000 characters', async () => {
    const { user, feed } = openCard(CARD_PATH);
    const sent = commentEndpoint(feed);
    const dialog = await cardDialog();

    await user.click(composer(dialog));
    await user.paste('a'.repeat(5_001));
    await user.click(within(dialog).getByRole('button', { name: 'Kaydet' }));

    expect(await within(dialog).findByText('Yorum en fazla 5000 karakter olabilir.')).toBeInTheDocument();
    expect(sent).toEqual([]);
  });

  it('leaves a filled field on Escape without closing the dialog, but lets an empty one close it', async () => {
    const { user } = openCard(CARD_PATH);
    const dialog = await cardDialog();
    const field = composer(dialog);

    await user.type(field, 'yarım');
    expect(fireEvent.keyDown(field, { key: 'Escape' })).toBe(false);
    expect(field).toHaveValue('yarım');
    expect(field).not.toHaveFocus();
    expect(screen.getByRole('dialog', { name: 'Rapor' })).toBeInTheDocument();

    await user.clear(field);
    expect(fireEvent.keyDown(field, { key: 'Escape' })).toBe(true);
  });
});
