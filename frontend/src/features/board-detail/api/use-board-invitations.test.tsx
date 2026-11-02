import { QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type {
  BoardDetailDto,
  CreateInvitationRequest,
  CreateInvitationResponse,
  InvitationDto,
} from '@trello/contracts';
import { http, HttpResponse } from 'msw';
import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import { BOARD_ID, apiError, boardWithMembers, testUser } from '../../../test/fixtures';
import { AYSE, INVITATIONS_URL, testInvitation } from '../../../test/members-dialog';
import { server } from '../../../test/msw-server';
import { createTestQueryClient } from '../../../test/render';
import { boardKeys } from '../../boards';
import { boardInvitationKeys } from './board-invitation-keys';
import { useBoard } from './use-board';
import {
  useBoardInvitations,
  useCreateInvitation,
  useRevokeInvitation,
} from './use-board-invitations';

const DETAIL = boardWithMembers('OWNER', []);
const FIRST = testInvitation({ id: 'inv-1', email: 'bir@example.com' });
const SECOND = testInvitation({ id: 'inv-2', email: 'iki@example.com' });

/** Serves the board and the list from `server`, which tests change like the backend would. */
function serveBoard(serverState: { detail: BoardDetailDto; invitations: InvitationDto[] }) {
  const requests = { board: 0, invitations: 0 };
  server.use(
    http.get(`*/api/v1/boards/${BOARD_ID}`, () => {
      requests.board += 1;
      return HttpResponse.json(serverState.detail);
    }),
    http.get(INVITATIONS_URL, () => {
      requests.invitations += 1;
      return HttpResponse.json(serverState.invitations);
    }),
  );
  return requests;
}

interface SetupHandlers {
  onSuccess?: (response: CreateInvitationResponse, variables: CreateInvitationRequest) => void;
  onError?: (error: Error, variables: CreateInvitationRequest) => void;
  onRevoked?: () => void;
}

async function setup(handlers: SetupHandlers = {}) {
  const queryClient = createTestQueryClient();
  queryClient.setQueryDefaults(boardKeys.all, { staleTime: Infinity });
  queryClient.setQueryData(boardKeys.detail(BOARD_ID), DETAIL);
  queryClient.setQueryData(boardInvitationKeys.list(BOARD_ID), [FIRST, SECOND]);
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  const { result } = renderHook(
    () => {
      useBoard(BOARD_ID);
      return {
        list: useBoardInvitations(BOARD_ID),
        create: useCreateInvitation(BOARD_ID, handlers),
        revoke: useRevokeInvitation(BOARD_ID, handlers.onRevoked),
      };
    },
    { wrapper },
  );
  const board = () => queryClient.getQueryData<BoardDetailDto>(boardKeys.detail(BOARD_ID));
  const list = () => queryClient.getQueryData<InvitationDto[]>(boardInvitationKeys.list(BOARD_ID));
  return { result, board, list };
}

function held() {
  let release: () => void = () => undefined;
  const answered = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { answered, release };
}

describe('useBoardInvitations', () => {
  it('loads the pending invitations', async () => {
    serveBoard({ detail: DETAIL, invitations: [SECOND] });
    const { result } = await setup();

    await waitFor(() => expect(result.current.list.isSuccess).toBe(true));
    expect(result.current.list.data).toEqual([FIRST, SECOND]);
  });
});

describe('useCreateInvitation', () => {
  it('reports every answer to the handlers, also when a newer request started meanwhile', async () => {
    const state = { detail: DETAIL, invitations: [FIRST, SECOND] };
    serveBoard(state);
    const first = held();
    server.use(
      http.post(INVITATIONS_URL, async ({ request }) => {
        const { email } = (await request.json()) as CreateInvitationRequest;
        if (email === FIRST.email) await first.answered;
        return HttpResponse.json(
          {
            result: 'INVITATION_CREATED',
            invitation: testInvitation({ id: `inv-${email}`, email }),
            inviteUrl: `http://x/${email}`,
          },
          { status: 201 },
        );
      }),
    );
    const answers: string[] = [];
    const { result } = await setup({
      onSuccess: (response) => {
        if (response.result === 'INVITATION_CREATED') answers.push(response.inviteUrl);
      },
    });

    act(() => result.current.create.mutate({ email: FIRST.email, role: 'MEMBER' }));
    act(() => result.current.create.mutate({ email: SECOND.email, role: 'MEMBER' }));
    await waitFor(() => expect(answers).toEqual([`http://x/${SECOND.email}`]));
    first.release();

    await waitFor(() => expect(answers).toHaveLength(2));
    expect(answers).toContain(`http://x/${FIRST.email}`);
  });

  it('reports a refusal to the handlers with the request that was refused', async () => {
    serveBoard({ detail: DETAIL, invitations: [SECOND] });
    server.use(http.post(INVITATIONS_URL, () => apiError(409, 'ALREADY_MEMBER')));
    const refused: string[] = [];
    const { result } = await setup({ onError: (_error, { email }) => refused.push(email) });

    act(() => result.current.create.mutate({ email: FIRST.email, role: 'MEMBER' }));

    await waitFor(() => expect(refused).toEqual([FIRST.email]));
  });

  it('adds a registered person to the board and drops that address from the pending list', async () => {
    const state = { detail: DETAIL, invitations: [FIRST, SECOND] };
    serveBoard(state);
    server.use(
      http.post(INVITATIONS_URL, () => {
        state.detail = boardWithMembers('OWNER', [AYSE]);
        state.invitations = [SECOND];
        return HttpResponse.json({ result: 'MEMBER_ADDED', member: AYSE }, { status: 201 });
      }),
    );
    const { result, board, list } = await setup();

    act(() => result.current.create.mutate({ email: ' Bir@Example.com ', role: 'MEMBER' }));

    await waitFor(() => expect(result.current.create.isSuccess).toBe(true));
    expect(board()?.members.map((member) => member.userId)).toContain(AYSE.userId);
    await waitFor(() => expect(list()?.map((item) => item.id)).toEqual(['inv-2']));
  });

  it('puts a new invitation on top of the pending list and keeps the board as it is', async () => {
    const created = testInvitation({ id: 'inv-3', email: 'uc@example.com' });
    const state = { detail: DETAIL, invitations: [created, FIRST, SECOND] };
    serveBoard(state);
    server.use(
      http.post(INVITATIONS_URL, () =>
        HttpResponse.json(
          { result: 'INVITATION_CREATED', invitation: created, inviteUrl: 'http://x/y' },
          { status: 201 },
        ),
      ),
    );
    const { result, board, list } = await setup();

    act(() => result.current.create.mutate({ email: 'uc@example.com', role: 'MEMBER' }));

    await waitFor(() => expect(result.current.create.isSuccess).toBe(true));
    expect(list()?.map((item) => item.id)).toEqual(['inv-3', 'inv-1', 'inv-2']);
    expect(board()?.members.map((member) => member.userId)).toEqual([testUser.id]);
  });

  it('moves a re-invited address back to the top instead of listing it twice', async () => {
    const again = { ...SECOND, expiresAt: '2026-11-20T10:00:00.000Z' };
    const requests = serveBoard({ detail: DETAIL, invitations: [again, FIRST] });
    server.use(
      http.post(INVITATIONS_URL, () =>
        HttpResponse.json(
          { result: 'INVITATION_CREATED', invitation: again, inviteUrl: 'http://x/y' },
          { status: 201 },
        ),
      ),
    );
    const { result, list } = await setup();
    // The cache starts as [FIRST, SECOND]; the answer must not wait for the refetch to show.
    requests.invitations = 0;

    act(() => result.current.create.mutate({ email: SECOND.email, role: 'MEMBER' }));

    await waitFor(() => expect(result.current.create.isSuccess).toBe(true));
    expect(list()?.filter((item) => item.id === SECOND.id)).toHaveLength(1);
    expect(list()?.[0]).toEqual(again);
  });

  it('refreshes the list after a refusal, since it may be out of date', async () => {
    const requests = serveBoard({ detail: DETAIL, invitations: [SECOND] });
    server.use(http.post(INVITATIONS_URL, () => apiError(409, 'ALREADY_MEMBER')));
    const { result, list } = await setup();

    act(() => result.current.create.mutate({ email: FIRST.email, role: 'MEMBER' }));

    await waitFor(() => expect(result.current.create.isError).toBe(true));
    await waitFor(() => expect(list()?.map((item) => item.id)).toEqual(['inv-2']));
    expect(requests.invitations).toBeGreaterThan(0);
  });
});

describe('useRevokeInvitation', () => {
  const revokeUrl = `${INVITATIONS_URL}/inv-1`;

  it('takes the invitation off the list before the server answers', async () => {
    const state = { detail: DETAIL, invitations: [FIRST, SECOND] };
    serveBoard(state);
    const gate = held();
    server.use(
      http.delete(revokeUrl, async () => {
        await gate.answered;
        state.invitations = [SECOND];
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const { result, list } = await setup();

    act(() => result.current.revoke.mutate('inv-1'));

    await waitFor(() => expect(list()?.map((item) => item.id)).toEqual(['inv-2']));
    expect(result.current.revoke.isPending).toBe(true);
    gate.release();
    await waitFor(() => expect(result.current.revoke.isSuccess).toBe(true));
    expect(list()?.map((item) => item.id)).toEqual(['inv-2']);
  });

  it('brings the invitation back when the request fails', async () => {
    const state = { detail: DETAIL, invitations: [FIRST, SECOND] };
    serveBoard(state);
    const gate = held();
    server.use(
      http.delete(revokeUrl, async () => {
        await gate.answered;
        return apiError(500, 'INTERNAL_ERROR');
      }),
    );
    const { result, list } = await setup();

    act(() => result.current.revoke.mutate('inv-1'));
    await waitFor(() => expect(list()?.map((item) => item.id)).toEqual(['inv-2']));
    gate.release();

    await waitFor(() => expect(result.current.revoke.isError).toBe(true));
    expect(list()?.map((item) => item.id)).toEqual(['inv-1', 'inv-2']);
  });

  it('tells the caller about every revoked invitation', async () => {
    const state = { detail: DETAIL, invitations: [FIRST, SECOND] };
    serveBoard(state);
    server.use(
      http.delete(`${INVITATIONS_URL}/:id`, () => new HttpResponse(null, { status: 204 })),
    );
    let revoked = 0;
    const { result } = await setup({ onRevoked: () => (revoked += 1) });

    act(() => result.current.revoke.mutate('inv-1'));
    act(() => result.current.revoke.mutate('inv-2'));

    await waitFor(() => expect(revoked).toBe(2));
  });

  it('leaves the board alone while a board write is still running, which refreshes it itself', async () => {
    const state = { detail: DETAIL, invitations: [FIRST, SECOND] };
    const requests = serveBoard(state);
    const write = held();
    server.use(
      http.post(INVITATIONS_URL, async () => {
        await write.answered;
        return HttpResponse.json({ result: 'MEMBER_ADDED', member: AYSE }, { status: 201 });
      }),
      http.delete(revokeUrl, () => apiError(409, 'INVITATION_USED')),
    );
    const { result } = await setup();
    const boardRequests = requests.board;
    act(() => result.current.create.mutate({ email: AYSE.email, role: 'MEMBER' }));
    await waitFor(() => expect(result.current.create.isPending).toBe(true));

    act(() => result.current.revoke.mutate('inv-1'));
    await waitFor(() => expect(result.current.revoke.isError).toBe(true));
    // The revoke settles with a refetch of the list; by then the board would have been asked too.
    await waitFor(() => expect(requests.invitations).toBeGreaterThan(0));
    expect(requests.board).toBe(boardRequests);

    write.release();
    await waitFor(() => expect(requests.board).toBeGreaterThan(boardRequests));
  });

  it('refreshes the board and the list when the invitation was accepted meanwhile', async () => {
    const state = { detail: DETAIL, invitations: [FIRST, SECOND] };
    const requests = serveBoard(state);
    server.use(
      http.delete(revokeUrl, () => {
        state.detail = boardWithMembers('OWNER', [AYSE]);
        state.invitations = [SECOND];
        return apiError(409, 'INVITATION_USED');
      }),
    );
    const { result, board, list } = await setup();
    const boardRequests = requests.board;

    act(() => result.current.revoke.mutate('inv-1'));

    await waitFor(() => expect(result.current.revoke.isError).toBe(true));
    await waitFor(() =>
      expect(board()?.members.map((member) => member.userId)).toContain(AYSE.userId),
    );
    await waitFor(() => expect(list()?.map((item) => item.id)).toEqual(['inv-2']));
    expect(requests.board).toBeGreaterThan(boardRequests);
  });
});
