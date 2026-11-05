import type { CardDetailDto } from '@trello/contracts';
import { CheckIcon } from '../../../shared/ui/icons';
import { useCardCompletion } from '../hooks/use-card-completion';

interface CardCompleteToggleProps {
  boardId: string;
  card: CardDetailDto;
}

/** Round check box left of the title that marks the card complete. */
export function CardCompleteToggle({ boardId, card }: CardCompleteToggleProps) {
  const { isCompleted, setCompleted } = useCardCompletion(boardId, card);

  return (
    <label className="flex size-8 shrink-0 cursor-pointer items-center justify-center pointer-coarse:size-11">
      <input
        type="checkbox"
        checked={isCompleted}
        onChange={(event) => setCompleted(event.target.checked)}
        className="peer sr-only"
      />
      <span className="sr-only">Kartı tamamla</span>
      <span
        aria-hidden="true"
        className="flex size-6 items-center justify-center rounded-full border-2 border-line-strong text-surface peer-checked:border-success peer-checked:bg-success peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-focus"
      >
        {isCompleted && <CheckIcon />}
      </span>
    </label>
  );
}
