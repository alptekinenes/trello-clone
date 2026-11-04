import { useState } from 'react';
import { Link, Outlet } from 'react-router';
import { AccountMenu, useAuthStatus } from '../features/auth';
import { CreateBoardDialog, useBoardListRealtime } from '../features/boards';
import { useRealtimeConnection } from '../shared/hooks/use-realtime-connection';
import { APP_NAME } from '../shared/lib/app-name';
import { Button } from '../shared/ui/button';
import { Toaster } from '../shared/ui/toaster';

export function RootLayout() {
  const signedIn = useAuthStatus() === 'authenticated';
  const [creating, setCreating] = useState(false);
  useRealtimeConnection(signedIn);
  useBoardListRealtime();

  return (
    <div className="flex h-full flex-col">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-surface focus:px-3 focus:py-2 focus:shadow-raised"
      >
        İçeriğe geç
      </a>
      <header className="flex h-12 items-center justify-between gap-2 border-b border-line bg-surface px-4">
        <div className="flex items-center gap-3">
          <Link to="/" className="rounded-sm text-base font-semibold text-fg">
            {APP_NAME}
          </Link>
          {signedIn && (
            <Button className="h-8" onClick={() => setCreating(true)}>
              Yeni pano
            </Button>
          )}
        </div>
        <AccountMenu />
      </header>
      {/* The header stays put; the page scrolls inside main, and the board fits main exactly. */}
      <main id="main" className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        <Outlet />
      </main>
      {creating && <CreateBoardDialog onClose={() => setCreating(false)} />}
      <Toaster />
    </div>
  );
}
