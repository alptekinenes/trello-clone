import { useEffect } from 'react';
import { Navigate, useParams } from 'react-router';
import { apiErrorMessage, isNotFound } from '../../../shared/lib/api-error-message';
import { Button } from '../../../shared/ui/button';
import { Dialog, useDialogClose } from '../../../shared/ui/dialog';
import { FormAlert } from '../../../shared/ui/form-alert';
import { useBoard } from '../../board-detail';
import { useCardDetail } from '../api/use-card-detail';
import { useCardDetailClose } from '../hooks/use-card-detail-close';
import { useCardRealtime } from '../hooks/use-card-realtime';
import { useCardDetailStore } from '../store/card-detail-store';
import { CardDetailContent } from './card-detail-content';
import { CardDetailHeader } from './card-detail-header';

function MissingCard() {
  const close = useDialogClose();
  return (
    <div className="flex flex-col items-start gap-3">
      <p role="alert" className="text-fg-muted">
        Kart bulunamadı. Silinmiş olabilir.
      </p>
      <Button variant="secondary" onClick={close}>
        Panoya dön
      </Button>
    </div>
  );
}

function RemovedCard() {
  const close = useDialogClose();
  return (
    <div className="flex flex-col items-start gap-3">
      <p role="alert" className="text-fg">
        Bu kart başka biri tarafından silindi.
      </p>
      <Button variant="secondary" onClick={close}>
        Panoya dön
      </Button>
    </div>
  );
}

function LoadFailed({ error, retry, retrying }: { error: unknown; retry: () => void; retrying: boolean }) {
  return (
    <div className="flex flex-col items-start gap-3">
      <FormAlert>{apiErrorMessage(error)}</FormAlert>
      <Button variant="secondary" onClick={retry} loading={retrying}>
        Tekrar dene
      </Button>
    </div>
  );
}

/** The card dialog as a route of the board page: /boards/:boardId/c/:cardId. */
export function CardDetailRoute() {
  const { boardId = '', cardId = '' } = useParams();
  const { data: board } = useBoard(boardId);
  const { data: card, error, refetch, isRefetching } = useCardDetail(boardId, cardId);
  const openDialogState = useCardDetailStore((state) => state.open);
  const resetDialogState = useCardDetailStore((state) => state.reset);
  const removed = useCardDetailStore((state) => state.goneCardId === cardId);
  const onClose = useCardDetailClose(boardId, cardId);
  useCardRealtime(boardId, cardId);

  // Errors, announcements and open sections belong to this visit of this card's dialog.
  useEffect(() => {
    openDialogState(cardId);
    return resetDialogState;
  }, [cardId, openDialogState, resetDialogState]);

  if (card && card.boardId !== boardId) {
    return <Navigate replace to={`/boards/${card.boardId}/c/${card.id}`} />;
  }

  const tileTitle = board?.cards.find((item) => item.id === cardId)?.title;
  const title = card?.title ?? tileTitle ?? 'Kart';

  function content() {
    if (removed) return <RemovedCard />;
    if (card && board) return <CardDetailContent board={board} card={card} />;
    if (isNotFound(error)) return <MissingCard />;
    if (error) return <LoadFailed error={error} retry={() => void refetch()} retrying={isRefetching} />;
    return (
      <p role="status" className="text-fg-muted">
        Kart yükleniyor…
      </p>
    );
  }

  // While loading (or once removed) the bar still renders, empty, so the close button never moves.
  const header =
    !removed && card && board ? <CardDetailHeader board={board} card={card} /> : <div className="flex-1" />;

  return (
    <Dialog title={title} hideTitle size="xl" showCloseButton header={header} onClose={onClose}>
      {content()}
    </Dialog>
  );
}
