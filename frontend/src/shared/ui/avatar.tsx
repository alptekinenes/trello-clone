import { initialsOf } from '../lib/initials';

interface AvatarPerson {
  name: string;
  avatarUrl: string | null;
}

const SIZE = 'size-8 rounded-full text-xs';

/** `decorative`: the name is written next to the avatar, so it is hidden from screen readers. */
export function Avatar({
  person,
  className = '',
  decorative = false,
}: {
  person: AvatarPerson;
  className?: string;
  decorative?: boolean;
}) {
  if (decorative) {
    return (
      <span
        aria-hidden="true"
        className={`${SIZE} inline-flex shrink-0 items-center justify-center overflow-hidden bg-surface-sunken font-semibold text-fg ${className}`}
      >
        {person.avatarUrl ? (
          <img src={person.avatarUrl} alt="" className="size-full object-cover" />
        ) : (
          initialsOf(person.name)
        )}
      </span>
    );
  }
  if (person.avatarUrl) {
    return (
      <img
        src={person.avatarUrl}
        alt={person.name}
        title={person.name}
        className={`${SIZE} object-cover ${className}`}
      />
    );
  }
  return (
    <span
      title={person.name}
      className={`${SIZE} inline-flex items-center justify-center bg-surface-sunken font-semibold text-fg ${className}`}
    >
      <span aria-hidden="true">{initialsOf(person.name)}</span>
      <span className="sr-only">{person.name}</span>
    </span>
  );
}

/** Overlapping avatars; the rest is shown as "+N". */
export function AvatarStack({
  people,
  max = 5,
  label,
}: {
  people: (AvatarPerson & { id: string })[];
  max?: number;
  /** Accessible name of the group, e.g. "Pano üyeleri". */
  label: string;
}) {
  const shown = people.slice(0, max);
  const hidden = people.length - shown.length;

  return (
    <ul aria-label={label} className="flex -space-x-2">
      {shown.map((person) => (
        <li key={person.id}>
          <Avatar person={person} className="ring-2 ring-surface" />
        </li>
      ))}
      {hidden > 0 && (
        <li
          aria-label={`${hidden} üye daha`}
          className={`${SIZE} inline-flex items-center justify-center bg-surface-sunken font-semibold text-fg-muted ring-2 ring-surface`}
        >
          +{hidden}
        </li>
      )}
    </ul>
  );
}
