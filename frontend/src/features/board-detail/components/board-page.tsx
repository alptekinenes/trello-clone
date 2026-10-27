import { Link, useParams } from 'react-router';
import { apiErrorMessage, isNotFound } from '../../../shared/lib/api-error-message';
import { BOARD_BACKGROUND_CLASS } from '../../../shared/lib/board-background';
import { Button } from '../../../shared/ui/button';
import { FormAlert } from '../../../shared/ui/form-alert';
import { PageLoader } from '../../../shared/ui/page-loader';
import { useBoard } from '../api/use-board';
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

  if (isPending) return <PageLoader label="Pano yükleniyor…" />;
  if (isNotFound(error)) return <BoardNotFound />;
  if (error) {
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
    <div className={`flex flex-1 flex-col ${BOARD_BACKGROUND_CLASS[detail.board.background]}`}>
      <BoardHeader detail={detail} />
      <BoardCanvas detail={detail} />
    </div>
  );
}
