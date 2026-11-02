import { zodResolver } from '@hookform/resolvers/zod';
import { type KeyboardEvent, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { useForm } from 'react-hook-form';
import { useUpdateCard } from '../api/use-card-mutations';
import {
  descriptionSchema,
  type DescriptionFormOutput,
  type DescriptionFormValues,
} from '../schemas/card-detail-schemas';

/**
 * The description of the open card: read it, or edit it in place. Ctrl/Cmd+Enter saves,
 * Escape cancels (without closing the dialog). Blank text is saved as no description.
 */
export function useDescriptionEditor(boardId: string, cardId: string, description: string | null) {
  const [isEditing, setIsEditing] = useState(false);
  const openerRef = useRef<HTMLButtonElement>(null);
  const updateCard = useUpdateCard(boardId, cardId);
  const form = useForm<DescriptionFormValues, unknown, DescriptionFormOutput>({
    resolver: zodResolver(descriptionSchema),
    defaultValues: { description: description ?? '' },
  });

  function open() {
    form.reset({ description: description ?? '' });
    flushSync(() => setIsEditing(true));
    form.setFocus('description');
  }

  function close() {
    flushSync(() => setIsEditing(false));
    openerRef.current?.focus();
  }

  const save = form.handleSubmit(({ description: next }) => {
    if (next !== (description ?? '')) updateCard.mutate({ description: next === '' ? null : next });
    close();
  });

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Escape') {
      // Keep Escape from also closing the dialog.
      event.preventDefault();
      event.stopPropagation();
      close();
    } else if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      void save();
    }
  }

  return { isEditing, openerRef, form, open, close, save, onKeyDown };
}
