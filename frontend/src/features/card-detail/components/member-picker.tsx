import type { MemberDto } from '@trello/contracts';
import { Avatar } from '../../../shared/ui/avatar';

interface MemberPickerProps {
  members: MemberDto[];
  isAssigned: (userId: string) => boolean;
  onToggle: (userId: string, assigned: boolean) => void;
}

// Module-level and on the fieldset, so React calls it once when the panel opens: a member who
// joins or leaves later (realtime) does not move the focus.
function focusFirstMember(fieldset: HTMLFieldSetElement | null) {
  fieldset?.querySelector('input')?.focus();
}

/** One checkbox per board member; ticking it puts the member on the card. */
export function MemberPicker({ members, isAssigned, onToggle }: MemberPickerProps) {
  return (
    <fieldset ref={focusFirstMember} className="flex flex-col gap-1">
      <legend className="sr-only">Pano üyeleri</legend>
      {members.map((member) => (
        <label
          key={member.userId}
          className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1 pointer-coarse:min-h-11 hover:bg-surface-hover"
        >
          <input
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
