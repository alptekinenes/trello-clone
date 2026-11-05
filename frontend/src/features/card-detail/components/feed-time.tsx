import { formatDueLong, formatRelativeTime } from '../../../shared/lib/date';

/**
 * When a feed item happened: relative, with the full date as the tooltip and, for touch and
 * screen reader users who have no tooltip, as visually hidden text. Recomputed on every render.
 */
export function FeedTime({ iso }: { iso: string }) {
  const full = formatDueLong(iso);
  return (
    <time dateTime={iso} title={full}>
      {formatRelativeTime(iso)}
      <span className="sr-only">, {full}</span>
    </time>
  );
}
