import { QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { BoardDetailDto, BoardSummaryDto, MemberDto } from '@trello/contracts';
import { http, HttpResponse } from 'msw';
import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import {
  BOARD_ID,
  apiError,
  boardSummary,
  boardWithMembers,
  testMember,
  testUser,
} from '../../../test/fixtures';
import { server } from '../../../test/msw-server';
import { createTestQueryClient } from '../../../test/render';
import { boardKeys } from '../../boards';
import { boardInvitationKeys } from './board-invitation-keys';
import { useBoard } from './use-board';
import { useLeaveBoard, useRemoveMember, useUpdateMemberRole } from './use-member-mutations';

const BORA = testMember({ userId: 'u-bora', name: 'Bora Kaya' });
const DETAIL = boardWithMembers('OWNER', [BORA]);
const MEMBER_URL = `*/api/v1/boards/${BOARD_ID}/members/${BORA.userId}`;

function setup(onChanged?: (member: MemberDto) => void) {
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
        updateRole: useUpdateMemberRole(BOARD_ID, onChanged),
        remove: useRemoveMember(BOARD_ID),
        leave: useLeaveBoard(BOARD_ID, testUser.id),
      };
    },
    { wrapper },
  );
  const cached = () => queryClient.getQueryData<BoardDetailDto>(boardKeys.detail(BOARD_ID));
  const roleOf = (userId: string) => cached()?.members.find((m) => m.userId === userId)?.role;
  return { result, cached, roleOf, queryClient };
}

describe('useUpdateMemberRole', () => {
  it('reports each changed member, also when a newer change started before the answer', async () => {
    let release: () => void = () => undefined;
    const answered = new Promise<void>((resolve) => {
      release = resolve;
    });
    const CEM = testMember({ userId: 'u-cem', name: 'Cem Aksoy' });
    server.use(
      http.patch(`*/api/v1/boards/${BOARD_ID}/members/:userId`, async ({ params }) => {
        if (params.userId === BORA.userId) await answered;
        const member = params.userId === BORA.userId ? BORA : CEM;
        return HttpResponse.json<MemberDto>({ ...member, role: 'ADMIN' });
      }),
      http.get(`*/api/v1/boards/${BOARD_ID}`, () => HttpResponse.json(DETAIL)),
    );
    const changed: string[] = [];
    const { result } = setup((member) => changed.push(member.name));

    act(() => result.current.updateRole.mutate({ userId: BORA.userId, role: 'ADMIN' }));
    act(() => result.current.updateRole.mutate({ userId: CEM.userId, role: 'ADMIN' }));
    await waitFor(() => expect(changed).toEqual(['Cem Aksoy']));
    release();

    await waitFor(() => expect(changed).toEqual(['Cem Aksoy', 'Bora Kaya']));
  });

  it('shows the new role before the server answers and keeps the answer', async () => {
    let release: () => void = () => undefined;
    const answered = new Promise<void>((resolve) => {
      release = resolve;
    });
    server.use(
      http.patch(MEMBER_URL, async () => {
        await answered;
        return HttpResponse.json<MemberDto>({ ...BORA, role: 'ADMIN' });
      }),
      http.get(`*/api/v1/boards/${BOARD_ID}`, () =>
        HttpResponse.json(boardWithMembers('OWNER', [{ ...BORA, role: 'ADMIN' }])),
      ),
    );
    const { result, roleOf } = setup();

    act(() => result.current.updateRole.mutate({ userId: BORA.userId, role: 'ADMIN' }));

    await waitFor(() => expect(roleOf(BORA.userId)).toBe('ADMIN'));
    expect(result.current.updateRole.isPending).toBe(true);
    release();
    await waitFor(() => expect(result.current.updateRole.isSuccess).toBe(true));
    expect(roleOf(BORA.userId)).toBe('ADMIN');
  });

  it('puts the old role back when the request fails', async () => {
    let release: () => void = () => undefined;
    const answered = new Promise<void>((resolve) => {
      release = resolve;
    });
    server.use(
      http.patch(MEMBER_URL, async () => {
        await answered;
        return apiError(500, 'INTERNAL_ERROR');
      }),
      http.get(`*/api/v1/boards/${BOARD_ID}`, () => HttpResponse.json(DETAIL)),
    );
    const { result, roleOf } = setup();

    act(() => result.current.updateRole.mutate({ userId: BORA.userId, role: 'ADMIN' }));
    await waitFor(() => expect(roleOf(BORA.userId)).toBe('ADMIN'));
    release();

    await waitFor(() => expect(result.current.updateRole.isError).toBe(true));
    expect(roleOf(BORA.userId)).toBe('MEMBER');
  });
});

describe('useRemoveMember', () => {
  it('drops the member from the cached board once the server agrees', async () => {
    server.use(
      http.delete(MEMBER_URL, () => new HttpResponse(null, { status: 204 })),
      http.get(`*/api/v1/boards/${BOARD_ID}`, () => HttpResponse.json(boardWithMembers('OWNER', []))),
    );
    const { result, cached } = setup();

    act(() => result.current.remove.mutate(BORA.userId));

    await waitFor(() => expect(result.current.remove.isSuccess).toBe(true));
    expect(cached()?.members.map((m) => m.userId)).toEqual([testUser.id]);
  });

  it('leaves the member in place when the request fails', async () => {
    server.use(
      http.delete(MEMBER_URL, () => apiError(403, 'FORBIDDEN')),
      http.get(`*/api/v1/boards/${BOARD_ID}`, () => HttpResponse.json(DETAIL)),
    );
    const { result, cached } = setup();

    act(() => result.current.remove.mutate(BORA.userId));

    await waitFor(() => expect(result.current.remove.isError).toBe(true));
    expect(cached()?.members.map((m) => m.userId)).toEqual([testUser.id, BORA.userId]);
  });
});

describe('useLeaveBoard', () => {
  /** No board observer here: in the app the board page does not re-render while leaving. */
  function setupLeave() {
    const queryClient = createTestQueryClient();
    queryClient.setQueryData(boardKeys.detail(BOARD_ID), DETAIL);
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useLeaveBoard(BOARD_ID, testUser.id), { wrapper });
    return { result, queryClient };
  }

  const LEAVE_URL = `*/api/v1/boards/${BOARD_ID}/members/${testUser.id}`;

  it('forgets the board: its detail, its invitations and its place in the list', async () => {
    const other: BoardSummaryDto = boardSummary({ id: 'other-board', title: 'Başka' });
    server.use(http.delete(LEAVE_URL, () => new HttpResponse(null, { status: 204 })));
    const { result, queryClient } = setupLeave();
    queryClient.setQueryData(boardKeys.list(), [boardSummary(), other]);
    queryClient.setQueryData(boardInvitationKeys.list(BOARD_ID), []);

    act(() => result.current.mutate());

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(queryClient.getQueryData(boardKeys.detail(BOARD_ID))).toBeUndefined();
    expect(queryClient.getQueryData(boardInvitationKeys.list(BOARD_ID))).toBeUndefined();
    expect(queryClient.getQueryData<BoardSummaryDto[]>(boardKeys.list())).toEqual([other]);
  });

  it('keeps everything when leaving fails', async () => {
    server.use(http.delete(LEAVE_URL, () => apiError(500, 'INTERNAL_ERROR')));
    const { result, queryClient } = setupLeave();

    act(() => result.current.mutate());

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(queryClient.getQueryData(boardKeys.detail(BOARD_ID))).toEqual(DETAIL);
  });
});
