import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { BoardDetailDto, CardDetailDto, CommentDto } from '@trello/contracts';
import { ApiError } from '../../../shared/lib/http';
import { apiErrorMessage, isNotFound } from '../../../shared/lib/api-error-message';
import { boardKeys } from '../../boards';
import { useCurrentUser } from '../../auth';
import { boardMutationKey, patchCard } from '../../board-detail';
import {
  findComment,
  insertItem,
  newPendingId,
  removeItem,
  replaceItem,
  settlePending,
  type FeedData,
} from '../lib/feed-cache';
import { useCardDetailStore } from '../store/card-detail-store';
import { cardKeys } from './card-keys';
import { commentsApi } from './comments-api';

/** A refused request says so; anything else gets `fallback`. */
function errorText(error: Error, fallback: string): string {
  return error instanceof ApiError && error.status === 403 ? apiErrorMessage(error) : fallback;
}

/** Both feeds of a card, whichever of them is cached. */
function useFeedCache(boardId: string, cardId: string) {
  const queryClient = useQueryClient();
  const keys = [false, true].map((details) => cardKeys.feed(boardId, cardId, details));

  return {
    cancel: () => queryClient.cancelQueries({ queryKey: cardKeys.feeds(boardId, cardId) }),
    /** The comment as the cached feeds hold it now. */
    find(commentId: string): CommentDto | undefined {
      for (const key of keys) {
        const data = queryClient.getQueryData<FeedData>(key);
        const comment = data && findComment(data, commentId);
        if (comment) return comment;
      }
      return undefined;
    },
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

const COMMENT_GONE_MESSAGE = 'Yorum bulunamadı. Silinmiş olabilir.';

export interface EditCommentVariables {
  id: string;
  body: string;
}

/**
 * Edits a comment: the text and the "(düzenlendi)" note change at once. A failure puts the
 * comment back as it was; a 404 means it is gone, so it leaves the feed.
 */
export function useEditComment(boardId: string, cardId: string) {
  const feeds = useFeedCache(boardId, cardId);
  const settle = useSettle(boardId);

  return useMutation({
    mutationKey: boardMutationKey(boardId),
    mutationFn: ({ id, body }: EditCommentVariables) => commentsApi.edit(id, { body }),
    onMutate: async ({ id, body }) => {
      await feeds.cancel();
      const previous = feeds.find(id);
      if (previous) {
        const edited = { ...previous, body, editedAt: new Date().toISOString() };
        feeds.update((data) => replaceItem(data, id, edited));
      }
      return { previous };
    },
    onError: (error, { id }, context) => {
      if (isNotFound(error)) {
        feeds.update((data) => removeItem(data, id));
        useCardDetailStore.getState().showError(cardId, COMMENT_GONE_MESSAGE);
        return;
      }
      const previous = context?.previous;
      if (previous) feeds.update((data) => replaceItem(data, id, previous));
      useCardDetailStore.getState().showError(cardId, errorText(error, 'Yorum kaydedilemedi. Tekrar dene.'));
    },
    onSuccess: (comment, { id }) => {
      feeds.update((data) => replaceItem(data, id, comment));
    },
    onSettled: settle,
  });
}

/** Deletes a comment: it leaves the feed and the counter drops at once; a failure brings it back. */
export function useDeleteComment(boardId: string, cardId: string) {
  const feeds = useFeedCache(boardId, cardId);
  const countComment = useCommentCount(boardId, cardId);
  const settle = useSettle(boardId);

  return useMutation({
    mutationKey: boardMutationKey(boardId),
    mutationFn: (commentId: string) => commentsApi.remove(commentId),
    onMutate: async (commentId) => {
      await feeds.cancel();
      const previous = feeds.find(commentId);
      feeds.update((data) => removeItem(data, commentId));
      countComment(-1);
      return { previous };
    },
    onError: (error, _commentId, context) => {
      const { previous } = context ?? {};
      // Someone else deleted it first: it stays gone, and the refetch settles the counter.
      if (isNotFound(error)) {
        useCardDetailStore.getState().showError(cardId, COMMENT_GONE_MESSAGE);
        return;
      }
      if (previous) feeds.update((data) => insertItem(data, previous));
      countComment(1);
      useCardDetailStore.getState().showError(cardId, errorText(error, 'Yorum silinemedi. Tekrar dene.'));
    },
    onSettled: settle,
  });
}
