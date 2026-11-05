import type { FeedItemDto } from '@trello/contracts';
import { Button } from '../../../shared/ui/button';
import { useFeedLoadMore } from '../hooks/use-feed-load-more';
import { ActivityItem } from './activity-item';
import { CommentItem } from './comment-item';

interface FeedListProps {
  items: FeedItemDto[];
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  fetchNextPage: () => Promise<unknown>;
}

/** Comments (and activity) of the card, newest first, with a button for the next page. */
export function FeedList({ items, hasNextPage, isFetchingNextPage, fetchNextPage }: FeedListProps) {
  const loadMore = useFeedLoadMore(items, fetchNextPage);

  if (items.length === 0) return <p className="text-sm text-fg-muted">Henüz yorum yok.</p>;

  return (
    <>
      <ol aria-label="Yorumlar ve etkinlik" className="m-0 flex list-none flex-col gap-4 p-0">
        {items.map((item) =>
          item.kind === 'comment' ? (
            <CommentItem key={item.id} comment={item} />
          ) : (
            <ActivityItem key={item.id} activity={item} />
          ),
        )}
      </ol>
      {hasNextPage && (
        <Button
          variant="secondary"
          className="h-8 self-start px-3"
          onClick={loadMore}
          loading={isFetchingNextPage}
        >
          Daha fazla göster
        </Button>
      )}
    </>
  );
}
