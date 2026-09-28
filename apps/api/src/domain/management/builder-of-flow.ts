import { sql } from 'drizzle-orm';
import {
  ACTIONS_GLOBAL_DEFAULT,
  FLOW_DEFAULT,
  converterDoEditor,
  flowErrors,
  contextEhVariable,
  importReport,
} from '@pipe/core';
import type { State, ExportDoEditor, FlowBlip, Saida } from '@pipe/core';
import { registrarAuditoria } from '@pipe/db';
import type { Ator, TransactionPipe } from '@pipe/db';
import type {
  BuilderOfFlow,
  DesenhoDoBuilder,
  BlockError,
  StateOfVersion,
  RascunhoGravado,
  VersionOfFlow,
  VersaoPublicada,
} from '@pipe/contracts';
import { PipeError } from '../../errors.js';
import { requirePermission } from '../../session.js';
import { loadFlow, classifyState } from '../flow.js';
import { EDIT_FLOW } from './cycle-of-lifetime-of-flow.js';
import { requirePermissionInFlow } from './team-of-flow.js';

/**
 * Builder lifecycle per flow: edit, save draft, publish. Blip stores the working drawing in `blip_portal:builder_working_flow` and publishes into the running Application. Here draft and published are `fluxo_versao` rows of the SAME flow. Save overwrites the one draft per flow, replacing blocks and transitions without incrementing its version; older `importarFluxoDaBlip` saves created numbered drafts each time. Publish promotes the draft to `publicada`, archives the prior published row, assigns the next version number, and sets `fluxo.estado` to `publicado` for `fluxoPublicadoDoCanal`. Published drawings stay immutable: `execucao_fluxo.fluxo_versao_id` restricts deletion and `execucao_passo.bloco_id` depends on that version's blocks. Editing a published flow starts a new draft; restoring copies an old drawing into a draft without changing its historical version. The engine loads `bloco` and `transicao` through `carregarFluxo`; the editor reads `bloco.conteudo.original` and `fluxo_versao.global.editor`. If `original` is absent, `estadoParaOEditor` reconstructs it. Viewing and saving require `automacao.fluxo.editar`; publishing requires `automacao.fluxo.publicar` (migration 0034). Routers have no Builder and return 409. Publishing does not archive another flow on the same channel; channel binding chooses the serving flow, and archiving requires an explicit deletion gesture.
 */

export const PUBLISH_FLOW = 'automacao.fluxo.publicar';

const ator = (usuarioId: string): Ator => ({ type: 'usuario', id: usuarioId });

/* ------------------------------------------------------------- O fluxo */

/**
 * Find this account's live flow with Builder, or return 404, 403, then 409 in that order. A flow outside the account must not reveal its existence before permission checks, and only an authorized user learns that a router has no editor.
 */
async function flowOfBuilder(
  tx: TransactionPipe,
  tid: string,
  usuarioId: string,
  id: string,
  permission: string,
): Promise<{ id: string; name: string; state: string }> {
  const { rows } = await tx.execute<{ id: string; name: string; type: string; state: string }>(sql`
    select id, nome as "name", tipo as "type", estado as "state" from fluxo
     where tenant_id = ${tid} and id = ${id} and estado <> 'arquivado'
     limit 1
  `);
  const atual = rows[0];
  if (!atual) throw PipeError.naoEncontrado('fluxo');
  // Editing the drawing requires the FLOW permission `builder.escrever` on the Team tab, or the
  // account-wide equivalent: the dual gate in `equipe-do-fluxo.ts`. Publishing remains
  // an account permission because the source has no per-bot publish row.
  if (permission === EDIT_FLOW) await requirePermissionInFlow(tx, usuarioId, id, 'builder.escrever');
  else await requirePermission(tx, usuarioId, permission);
  if (atual.type === 'roteador') {
    throw PipeError.conflito(
      'router_without_builder',
      'Roteador não tem Builder: ele só distribui a conversa entre os serviços. Edite o desenho no fluxo de cada serviço.',
    );
  }
  return atual;
}



type LinhaVersao = {
  id: string;
  version: number;
  state: StateOfVersion;
  blocks: number;
  publicada_em: Date | string | null;
  publishedByName: string | null;
  createdAt: Date | string | null;
  atualizado_em: Date | string | null;
};

const COLUNAS_DA_VERSAO = sql`
  v.id, v.versao as "version", v.estado as "state", v.publicada_em, v.criado_em as "createdAt", v.atualizado_em,
  u.nome as "publishedByName",
  (select count(*)::int from bloco b where b.versao_id = v.id) as "blocks"
`;
const DE_VERSAO = sql`from fluxo_versao v left join usuario u on u.id = v.publicada_por`;

const instante = (value: Date | string | null): string | null =>
  value === null ? null : new Date(value).toISOString();

const comoVersao = (l: LinhaVersao): VersionOfFlow => ({
  id: l.id,
  versao: Number(l.version),
  estado: l.state,
  blocos: Number(l.blocks),
  publicadaEm: instante(l.publicada_em),
  publishedBy: l.publishedByName,
  criadoEm: instante(l.createdAt),
  atualizadoEm: instante(l.atualizado_em),
});

async function versaoLida(tx: TransactionPipe, versaoId: string): Promise<VersionOfFlow> {
  const { rows } = await tx.execute<LinhaVersao>(
    sql`select ${COLUNAS_DA_VERSAO} ${DE_VERSAO} where v.id = ${versaoId} limit 1`,
  );
  const linha = rows[0];
  if (!linha) throw PipeError.naoEncontrado('versão');
  return comoVersao(linha);
}


async function versionInState(
  tx: TransactionPipe,
  flowId: string,
  state: StateOfVersion,
): Promise<VersionOfFlow | null> {
  const { rows } = await tx.execute<LinhaVersao>(sql`
    select ${COLUNAS_DA_VERSAO} ${DE_VERSAO}
     where v.fluxo_id = ${flowId} and v.estado = ${state}
     order by v.versao desc
     limit 1
  `);
  return rows[0] ? comoVersao(rows[0]) : null;
}

/* ------------------------------------------------------------ O desenho */

type LineBlock = { id: string; code: string; content: Record<string, unknown> };
type LineTransition = {
  ofBlockId: string;
  para_codigo: string | null;
  forVariable: string | null;
  condition: { conditions?: unknown } | null;
  order: number;
};

/**
 * Convert engine state back to the editor format, the inverse of `converterEstado` in `@pipe/core`'s `editor.ts`, for blocks without `original`. Restore only stored position and title; the screen redraws `$cardContent` itself.
 */
function stateForOEditor(
  codigo: string,
  conteudo: Record<string, unknown>,
  saidas: Saida[],
): Record<string, unknown> {
  const {
    inputActions,
    input,
    outputActions,
    afterStateChangedActions,
    localCustomActions,
    name,
    $position,
    $tags,
    root,
    ...extensao
  } = conteudo as Partial<State> & { name?: unknown; $position?: unknown; $tags?: unknown };
  const conditionals = saidas.filter((s) => s.conditions?.length);
  const padrao = saidas.find((s) => !s.conditions?.length);
  return {
    ...extensao,
    id: codigo,
    ...(root ? { root: true } : {}),
    $title: typeof name === 'string' ? name : codigo,
    $position: $position ?? {},
    $tags: Array.isArray($tags) ? $tags : [],
    $enteringCustomActions: [],
    $contentActions: [
      ...(inputActions ?? []).map((action) => ({ action })),
      ...(input ? [{ input }] : []),
    ],
    $leavingCustomActions: outputActions ?? [],
    $afterStateChangedActions: afterStateChangedActions ?? [],
    ...(localCustomActions?.length ? { $localCustomActions: localCustomActions } : {}),
    $conditionOutputs: conditionals.map((s) => ({ stateId: s.stateId, conditions: s.conditions })),
    $defaultOutput: padrao ? { stateId: padrao.stateId } : null,
  };
}

/** Use the editor's saved drawing when available; otherwise reconstruct it from engine state. */
async function desenhoDaVersao(tx: TransactionPipe, versaoId: string): Promise<DesenhoDoBuilder> {
  const { rows: versions } = await tx.execute<{ global: Record<string, unknown> }>(
    sql`select global from fluxo_versao where id = ${versaoId}`,
  );
  const { rows: blocos } = await tx.execute<LineBlock>(
    sql`select id, codigo as "code", conteudo as "content" from bloco where versao_id = ${versaoId} order by codigo`,
  );
  const { rows: transitions } = await tx.execute<LineTransition>(sql`
    select t.de_bloco_id as "ofBlockId", b.codigo as para_codigo, t.para_variavel as "forVariable",
           t.condicao as "condition", t.ordem as "order"
      from transicao t
      left join bloco b on b.id = t.para_bloco_id
     where t.versao_id = ${versaoId}
     order by t.ordem
  `);
  const saidas = new Map<string, Saida[]>();
  for (const t of transitions) {
    const conditions = t.condition?.conditions;
    const lista = saidas.get(t.ofBlockId) ?? [];
    lista.push({
      order: t.order,
      stateId: t.para_codigo ?? t.forVariable ?? '',
      ...(Array.isArray(conditions) ? { conditions: conditions } : {}),
    });
    saidas.set(t.ofBlockId, lista);
  }

  const flow: Record<string, unknown> = {};
  for (const block of blocos) {
    const original = block.content?.['original'];
    flow[block.code] =
      original && typeof original === 'object'
        ? original
        : stateForOEditor(block.code, block.content ?? {}, saidas.get(block.id) ?? []);
  }

  const global = versions[0]?.global ?? {};
  const editor = global['editor'];
  const globals =
    editor && typeof editor === 'object'
      ? (editor as Record<string, unknown>)
      : {
          ...ACTIONS_GLOBAL_DEFAULT,
          $enteringCustomActions: global['inputActions'] ?? [],
          $leavingCustomActions: global['outputActions'] ?? [],
          $afterStateChangedActions: global['afterStateChangedActions'] ?? [],
        };
  const configuration = ehObjeto(global['configuration'])
    ? (global['configuration'] as Record<string, string>)
    : {};
  return { flow, globals, configuration };
}

const DESENHO_PADRAO: DesenhoDoBuilder = { flow: FLOW_DEFAULT, globals: ACTIONS_GLOBAL_DEFAULT };



interface Compilado {
  flow: FlowBlip;
  desenho: DesenhoDoBuilder;
  errors: BlockError[];
  notSupported: Record<string, number>;
}

const ehObjeto = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v);

/** A user key is `[a-zA-Z0-9]+` (Blip's own rule, `ref/FIDELIDADE-F1-F6.md`); `builder:*` is the platform's own reserved namespace. */
const CONFIG_KEY_USER = /^[a-zA-Z0-9]+$/;
const CONFIG_KEY_BUILDER = /^builder:/;

/**
 * Validate the `configuration` map from the request body: absent stays absent (old drafts keep saving without it), otherwise every value must be text and every key must be a plain user key or a `builder:*` platform key — anything else is `design_invalid`, not silently dropped (unlike `converterDoEditor`'s defensive sanitizing).
 */
function validatedConfiguration(bruto: unknown): Record<string, string> | undefined {
  if (bruto === undefined) return undefined;
  if (!ehObjeto(bruto)) {
    throw PipeError.request(
      'design_invalid',
      'O campo `configuration` precisa ser um objeto de texto por chave.',
    );
  }
  const saida: Record<string, string> = {};
  for (const [chave, valor] of Object.entries(bruto)) {
    if (typeof valor !== 'string') {
      throw PipeError.request(
        'design_invalid',
        `A chave de configuração '${chave}' precisa ter um valor de texto.`,
      );
    }
    if (!CONFIG_KEY_USER.test(chave) && !CONFIG_KEY_BUILDER.test(chave)) {
      throw PipeError.request(
        'design_invalid',
        `A chave de configuração '${chave}' só pode ter letras e números, ou o prefixo 'builder:'.`,
      );
    }
    saida[chave] = valor;
  }
  return saida;
}

/**
 * Convert the editor drawing to engine format and report engine errors. External JSON must be an object of objects; a state without `id` uses its map key, as in Blip's editor.
 */
function compilar(desenho: unknown, fluxoId: string): Compilado {
  const bruto = ehObjeto(desenho) ? desenho : {};
  const mapa = bruto['flow'];
  if (!ehObjeto(mapa) || Object.values(mapa).some((e) => !ehObjeto(e))) {
    throw PipeError.request(
      'design_invalid',
      'O desenho precisa ser o mapa de blocos do editor: um objeto com um bloco por chave.',
    );
  }
  const fluxo: Record<string, unknown> = {};
  for (const [codigo, estado] of Object.entries(mapa)) {
    const e = estado as Record<string, unknown>;
    fluxo[codigo] = typeof e['id'] === 'string' && e['id'] ? e : { ...e, id: codigo };
  }
  const globais = ehObjeto(bruto['globals']) ? bruto['globals'] : { ...ACTIONS_GLOBAL_DEFAULT };
  const configuration = validatedConfiguration(bruto['configuration']);

  let compilado: FlowBlip;
  try {
    compilado = converterDoEditor(
      { flow: fluxo, globalActions: globais, configuration } as unknown as ExportDoEditor,
      fluxoId,
    );
  } catch (error) {
    // If `$contentActions` is not a list or an output is not an object,
    // the drawing is invalid; the converter error is not a server fault.
    throw PipeError.request(
      'design_invalid',
      `O desenho não está no formato do editor: ${(error as Error).message}`,
    );
  }
  return {
    flow: compilado,
    desenho: { flow: fluxo, globals: globais, configuration: configuration ?? {} },
    errors: flowErrors(compilado).map((e) => ({ block: e.stateId, mensagem: e.message })),
    notSupported: importReport(compilado).naoSuportado,
  };
}

/** Fields belonging to `Flow` rather than a state, plus saved global editor actions. */
function globalDe(compilado: Compilado): string {
  const global: Record<string, unknown> = { ...compilado.flow };
  delete global['states'];
  delete global['id'];
  global['editor'] = compilado.desenho.globals;
  return JSON.stringify(global);
}

/** Rebuild a version's blocks and transitions from scratch, as `importarFluxoDaBlip` does. */
async function gravarBlocos(
  tx: TransactionPipe,
  tid: string,
  versaoId: string,
  compilado: Compilado,
): Promise<void> {
  await tx.execute(sql`delete from bloco where versao_id = ${versaoId}`);

  const blockByCode = new Map<string, string>();
  for (const estado of compilado.flow.states) {
    const codigo = estado.id;
    const conteudo: Record<string, unknown> = { ...estado };
    delete conteudo['id'];
    delete conteudo['outputs'];
    const original = compilado.desenho.flow[codigo];
    const nome =
      typeof estado['name'] === 'string' && estado['name'].trim() ? estado['name'] : codigo;
    const { rows } = await tx.execute<{ id: string }>(sql`
      insert into bloco (tenant_id, versao_id, codigo, nome, tipo, conteudo, posicao)
      values (
        ${tid}, ${versaoId}, ${codigo}, ${nome}, ${classifyState(estado)},
        ${JSON.stringify(original ? { ...conteudo, original } : conteudo)}::jsonb,
        ${JSON.stringify(estado['$position'] ?? {})}::jsonb
      )
      returning id
    `);
    blockByCode.set(codigo, rows[0]!.id);
  }

  for (const estado of compilado.flow.states) {
    for (const [i, saida] of (estado.outputs ?? []).entries()) {
      const variable = contextEhVariable(saida.stateId) ? saida.stateId : null;
      const para = variable ? null : (blockByCode.get(saida.stateId) ?? null);
      // A nonexistent destination remains only in the drawing (`original`) and error list.
      if (!variable && !para) continue;
      await tx.execute(sql`
        insert into transicao (tenant_id, versao_id, de_bloco_id, para_bloco_id, para_variavel, condicao, ordem)
        values (
          ${tid}, ${versaoId}, ${blockByCode.get(estado.id)!}, ${para}, ${variable},
          ${JSON.stringify(saida.conditions ? { conditions: saida.conditions } : {})}::jsonb, ${saida.order ?? i}
        )
      `);
    }
  }
}

/**
 * Write the drawing over the flow's existing draft or into a new version after the greatest version number. Callers already check permission; `restaurarVersao` also passes an older version's drawing here.
 */
async function gravarRascunho(
  tx: TransactionPipe,
  tid: string,
  userId: string,
  fluxoId: string,
  compilado: Compilado,
  extraNoLog: Record<string, unknown> = {},
): Promise<RascunhoGravado> {
  const anterior = await versionInState(tx, fluxoId, 'rascunho');
  let versaoId: string;
  if (anterior) {
    versaoId = anterior.id;
    await tx.execute(sql`
      update fluxo_versao set global = ${globalDe(compilado)}::jsonb, atualizado_em = now()
       where id = ${versaoId}
    `);
  } else {
    const { rows } = await tx.execute<{ id: string }>(sql`
      insert into fluxo_versao (tenant_id, fluxo_id, versao, estado, global)
      values (
        ${tid}, ${fluxoId},
        (select coalesce(max(versao), 0) + 1 from fluxo_versao where fluxo_id = ${fluxoId}),
        'rascunho', ${globalDe(compilado)}::jsonb
      )
      returning id
    `);
    versaoId = rows[0]!.id;
  }
  await gravarBlocos(tx, tid, versaoId, compilado);
  await tx.execute(sql`update fluxo set atualizado_em = now() where id = ${fluxoId}`);

  const versao = await versaoLida(tx, versaoId);
  await registrarAuditoria(tx, tid, {
    ator: ator(userId),
    acao: anterior ? 'alterou' : 'criou',
    objetoTipo: 'fluxo_versao',
    objetoId: versaoId,
    antes: anterior ? { blocos: anterior.blocos } : null,
    depois: {
      fluxoId,
      versao: versao.versao,
      estado: 'rascunho',
      blocos: versao.blocos,
      erros: compilado.errors.length,
      ...extraNoLog,
    },
  });
  return { versao, erros: compilado.errors, naoSuportado: compilado.notSupported };
}

/* -------------------------------------------------------------- Gestos */

/** Same 403/404/409 gate `carregarBuilder` applies, for callers that only need the permission check (the test panel's reset, D-14). */
export async function assertAccessToBuilder(
  tx: TransactionPipe,
  tid: string,
  usuarioId: string,
  fluxoId: string,
): Promise<void> {
  await flowOfBuilder(tx, tid, usuarioId, fluxoId, EDIT_FLOW);
}

/**
 * The draft (or published, or default) drawing compiled to engine format, with the same
 * rascunho ?? publicada ?? padrao precedence `carregarBuilder` reads — for callers that run the
 * engine over it instead of drawing the canvas (the test panel, D-14).
 */
export async function compiledDraftOfFlow(
  tx: TransactionPipe,
  tid: string,
  usuarioId: string,
  fluxoId: string,
): Promise<{ flow: FlowBlip; errors: BlockError[] }> {
  await assertAccessToBuilder(tx, tid, usuarioId, fluxoId);
  const publicada = await versionInState(tx, fluxoId, 'publicada');
  const rascunho = await versionInState(tx, fluxoId, 'rascunho');
  const carregada = rascunho ?? publicada;
  const desenho = carregada ? await desenhoDaVersao(tx, carregada.id) : DESENHO_PADRAO;
  const compilado = compilar(desenho, fluxoId);
  return { flow: compilado.flow, errors: compilado.errors };
}

/** Builder opens the draft, otherwise the published version, otherwise the default flow. */
export async function carregarBuilder(
  tx: TransactionPipe,
  tid: string,
  usuarioId: string,
  fluxoId: string,
): Promise<BuilderOfFlow> {
  await flowOfBuilder(tx, tid, usuarioId, fluxoId, EDIT_FLOW);
  const publicada = await versionInState(tx, fluxoId, 'publicada');
  const rascunho = await versionInState(tx, fluxoId, 'rascunho');
  const carregada = rascunho ?? publicada;
  const desenho = carregada ? await desenhoDaVersao(tx, carregada.id) : DESENHO_PADRAO;
  const compilado = compilar(desenho, fluxoId);
  return {
    flowId: fluxoId,
    origem: rascunho ? 'rascunho' : publicada ? 'publicada' : 'padrao',
    versao: carregada,
    publicada,
    desenho: compilado.desenho,
    errors: compilado.errors,
    naoSuportado: compilado.notSupported,
  };
}

/** Builder save persists even an invalid drawing and returns what the engine would reject. */
export async function salvarRascunho(
  tx: TransactionPipe,
  tid: string,
  usuarioId: string,
  fluxoId: string,
  desenho: unknown,
): Promise<RascunhoGravado> {
  await flowOfBuilder(tx, tid, usuarioId, fluxoId, EDIT_FLOW);
  const compilado = compilar(desenho, fluxoId);
  return gravarRascunho(tx, tid, usuarioId, fluxoId, compilado);
}

/**
 * Publish promotes the draft only if valid; `detalhe` of the 409 lists errors by block for the screen.
 */
export async function publicarRascunho(
  tx: TransactionPipe,
  tid: string,
  usuarioId: string,
  fluxoId: string,
): Promise<VersaoPublicada> {
  const atual = await flowOfBuilder(tx, tid, usuarioId, fluxoId, PUBLISH_FLOW);
  const rascunho = await versionInState(tx, fluxoId, 'rascunho');
  if (!rascunho) {
    throw PipeError.conflito(
      'without_draft',
      'Não há rascunho para publicar: salve o desenho antes de publicar.',
    );
  }

  // Both validations must pass: the DRAWING visible to the user, where
  // an output can target a missing block that `gravarBlocos` never stores, and
  // the stored `bloco`/`transicao` reconstructed as the engine will see them.
  const errors: BlockError[] = compilar(await desenhoDaVersao(tx, rascunho.id), fluxoId).errors;
  const { flow } = await loadFlow(tx, { flowId: fluxoId, versaoId: rascunho.id });
  for (const e of flowErrors(flow)) {
    if (!errors.some((x) => x.block === e.stateId && x.mensagem === e.message)) {
      errors.push({ block: e.stateId, mensagem: e.message });
    }
  }
  if (errors.length > 0) {
    throw PipeError.conflito(
      'flow_invalid',
      `O fluxo não pode ser publicado: ${errors[0]!.mensagem}`,
      { errors },
    );
  }

  const anterior = await versionInState(tx, fluxoId, 'publicada');
  const { rows: maior } = await tx.execute<{ version: number }>(sql`
    select coalesce(max(versao), 0) as "version" from fluxo_versao
     where fluxo_id = ${fluxoId} and id <> ${rascunho.id}
  `);
  const numero = Math.max(rascunho.versao, Number(maior[0]?.version ?? 0) + 1);

  await tx.execute(sql`
    update fluxo_versao set estado = 'arquivada', atualizado_em = now()
     where fluxo_id = ${fluxoId} and estado = 'publicada'
  `);
  await tx.execute(sql`
    update fluxo_versao
       set estado = 'publicada', versao = ${numero}, publicada_em = now(),
           publicada_por = ${usuarioId}::uuid, atualizado_em = now()
     where id = ${rascunho.id}
  `);
  await tx.execute(sql`
    update fluxo set estado = 'publicado', atualizado_em = now() where id = ${fluxoId}
  `);

  const versao = await versaoLida(tx, rascunho.id);
  await registrarAuditoria(tx, tid, {
    ator: ator(usuarioId),
    acao: 'ativou',
    objetoTipo: 'fluxo_versao',
    objetoId: rascunho.id,
    antes: { estado: 'rascunho', versao: rascunho.versao, publicadaAntes: anterior?.versao ?? null },
    depois: { estado: 'publicada', versao: versao.versao, fluxoId, blocos: versao.blocos },
  });
  if (atual.state !== 'publicado') {
    await registrarAuditoria(tx, tid, {
      ator: ator(usuarioId),
      acao: 'ativou',
      objetoTipo: 'fluxo',
      objetoId: fluxoId,
      antes: { estado: atual.state },
      depois: { estado: 'publicado', versao: versao.versao },
    });
  }
  return {
    versao,
    arquivada: anterior ? { ...anterior, estado: 'arquivada' } : null,
  };
}


export async function listVersions(
  tx: TransactionPipe,
  tid: string,
  usuarioId: string,
  fluxoId: string,
): Promise<VersionOfFlow[]> {
  await flowOfBuilder(tx, tid, usuarioId, fluxoId, EDIT_FLOW);
  const { rows } = await tx.execute<LinhaVersao>(sql`
    select ${COLUNAS_DA_VERSAO} ${DE_VERSAO}
     where v.fluxo_id = ${fluxoId}
     order by v.versao desc
  `);
  return rows.map(comoVersao);
}

/** Resolve a version number to its `fluxo_versao` id, or 404 when it doesn't exist. */
async function versionIdOfNumber(
  tx: TransactionPipe,
  fluxoId: string,
  numero: number,
): Promise<string> {
  if (!Number.isInteger(numero) || numero < 1) throw PipeError.naoEncontrado('versão');
  const { rows } = await tx.execute<{ id: string }>(sql`
    select id from fluxo_versao where fluxo_id = ${fluxoId} and versao = ${numero} limit 1
  `);
  const linha = rows[0];
  if (!linha) throw PipeError.naoEncontrado('versão');
  return linha.id;
}

/** Copy an old version into the draft; the published version remains live until another publish. */
export async function restoreVersion(
  tx: TransactionPipe,
  tid: string,
  usuarioId: string,
  fluxoId: string,
  numero: number,
): Promise<RascunhoGravado> {
  await flowOfBuilder(tx, tid, usuarioId, fluxoId, EDIT_FLOW);
  const versaoId = await versionIdOfNumber(tx, fluxoId, numero);
  const desenho = await desenhoDaVersao(tx, versaoId);
  const compilado = compilar(desenho, fluxoId);
  return gravarRascunho(tx, tid, usuarioId, fluxoId, compilado, { restauradaDe: numero });
}

/**
 * The drawing of a past version, in the same `{flow, globals}` shape `carregarBuilder` returns — used to export an old
 * version without a second serializer. Read-only: unlike `restoreVersion`, nothing is written.
 */
export async function loadVersionDrawing(
  tx: TransactionPipe,
  tid: string,
  usuarioId: string,
  fluxoId: string,
  numero: number,
): Promise<DesenhoDoBuilder> {
  await flowOfBuilder(tx, tid, usuarioId, fluxoId, EDIT_FLOW);
  const versaoId = await versionIdOfNumber(tx, fluxoId, numero);
  const desenho = await desenhoDaVersao(tx, versaoId);
  return compilar(desenho, fluxoId).desenho;
}
