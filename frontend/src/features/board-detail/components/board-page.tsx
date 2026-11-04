import { Link, Outlet, useParams } from 'react-router';
import { apiErrorMessage, isNotFound } from '../../../shared/lib/api-error-message';
import { BOARD_BACKGROUND_CLASS } from '../../../shared/lib/board-background';
import { Button } from '../../../shared/ui/button';
import { FormAlert } from '../../../shared/ui/form-alert';
import { PageLoader } from '../../../shared/ui/page-loader';
import { useBoard } from '../api/use-board';
import { useBoardRealtime } from '../hooks/use-board-realtime';
import { BoardCanvas } from './board-canvas';
import { BoardHeader } from './board-header';

function BoardNotFound() {
  return (
    <section aria-labelledby="board-missing-title" className="mx-auto w-full max-w-2xl px-4 py-12">
      <h1 id="board-missing-title" className="text-2xl font-semibold">
        Pano bulunamadı
      </h1>
      <p className="mt-2 text-fg-muted">
        Bu pano silinmiş olabilir ya da görüntüleme iznin yok.
      </p>
      <Link to="/boards" className="mt-6 inline-block font-medium text-primary hover:text-primary-hover">
        Panolarına dön
      </Link>
    </section>
  );
}

export function BoardPage() {
  const { boardId = '' } = useParams();
  const { data: detail, error, isPending, refetch, isRefetching } = useBoard(boardId);
  useBoardRealtime(boardId);

  if (isPending) return <PageLoader label="Pano yükleniyor…" />;
  if (isNotFound(error)) return <BoardNotFound />;
  // A failed refresh keeps showing the board (and a card dialog open on it).
  if (error && !detail) {
    return (
      <div className="mx-auto flex w-full max-w-2xl flex-col items-start gap-3 px-4 py-12">
        <FormAlert>{apiErrorMessage(error)}</FormAlert>
        <Button variant="secondary" onClick={() => void refetch()} loading={isRefetching}>
          Tekrar dene
        </Button>
      </div>
    );
  }

  return (
    <div className={`flex min-h-0 flex-1 flex-col ${BOARD_BACKGROUND_CLASS[detail.board.background]}`}>
      <BoardHeader detail={detail} />
      {error && (
        <div className="flex items-center gap-3 bg-danger-subtle px-4 py-2 text-sm text-danger">
          <p role="alert" className="flex-1">
            Pano yenilenemedi.
          </p>
          <Button variant="secondary" className="h-8 px-3" onClick={() => void refetch()} loading={isRefetching}>
            Tekrar dene
          </Button>
        </div>
      )}
      <BoardCanvas detail={detail} />
      <Outlet />
    </div>
  );
}
