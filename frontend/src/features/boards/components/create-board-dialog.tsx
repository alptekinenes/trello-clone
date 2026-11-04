import { BOARD_LIMITS } from '@trello/contracts';
import { BOARD_BACKGROUND_CLASS } from '../../../shared/lib/board-background';
import { BackgroundPicker } from '../../../shared/ui/background-picker';
import { Button } from '../../../shared/ui/button';
import { Dialog } from '../../../shared/ui/dialog';
import { FormAlert } from '../../../shared/ui/form-alert';
import { TextField } from '../../../shared/ui/text-field';
import { useCreateBoardForm } from '../hooks/use-create-board-form';

export function CreateBoardDialog({ onClose }: { onClose: () => void }) {
  const { form, onSubmit, preview, selectBackground, isPending, serverError } =
    useCreateBoardForm(onClose);
  const {
    register,
    formState: { errors },
  } = form;

  return (
    <Dialog title="Pano oluştur" onClose={onClose}>
      <form noValidate onSubmit={onSubmit} className="flex flex-col gap-4">
        <div
          aria-hidden="true"
          className={`flex h-20 items-end rounded-md p-3 text-sm font-semibold text-on-board ${BOARD_BACKGROUND_CLASS[preview.background]}`}
        >
          <span className="truncate">{preview.title || 'Pano adı'}</span>
        </div>

        {serverError && <FormAlert>{serverError}</FormAlert>}

        <TextField
          label="Pano adı"
          maxLength={BOARD_LIMITS.TITLE_MAX}
          error={errors.title?.message}
          {...register('title')}
        />

        <BackgroundPicker value={preview.background} onChange={selectBackground} />

        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Vazgeç
          </Button>
          <Button type="submit" loading={isPending}>
            {isPending ? 'Oluşturuluyor…' : 'Oluştur'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
