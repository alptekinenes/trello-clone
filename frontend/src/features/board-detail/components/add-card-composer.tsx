import { CARD_LIMITS } from '@trello/contracts';
import { Button } from '../../../shared/ui/button';
import { FormAlert } from '../../../shared/ui/form-alert';
import { CloseIcon, PlusIcon } from '../../../shared/ui/icons';
import { TextArea } from '../../../shared/ui/text-area';
import { useAddCardForm } from '../hooks/use-add-card-form';

interface AddCardComposerProps {
  boardId: string;
  listId: string;
  listTitle: string;
}

export function AddCardComposer({ boardId, listId, listTitle }: AddCardComposerProps) {
  const { isOpen, open, close, openerRef, form, onSubmit, onKeyDown, isPending, serverError } =
    useAddCardForm(boardId, listId);
  const {
    register,
    formState: { errors },
  } = form;

  if (!isOpen) {
    return (
      <div className="px-2 pb-2">
        <button
          ref={openerRef}
          type="button"
          onClick={open}
          aria-label={`“${listTitle}” listesine kart ekle`}
          className="flex h-9 w-full items-center gap-2 rounded-md px-2 text-sm font-medium text-fg-muted transition-colors hover:bg-surface-hover hover:text-fg"
        >
          <PlusIcon />
          Kart ekle
        </button>
      </div>
    );
  }

  return (
    <form noValidate onSubmit={onSubmit} className="flex flex-col gap-2 px-2 pb-2">
      {serverError && <FormAlert>{serverError}</FormAlert>}
      <TextArea
        label="Kart başlığı"
        hideLabel
        placeholder="Bu kart için bir başlık gir…"
        maxLength={CARD_LIMITS.TITLE_MAX}
        error={errors.title?.message}
        className="shadow-card"
        {...register('title')}
        onKeyDown={onKeyDown}
      />
      <div className="flex items-center gap-2">
        <Button type="submit" loading={isPending} className="h-8 px-3">
          Kartı ekle
        </Button>
        <Button variant="ghost" aria-label="Vazgeç" onClick={close} className="h-8 px-2">
          <CloseIcon />
        </Button>
      </div>
    </form>
  );
}
