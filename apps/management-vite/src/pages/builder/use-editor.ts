import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import type { BuilderOfFlow, BlockError } from '@pipe/contracts';
import { salvarRascunho } from '../builder-gravar';
import { stateInitial, reduzir } from './state';
import type { EditorState, GestoDoEditor } from './state';
import { lerDesenho, montarDesenho } from './model';
import type { Mapa } from './model';

/**
 * The editor's state wired to the `api`: loads the drawing the `GET` brought, saves itself automatically a bit after each change (the Blip editor's `debouncedSave`, which is what makes the footer's "Salvo" exist), and stores the per-block errors the `PUT` returns.
 *
 * The local drawing is NOT overwritten when the cached read is redone after a save — otherwise every save would erase what the person typed while the `PUT` was in flight. It's only reloaded from the server when the screen asks for it (`recarregarQuando`, after restoring a version), and only once the read already brings the expected version.
 *
 * Two saves never run at the same time: the second waits for the first, and if a newer request has already been scheduled, the old one gives up — what reaches the server is always the most recent map, once.
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
  /** The errors the `api` flagged on the last save (or on read). */
  apiErrors: BlockError[];
  /** Saves what's on screen right now; returns whether it succeeded. */
  salvarAgora: () => Promise<boolean>;
  /** After restoring: reload when the read brings back this version. */
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

  /* Loads from the server: on the first read, and when the expected version arrives. */
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

  /* Autosave: a little while after the last change. */
  useEffect(() => {
    if (!state.sujo || !carregado) return;
    setRecording((g) => (g.state === 'salvando' ? g : { state: 'pendente' }));
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
