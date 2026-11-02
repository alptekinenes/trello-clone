import type { LabelDto } from '@trello/contracts';
import { useState } from 'react';
import { apiErrorMessage } from '../../../shared/lib/api-error-message';
import { useCreateLabel, useDeleteLabel, useUpdateLabel } from '../api/use-label-mutations';
import type { LabelFormOutput } from '../schemas/label-schemas';

type Editing = { kind: 'new' } | { kind: 'edit'; labelId: string } | null;

/** State of the label manager: which form is open, saving and the confirmed delete. */
export function useLabelsManager(boardId: string) {
  const [editing, setEditing] = useState<Editing>(null);
  const [deleting, setDeleting] = useState<LabelDto | null>(null);
  const create = useCreateLabel(boardId);
  const update = useUpdateLabel(boardId);
  const remove = useDeleteLabel(boardId);

  function open(next: Editing) {
    create.reset();
    update.reset();
    setEditing(next);
  }

  function close() {
    create.reset();
    setEditing(null);
  }

  function save(values: LabelFormOutput) {
    if (editing?.kind === 'edit') {
      update.mutate({ labelId: editing.labelId, ...values });
      setEditing(null);
    } else {
      create.mutate(values, { onSuccess: close });
    }
  }

  function confirmDelete() {
    if (!deleting) return;
    remove.mutate(deleting.id, {
      onSuccess: () => {
        setDeleting(null);
        setEditing(null);
      },
    });
  }

  function cancelDelete() {
    setDeleting(null);
    remove.reset();
  }

  const error = create.error ?? update.error;
  return {
    editing,
    startNew: () => open({ kind: 'new' }),
    startEdit: (labelId: string) => open({ kind: 'edit', labelId }),
    close,
    save,
    isSaving: create.isPending,
    saveError: error ? apiErrorMessage(error) : null,
    deleting,
    askDelete: setDeleting,
    confirmDelete,
    cancelDelete,
    isDeleting: remove.isPending,
    deleteError: remove.error ? apiErrorMessage(remove.error) : null,
  };
}
