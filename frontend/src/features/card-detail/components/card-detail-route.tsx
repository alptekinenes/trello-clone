import { useEffect } from 'react';
import { Navigate, useParams } from 'react-router';
import { apiErrorMessage, isNotFound } from '../../../shared/lib/api-error-message';
import { Button } from '../../../shared/ui/button';
import { Dialog, useDialogClose } from '../../../shared/ui/dialog';
import { FormAlert } from '../../../shared/ui/form-alert';
import { useBoard } from '../../board-detail';
import { useCardDetail } from '../api/use-card-detail';
import { useCardDetailClose } from '../hooks/use-card-detail-close';
import { useCardDetailStore } from '../store/card-detail-store';
import { CardDetailContent } from './card-detail-content';

function MissingCard() {
  const close = useDialogClose();
  return (
    <div className="flex flex-col items-start gap-3">
      <p className="text-fg-muted">Kart bulunamadı. Silinmiş olabilir.</p>
      <Button variant="secondary" onClick={close}>
        Panoya dön
      </Button>
    </div>
  );
}

function LoadFailed({ error, retry }: { error: unknown; retry: () => void }) {
  return (
    <div className="flex flex-col items-start gap-3">
      <FormAlert>{apiErrorMessage(error)}</FormAlert>
      <Button variant="secondary" onClick={retry}>
        Tekrar dene
      </Button>
    </div>
  );
}

/** The card dialog as a route of the board page: /boards/:boardId/c/:cardId. */
export function CardDetailRoute() {
  const { boardId = '', cardId = '' } = useParams();
  const { data: board } = useBoard(boardId);
  const { data: card, error, refetch } = useCardDetail(boardId, cardId);
  const openDialogState = useCardDetailStore((state) => state.open);
  const resetDialogState = useCardDetailStore((state) => state.reset);
  const onClose = useCardDetailClose(boardId, cardId);

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
    if (card && board) return <CardDetailContent board={board} card={card} />;
    if (isNotFound(error)) return <MissingCard />;
    if (error) return <LoadFailed error={error} retry={() => void refetch()} />;
    return (
      <p role="status" className="text-fg-muted">
        Kart yükleniyor…
      </p>
    );
  }

  return (
    <Dialog title={title} hideTitle size="lg" showCloseButton onClose={onClose}>
      {content()}
    </Dialog>
  );
}
