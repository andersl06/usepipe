import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useSessao } from '../contexto/sessao';

/**
 * O portão das telas do Desk — o mesmo de `apps/gestao-vite`, sem o desvio para
 * `/bem-vindo`: o onboarding da conta é assunto da Gestão, e o atendente que
 * chega aqui já tem conta pronta.
 *
 * Sem sessão vai para `/entrar` com o destino guardado. Enquanto a primeira
 * pergunta não voltou, não desenha nada: mostrar a tela e depois tirá-la é
 * pior que um instante em branco.
 */
export function ExigirSessao() {
  const { eu } = useSessao();
  const { pathname, search } = useLocation();
  if (eu === undefined) return null;
  if (eu === null) {
    const destino = pathname + search;
    return <Navigate to={`/entrar?destino=${encodeURIComponent(destino)}`} replace />;
  }
  return <Outlet />;
}
