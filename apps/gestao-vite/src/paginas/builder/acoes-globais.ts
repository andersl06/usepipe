import type { AcaoDoEditor } from './modelo';
import { LIMITE_DE_ACOES, ROTULOS_DAS_ACOES } from './acoes-do-bloco';
import type { ListaDeAcoes } from './acoes-do-bloco';

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

export interface AcoesGlobais {
  $enteringCustomActions?: AcaoDoEditor[];
  $leavingCustomActions?: AcaoDoEditor[];
  [extensao: string]: unknown;
}

export const listaDeAcoesGlobais = (globais: Record<string, unknown>, lista: ListaDeAcoes): AcaoDoEditor[] => {
  const acoes = (globais as AcoesGlobais)[lista];
  return Array.isArray(acoes) ? acoes : [];
};

export type ResultadoDeAcaoGlobal = { ok: true; globais: Record<string, unknown> } | { ok: false; erro: string };

export function adicionarAcaoGlobal(
  globais: Record<string, unknown>,
  lista: ListaDeAcoes,
  acao: AcaoDoEditor,
): ResultadoDeAcaoGlobal {
  const atuais = listaDeAcoesGlobais(globais, lista);
  if (atuais.length >= LIMITE_DE_ACOES) return { ok: false, erro: ROTULOS_DAS_ACOES.limite };
  return { ok: true, globais: { ...globais, [lista]: [...atuais, acao] } };
}

export function substituirAcaoGlobal(
  globais: Record<string, unknown>,
  lista: ListaDeAcoes,
  indice: number,
  acao: AcaoDoEditor,
): Record<string, unknown> {
  const atuais = listaDeAcoesGlobais(globais, lista);
  return { ...globais, [lista]: atuais.map((a, i) => (i === indice ? acao : a)) };
}

export function removerAcaoGlobal(
  globais: Record<string, unknown>,
  lista: ListaDeAcoes,
  indice: number,
): Record<string, unknown> {
  const atuais = listaDeAcoesGlobais(globais, lista);
  return { ...globais, [lista]: atuais.filter((_, i) => i !== indice) };
}

export function moverAcaoGlobal(
  globais: Record<string, unknown>,
  lista: ListaDeAcoes,
  de: number,
  para: number,
): Record<string, unknown> {
  const atuais = [...listaDeAcoesGlobais(globais, lista)];
  if (de < 0 || de >= atuais.length || para < 0 || para >= atuais.length || de === para) return globais;
  const [acao] = atuais.splice(de, 1);
  atuais.splice(para, 0, acao!);
  return { ...globais, [lista]: atuais };
}
