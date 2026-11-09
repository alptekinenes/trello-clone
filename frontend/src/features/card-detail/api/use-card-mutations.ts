import {
  type CardDetailDto,
  type CardSummaryDto,
  ErrorCode,
  type UpdateCardRequest,
} from '@trello/contracts';
import { ApiError } from '../../../shared/lib/http';
import { useRestoreCard } from '../../board-detail';
import { applyCardUpdate, setLabelAssigned, setMemberAssigned } from '../lib/card-detail-cache';
import { useCardDetailStore } from '../store/card-detail-store';
import { cardDetailApi } from './card-detail-api';
import { useCardMutation } from './use-card-mutation';

/** Title is checked before this: the server rejects an empty one. */
export type CardEdit = Pick<
  UpdateCardRequest,
  | 'title'
  | 'description'
  | 'dueDate'
  | 'dueComplete'
  | 'isCompleted'
  | 'coverColor'
  | 'coverAttachmentId'
>;

const changesCover = (edit: CardEdit): boolean =>
  edit.coverColor !== undefined || edit.coverAttachmentId !== undefined;

/** Parts of the card an edit sets; setting a date also settles its completion. */
function editParts(edit: CardEdit): string[] {
  return [
    ...(edit.title !== undefined ? ['title'] : []),
    ...(edit.description !== undefined ? ['description'] : []),
    ...(edit.dueDate !== undefined ? ['dueDate', 'dueComplete'] : []),
    ...(edit.dueComplete !== undefined ? ['dueComplete'] : []),
    ...(edit.isCompleted !== undefined ? ['completedAt'] : []),
    // One part for both: a color and an image cover exclude each other.
    ...(changesCover(edit) ? ['cover'] : []),
  ];
}

/** The card with the fields the edit set taken back from `previous`. */
function revertEdit(card: CardDetailDto, previous: CardDetailDto, edit: CardEdit): CardDetailDto {
  return {
    ...card,
    ...(edit.title !== undefined && { title: previous.title }),
    ...(edit.description !== undefined && { description: previous.description }),
    ...(edit.dueDate !== undefined && {
      dueDate: previous.dueDate,
      dueComplete: previous.dueComplete,
    }),
    ...(edit.dueComplete !== undefined && { dueComplete: previous.dueComplete }),
    ...(edit.isCompleted !== undefined && { completedAt: previous.completedAt }),
    ...(changesCover(edit) && {
      coverColor: previous.coverColor,
      coverAttachmentId: previous.coverAttachmentId,
    }),
  };
}

/** Only the fields this request changed come from the answer; the rest stays as edited. */
function applyAnswer(card: CardDetailDto, answer: CardSummaryDto, edit: CardEdit): CardDetailDto {
  return {
    ...card,
    ...(edit.title !== undefined && { title: answer.title }),
    ...(edit.dueDate !== undefined && { dueDate: answer.dueDate, dueComplete: answer.dueComplete }),
    ...(edit.dueComplete !== undefined && { dueComplete: answer.dueComplete }),
    ...(edit.isCompleted !== undefined && { completedAt: answer.completedAt }),
    ...(changesCover(edit) && {
      coverColor: answer.coverColor,
      coverAttachmentId: answer.coverAttachmentId,
    }),
  };
}

/** Edits the card's title, description, due date, completion or cover (a color or an image). */
export function useUpdateCard(boardId: string, cardId: string) {
  return useCardMutation({
    boardId,
    cardId,
    mutationFn: (edit: CardEdit) => cardDetailApi.update(cardId, edit),
    optimistic: applyCardUpdate,
    touches: editParts,
    revert: revertEdit,
    onSuccessCard: (card, answer: CardSummaryDto, edit) => applyAnswer(card, answer, edit),
    errorMessage: (error) =>
      error instanceof ApiError && error.code === ErrorCode.INVALID_COVER
        ? 'Bu dosya kapak yapılamaz.'
        : 'Değişiklik kaydedilemedi. Tekrar dene.',
  });
}

/** Restores the open (archived) card to its list. The board and the card refetch after it. */
export function useRestoreOpenCard(boardId: string, cardId: string) {
  const restore = useRestoreCard(boardId, {
    onSuccess: () => useCardDetailStore.getState().announce('Kart geri yüklendi.'),
    onError: () =>
      useCardDetailStore
        .getState()
        .showError(cardId, 'Kart geri yüklenemedi. Listesi arşivde olabilir.'),
  });
  return { restore: () => restore.mutate(cardId), isRestoring: restore.isPending };
}

export interface ToggleLabelVariables {
  labelId: string;
  assigned: boolean;
}

/** Adds the label to the card or takes it off. The label chips change at once. */
export function useToggleCardLabel(boardId: string, cardId: string) {
  return useCardMutation({
    boardId,
    cardId,
    mutationFn: ({ labelId, assigned }: ToggleLabelVariables) =>
      assigned
        ? cardDetailApi.assignLabel(cardId, labelId)
        : cardDetailApi.unassignLabel(cardId, labelId),
    optimistic: (card, { labelId, assigned }) => setLabelAssigned(card, labelId, assigned),
    touches: ({ labelId }) => [`label:${labelId}`],
    revert: (card, previous, { labelId }) =>
      setLabelAssigned(card, labelId, previous.labelIds.includes(labelId)),
    errorMessage: (error) =>
      error instanceof ApiError && error.code === ErrorCode.LABEL_NOT_IN_BOARD
        ? 'Etiket bulunamadı, silinmiş olabilir.'
        : 'Etiket değişikliği kaydedilemedi. Tekrar dene.',
  });
}

export interface ToggleMemberVariables {
  userId: string;
  assigned: boolean;
}

/** Assigns the board member to the card or takes them off. The avatars change at once. */
export function useToggleCardMember(boardId: string, cardId: string) {
  return useCardMutation({
    boardId,
    cardId,
    mutationFn: ({ userId, assigned }: ToggleMemberVariables) =>
      assigned
        ? cardDetailApi.assignMember(cardId, userId)
        : cardDetailApi.unassignMember(cardId, userId),
    optimistic: (card, { userId, assigned }) => setMemberAssigned(card, userId, assigned),
    touches: ({ userId }) => [`member:${userId}`],
    revert: (card, previous, { userId }) =>
      setMemberAssigned(card, userId, previous.memberIds.includes(userId)),
    errorMessage: (error) =>
      error instanceof ApiError && error.code === ErrorCode.NOT_BOARD_MEMBER
        ? 'Bu kişi artık panonun üyesi değil.'
        : 'Üye değişikliği kaydedilemedi. Tekrar dene.',
  });
}
