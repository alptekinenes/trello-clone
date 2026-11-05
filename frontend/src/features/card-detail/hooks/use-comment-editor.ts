import { zodResolver } from '@hookform/resolvers/zod';
import { canDeleteComment, canEditComment, type CommentDto, type MemberRef } from '@trello/contracts';
import { type KeyboardEvent, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { useForm } from 'react-hook-form';
import { useDeleteComment, useEditComment } from '../api/use-comment-mutations';
import { COMMENT_COMPOSER_ID } from '../lib/focus-ids';
import {
  commentBodySchema,
  type CommentFormOutput,
  type CommentFormValues,
} from '../schemas/card-detail-schemas';

/** Focuses the first button of a later feed item, or the comment form when none has one. */
function focusAfterDelete(item: HTMLElement | null) {
  for (let next = item?.nextElementSibling; next; next = next.nextElementSibling) {
    const button = next.querySelector('button');
    if (button) {
      button.focus();
      return;
    }
  }
  document.getElementById(COMMENT_COMPOSER_ID)?.focus();
}

/**
 * What the viewer can do with one comment: edit it in place (Ctrl/Cmd+Enter saves, Escape
 * cancels without closing the dialog) or delete it after a confirmation.
 * Only the buttons the shared rules allow are offered; the server checks them again.
 */
export function useCommentActions(
  boardId: string,
  cardId: string,
  comment: CommentDto,
  viewer: MemberRef | null,
) {
  const [isEditing, setIsEditing] = useState(false);
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const editButtonRef = useRef<HTMLButtonElement>(null);
  const itemRef = useRef<HTMLLIElement>(null);
  const editComment = useEditComment(boardId, cardId);
  const deleteComment = useDeleteComment(boardId, cardId);
  const form = useForm<CommentFormValues, unknown, CommentFormOutput>({
    resolver: zodResolver(commentBodySchema),
    defaultValues: { body: comment.body },
  });

  const canEdit = viewer !== null && canEditComment(viewer.userId, comment.author.id);
  const canDelete = viewer !== null && canDeleteComment(viewer, comment.author.id);

  function startEditing() {
    form.reset({ body: comment.body });
    flushSync(() => setIsEditing(true));
    form.setFocus('body');
  }

  function stopEditing() {
    flushSync(() => setIsEditing(false));
    editButtonRef.current?.focus();
  }

  const save = form.handleSubmit(({ body }) => {
    if (body !== comment.body) editComment.mutate({ id: comment.id, body });
    stopEditing();
  });

  function onEditKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Escape') {
      // Keep Escape from also closing the card dialog.
      event.preventDefault();
      event.stopPropagation();
      stopEditing();
    } else if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      void save();
    }
  }

  function confirmDelete() {
    // The row and its buttons are about to go: hand the focus on once the confirmation is gone.
    flushSync(() => setIsConfirmingDelete(false));
    focusAfterDelete(itemRef.current);
    deleteComment.mutate(comment.id);
  }

  return {
    canEdit,
    canDelete,
    isEditing,
    editButtonRef,
    itemRef,
    form,
    startEditing,
    stopEditing,
    save,
    onEditKeyDown,
    isConfirmingDelete,
    askToDelete: () => setIsConfirmingDelete(true),
    cancelDelete: () => setIsConfirmingDelete(false),
    confirmDelete,
  };
}
