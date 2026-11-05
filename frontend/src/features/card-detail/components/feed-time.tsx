import { formatDueLong, formatRelativeTime } from '../../../shared/lib/date';

/** When a feed item happened: relative, with the full date as the tooltip. Recomputed on every render. */
export function FeedTime({ iso }: { iso: string }) {
  return (
    <time dateTime={iso} title={formatDueLong(iso)}>
      {formatRelativeTime(iso)}
    </time>
  );
}
