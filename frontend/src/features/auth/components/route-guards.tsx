import { Navigate, Outlet, useLocation } from 'react-router';
import { PageLoader } from '../../../shared/ui/page-loader';
import { redirectTarget } from '../lib/redirect-target';
import { useAuthStatus } from '../store/auth-store';

const CHECKING = 'Oturum kontrol ediliyor…';

/** Pages for signed-in users. Others go to /login and come back after signing in. */
export function ProtectedRoute() {
  const status = useAuthStatus();
  const location = useLocation();

  if (status === 'unknown') return <PageLoader label={CHECKING} />;
  if (status === 'anonymous') return <Navigate to="/login" replace state={{ from: location }} />;
  return <Outlet />;
}

/** Pages for signed-out users (login, register). Signed-in users are sent on. */
export function GuestRoute() {
  const status = useAuthStatus();
  const location = useLocation();

  if (status === 'unknown') return <PageLoader label={CHECKING} />;
  if (status === 'authenticated') return <Navigate to={redirectTarget(location.state)} replace />;
  return <Outlet />;
}
