import type { BoardDetailDto, CardDetailDto } from '@trello/contracts';
import { Button } from '../../../shared/ui/button';
import { ArchiveIcon, ClockIcon, LabelIcon } from '../../../shared/ui/icons';
import { useArchiveOpenCard } from '../hooks/use-archive-open-card';
import { useCardDetailStore } from '../store/card-detail-store';
import { ArchivedCardBanner } from './archived-card-banner';
import { CardDescription } from './card-description';
import { CardDetailAlert } from './card-detail-alert';
import { CardLabelsSection } from './card-labels-section';
import { CardTitleEditor } from './card-title-editor';
import { DueDateSection } from './due-date-section';
import { PanelButton } from './panel-button';

interface CardDetailContentProps {
  board: BoardDetailDto;
  card: CardDetailDto;
}

/** Everything inside the card dialog once the card has loaded. */
export function CardDetailContent({ board, card }: CardDetailContentProps) {
  const boardId = board.board.id;
  const archiveCard = useArchiveOpenCard(boardId, card);
  const announcement = useCardDetailStore((state) => state.announcement);
  const listTitle = board.lists.find((list) => list.id === card.listId)?.title ?? null;
  const archived = card.archivedAt !== null;

  return (
    <div className="flex flex-col gap-4">
      <CardDetailAlert />
      {archived && <ArchivedCardBanner boardId={boardId} cardId={card.id} />}
      <CardTitleEditor boardId={boardId} cardId={card.id} title={card.title} listTitle={listTitle} />
      <div className="flex flex-col gap-6 sm:flex-row">
        <div className="flex min-w-0 flex-1 flex-col gap-6">
          <CardLabelsSection board={board} card={card} />
          <DueDateSection boardId={boardId} card={card} />
          <CardDescription boardId={boardId} cardId={card.id} description={card.description} />
        </div>
        {!archived && (
          <aside aria-label="Kart işlemleri" className="flex shrink-0 flex-col gap-2 sm:w-44">
            <PanelButton panel="labels" icon={<LabelIcon />}>
              Etiketler
            </PanelButton>
            <PanelButton panel="due-date" icon={<ClockIcon />}>
              Son tarih
            </PanelButton>
            <Button variant="secondary" className="justify-start" onClick={archiveCard}>
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
