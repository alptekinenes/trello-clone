import type { To } from 'react-router';

/** An origin no real URL has; relative paths resolved against it must keep it to be same-site. */
const PLACEHOLDER_ORIGIN = 'https://app.invalid';
const MAX_RETURN_URL_LENGTH = 2048;

/**
 * A same-site path (with query and hash) from untrusted input, or null.
 * Anything that would leave the site once a browser resolves it is refused:
 * other origins, `//host`, `/\host`, `javascript:` and the like.
 */
export function safeReturnPath(value: string | null): string | null {
  if (value === null || !value.startsWith('/') || value.length > MAX_RETURN_URL_LENGTH) return null;
  let url: URL;
  try {
    url = new URL(value, PLACEHOLDER_ORIGIN);
  } catch {
    return null;
  }
  if (url.origin !== PLACEHOLDER_ORIGIN) return null;
  // Dot segments are removed by the parser, so `/.//host` becomes `//host`: check the result.
  if (url.pathname.startsWith('//') || url.pathname.startsWith('/\\')) return null;
  return `${url.pathname}${url.search}${url.hash}`;
}

function stringField(source: object, key: string): string {
  const value = (source as Record<string, unknown>)[key];
  return typeof value === 'string' ? value : '';
}

/** The page ProtectedRoute sent the user away from (router state `from`), as a path. */
function fromState(state: unknown): string | null {
  if (typeof state !== 'object' || state === null || !('from' in state)) return null;
  const { from } = state;
  if (typeof from !== 'object' || from === null || !('pathname' in from)) return null;
  if (typeof from.pathname !== 'string') return null;
  return safeReturnPath(`${from.pathname}${stringField(from, 'search')}${stringField(from, 'hash')}`);
}

/**
 * Where to go after signing in: the page the user tried to open (router state set by
 * ProtectedRoute), else the `?returnUrl=` of the page (set by links such as the invitation
 * page), else home. Only same-site paths are accepted.
 */
export function redirectTarget(location: { state: unknown; search: string }): string {
  const returnUrl = new URLSearchParams(location.search).get('returnUrl');
  return fromState(location.state) ?? safeReturnPath(returnUrl) ?? '/';
}

/** Link to the login or register page that comes back to `returnUrl` after signing in. */
export function authPageLink(page: 'login' | 'register', returnUrl: string): To {
  const safe = safeReturnPath(returnUrl);
  return {
    pathname: `/${page}`,
    search: safe === null ? '' : `?${new URLSearchParams({ returnUrl: safe }).toString()}`,
  };
}

/** The email a link handed to the login or register page to fill in (router state `email`). */
export function prefillEmail(state: unknown): string {
  if (typeof state !== 'object' || state === null || !('email' in state)) return '';
  return typeof state.email === 'string' ? state.email : '';
}
