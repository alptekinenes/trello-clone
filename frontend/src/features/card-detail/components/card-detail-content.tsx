import type { BoardDetailDto, CardDetailDto } from '@trello/contracts';
import { Button } from '../../../shared/ui/button';
import { ArchiveIcon, ChecklistIcon, ClockIcon, LabelIcon } from '../../../shared/ui/icons';
import { useArchiveOpenCard } from '../hooks/use-archive-open-card';
import { useFocusArchiveAfterRestore } from '../hooks/use-focus-archive-after-restore';
import { ARCHIVE_BUTTON_ID } from '../lib/focus-ids';
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

/** Everything inside the card dialog once the card has loaded. */
export function CardDetailContent({ board, card }: CardDetailContentProps) {
  const boardId = board.board.id;
  // The board knows better than the cached card where it is (moved, archived) right now.
  const tile = board.cards.find((item) => item.id === card.id);
  const archiveCard = useArchiveOpenCard(boardId, tile);
  const announcement = useCardDetailStore((state) => state.announcement);
  const listId = tile?.listId ?? card.listId;
  const listTitle = board.lists.find((list) => list.id === listId)?.title ?? null;
  const archived = tile === undefined;
  useFocusArchiveAfterRestore(archived);

  return (
    <div className="flex flex-col gap-4">
      {/* pr-10 keeps the alert and banner buttons clear of the dialog's close button. */}
      <div className="flex flex-col gap-4 pr-10 empty:hidden">
        <CardDetailAlert cardId={card.id} />
        {archived && <ArchivedCardBanner boardId={boardId} cardId={card.id} />}
      </div>
      <CardTitleEditor boardId={boardId} cardId={card.id} title={card.title} listTitle={listTitle} />
      <div className="flex flex-col gap-6 sm:flex-row">
        <div className="flex min-w-0 flex-1 flex-col gap-6">
          <CardLabelsSection board={board} card={card} />
          <DueDateSection boardId={boardId} card={card} />
          <CardDescription boardId={boardId} cardId={card.id} description={card.description} />
          <ChecklistsSection boardId={boardId} card={card} />
        </div>
        {!archived && (
          <aside
            aria-label="Kart işlemleri"
            className="flex shrink-0 flex-row flex-wrap gap-2 sm:w-44 sm:flex-col"
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
            <Button
              id={ARCHIVE_BUTTON_ID}
              variant="secondary"
              className="justify-start"
              onClick={archiveCard}
            >
              <ArchiveIcon />
              Arşivle
            </Button>
          </aside>
        )}
      </div>
      <div role="status" className="sr-only">
        {announcement}
      </div>
    </div>
  );
}
