import { zodResolver } from '@hookform/resolvers/zod';
import { type KeyboardEvent, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { useCreateChecklist } from '../api/use-checklist-mutations';
import {
  checklistTitleSchema,
  type ChecklistTitleFormValues,
} from '../schemas/card-detail-schemas';
import { useCardPanel } from './use-card-panel';

export const DEFAULT_CHECKLIST_TITLE = 'Checklist';

/** The "Checklist" section: a title field. The section closes when the checklist was created. */
export function useAddChecklistForm(boardId: string, cardId: string) {
  const panel = useCardPanel('checklist');
  const createChecklist = useCreateChecklist(boardId, cardId);
  const form = useForm<ChecklistTitleFormValues>({
    resolver: zodResolver(checklistTitleSchema),
    defaultValues: { title: DEFAULT_CHECKLIST_TITLE },
  });
  const { setFocus } = form;

  useEffect(() => setFocus('title'), [setFocus]);

  const submit = form.handleSubmit(({ title }) => {
    createChecklist.mutate(title, { onSuccess: panel.close });
  });

  function onKeyDown(event: KeyboardEvent<HTMLFormElement>) {
    if (event.key === 'Escape') {
      // Keep Escape from also closing the dialog.
      event.preventDefault();
      event.stopPropagation();
      panel.close();
    }
  }

  return { form, submit, onKeyDown, cancel: panel.close, isPending: createChecklist.isPending };
}
