import { CHECKLIST_LIMITS } from '@trello/contracts';
import { Button } from '../../../shared/ui/button';
import { TextField } from '../../../shared/ui/text-field';
import { useAddChecklistForm } from '../hooks/use-add-checklist-form';
import { panelId } from '../hooks/use-card-panel';

/** The "Checklist" section: names a new checklist. */
export function AddChecklistForm({ boardId, cardId }: { boardId: string; cardId: string }) {
  const { form, submit, onKeyDown, cancel, isPending } = useAddChecklistForm(boardId, cardId);
  const {
    register,
    formState: { errors },
  } = form;

  return (
    <form
      id={panelId('checklist')}
      noValidate
      onSubmit={submit}
      onKeyDown={onKeyDown}
      className="flex flex-col gap-2 rounded-md bg-surface-sunken p-3"
    >
      <TextField
        label="Checklist başlığı"
        maxLength={CHECKLIST_LIMITS.TITLE_MAX}
        error={errors.title?.message}
        {...register('title')}
      />
      <div className="flex items-center gap-2">
        <Button type="submit" loading={isPending} className="h-8 px-3">
          Ekle
        </Button>
        <Button variant="ghost" className="h-8 px-3" onClick={cancel}>
          Vazgeç
        </Button>
      </div>
    </form>
  );
}
