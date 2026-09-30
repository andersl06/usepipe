import { useEffect } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useSession } from '../context/session';
import { tenantLoginUrl } from '../lib/tenant-login';

/**
 * O portão das telas do Desk — o mesmo de `apps/management-vite`, sem o desvio para
 * `/bem-vindo`: o onboarding da conta é assunto da Gestão, e o atendente que
 * chega aqui já tem conta pronta.
 *
 * Sem sessão vai para `/entrar` com o destino guardado. Enquanto a primeira
 * pergunta não voltou, não desenha nada: mostrar a tela e depois tirá-la é
 * pior que um instante em branco.
 */
export function RequireSession() {
  const { eu, authFailure } = useSession();
  const { pathname, search } = useLocation();
  const loginUrl = authFailure ? tenantLoginUrl(window.location, import.meta.env.DEV) : null;
  useEffect(() => {
    if (eu === null && loginUrl) window.location.replace(loginUrl);
  }, [eu, loginUrl]);
  if (eu === undefined) {
    return (
      <main className="dk-loading-session" role="status" aria-live="polite">
        Carregando Desk…
      </main>
    );
  }
  if (eu === null) {
    if (loginUrl) return null;
    const destination = pathname + search;
    return <Navigate to={`/login?destino=${encodeURIComponent(destination)}`} replace />;
  }
  return <Outlet />;
}
