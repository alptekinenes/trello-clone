import { Link, Outlet } from 'react-router';

export function RootLayout() {
  return (
    <div className="flex min-h-full flex-col">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-surface focus:px-3 focus:py-2 focus:shadow-raised"
      >
        İçeriğe geç
      </a>
      <header className="flex h-12 items-center border-b border-line bg-surface px-4">
        <Link to="/" className="rounded-sm text-base font-semibold text-fg">
          Trello Clone
        </Link>
      </header>
      <main id="main" className="flex-1">
        <Outlet />
      </main>
    </div>
  );
}
