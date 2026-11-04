import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { delay, http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { BOARD_ID, apiError, testCard, testLists } from '../../../test/fixtures';
import { server } from '../../../test/msw-server';
import { renderWithProviders } from '../../../test/render';
import { ArchiveDialog } from './archive-dialog';

const CARDS_URL = `*/api/v1/boards/${BOARD_ID}/cards`;
const LISTS_URL = `*/api/v1/boards/${BOARD_ID}/lists`;
const [TODO] = testLists('Yapılacaklar');

function openArchive() {
  renderWithProviders(
    <ArchiveDialog boardId={BOARD_ID} lists={[TODO]} canDeleteLists onClose={() => undefined} />,
  );
  return userEvent.setup();
}

const dialog = () => screen.getByRole('dialog', { name: 'Arşiv' });

describe('ArchiveDialog states', () => {
  it('says in a status region that cards and lists are loading', () => {
    server.use(
      http.get(CARDS_URL, async () => {
        await delay('infinite');
        return HttpResponse.json([]);
      }),
      http.get(LISTS_URL, async () => {
        await delay('infinite');
        return HttpResponse.json([]);
      }),
    );
    openArchive();

    expect(within(dialog()).getByText('Kartlar yükleniyor…').closest('output')).not.toBeNull();
    expect(within(dialog()).getByText('Listeler yükleniyor…').closest('output')).not.toBeNull();
  });

  it('says in a status region when nothing is archived', async () => {
    server.use(
      http.get(CARDS_URL, () => HttpResponse.json([])),
      http.get(LISTS_URL, () => HttpResponse.json([])),
    );
    openArchive();

    expect((await within(dialog()).findByText('Arşivde kart yok.')).closest('output')).not.toBeNull();
    expect(within(dialog()).getByText('Arşivde liste yok.').closest('output')).not.toBeNull();
  });

  it('announces a load failure with a retry that loads the list', async () => {
    let attempts = 0;
    server.use(
      http.get(CARDS_URL, () => {
        attempts += 1;
        return attempts === 1
          ? apiError(500, 'INTERNAL_ERROR')
          : HttpResponse.json([testCard({ id: 'old', listId: TODO.id, title: 'Eski kart' })]);
      }),
      http.get(LISTS_URL, () => HttpResponse.json([])),
    );
    const user = openArchive();

    expect(await within(dialog()).findByRole('alert')).toHaveTextContent(
      'Sunucuya şu an ulaşılamıyor. Biraz sonra tekrar dene.',
    );
    await user.click(within(dialog()).getByRole('button', { name: 'Tekrar dene' }));

    expect(
      await within(dialog()).findByRole('button', { name: '“Eski kart” kartını geri yükle' }),
    ).toBeInTheDocument();
    expect(within(dialog()).queryByRole('alert')).not.toBeInTheDocument();
  });

  it('explains a lost connection in plain words', async () => {
    server.use(
      http.get(CARDS_URL, () => HttpResponse.error()),
      http.get(LISTS_URL, () => HttpResponse.json([])),
    );
    openArchive();

    expect(await within(dialog()).findByRole('alert')).toHaveTextContent(/^Bağlantı kurulamadı/);
  });
});
