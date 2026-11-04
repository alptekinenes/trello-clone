import { LIST_LIMITS } from '@trello/contracts';
import { Button } from '../../../shared/ui/button';
import { FormAlert } from '../../../shared/ui/form-alert';
import { CloseIcon, PlusIcon } from '../../../shared/ui/icons';
import { TextField } from '../../../shared/ui/text-field';
import { useAddListForm } from '../hooks/use-add-list-form';
import { LIST_WIDTH } from './board-list';

export function AddListComposer({ boardId, hasLists }: { boardId: string; hasLists: boolean }) {
  const { isOpen, open, close, openerRef, form, onSubmit, isPending, serverError } =
    useAddListForm(boardId);
  const {
    register,
    formState: { errors },
  } = form;

  if (!isOpen) {
    return (
      <button
        ref={openerRef}
        type="button"
        onClick={open}
        className={`flex h-11 ${LIST_WIDTH} shrink-0 snap-start items-center gap-2 rounded-lg bg-board-control px-3 text-sm font-medium text-on-board transition-colors hover:bg-board-control-hover`}
      >
        <PlusIcon />
        {hasLists ? 'Başka liste ekle' : 'Liste ekle'}
      </button>
    );
  }

  return (
    <form
      noValidate
      onSubmit={onSubmit}
      className={`flex ${LIST_WIDTH} shrink-0 snap-start flex-col gap-2 rounded-lg bg-list p-2 shadow-card`}
    >
      {serverError && <FormAlert>{serverError}</FormAlert>}
      <TextField
        label="Liste adı"
        hideLabel
        placeholder="Liste adını gir…"
        maxLength={LIST_LIMITS.TITLE_MAX}
        autoComplete="off"
        error={errors.title?.message}
        className="h-9"
        {...register('title')}
        onKeyDown={(event) => {
          if (event.key === 'Escape') close();
        }}
      />
      <div className="flex items-center gap-2">
        <Button type="submit" loading={isPending} className="h-8 px-3">
          Listeyi ekle
        </Button>
        <Button variant="ghost" aria-label="Vazgeç" onClick={close} className="h-8 px-2">
          <CloseIcon />
        </Button>
      </div>
    </form>
  );
}
