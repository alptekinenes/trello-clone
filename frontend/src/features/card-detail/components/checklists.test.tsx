import { screen, waitFor, within } from '@testing-library/react';
import type { CardDetailDto, ChecklistDto, ChecklistItemDto } from '@trello/contracts';
import { delay, http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { CARD_PATH, CARD_URL, cardDialog, openCard } from '../../../test/card-dialog';
import { apiError } from '../../../test/fixtures';
import { server } from '../../../test/msw-server';
import { useToastStore } from '../../../shared/store/toast-store';
import { useCardDetailStore } from '../store/card-detail-store';

const CARD_ID = 'card-1';

function item(id: string, content: string, position: number, isCompleted = false): ChecklistItemDto {
  return { id, checklistId: 'cl-1', content, isCompleted, position };
}

function checklist(id: string, title: string, position: number, items: ChecklistItemDto[] = []): ChecklistDto {
  return {
    id,
    cardId: CARD_ID,
    title,
    position,
    items: items.map((entry) => ({ ...entry, checklistId: id })),
  };
}

const TODO_LIST = checklist('cl-1', 'Yapılacaklar', 1024, [
  item('i-1', 'Taslak', 1024),
  item('i-2', 'Gözden geçir', 2048),
]);
const SECOND_LIST = checklist('cl-2', 'Yayın', 2048);

type ServerState = { card: CardDetailDto };

const updateChecklists = (state: ServerState, fn: (lists: ChecklistDto[]) => ChecklistDto[]) => {
  state.card = { ...state.card, checklists: fn(state.card.checklists) };
};

/** Item endpoints like the server: the card's checklists change. */
function itemEndpoints(state: ServerState) {
  const bodies: unknown[] = [];
  server.use(
    http.patch('*/api/v1/checklist-items/:itemId', async ({ request, params }) => {
      const body = (await request.json()) as Partial<ChecklistItemDto>;
      bodies.push(body);
      let answer: ChecklistItemDto | undefined;
      updateChecklists(state, (lists) =>
        lists.map((list) => ({
          ...list,
          items: list.items.map((entry) => {
            if (entry.id !== params.itemId) return entry;
            answer = { ...entry, ...body };
            return answer;
          }),
        })),
      );
      return HttpResponse.json(answer);
    }),
    http.post('*/api/v1/checklists/:checklistId/items', async ({ request, params }) => {
      const body = (await request.json()) as { content: string };
      bodies.push(body);
      const checklistId = String(params.checklistId);
      const created = { ...item(`new-${bodies.length}`, body.content, 1024 * (bodies.length + 2)), checklistId };
      updateChecklists(state, (lists) =>
        lists.map((list) => (list.id === checklistId ? { ...list, items: [...list.items, created] } : list)),
      );
      return HttpResponse.json(created, { status: 201 });
    }),
    http.delete('*/api/v1/checklist-items/:itemId', ({ params }) => {
      updateChecklists(state, (lists) =>
        lists.map((list) => ({ ...list, items: list.items.filter((entry) => entry.id !== params.itemId) })),
      );
      return new HttpResponse(null, { status: 204 });
    }),
  );
  return bodies;
}

describe('item ticks', () => {
  it('updates the tile counter at once and keeps it after the answer', async () => {
    const { user, serverCard } = openCard(CARD_PATH, { checklists: [TODO_LIST] });
    itemEndpoints(serverCard);
    server.use(
      http.patch('*/api/v1/checklist-items/i-1', async () => {
        await delay(80);
        return HttpResponse.json({ ...TODO_LIST.items[0], isCompleted: true });
      }),
    );
    const dialog = await cardDialog();
    expect(screen.getByText('0/2')).toBeInTheDocument();

    await user.click(within(dialog).getByRole('checkbox', { name: 'Taslak' }));

    // The server has not answered yet.
    expect(screen.getByText('1/2')).toBeInTheDocument();
    expect(within(dialog).getByRole('progressbar')).toHaveAttribute(
      'aria-valuetext',
      "2 öğeden 1'si tamamlandı",
    );
    await waitFor(() => expect(screen.getByText('1/2')).toBeInTheDocument());
  });

  it('puts the tile counter and the checkbox back when saving fails', async () => {
    const { user } = openCard(CARD_PATH, { checklists: [TODO_LIST] });
    server.use(http.patch('*/api/v1/checklist-items/i-1', () => apiError(500, 'INTERNAL_ERROR')));
    const dialog = await cardDialog();

    await user.click(within(dialog).getByRole('checkbox', { name: 'Taslak' }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Öğe kaydedilemedi.');
    expect(within(dialog).getByRole('checkbox', { name: 'Taslak' })).not.toBeChecked();
    expect(screen.getByText('0/2')).toBeInTheDocument();
  });
});

describe('adding', () => {
  it('adds a checklist from the section and closes it', async () => {
    const { user, serverCard } = openCard(CARD_PATH);
    const sent: unknown[] = [];
    server.use(
      http.post(`${CARD_URL}/checklists`, async ({ request }) => {
        const body = (await request.json()) as { title: string };
        sent.push(body);
        const created = checklist('cl-new', body.title, 1024);
        updateChecklists(serverCard, (lists) => [...lists, created]);
        return HttpResponse.json(created, { status: 201 });
      }),
    );
    const dialog = await cardDialog();

    const opener = within(dialog).getByRole('button', { name: 'Checklist' });
    await user.click(opener);
    const title = within(dialog).getByRole('textbox', { name: 'Checklist başlığı' });
    expect(title).toHaveValue('Checklist');
    await user.clear(title);
    await user.type(title, 'Yayın{Enter}');

    expect(await within(dialog).findByRole('heading', { name: 'Yayın' })).toBeInTheDocument();
    expect(sent).toEqual([{ title: 'Yayın' }]);
    expect(within(dialog).queryByRole('textbox', { name: 'Checklist başlığı' })).not.toBeInTheDocument();
    expect(opener).toHaveFocus();
  });

  it('keeps the composer open and empties the field to add the next item', async () => {
    const { user, serverCard } = openCard(CARD_PATH, { checklists: [SECOND_LIST] });
    const bodies = itemEndpoints(serverCard);
    const dialog = await cardDialog();

    await user.click(within(dialog).getByRole('button', { name: '“Yayın” checklist\'ine öğe ekle' }));
    const field = within(dialog).getByRole('textbox', { name: 'Yeni öğe' });
    await user.type(field, 'Birinci{Enter}');
    expect(field).toHaveValue('');
    expect(field).toHaveFocus();
    await user.type(field, 'İkinci{Enter}');

    await waitFor(() => expect(bodies).toEqual([{ content: 'Birinci' }, { content: 'İkinci' }]));
    expect(await within(dialog).findByRole('checkbox', { name: 'İkinci' })).toBeInTheDocument();
    expect(screen.getByText('0/2')).toBeInTheDocument();

    await user.keyboard('{Escape}');
    expect(within(dialog).queryByRole('textbox', { name: 'Yeni öğe' })).not.toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'Rapor' })).toBeInTheDocument();
  });
});

describe('deleting', () => {
  it('asks first, then drops the checklist and its items from the tile counter', async () => {
    const { user, serverCard } = openCard(CARD_PATH, { checklists: [TODO_LIST] });
    server.use(
      http.delete('*/api/v1/checklists/cl-1', () => {
        updateChecklists(serverCard, () => []);
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const dialog = await cardDialog();
    expect(screen.getByText('0/2')).toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: '“Yapılacaklar” checklist\'ini sil' }));
    const confirm = await screen.findByRole('dialog', { name: 'Checklist silinsin mi?' });
    expect(confirm).toHaveTextContent('2 öğe silinecek');
    await user.click(within(confirm).getByRole('button', { name: 'Checklist\'i sil' }));

    await waitFor(() => expect(screen.queryByText('0/2')).not.toBeInTheDocument());
    expect(within(dialog).queryByRole('heading', { name: 'Yapılacaklar' })).not.toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'Checklist silinsin mi?' })).not.toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Checklist' })).toHaveFocus();
  });

  it('deletes an item at once and moves the focus to the next one', async () => {
    const { user, serverCard } = openCard(CARD_PATH, { checklists: [TODO_LIST] });
    itemEndpoints(serverCard);
    const dialog = await cardDialog();

    await user.click(within(dialog).getByRole('button', { name: '“Taslak” öğesini sil' }));

    expect(within(dialog).queryByRole('checkbox', { name: 'Taslak' })).not.toBeInTheDocument();
    expect(within(dialog).getByRole('checkbox', { name: 'Gözden geçir' })).toHaveFocus();
    expect(screen.getByText('0/1')).toBeInTheDocument();
  });

  it('edits an item text', async () => {
    const { user, serverCard } = openCard(CARD_PATH, { checklists: [TODO_LIST] });
    const bodies = itemEndpoints(serverCard);
    const dialog = await cardDialog();

    await user.click(within(dialog).getByRole('button', { name: 'Taslak' }));
    const input = within(dialog).getByRole('textbox', { name: 'Öğe metni' });
    await user.clear(input);
    await user.type(input, 'Yeni taslak{Enter}');

    await waitFor(() => expect(bodies).toEqual([{ content: 'Yeni taslak' }]));
    expect(within(dialog).getByRole('checkbox', { name: 'Yeni taslak' })).toBeInTheDocument();
  });
});

describe('moving and renaming', () => {
  function checklistMoveEndpoint(state: ServerState) {
    const bodies: unknown[] = [];
    server.use(
      http.post('*/api/v1/checklists/:checklistId/move', async ({ request, params }) => {
        const body = (await request.json()) as { afterChecklistId: string | null; beforeChecklistId: string | null };
        bodies.push({ id: params.checklistId, ...body });
        const position = 3072;
        updateChecklists(state, (lists) =>
          lists.map((list) => (list.id === params.checklistId ? { ...list, position } : list)).sort((a, b) => a.position - b.position),
        );
        return HttpResponse.json({ id: params.checklistId, position });
      }),
    );
    return bodies;
  }

  const headings = (dialog: HTMLElement) =>
    within(dialog)
      .getAllByRole('heading', { level: 3 })
      .map((heading) => heading.querySelector('button')?.textContent ?? heading.textContent);

  it('moves a checklist down with the right neighbours and keeps the focus on the button', async () => {
    const { user, serverCard } = openCard(CARD_PATH, { checklists: [TODO_LIST, SECOND_LIST] });
    const bodies = checklistMoveEndpoint(serverCard);
    const dialog = await cardDialog();
    expect(within(dialog).getByRole('button', { name: '“Yapılacaklar” checklist\'ini yukarı taşı' })).toBeDisabled();

    const down = within(dialog).getByRole('button', { name: '“Yapılacaklar” checklist\'ini aşağı taşı' });
    await user.click(down);

    await waitFor(() => expect(headings(dialog).slice(-2)).toEqual(['Yayın', 'Yapılacaklar']));
    expect(bodies).toEqual([{ id: 'cl-1', afterChecklistId: 'cl-2', beforeChecklistId: null }]);
    // Last now, so the down button is disabled and the focus goes to the up button.
    expect(
      within(dialog).getByRole('button', { name: '“Yapılacaklar” checklist\'ini yukarı taşı' }),
    ).toHaveFocus();
    expect(
      within(dialog).getByText('“Yapılacaklar” checklist\'i 2. sıraya taşındı.'),
    ).toBeInTheDocument();
  });

  it('renames a checklist', async () => {
    const { user, serverCard } = openCard(CARD_PATH, { checklists: [SECOND_LIST] });
    const sent: unknown[] = [];
    server.use(
      http.patch('*/api/v1/checklists/cl-2', async ({ request }) => {
        const body = (await request.json()) as { title: string };
        sent.push(body);
        updateChecklists(serverCard, (lists) => lists.map((list) => ({ ...list, title: body.title })));
        return HttpResponse.json({ ...SECOND_LIST, title: body.title });
      }),
    );
    const dialog = await cardDialog();

    await user.click(within(dialog).getByRole('button', { name: 'Yayın' }));
    const input = within(dialog).getByRole('textbox', { name: 'Checklist başlığı' });
    await user.clear(input);
    await user.type(input, 'Yayına çıkış{Enter}');

    expect(within(dialog).getByRole('heading', { name: 'Yayına çıkış' })).toBeInTheDocument();
    await waitFor(() => expect(sent).toEqual([{ title: 'Yayına çıkış' }]));
  });
});

describe('dragging items', () => {
  it('gives each item a grip button for the keyboard', async () => {
    openCard(CARD_PATH, { checklists: [TODO_LIST] });
    const dialog = await cardDialog();

    const grip = within(dialog).getByRole('button', { name: '“Taslak” öğesini taşı' });
    expect(grip).toHaveAttribute('aria-roledescription', 'sıralanabilir öğe');
  });

  it('announces a lift inside the dialog and cancels with Escape without closing it', async () => {
    const { user } = openCard(CARD_PATH, { checklists: [TODO_LIST, SECOND_LIST] });
    const dialog = await cardDialog();

    within(dialog).getByRole('button', { name: '“Taslak” öğesini taşı' }).focus();
    await user.keyboard(' ');

    expect(
      await within(dialog).findByText('“Taslak” öğesi tutuldu. “Yapılacaklar” checklist\'inde 1. sırada.'),
    ).toBeInTheDocument();

    await user.keyboard('{Escape}');
    expect(
      await within(dialog).findByText('Taşıma iptal edildi. “Taslak” öğesi yerinde kaldı.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'Rapor' })).toBeInTheDocument();
  });

  it('keeps the checkbox working: Space on it ticks instead of lifting', async () => {
    const { user, serverCard } = openCard(CARD_PATH, { checklists: [TODO_LIST] });
    itemEndpoints(serverCard);
    const dialog = await cardDialog();

    within(dialog).getByRole('checkbox', { name: 'Taslak' }).focus();
    await user.keyboard(' ');

    expect(within(dialog).getByRole('checkbox', { name: 'Taslak' })).toBeChecked();
    expect(within(dialog).queryByText(/tutuldu/)).not.toBeInTheDocument();
  });
});

describe('a failure after the dialog closed', () => {
  it('goes to a toast and does not show up in the next dialog', async () => {
    const { user } = openCard(CARD_PATH, { checklists: [TODO_LIST] });
    // Held until the dialog is gone: a fixed delay would race the clicks, and on a busy
    // machine the failure could land while the dialog is still open (an in-dialog error).
    let release: () => void = () => undefined;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    server.use(
      http.patch('*/api/v1/checklist-items/i-1', async () => {
        await held;
        return apiError(500, 'INTERNAL_ERROR');
      }),
    );
    const dialog = await cardDialog();

    await user.click(within(dialog).getByRole('checkbox', { name: 'Taslak' }));
    await user.click(within(dialog).getByRole('button', { name: 'Kapat' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Rapor' })).not.toBeInTheDocument());
    expect(useToastStore.getState().toasts).toEqual([]);
    release();

    await waitFor(() =>
      expect(useToastStore.getState().toasts.map((toast) => toast.message)).toEqual([
        'Öğe kaydedilemedi. Tekrar dene.',
      ]),
    );
    expect(useCardDetailStore.getState().error).toBeNull();
  });
});
