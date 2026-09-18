import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Eu } from '@pipe/contracts';
import { api, ErroDaApi } from '../lib/api';

/**
 * Quem está logado — a única fonte, alimentada por `GET /v1/eu`.
 *
 * Só a RESPOSTA do servidor derruba a sessão (401/403); rede fora do ar mantém
 * o último `Eu` conhecido, e o próximo `atualizar` corrige. Deslogar alguém por
 * um soluço de wi-fi é o que o conselheiros-auvp aprendeu a não fazer.
 */
interface Sessao {
  /** `null` sem sessão; `undefined` enquanto a primeira pergunta não voltou. */
  eu: Eu | null | undefined;
  atualizar: () => Promise<void>;
  sair: () => Promise<void>;
}

const Contexto = createContext<Sessao | undefined>(undefined);

export function ProvedorDeSessao({ children }: { children: ReactNode }) {
  const [eu, setEu] = useState<Eu | null | undefined>(undefined);

  const atualizar = useCallback(async () => {
    try {
      setEu(await api.get<Eu>('/v1/eu'));
    } catch (erro) {
      if (erro instanceof ErroDaApi) setEu(null);
      else setEu((atual) => (atual === undefined ? null : atual));
    }
  }, []);

  useEffect(() => {
    void atualizar();
  }, [atualizar]);

  const sair = useCallback(async () => {
    try {
      await api.post('/v1/auth/sair');
    } finally {
      setEu(null);
    }
  }, []);

  return <Contexto.Provider value={{ eu, atualizar, sair }}>{children}</Contexto.Provider>;
}

export function useSessao(): Sessao {
  const valor = useContext(Contexto);
  if (!valor) throw new Error('useSessao fora do ProvedorDeSessao');
  return valor;
}

/** Para tela de produto: o `Eu` garantido. Quem a usa está atrás de `ExigirSessao`. */
export function useEu(): Eu {
  const { eu } = useSessao();
  if (!eu) throw new Error('useEu sem sessão — a rota não está atrás de ExigirSessao');
  return eu;
}
