import { CHECKLIST_LIMITS } from '@trello/contracts';
import { Button } from '../../../shared/ui/button';
import { CloseIcon, PlusIcon } from '../../../shared/ui/icons';
import { TextField } from '../../../shared/ui/text-field';
import { useAddChecklistItemForm } from '../hooks/use-add-checklist-item-form';
import { addItemButtonId } from '../hooks/use-checklist';

interface AddChecklistItemComposerProps {
  boardId: string;
  cardId: string;
  checklistId: string;
  checklistTitle: string;
}

export function AddChecklistItemComposer({
  boardId,
  cardId,
  checklistId,
  checklistTitle,
}: AddChecklistItemComposerProps) {
  const { isOpen, open, close, openerRef, form, submit, onKeyDown } = useAddChecklistItemForm(
    boardId,
    cardId,
    checklistId,
  );
  const {
    register,
    formState: { errors },
  } = form;

  if (!isOpen) {
    return (
      <Button
        ref={openerRef}
        id={addItemButtonId(checklistId)}
        variant="secondary"
        className="h-8 self-start px-3"
        aria-label={`“${checklistTitle}” checklist'ine öğe ekle`}
        onClick={open}
      >
        <PlusIcon />
        Öğe ekle
      </Button>
    );
  }

  return (
    <form noValidate onSubmit={submit} className="flex flex-col gap-2">
      <TextField
        label="Yeni öğe"
        hideLabel
        placeholder="Bir öğe ekle…"
        maxLength={CHECKLIST_LIMITS.ITEM_CONTENT_MAX}
        error={errors.content?.message}
        {...register('content')}
        onKeyDown={onKeyDown}
      />
      <div className="flex items-center gap-2">
        <Button type="submit" className="h-8 px-3">
          Ekle
        </Button>
        <Button variant="ghost" aria-label="Vazgeç" onClick={close} className="h-8 px-2">
          <CloseIcon />
        </Button>
      </div>
    </form>
  );
}
