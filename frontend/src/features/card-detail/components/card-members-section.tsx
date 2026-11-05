import type { BoardDetailDto, CardDetailDto } from '@trello/contracts';
import type { KeyboardEvent } from 'react';
import { Avatar } from '../../../shared/ui/avatar';
import { Button } from '../../../shared/ui/button';
import { MembersIcon } from '../../../shared/ui/icons';
import { useCardMembers } from '../hooks/use-card-members';
import { panelId } from '../hooks/use-card-panel';
import { MemberPicker } from './member-picker';

interface CardMembersSectionProps {
  board: BoardDetailDto;
  card: CardDetailDto;
}

/** The card's members, and the section that opens to pick them from the board's members. */
export function CardMembersSection({ board, card }: CardMembersSectionProps) {
  const { panel, cardMembers, boardMembers, isAssigned, toggle } = useCardMembers(board, card);
  if (cardMembers.length === 0 && !panel.isOpen) return null;

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') {
      // Keep Escape from also closing the dialog.
      event.preventDefault();
      event.stopPropagation();
      panel.close();
    }
  }

  return (
    <section aria-labelledby="card-members-title" className="flex flex-col gap-2">
      <h3 id="card-members-title" className="flex items-center gap-2 text-base font-semibold">
        <MembersIcon />
        Üyeler
      </h3>
      {cardMembers.length > 0 && (
        <ul aria-label="Kartın üyeleri" className="flex flex-wrap gap-2">
          {cardMembers.map((member) => (
            <li key={member.userId} className="flex min-w-0 items-center gap-2">
              <Avatar
                decorative
                person={{ id: member.userId, name: member.name, avatarUrl: member.avatarUrl }}
              />
              <span className="min-w-0 truncate text-sm">{member.name}</span>
            </li>
          ))}
        </ul>
      )}
      {panel.isOpen && (
        <div
          id={panelId('members')}
          onKeyDown={onKeyDown}
          className="flex flex-col gap-3 rounded-md bg-surface-sunken p-3"
        >
          <MemberPicker members={boardMembers} isAssigned={isAssigned} onToggle={toggle} />
          <div>
            <Button variant="ghost" className="h-8 px-3" onClick={panel.close}>
              Tamam
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
