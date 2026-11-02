import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { BoardDetailDto, BoardRole, InvitationDto, MemberDto } from '@trello/contracts';
import { http, HttpResponse } from 'msw';
import { useAuthStore } from '../features/auth/store/auth-store';
import { BOARD_ID, apiError, boardWithMembers, testMember, testUser } from './fixtures';
import { server } from './msw-server';
import { renderApp } from './render';

export const BOARD_URL = `*/api/v1/boards/${BOARD_ID}`;
export const INVITATIONS_URL = `${BOARD_URL}/invitations`;
export const memberUrl = (userId: string) => `${BOARD_URL}/members/${userId}`;

export const AYSE = testMember({ userId: 'u-ayse', name: 'Ayşe Demir', joinedAt: '2026-10-28T09:00:00.000Z' });
export const BORA = testMember({ userId: 'u-bora', name: 'Bora Kaya', joinedAt: '2026-10-29T09:00:00.000Z' });
export const CEM = testMember({ userId: 'u-cem', name: 'Cem Aksoy', joinedAt: '2026-10-30T09:00:00.000Z' });

export function testInvitation(overrides: Partial<InvitationDto> = {}): InvitationDto {
  return {
    id: 'inv-1',
    boardId: BOARD_ID,
    email: 'davetli@example.com',
    role: 'MEMBER',
    invitedBy: { userId: testUser.id, name: testUser.name },
    expiresAt: '2026-11-09T14:30:00.000Z',
    ...overrides,
  };
}

/** The test board in `myRole`, with these other members. */
export function asRole(myRole: BoardRole, others: MemberDto[]): BoardDetailDto {
  return boardWithMembers(myRole, others);
}

export interface MembersDialogState {
  detail: BoardDetailDto;
  /** What GET /boards/:id/invitations answers with now. */
  invitations: InvitationDto[];
  /** How many times the invitation list was asked for. */
  invitationRequests: number;
  /** How many times the board was asked for. */
  boardRequests: number;
  /** Makes the invitation list fail with a 500. */
  invitationsFail: boolean;
}

/**
 * Opens the board as the test user and its "Üyeler" dialog. The board GET and the
 * invitation list GET answer from `state`, which tests change to play the server.
 */
export async function openMembers(
  detail: BoardDetailDto,
  invitations: InvitationDto[] = [],
  { invitationsFail = false, invitationsGate }: { invitationsFail?: boolean; invitationsGate?: Promise<void> } = {},
) {
  useAuthStore.getState().setSession({ accessToken: 'token', user: testUser });
  const state: MembersDialogState = {
    detail,
    invitations,
    invitationRequests: 0,
    boardRequests: 0,
    invitationsFail,
  };
  server.use(
    http.get(BOARD_URL, () => {
      state.boardRequests += 1;
      return HttpResponse.json(state.detail);
    }),
    http.get(INVITATIONS_URL, async () => {
      await invitationsGate;
      state.invitationRequests += 1;
      if (state.invitationsFail) return apiError(500, 'INTERNAL_ERROR');
      return HttpResponse.json(state.invitations);
    }),
  );
  const result = renderApp(`/boards/${BOARD_ID}`);
  const user = userEvent.setup();
  await user.click(await screen.findByRole('button', { name: 'Üyeler' }));
  const dialog = await screen.findByRole('dialog', { name: 'Pano üyeleri' });
  return { ...result, user, state, dialog };
}

export const memberList = (dialog: HTMLElement) => within(dialog).getByRole('list', { name: 'Üyeler' });

export function rowOf(dialog: HTMLElement, name: string): HTMLElement {
  const row = within(memberList(dialog)).getByText(name).closest('li');
  if (!row) throw new Error(`No row for ${name}`);
  return row;
}
