import { Controller, Get, Param, Query, Req } from '@nestjs/common';
import {
  hojeNoFuso,
  periodInterval,
  readPeriod,
  type ActiveMessagesData,
  type DashboardData,
  type Intervalo,
  type Period,
  type ArestaDaJornada,
  type ReportCustom,
  type VisaoGeral,
} from '@pipe/core/analise';
import { DIRECOES_MENSAGEM as DIRECTIONS_MESSAGE, TYPES_MESSAGE } from '@pipe/db/schema';
import { noTenant } from '../database.js';
import { PipeError } from '../errors.js';
import { WithSession, sessionOf } from '../session.js';
import type { RequestWithSession } from '../session.js';
import { lerCursor, lerLimite, type Page } from '../pagination.js';
import { loadContact, fusoDoTenant } from '../domain/management-flow.js';
import {
  carregarDashboard,
  carregarJornada,
  loadListOfContacts,
  loadLogOfMessages,
  loadMessagesActive,
  loadReports,
  carregarVisaoGeral,
  windowOfDatas,
  type LinhaDoLog,
} from '../domain/management-analytics.js';

/**
 * A ANÁLISE do contato (`/fluxo/:id/analise/**`), por sessão de navegador.
 *
 * O período é resolvido AQUI, no fuso da conta, como as páginas em Next faziam
 * no servidor: o "hoje" é o do tenant, não o do navegador de quem abre. A
 * resposta devolve o período que valeu (o pedido pode cair no padrão), para a
 * tela desenhar o chip certo.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DIA = /^\d{4}-\d{2}-\d{2}$/;

function uuidOu404(value: string): string {
  if (!UUID.test(value)) throw PipeError.naoEncontrado('fluxo');
  return value;
}

/** `moment().add(n, 'days')` sobre uma data sem hora. */
function somarDias(dia: string, n: number): string {
  const d = new Date(`${dia}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** `?de=&ate=` válidos e em ordem, ou o padrão da tela. */
function periodOfUrl(
  de: string | undefined,
  ate: string | undefined,
  padraoDe: string,
  padraoAte: string,
): { de: string; ate: string } {
  if (de && ate && DIA.test(de) && DIA.test(ate) && de <= ate) return { de, ate };
  return { de: padraoDe, ate: padraoAte };
}

export interface RespostaDoDashboard {
  period: Period;
  intervalo: Intervalo;
  hoje: string;
  data: DashboardData;
  lista: { type: 'interacao' | 'rejeicao'; nomes: string[] } | null;
}

export interface ResponseOfMessagesActive {
  periodo: Period;
  intervalo: Intervalo;
  hoje: string;
  /** O `startDateLimit` do `bds-datepicker`: 186 dias atrás. */
  limite: string;
  template: string | null;
  dados: ActiveMessagesData;
}

export interface RespostaDaVisaoGeral {
  dados: VisaoGeral;
  de: string;
  ate: string;
}

export interface RespostaDaJornada {
  arestas: ArestaDaJornada[];
  de: string;
  ate: string;
  min: string;
  max: string;
  router: boolean;
}

export interface ResponseOfReports {
  reports: ReportCustom[];
  fuso: string;
}

@Controller('v1/gestao/fluxos/:id/analise')
export class ManagementAnalyticsController {
  @Get('dashboard')
  @WithSession()
  async dashboard(
    @Req() request: RequestWithSession,
    @Param('id') id: string,
    @Query('periodo') periodRequest?: string,
    @Query('from') de?: string,
    @Query('to') ate?: string,
    @Query('contatos') contacts?: string,
  ): Promise<RespostaDoDashboard> {
    const session = sessionOf(request);
    uuidOu404(id);
    const resposta = await noTenant(session.tenantId, async (tx) => {
      const fuso = await fusoDoTenant(tx);
      const hoje = hojeNoFuso(fuso);
      let period = readPeriod(periodRequest);
      let intervalo = periodInterval(period, hoje, { de, ate, limiteDias: 90 });
      if (!intervalo) {
        period = 'today';
        intervalo = { inicio: hoje, fim: hoje };
      }
      const tipo: 'interacao' | 'rejeicao' | null =
        contacts === 'interacao' || contacts === 'rejeicao' ? contacts : null;
      const data = await carregarDashboard(tx, id, intervalo, fuso);
      if (!data) return null;
      const nomes = tipo ? await loadListOfContacts(tx, id, intervalo, fuso, tipo) : null;
      const lista: RespostaDoDashboard['lista'] = tipo && nomes ? { tipo, nomes } : null;
      return { period, intervalo, hoje, data, lista };
    });
    if (!resposta) throw PipeError.naoEncontrado('fluxo');
    return resposta;
  }

  @Get('mensagens-ativas')
  @WithSession()
  async messagesActive(
    @Req() requisicao: RequestWithSession,
    @Param('id') id: string,
    @Query('periodo') periodoPedido?: string,
    @Query('from') de?: string,
    @Query('to') ate?: string,
    @Query('template') templatePedido?: string,
  ): Promise<ResponseOfMessagesActive> {
    const sessao = sessionOf(requisicao);
    uuidOu404(id);
    return noTenant(sessao.tenantId, async (tx) => {
      const hoje = hojeNoFuso(await fusoDoTenant(tx));
      /* 186 dias é o `startDateLimit` que o `St` põe no `bds-datepicker`. */
      let periodo = readPeriod(periodoPedido);
      let intervalo = periodInterval(periodo, hoje, { de, ate, limiteDias: 186 });
      if (!intervalo) {
        periodo = 'today';
        intervalo = { inicio: hoje, fim: hoje };
      }
      const template = templatePedido?.trim() || null;
      const dados = await loadMessagesActive(tx, id, intervalo, template);
      return { periodo, intervalo, hoje, limite: somarDias(hoje, -186), template, dados };
    });
  }

  @Get('visao-geral')
  @WithSession()
  async visaoGeral(
    @Req() requisicao: RequestWithSession,
    @Param('id') id: string,
    @Query('from') dePedido?: string,
    @Query('to') atePedido?: string,
  ): Promise<RespostaDaVisaoGeral> {
    const sessao = sessionOf(requisicao);
    uuidOu404(id);
    return noTenant(sessao.tenantId, async (tx) => {
      const fuso = await fusoDoTenant(tx);
      const hoje = hojeNoFuso(fuso);
      const { de, ate } = periodOfUrl(dePedido, atePedido, somarDias(hoje, -7), hoje);
      const dados = await carregarVisaoGeral(tx, id, await windowOfDatas(tx, fuso, de, ate), fuso);
      return { dados, de, ate };
    });
  }

  @Get('jornada')
  @WithSession()
  async jornada(
    @Req() requisicao: RequestWithSession,
    @Param('id') id: string,
    @Query('from') dePedido?: string,
    @Query('to') atePedido?: string,
  ): Promise<RespostaDaJornada> {
    const sessao = sessionOf(requisicao);
    uuidOu404(id);
    const resposta = await noTenant(sessao.tenantId, async (tx) => {
      const contact = await loadContact(tx, sessao.tenantId, id);
      if (!contact) return null;
      const fuso = await fusoDoTenant(tx);
      const hoje = hojeNoFuso(fuso);
      const { de, ate } = periodOfUrl(dePedido, atePedido, somarDias(hoje, -1), hoje);
      const arestas = await carregarJornada(tx, id, await windowOfDatas(tx, fuso, de, ate));
      return {
        arestas,
        de,
        ate,
        min: somarDias(hoje, -30),
        max: somarDias(hoje, 1),
        roteador: contact.tipo === 'roteador',
      };
    });
    if (!resposta) throw PipeError.naoEncontrado('fluxo');
    return resposta;
  }

  @Get('relatorios')
  @WithSession()
  async reports(
    @Req() requisicao: RequestWithSession,
    @Param('id') id: string,
  ): Promise<ResponseOfReports> {
    const sessao = sessionOf(requisicao);
    uuidOu404(id);
    return noTenant(sessao.tenantId, async (tx) => ({
      relatorios: await loadReports(tx),
      fuso: await fusoDoTenant(tx),
    }));
  }

  /**
   * O Log de mensagens (`Growth › Log` na origem) — filtro por período,
   * direção e tipo, paginado por cursor (`?cursor=&limit=`, o mesmo formato
   * de `GET /v1/conversas/:id/mensagens`). `direcao`/`tipo` fora da lista são
   * ignorados, não erro — mesmo trato lenientede `contatos` em `dashboard()`.
   */
  @Get('log')
  @WithSession()
  async log(
    @Req() requisicao: RequestWithSession,
    @Param('id') id: string,
    @Query('search') search?: string,
    @Query('from') de?: string,
    @Query('to') ate?: string,
    @Query('direction') direction?: string,
    @Query('type') tipo?: string,
    @Query('cursor') cursorBruto?: string,
    @Query('limit') limiteBruto?: string,
  ): Promise<Page<LinhaDoLog>> {
    const sessao = sessionOf(requisicao);
    uuidOu404(id);
    const limite = lerLimite(limiteBruto);
    const cursor = lerCursor(cursorBruto);
    const resposta = await noTenant(sessao.tenantId, async (tx) => {
      // Mesmo trato de `jornada()`: fluxo de outro tenant não existe para a RLS,
      // e "sem fluxo" não pode devolver 200 com lista vazia — vira 404.
      const contato = await loadContact(tx, sessao.tenantId, id);
      if (!contato) return null;
      const fuso = await fusoDoTenant(tx);
      return loadLogOfMessages(
        tx,
        id,
        fuso,
        {
          search,
          de: de && DIA.test(de) ? de : undefined,
          ate: ate && DIA.test(ate) ? ate : undefined,
          direction: direction && (DIRECTIONS_MESSAGE as readonly string[]).includes(direction)
            ? direction
            : undefined,
          tipo: tipo && (TYPES_MESSAGE as readonly string[]).includes(tipo) ? tipo : undefined,
        },
        cursor,
        limite,
      );
    });
    if (!resposta) throw PipeError.naoEncontrado('fluxo');
    return resposta;
  }
}
