import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useSession } from '../context/session';

/**
 * Product-screen guard replaces server-side Next `exigirEu()`. Without a session, redirect to `/entrar` while preserving destination. An account whose onboarding is incomplete goes to `/bem-vindo`; only the `api` knows completion and reports it in `Eu`. While the first session check is pending, show no protected screen to avoid a flash.
 */
const ROTAS_DO_ONBOARDING = /^\/(bem-vindo|minha-conta|trocar-conta)(\/|$)/;

export function RequireSession() {
  const { eu } = useSession();
  const { pathname, search } = useLocation();
  if (eu === undefined) return null;
  if (eu === null) {
    const destination = pathname + search;
    return <Navigate to={`/login?destino=${encodeURIComponent(destination)}`} replace />;
  }
  if (!eu.tenant.onboardingConcluido && !ROTAS_DO_ONBOARDING.test(pathname)) {
    return <Navigate to="/bem-vindo" replace />;
  }
  return <Outlet />;
}
