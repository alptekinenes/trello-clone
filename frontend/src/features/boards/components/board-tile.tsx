import type { BoardSummaryDto } from '@trello/contracts';
import { Link } from 'react-router';
import { BOARD_BACKGROUND_CLASS } from '../../../shared/lib/board-background';

export function BoardTile({ board }: { board: BoardSummaryDto }) {
  return (
    <Link
      to={`/boards/${board.id}`}
      className={`flex h-24 items-start rounded-md p-3 font-semibold text-on-board shadow-card transition-shadow hover:shadow-raised ${BOARD_BACKGROUND_CLASS[board.background]}`}
    >
      <span className="line-clamp-2 break-words">{board.title}</span>
    </Link>
  );
}
