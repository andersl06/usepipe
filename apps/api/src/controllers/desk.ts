import { Body, Controller, Get, HttpCode, Param, Post, Query, Req } from '@nestjs/common';
import type { TransactionPipe } from '@pipe/db';
import type {
  ConversationOfHistory,
  QueueOfDesk,
  ResponseOfConversation,
  ResponseOfMetrics,
  TicketDoDesk,
} from '@pipe/contracts';
import { noTenant } from '../database.js';
import { PipeError } from '../errors.js';
import { WithSession, sessionOf } from '../session.js';
import type { RequestWithSession } from '../session.js';
import * as consultas from '../domain/desk/consultas.js';
import { loadMetrics } from '../domain/desk/metrics.js';
import * as acoesDesk from '../domain/desk/actions.js';
import * as marcacoes from '../domain/desk/taggings.js';
import { listLabelsOfContact } from '../domain/etiquetas.js';
import { Campos, type CamposCrus, type Resultado } from '../domain/management/actions/campos.js';

/**
 * The browser-session Desk API serves screen reads and actions formerly written directly to the database. Reads moved from the Next Desk into `dominio/desk/consultas.ts` and `metricas.ts`: each screen makes one request for its queue and catalogs, conversation items and panel, old ticket or metrics, in a single transaction with serial queries. The attendant always comes from the session; no parameter can inspect someone else's queue or metrics. Server Actions moved unchanged to `dominio/desk/acoes.ts`: forms send JSON `{ campos }`, `Campos` exposes `get`/`getAll` as `FormData` did, and returns the same `Resultado`. The action-name allowlist is closed; an unknown name returns 404. Send, retry, close and wait use existing `POST /v1/conversas/…` routes directly.
 */
/** The attendant comes from the session; that person changes status and signs the note. */
type Acao = (
  tx: TransactionPipe,
  tid: string,
  agentId: string,
  data: Campos,
) => Promise<Resultado>;

const ACTIONS: Record<string, Acao> = {
  definirStatus: acoesDesk.definirStatus,
  cairPorInatividade: acoesDesk.cairByInactivity,
  salvarNotaInterna: acoesDesk.salvarNotaInterna,
  atender: acoesDesk.atender,
  transferirEmMassa: acoesDesk.transferInBulk,

  fixar: marcacoes.fixar,
  marcarNaoLida: marcacoes.marcarNaoLida,
};

/** Maximum metrics range: the screen's 90 days plus a little margin. */
const TETO_OF_DAYS_OF_METRICS = 92;

function dataOuNada(value: string | undefined): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

@Controller('v1/desk')
export class DeskController {
  /* ------------------------------------------------------------ leituras */


  @Get('queue')
  @WithSession()
  queue(@Req() requisicao: RequestWithSession): Promise<QueueOfDesk> {
    const sessao = sessionOf(requisicao);
    // Run serially rather than with `Promise.all`: the transaction uses one connection, and
    // parallel queries on it can unset the tenant's `set_config`.
    return noTenant(sessao.tenantId, async (tx) => ({
      conversations: await consultas.listConversations(tx, sessao.userId),
      aguardando: await consultas.contarAguardando(tx, sessao.userId),
      status: await consultas.carregarStatus(tx, sessao.userId),
      motivos: await consultas.listarMotivosDePausa(tx),
      etiquetas: await consultas.listarEtiquetas(tx),
      colegas: await consultas.listarColegas(tx, sessao.userId),
      respostas: await consultas.listarRespostasProntas(tx, sessao.userId),
    }));
  }


  @Get('conversas/:id')
  @WithSession()
  conversation(
    @Req() requisicao: RequestWithSession,
    @Param('id') id: string,
  ): Promise<ResponseOfConversation> {
    const sessao = sessionOf(requisicao);
    return noTenant(sessao.tenantId, async (tx) => {
      const conversa = await consultas.loadConversation(tx, id, sessao.userId);
      if (!conversa) return { aberta: null };
      return {
        aberta: {
          conversation: conversa,
          itens: await consultas.listItemsOfConversation(tx, conversa.id),
          templates: await consultas.listarTemplatesAprovados(tx, conversa.channelId),
          conversationTags: await consultas.listLabelsOfConversation(tx, conversa.id),
          contactTags: (await listLabelsOfContact(tx, conversa.contactId)).map((l) => ({
            id: l.id,
            nome: l.name,
          })),
          history: await consultas.listHistoryOfContact(tx, conversa.contactId, conversa.id),
        },
      };
    });
  }


  @Get('queues')
  @WithSession()
  queues(
    @Req() request: RequestWithSession,
  ): Promise<{ queues: { id: string; name: string }[] }> {
    const session = sessionOf(request);
    return noTenant(session.tenantId, async (tx) => ({ queues: await consultas.listQueues(tx) }));
  }


  @Get('contacts')
  @WithSession()
  contacts(
    @Req() requisicao: RequestWithSession,
    @Query('search') search?: string,
  ): Promise<{ contacts: consultas.ContactOfList[] }> {
    const sessao = sessionOf(requisicao);
    return noTenant(sessao.tenantId, async (tx) => ({
      contacts: await consultas.listContacts(tx, search ?? ''),
    }));
  }


  @Get('contatos/:id')
  @WithSession()
  contact(
    @Req() requisicao: RequestWithSession,
    @Param('id') id: string,
  ): Promise<{ contact: consultas.RecordOfContact; history: ConversationOfHistory[] }> {
    const sessao = sessionOf(requisicao);
    return noTenant(sessao.tenantId, async (tx) => {
      const contato = await consultas.loadContact(tx, id);
      if (!contato) throw PipeError.naoEncontrado('contato');
      return { contact: contato, history: await consultas.listHistoryOfContact(tx, id, null) };
    });
  }


  @Get('channels')
  @WithSession()
  channels(
    @Req() requisicao: RequestWithSession,
  ): Promise<{ channels: Awaited<ReturnType<typeof consultas.listChannelsWithTemplates>> }> {
    const sessao = sessionOf(requisicao);
    return noTenant(sessao.tenantId, async (tx) => ({
      channels: await consultas.listChannelsWithTemplates(tx),
    }));
  }


  @Get('tickets/:id')
  @WithSession()
  ticket(@Req() requisicao: RequestWithSession, @Param('id') id: string): Promise<TicketDoDesk> {
    const sessao = sessionOf(requisicao);
    return noTenant(sessao.tenantId, async (tx) => {
      const ticket = await consultas.carregarTicketAntigo(tx, id);
      if (!ticket) throw PipeError.naoEncontrado('conversa');
      return {
        ticket,
        itens: await consultas.listItemsOfConversation(tx, ticket.id),
        etiquetas: await consultas.listLabelsOfConversation(tx, ticket.id),
        status: await consultas.carregarStatus(tx, sessao.userId),
      };
    });
  }

  /**
   * "Minhas métricas" always uses the current attendant. The browser supplies the interval; if either timestamp is missing or unreadable, use today. Clamp a range wider than the screen limit at its start.
   */
  @Get('metrics')
  @WithSession()
  metrics(
    @Req() requisicao: RequestWithSession,
    @Query('inicio') inicioBruto?: string,
    @Query('fim') fimBruto?: string,
  ): Promise<ResponseOfMetrics> {
    const sessao = sessionOf(requisicao);
    const agora = new Date();
    let inicio = dataOuNada(inicioBruto);
    let fim = dataOuNada(fimBruto);
    if (!inicio || !fim) {
      inicio = new Date(agora);
      inicio.setHours(0, 0, 0, 0);
      fim = agora;
    }
    if (inicio > fim) [inicio, fim] = [fim, inicio];
    const tetoMs = TETO_OF_DAYS_OF_METRICS * 86_400_000;
    if (fim.getTime() - inicio.getTime() > tetoMs) inicio = new Date(fim.getTime() - tetoMs);

    const de = inicio;
    const ate = fim;
    return noTenant(sessao.tenantId, async (tx) => ({
      metrics: await loadMetrics(tx, sessao.userId, de, ate),
      status: await consultas.carregarStatus(tx, sessao.userId),
    }));
  }




  @Post('acoes/:acao')
  @HttpCode(200)
  @WithSession()
  async acao(
    @Req() requisicao: RequestWithSession,
    @Param('acao') nome: string,
    @Body() corpo: { campos?: CamposCrus },
  ): Promise<Resultado> {
    const sessao = sessionOf(requisicao);
    const acao = Object.hasOwn(ACTIONS, nome) ? ACTIONS[nome] : undefined;
    if (!acao) throw PipeError.naoEncontrado('ação');
    const campos = new Campos(corpo?.campos ?? {});
    return noTenant(sessao.tenantId, (tx) => acao(tx, sessao.tenantId, sessao.userId, campos));
  }
}
