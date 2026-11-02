import type { CardSummaryDto, LabelDto } from '@trello/contracts';
import { ChecklistIcon, DescriptionIcon } from '../../../shared/ui/icons';
import { DueBadge } from '../../../shared/ui/due-badge';
import { LabelChip } from '../../../shared/ui/label-chip';

interface CardTileBodyProps {
  card: CardSummaryDto;
  /** Labels of the board by id, in board order. */
  labels: ReadonlyMap<string, LabelDto>;
  /** Ids the tile uses to name and describe its drag handle. */
  titleId?: string;
  labelsId?: string;
  badgesId?: string;
}

/** Labels of the card, in board label order; ids of deleted labels are left out. */
function labelsOf(card: CardSummaryDto, labels: ReadonlyMap<string, LabelDto>): LabelDto[] {
  const assigned = new Set(card.labelIds);
  return [...labels.values()].filter((label) => assigned.has(label.id));
}

/** What a card looks like in a list and while dragging: labels, title and badges. */
export function CardTileBody({ card, labels, titleId, labelsId, badgesId }: CardTileBodyProps) {
  const cardLabels = labelsOf(card, labels);
  const hasChecklist = card.checklistTotal > 0;
  const checklistDone = hasChecklist && card.checklistDone === card.checklistTotal;
  const hasBadges = card.dueDate !== null || card.hasDescription || hasChecklist;

  return (
    <>
      {cardLabels.length > 0 && (
        <ul id={labelsId} aria-label="Etiketler" className="mb-1 flex flex-wrap gap-1">
          {cardLabels.map((label) => (
            <li key={label.id} className="max-w-full min-w-0">
              <LabelChip label={label} />
            </li>
          ))}
        </ul>
      )}
      <p id={titleId} className="break-words">
        {card.title}
      </p>
      {hasBadges && (
        <div id={badgesId} className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-fg-muted">
          {card.dueDate !== null && <DueBadge dueDate={card.dueDate} dueComplete={card.dueComplete} />}
          {card.hasDescription && (
            <span className="inline-flex items-center">
              <DescriptionIcon className="size-3.5" />
              <span className="sr-only">Açıklaması var</span>
            </span>
          )}
          {hasChecklist && (
            <span
              className={`inline-flex items-center gap-1 rounded-sm px-1 py-0.5 ${checklistDone ? 'bg-success-subtle text-success' : ''}`}
            >
              <ChecklistIcon className="size-3.5" />
              <span aria-hidden="true">{`${card.checklistDone}/${card.checklistTotal}`}</span>
              <span className="sr-only">
                {`Checklist: ${card.checklistTotal} öğeden ${card.checklistDone} tanesi tamamlandı`}
              </span>
            </span>
          )}
        </div>
      )}
    </>
  );
}
