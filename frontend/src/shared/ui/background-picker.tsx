import { BOARD_BACKGROUNDS, type BoardBackground } from '@trello/contracts';
import { useId } from 'react';
import { BOARD_BACKGROUND_CLASS, BOARD_BACKGROUND_NAME } from '../lib/board-background';
import { CheckIcon } from './icons';

interface BackgroundPickerProps {
  value: BoardBackground;
  onChange: (background: BoardBackground) => void;
  /** Name of the group; "Arka plan" by default. */
  label?: string;
  /** Keeps the label for assistive technology but does not show it (when a title already says it). */
  hideLabel?: boolean;
}

/**
 * Radio group of board background swatches. The chosen one is marked with a ring and a
 * check mark, so the state does not rest on color alone. Arrow keys move between swatches.
 */
export function BackgroundPicker({
  value,
  onChange,
  label = 'Arka plan',
  hideLabel = false,
}: BackgroundPickerProps) {
  const name = useId();

  return (
    <fieldset>
      <legend className={hideLabel ? 'sr-only' : 'mb-2 text-sm font-medium'}>{label}</legend>
      <div className="flex flex-wrap gap-2">
        {BOARD_BACKGROUNDS.map((background) => (
          <label key={background} title={BOARD_BACKGROUND_NAME[background]}>
            <input
              type="radio"
              name={name}
              value={background}
              checked={value === background}
              onChange={() => onChange(background)}
              className="peer sr-only"
            />
            <span className="sr-only">{BOARD_BACKGROUND_NAME[background]}</span>
            <span
              aria-hidden="true"
              className={`flex h-8 w-12 cursor-pointer items-center justify-center rounded-sm text-on-board pointer-coarse:h-11 ${BOARD_BACKGROUND_CLASS[background]} peer-checked:ring-2 peer-checked:ring-fg peer-checked:ring-offset-2 peer-checked:ring-offset-surface peer-focus-visible:outline-2 peer-focus-visible:outline-offset-4 peer-focus-visible:outline-focus`}
            >
              {value === background && <CheckIcon />}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
