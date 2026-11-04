import type { BoardSummaryDto } from '@trello/contracts';
import { Link, useNavigate } from 'react-router';
import { apiErrorMessage } from '../../../shared/lib/api-error-message';
import { Menu, MenuGroup, MenuItem, MenuRadioItem, MenuSeparator } from '../../../shared/ui/menu';
import { useBoards } from '../api/use-boards';

const BAR_BUTTON =
  'flex min-h-9 min-w-11 items-center justify-center rounded-full px-4 text-sm font-medium text-fg pointer-coarse:min-h-11 hover:bg-surface-hover focus-visible:bg-surface-hover';

const NOTE = 'px-3 py-2 text-sm text-fg-muted';

interface BoardChoicesProps {
  boards: BoardSummaryDto[] | undefined;
  error: unknown;
  currentBoardId: string;
  onRetry: () => void;
}

function BoardChoices({ boards, error, currentBoardId, onRetry }: BoardChoicesProps) {
  const navigate = useNavigate();

  if (!boards && error) {
    return (
      <>
        <p className={NOTE}>{apiErrorMessage(error)}</p>
        <MenuItem onSelect={onRetry}>Tekrar dene</MenuItem>
      </>
    );
  }
  if (!boards) return <p className={NOTE}>Panolar yükleniyor…</p>;
  if (boards.length === 0) return <p className={NOTE}>Henüz bir panon yok.</p>;

  return (
    <MenuGroup label="Panolarım">
      {boards.map((board) => (
        <MenuRadioItem
          key={board.id}
          checked={board.id === currentBoardId}
          onSelect={() => {
            if (board.id !== currentBoardId) void navigate(`/boards/${board.id}`);
          }}
        >
          <span className="min-w-0 truncate">{board.title}</span>
        </MenuRadioItem>
      ))}
    </MenuGroup>
  );
}

/** Floating bar under the board: the current board and a menu to jump to another one. */
export function BoardSwitcher({ currentBoardId }: { currentBoardId: string }) {
  const navigate = useNavigate();
  const { data: boards, error, refetch } = useBoards();

  return (
    <nav aria-label="Pano gezintisi" className="flex shrink-0 justify-center px-4 pb-4">
      <div className="flex items-center gap-1 rounded-full bg-menu p-1 shadow-raised">
        <Link
          to={`/boards/${currentBoardId}`}
          aria-current="page"
          className={`${BAR_BUTTON} bg-surface-hover font-semibold`}
        >
          Pano
        </Link>
        <Menu
          label="Pano değiştir"
          trigger="Pano değiştir"
          triggerClassName={BAR_BUTTON}
          triggerNamedByContent
          side="top"
          align="end"
          panelClassName="w-60 max-h-72 overflow-y-auto"
        >
          <BoardChoices
            boards={boards}
            error={error}
            currentBoardId={currentBoardId}
            onRetry={() => void refetch()}
          />
          <MenuSeparator />
          <MenuItem onSelect={() => void navigate('/boards')}>Tüm panolar</MenuItem>
        </Menu>
      </div>
    </nav>
  );
}
