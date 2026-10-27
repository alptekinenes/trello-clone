import { Button } from '../../../shared/ui/button';
import { useLogout } from '../api/use-auth-mutations';
import { useCurrentUser } from '../store/auth-store';

export function UserMenu() {
  const user = useCurrentUser();
  const logout = useLogout();

  if (!user) return null;

  return (
    <div className="flex items-center gap-3">
      <span className="text-sm text-fg-muted">{user.name}</span>
      <Button variant="ghost" loading={logout.isPending} onClick={() => logout.mutate()}>
        Çıkış yap
      </Button>
    </div>
  );
}
