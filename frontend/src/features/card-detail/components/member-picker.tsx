import type { MemberDto } from '@trello/contracts';
import { Avatar } from '../../../shared/ui/avatar';

interface MemberPickerProps {
  members: MemberDto[];
  isAssigned: (userId: string) => boolean;
  onToggle: (userId: string, assigned: boolean) => void;
}

// Module-level so React calls it once on mount, not on every render.
function focus(input: HTMLInputElement | null) {
  input?.focus();
}

/** One checkbox per board member; ticking it puts the member on the card. */
export function MemberPicker({ members, isAssigned, onToggle }: MemberPickerProps) {
  return (
    <fieldset className="flex flex-col gap-1">
      <legend className="sr-only">Pano üyeleri</legend>
      {members.map((member, index) => (
        <label
          key={member.userId}
          className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1 pointer-coarse:min-h-11 hover:bg-surface-hover"
        >
          <input
            ref={index === 0 ? focus : undefined}
            type="checkbox"
            checked={isAssigned(member.userId)}
            onChange={(event) => onToggle(member.userId, event.target.checked)}
            className="size-4 accent-primary"
          />
          <Avatar
            decorative
            person={{ id: member.userId, name: member.name, avatarUrl: member.avatarUrl }}
          />
          <span className="min-w-0 flex-1 truncate text-sm">{member.name}</span>
        </label>
      ))}
    </fieldset>
  );
}
