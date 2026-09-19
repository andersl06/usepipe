import { and, eq, ne } from 'drizzle-orm';
import { fila, regraSla, slaConversa, ALVOS_SLA } from '@pipe/db/schema';
import { diferenca, registrarAuditoria } from '@pipe/db';
import type { TransacaoPipe } from '@pipe/db';
import { ErroPipe } from '../../erros.js';
import { exigirPermissao } from '../../sessao.js';
import { REGRA_GERENCIAR } from './cadastros.js';

/**
 * Escrita de `regra_sla` — item 2 da tarefa de cadastros do Atendimento. A
 * LEITURA continua em `configuracoes.ts` (`carregarRegras`, que já monta o
 * nome da fila para a tela de `regras/sla`); este arquivo é o irmão de
 * escrita, no mesmo padrão REST de `cadastros.ts` (`ErroPipe`, status de
 * verdade). Fica em arquivo próprio, e não dentro de `cadastros.ts`, porque
 * SLA é assunto à parte de fila/pausa/regra de entrada — mesma divisão que já
 * separa `comunicacao.ts` de `cadastros.ts`.
 *
 * `regra.gerenciar` é a MESMA permissão de `gravarRegraFila`: o catálogo já
 * a descreve como "Gerenciar regras de fila, prioridade e SLA" — não há
 * permissão nova para criar aqui.
 *
 * Decisão Pipe — `escopoTipo` só aceita `tenant` e `fila`. A tabela permite
 * mais (`inbox`, `equipe`, `etiqueta` — `ESCOPOS_REGRA` em
 * `packages/db/src/schema/gestao.ts`), mas `escolherRegra` do motor de SLA
 * (`dominio/gestao/sla.ts`) só sabe resolver estes dois; uma regra com outro
 * escopo seria aceita e nunca aplicada — pior que recusar na entrada.
 */

const ESCOPOS_SLA_SUPORTADOS = ['tenant', 'fila'] as const;
type EscopoSla = (typeof ESCOPOS_SLA_SUPORTADOS)[number];

function escopoSlaValido(bruto: string): bruto is EscopoSla {
  return (ESCOPOS_SLA_SUPORTADOS as readonly string[]).includes(bruto);
}

/** Uma semana: acima disso o prazo provavelmente é erro de digitação (segundos em vez de minutos). */
const PRAZO_SEG_MAX = 7 * 86_400;

export interface PedidoDeRegraSla {
  nome: string;
  alvo: string;
  prazoSeg: number;
  alertaSeg?: number | null;
  escopoTipo?: string;
  escopoId?: string | null;
  ativa?: boolean;
}

export interface PedidoDeEdicaoDeRegraSla {
  nome?: string;
  alvo?: string;
  prazoSeg?: number;
  alertaSeg?: number | null;
  escopoTipo?: string;
  escopoId?: string | null;
  ativa?: boolean;
}

export interface RegraSlaGravada {
  id: string;
  nome: string;
  alvo: string;
  prazoSeg: number;
  alertaSeg: number | null;
  escopoTipo: string;
  escopoId: string | null;
  ativa: boolean;
}

function nomeConferido(bruto: unknown): string {
  const nome = String(bruto ?? '').trim();
  if (!nome) throw ErroPipe.requisicao('nome_obrigatorio', 'Informe o nome da regra.');
  return nome;
}

function alvoConferido(bruto: unknown): string {
  const alvo = String(bruto ?? '');
  if (!(ALVOS_SLA as readonly string[]).includes(alvo)) {
    throw ErroPipe.requisicao('alvo_invalido', `"${alvo}" não é um alvo de SLA válido.`);
  }
  return alvo;
}

function prazoConferido(bruto: unknown): number {
  const n = Number(bruto);
  if (!Number.isInteger(n) || n < 1 || n > PRAZO_SEG_MAX) {
    throw ErroPipe.requisicao(
      'prazo_invalido',
      `O prazo é um inteiro de 1 a ${PRAZO_SEG_MAX} segundos (uma semana).`,
    );
  }
  return n;
}

/** `null`/ausente é "sem alerta"; quando vem, tem de soar ANTES do prazo estourar. */
function alertaConferido(bruto: unknown, prazoSeg: number): number | null {
  if (bruto === undefined || bruto === null) return null;
  const n = Number(bruto);
  if (!Number.isInteger(n) || n < 1 || n >= prazoSeg) {
    throw ErroPipe.requisicao(
      'alerta_invalido',
      'O alerta é um inteiro positivo, menor que o prazo — alerta que soa depois do estouro não avisa nada.',
    );
  }
  return n;
}

async function nomeEmUso(tx: TransacaoPipe, tid: string, nome: string, excetoId?: string): Promise<boolean> {
  const [conflito] = await tx
    .select({ id: regraSla.id })
    .from(regraSla)
    .where(and(eq(regraSla.tenantId, tid), eq(regraSla.nome, nome), excetoId ? ne(regraSla.id, excetoId) : undefined))
    .limit(1);
  return conflito !== undefined;
}

async function escopoConferido(
  tx: TransacaoPipe,
  tid: string,
  escopoTipo: string,
  escopoId: unknown,
): Promise<{ escopoTipo: EscopoSla; escopoId: string | null }> {
  if (!escopoSlaValido(escopoTipo)) {
    throw ErroPipe.requisicao(
      'escopo_invalido',
      `Escopo "${escopoTipo}" não é aplicado pelo motor de SLA hoje. Use "tenant" ou "fila".`,
    );
  }
  if (escopoTipo === 'tenant') return { escopoTipo, escopoId: null };

  const id = String(escopoId ?? '').trim();
  if (!id) throw ErroPipe.requisicao('escopo_id_obrigatorio', 'Escolha a fila deste escopo.');
  const [alvo] = await tx.select({ id: fila.id }).from(fila).where(and(eq(fila.tenantId, tid), eq(fila.id, id))).limit(1);
  if (!alvo) throw ErroPipe.requisicao('fila_nao_encontrada', 'Fila não encontrada.');
  return { escopoTipo, escopoId: id };
}

async function regraSlaViva(tx: TransacaoPipe, tid: string, id: string): Promise<RegraSlaGravada> {
  const [atual] = await tx
    .select({
      id: regraSla.id,
      nome: regraSla.nome,
      alvo: regraSla.alvo,
      prazoSeg: regraSla.prazoSeg,
      alertaSeg: regraSla.alertaSeg,
      escopoTipo: regraSla.escopoTipo,
      escopoId: regraSla.escopoId,
      ativa: regraSla.ativa,
    })
    .from(regraSla)
    .where(and(eq(regraSla.tenantId, tid), eq(regraSla.id, id)))
    .limit(1);
  if (!atual) throw ErroPipe.naoEncontrado('regra de SLA');
  return atual;
}

export async function criarRegraSla(
  tx: TransacaoPipe,
  tid: string,
  usuarioId: string,
  pedido: PedidoDeRegraSla,
): Promise<{ id: string }> {
  await exigirPermissao(tx, usuarioId, REGRA_GERENCIAR);

  const nome = nomeConferido(pedido.nome);
  const alvo = alvoConferido(pedido.alvo);
  const prazoSeg = prazoConferido(pedido.prazoSeg);
  const alertaSeg = alertaConferido(pedido.alertaSeg, prazoSeg);
  const { escopoTipo, escopoId } = await escopoConferido(tx, tid, pedido.escopoTipo ?? 'tenant', pedido.escopoId);
  const ativa = pedido.ativa ?? true;

  if (await nomeEmUso(tx, tid, nome)) throw ErroPipe.conflito('nome_em_uso', `Já existe uma regra chamada "${nome}".`);

  const [criada] = await tx
    .insert(regraSla)
    .values({ tenantId: tid, nome, alvo, prazoSeg, alertaSeg, escopoTipo, escopoId, ativa })
    .returning({ id: regraSla.id });
  if (!criada) throw ErroPipe.requisicao('regra_nao_criada', 'Não consegui gravar a regra de SLA.');

  await registrarAuditoria(tx, tid, {
    ator: { tipo: 'usuario', id: usuarioId },
    acao: 'criou',
    objetoTipo: 'regra_sla',
    objetoId: criada.id,
    depois: { nome, alvo, prazoSeg, alertaSeg, escopoTipo, escopoId, ativa },
  });
  return { id: criada.id };
}

export async function editarRegraSla(
  tx: TransacaoPipe,
  tid: string,
  usuarioId: string,
  id: string,
  pedido: PedidoDeEdicaoDeRegraSla,
): Promise<RegraSlaGravada> {
  const atual = await regraSlaViva(tx, tid, id);
  await exigirPermissao(tx, usuarioId, REGRA_GERENCIAR);

  const antes = { ...atual };
  const depois = { ...antes };

  if (pedido.nome !== undefined) depois.nome = nomeConferido(pedido.nome);
  if (pedido.alvo !== undefined) depois.alvo = alvoConferido(pedido.alvo);
  if (pedido.prazoSeg !== undefined) depois.prazoSeg = prazoConferido(pedido.prazoSeg);
  if (pedido.ativa !== undefined) depois.ativa = pedido.ativa;

  // Alerta depende do prazo (final), então é conferido depois dos dois — o
  // pedido pode trocar só um dos dois e o outro continuar valendo.
  if (pedido.alertaSeg !== undefined) depois.alertaSeg = alertaConferido(pedido.alertaSeg, depois.prazoSeg);
  else if (depois.alertaSeg !== null && depois.alertaSeg >= depois.prazoSeg) {
    // Prazo encolheu abaixo do alerta que já existia — recusa em vez de deixar um alerta que nunca soa.
    throw ErroPipe.requisicao(
      'alerta_invalido',
      'O novo prazo é menor ou igual ao alerta já cadastrado. Informe também o novo alerta.',
    );
  }

  if (pedido.escopoTipo !== undefined || pedido.escopoId !== undefined) {
    const resolvido = await escopoConferido(
      tx,
      tid,
      pedido.escopoTipo ?? depois.escopoTipo,
      pedido.escopoId !== undefined ? pedido.escopoId : depois.escopoId,
    );
    depois.escopoTipo = resolvido.escopoTipo;
    depois.escopoId = resolvido.escopoId;
  }

  if (depois.nome !== antes.nome && (await nomeEmUso(tx, tid, depois.nome, id))) {
    throw ErroPipe.conflito('nome_em_uso', `Já existe uma regra chamada "${depois.nome}".`);
  }

  const mudanca = diferenca(antes, depois);
  if (Object.keys(mudanca.depois).length === 0) return atual;

  const [gravada] = await tx
    .update(regraSla)
    .set({
      nome: depois.nome,
      alvo: depois.alvo,
      prazoSeg: depois.prazoSeg,
      alertaSeg: depois.alertaSeg,
      escopoTipo: depois.escopoTipo,
      escopoId: depois.escopoId,
      ativa: depois.ativa,
      atualizadoEm: new Date(),
    })
    .where(and(eq(regraSla.tenantId, tid), eq(regraSla.id, id)))
    .returning({
      id: regraSla.id,
      nome: regraSla.nome,
      alvo: regraSla.alvo,
      prazoSeg: regraSla.prazoSeg,
      alertaSeg: regraSla.alertaSeg,
      escopoTipo: regraSla.escopoTipo,
      escopoId: regraSla.escopoId,
      ativa: regraSla.ativa,
    });
  if (!gravada) throw ErroPipe.naoEncontrado('regra de SLA');

  await registrarAuditoria(tx, tid, {
    ator: { tipo: 'usuario', id: usuarioId },
    acao: 'alterou',
    objetoTipo: 'regra_sla',
    objetoId: id,
    antes: mudanca.antes,
    depois: mudanca.depois,
  });
  return gravada;
}

export async function excluirRegraSla(tx: TransacaoPipe, tid: string, usuarioId: string, id: string): Promise<void> {
  const atual = await regraSlaViva(tx, tid, id);
  await exigirPermissao(tx, usuarioId, REGRA_GERENCIAR);

  // `sla_conversa.regra_id` é `ON DELETE CASCADE`: excluir a regra apagaria em
  // silêncio o cronômetro de toda conversa que ainda está correndo com ela.
  const [emAndamento] = await tx
    .select({ id: slaConversa.id })
    .from(slaConversa)
    .where(and(eq(slaConversa.regraId, id), eq(slaConversa.estado, 'correndo')))
    .limit(1);
  if (emAndamento) {
    throw ErroPipe.conflito(
      'regra_com_sla_correndo',
      'Esta regra tem cronômetro de SLA correndo em conversa aberta. Desative-a em vez de excluir, ou espere as conversas encerrarem.',
    );
  }

  await tx.delete(regraSla).where(and(eq(regraSla.tenantId, tid), eq(regraSla.id, id)));

  await registrarAuditoria(tx, tid, {
    ator: { tipo: 'usuario', id: usuarioId },
    acao: 'excluiu',
    objetoTipo: 'regra_sla',
    objetoId: id,
    antes: { nome: atual.nome, alvo: atual.alvo, ativa: atual.ativa },
  });
}
