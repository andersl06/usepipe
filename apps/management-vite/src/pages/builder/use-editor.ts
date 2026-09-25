import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import type { BuilderOfFlow, BlockError } from '@pipe/contracts';
import { salvarRascunho } from '../builder-gravar';
import { stateInitial, reduzir } from './state';
import type { EditorState, GestoDoEditor } from './state';
import { lerDesenho, montarDesenho } from './model';
import type { Mapa } from './model';

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

export type RecordingSituation =
  | { state: 'salvo' }
  | { state: 'pendente' }
  | { state: 'salvando' }
  | { state: 'erro'; error: string };

const versionKey = (data: BuilderOfFlow): string =>
  data.versao ? `${data.versao.id}:${data.versao.atualizadoEm ?? ''}` : 'padrao';

export interface EditorDoBuilder {
  state: EditorState;
  despachar: (gesto: GestoDoEditor) => void;
  recording: RecordingSituation;
  /** Os erros que a `api` apontou no último salvar (ou na leitura). */
  apiErrors: BlockError[];
  /** Grava agora o que está na tela; devolve se deu certo. */
  salvarAgora: () => Promise<boolean>;
  /** Depois de restaurar: recarrega quando a leitura trouxer esta versão. */
  recarregarQuando: (versaoId: string, atualizadoEm: string | null) => void;
  carregado: boolean;
}

export function useEditorDoBuilder(flowId: string, data: BuilderOfFlow | null): EditorDoBuilder {
  const [state, despachar] = useReducer(reduzir, undefined, stateInitial);
  const [esperando, setEsperando] = useState<string | null>('inicial');
  const [carregado, setCarregado] = useState(false);
  const [recording, setRecording] = useState<RecordingSituation>({ state: 'salvo' });
  const [apiErrors, apiSetErrors] = useState<BlockError[]>([]);
  const ultimoPedido = useRef(0);
  const emCurso = useRef<Promise<boolean>>(Promise.resolve(true));

  /* Carrega do servidor: na primeira leitura, e quando a versão esperada chegar. */
  useEffect(() => {
    if (!data || esperando === null) return;
    if (esperando !== 'inicial' && versionKey(data) !== esperando) return;
    ultimoPedido.current += 1;
    despachar({ tipo: 'carregar', mapa: lerDesenho(data.desenho), global: data.desenho.globals });
    apiSetErrors(data.errors);
    setRecording({ state: 'salvo' });
    setEsperando(null);
    setCarregado(true);
  }, [data, esperando]);

  const gravar = useCallback(
    async (mapa: Mapa, global: Record<string, unknown>): Promise<boolean> => {
      setRecording({ state: 'salvando' });
      const r = await salvarRascunho(flowId, montarDesenho(mapa, global));
      if (!r.ok) {
        setRecording({ state: 'erro', error: r.error });
        return false;
      }
      despachar({ tipo: 'salvo', mapa });
      apiSetErrors(r.value.erros);
      setRecording({ state: 'salvo' });
      return true;
    },
    [flowId],
  );

  /* A gravação automática: um pouco depois da última mudança. */
  useEffect(() => {
    if (!state.sujo || !carregado) return;
    setRecording((g) => (g.state === 'salvando' ? g : { state: 'pending' }));
    const pedido = ++ultimoPedido.current;
    const { mapa, global } = state;
    const temporizador = setTimeout(() => {
      emCurso.current = emCurso.current.then(async () => {
        if (pedido !== ultimoPedido.current) return true;
        return gravar(mapa, global);
      });
    }, ESPERA_PARA_GRAVAR_MS);
    return () => clearTimeout(temporizador);
  }, [state, carregado, gravar]);

  const salvarAgora = useCallback(async (): Promise<boolean> => {
    ultimoPedido.current += 1;
    const { mapa, global } = state;
    emCurso.current = emCurso.current.then(() => gravar(mapa, global));
    return emCurso.current;
  }, [state, gravar]);

  const recarregarQuando = useCallback((versaoId: string, atualizadoEm: string | null): void => {
    setEsperando(`${versaoId}:${atualizadoEm ?? ''}`);
  }, []);

  return { state, despachar, recording, apiErrors, salvarAgora, recarregarQuando, carregado };
}
