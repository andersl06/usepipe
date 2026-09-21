import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import type { BuilderDoFluxo, ErroDoBloco } from '@pipe/contracts';
import { salvarRascunho } from '../builder-gravar';
import { estadoInicial, reduzir } from './estado';
import type { EstadoDoEditor, GestoDoEditor } from './estado';
import { lerDesenho, montarDesenho } from './modelo';
import type { Mapa } from './modelo';

/**
 * O estado do editor ligado à `api`: carrega o desenho que o `GET` trouxe,
 * grava sozinho um pouco depois de cada mudança (o `debouncedSave` do editor
 * da Blip, que é o que faz o "Salvo" do rodapé existir) e guarda os erros
 * bloco a bloco que o `PUT` devolve.
 *
 * O desenho local NÃO é sobrescrito quando a leitura em cache é refeita
 * depois de um salvar — senão cada gravação apagaria o que a pessoa digitou
 * enquanto o `PUT` estava no ar. Ele só é recarregado do servidor quando a
 * tela pede (`recarregarQuando`, depois de restaurar uma versão), e só quando
 * a leitura já traz a versão esperada.
 *
 * Duas gravações nunca correm ao mesmo tempo: a segunda espera a primeira e,
 * se um pedido mais novo já ficou agendado, a antiga desiste — o que chega ao
 * servidor é sempre o mapa mais recente, uma vez.
 */

export const ESPERA_PARA_GRAVAR_MS = 1500;

export type SituacaoDaGravacao =
  | { estado: 'salvo' }
  | { estado: 'pendente' }
  | { estado: 'salvando' }
  | { estado: 'erro'; erro: string };

const chaveDaVersao = (dados: BuilderDoFluxo): string =>
  dados.versao ? `${dados.versao.id}:${dados.versao.atualizadoEm ?? ''}` : 'padrao';

export interface EditorDoBuilder {
  estado: EstadoDoEditor;
  despachar: (gesto: GestoDoEditor) => void;
  gravacao: SituacaoDaGravacao;
  /** Os erros que a `api` apontou no último salvar (ou na leitura). */
  errosDaApi: ErroDoBloco[];
  /** Grava agora o que está na tela; devolve se deu certo. */
  salvarAgora: () => Promise<boolean>;
  /** Depois de restaurar: recarrega quando a leitura trouxer esta versão. */
  recarregarQuando: (versaoId: string, atualizadoEm: string | null) => void;
  carregado: boolean;
}

export function useEditorDoBuilder(fluxoId: string, dados: BuilderDoFluxo | null): EditorDoBuilder {
  const [estado, despachar] = useReducer(reduzir, undefined, estadoInicial);
  const [esperando, setEsperando] = useState<string | null>('inicial');
  const [carregado, setCarregado] = useState(false);
  const [gravacao, setGravacao] = useState<SituacaoDaGravacao>({ estado: 'salvo' });
  const [errosDaApi, setErrosDaApi] = useState<ErroDoBloco[]>([]);
  const ultimoPedido = useRef(0);
  const emCurso = useRef<Promise<boolean>>(Promise.resolve(true));

  /* Carrega do servidor: na primeira leitura, e quando a versão esperada chegar. */
  useEffect(() => {
    if (!dados || esperando === null) return;
    if (esperando !== 'inicial' && chaveDaVersao(dados) !== esperando) return;
    ultimoPedido.current += 1;
    despachar({ tipo: 'carregar', mapa: lerDesenho(dados.desenho), globais: dados.desenho.globais });
    setErrosDaApi(dados.erros);
    setGravacao({ estado: 'salvo' });
    setEsperando(null);
    setCarregado(true);
  }, [dados, esperando]);

  const gravar = useCallback(
    async (mapa: Mapa, globais: Record<string, unknown>): Promise<boolean> => {
      setGravacao({ estado: 'salvando' });
      const r = await salvarRascunho(fluxoId, montarDesenho(mapa, globais));
      if (!r.ok) {
        setGravacao({ estado: 'erro', erro: r.erro });
        return false;
      }
      despachar({ tipo: 'salvo', mapa });
      setErrosDaApi(r.valor.erros);
      setGravacao({ estado: 'salvo' });
      return true;
    },
    [fluxoId],
  );

  /* A gravação automática: um pouco depois da última mudança. */
  useEffect(() => {
    if (!estado.sujo || !carregado) return;
    setGravacao((g) => (g.estado === 'salvando' ? g : { estado: 'pendente' }));
    const pedido = ++ultimoPedido.current;
    const { mapa, globais } = estado;
    const temporizador = setTimeout(() => {
      emCurso.current = emCurso.current.then(async () => {
        if (pedido !== ultimoPedido.current) return true;
        return gravar(mapa, globais);
      });
    }, ESPERA_PARA_GRAVAR_MS);
    return () => clearTimeout(temporizador);
  }, [estado, carregado, gravar]);

  const salvarAgora = useCallback(async (): Promise<boolean> => {
    ultimoPedido.current += 1;
    const { mapa, globais } = estado;
    emCurso.current = emCurso.current.then(() => gravar(mapa, globais));
    return emCurso.current;
  }, [estado, gravar]);

  const recarregarQuando = useCallback((versaoId: string, atualizadoEm: string | null): void => {
    setEsperando(`${versaoId}:${atualizadoEm ?? ''}`);
  }, []);

  return { estado, despachar, gravacao, errosDaApi, salvarAgora, recarregarQuando, carregado };
}
