import type { CommentDto } from '@trello/contracts';
import { Avatar } from '../../../shared/ui/avatar';
import { feedItemDomId } from '../lib/focus-ids';
import { isPendingComment } from '../lib/feed-cache';
import { FeedTime } from './feed-time';

interface CommentItemProps {
  comment: CommentDto;
}

/** A comment: author, time and the text, which is plain text and never read as HTML. */
export function CommentItem({ comment }: CommentItemProps) {
  const pending = isPendingComment(comment.id);

  return (
    <li
      id={feedItemDomId(comment.id)}
      tabIndex={-1}
      aria-busy={pending || undefined}
      className={`flex gap-2 text-sm ${pending ? 'opacity-60' : ''}`}
    >
      <Avatar person={comment.author} size="sm" decorative />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="flex flex-wrap items-baseline gap-x-2 text-xs text-fg-muted">
          <span className="text-sm font-semibold text-fg">{comment.author.name}</span>
          {pending ? <span>Gönderiliyor…</span> : <FeedTime iso={comment.createdAt} />}
          {comment.editedAt !== null && <span>(düzenlendi)</span>}
        </p>
        <p className="break-words whitespace-pre-wrap">{comment.body}</p>
      </div>
    </li>
  );
}
