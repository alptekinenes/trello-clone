import { useState } from 'react';
import {
  THEME_LABELS,
  useThemePreference,
} from '../../../shared/hooks/use-theme-preference';
import { THEME_PREFERENCES } from '../../../shared/lib/theme';
import { Avatar } from '../../../shared/ui/avatar';
import { Menu, MenuGroup, MenuItem, MenuRadioItem, MenuSeparator } from '../../../shared/ui/menu';
import { useLogout } from '../api/use-auth-mutations';
import { useCurrentUser } from '../store/auth-store';
import { ProfileDialog } from './profile-dialog';
import { ShortcutsDialog } from './shortcuts-dialog';

type OpenDialog = 'profile' | 'shortcuts' | null;

/** Avatar button that opens the account menu: profile, theme, shortcuts, sign out. */
export function AccountMenu() {
  const user = useCurrentUser();
  const logout = useLogout();
  const { preference, setPreference } = useThemePreference();
  const [dialog, setDialog] = useState<OpenDialog>(null);

  if (!user) return null;

  return (
    <>
      <Menu
        label="Hesap menüsü"
        align="end"
        description={
          <div className="px-3 py-2">
            <p className="text-sm font-medium break-words text-fg">{user.name}</p>
            <p className="text-xs break-all text-fg-muted">{user.email}</p>
          </div>
        }
        triggerClassName="inline-flex size-8 items-center justify-center rounded-full pointer-coarse:size-11"
        triggerNamedByContent
        trigger={
          <>
            <Avatar person={user} decorative />
            <span className="sr-only">Hesap menüsü</span>
          </>
        }
      >
        <MenuSeparator />
        <MenuItem onSelect={() => setDialog('profile')}>Profil</MenuItem>
        <MenuGroup label="Tema">
          {THEME_PREFERENCES.map((option) => (
            <MenuRadioItem
              key={option}
              checked={preference === option}
              onSelect={() => setPreference(option)}
            >
              {THEME_LABELS[option]}
            </MenuRadioItem>
          ))}
        </MenuGroup>
        <MenuItem onSelect={() => setDialog('shortcuts')}>Klavye kısayolları</MenuItem>
        <MenuSeparator />
        <MenuItem onSelect={() => logout.mutate()}>Çıkış yap</MenuItem>
      </Menu>
      {dialog === 'profile' && <ProfileDialog user={user} onClose={() => setDialog(null)} />}
      {dialog === 'shortcuts' && <ShortcutsDialog onClose={() => setDialog(null)} />}
    </>
  );
}
