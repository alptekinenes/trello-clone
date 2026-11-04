import type { BoardBackground } from '@trello/contracts';
import { BackgroundPicker } from '../../../shared/ui/background-picker';
import { Dialog } from '../../../shared/ui/dialog';

interface BoardBackgroundDialogProps {
  background: BoardBackground;
  onChange: (background: BoardBackground) => void;
  onClose: () => void;
}

/** The choice applies at once; the dialog only closes when the person is done. */
export function BoardBackgroundDialog({ background, onChange, onClose }: BoardBackgroundDialogProps) {
  return (
    <Dialog title="Arka plan" onClose={onClose} showCloseButton>
      <BackgroundPicker value={background} onChange={onChange} label="Arka plan rengi" hideLabel />
    </Dialog>
  );
}
