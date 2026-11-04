import type { BoardDetailDto, CardDetailDto } from '@trello/contracts';
import { ChecklistIcon, ClockIcon, LabelIcon } from '../../../shared/ui/icons';
import { useFocusArchiveAfterRestore } from '../hooks/use-focus-archive-after-restore';
import { useCardDetailStore } from '../store/card-detail-store';
import { ArchivedCardBanner } from './archived-card-banner';
import { CardDescription } from './card-description';
import { CardDetailAlert } from './card-detail-alert';
import { CardLabelsSection } from './card-labels-section';
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
      <div className="flex flex-col gap-4 empty:hidden">
        <CardDetailAlert cardId={card.id} />
        {archived && <ArchivedCardBanner boardId={boardId} cardId={card.id} />}
      </div>
      <CardTitleEditor boardId={boardId} cardId={card.id} title={card.title} />
      <div className="flex flex-col gap-6 sm:flex-row">
        <div className="flex min-w-0 flex-1 flex-col gap-6">
          <CardLabelsSection board={board} card={card} />
          <DueDateSection boardId={boardId} card={card} />
          <CardDescription boardId={boardId} cardId={card.id} description={card.description} />
          <ChecklistsSection boardId={boardId} card={card} />
        </div>
        {!archived && (
          <fieldset
            aria-label="Kart işlemleri"
            className="m-0 flex min-w-0 shrink-0 flex-row flex-wrap gap-2 border-0 p-0 sm:w-44 sm:flex-col"
          >
            <PanelButton panel="labels" icon={<LabelIcon />}>
              Etiketler
            </PanelButton>
            <PanelButton panel="checklist" icon={<ChecklistIcon />}>
              Checklist
            </PanelButton>
            <PanelButton panel="due-date" icon={<ClockIcon />}>
              Son tarih
            </PanelButton>
          </fieldset>
        )}
      </div>
      <div role="status" className="sr-only">
        {announcement}
      </div>
    </div>
  );
}
