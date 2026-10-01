import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Eu } from '@pipe/contracts';
import { api, ApiError } from '@pipe/ui/api';
import { readPreferences } from '../lib/preferences';
import { isReload, markOpened } from '../lib/presence';

/**
 * Quem está logado — a única fonte, alimentada por `GET /v1/eu`.
 *
 * Só a RESPOSTA do servidor derruba a sessão (401/403); rede fora do ar mantém
 * o último `Eu` conhecido, e o próximo `atualizar` corrige. Deslogar alguém por
 * um soluço de wi-fi é o que o conselheiros-auvp aprendeu a não fazer.
 */
interface Session {
  /** `null` sem sessão; `undefined` enquanto a primeira pergunta não voltou. */
  eu: Eu | null | undefined;
  authFailure: boolean;
  atualizar: () => Promise<void>;
  sair: () => Promise<void>;
}

const Context = createContext<Session | undefined>(undefined);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [eu, setEu] = useState<Eu | null | undefined>(undefined);
  const [authFailure, setAuthFailure] = useState(false);

  const atualizar = useCallback(async () => {
    try {
      setEu(await api.get<Eu>('/v1/eu'));
      setAuthFailure(false);
    } catch (error) {
      const code = error instanceof ApiError && typeof error.corpo === 'object' && error.corpo !== null && 'error' in error.corpo
        ? (error.corpo as { error?: { code?: string } }).error?.code : undefined;
      setAuthFailure(error instanceof ApiError && (error.status === 401 || (error.status === 403 && code === 'tenant_mismatch')));
      if (error instanceof ApiError) setEu(null);
      else setEu((atual) => (atual === undefined ? null : atual));
    }
  }, []);

  useEffect(() => {
    void atualizar();
  }, [atualizar]);

  // Presence: report the opening once per load (new tab vs F5) and keep stamping while the tab lives, so the API can drop an agent whose tab died.
  const userId = eu?.user.id;
  useEffect(() => {
    if (!userId) return;
    const reload = isReload(sessionStorage);
    markOpened(sessionStorage);
    api
      .post('/v1/eu/presenca/abertura', { reload, keepOnline: readPreferences().continuarOnline })
      .catch(() => undefined);
    const timer = setInterval(() => {
      api.post('/v1/eu/presenca/sinal', { keepOnline: readPreferences().continuarOnline }).catch(() => undefined);
    }, 60_000);
    return () => clearInterval(timer);
  }, [userId]);

  const sair = useCallback(async () => {
    try {
      await api.post('/v1/auth/sair');
    } finally {
      setEu(null);
    }
  }, []);

  return <Context.Provider value={{ eu, authFailure, atualizar, sair }}>{children}</Context.Provider>;
}

export function useSession(): Session {
  const value = useContext(Context);
  if (!value) throw new Error('useSessao fora do ProvedorDeSessao');
  return value;
}

/** Para tela de produto: o `Eu` garantido. Quem a usa está atrás de `ExigirSessao`. */
export function useEu(): Eu {
  const { eu } = useSession();
  if (!eu) throw new Error('useEu sem sessão — a rota não está atrás de ExigirSessao');
  return eu;
}
