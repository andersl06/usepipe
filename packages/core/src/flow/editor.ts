/**
 * Importer converts a Blip Builder EDITOR export to the PUBLISHED format read by the engine. This is not a code port: `FlowManager` consumes `{ id, states: [{ inputActions, input, outputActions, outputs }] }`, while Builder "Exportar" returns `{ flow: { <id>: estado }, globalActions }` with `$contentActions`, `$conditionOutputs`, etc. Blip's proprietary portal converts between them; behavior here comes from comparing both formats. `$enteringCustomActions` followed by `$contentActions` actions become `inputActions` (before block content); the `input` item becomes `input`; `$leavingCustomActions`, `$afterStateChangedActions`, and `$localCustomActions` map to their matching action arrays; ordered `$conditionOutputs` followed by unconditional `$defaultOutput` become `outputs`; `$title` becomes `name`, while `$position` and `$tags` remain extension data; global entering/leaving actions become flow-global actions. Unsupported content is reported by type, and original editor state is retained in `bloco.conteudo` (see `api`).
 */

import { COMPARISONS, FONTES } from './condition.js';
import type { ConditionBlip } from './condition.js';
import { SOURCES_OF_VARIABLE, FONTES_SUPORTADAS } from './context.js';
import type { VariableSource } from './context.js';
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

/** Editor exports store `flow` as a STATE MAP rather than `states[]`. */
export function ehExportDoEditor(json: unknown): json is ExportDoEditor {
  const flow = (json as { flow?: unknown } | null)?.flow;
  return (
    !!flow &&
    typeof flow === 'object' &&
    !Array.isArray((flow as { states?: unknown }).states) &&
    Object.values(flow).some((e) => !!e && typeof e === 'object' && '$contentActions' in e)
  );
}

/** Remove editor-only keys (`$id`, `$invalid`, `$cardContent`, etc.) while retaining model keys. */
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

function convertState(e: EditorState): State {
  const conteudo = e.$contentActions ?? [];
  const editorInbound = conteudo.find((c) => c.input)?.input;
  // An exit without a destination does not become a transition: Blip Builder stores it in
  // a newly created attendance block (the "Saídas de atendimento" have no destination
  // block yet) or in a draft where the user has not selected "Direcionar para
  // bloco". The engine would never take it; the UI flags the missing destination.
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

/** Convert editor export to published format; importer supplies the flow `id`. */
export function converterDoEditor(exportado: ExportDoEditor, id: string): FlowBlip {
  const global = exportado.globalActions ?? {};
  return {
    id,
    states: Object.values(exportado.flow).map(convertState),
    inputActions: (global.$enteringCustomActions ?? []).map(converterAcao),
    outputActions: (global.$leavingCustomActions ?? []).map(converterAcao),
    afterStateChangedActions: (global.$afterStateChangedActions ?? []).map(converterAcao),
  };
}

/**
 * Read any Blip flow format: editor export, published `applicationJson` (`{ settings: { flow } }`), `{ flow: { states } }`, or direct `Flow`. Published format passes through unchanged because the engine reads Blip natively.
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

/** Content types currently sent by Pipe channels; typing passes through without effect. */
export const CONTEUDOS_SUPORTADOS = new Set([
  'text/plain',
  'application/vnd.lime.select+json',
  'application/vnd.lime.media-link+json',
  'application/vnd.lime.chatstate+json',
  'application/vnd.lime.input+json',
  'application/vnd.lime.location+json',
  'application/vnd.lime.web-link+json',
]);
export const CONTEUDOS_SEM_EFEITO = new Set(['application/vnd.lime.chatstate+json']);
/** Actions that execute without effect in Pipe, listed explicitly so they do not appear functional. */
export const ACTIONS_WITHOUT_EFFECT = new Set(['LeavingFromDesk']);

const MB = 1024 * 1024;

/** `media-link` category the reference does not carry as a separate field: it is inferred from the file's real MIME (`content.type`), the same way Blip does not distinguish "Figurinha" from other `media-link` beyond that MIME (`ref/inventario-conteudo.md`, seção Figurinha). */
type CategoriaDeMidia = 'imagem' | 'audio' | 'video' | 'documento';

/** MIME accepted per media category, sourced from the frozen inventory (`ref/inventario-conteudo.md`). Images have no documented ceiling. */
const MEDIA_FORMATS: Readonly<Record<CategoriaDeMidia, readonly string[]>> = {
  imagem: [
    'image/gif',
    'image/jpeg',
    'image/jpg',
    'image/jfif',
    'image/png',
    'image/svg+xml',
    'image/tiff',
    'image/vnd.dwg',
    'image/webp',
  ],
  audio: [
    'audio/aac',
    'audio/midi',
    'audio/mp3',
    'audio/mp4',
    'audio/mpeg',
    'audio/wav',
    'audio/ogg',
    'audio/wma',
    'audio/webm',
    'audio/opus',
    'audio/x-aac',
    'audio/amr',
  ],
  video: [
    'video/3gpp',
    'video/avi',
    'video/mpeg',
    'video/mpg',
    'video/mp4',
    'video/mov',
    'video/quicktime',
    'video/m4v',
    'video/wmv',
    'video/webm',
  ],
  documento: [
    'application/pdf',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/vnd.ms-outlook',
    'application/zip',
    'application/vnd.rar',
    'application/x-rar-compressed',
    'text/csv',
    'text/html',
    'text/plain',
  ],
};

/** Byte ceiling per media category (Blip-documented: 16 MB audio/video, 100 MB document); image has none. */
const MEDIA_MAX_BYTES: Readonly<Partial<Record<CategoriaDeMidia, number>>> = {
  audio: 16 * MB,
  video: 16 * MB,
  documento: 100 * MB,
};

function categoryOfMedia(mime: string): CategoriaDeMidia | null {
  const m = mime.toLowerCase();
  if (m.startsWith('image/')) return 'imagem';
  if (m.startsWith('audio/')) return 'audio';
  if (m.startsWith('video/')) return 'video';
  return m ? 'documento' : null;
}

function toMegabytes(bytes: number): string {
  return (bytes / MB).toFixed(1).replace('.', ',');
}

function tentarParse(v: string): unknown {
  try {
    return JSON.parse(v);
  } catch {
    return null;
  }
}

/**
 * Validate `SendMessage` settings for content types the engine enforces beyond the whitelist — today only `media-link` (the figurinha/áudio/imagem/vídeo/documento slot, `ref/inventario-conteudo.md`): `uri` is required, and when the file's real MIME/size are declared, they must respect the frozen inventory's per-category format list and byte ceiling. Sticker has no separate entry: it validates as `imagem` when its declared MIME says so (the reference does not distinguish it beyond MIME either).
 */
export function engineContentErrors(tipo: string, settings: unknown): string[] {
  const mime = tipo.toLowerCase();
  const bruto = (settings as { content?: unknown } | null | undefined)?.content;
  const content = (typeof bruto === 'string' ? tentarParse(bruto) : bruto) as Record<
    string,
    unknown
  > | null;
  if (mime === 'application/vnd.lime.web-link+json') {
    const uri = content && typeof content['uri'] === 'string' ? content['uri'].trim() : '';
    if (!uri) return ["O campo 'uri' é obrigatório no web link."];
    return /^https:\/\//i.test(uri) ? [] : ['A URL do web link deve usar https.'];
  }
  if (mime === 'application/vnd.lime.location+json') {
    const latitude = content?.['latitude'];
    const longitude = content?.['longitude'];
    if (typeof latitude !== 'number' || !Number.isFinite(latitude)) return ["O campo 'latitude' é obrigatório na localização."];
    if (typeof longitude !== 'number' || !Number.isFinite(longitude)) return ["O campo 'longitude' é obrigatório na localização."];
    if (latitude < -90 || latitude > 90) return ['A latitude deve estar entre -90 e 90.'];
    if (longitude < -180 || longitude > 180) return ['A longitude deve estar entre -180 e 180.'];
    return [];
  }
  if (mime !== 'application/vnd.lime.media-link+json') return [];
  const uri = content && typeof content['uri'] === 'string' ? content['uri'].trim() : '';
  if (!uri) return ["O campo 'uri' é obrigatório no conteúdo de mídia."];

  const mimeReal = content && typeof content['type'] === 'string' ? content['type'] : '';
  const categoria = mimeReal ? categoryOfMedia(mimeReal) : null;
  if (!categoria) return [];

  const errors: string[] = [];
  const aceitos = MEDIA_FORMATS[categoria];
  if (!aceitos.includes(mimeReal.toLowerCase())) {
    errors.push(`Formato ${mimeReal} não é aceito para ${categoria}. Aceitos: ${aceitos.join(', ')}.`);
  }
  const teto = MEDIA_MAX_BYTES[categoria];
  const size = content && typeof content['size'] === 'number' ? content['size'] : undefined;
  if (teto !== undefined && size !== undefined && size > teto) {
    errors.push(
      `Arquivo de ${toMegabytes(size)} MB passa do limite de ${toMegabytes(teto)} MB para ${categoria}.`,
    );
  }
  return errors;
}

export interface ImportReport {
  estados: number;
  saidas: number;

  actions: Record<string, number>;
  /** Action types Pipe cannot execute; the engine throws at runtime. */
  naoSuportado: Record<string, number>;
  /** Action types that execute without effect in Pipe. */
  semEfeito: Record<string, number>;
}

const somar = (mapa: Record<string, number>, key: string): void => {
  mapa[key] = (mapa[key] ?? 0) + 1;
};

const texto = (v: unknown): string => (typeof v === 'string' ? v : String(v));

/** Report what Pipe can and cannot execute from a flow, using type names and counts only. */
export function importReport(flow: FlowBlip): ImportReport {
  const r: ImportReport = {
    estados: flow.states.length,
    saidas: 0,
    actions: {},
    naoSuportado: {},
    semEfeito: {},
  };

  const viewConditions = (conditions: ConditionBlip[] | null | undefined): void => {
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
    viewConditions(a.conditions);
    if (!PROVEDOR_PADRAO.has(a.type)) return somar(r.naoSuportado, `acao:${a.type}`);
    if (ACTIONS_WITHOUT_EFFECT.has(a.type)) somar(r.semEfeito, `acao:${a.type}`);
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
    // Local actions run only through the Builder agent (`ProcessCommandInputAsync`), not normal conversation processing.
    for (const a of e.localCustomActions ?? []) {
      somar(r.actions, a.type);
      somar(r.semEfeito, `acao-local:${a.type}`);
    }
    if (e.input?.expiration) somar(r.naoSuportado, 'entrada:expiracao');
    viewConditions(e.input?.conditions);
    for (const s of e.outputs ?? []) {
      r.saidas += 1;
      viewConditions(s.conditions);
    }
  }

  // Variable sources lacking a Pipe provider, such as `{{calendar.x}}` and `{{resource.x}}`.
  for (const m of JSON.stringify(flow).matchAll(/{{([a-zA-Z0-9.@_-]+)}}/g)) {
    const nome = m[1]!.split('@')[0]!;
    if (!nome.includes('.')) continue;
    const fonte = nome.split('.')[0]!.toLowerCase();
    const conhecida = SOURCES_OF_VARIABLE.includes(fonte as VariableSource);
    if (!conhecida || !FONTES_SUPORTADAS.has(fonte as VariableSource))
      somar(r.naoSuportado, `variavel:${fonte}`);
  }

  return r;
}
