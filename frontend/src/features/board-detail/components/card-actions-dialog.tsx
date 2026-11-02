import type { CardSummaryDto, ListDto } from '@trello/contracts';
import { useId } from 'react';
import { Button } from '../../../shared/ui/button';
import { Dialog } from '../../../shared/ui/dialog';
import { ArchiveIcon } from '../../../shared/ui/icons';
import { SelectField } from '../../../shared/ui/select-field';
import { useCardActions } from '../hooks/use-card-actions';

interface CardActionsDialogProps {
  boardId: string;
  card: CardSummaryDto;
  lists: ListDto[];
  cards: CardSummaryDto[];
}

export function CardActionsDialog({ boardId, card, lists, cards }: CardActionsDialogProps) {
  const actions = useCardActions(boardId, card, lists, cards);
  const moveHeadingId = useId();

  return (
    <Dialog title="Kart işlemleri" onClose={actions.close}>
      <p className="-mt-2 mb-4 text-sm break-words text-fg-muted">{card.title}</p>

      <form
        noValidate
        onSubmit={actions.onSubmit}
        aria-labelledby={moveHeadingId}
        className="flex flex-col gap-3"
      >
        <h3 id={moveHeadingId} className="text-sm font-semibold">
          Kartı taşı
        </h3>
        <div className="flex gap-3">
          <SelectField
            label="Liste"
            className="min-w-0 flex-1"
            value={actions.listId}
            onChange={(event) => actions.selectList(event.target.value)}
          >
            {actions.lists.map((list) => (
              <option key={list.id} value={list.id}>
                {list.title}
              </option>
            ))}
          </SelectField>
          <SelectField
            label="Sıra"
            className="w-28"
            value={actions.position}
            onChange={(event) => actions.selectPosition(Number(event.target.value))}
          >
            {actions.positions.map((place) => (
              <option key={place} value={place}>
                {actions.isCurrent(place) ? `${place} (şu an)` : place}
              </option>
            ))}
          </SelectField>
        </div>
        <Button type="submit" className="self-start">
          Taşı
        </Button>
      </form>

      <div className="mt-6 flex items-center justify-between border-t border-line pt-4">
        <Button variant="secondary" onClick={actions.archive}>
          <ArchiveIcon />
          Arşivle
        </Button>
        <Button variant="ghost" onClick={actions.close}>
          Kapat
        </Button>
      </div>
    </Dialog>
  );
}
