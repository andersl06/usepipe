import type { AcaoDoEditor } from './modelo';
import { ACTIONS_LIMIT, ROTULOS_OF_ACTIONS } from './acoes-do-bloco';
import type { ActionsLista } from './acoes-do-bloco';

/**
 * A aba "Ações Globais" do painel "Configuração" (`portal.js`:
 * `builder-configurations.globalActions.title`, componente `<actions
 * state="$ctrl.globalActions">`) — as MESMAS duas listas de um bloco
 * (`$enteringCustomActions`/`$leavingCustomActions`), só que do fluxo
 * inteiro: `editor.ts` confirma que `globalActions.$enteringCustomActions`/
 * `$leavingCustomActions` viram "as ações globais de entrada e de saída do
 * fluxo" na conversão pro formato publicado — não é enfeite, o motor as
 * executa.
 *
 * O catálogo de tipos, os rótulos e a validação de cada ação são os MESMOS
 * de `acoes-do-bloco.ts` (`novaAcao`, `tipoDeAcao`, `valorDoCampo`,
 * `comCampo`, `comTitulo`, `comCondicoes`, `errosDaAcao` — todos operam sobre
 * a ação, não sobre o bloco). Só o CRUD da lista muda: aqui é `globais`
 * (`Record<string, unknown>`), não um `Bloco` com `id`.
 */

export interface ActionsGlobal {
  $enteringCustomActions?: AcaoDoEditor[];
  $leavingCustomActions?: AcaoDoEditor[];
  [extensao: string]: unknown;
}

export const actionsGlobalLista = (global: Record<string, unknown>, lista: ActionsLista): AcaoDoEditor[] => {
  const actions = (global as ActionsGlobal)[lista];
  return Array.isArray(actions) ? actions : [];
};

export type ResultadoDeAcaoGlobal = { ok: true; global: Record<string, unknown> } | { ok: false; error: string };

export function adicionarAcaoGlobal(
  global: Record<string, unknown>,
  lista: ActionsLista,
  acao: AcaoDoEditor,
): ResultadoDeAcaoGlobal {
  const current = actionsGlobalLista(global, lista);
  if (current.length >= ACTIONS_LIMIT) return { ok: false, error: ROTULOS_OF_ACTIONS.limite };
  return { ok: true, global: { ...global, [lista]: [...current, acao] } };
}

export function substituirAcaoGlobal(
  global: Record<string, unknown>,
  lista: ActionsLista,
  indice: number,
  acao: AcaoDoEditor,
): Record<string, unknown> {
  const current = actionsGlobalLista(global, lista);
  return { ...global, [lista]: current.map((a, i) => (i === indice ? acao : a)) };
}

export function removerAcaoGlobal(
  global: Record<string, unknown>,
  lista: ActionsLista,
  indice: number,
): Record<string, unknown> {
  const current = actionsGlobalLista(global, lista);
  return { ...global, [lista]: current.filter((_, i) => i !== indice) };
}

export function moverAcaoGlobal(
  global: Record<string, unknown>,
  lista: ActionsLista,
  de: number,
  para: number,
): Record<string, unknown> {
  const current = [...actionsGlobalLista(global, lista)];
  if (de < 0 || de >= current.length || para < 0 || para >= current.length || de === para) return global;
  const [acao] = current.splice(de, 1);
  current.splice(para, 0, acao!);
  return { ...global, [lista]: current };
}
