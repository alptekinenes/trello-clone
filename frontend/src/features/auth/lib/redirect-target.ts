/**
 * Where to go after signing in: the page the user tried to open
 * (set by ProtectedRoute in router state), or home.
 * Only same-site paths are accepted.
 */
export function redirectTarget(state: unknown): string {
  if (typeof state !== 'object' || state === null || !('from' in state)) return '/';
  const { from } = state;
  if (typeof from !== 'object' || from === null || !('pathname' in from)) return '/';

  const { pathname } = from;
  if (typeof pathname !== 'string' || !pathname.startsWith('/') || pathname.startsWith('//')) {
    return '/';
  }
  const search = 'search' in from && typeof from.search === 'string' ? from.search : '';
  return `${pathname}${search}`;
}
