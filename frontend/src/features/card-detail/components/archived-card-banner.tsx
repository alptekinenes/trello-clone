import { Button } from '../../../shared/ui/button';
import { useRestoreOpenCard } from '../api/use-card-mutations';

/** Shown on a card that sits in the archive; it can only be restored from here. */
export function ArchivedCardBanner({ boardId, cardId }: { boardId: string; cardId: string }) {
  const { restore, isRestoring } = useRestoreOpenCard(boardId, cardId);

  return (
    <div
      role="status"
      className="flex items-center gap-3 rounded-md bg-surface-sunken px-3 py-2 text-sm"
    >
      <p className="flex-1 text-fg-muted">Bu kart arşivde.</p>
      <Button variant="secondary" className="h-8 px-3" onClick={restore} loading={isRestoring}>
        Geri yükle
      </Button>
    </div>
  );
}
