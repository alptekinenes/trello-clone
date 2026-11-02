import { zodResolver } from '@hookform/resolvers/zod';
import { type KeyboardEvent, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { useForm } from 'react-hook-form';
import { useCreateChecklistItem } from '../api/use-checklist-mutations';
import { checklistItemSchema, type ChecklistItemFormValues } from '../schemas/card-detail-schemas';

const DEFAULT_VALUES: ChecklistItemFormValues = { content: '' };

/**
 * "Öğe ekle" composer at the end of a checklist: opens in place and stays open after
 * adding, so several items can follow each other. The field empties at once; an item
 * that fails comes back into the field if it is still empty. Escape closes it.
 */
export function useAddChecklistItemForm(boardId: string, cardId: string, checklistId: string) {
  const [isOpen, setIsOpen] = useState(false);
  const openerRef = useRef<HTMLButtonElement>(null);
  const createItem = useCreateChecklistItem(boardId, cardId);
  const form = useForm({ resolver: zodResolver(checklistItemSchema), defaultValues: DEFAULT_VALUES });

  function open() {
    flushSync(() => setIsOpen(true));
    form.setFocus('content');
  }

  function close() {
    form.reset();
    flushSync(() => setIsOpen(false));
    openerRef.current?.focus();
  }

  const submit = form.handleSubmit(({ content }) => {
    form.reset();
    form.setFocus('content');
    createItem.mutate(
      { checklistId, content },
      {
        onError: () => {
          if (!form.getValues('content')) form.setValue('content', content);
        },
      },
    );
  });

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Escape') {
      // Keep Escape from also closing the dialog.
      event.preventDefault();
      event.stopPropagation();
      close();
    }
  }

  return { isOpen, open, close, openerRef, form, submit, onKeyDown };
}
