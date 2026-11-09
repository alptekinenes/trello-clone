import type { CardDetailDto } from '@trello/contracts';
import type { KeyboardEvent } from 'react';
import { Button } from '../../../shared/ui/button';
import { CoverIcon } from '../../../shared/ui/icons';
import { useCardCover } from '../hooks/use-card-cover';
import { panelId } from '../hooks/use-card-panel';
import { CoverPicker } from './cover-picker';

interface CardCoverSectionProps {
  boardId: string;
  card: CardDetailDto;
}

/** The section that opens to pick the card's cover (a color, or none); the cover itself shows on top. */
export function CardCoverSection({ boardId, card }: CardCoverSectionProps) {
  const { panel, coverColor, hasImageCover, select } = useCardCover(boardId, card);
  if (!panel.isOpen) return null;

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') {
      // Keep Escape from also closing the dialog.
      event.preventDefault();
      event.stopPropagation();
      panel.close();
    }
  }

  return (
    <section aria-labelledby="card-cover-title" className="flex flex-col gap-2">
      <h3 id="card-cover-title" className="flex items-center gap-2 text-base font-semibold">
        <CoverIcon />
        Kapak
      </h3>
      <div
        id={panelId('cover')}
        onKeyDown={onKeyDown}
        className="flex flex-col gap-3 rounded-md bg-surface-sunken p-3"
      >
        <CoverPicker value={coverColor} hasImageCover={hasImageCover} onChange={select} />
        <div>
          <Button variant="ghost" className="h-8 px-3" onClick={panel.close}>
            Tamam
          </Button>
        </div>
      </div>
    </section>
  );
}
