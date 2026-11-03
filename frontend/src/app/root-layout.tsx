import { Link, Outlet } from 'react-router';
import { UserMenu, useAuthStatus } from '../features/auth';
import { useBoardListRealtime } from '../features/boards';
import { useRealtimeConnection } from '../shared/hooks/use-realtime-connection';
import { Toaster } from '../shared/ui/toaster';

export function RootLayout() {
  useRealtimeConnection(useAuthStatus() === 'authenticated');
  useBoardListRealtime();

  return (
    <div className="flex min-h-full flex-col">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-surface focus:px-3 focus:py-2 focus:shadow-raised"
      >
        İçeriğe geç
      </a>
      <header className="flex h-12 items-center justify-between border-b border-line bg-surface px-4">
        <Link to="/" className="rounded-sm text-base font-semibold text-fg">
          Trello Clone
        </Link>
        <UserMenu />
      </header>
      <main id="main" className="flex flex-1 flex-col">
        <Outlet />
      </main>
      <Toaster />
    </div>
  );
}
