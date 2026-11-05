import { waitFor, within } from '@testing-library/react';
import { http } from 'msw';
import { describe, expect, it } from 'vitest';
import { CARD_PATH, CARD_URL, cardDialog, openCard, recordPatches } from '../../../test/card-dialog';
import { apiError } from '../../../test/fixtures';
import { server } from '../../../test/msw-server';

describe('completing a card', () => {
  it('sits left of the title and marks the card complete at once', async () => {
    const { user, serverCard } = openCard(CARD_PATH);
    const sent = recordPatches(serverCard);
    const dialog = await cardDialog();

    const box = within(dialog).getByRole('checkbox', { name: 'Kartı tamamla' });
    const title = within(dialog).getByRole('button', { name: 'Rapor' });
    expect(box.compareDocumentPosition(title) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(box).not.toBeChecked();
    await user.click(box);

    expect(box).toBeChecked();
    await waitFor(() => expect(sent).toEqual([{ isCompleted: true }]));
  });

  it('shows a completed card as checked and clears it with isCompleted false', async () => {
    const { user, serverCard } = openCard(CARD_PATH, { completedAt: '2026-11-05T09:00:00.000Z' });
    const sent = recordPatches(serverCard);
    const dialog = await cardDialog();

    const box = within(dialog).getByRole('checkbox', { name: 'Kartı tamamla' });
    expect(box).toBeChecked();
    await user.click(box);

    expect(box).not.toBeChecked();
    await waitFor(() => expect(sent).toEqual([{ isCompleted: false }]));
  });

  it('can be toggled with the keyboard', async () => {
    const { user, serverCard } = openCard(CARD_PATH);
    const sent = recordPatches(serverCard);
    const dialog = await cardDialog();

    within(dialog).getByRole('checkbox', { name: 'Kartı tamamla' }).focus();
    await user.keyboard(' ');

    await waitFor(() => expect(sent).toEqual([{ isCompleted: true }]));
  });

  it('undoes the change and says so in the dialog when saving fails', async () => {
    const { user } = openCard(CARD_PATH);
    server.use(http.patch(CARD_URL, () => apiError(500, 'INTERNAL_ERROR')));
    const dialog = await cardDialog();

    const box = within(dialog).getByRole('checkbox', { name: 'Kartı tamamla' });
    await user.click(box);

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'Değişiklik kaydedilemedi. Tekrar dene.',
    );
    expect(box).not.toBeChecked();
  });
});
