import { useEffect } from 'react';
import { useNavigate, type NavigateFunction } from 'react-router-dom';

/**
 * Navegação fora de componente — o `redirect()` das Server Actions, agora no
 * navegador.
 *
 * As ações de formulário são funções de módulo (para o `useActionState` e o
 * `<form action>` continuarem como estavam), e função de módulo não tem hook.
 * O `App` registra o `navigate` do roteador uma vez, e `irPara` usa o último
 * registrado. Antes do registro (ou fora do roteador) cai no `location`, que
 * chega ao mesmo lugar recarregando a página.
 */
let navegar: NavigateFunction | null = null;

export function irPara(url: string, opcoes: { substituir?: boolean } = {}): void {
  if (navegar) navegar(url, { replace: opcoes.substituir ?? false });
  else if (opcoes.substituir) window.location.replace(url);
  else window.location.assign(url);
}

/** Põe o `navigate` do roteador à disposição de `irPara`. Uma vez, no `App`. */
export function useRegistrarNavegacao(): void {
  const navigate = useNavigate();
  useEffect(() => {
    navegar = navigate;
    return () => {
      if (navegar === navigate) navegar = null;
    };
  }, [navigate]);
}
