import { zodResolver } from '@hookform/resolvers/zod';
import type { CardDetailDto } from '@trello/contracts';
import { type KeyboardEvent, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { fromDateTimeLocalValue, toDateTimeLocalValue } from '../../../shared/lib/date';
import { useUpdateCard } from '../api/use-card-mutations';
import { dueDateSchema, type DueDateFormValues } from '../schemas/card-detail-schemas';
import { useCardPanel } from './use-card-panel';

/** Tomorrow at noon, local time: where the picker starts for a card without a due date. */
function tomorrowNoon(): string {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  date.setHours(12, 0, 0, 0);
  return toDateTimeLocalValue(date.toISOString());
}

/** The due date form. The value is local time; the server gets the UTC instant. */
export function useDueDateForm(boardId: string, card: CardDetailDto) {
  const panel = useCardPanel('due-date');
  const updateCard = useUpdateCard(boardId, card.id);
  const form = useForm<DueDateFormValues>({
    resolver: zodResolver(dueDateSchema),
    defaultValues: {
      dueDate: card.dueDate ? toDateTimeLocalValue(card.dueDate) : tomorrowNoon(),
    },
  });
  const { setFocus } = form;

  useEffect(() => setFocus('dueDate'), [setFocus]);

  const save = form.handleSubmit(({ dueDate }) => {
    updateCard.mutate({ dueDate: fromDateTimeLocalValue(dueDate) });
    panel.close();
  });

  function remove() {
    updateCard.mutate({ dueDate: null });
    panel.close();
  }

  function onKeyDown(event: KeyboardEvent<HTMLFormElement>) {
    if (event.key === 'Escape') {
      // Keep Escape from also closing the dialog.
      event.preventDefault();
      event.stopPropagation();
      panel.close();
    }
  }

  return { form, save, remove, cancel: panel.close, onKeyDown, hasDueDate: card.dueDate !== null };
}

/** Marks the due date done or not. */
export function useDueComplete(boardId: string, cardId: string) {
  const updateCard = useUpdateCard(boardId, cardId);
  return (dueComplete: boolean) => updateCard.mutate({ dueComplete });
}
