import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useSessao } from '../contexto/sessao';

/**
 * O portão das telas de produto — o que `exigirEu()` fazia no servidor do Next.
 *
 * Sem sessão vai para `/entrar` com o destino guardado; conta que ainda não
 * passou por "minha conta" vai para `/bem-vindo` (só a `api` sabe se o
 * onboarding fechou, e ela conta isso no `Eu`). Enquanto a primeira pergunta
 * não voltou, não desenha nada: mostrar a tela e depois tirá-la é pior que
 * um instante em branco.
 */
const ROTAS_DO_ONBOARDING = /^\/(bem-vindo|minha-conta|trocar-conta)(\/|$)/;

export function ExigirSessao() {
  const { eu } = useSessao();
  const { pathname, search } = useLocation();
  if (eu === undefined) return null;
  if (eu === null) {
    const destino = pathname + search;
    return <Navigate to={`/entrar?destino=${encodeURIComponent(destino)}`} replace />;
  }
  if (!eu.tenant.onboardingConcluido && !ROTAS_DO_ONBOARDING.test(pathname)) {
    return <Navigate to="/bem-vindo" replace />;
  }
  return <Outlet />;
}
