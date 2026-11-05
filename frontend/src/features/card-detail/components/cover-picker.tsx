import { LABEL_COLORS, type LabelColor } from '@trello/contracts';
import { useId } from 'react';
import { LABEL_COLOR_CLASS, LABEL_COLOR_NAME } from '../../../shared/lib/label-color';
import { CheckIcon, CloseIcon } from '../../../shared/ui/icons';

interface CoverPickerProps {
  value: LabelColor | null;
  onChange: (color: LabelColor | null) => void;
}

// Module-level so React calls it once on mount, not on every render.
function focusIfChecked(input: HTMLInputElement | null) {
  if (input?.checked) input.focus();
}

const SWATCH =
  'flex h-8 w-12 cursor-pointer items-center justify-center rounded-sm pointer-coarse:h-11 peer-checked:ring-2 peer-checked:ring-fg peer-checked:ring-offset-2 peer-checked:ring-offset-surface-sunken peer-focus-visible:outline-2 peer-focus-visible:outline-offset-4 peer-focus-visible:outline-focus';

/**
 * Radio group of cover colors, "Kapak yok" first. The chosen one is marked with a ring and
 * a check mark, so the state does not rest on color alone. Arrow keys move between them.
 */
export function CoverPicker({ value, onChange }: CoverPickerProps) {
  const name = useId();

  return (
    <fieldset>
      <legend className="mb-2 text-sm font-medium">Kapak rengi</legend>
      <div className="flex flex-wrap gap-2">
        <label title="Kapak yok">
          <input
            ref={focusIfChecked}
            type="radio"
            name={name}
            checked={value === null}
            onChange={() => onChange(null)}
            className="peer sr-only"
          />
          <span className="sr-only">Kapak yok</span>
          <span aria-hidden="true" className={`${SWATCH} border border-line bg-surface text-fg-muted`}>
            {value === null ? <CheckIcon /> : <CloseIcon />}
          </span>
        </label>
        {LABEL_COLORS.map((color) => (
          <label key={color} title={LABEL_COLOR_NAME[color]}>
            <input
              ref={focusIfChecked}
              type="radio"
              name={name}
              checked={value === color}
              onChange={() => onChange(color)}
              className="peer sr-only"
            />
            <span className="sr-only">{LABEL_COLOR_NAME[color]}</span>
            <span aria-hidden="true" className={`${SWATCH} text-on-label ${LABEL_COLOR_CLASS[color]}`}>
              {value === color && <CheckIcon />}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
