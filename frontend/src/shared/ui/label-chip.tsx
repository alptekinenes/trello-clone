import type { LabelDto } from '@trello/contracts';
import { LABEL_COLOR_CLASS, LABEL_COLOR_NAME } from '../lib/label-color';

interface LabelChipProps {
  label: Pick<LabelDto, 'name' | 'color'>;
  size?: 'sm' | 'md';
}

const SIZE_CLASS = { sm: 'px-2 text-xs', md: 'px-3 py-1 text-sm' } as const;

/** Colored label. Without a name it is a short color bar; the color name is read out instead. */
export function LabelChip({ label, size = 'sm' }: LabelChipProps) {
  const color = LABEL_COLOR_CLASS[label.color];
  if (label.name === '') {
    return (
      <span className={`inline-block h-2 w-10 rounded-full ${color}`}>
        <span className="sr-only">{`${LABEL_COLOR_NAME[label.color]} etiket`}</span>
      </span>
    );
  }
  return (
    <span
      title={label.name}
      className={`inline-block max-w-full truncate rounded-sm font-medium leading-5 text-on-label ${color} ${SIZE_CLASS[size]}`}
    >
      {label.name}
    </span>
  );
}
