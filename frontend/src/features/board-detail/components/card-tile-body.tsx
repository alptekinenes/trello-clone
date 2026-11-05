import type { CardSummaryDto, LabelDto, MemberDto } from '@trello/contracts';
import { LABEL_COLOR_CLASS } from '../../../shared/lib/label-color';
import { AvatarStack } from '../../../shared/ui/avatar';
import { CheckIcon, ChecklistIcon, DescriptionIcon, EyeIcon } from '../../../shared/ui/icons';
import { DueBadge } from '../../../shared/ui/due-badge';
import { LabelChip } from '../../../shared/ui/label-chip';

interface CardTileBodyProps {
  card: CardSummaryDto;
  /** Labels of the board by id, in board order. */
  labels: ReadonlyMap<string, LabelDto>;
  /** Members of the board by user id. */
  members: ReadonlyMap<string, MemberDto>;
  /** Ids of the cards the current user watches. */
  watched: ReadonlySet<string>;
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

/** Members on the card, in assignment order; ids of people who left the board are left out. */
function membersOf(card: CardSummaryDto, members: ReadonlyMap<string, MemberDto>): MemberDto[] {
  return card.memberIds.flatMap((id) => {
    const member = members.get(id);
    return member ? [member] : [];
  });
}

/** What a card looks like in a list and while dragging: cover, labels, title and badges. */
export function CardTileBody({
  card,
  labels,
  members,
  watched,
  titleId,
  labelsId,
  badgesId,
}: CardTileBodyProps) {
  const cardLabels = labelsOf(card, labels);
  const cardMembers = membersOf(card, members);
  const hasChecklist = card.checklistTotal > 0;
  const checklistDone = hasChecklist && card.checklistDone === card.checklistTotal;
  const isWatched = watched.has(card.id);
  const isCompleted = card.completedAt !== null;
  const hasBadges =
    card.dueDate !== null ||
    card.hasDescription ||
    hasChecklist ||
    isWatched ||
    cardMembers.length > 0;

  return (
    <>
      {card.coverColor !== null && (
        <div
          aria-hidden="true"
          className={`-mx-3 -mt-2 mb-2 h-8 rounded-t-md ${LABEL_COLOR_CLASS[card.coverColor]}`}
        />
      )}
      {cardLabels.length > 0 && (
        <ul id={labelsId} aria-label="Etiketler" className="mb-1 flex flex-wrap gap-1">
          {cardLabels.map((label) => (
            <li key={label.id} className="max-w-full min-w-0">
              <LabelChip label={label} />
            </li>
          ))}
        </ul>
      )}
      <p className="flex items-start gap-1.5">
        {isCompleted && (
          <span className="mt-0.5 inline-flex shrink-0 items-center text-success">
            <CheckIcon className="size-4" />
            <span className="sr-only">Kart tamamlandı</span>
          </span>
        )}
        <span id={titleId} className="min-w-0 break-words">
          {card.title}
        </span>
      </p>
      {hasBadges && (
        <div id={badgesId} className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-fg-muted">
          {isWatched && (
            <span className="inline-flex items-center">
              <EyeIcon className="size-3.5" />
              <span className="sr-only">İzliyorsun</span>
            </span>
          )}
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
          {card.dueDate !== null && <DueBadge dueDate={card.dueDate} dueComplete={card.dueComplete} />}
          {cardMembers.length > 0 && (
            <div className="ml-auto">
              <AvatarStack
                people={cardMembers.map((member) => ({ ...member, id: member.userId }))}
                size="sm"
                max={3}
                label="Kart üyeleri"
              />
            </div>
          )}
        </div>
      )}
    </>
  );
}
