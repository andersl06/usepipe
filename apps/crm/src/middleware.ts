import { NextResponse, type NextRequest } from 'next/server';

/**
 * With no session cookie, the person goes to `/entrar`. It's the door, and
 * there's only one.
 *
 * Only the cookie's PRESENCE is checked here — no session validation: the
 * middleware runs on every request, and a round trip to the API for an image
 * navigation would be expensive and fragile. What validates it is
 * `exigirEu()`, on the server, against `GET /v1/eu`: an expired or forged
 * cookie falls through there and comes back here.
 *
 * Two routes are left out, and they're the product's two public ones: sign-in
 * and the invite. Without this exception, whoever has no session would be sent
 * to `/entrar`, and from there to `/entrar`, forever.
 */
const PUBLICO = /^\/(login|invite)(\/|$)/;

export function middleware(request: NextRequest): NextResponse {
  const { pathname, search } = request.nextUrl;
  if (PUBLICO.test(pathname)) return NextResponse.next();
  if (request.cookies.has('pipe_session')) return NextResponse.next();

  const url = request.nextUrl.clone();
  url.pathname = '/login';
  url.search = '';
  // Where the person wanted to go. The API checks it's an internal path before
  // using it, and the screen checks again before sending it.
  if (pathname !== '/') url.searchParams.set('returnTo', `${pathname}${search}`);
  return NextResponse.redirect(url);
}

/**
 * Outside the matcher: whatever isn't a page navigation. A build file or an
 * icon has nowhere to be redirected to — and sending them to `/entrar` would
 * break the sign-in screen itself.
 *
 * There's no `public/` in any of the three apps (the logo is an SVG component,
 * the font comes from Google), so `_next/` and the icon cover everything.
 */
export const config = {
  matcher: ['/((?!_next/|favicon.ico).*)'],
};
