import { and, eq, inArray, sql } from 'drizzle-orm';
import {
  NIVEIS_PRIORITY,
  avaliarSla,
  alvoFulfillment,
  inicioDoAlvo,
  type MarcosSla,
  type NivelPriority,
} from '@pipe/core';
import { conversation, slaConversation } from '@pipe/db/schema';
import type { TransactionPipe } from '@pipe/db';
import { databaseOwner, noTenant } from '../../database.js';
import { registrarEvento } from '../eventos.js';
import { emitir } from '../../webhooks-saida.js';
import { carregarRegrasSla, type RegraSlaCarregada } from './sla.js';

/**
 * O relógio do SLA — item 1 da tarefa de "fazer funcionar o que só está
 * cadastrado". `regra_sla` e `sla_conversa` existem desde a fundação do
 * módulo de Gestão; até este arquivo, nada escrevia em `sla_conversa` — a
 * tabela ficava vazia e nenhum alerta ou estouro acontecia de verdade.
 *
 * Mesmo padrão do download de mídia (`../../filas.ts`,
 * `agendarVarreduraDownloadMidia`/`relogioMidia`): fila BullMQ (`pipe-sla`) +
 * varredura periódica, com um caminho em memória para dev/teste. A fila é o
 * empurrão; a verdade fica em `sla_conversa`, e perder um job só atrasa até a
 * próxima varredura pegar a conversa de novo.
 *
 * **Decisão Pipe — sem pausa por horário de atendimento.** A tarefa pediu
 * para checar `referencias-blip/pesquisa/regras-blip.md` e `blip-desk-regras-tecnicas.md`
 * antes de inventar uma pausa. Nenhum dos dois documenta que o SLA da Blip
 * pausa fora do expediente (o achado mais próximo, em `regras-blip.md`, é
 * sobre o contador de 1ª resposta **zerar a cada resposta do atendente**, não
 * sobre pausar por horário). `dominio/gestao/sla.ts` já registrava a mesma
 * lacuna para o "pill" do monitoramento ("o relógio roda sem expediente —
 * `horario_atendimento` ainda não é semeado"). Este motor segue a MESMA
 * decisão: passa `horario: null` para `avaliarSla` (atendimento 24×7). Se um
 * dia a origem confirmar a pausa, é só passar o `horario_atendimento` da fila
 * — `avaliarSla` já aceita.
 *
 * **Decisão Pipe — o relógio congela quando a conversa encerra.** Isto não é
 * a pausa por horário (que fica de fora, acima): é o mínimo para a conversa
 * encerrada ANTES do prazo não estourar horas depois, só porque a varredura
 * seguinte rodou com `agora` real avançando sobre uma conversa que ninguém
 * mais atende. Sem isto, "conversa encerrada antes do prazo não dispara"
 * seria impossível de garantir.
 *
 * **Decisão Pipe — uma regra vencedora POR ALVO, não uma só para a
 * conversa.** O `escolherRegra` de `sla.ts` (usado no "pill", uma coluna só)
 * pega a primeira regra que casar o escopo, ignorando o alvo. Mas
 * `sla_conversa` tem chave única `(conversa_id, regra_id)` — o modelo já
 * prevê VÁRIAS regras rodando ao mesmo tempo numa conversa (uma de 1ª
 * resposta, outra de resolução). Por isso aqui a vencedora é escolhida
 * `POR ALVO`, com a mesma precedência (regra de escopo `fila` vence a de
 * escopo `tenant`, por ser mais específica).
 */

const STATES_TERMINALS = new Set(['cumprido', 'cancelado']);

function vencedoraDoAlvo(
  regras: readonly RegraSlaCarregada[],
  queueId: string | null,
): RegraSlaCarregada | null {
  const ofQueue = regras.find((r) => r.scopeType === 'fila' && r.scopeId === queueId);
  return ofQueue ?? regras.find((r) => r.scopeType === 'tenant') ?? null;
}

/** Agrupa por alvo e escolhe, em cada grupo, a regra de escopo mais específico. */
export function rulesWinningByTarget(
  regras: readonly RegraSlaCarregada[],
  filaId: string | null,
): RegraSlaCarregada[] {
  const byTarget = new Map<string, RegraSlaCarregada[]>();
  for (const r of regras) {
    const lista = byTarget.get(r.alvo);
    if (lista) lista.push(r);
    else byTarget.set(r.alvo, [r]);
  }
  const vencedoras: RegraSlaCarregada[] = [];
  for (const lista of byTarget.values()) {
    const v = vencedoraDoAlvo(lista, filaId);
    if (v) vencedoras.push(v);
  }
  return vencedoras;
}

/** Sobe um degrau na régua de prioridade (§`conversa/prioridade.ts`). Já em `maxima`, não faz nada. */
function nivelElevado(atual: string): NivelPriority | null {
  const position = (NIVEIS_PRIORITY as readonly string[]).indexOf(atual);
  // -1 (valor desconhecido) ou 0 (já é `maxima`): nada a elevar.
  if (position <= 0) return null;
  return NIVEIS_PRIORITY[position - 1] as NivelPriority;
}

/**
 * Executa a ação configurada (`regra_sla.acao_alerta`/`acao_estouro`, formato
 * `{ tipo: 'notificar_supervisor' | 'elevar_prioridade' }` — é o que
 * `packages/db`/`apps/management-vite` semeiam hoje).
 *
 * O EVENTO (`sla_alertado`/`sla_estourado` em `evento_atendimento`) já foi
 * gravado por quem chama, incondicionalmente — é o dado bruto de onde
 * `metrica_diaria.sla_estourados` um dia vai somar. A ação aqui é o
 * comportamento EXTRA, e regra sem ação configurada (`{}`, o padrão do
 * schema) não faz mais nada além do evento.
 *
 * Tipo desconhecido é ignorado em silêncio: um valor de `jsonb` mal digitado
 * não pode derrubar o relógio de SLA de todas as outras conversas.
 */
async function executarAcao(
  tx: TransactionPipe,
  ctx: { tenantId: string; conversationId: string; queueId: string | null; priorityAtual: string },
  acao: Record<string, unknown>,
  eventoWebhook: 'sla.alertou' | 'sla.estourou',
): Promise<void> {
  const tipo = typeof acao['tipo'] === 'string' ? acao['tipo'] : '';
  if (tipo === 'notificar_supervisor') {
    await emitir(tx, ctx.tenantId, eventoWebhook, {
      conversa_id: ctx.conversationId,
      fila_id: ctx.queueId,
    });
    return;
  }
  if (tipo === 'elevar_prioridade') {
    const novoNivel = nivelElevado(ctx.priorityAtual);
    if (!novoNivel) return;
    await tx
      .update(conversation)
      .set({ prioridade: novoNivel, atualizadoEm: new Date() })
      .where(eq(conversation.id, ctx.conversationId));
  }
}

interface ConversationForSla {
  id: string;
  queueId: string | null;
  priority: string;
  criadaEm: Date;
  assignedAt: Date | null;
  firstResponseAt: Date | null;
  closedAt: Date | null;
  lastMessageAt: Date | null;
  lastMessageFrom: string | null;
}

interface LinhaSlaExistente {
  id: string;
  state: string;
  alertedAt: Date | null;
  exceededAt: Date | null;
}

/** Uma regra, contra uma conversa: decide o novo estado e dispara alerta/estouro no máximo uma vez cada. */
async function processarRegra(
  tx: TransactionPipe,
  tenantId: string,
  c: ConversationForSla,
  regra: RegraSlaCarregada,
  existente: LinhaSlaExistente | undefined,
  agora: Date,
): Promise<void> {
  // Idempotência dura: linha terminal nunca mais muda, mesmo que a varredura rode de
  // novo sobre a mesma conversa daqui a um mês.
  if (existente && STATES_TERMINALS.has(existente.state)) return;

  const marcos: MarcosSla = {
    criadaEm: c.criadaEm,
    atribuidaEm: c.atribuidaEm,
    firstRespostaIn: c.firstResponseAt,
    encerradaEm: c.encerradaEm,
    // `resposta` (tempo_resposta): só corre enquanto a última mensagem foi do
    // contato. Assim que o atendente (ou o bot) responde, o alvo não tem mais início.
    aguardandoRespostaDesde: c.lastMessageFrom === 'contato' ? c.lastMessageAt : null,
  };

  const inicio = inicioDoAlvo(regra.alvo, marcos);
  if (!inicio) {
    // Sem início hoje. Se havia uma linha correndo, o fim da espera (resposta que
    // chegou) fecha o ciclo como cumprido — senão ela travaria "correndo" para
    // sempre depois que o atendente respondesse.
    //
    // ponytail: alvo `resposta` reaproveita a MESMA linha entre ciclos de espera —
    // `sla_conversa` só tem uma chave (conversa, regra). Se um dia for preciso o
    // histórico de CADA ciclo de resposta (não só o último), isso vira tabela
    // própria; hoje ninguém pediu esse histórico.
    if (existente) {
      await tx
        .update(slaConversation)
        .set({ estado: 'cumprido', atualizadoEm: agora })
        .where(eq(slaConversation.id, existente.id));
    }
    return;
  }

  const cumpridoEm = alvoFulfillment(regra.alvo, marcos);
  const encerrouAntes = marcos.encerradaEm !== null && marcos.encerradaEm.getTime() < agora.getTime();
  // O relógio congela em `encerradaEm` — ver decisão Pipe no topo do arquivo.
  const fimEfetivo = encerrouAntes ? (marcos.encerradaEm as Date) : agora;

  const resultado = avaliarSla({
    regra: { prazoSeg: regra.prazoSeg, alertaSeg: regra.alertaSeg },
    inicio,
    agora: fimEfetivo,
    cumpridoEm,
  });

  let newState: string;
  let alertadoEm = existente?.alertadoEm ?? null;
  let estouradoEm = existente?.estouradoEm ?? null;
  let dispararAlerta = false;
  let dispararEstouro = false;

  if (resultado.cumprido) {
    newState = 'cumprido';
  } else if (resultado.state === 'exceeded') {
    newState = 'estourado';
    if (!estouradoEm) {
      estouradoEm = fimEfetivo;
      dispararEstouro = true;
    }
  } else if (resultado.state === 'alert') {
    newState = 'alertado';
    if (!alertadoEm) {
      alertadoEm = fimEfetivo;
      dispararAlerta = true;
    }
  } else {
    newState = 'correndo';
  }

  // Encerrou sem cumprir o alvo e sem ter estourado antes de fechar: não fica
  // "correndo"/"alertado" para sempre — é isso que garante que fechar cedo não
  // dispara nada mais tarde.
  if (marcos.encerradaEm && !resultado.cumprido && newState !== 'estourado') {
    newState = 'cancelado';
  }

  if (!existente) {
    await tx.insert(slaConversation).values({
      tenantId,
      conversaId: c.id,
      regraId: regra.id,
      prazoEm: resultado.prazoEm ?? fimEfetivo,
      estado: newState,
      alertadoEm,
      estouradoEm,
    });
  } else if (
    newState !== existente.state ||
    alertadoEm?.getTime() !== existente.alertadoEm?.getTime() ||
    estouradoEm?.getTime() !== existente.estouradoEm?.getTime()
  ) {
    await tx
      .update(slaConversation)
      .set({ estado: newState, alertadoEm, estouradoEm, atualizadoEm: agora })
      .where(eq(slaConversation.id, existente.id));
  }

  const context = { tenantId, conversaId: c.id, filaId: c.filaId, prioridadeAtual: c.priority };

  if (dispararAlerta) {
    await registrarEvento(tx, {
      tenantId,
      conversationId: c.id,
      tipo: 'sla_alertado',
      em: alertadoEm!,
      queueId: c.filaId,
      data: { regra_id: regra.id, regra_nome: regra.nome, alvo: regra.alvo },
    });
    await executarAcao(tx, context, regra.acaoAlerta, 'sla.alertou');
  }
  if (dispararEstouro) {
    await registrarEvento(tx, {
      tenantId,
      conversationId: c.id,
      tipo: 'sla_estourado',
      em: estouradoEm!,
      queueId: c.filaId,
      data: { regra_id: regra.id, regra_nome: regra.nome, alvo: regra.alvo },
    });
    await executarAcao(tx, context, regra.acaoEstouro, 'sla.estourou');
  }
}

/**
 * Checa o SLA de UMA conversa — o que o consumidor da fila `pipe-sla` chama por
 * job, e o que o modo em memória chama direto por conversa pendente.
 *
 * Tudo dentro de `noTenant`: a RLS decide o que `carregarRegrasSla` enxerga, a
 * mesma garantia de isolamento entre tenants que o resto da `api` usa.
 */
export async function checarSlaOfConversation(
  tenantId: string,
  conversationId: string,
  agora = new Date(),
): Promise<void> {
  await noTenant(tenantId, async (tx) => {
    const [c] = await tx
      .select({
        id: conversation.id,
        filaId: conversation.filaId,
        prioridade: conversation.priority,
        criadaEm: conversation.criadaEm,
        atribuidaEm: conversation.atribuidaEm,
        primeiraRespostaEm: conversation.firstResponseAt,
        encerradaEm: conversation.encerradaEm,
        ultimaMensagemEm: conversation.lastMessageAt,
        ultimaMensagemDe: conversation.lastMessageOf,
      })
      .from(conversation)
      .where(eq(conversation.id, conversationId))
      .limit(1);
    // A conversa sumiu entre o enfileirar e o processar (mesma tolerância do
    // download de mídia): nada a fazer, a próxima varredura nem vai mais achá-la.
    if (!c) return;

    const regras = await carregarRegrasSla(tx);
    const vencedoras = rulesWinningByTarget(regras, c.filaId);
    // Sem regra cadastrada para esta fila/tenant: não muda nada, como pedido.
    if (vencedoras.length === 0) return;

    const existentes = await tx
      .select({
        id: slaConversation.id,
        regraId: slaConversation.regraId,
        estado: slaConversation.state,
        alertadoEm: slaConversation.alertadoEm,
        estouradoEm: slaConversation.estouradoEm,
      })
      .from(slaConversation)
      .where(
        and(
          eq(slaConversation.conversaId, c.id),
          inArray(
            slaConversation.regraId,
            vencedoras.map((r) => r.id),
          ),
        ),
      );
    const byRuleId = new Map(existentes.map((e) => [e.regraId, e]));

    for (const regra of vencedoras) {
      await processarRegra(tx, tenantId, c, regra, byRuleId.get(regra.id), agora);
    }
  });
}

export interface CandidataASla {
  tenantId: string;
  conversationId: string;
}

/**
 * Candidatas à varredura: conversas ainda abertas, OU já encerradas mas com
 * `sla_conversa` ainda `correndo`/`alertado` — que é a última passada que as
 * fecha (cumprido/cancelado/estourado), como no fim de `processarRegra`.
 *
 * `bancoDono()`, como `midiasPendentes`/`contatosSemEspelho`: a varredura
 * atravessa tenant para achar QUEM precisa de trabalho; o trabalho em si
 * (`checarSlaDaConversa`) roda depois, um tenant de cada vez, sob RLS.
 */
export async function conversationsForChecarSla(lote = 200): Promise<CandidataASla[]> {
  const { rows } = await databaseOwner().execute<{ tenant_id: string; id: string }>(sql`
    select distinct c.tenant_id, c.id
      from conversa c
     where c.estado <> 'encerrada'
        or exists (
             select 1 from sla_conversa sc
              where sc.conversa_id = c.id and sc.estado in ('correndo', 'alertado')
           )
     order by c.id
     limit ${lote}
  `);
  return rows.map((l) => ({ tenantId: l.tenant_id, conversaId: l.id }));
}
