import { zodResolver } from '@hookform/resolvers/zod';
import type { KeyboardEvent } from 'react';
import { useForm } from 'react-hook-form';
import { useAddComment } from '../api/use-comment-mutations';
import {
  commentBodySchema,
  type CommentFormOutput,
  type CommentFormValues,
} from '../schemas/card-detail-schemas';

/**
 * The form that adds a comment. The text leaves the field as soon as it is sent and comes
 * back when sending fails (unless something new was typed meanwhile). Ctrl/Cmd+Enter sends;
 * Escape leaves a filled field (without closing the dialog), an empty one lets the dialog close.
 */
export function useCommentForm(boardId: string, cardId: string) {
  const addComment = useAddComment(boardId, cardId);
  const form = useForm<CommentFormValues, unknown, CommentFormOutput>({
    resolver: zodResolver(commentBodySchema),
    defaultValues: { body: '' },
  });

  const submit = form.handleSubmit(({ body }) => {
    addComment.mutate(body, {
      onError: () => {
        if (form.getValues('body') === '') form.setValue('body', body);
      },
    });
    form.reset({ body: '' });
  });

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Escape' && event.currentTarget.value !== '') {
      event.preventDefault();
      event.stopPropagation();
      event.currentTarget.blur();
    } else if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      void submit();
    }
  }

  return { form, submit, onKeyDown };
}
