/**
 * Importador: o export do EDITOR do Builder da Blip → o formato PUBLICADO que o motor lê.
 *
 * **Não é porte.** O motor (`FlowManager`) consome o fluxo publicado
 * (`{ id, states: [{ inputActions, input, outputActions, outputs }] }`); o botão
 * "Exportar" do Builder devolve o formato do editor (`{ flow: { <id>: estado },
 * globalActions }`, com `$contentActions`, `$conditionOutputs`…). Quem converte um no
 * outro é o portal da Blip, que é proprietário: o comportamento abaixo foi copiado
 * comparando os dois formatos, sem código do portal.
 *
 * - `$enteringCustomActions` e depois as ações de `$contentActions` → `inputActions`
 *   (ação de entrada roda antes do conteúdo do bloco);
 * - o item `input` de `$contentActions` → `input`;
 * - `$leavingCustomActions` → `outputActions`; `$afterStateChangedActions` →
 *   `afterStateChangedActions`; `$localCustomActions` → `localCustomActions`;
 * - `$conditionOutputs`, na ordem, e por último `$defaultOutput` sem condição → `outputs`;
 * - `$title` → `name`; `$position` e `$tags` ficam como dado de extensão;
 * - `globalActions.$enteringCustomActions` / `$leavingCustomActions` → as ações globais
 *   de entrada e de saída do fluxo.
 *
 * Nada é descartado em silêncio: o que o Pipe não executa entra no relatório por tipo,
 * e o estado original do editor vai junto para o `bloco.conteudo` (ver `api`).
 */

import { COMPARISONS, FONTES } from './condition.js';
import type { ConditionBlip } from './condition.js';
import { FONTES_OF_VARIABLE, FONTES_SUPORTADAS } from './context.js';
import type { VariableFonte } from './context.js';
import type { Acao, Inbound, State, FlowBlip, Saida } from './modelos.js';
import { PROVEDOR_PADRAO } from './actions.js';

type Objeto = Record<string, unknown>;

export interface EditorState extends Objeto {
  id: string;
  root?: boolean;
  $title?: string;
  $position?: unknown;
  $tags?: unknown;
  $contentActions?: { action?: Objeto; input?: Objeto }[];
  $conditionOutputs?: (Objeto & { stateId?: string; conditions?: ConditionBlip[] })[];
  $defaultOutput?: { stateId?: string } | null;
  $enteringCustomActions?: Objeto[];
  $leavingCustomActions?: Objeto[];
  $afterStateChangedActions?: Objeto[];
  $localCustomActions?: Objeto[];
}

export interface ExportDoEditor {
  flow: Record<string, EditorState>;
  globalActions?: Partial<EditorState> | null;
}

/** O export do editor tem `flow` como MAPA de estados, e não `states[]`. */
export function ehExportDoEditor(json: unknown): json is ExportDoEditor {
  const flow = (json as { flow?: unknown } | null)?.flow;
  return (
    !!flow &&
    typeof flow === 'object' &&
    !Array.isArray((flow as { states?: unknown }).states) &&
    Object.values(flow).some((e) => !!e && typeof e === 'object' && '$contentActions' in e)
  );
}

/** Tira as chaves de editor (`$id`, `$invalid`, `$cardContent`…) e mantém as do modelo. */
function limpar<T>(objeto: Objeto, manter: readonly string[] = []): T {
  const saida: Objeto = {};
  for (const [k, v] of Object.entries(objeto)) {
    if (k.startsWith('$') && !manter.includes(k)) continue;
    if (v !== undefined) saida[k] = v;
  }
  return saida as T;
}

function converterAcao(a: Objeto): Acao {
  const acao = limpar<Acao>(a, ['$title']);
  if (acao.id === undefined && typeof a['$id'] === 'string') acao.id = a['$id'];
  if (Array.isArray(acao.conditions))
    acao.conditions = acao.conditions.map((c) => limpar<ConditionBlip>(c as Objeto));
  return acao;
}

function converterState(e: EditorState): State {
  const conteudo = e.$contentActions ?? [];
  const editorInbound = conteudo.find((c) => c.input)?.input;
  // Saída sem destino não vira transição: é o que o editor da Blip guarda no
  // bloco de atendimento recém-criado (as "Saídas de atendimento" ainda sem
  // bloco) e no rascunho em que a pessoa ainda não escolheu o "Direcionar para
  // bloco". O motor nunca a tomaria; a tela é quem aponta que falta preencher.
  const saidas: Saida[] = (e.$conditionOutputs ?? [])
    .filter((s) => typeof s.stateId === 'string' && s.stateId !== '')
    .map((s, i) => ({
      order: i,
      conditions: (s.conditions ?? []).map((c) => limpar<ConditionBlip>(c as Objeto)),
      stateId: String(s.stateId),
    }));
  if (e.$defaultOutput?.stateId)
    saidas.push({ order: saidas.length, stateId: e.$defaultOutput.stateId });

  const state: State = {
    id: e.id,
    ...(e.root ? { root: true } : {}),
    inputActions: [
      ...(e.$enteringCustomActions ?? []).map(converterAcao),
      ...conteudo.filter((c) => c.action).map((c) => converterAcao(c.action!)),
    ],
    ...(editorInbound ? { input: limpar<Inbound>(editorInbound) } : {}),
    outputActions: (e.$leavingCustomActions ?? []).map(converterAcao),
    afterStateChangedActions: (e.$afterStateChangedActions ?? []).map(converterAcao),
    outputs: saidas,
    ...(e.$localCustomActions?.length
      ? { localCustomActions: e.$localCustomActions.map(converterAcao) }
      : {}),
  };
  if (e.$title !== undefined) state['name'] = e.$title;
  if (e.$position !== undefined) state['$position'] = e.$position;
  if (e.$tags !== undefined) state['$tags'] = e.$tags;
  return state;
}

/** O export do editor no formato publicado. O `id` do fluxo é de quem importa. */
export function converterDoEditor(exportado: ExportDoEditor, id: string): FlowBlip {
  const global = exportado.globalActions ?? {};
  return {
    id,
    states: Object.values(exportado.flow).map(converterState),
    inputActions: (global.$enteringCustomActions ?? []).map(converterAcao),
    outputActions: (global.$leavingCustomActions ?? []).map(converterAcao),
    afterStateChangedActions: (global.$afterStateChangedActions ?? []).map(converterAcao),
  };
}

/**
 * Lê qualquer um dos formatos da Blip: export do editor, `applicationJson` publicado
 * (`{ settings: { flow } }`), `{ flow: { states } }` ou o `Flow` direto. O publicado é
 * identidade: o motor lê a Blip nativamente.
 */
export function blipReadFlow(json: unknown, id: string): FlowBlip {
  if (ehExportDoEditor(json)) return converterDoEditor(json, id);
  const j = json as { settings?: { flow?: FlowBlip }; flow?: FlowBlip; states?: unknown } | null;
  const flow =
    j?.settings?.flow ?? j?.flow ?? (Array.isArray(j?.states) ? (j as FlowBlip) : null);
  if (!flow || !Array.isArray(flow.states)) {
    throw new Error(
      'O arquivo não é um fluxo da Blip: não achei `flow`, `settings.flow` nem `states`.',
    );
  }
  return { ...flow, id };
}

/** Os tipos de conteúdo que o canal do Pipe manda hoje. O "digitando" passa sem efeito. */
export const CONTEUDOS_SUPORTADOS = new Set(['text/plain', 'application/vnd.lime.select+json']);
export const CONTEUDOS_SEM_EFEITO = new Set(['application/vnd.lime.chatstate+json']);
/** Ações que rodam e não fazem nada no Pipe, ditas aqui para não parecer que fazem. */
export const ACTIONS_WITHOUT_EFEITO = new Set(['LeavingFromDesk']);

export interface ImportReport {
  estados: number;
  saidas: number;
  /** Todas as ações, por tipo. */
  actions: Record<string, number>;
  /** O que o motor do Pipe NÃO executa, por tipo — em tempo de execução, lança. */
  naoSuportado: Record<string, number>;
  /** O que roda sem efeito no Pipe. */
  semEfeito: Record<string, number>;
}

const somar = (mapa: Record<string, number>, key: string): void => {
  mapa[key] = (mapa[key] ?? 0) + 1;
};

const texto = (v: unknown): string => (typeof v === 'string' ? v : String(v));

/** O que do fluxo o Pipe executa, e o que não. Só contagens e nomes de tipo. */
export function importReport(flow: FlowBlip): ImportReport {
  const r: ImportReport = {
    estados: flow.states.length,
    saidas: 0,
    actions: {},
    naoSuportado: {},
    semEfeito: {},
  };

  const verConditions = (conditions: ConditionBlip[] | null | undefined): void => {
    for (const c of conditions ?? []) {
      const fonte = (c.source ?? 'input').toLowerCase();
      if (!FONTES.includes(fonte as (typeof FONTES)[number]))
        somar(r.naoSuportado, `condicao:fonte:${fonte}`);
      else if (fonte === 'intent' || fonte === 'entity')
        somar(r.naoSuportado, `condicao:fonte:${fonte}`);
      const comparison = (c.comparison ?? 'equals').toLowerCase();
      if (!COMPARISONS.some((x) => x.toLowerCase() === comparison)) {
        somar(r.naoSuportado, `condicao:comparacao:${comparison}`);
      }
    }
  };

  const verAcao = (a: Acao): void => {
    somar(r.actions, a.type);
    verConditions(a.conditions);
    if (!PROVEDOR_PADRAO.has(a.type)) return somar(r.naoSuportado, `acao:${a.type}`);
    if (ACTIONS_WITHOUT_EFEITO.has(a.type)) somar(r.semEfeito, `acao:${a.type}`);
    const tipo = (a.settings as { type?: unknown } | undefined)?.type;
    if (a.type === 'SendMessage' && tipo !== undefined) {
      if (CONTEUDOS_SEM_EFEITO.has(texto(tipo))) somar(r.semEfeito, `conteudo:${texto(tipo)}`);
      else if (!CONTEUDOS_SUPORTADOS.has(texto(tipo)))
        somar(r.naoSuportado, `conteudo:${texto(tipo)}`);
    }
    if (a.type === 'SendRawMessage' && texto(tipo) !== 'text/plain') {
      somar(r.naoSuportado, `conteudo:${texto(tipo)}`);
    }
  };

  for (const a of [
    ...(flow.inputActions ?? []),
    ...(flow.outputActions ?? []),
    ...(flow.afterStateChangedActions ?? []),
  ]) {
    verAcao(a);
  }
  for (const e of flow.states) {
    if (e.id.startsWith('subflow:')) somar(r.naoSuportado, 'estado:subfluxo');
    if (e.end) somar(r.naoSuportado, 'estado:fim-de-subfluxo');
    for (const a of [
      ...(e.inputActions ?? []),
      ...(e.outputActions ?? []),
      ...(e.afterStateChangedActions ?? []),
    ]) {
      verAcao(a);
    }
    // Ação local só roda pelo agente do Builder (`ProcessCommandInputAsync`), não pela conversa.
    for (const a of e.localCustomActions ?? []) {
      somar(r.actions, a.type);
      somar(r.semEfeito, `acao-local:${a.type}`);
    }
    if (e.input?.expiration) somar(r.naoSuportado, 'entrada:expiracao');
    verConditions(e.input?.conditions);
    for (const s of e.outputs ?? []) {
      r.saidas += 1;
      verConditions(s.conditions);
    }
  }

  // Variáveis de fonte sem provedor no Pipe (`{{calendar.x}}`, `{{resource.x}}`…).
  for (const m of JSON.stringify(flow).matchAll(/{{([a-zA-Z0-9.@_-]+)}}/g)) {
    const nome = m[1]!.split('@')[0]!;
    if (!nome.includes('.')) continue;
    const fonte = nome.split('.')[0]!.toLowerCase();
    const conhecida = FONTES_OF_VARIABLE.includes(fonte as VariableFonte);
    if (!conhecida || !FONTES_SUPORTADAS.has(fonte as VariableFonte))
      somar(r.naoSuportado, `variavel:${fonte}`);
  }

  return r;
}
