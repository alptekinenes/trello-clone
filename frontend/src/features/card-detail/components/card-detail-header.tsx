import type { BoardDetailDto, CardDetailDto } from '@trello/contracts';
import { Button } from '../../../shared/ui/button';
import { buttonClassName } from '../../../shared/ui/button-styles';
import { ArchiveIcon, CheckIcon, ChevronDownIcon, EyeIcon, MoreIcon } from '../../../shared/ui/icons';
import { Menu, MenuItem, MenuRadioItem } from '../../../shared/ui/menu';
import { useCardWatch } from '../hooks/use-card-watch';
import { useArchiveOpenCard } from '../hooks/use-archive-open-card';
import { useMoveOpenCard } from '../hooks/use-move-open-card';
import { CARD_MENU_BUTTON_ID } from '../lib/focus-ids';

interface CardDetailHeaderProps {
  board: BoardDetailDto;
  card: CardDetailDto;
}

/** Pressed (watching) is filled with the accent, so it differs from the idle button by more than a check. */
const WATCH_BUTTON_CLASS =
  'h-8 px-3 aria-pressed:bg-primary aria-pressed:text-on-primary aria-pressed:hover:bg-primary-hover';

const LIST_BUTTON_CLASS = buttonClassName('secondary', 'h-8 min-w-0 max-w-full px-3');

/**
 * Top bar of the card dialog: the list the card is in (a picker that moves the card to the
 * end of the chosen list) and the card menu. An archived card is in no list to move out of and
 * is restored from its banner, so it gets the list name only.
 */
export function CardDetailHeader({ board, card }: CardDetailHeaderProps) {
  const tile = board.cards.find((item) => item.id === card.id);
  const archiveCard = useArchiveOpenCard(board.board.id, tile);
  const moveToList = useMoveOpenCard(board, card.id);
  const { watching, toggleWatch } = useCardWatch(board, card.id);
  // The board knows better than the cached card where it is (moved, archived) right now.
  const listId = tile?.listId ?? card.listId;
  const listTitle = board.lists.find((list) => list.id === listId)?.title;
  const listText = listTitle === undefined ? null : `Liste: ${listTitle}`;

  return (
    <div className="flex min-w-0 flex-1 items-center justify-between gap-2">
      {listText !== null && !tile && <p className="min-w-0 truncate text-sm text-fg-muted">{listText}</p>}
      {listText !== null && tile && (
        <Menu
          label="Kartı taşı"
          containerClassName="min-w-0"
          panelClassName="max-h-menu overflow-y-auto"
          triggerNamedByContent
          triggerClassName={LIST_BUTTON_CLASS}
          trigger={
            <>
              <span className="truncate">{listText}</span>
              <ChevronDownIcon />
            </>
          }
        >
          {board.lists.map((list) => (
            <MenuRadioItem
              key={list.id}
              checked={list.id === listId}
              onSelect={() => moveToList(card.id, list.id)}
            >
              {list.title}
            </MenuRadioItem>
          ))}
        </Menu>
      )}
      <div className="ml-auto flex shrink-0 items-center gap-2">
        <Button
          variant="secondary"
          className={WATCH_BUTTON_CLASS}
          aria-pressed={watching}
          onClick={toggleWatch}
        >
          <EyeIcon />
          Kartı izle
          {watching && <CheckIcon data-testid="watching-icon" />}
        </Button>
        {tile && (
          <Menu
            label="Kart menüsü"
            align="end"
            triggerId={CARD_MENU_BUTTON_ID}
            triggerClassName={buttonClassName('ghost', 'h-8 px-3')}
            trigger={<MoreIcon />}
          >
            <MenuItem onSelect={archiveCard}>
              <ArchiveIcon />
              Arşivle
            </MenuItem>
          </Menu>
        )}
      </div>
    </div>
  );
}
