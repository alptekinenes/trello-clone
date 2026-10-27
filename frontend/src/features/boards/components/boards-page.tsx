import { useState } from 'react';
import { apiErrorMessage } from '../../../shared/lib/api-error-message';
import { Button } from '../../../shared/ui/button';
import { FormAlert } from '../../../shared/ui/form-alert';
import { PageLoader } from '../../../shared/ui/page-loader';
import { useBoards } from '../api/use-boards';
import { BoardTile } from './board-tile';
import { CreateBoardDialog } from './create-board-dialog';

const TILE = 'flex h-24 items-center justify-center rounded-md text-sm font-medium';

function BoardsContent({ onCreate }: { onCreate: () => void }) {
  const { data: boards, error, isPending, refetch, isRefetching } = useBoards();

  if (isPending) return <PageLoader label="Panolar yükleniyor…" />;
  if (error) {
    return (
      <div className="flex flex-col items-start gap-3">
        <FormAlert>{apiErrorMessage(error)}</FormAlert>
        <Button variant="secondary" onClick={() => void refetch()} loading={isRefetching}>
          Tekrar dene
        </Button>
      </div>
    );
  }

  return (
    <>
      {boards.length === 0 && (
        <p className="mb-4 text-fg-muted">Henüz bir panon yok. İlk panonu oluşturarak başla.</p>
      )}
      <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {boards.map((board) => (
          <li key={board.id}>
            <BoardTile board={board} />
          </li>
        ))}
        <li>
          <button
            type="button"
            onClick={onCreate}
            className={`${TILE} w-full bg-surface-sunken text-fg-muted transition-colors hover:bg-surface-hover hover:text-fg`}
          >
            Yeni pano oluştur
          </button>
        </li>
      </ul>
    </>
  );
}

export function BoardsPage() {
  const [creating, setCreating] = useState(false);

  return (
    <section aria-labelledby="boards-title" className="mx-auto w-full max-w-5xl px-4 py-8">
      <h1 id="boards-title" className="mb-6 text-2xl font-semibold">
        Panolarım
      </h1>
      <BoardsContent onCreate={() => setCreating(true)} />
      {creating && <CreateBoardDialog onClose={() => setCreating(false)} />}
    </section>
  );
}
