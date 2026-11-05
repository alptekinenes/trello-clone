import type { ActivityDto } from '@trello/contracts';
import { Avatar } from '../../../shared/ui/avatar';
import { describeActivity } from '../lib/describe-activity';
import { feedItemDomId } from '../lib/focus-ids';
import { FeedTime } from './feed-time';

/** One entry of the card's history: who did what, and when. */
export function ActivityItem({ activity }: { activity: ActivityDto }) {
  return (
    <li id={feedItemDomId(activity.id)} tabIndex={-1} className="flex gap-2 text-sm">
      <Avatar person={activity.actor} size="sm" decorative />
      <div className="min-w-0 flex-1">
        <p className="break-words">
          <span className="font-semibold">{activity.actor.name}</span> {describeActivity(activity)}
        </p>
        <p className="text-xs text-fg-muted">
          <FeedTime iso={activity.createdAt} />
        </p>
      </div>
    </li>
  );
}
