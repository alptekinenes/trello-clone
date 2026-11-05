import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import {
  type BoardDetailDto,
  type BoardEvent,
  type BoardSummaryDto,
  type RealtimeMessage,
} from '@trello/contracts';
import { useEffect } from 'react';
import { useNavigate } from 'react-router';
import { useRealtimeEvents } from '../../../shared/hooks/use-realtime-events';
import { realtime } from '../../../shared/lib/realtime-client';
import { asBoardEvent } from '../../../shared/lib/realtime-message';
import { useRealtimeStatus } from '../../../shared/store/realtime-store';
import { showToast } from '../../../shared/store/toast-store';
import { useCurrentUser } from '../../auth';
import { boardKeys } from '../../boards';
import { boardInvitationKeys } from '../api/board-invitation-keys';
import { refreshUnlessMutating } from '../api/refresh-board';
import { archivedCardsKey } from '../api/use-card-mutations';
import { archivedListsKey } from '../api/use-list-mutations';
import { applyBoardEvent } from '../lib/apply-board-event';
import { setCardWatched } from '../lib/board-cache';
import { type FocusSpot, focusSpot, rescueTarget } from '../lib/focus-rescue';
import { useCardUiStore } from '../store/card-ui-store';

/** The board is gone for the viewer: removed from it, or it was deleted. */
function isEviction(message: RealtimeMessage, myUserId: string): boolean {
  return (
    message.type === 'membership:removed' ||
    message.type === 'board:deleted' ||
    (message.type === 'member:removed' && message.data.userId === myUserId)
  );
}

function evictionToast(message: RealtimeMessage, title: string, myUserId: string): string {
  if (message.type === 'board:deleted') return `“${title}” panosu silindi.`;
  // The same user's other tab left the board.
  if (message.actorId === myUserId) return `“${title}” panosundan ayrıldın.`;
  return `“${title}” panosundan çıkarıldın.`;
}

/** Same sequence as leaving the board by hand: go to the list first, then drop the caches. */
function evict(
  queryClient: QueryClient,
  navigate: ReturnType<typeof useNavigate>,
  boardId: string,
  toast: (title: string) => string,
): void {
  const title = queryClient.getQueryData<BoardDetailDto>(boardKeys.detail(boardId))?.board.title;
  navigate('/boards', { replace: true });
  queryClient.removeQueries({ queryKey: boardKeys.detail(boardId) });
  queryClient.removeQueries({ queryKey: boardInvitationKeys.list(boardId) });
  showToast(toast(title ?? 'Pano'));
}

/** Caches next to the board detail that an event makes stale. */
function updateSideCaches(queryClient: QueryClient, boardId: string, event: BoardEvent, myUserId: string) {
  switch (event.type) {
    case 'board:updated': {
      const info = event.data;
      queryClient.setQueryData<BoardSummaryDto[]>(boardKeys.list(), (boards) =>
        boards?.map((board) => (board.id === info.id ? { ...board, ...info } : board)),
      );
      return;
    }
    case 'member:added':
      void queryClient.invalidateQueries({ queryKey: boardInvitationKeys.list(boardId) });
      return;
    case 'member:updated': {
      const member = event.data;
      if (member.userId !== myUserId) return;
      queryClient.setQueryData<BoardSummaryDto[]>(boardKeys.list(), (boards) =>
        boards?.map((board) => (board.id === boardId ? { ...board, myRole: member.role } : board)),
      );
      // Only admins see invitations.
      if (member.role === 'MEMBER') {
        queryClient.removeQueries({ queryKey: boardInvitationKeys.list(boardId) });
      }
      return;
    }
    case 'list:updated':
    case 'list:deleted':
    case 'card:updated':
    case 'card:deleted':
    case 'label:deleted':
      void queryClient.invalidateQueries({ queryKey: archivedListsKey(boardId), exact: true });
      void queryClient.invalidateQueries({ queryKey: archivedCardsKey(boardId), exact: true });
      return;
    default:
      return;
  }
}

/** The focused card tile or list went away with the event: the focus must not fall back to the page. */
function keepFocusOnBoard(spot: FocusSpot, detail: BoardDetailDto | undefined): void {
  const target = detail && rescueTarget(spot, detail);
  if (!target) return;
  const ui = useCardUiStore.getState();
  if (target.kind === 'add-card') ui.focusAddCard(target.listId);
  else ui.focusLists();
}

function applyToBoard(
  queryClient: QueryClient,
  boardId: string,
  event: BoardEvent,
  myUserId: string,
): void {
  const detailKey = boardKeys.detail(boardId);
  // A request already on its way may have read the board before this change.
  const fetching = queryClient.isFetching({ queryKey: detailKey, exact: true }) > 0;
  const spot = focusSpot(document.activeElement);
  let refetch = false;
  queryClient.setQueryData<BoardDetailDto>(detailKey, (detail) => {
    if (!detail) return detail;
    const result = applyBoardEvent(detail, event, myUserId);
    refetch = result.refetch;
    return result.detail;
  });
  if (spot) keepFocusOnBoard(spot, queryClient.getQueryData<BoardDetailDto>(detailKey));
  updateSideCaches(queryClient, boardId, event, myUserId);
  if (refetch || fetching) refreshUnlessMutating(queryClient, boardId, detailKey, { exact: true });
}

/**
 * Keeps the open board live: joins its room (again after every reconnect, then
 * refetches what was missed), applies other users' changes to the cache, and
 * leaves the page when the viewer is removed from the board or it is deleted.
 */
export function useBoardRealtime(boardId: string): void {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const myUserId = useCurrentUser()?.id ?? '';
  const connected = useRealtimeStatus() === 'connected';

  useEffect(() => {
    if (!connected) return;
    let active = true;
    void realtime.joinBoard(boardId).then((ack) => {
      // NOT_FOUND needs nothing: the board request itself says "not found".
      // CONFLICT means a newer join or leave replaced this one.
      if (active && ack.ok) {
        refreshUnlessMutating(queryClient, boardId, boardKeys.detail(boardId));
      }
    });
    return () => {
      active = false;
      realtime.leaveBoard(boardId);
    };
  }, [boardId, connected, queryClient]);

  useRealtimeEvents((message) => {
    if (message.boardId !== boardId) return;
    if (isEviction(message, myUserId)) {
      evict(queryClient, navigate, boardId, (title) => evictionToast(message, title, myUserId));
      return;
    }
    if (message.type === 'card:watch-updated') {
      const { cardId, watching } = message.data;
      queryClient.setQueryData<BoardDetailDto>(boardKeys.detail(boardId), (detail) =>
        detail ? setCardWatched(detail, cardId, watching) : detail,
      );
      return;
    }
    const event = asBoardEvent(message);
    if (event) applyToBoard(queryClient, boardId, event, myUserId);
  });
}
