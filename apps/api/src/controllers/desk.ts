import { Body, Controller, Get, HttpCode, Param, Post, Query, Req } from '@nestjs/common';
import type { TransactionPipe as TransactionPipe } from '@pipe/db';
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
 * O DESK por sessão de navegador: as leituras de cada tela e as ações que
 * escreviam direto no banco.
 *
 * As leituras são as de `dominio/desk/consultas.ts` e `metricas.ts`, movidas
 * do Desk em Next; cada tela faz UMA ida — a fila com os catálogos, a conversa
 * com os itens e o painel, o ticket antigo, as métricas — na mesma transação
 * e em série, como as páginas faziam no servidor. O atendente é sempre o da
 * sessão: não há parâmetro para olhar a fila nem os números de outra pessoa.
 *
 * As ações são as Server Actions movidas para `dominio/desk/acoes.ts` com o
 * corpo intacto: o formulário manda os campos como JSON (`{ campos }`),
 * `Campos` os oferece com `get`/`getAll` como o `FormData` fazia, e a resposta
 * é o mesmo `Resultado`. A lista é FECHADA: nome fora do mapa é 404.
 *
 * Enviar, reenviar, encerrar e espera NÃO estão aqui: já eram
 * `POST /v1/conversas/…` e o navegador chama essas rotas direto.
 */
/** O atendente é o da sessão — é ele que muda de status e assina a nota. */
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
  /* O menu "⋮" do cartão (`dominio/desk/marcacoes.ts`): fixar e marcar como não lida. */
  fixar: marcacoes.fixar,
  marcarNaoLida: marcacoes.marcarNaoLida,
};

/** Quantos dias, no máximo, um recorte de métricas pode cobrir: os 90 da tela, com folga. */
const TETO_OF_DAYS_OF_METRICS = 92;

function dataOuNada(value: string | undefined): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

@Controller('v1/desk')
export class DeskController {
  /* ------------------------------------------------------------ leituras */

  /** A fila do atendente e os catálogos da coluna, numa ida só. */
  @Get('queue')
  @WithSession()
  queue(@Req() requisicao: RequestWithSession): Promise<QueueOfDesk> {
    const sessao = sessionOf(requisicao);
    // Em série, e não em `Promise.all`: a transação é uma conexão só, e disparar
    // em paralelo na mesma conexão derruba o `set_config` do tenant.
    return noTenant(sessao.tenantId, async (tx) => ({
      conversas: await consultas.listConversations(tx, sessao.userId),
      aguardando: await consultas.contarAguardando(tx, sessao.userId),
      status: await consultas.carregarStatus(tx, sessao.userId),
      motivos: await consultas.listarMotivosDePausa(tx),
      etiquetas: await consultas.listarEtiquetas(tx),
      colleagues: await consultas.listarColegas(tx, sessao.userId),
      respostas: await consultas.listarRespostasProntas(tx, sessao.userId),
    }));
  }

  /** A conversa aberta: mensagens e notas, templates do canal, etiquetas e histórico do contato. */
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
          conversa,
          itens: await consultas.listItemsOfConversation(tx, conversa.id),
          templates: await consultas.listarTemplatesAprovados(tx, conversa.channelId),
          etiquetasDaConversa: await consultas.listLabelsOfConversation(tx, conversa.id),
          labelsOfContact: await listLabelsOfContact(tx, conversa.contactId),
          history: await consultas.listHistoryOfContact(tx, conversa.contactId, conversa.id),
        },
      };
    });
  }

  /** As filas do cliente, para o seletor do modal de transferência. */
  @Get('queues')
  @WithSession()
  queues(
    @Req() request: RequestWithSession,
  ): Promise<{ queues: { id: string; nome: string }[] }> {
    const session = sessionOf(request);
    return noTenant(session.tenantId, async (tx) => ({ filas: await consultas.listQueues(tx) }));
  }

  /** A aba Contatos: a lista, com busca por nome ou telefone. */
  @Get('contacts')
  @WithSession()
  contacts(
    @Req() requisicao: RequestWithSession,
    @Query('search') search?: string,
  ): Promise<{ contacts: consultas.ContactOfList[] }> {
    const sessao = sessionOf(requisicao);
    return noTenant(sessao.tenantId, async (tx) => ({
      contatos: await consultas.listContacts(tx, search ?? ''),
    }));
  }

  /** Um contato da aba: a ficha e o histórico de atendimentos. */
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
      return { contato, history: await consultas.listHistoryOfContact(tx, id, null) };
    });
  }

  /** Os canais com os modelos aprovados — para a mensagem ativa e as ações em massa. */
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

  /** Um atendimento antigo, em leitura, aberto pelo histórico do contato. */
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
   * "Minhas métricas": sempre do próprio atendente. O intervalo vem pronto do
   * navegador; sem os dois instantes (ou com um deles ilegível) vale o dia de
   * hoje, e um recorte maior que o teto da tela é cortado no fim.
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

  /* --------------------------------------------------------------- ações */

  /** Um formulário do Desk: `{ campos }` entra, `Resultado` sai. */
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
