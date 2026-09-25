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
import { PipeError } from '../../erros.js';
import { exigirPermission } from '../../sessao.js';
import { loadFlow, classificarState } from '../fluxo.js';
import { EDITAR_FLOW } from './ciclo-de-vida-do-fluxo.js';
import { exigirPermissionInFlow } from './equipe-do-fluxo.js';

/**
 * O ciclo EDITAR → SALVAR RASCUNHO → PUBLICAR do Builder, POR FLUXO.
 *
 * É o que a Blip faz com dois baldes e um botão: o desenho em edição vive em
 * `blip_portal:builder_working_flow` (mais as ações globais no balde irmão), e
 * "Publicar" compila o desenho para dentro da Application, que é o que o bot
 * roda. Aqui os dois lados são linhas de `fluxo_versao` do MESMO fluxo:
 *
 * - **um rascunho por fluxo** (`estado = 'rascunho'`), e o salvar grava POR
 *   CIMA dele — blocos e transições apagados e reescritos, o número da versão
 *   mantido. Antes disto cada salvar da ponte criava uma versão nova
 *   (`importarFluxoDaBlip`), e um cliente que salvava a cada tecla enchia a
 *   tabela de rascunhos numerados;
 * - **publicar é promover**: o rascunho vira `publicada`, a publicada anterior
 *   vira `arquivada`, o número é o seguinte ao maior que o fluxo já teve, e o
 *   `fluxo.estado` passa a `publicado` — que é o que `fluxoPublicadoDoCanal`
 *   procura. A partir daí o desenho é IMUTÁVEL: `execucao_fluxo.fluxo_versao_id`
 *   é `ON DELETE RESTRICT` porque conversa em andamento aponta para a versão
 *   que a atendeu, e o histórico de passos (`execucao_passo.bloco_id`) só faz
 *   sentido contra os blocos daquela versão. Quem quer mexer num fluxo
 *   publicado salva um rascunho novo e publica de novo;
 * - **restaurar** é copiar o desenho de uma versão antiga para o rascunho.
 *   Nunca reativa a versão antiga no lugar: o histórico dela fica intacto e a
 *   pessoa revisa antes de publicar.
 *
 * O motor lê a versão publicada remontada de `bloco` e `transicao`
 * (`carregarFluxo`); o editor lê o que ele mesmo desenhou, guardado em
 * `bloco.conteudo.original` e em `fluxo_versao.global.editor` — campos que o
 * motor ignora. Bloco gravado por outro caminho (a importação de um JSON já
 * publicado, por exemplo) não tem `original`: aí o estado do motor é
 * REMONTADO no formato do editor (`estadoParaOEditor`), para a tela abrir o
 * fluxo em vez de perdê-lo.
 *
 * Permissões: ver e salvar são de quem "cria e edita chatbots"
 * (`automacao.fluxo.editar`, como nas outras telas do contato); publicar é
 * `automacao.fluxo.publicar` (migração 0034), o gesto que muda o que o cliente
 * final recebe. Roteador não tem Builder — ele só distribui a conversa entre os
 * serviços (`servicos-do-roteador.ts`) — e todas as rotas respondem 409.
 *
 * O que NÃO se faz aqui: arquivar outro fluxo publicado no mesmo canal ("um bot
 * por número", que `importarFluxoDaBlip` faz). Arquivar um fluxo é o mesmo
 * gesto de excluí-lo (`ciclo-de-vida-do-fluxo.ts`), e publicar o fluxo B não
 * pode sumir com o fluxo A do portal sem ninguém pedir. Quem decide qual fluxo
 * atende o número é a ligação ao canal, não o botão de publicar.
 */

export const PUBLISH_FLOW = 'automacao.fluxo.publicar';

const ator = (usuarioId: string): Ator => ({ tipo: 'usuario', id: usuarioId });

/* ------------------------------------------------------------- O fluxo */

/**
 * O fluxo vivo desta conta que TEM Builder — ou 404, 403, 409, nesta ordem:
 * o que não existe para a conta não existe (antes de dizer que falta
 * permissão), e só quem pode entrar fica sabendo que roteador não tem editor.
 */
async function flowOfBuilder(
  tx: TransactionPipe,
  tid: string,
  usuarioId: string,
  id: string,
  permission: string,
): Promise<{ id: string; name: string; state: string }> {
  const { rows } = await tx.execute<{ id: string; name: string; type: string; state: string }>(sql`
    select id, nome, tipo, estado from fluxo
     where tenant_id = ${tid} and id = ${id} and estado <> 'arquivado'
     limit 1
  `);
  const atual = rows[0];
  if (!atual) throw PipeError.naoEncontrado('fluxo');
  // Editar o desenho é permissão DO FLUXO (`builder.escrever` na aba Equipe) ou a
  // equivalente na conta — o duplo portão de `equipe-do-fluxo.ts`. Publicar continua
  // sendo permissão de conta: a origem não tem linha de publicação no mapa por bot.
  if (permission === EDITAR_FLOW) await exigirPermissionInFlow(tx, usuarioId, id, 'builder.escrever');
  else await exigirPermission(tx, usuarioId, permission);
  if (atual.tipo === 'roteador') {
    throw PipeError.conflito(
      'router_without_builder',
      'Roteador não tem Builder: ele só distribui a conversa entre os serviços. Edite o desenho no fluxo de cada serviço.',
    );
  }
  return atual;
}

/* ----------------------------------------------------------- As versões */

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
  v.id, v.versao, v.estado, v.publicada_em, v.criado_em, v.atualizado_em,
  u.nome as publicada_por_nome,
  (select count(*)::int from bloco b where b.versao_id = v.id) as blocos
`;
const DE_VERSAO = sql`from fluxo_versao v left join usuario u on u.id = v.publicada_por`;

const instante = (value: Date | string | null): string | null =>
  value === null ? null : new Date(value).toISOString();

const comoVersao = (l: LinhaVersao): VersionOfFlow => ({
  id: l.id,
  versao: Number(l.versao),
  estado: l.state,
  blocos: Number(l.blocos),
  publicadaEm: instante(l.publicada_em),
  publishedBy: l.publishedByName,
  criadoEm: instante(l.criado_em),
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

/** A versão mais nova do fluxo naquele estado, ou nada. */
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
 * O estado do MOTOR de volta ao formato do editor — o inverso de
 * `converterEstado` (`@pipe/core`, `editor.ts`), para bloco sem `original`.
 * Só o que o motor guarda volta: posição e título se existirem, sem os
 * `$cardContent` que a tela redesenha sozinha.
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

/** O desenho de uma versão: o que o editor guardou, ou o do motor remontado. */
async function desenhoDaVersao(tx: TransactionPipe, versaoId: string): Promise<DesenhoDoBuilder> {
  const { rows: versions } = await tx.execute<{ global: Record<string, unknown> }>(
    sql`select global from fluxo_versao where id = ${versaoId}`,
  );
  const { rows: blocos } = await tx.execute<LineBlock>(
    sql`select id, codigo, conteudo from bloco where versao_id = ${versaoId} order by codigo`,
  );
  const { rows: transitions } = await tx.execute<LineTransition>(sql`
    select t.de_bloco_id, b.codigo as para_codigo, t.para_variavel, t.condicao, t.ordem
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
    const original = block.conteudo?.['original'];
    flow[block.codigo] =
      original && typeof original === 'object'
        ? original
        : stateForOEditor(block.codigo, block.conteudo ?? {}, saidas.get(block.id) ?? []);
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
  return { flow, globals };
}

const DESENHO_PADRAO: DesenhoDoBuilder = { flow: FLOW_DEFAULT, globals: ACTIONS_GLOBAL_DEFAULT };

/* ---------------------------------------------------------- Compilação */

interface Compilado {
  flow: FlowBlip;
  desenho: DesenhoDoBuilder;
  errors: BlockError[];
  notSupported: Record<string, number>;
}

const ehObjeto = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v);

/**
 * O desenho do editor no formato do motor, com o que o motor diria dele. JSON
 * é texto de fora: o mapa tem de ser objeto de objetos, e estado sem `id`
 * ganha a própria chave — é o que o editor da Blip faz ao criar o bloco.
 */
function compilar(desenho: unknown, fluxoId: string): Compilado {
  const bruto = ehObjeto(desenho) ? desenho : {};
  const mapa = bruto['fluxo'];
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
  const globais = ehObjeto(bruto['globais']) ? bruto['globais'] : { ...ACTIONS_GLOBAL_DEFAULT };

  let compilado: FlowBlip;
  try {
    compilado = converterDoEditor(
      { flow: fluxo, globalActions: globais } as unknown as ExportDoEditor,
      fluxoId,
    );
  } catch (error) {
    // Bloco com `$contentActions` que não é lista, saída que não é objeto: o
    // conversor tropeça, e a culpa é do desenho, não do servidor.
    throw PipeError.request(
      'design_invalid',
      `O desenho não está no formato do editor: ${(error as Error).message}`,
    );
  }
  return {
    flow: compilado,
    desenho: { flow, globals },
    errors: flowErrors(compilado).map((e) => ({ bloco: e.stateId, mensagem: e.message })),
    naoSuportado: importReport(compilado).naoSuportado,
  };
}

/** O que é do `Flow` e não de um estado, mais o que o editor guardou das ações globais. */
function globalDe(compilado: Compilado): string {
  const global: Record<string, unknown> = { ...compilado.flow };
  delete global['states'];
  delete global['id'];
  global['editor'] = compilado.desenho.globals;
  return JSON.stringify(global);
}

/** Blocos e transições de uma versão, do zero — o miolo de `importarFluxoDaBlip`. */
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
        ${tid}, ${versaoId}, ${codigo}, ${nome}, ${classificarState(estado)},
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
      // Destino que não existe fica só no desenho (`original`) e na lista de erros.
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
 * Grava o desenho no rascunho do fluxo — por cima do que havia, ou numa versão
 * nova numerada a seguir da maior. Sem conferir permissão: quem chama já
 * conferiu, e `restaurarVersao` passa por aqui com o desenho de outra versão.
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
  return { versao, erros: compilado.errors, naoSuportado: compilado.naoSuportado };
}

/* -------------------------------------------------------------- Gestos */

/** O que o Builder abre: o rascunho, senão a publicada, senão o fluxo padrão. */
export async function carregarBuilder(
  tx: TransactionPipe,
  tid: string,
  usuarioId: string,
  fluxoId: string,
): Promise<BuilderOfFlow> {
  await flowOfBuilder(tx, tid, usuarioId, fluxoId, EDITAR_FLOW);
  const publicada = await versionInState(tx, fluxoId, 'publicada');
  const rascunho = await versionInState(tx, fluxoId, 'rascunho');
  const carregada = rascunho ?? publicada;
  const desenho = carregada ? await desenhoDaVersao(tx, carregada.id) : DESENHO_PADRAO;
  const compilado = compilar(desenho, fluxoId);
  return {
    flowId,
    origem: rascunho ? 'rascunho' : publicada ? 'publicada' : 'padrao',
    versao: carregada,
    publicada,
    desenho: compilado.desenho,
    errors: compilado.errors,
    naoSuportado: compilado.naoSuportado,
  };
}

/** O "salvar" do Builder. Grava mesmo inválido — e devolve o que o motor recusaria. */
export async function salvarRascunho(
  tx: TransactionPipe,
  tid: string,
  usuarioId: string,
  fluxoId: string,
  desenho: unknown,
): Promise<RascunhoGravado> {
  await flowOfBuilder(tx, tid, usuarioId, fluxoId, EDITAR_FLOW);
  const compilado = compilar(desenho, fluxoId);
  return gravarRascunho(tx, tid, usuarioId, fluxoId, compilado);
}

/**
 * O "publicar": promove o rascunho. Inválido não passa — a lista de erros vai
 * no `detalhe` do 409, bloco a bloco, para a tela marcar.
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

  // Duas conferências, e as duas têm de passar: o DESENHO (o que a pessoa vê — é
  // onde mora a saída para um bloco que não existe, que `gravarBlocos` não grava)
  // e o que está em `bloco`/`transicao`, remontado como o motor vai remontar.
  const errors: BlockError[] = compilar(await desenhoDaVersao(tx, rascunho.id), fluxoId).errors;
  const { flow } = await loadFlow(tx, { flowId, versaoId: rascunho.id });
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
    select coalesce(max(versao), 0) as versao from fluxo_versao
     where fluxo_id = ${fluxoId} and id <> ${rascunho.id}
  `);
  const numero = Math.max(rascunho.versao, Number(maior[0]?.versao ?? 0) + 1);

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
  if (atual.estado !== 'publicado') {
    await registrarAuditoria(tx, tid, {
      ator: ator(usuarioId),
      acao: 'ativou',
      objetoTipo: 'fluxo',
      objetoId: fluxoId,
      antes: { estado: atual.estado },
      depois: { estado: 'publicado', versao: versao.versao },
    });
  }
  return {
    versao,
    arquivada: anterior ? { ...anterior, estado: 'arquivada' } : null,
  };
}

/** O histórico, da mais nova para a mais antiga. */
export async function listVersions(
  tx: TransactionPipe,
  tid: string,
  usuarioId: string,
  fluxoId: string,
): Promise<VersionOfFlow[]> {
  await flowOfBuilder(tx, tid, usuarioId, fluxoId, EDITAR_FLOW);
  const { rows } = await tx.execute<LinhaVersao>(sql`
    select ${COLUNAS_DA_VERSAO} ${DE_VERSAO}
     where v.fluxo_id = ${fluxoId}
     order by v.versao desc
  `);
  return rows.map(comoVersao);
}

/** Uma versão antiga de volta como rascunho — a publicada continua no ar até publicar de novo. */
export async function restoreVersion(
  tx: TransactionPipe,
  tid: string,
  usuarioId: string,
  fluxoId: string,
  numero: number,
): Promise<RascunhoGravado> {
  await flowOfBuilder(tx, tid, usuarioId, fluxoId, EDITAR_FLOW);
  if (!Number.isInteger(numero) || numero < 1) throw PipeError.naoEncontrado('versão');
  const { rows } = await tx.execute<{ id: string }>(sql`
    select id from fluxo_versao where fluxo_id = ${fluxoId} and versao = ${numero} limit 1
  `);
  const origem = rows[0];
  if (!origem) throw PipeError.naoEncontrado('versão');

  const desenho = await desenhoDaVersao(tx, origem.id);
  const compilado = compilar(desenho, fluxoId);
  return gravarRascunho(tx, tid, usuarioId, fluxoId, compilado, { restauradaDe: numero });
}
