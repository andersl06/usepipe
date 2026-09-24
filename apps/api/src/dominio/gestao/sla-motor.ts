import { and, eq, inArray, sql } from 'drizzle-orm';
import {
  NIVEIS_PRIORIDADE,
  avaliarSla,
  cumprimentoDoAlvo,
  inicioDoAlvo,
  type MarcosSla,
  type NivelPrioridade,
} from '@pipe/core';
import { conversa, slaConversa } from '@pipe/db/schema';
import type { TransacaoPipe } from '@pipe/db';
import { bancoDono, noTenant } from '../../banco.js';
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

const ESTADOS_TERMINAIS = new Set(['cumprido', 'cancelado']);

function vencedoraDoAlvo(
  regras: readonly RegraSlaCarregada[],
  filaId: string | null,
): RegraSlaCarregada | null {
  const daFila = regras.find((r) => r.escopoTipo === 'fila' && r.escopoId === filaId);
  return daFila ?? regras.find((r) => r.escopoTipo === 'tenant') ?? null;
}

/** Agrupa por alvo e escolhe, em cada grupo, a regra de escopo mais específico. */
export function regrasVencedorasPorAlvo(
  regras: readonly RegraSlaCarregada[],
  filaId: string | null,
): RegraSlaCarregada[] {
  const porAlvo = new Map<string, RegraSlaCarregada[]>();
  for (const r of regras) {
    const lista = porAlvo.get(r.alvo);
    if (lista) lista.push(r);
    else porAlvo.set(r.alvo, [r]);
  }
  const vencedoras: RegraSlaCarregada[] = [];
  for (const lista of porAlvo.values()) {
    const v = vencedoraDoAlvo(lista, filaId);
    if (v) vencedoras.push(v);
  }
  return vencedoras;
}

/** Sobe um degrau na régua de prioridade (§`conversa/prioridade.ts`). Já em `maxima`, não faz nada. */
function nivelElevado(atual: string): NivelPrioridade | null {
  const posicao = (NIVEIS_PRIORIDADE as readonly string[]).indexOf(atual);
  // -1 (valor desconhecido) ou 0 (já é `maxima`): nada a elevar.
  if (posicao <= 0) return null;
  return NIVEIS_PRIORIDADE[posicao - 1] as NivelPrioridade;
}

/**
 * Executa a ação configurada (`regra_sla.acao_alerta`/`acao_estouro`, formato
 * `{ tipo: 'notificar_supervisor' | 'elevar_prioridade' }` — é o que
 * `packages/db`/`apps/gestao-vite` semeiam hoje).
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
  tx: TransacaoPipe,
  ctx: { tenantId: string; conversaId: string; filaId: string | null; prioridadeAtual: string },
  acao: Record<string, unknown>,
  eventoWebhook: 'sla.alertou' | 'sla.estourou',
): Promise<void> {
  const tipo = typeof acao['tipo'] === 'string' ? acao['tipo'] : '';
  if (tipo === 'notificar_supervisor') {
    await emitir(tx, ctx.tenantId, eventoWebhook, {
      conversa_id: ctx.conversaId,
      fila_id: ctx.filaId,
    });
    return;
  }
  if (tipo === 'elevar_prioridade') {
    const novoNivel = nivelElevado(ctx.prioridadeAtual);
    if (!novoNivel) return;
    await tx
      .update(conversa)
      .set({ prioridade: novoNivel, atualizadoEm: new Date() })
      .where(eq(conversa.id, ctx.conversaId));
  }
}

interface ConversaParaSla {
  id: string;
  filaId: string | null;
  prioridade: string;
  criadaEm: Date;
  atribuidaEm: Date | null;
  primeiraRespostaEm: Date | null;
  encerradaEm: Date | null;
  ultimaMensagemEm: Date | null;
  ultimaMensagemDe: string | null;
}

interface LinhaSlaExistente {
  id: string;
  estado: string;
  alertadoEm: Date | null;
  estouradoEm: Date | null;
}

/** Uma regra, contra uma conversa: decide o novo estado e dispara alerta/estouro no máximo uma vez cada. */
async function processarRegra(
  tx: TransacaoPipe,
  tenantId: string,
  c: ConversaParaSla,
  regra: RegraSlaCarregada,
  existente: LinhaSlaExistente | undefined,
  agora: Date,
): Promise<void> {
  // Idempotência dura: linha terminal nunca mais muda, mesmo que a varredura rode de
  // novo sobre a mesma conversa daqui a um mês.
  if (existente && ESTADOS_TERMINAIS.has(existente.estado)) return;

  const marcos: MarcosSla = {
    criadaEm: c.criadaEm,
    atribuidaEm: c.atribuidaEm,
    primeiraRespostaEm: c.primeiraRespostaEm,
    encerradaEm: c.encerradaEm,
    // `resposta` (tempo_resposta): só corre enquanto a última mensagem foi do
    // contato. Assim que o atendente (ou o bot) responde, o alvo não tem mais início.
    aguardandoRespostaDesde: c.ultimaMensagemDe === 'contato' ? c.ultimaMensagemEm : null,
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
        .update(slaConversa)
        .set({ estado: 'cumprido', atualizadoEm: agora })
        .where(eq(slaConversa.id, existente.id));
    }
    return;
  }

  const cumpridoEm = cumprimentoDoAlvo(regra.alvo, marcos);
  const encerrouAntes = marcos.encerradaEm !== null && marcos.encerradaEm.getTime() < agora.getTime();
  // O relógio congela em `encerradaEm` — ver decisão Pipe no topo do arquivo.
  const fimEfetivo = encerrouAntes ? (marcos.encerradaEm as Date) : agora;

  const resultado = avaliarSla({
    regra: { prazoSeg: regra.prazoSeg, alertaSeg: regra.alertaSeg },
    inicio,
    agora: fimEfetivo,
    cumpridoEm,
  });

  let novoEstado: string;
  let alertadoEm = existente?.alertadoEm ?? null;
  let estouradoEm = existente?.estouradoEm ?? null;
  let dispararAlerta = false;
  let dispararEstouro = false;

  if (resultado.cumprido) {
    novoEstado = 'cumprido';
  } else if (resultado.estado === 'estourado') {
    novoEstado = 'estourado';
    if (!estouradoEm) {
      estouradoEm = fimEfetivo;
      dispararEstouro = true;
    }
  } else if (resultado.estado === 'alerta') {
    novoEstado = 'alertado';
    if (!alertadoEm) {
      alertadoEm = fimEfetivo;
      dispararAlerta = true;
    }
  } else {
    novoEstado = 'correndo';
  }

  // Encerrou sem cumprir o alvo e sem ter estourado antes de fechar: não fica
  // "correndo"/"alertado" para sempre — é isso que garante que fechar cedo não
  // dispara nada mais tarde.
  if (marcos.encerradaEm && !resultado.cumprido && novoEstado !== 'estourado') {
    novoEstado = 'cancelado';
  }

  if (!existente) {
    await tx.insert(slaConversa).values({
      tenantId,
      conversaId: c.id,
      regraId: regra.id,
      prazoEm: resultado.prazoEm ?? fimEfetivo,
      estado: novoEstado,
      alertadoEm,
      estouradoEm,
    });
  } else if (
    novoEstado !== existente.estado ||
    alertadoEm?.getTime() !== existente.alertadoEm?.getTime() ||
    estouradoEm?.getTime() !== existente.estouradoEm?.getTime()
  ) {
    await tx
      .update(slaConversa)
      .set({ estado: novoEstado, alertadoEm, estouradoEm, atualizadoEm: agora })
      .where(eq(slaConversa.id, existente.id));
  }

  const contexto = { tenantId, conversaId: c.id, filaId: c.filaId, prioridadeAtual: c.prioridade };

  if (dispararAlerta) {
    await registrarEvento(tx, {
      tenantId,
      conversaId: c.id,
      tipo: 'sla_alertado',
      em: alertadoEm!,
      filaId: c.filaId,
      dados: { regra_id: regra.id, regra_nome: regra.nome, alvo: regra.alvo },
    });
    await executarAcao(tx, contexto, regra.acaoAlerta, 'sla.alertou');
  }
  if (dispararEstouro) {
    await registrarEvento(tx, {
      tenantId,
      conversaId: c.id,
      tipo: 'sla_estourado',
      em: estouradoEm!,
      filaId: c.filaId,
      dados: { regra_id: regra.id, regra_nome: regra.nome, alvo: regra.alvo },
    });
    await executarAcao(tx, contexto, regra.acaoEstouro, 'sla.estourou');
  }
}

/**
 * Checa o SLA de UMA conversa — o que o consumidor da fila `pipe-sla` chama por
 * job, e o que o modo em memória chama direto por conversa pendente.
 *
 * Tudo dentro de `noTenant`: a RLS decide o que `carregarRegrasSla` enxerga, a
 * mesma garantia de isolamento entre tenants que o resto da `api` usa.
 */
export async function checarSlaDaConversa(
  tenantId: string,
  conversaId: string,
  agora = new Date(),
): Promise<void> {
  await noTenant(tenantId, async (tx) => {
    const [c] = await tx
      .select({
        id: conversa.id,
        filaId: conversa.filaId,
        prioridade: conversa.prioridade,
        criadaEm: conversa.criadaEm,
        atribuidaEm: conversa.atribuidaEm,
        primeiraRespostaEm: conversa.primeiraRespostaEm,
        encerradaEm: conversa.encerradaEm,
        ultimaMensagemEm: conversa.ultimaMensagemEm,
        ultimaMensagemDe: conversa.ultimaMensagemDe,
      })
      .from(conversa)
      .where(eq(conversa.id, conversaId))
      .limit(1);
    // A conversa sumiu entre o enfileirar e o processar (mesma tolerância do
    // download de mídia): nada a fazer, a próxima varredura nem vai mais achá-la.
    if (!c) return;

    const regras = await carregarRegrasSla(tx);
    const vencedoras = regrasVencedorasPorAlvo(regras, c.filaId);
    // Sem regra cadastrada para esta fila/tenant: não muda nada, como pedido.
    if (vencedoras.length === 0) return;

    const existentes = await tx
      .select({
        id: slaConversa.id,
        regraId: slaConversa.regraId,
        estado: slaConversa.estado,
        alertadoEm: slaConversa.alertadoEm,
        estouradoEm: slaConversa.estouradoEm,
      })
      .from(slaConversa)
      .where(
        and(
          eq(slaConversa.conversaId, c.id),
          inArray(
            slaConversa.regraId,
            vencedoras.map((r) => r.id),
          ),
        ),
      );
    const porRegraId = new Map(existentes.map((e) => [e.regraId, e]));

    for (const regra of vencedoras) {
      await processarRegra(tx, tenantId, c, regra, porRegraId.get(regra.id), agora);
    }
  });
}

export interface CandidataASla {
  tenantId: string;
  conversaId: string;
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
export async function conversasParaChecarSla(lote = 200): Promise<CandidataASla[]> {
  const { rows } = await bancoDono().execute<{ tenant_id: string; id: string }>(sql`
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
