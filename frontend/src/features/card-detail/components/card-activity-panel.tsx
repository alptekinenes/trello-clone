import type { BoardDetailDto } from '@trello/contracts';
import { apiErrorMessage } from '../../../shared/lib/api-error-message';
import { Button } from '../../../shared/ui/button';
import { FormAlert } from '../../../shared/ui/form-alert';
import { useCardFeed } from '../api/use-card-feed';
import { useCommentViewer } from '../hooks/use-comment-viewer';
import { useCardDetailStore } from '../store/card-detail-store';
import { CommentComposer } from './comment-composer';
import { FeedList } from './feed-list';

interface CardActivityPanelProps {
  board: BoardDetailDto;
  cardId: string;
}

/** "Yorumlar ve etkinlik": the comment form and the card's feed. */
export function CardActivityPanel({ board, cardId }: CardActivityPanelProps) {
  const boardId = board.board.id;
  const viewer = useCommentViewer(board);
  const showDetails = useCardDetailStore((state) => state.showFeedDetails);
  const toggleDetails = useCardDetailStore((state) => state.toggleFeedDetails);
  const feed = useCardFeed(boardId, cardId, showDetails);

  return (
    <section aria-labelledby="card-activity-title" className="flex min-w-0 flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <h2 id="card-activity-title" className="text-base font-semibold">
          Yorumlar ve etkinlik
        </h2>
        <Button variant="ghost" className="h-8 px-3" onClick={toggleDetails}>
          {showDetails ? 'Ayrıntıları gizle' : 'Ayrıntıları göster'}
        </Button>
      </div>
      <CommentComposer boardId={boardId} cardId={cardId} />
      {feed.isPending && (
        <p role="status" className="text-sm text-fg-muted">
          Yorumlar yükleniyor…
        </p>
      )}
      {feed.isError && !feed.data && (
        <div className="flex flex-col items-start gap-2">
          <FormAlert>{apiErrorMessage(feed.error)}</FormAlert>
          <Button variant="secondary" className="h-8 px-3" onClick={() => void feed.refetch()}>
            Tekrar dene
          </Button>
        </div>
      )}
      {feed.data && (
        <FeedList
          boardId={boardId}
          cardId={cardId}
          viewer={viewer}
          items={feed.items}
          hasNextPage={feed.hasNextPage}
          isFetchingNextPage={feed.isFetchingNextPage}
          fetchNextPage={feed.fetchNextPage}
        />
      )}
    </section>
  );
}
