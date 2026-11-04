import type { BoardBackground } from '@trello/contracts';
import { BackgroundPicker } from '../../../shared/ui/background-picker';
import { Dialog } from '../../../shared/ui/dialog';
import { useBackgroundDialogError } from '../hooks/use-background-dialog-error';

interface BoardBackgroundDialogProps {
  background: BoardBackground;
  onChange: (background: BoardBackground) => void;
  onClose: () => void;
}

/** The choice applies at once; the dialog only closes when the person is done. */
export function BoardBackgroundDialog({ background, onChange, onClose }: BoardBackgroundDialogProps) {
  const error = useBackgroundDialogError();

  return (
    <Dialog title="Arka plan" onClose={onClose} showCloseButton>
      <BackgroundPicker value={background} onChange={onChange} label="Arka plan rengi" hideLabel />
      {error && (
        <p role="alert" className="mt-3 rounded-md bg-danger-subtle px-2 py-1 text-sm text-danger">
          {error}
        </p>
      )}
    </Dialog>
  );
}
