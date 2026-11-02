import { screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CARD_PATH, cardDialog, openCard, recordPatches } from '../../../test/card-dialog';

afterEach(() => vi.unstubAllEnvs());

describe('description', () => {
  it('saves the text and shows the indicator on the tile', async () => {
    const { user, serverCard } = openCard(CARD_PATH);
    const sent = recordPatches(serverCard);
    const dialog = await cardDialog();

    await user.click(
      within(dialog).getByRole('button', { name: 'Daha ayrıntılı bir açıklama ekle…' }),
    );
    await user.type(within(dialog).getByRole('textbox', { name: 'Açıklama' }), 'İlk satır{Enter}İkinci');
    await user.click(within(dialog).getByRole('button', { name: 'Kaydet' }));

    expect(within(dialog).getByText(/İlk satır/)).toBeInTheDocument();
    expect(within(dialog).queryByRole('textbox')).not.toBeInTheDocument();
    await waitFor(() => expect(sent).toEqual([{ description: 'İlk satır\nİkinci' }]));
    expect(screen.getByText('Açıklaması var')).toBeInTheDocument();
  });

  it('cancels without saving, and Escape does not close the dialog', async () => {
    const { user, serverCard } = openCard(CARD_PATH, { description: 'Eski' });
    const sent = recordPatches(serverCard);
    const dialog = await cardDialog();

    await user.click(within(dialog).getByRole('button', { name: 'Açıklamayı düzenle' }));
    await user.type(within(dialog).getByRole('textbox', { name: 'Açıklama' }), ' yeni{Escape}');

    expect(within(dialog).queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'Rapor' })).toBeInTheDocument();
    expect(within(dialog).getByText('Eski')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Açıklamayı düzenle' })).toHaveFocus();
    expect(sent).toEqual([]);
  });

  it('saves with Ctrl+Enter', async () => {
    const { user, serverCard } = openCard(CARD_PATH);
    const sent = recordPatches(serverCard);
    const dialog = await cardDialog();

    await user.click(within(dialog).getByRole('button', { name: /açıklama ekle/ }));
    await user.type(within(dialog).getByRole('textbox', { name: 'Açıklama' }), 'Hızlı{Control>}{Enter}{/Control}');

    await waitFor(() => expect(sent).toEqual([{ description: 'Hızlı' }]));
  });

  it('shows HTML as plain text', async () => {
    openCard(CARD_PATH, { description: '<b>kalın</b> <img src=x onerror=alert(1)>' });
    const dialog = await cardDialog();

    expect(within(dialog).getByText('<b>kalın</b> <img src=x onerror=alert(1)>')).toBeInTheDocument();
    expect(dialog.querySelector('b, img')).toBeNull();
  });

  it('sends null when the text is cleared, and the tile loses the indicator', async () => {
    const { user, serverCard } = openCard(CARD_PATH, { description: 'Eski', hasDescription: true });
    const sent = recordPatches(serverCard);
    const dialog = await cardDialog();
    expect(screen.getByText('Açıklaması var')).toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: 'Açıklamayı düzenle' }));
    const field = within(dialog).getByRole('textbox', { name: 'Açıklama' });
    await user.clear(field);
    await user.type(field, '   ');
    await user.click(within(dialog).getByRole('button', { name: 'Kaydet' }));

    await waitFor(() => expect(sent).toEqual([{ description: null }]));
    await waitFor(() => expect(screen.queryByText('Açıklaması var')).not.toBeInTheDocument());
  });

  it('refuses a description over 10000 characters', async () => {
    const { user, serverCard } = openCard(CARD_PATH);
    const sent = recordPatches(serverCard);
    const dialog = await cardDialog();

    await user.click(within(dialog).getByRole('button', { name: /açıklama ekle/ }));
    const field = within(dialog).getByRole('textbox', { name: 'Açıklama' });
    await user.click(field);
    await user.paste('a'.repeat(10_001));
    await user.click(within(dialog).getByRole('button', { name: 'Kaydet' }));

    expect(field).toHaveAccessibleDescription('Açıklama en fazla 10000 karakter olabilir.');
    expect(sent).toEqual([]);
  });
});

describe('due date', () => {
  it('sends the local time as a UTC instant', async () => {
    vi.stubEnv('TZ', 'Europe/Istanbul');
    const { user, serverCard } = openCard(CARD_PATH);
    const sent = recordPatches(serverCard);
    const dialog = await cardDialog();

    const opener = within(dialog).getByRole('button', { name: 'Son tarih' });
    expect(opener).toHaveAttribute('aria-expanded', 'false');
    await user.click(opener);
    expect(opener).toHaveAttribute('aria-expanded', 'true');
    const input = within(dialog).getByLabelText('Son tarih', { selector: 'input' });
    expect(input).toHaveFocus();
    await user.clear(input);
    await user.type(input, '2026-11-05T14:30');
    await user.click(within(dialog).getByRole('button', { name: 'Kaydet' }));

    await waitFor(() => expect(sent).toEqual([{ dueDate: '2026-11-05T11:30:00.000Z' }]));
    expect(within(dialog).getByLabelText('Tamamlandı')).not.toBeChecked();
    expect(opener).toHaveFocus();
    expect(opener).toHaveAttribute('aria-expanded', 'false');
  });

  it('starts a card without a date at tomorrow noon and has no remove button', async () => {
    const { user } = openCard(CARD_PATH);
    const dialog = await cardDialog();

    await user.click(within(dialog).getByRole('button', { name: 'Son tarih' }));

    const input = within(dialog).getByLabelText('Son tarih', { selector: 'input' });
    expect((input as HTMLInputElement).value).toMatch(/T12:00$/);
    expect(within(dialog).queryByRole('button', { name: 'Kaldır' })).not.toBeInTheDocument();
  });

  it('removes the date with "Kaldır"', async () => {
    const { user, serverCard } = openCard(CARD_PATH, { dueDate: '2026-11-05T11:30:00.000Z' });
    const sent = recordPatches(serverCard);
    const dialog = await cardDialog();

    await user.click(within(dialog).getByRole('button', { name: 'Son tarih' }));
    await user.click(within(dialog).getByRole('button', { name: 'Kaldır' }));

    await waitFor(() => expect(sent).toEqual([{ dueDate: null }]));
    expect(within(dialog).queryByLabelText('Tamamlandı')).not.toBeInTheDocument();
  });

  it('marks the due date as complete', async () => {
    const { user, serverCard } = openCard(CARD_PATH, { dueDate: '2026-11-05T11:30:00.000Z' });
    const sent = recordPatches(serverCard);
    const dialog = await cardDialog();

    await user.click(within(dialog).getByLabelText('Tamamlandı'));

    await waitFor(() => expect(sent).toEqual([{ dueComplete: true }]));
    expect(within(dialog).getByLabelText('Tamamlandı')).toBeChecked();
  });

  it('asks for a date when the field is empty and closes with Escape without closing the dialog', async () => {
    const { user, serverCard } = openCard(CARD_PATH);
    const sent = recordPatches(serverCard);
    const dialog = await cardDialog();

    await user.click(within(dialog).getByRole('button', { name: 'Son tarih' }));
    await user.clear(within(dialog).getByLabelText('Son tarih', { selector: 'input' }));
    await user.click(within(dialog).getByRole('button', { name: 'Kaydet' }));
    expect(await within(dialog).findByText('Bir tarih ve saat seç.')).toBeInTheDocument();
    expect(sent).toEqual([]);

    await user.keyboard('{Escape}');
    expect(within(dialog).queryByLabelText('Son tarih')).not.toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'Rapor' })).toBeInTheDocument();
  });
});
