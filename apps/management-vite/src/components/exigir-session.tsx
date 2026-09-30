import { useEffect } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useSession } from '../context/session';
import { centralLoginRedirect, hostMode } from '../lib/tenant-links';

/**
 * Product-screen guard replaces server-side Next `exigirEu()`. Without a session, redirect to `/entrar` while preserving destination. An account whose onboarding is incomplete goes to `/welcome`; only the `api` knows completion and reports it in `Eu`. While the first session check is pending, show no protected screen to avoid a flash.
 *
 * `switch-account` moved under `/application` (D-52); `welcome` and `my-account` stayed at the
 * root (evidence in `lib/application-paths.ts`'s header comment). `/bem-vindo` no longer exists
 * (D-14, corte seco) — `legacy-redirects.tsx` doesn't redirect it either.
 */
const ROTAS_DO_ONBOARDING = /^\/(welcome|my-account|application\/switch-account)(\/|$)/;

export function RequireSession() {
  const { eu, authFailure } = useSession();
  const { pathname, search } = useLocation();
  const loginUrl = authFailure && hostMode(window.location) === 'tenant'
    ? centralLoginRedirect(window.location, import.meta.env.DEV) : null;
  useEffect(() => {
    if (eu === null && loginUrl) window.location.replace(loginUrl);
  }, [eu, loginUrl]);
  if (eu === undefined) return null;
  if (eu === null) {
    if (loginUrl) return null;
    const destination = pathname + search;
    return <Navigate to={`/login?destino=${encodeURIComponent(destination)}`} replace />;
  }
  if (!eu.tenant.onboardingConcluido && !ROTAS_DO_ONBOARDING.test(pathname)) {
    return <Navigate to="/welcome" replace />;
  }
  return <Outlet />;
}
