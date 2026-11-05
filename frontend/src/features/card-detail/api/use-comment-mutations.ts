import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { BoardDetailDto, CardDetailDto, CommentDto } from '@trello/contracts';
import { boardKeys } from '../../boards';
import { useCurrentUser } from '../../auth';
import { boardMutationKey, patchCard } from '../../board-detail';
import { removeItem, insertItem, newPendingId, settlePending, type FeedData } from '../lib/feed-cache';
import { useCardDetailStore } from '../store/card-detail-store';
import { cardKeys } from './card-keys';
import { commentsApi } from './comments-api';

/** Both feeds of a card, whichever of them is cached. */
function useFeedCache(boardId: string, cardId: string) {
  const queryClient = useQueryClient();
  const keys = [false, true].map((details) => cardKeys.feed(boardId, cardId, details));

  return {
    cancel: () => queryClient.cancelQueries({ queryKey: cardKeys.feeds(boardId, cardId) }),
    update(change: (data: FeedData) => FeedData) {
      for (const key of keys) queryClient.setQueryData<FeedData>(key, (data) => data && change(data));
    },
  };
}

/** Moves the comment counter of the card (dialog and tile) by `delta`; a refetch settles the exact value. */
function useCommentCount(boardId: string, cardId: string) {
  const queryClient = useQueryClient();
  const cardKey = cardKeys.detail(boardId, cardId);
  const boardKey = boardKeys.detail(boardId);

  return (delta: number) => {
    queryClient.setQueryData<CardDetailDto>(cardKey, (card) =>
      card && { ...card, commentCount: Math.max(0, card.commentCount + delta) },
    );
    queryClient.setQueryData<BoardDetailDto>(boardKey, (detail) => {
      const tile = detail?.cards.find((card) => card.id === cardId);
      return detail && tile
        ? patchCard(detail, cardId, { commentCount: Math.max(0, tile.commentCount + delta) })
        : detail;
    });
  };
}

/** Shares the board's mutation key: only the last running mutation refetches the board, the card and the feed. */
function useSettle(boardId: string) {
  const queryClient = useQueryClient();
  const mutationKey = boardMutationKey(boardId);
  // This mutation still counts as running there, so 1 means "the last one".
  return () =>
    queryClient.isMutating({ mutationKey }) === 1
      ? queryClient.invalidateQueries({ queryKey: boardKeys.detail(boardId) })
      : undefined;
}

/**
 * Adds a comment. It shows at the top of the feed at once, marked as pending (see
 * `isPendingComment`), and is swapped for the server's comment when that arrives.
 */
export function useAddComment(boardId: string, cardId: string) {
  const author = useCurrentUser();
  const feeds = useFeedCache(boardId, cardId);
  const countComment = useCommentCount(boardId, cardId);
  const settle = useSettle(boardId);

  return useMutation({
    mutationKey: boardMutationKey(boardId),
    mutationFn: (body: string) => commentsApi.add(cardId, { body }),
    onMutate: async (body) => {
      await feeds.cancel();
      const pendingId = newPendingId();
      if (author) {
        const pending: CommentDto = {
          kind: 'comment',
          id: pendingId,
          cardId,
          author: { id: author.id, name: author.name, avatarUrl: author.avatarUrl },
          body,
          createdAt: new Date().toISOString(),
          editedAt: null,
        };
        feeds.update((data) => insertItem(data, pending));
      }
      countComment(1);
      return { pendingId };
    },
    onError: (_error, _body, context) => {
      if (context) feeds.update((data) => removeItem(data, context.pendingId));
      countComment(-1);
      useCardDetailStore.getState().showError(cardId, 'Yorum gönderilemedi. Tekrar dene.');
    },
    onSuccess: (comment, _body, context) => {
      feeds.update((data) => settlePending(data, context.pendingId, comment));
    },
    onSettled: settle,
  });
}
