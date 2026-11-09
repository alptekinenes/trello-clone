import { cleanup, screen, waitFor, within } from '@testing-library/react';
import { delay, http } from 'msw';
import { describe, expect, it } from 'vitest';
import { COVER_SAVE_DELAY_MS } from '../hooks/use-card-cover';
import { CARD_PATH, CARD_URL, cardDialog, openCard, recordPatches } from '../../../test/card-dialog';
import { apiError } from '../../../test/fixtures';
import { server } from '../../../test/msw-server';

describe('card cover', () => {
  it('shows no cover strip and no picker until asked', async () => {
    openCard(CARD_PATH);
    const dialog = await cardDialog();

    expect(within(dialog).queryByTestId('card-cover')).not.toBeInTheDocument();
    expect(within(dialog).queryByRole('group', { name: 'Kapak rengi' })).not.toBeInTheDocument();
  });

  it('shows the strip of a covered card', async () => {
    openCard(CARD_PATH, { coverColor: 'RED' });
    const dialog = await cardDialog();

    expect(within(dialog).getByTestId('card-cover')).toHaveAttribute('aria-hidden', 'true');
  });

  it('picks a color: the strip shows at once and the color goes to the server', async () => {
    const { user, serverCard } = openCard(CARD_PATH);
    const sent = recordPatches(serverCard);
    const dialog = await cardDialog();

    const opener = within(dialog).getByRole('button', { name: 'Kapak' });
    expect(opener).toHaveAttribute('aria-expanded', 'false');
    await user.click(opener);
    expect(opener).toHaveAttribute('aria-expanded', 'true');
    const group = within(dialog).getByRole('group', { name: 'Kapak rengi' });
    expect(within(group).getByRole('radio', { name: 'Kapak yok' })).toBeChecked();
    await user.click(within(group).getByRole('radio', { name: 'Mavi' }));

    expect(within(group).getByRole('radio', { name: 'Mavi' })).toBeChecked();
    expect(await within(dialog).findByTestId('card-cover')).toBeInTheDocument();
    await waitFor(() => expect(sent).toEqual([{ coverColor: 'BLUE' }]));
  });

  it('removes the cover with "Kapak yok" (null)', async () => {
    const { user, serverCard } = openCard(CARD_PATH, { coverColor: 'RED' });
    const sent = recordPatches(serverCard);
    const dialog = await cardDialog();

    await user.click(within(dialog).getByRole('button', { name: 'Kapak' }));
    const red = within(dialog).getByRole('radio', { name: 'Kırmızı' });
    expect(red).toBeChecked();
    expect(red).toHaveFocus();
    await user.click(within(dialog).getByRole('radio', { name: 'Kapak yok' }));

    expect(within(dialog).getByRole('radio', { name: 'Kapak yok' })).toBeChecked();
    await waitFor(() => expect(sent).toEqual([{ coverColor: null, coverAttachmentId: null }]));
    expect(within(dialog).queryByTestId('card-cover')).not.toBeInTheDocument();
  });

  it('sends one request for a run of arrow presses, with the color it ended on', async () => {
    const { user, serverCard } = openCard(CARD_PATH);
    const sent = recordPatches(serverCard);
    const dialog = await cardDialog();

    await user.click(within(dialog).getByRole('button', { name: 'Kapak' }));
    within(dialog).getByRole('radio', { name: 'Kapak yok' }).focus();
    await user.keyboard('{ArrowDown}{ArrowDown}{ArrowDown}');

    expect(within(dialog).getByRole('radio', { name: 'Kapak yok' })).not.toBeChecked();
    await waitFor(() => expect(sent).toHaveLength(1));
    await delay(COVER_SAVE_DELAY_MS + 100);
    expect(sent).toHaveLength(1);
    const checked = within(dialog).getAllByRole('radio').find((radio) => (radio as HTMLInputElement).checked);
    expect(checked).toBe(document.activeElement);
    expect(sent[0].coverColor).not.toBe('GREEN');
  });

  it('saves a pick at once when the dialog closes before the delay ends', async () => {
    const { user, serverCard } = openCard(CARD_PATH);
    const sent = recordPatches(serverCard);
    const dialog = await cardDialog();

    await user.click(within(dialog).getByRole('button', { name: 'Kapak' }));
    await user.click(within(dialog).getByRole('radio', { name: 'Mavi' }));
    expect(sent).toEqual([]);
    cleanup();

    await waitFor(() => expect(sent).toEqual([{ coverColor: 'BLUE' }]));
  });

  it('moves between colors with the arrow keys', async () => {
    const { user, serverCard } = openCard(CARD_PATH);
    const sent = recordPatches(serverCard);
    const dialog = await cardDialog();

    await user.click(within(dialog).getByRole('button', { name: 'Kapak' }));
    within(dialog).getByRole('radio', { name: 'Kapak yok' }).focus();
    await user.keyboard('{ArrowDown}');

    await waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0].coverColor).toBe('GREEN');
    expect(within(dialog).getByRole('radio', { name: 'Yeşil' })).toBeChecked();
  });

  it('undoes the change and says so in the dialog when saving fails', async () => {
    const { user } = openCard(CARD_PATH);
    server.use(http.patch(CARD_URL, () => apiError(500, 'INTERNAL_ERROR')));
    const dialog = await cardDialog();

    await user.click(within(dialog).getByRole('button', { name: 'Kapak' }));
    await user.click(within(dialog).getByRole('radio', { name: 'Mavi' }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'Değişiklik kaydedilemedi. Tekrar dene.',
    );
    expect(within(dialog).queryByTestId('card-cover')).not.toBeInTheDocument();
    expect(within(dialog).getByRole('radio', { name: 'Kapak yok' })).toBeChecked();
  });

  it('closes only the section on Escape and gives the focus back to the button', async () => {
    const { user } = openCard(CARD_PATH);
    const dialog = await cardDialog();

    await user.click(within(dialog).getByRole('button', { name: 'Kapak' }));
    await user.keyboard('{Escape}');

    expect(within(dialog).queryByRole('group', { name: 'Kapak rengi' })).not.toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'Rapor' })).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Kapak' })).toHaveFocus();
  });

  it('shows an image cover instead of the strip and checks no option', async () => {
    const { user } = openCard(CARD_PATH, { coverAttachmentId: 'att-photo' });
    const dialog = await cardDialog();

    expect(await within(dialog).findByTestId('card-cover-image')).toHaveAttribute('aria-hidden', 'true');
    expect(within(dialog).queryByTestId('card-cover')).not.toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Kapak' }));

    expect(within(dialog).getByText('Kapak olarak bir görsel kullanılıyor.')).toBeInTheDocument();
    expect(within(dialog).getAllByRole('radio').filter((radio) => (radio as HTMLInputElement).checked)).toEqual([]);
  });

  it('removes an image cover with "Kapak yok": both fields go to the server as null', async () => {
    const { user, serverCard } = openCard(CARD_PATH, { coverAttachmentId: 'att-photo' });
    const sent = recordPatches(serverCard);
    const dialog = await cardDialog();

    await user.click(within(dialog).getByRole('button', { name: 'Kapak' }));
    await user.click(within(dialog).getByRole('radio', { name: 'Kapak yok' }));

    await waitFor(() => expect(sent).toEqual([{ coverColor: null, coverAttachmentId: null }]));
    expect(within(dialog).queryByTestId('card-cover-image')).not.toBeInTheDocument();
    expect(within(dialog).getByRole('radio', { name: 'Kapak yok' })).toBeChecked();
    expect(within(dialog).queryByText('Kapak olarak bir görsel kullanılıyor.')).not.toBeInTheDocument();
  });

  it('replaces an image cover with a color, sending only the color', async () => {
    const { user, serverCard } = openCard(CARD_PATH, { coverAttachmentId: 'att-photo' });
    const sent = recordPatches(serverCard);
    const dialog = await cardDialog();

    await user.click(within(dialog).getByRole('button', { name: 'Kapak' }));
    await user.click(within(dialog).getByRole('radio', { name: 'Mavi' }));

    await waitFor(() => expect(sent).toEqual([{ coverColor: 'BLUE' }]));
    expect(await within(dialog).findByTestId('card-cover')).toBeInTheDocument();
    expect(within(dialog).queryByTestId('card-cover-image')).not.toBeInTheDocument();
  });
});
