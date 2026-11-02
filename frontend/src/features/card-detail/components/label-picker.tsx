import type { LabelDto } from '@trello/contracts';
import { LABEL_COLOR_CLASS, LABEL_COLOR_NAME } from '../../../shared/lib/label-color';

interface LabelPickerProps {
  labels: LabelDto[];
  isAssigned: (labelId: string) => boolean;
  onToggle: (labelId: string, assigned: boolean) => void;
}

// Module-level so React calls it once on mount, not on every render.
function focus(input: HTMLInputElement | null) {
  input?.focus();
}

/** One checkbox per board label; ticking it puts the label on the card. */
export function LabelPicker({ labels, isAssigned, onToggle }: LabelPickerProps) {
  if (labels.length === 0) {
    return <p className="text-sm text-fg-muted">Bu panoda henüz etiket yok.</p>;
  }

  return (
    <fieldset className="flex flex-col gap-1">
      <legend className="sr-only">Etiketler</legend>
      {labels.map((label, index) => (
        <label
          key={label.id}
          className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1 hover:bg-surface-hover"
        >
          <input
            ref={index === 0 ? focus : undefined}
            type="checkbox"
            checked={isAssigned(label.id)}
            onChange={(event) => onToggle(label.id, event.target.checked)}
            className="size-4 accent-primary"
          />
          <span
            aria-hidden="true"
            className={`h-6 w-10 shrink-0 rounded-sm ${LABEL_COLOR_CLASS[label.color]}`}
          />
          <span className="min-w-0 flex-1 truncate text-sm">
            {label.name === '' ? `${LABEL_COLOR_NAME[label.color]} etiket` : label.name}
          </span>
        </label>
      ))}
    </fieldset>
  );
}
