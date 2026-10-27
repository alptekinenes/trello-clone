import { BOARD_BACKGROUNDS, BOARD_LIMITS } from '@trello/contracts';
import {
  BOARD_BACKGROUND_CLASS,
  BOARD_BACKGROUND_NAME,
} from '../../../shared/lib/board-background';
import { Button } from '../../../shared/ui/button';
import { Dialog } from '../../../shared/ui/dialog';
import { FormAlert } from '../../../shared/ui/form-alert';
import { TextField } from '../../../shared/ui/text-field';
import { useCreateBoardForm } from '../hooks/use-create-board-form';

export function CreateBoardDialog({ onClose }: { onClose: () => void }) {
  const { form, onSubmit, preview, isPending, serverError } = useCreateBoardForm();
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

        <fieldset>
          <legend className="mb-2 text-sm font-medium">Arka plan</legend>
          <div className="flex flex-wrap gap-2">
            {BOARD_BACKGROUNDS.map((background) => (
              <label key={background} title={BOARD_BACKGROUND_NAME[background]}>
                <input
                  type="radio"
                  value={background}
                  className="peer sr-only"
                  {...register('background')}
                />
                <span className="sr-only">{BOARD_BACKGROUND_NAME[background]}</span>
                <span
                  aria-hidden="true"
                  className={`block h-8 w-12 cursor-pointer rounded-sm ${BOARD_BACKGROUND_CLASS[background]} peer-checked:ring-2 peer-checked:ring-fg peer-checked:ring-offset-2 peer-checked:ring-offset-surface peer-focus-visible:outline-2 peer-focus-visible:outline-offset-4 peer-focus-visible:outline-focus`}
                />
              </label>
            ))}
          </div>
        </fieldset>

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
