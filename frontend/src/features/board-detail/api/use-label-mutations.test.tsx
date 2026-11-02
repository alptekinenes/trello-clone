import { QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { BoardDetailDto, LabelDto } from '@trello/contracts';
import { delay, http, HttpResponse } from 'msw';
import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import { BOARD_ID, apiError, boardDetail, testCard, testLists } from '../../../test/fixtures';
import { server } from '../../../test/msw-server';
import { createTestQueryClient } from '../../../test/render';
import { boardKeys } from '../../boards';
import { useBoard } from './use-board';
import { useCreateLabel, useDeleteLabel, useUpdateLabel } from './use-label-mutations';

const [TODO] = testLists('Yapılacaklar');
const RED: LabelDto = { id: 'label-red', boardId: BOARD_ID, name: 'Acil', color: 'RED' };
const GREEN: LabelDto = { id: 'label-green', boardId: BOARD_ID, name: 'Hazır', color: 'GREEN' };
const DETAIL = boardDetail(
  'OWNER',
  'Pano',
  [TODO],
  [testCard({ id: 'card-1', listId: TODO.id, title: 'A', labelIds: [RED.id, GREEN.id] })],
  [GREEN, RED],
);

/** The board as the server has it: label handlers change it, the board GET reads it. */
function serverBoard(labels: LabelDto[] = DETAIL.labels, cardLabels: string[] = DETAIL.cards[0].labelIds) {
  const state = { labels, cardLabels };
  server.use(
    http.get(`*/api/v1/boards/${BOARD_ID}`, () =>
      HttpResponse.json({
        ...DETAIL,
        labels: state.labels,
        cards: [{ ...DETAIL.cards[0], labelIds: state.cardLabels }],
      }),
    ),
  );
  return state;
}

function setup() {
  const queryClient = createTestQueryClient();
  queryClient.setQueryDefaults(boardKeys.all, { staleTime: Infinity });
  queryClient.setQueryData(boardKeys.detail(BOARD_ID), DETAIL);
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  const { result } = renderHook(
    () => {
      useBoard(BOARD_ID);
      return {
        create: useCreateLabel(BOARD_ID),
        update: useUpdateLabel(BOARD_ID),
        remove: useDeleteLabel(BOARD_ID),
      };
    },
    { wrapper },
  );
  const cached = () => queryClient.getQueryData<BoardDetailDto>(boardKeys.detail(BOARD_ID));
  return { result, cached };
}

describe('label mutations', () => {
  it('adds a created label once the server answers, in color order', async () => {
    const created: LabelDto = { id: 'label-blue', boardId: BOARD_ID, name: 'Plan', color: 'BLUE' };
    const state = serverBoard();
    server.use(
      http.post(`*/api/v1/boards/${BOARD_ID}/labels`, () => {
        state.labels = [...state.labels, created];
        return HttpResponse.json(created, { status: 201 });
      }),
    );
    const { result, cached } = setup();

    act(() => result.current.create.mutate({ name: 'Plan', color: 'BLUE' }));

    await waitFor(() =>
      expect(cached()?.labels.map((label) => label.id)).toEqual([
        'label-green',
        'label-red',
        'label-blue',
      ]),
    );
  });

  it('renames a label at once and keeps it after the answer', async () => {
    const state = serverBoard();
    server.use(
      http.patch(`*/api/v1/labels/${RED.id}`, async () => {
        await delay(30);
        state.labels = state.labels.map((l) => (l.id === RED.id ? { ...RED, name: 'Çok acil' } : l));
        return HttpResponse.json({ ...RED, name: 'Çok acil' });
      }),
    );
    const { result, cached } = setup();

    act(() => result.current.update.mutate({ labelId: RED.id, name: 'Çok acil' }));

    await waitFor(() =>
      expect(cached()?.labels.find((label) => label.id === RED.id)?.name).toBe('Çok acil'),
    );
    await waitFor(() => expect(result.current.update.isSuccess).toBe(true));
    expect(cached()?.labels.find((label) => label.id === RED.id)?.name).toBe('Çok acil');
  });

  it('rolls a failed rename back', async () => {
    serverBoard();
    server.use(http.patch(`*/api/v1/labels/${RED.id}`, () => apiError(500, 'INTERNAL_ERROR')));
    const { result, cached } = setup();

    act(() => result.current.update.mutate({ labelId: RED.id, color: 'PINK' }));

    await waitFor(() => expect(result.current.update.isError).toBe(true));
    expect(cached()?.labels.find((label) => label.id === RED.id)).toEqual(RED);
  });

  it('removes a deleted label from the board and from every card', async () => {
    const state = serverBoard();
    server.use(
      http.delete(`*/api/v1/labels/${RED.id}`, () => {
        state.labels = state.labels.filter((l) => l.id !== RED.id);
        state.cardLabels = state.cardLabels.filter((id) => id !== RED.id);
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const { result, cached } = setup();

    act(() => result.current.remove.mutate(RED.id));

    await waitFor(() => expect(cached()?.labels.map((label) => label.id)).toEqual([GREEN.id]));
    expect(cached()?.cards[0].labelIds).toEqual([GREEN.id]);
  });
});
