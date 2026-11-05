import type { FeedItemDto, MemberRef } from '@trello/contracts';
import { apiErrorMessage } from '../../../shared/lib/api-error-message';
import { Button } from '../../../shared/ui/button';
import { FormAlert } from '../../../shared/ui/form-alert';
import { useFeedLoadMore } from '../hooks/use-feed-load-more';
import { ActivityItem } from './activity-item';
import { CommentItem } from './comment-item';

interface FeedListProps {
  boardId: string;
  cardId: string;
  viewer: MemberRef | null;
  items: FeedItemDto[];
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  /** Why the last request for the next page failed, if it did. */
  nextPageError: Error | null;
  fetchNextPage: () => Promise<{ isError: boolean }>;
}

/** Comments (and activity) of the card, newest first, with a button for the next page. */
export function FeedList({
  boardId,
  cardId,
  viewer,
  items,
  hasNextPage,
  isFetchingNextPage,
  nextPageError,
  fetchNextPage,
}: FeedListProps) {
  const loadMore = useFeedLoadMore(items, fetchNextPage);

  if (items.length === 0) return <p className="text-sm text-fg-muted">Henüz yorum yok.</p>;

  return (
    <>
      <ol aria-label="Yorumlar ve etkinlik" className="m-0 flex list-none flex-col gap-4 p-0">
        {items.map((item) =>
          item.kind === 'comment' ? (
            <CommentItem
              key={item.id}
              boardId={boardId}
              cardId={cardId}
              comment={item}
              viewer={viewer}
            />
          ) : (
            <ActivityItem key={item.id} activity={item} />
          ),
        )}
      </ol>
      {nextPageError && <FormAlert>{apiErrorMessage(nextPageError)}</FormAlert>}
      {hasNextPage && (
        // aria-disabled, not disabled: a disabled button drops the focus the click gave it.
        <Button
          variant="secondary"
          className="h-8 self-start px-3 aria-disabled:cursor-not-allowed aria-disabled:opacity-60"
          onClick={() => {
            if (!isFetchingNextPage) loadMore();
          }}
          aria-disabled={isFetchingNextPage || undefined}
          aria-busy={isFetchingNextPage || undefined}
        >
          {nextPageError ? 'Tekrar dene' : 'Daha fazla göster'}
        </Button>
      )}
    </>
  );
}
