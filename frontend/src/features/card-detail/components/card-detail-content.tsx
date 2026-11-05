import type { BoardDetailDto, CardDetailDto } from '@trello/contracts';
import { LABEL_COLOR_CLASS } from '../../../shared/lib/label-color';
import { ChecklistIcon, ClockIcon, CoverIcon, LabelIcon, MembersIcon } from '../../../shared/ui/icons';
import { useFocusArchiveAfterRestore } from '../hooks/use-focus-archive-after-restore';
import { useCardDetailStore } from '../store/card-detail-store';
import { ArchivedCardBanner } from './archived-card-banner';
import { CardCompleteToggle } from './card-complete-toggle';
import { CardCoverSection } from './card-cover-section';
import { CardDescription } from './card-description';
import { CardDetailAlert } from './card-detail-alert';
import { CardLabelsSection } from './card-labels-section';
import { CardMembersSection } from './card-members-section';
import { CardTitleEditor } from './card-title-editor';
import { ChecklistsSection } from './checklists-section';
import { DueDateSection } from './due-date-section';
import { PanelButton } from './panel-button';

interface CardDetailContentProps {
  board: BoardDetailDto;
  card: CardDetailDto;
}

/** Everything inside the card dialog below its top bar once the card has loaded. */
export function CardDetailContent({ board, card }: CardDetailContentProps) {
  const boardId = board.board.id;
  const announcement = useCardDetailStore((state) => state.announcement);
  // The board knows better than the cached card where it is (moved, archived) right now.
  const archived = !board.cards.some((item) => item.id === card.id);
  useFocusArchiveAfterRestore(archived);

  return (
    <div className="flex flex-col gap-4">
      {card.coverColor !== null && (
        <div
          aria-hidden="true"
          data-testid="card-cover"
          className={`h-8 rounded-md ${LABEL_COLOR_CLASS[card.coverColor]}`}
        />
      )}
      <div className="flex flex-col gap-4 empty:hidden">
        <CardDetailAlert cardId={card.id} />
        {archived && <ArchivedCardBanner boardId={boardId} cardId={card.id} />}
      </div>
      <div className="flex items-start gap-2">
        <CardCompleteToggle boardId={boardId} card={card} />
        <div className="min-w-0 flex-1">
          <CardTitleEditor boardId={boardId} cardId={card.id} title={card.title} />
        </div>
      </div>
      {!archived && (
        <fieldset
          aria-label="Kart işlemleri"
          className="m-0 flex min-w-0 flex-row flex-wrap gap-2 border-0 p-0"
        >
          <PanelButton panel="members" icon={<MembersIcon />}>
            Üyeler
          </PanelButton>
          <PanelButton panel="labels" icon={<LabelIcon />}>
            Etiketler
          </PanelButton>
          <PanelButton panel="cover" icon={<CoverIcon />}>
            Kapak
          </PanelButton>
          <PanelButton panel="due-date" icon={<ClockIcon />}>
            Son tarih
          </PanelButton>
          <PanelButton panel="checklist" icon={<ChecklistIcon />}>
            Checklist
          </PanelButton>
        </fieldset>
      )}
      <div className="flex min-w-0 flex-col gap-6">
        <CardMembersSection board={board} card={card} />
        <CardCoverSection boardId={boardId} card={card} />
        <CardLabelsSection board={board} card={card} />
        <DueDateSection boardId={boardId} card={card} />
        <CardDescription boardId={boardId} cardId={card.id} description={card.description} />
        <ChecklistsSection boardId={boardId} card={card} />
      </div>
      <div role="status" className="sr-only">
        {announcement}
      </div>
    </div>
  );
}
