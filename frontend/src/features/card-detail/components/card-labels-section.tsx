import type { BoardDetailDto, CardDetailDto } from '@trello/contracts';
import type { KeyboardEvent } from 'react';
import { Button } from '../../../shared/ui/button';
import { LabelIcon } from '../../../shared/ui/icons';
import { LabelChip } from '../../../shared/ui/label-chip';
import { LabelsManager } from '../../board-detail';
import { useCardLabels } from '../hooks/use-card-labels';
import { panelId } from '../hooks/use-card-panel';
import { LabelPicker } from './label-picker';

interface CardLabelsSectionProps {
  board: BoardDetailDto;
  card: CardDetailDto;
}

/** The card's labels, and the section that opens to pick them or to manage the board's labels. */
export function CardLabelsSection({ board, card }: CardLabelsSectionProps) {
  const { panel, cardLabels, isAssigned, toggle, managing, setManaging } = useCardLabels(
    board,
    card,
  );
  if (cardLabels.length === 0 && !panel.isOpen) return null;

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    // Escape in a dialog opened from inside (e.g. a delete confirmation) belongs to that dialog.
    const insideNestedDialog =
      event.target instanceof Element &&
      event.target.closest('dialog') !== event.currentTarget.closest('dialog');
    if (event.key === 'Escape' && !insideNestedDialog) {
      // Keep Escape from also closing the dialog.
      event.preventDefault();
      event.stopPropagation();
      setManaging(false);
      panel.close();
    }
  }

  return (
    <section aria-labelledby="card-labels-title" className="flex flex-col gap-2">
      <h3 id="card-labels-title" className="flex items-center gap-2 text-base font-semibold">
        <LabelIcon />
        Etiketler
      </h3>
      {cardLabels.length > 0 && (
        <ul aria-label="Kartın etiketleri" className="flex flex-wrap gap-1">
          {cardLabels.map((label) => (
            <li key={label.id} className="max-w-full min-w-0">
              <LabelChip label={label} size="md" />
            </li>
          ))}
        </ul>
      )}
      {panel.isOpen && (
        <div
          id={panelId('labels')}
          onKeyDown={onKeyDown}
          className="flex flex-col gap-3 rounded-md bg-surface-sunken p-3"
        >
          {managing ? (
            <LabelsManager boardId={board.board.id} labels={board.labels} />
          ) : (
            <LabelPicker labels={board.labels} isAssigned={isAssigned} onToggle={toggle} />
          )}
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              className="h-8 px-3"
              onClick={() => setManaging(!managing)}
            >
              {managing ? 'Etiketleri seç' : 'Etiketleri düzenle'}
            </Button>
            <Button variant="ghost" className="h-8 px-3" onClick={panel.close}>
              Tamam
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
