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
} from '@pipe/core/analytics';
import { DIRECTIONS_MESSAGE, TYPES_MESSAGE } from '@pipe/db/schema';
import { noTenant } from '../database.js';
import { PipeError } from '../errors.js';
import { WithSession, sessionOf } from '../session.js';
import type { RequestWithSession } from '../session.js';
import { lerCursor, lerLimite, type Page } from '../pagination.js';
import { validarIntervalo } from './management-operations.js';
import { loadContact, fusoDoTenant } from '../domain/management-flow.js';
import {
  carregarDashboard,
  carregarJornada,
  loadListOfContacts,
  loadLogOfMessages,
  loadMessagesActive,
  loadReports,
  carregarVisaoGeral,
  windowOfDates,
  type LinhaDoLog,
} from '../domain/management-analytics.js';

/**
 * Contact analytics (`/fluxo/:id/analise/**`) uses a browser session. Resolve the period here in the account's timezone, as Next pages did on the server: "today" is the tenant's day, not the viewer's browser day. Return the period actually used, since the request may fall back to a default, so the screen shows the correct chip.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DIA = /^\d{4}-\d{2}-\d{2}$/;

function uuidOu404(value: string): string {
  if (!UUID.test(value)) throw PipeError.naoEncontrado('fluxo');
  return value;
}

/** Apply `moment().add(n, 'days')` semantics to a date without a time. */
function somarDias(dia: string, n: number): string {
  const d = new Date(`${dia}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Use valid, ordered `?de=&ate=` values, or the screen default. */
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

@Controller('v1/management/flows/:id/analytics')
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
      const lista: RespostaDoDashboard['lista'] = tipo && nomes ? { type: tipo, nomes } : null;
      return { period, intervalo, hoje, data, lista };
    });
    if (!resposta) throw PipeError.naoEncontrado('fluxo');
    return resposta;
  }

  @Get('messages-active')
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
      /* 186 days is the `startDateLimit` set by `St` on `bds-datepicker`. */
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

  @Get('view-overview')
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
      validarIntervalo(de, ate);
      const dados = await carregarVisaoGeral(tx, id, await windowOfDates(tx, fuso, de, ate), fuso);
      return { dados, de, ate };
    });
  }

  @Get('journey')
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
      validarIntervalo(de, ate);
      const arestas = await carregarJornada(tx, id, await windowOfDates(tx, fuso, de, ate));
      return {
        arestas,
        de,
        ate,
        min: somarDias(hoje, -30),
        max: somarDias(hoje, 1),
        router: contact.tipo === 'roteador',
      };
    });
    if (!resposta) throw PipeError.naoEncontrado('fluxo');
    return resposta;
  }

  @Get('reports')
  @WithSession()
  async reports(
    @Req() requisicao: RequestWithSession,
    @Param('id') id: string,
  ): Promise<ResponseOfReports> {
    const sessao = sessionOf(requisicao);
    uuidOu404(id);
    return noTenant(sessao.tenantId, async (tx) => ({
      reports: await loadReports(tx),
      fuso: await fusoDoTenant(tx),
    }));
  }

  /**
   * Message Log (`Growth › Log` in the source): filter by period, direction and type, with cursor pagination (`?cursor=&limit=`, as in `GET /v1/conversas/:id/mensagens`). Ignore `direcao` or `tipo` values outside the allowlist rather than erroring, matching the lenient `contatos` handling in `dashboard()`.
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
      // As in `jornada()`, RLS makes another tenant's flow nonexistent,
      // so a missing flow must return 404 rather than 200 with an empty list.
      const contato = await loadContact(tx, sessao.tenantId, id);
      if (!contato) return null;
      const fuso = await fusoDoTenant(tx);
      return loadLogOfMessages(
        tx,
        sessao.tenantId,
        id,
        fuso,
        {
          search,
          de: de && DIA.test(de) ? de : undefined,
          ate: ate && DIA.test(ate) ? ate : undefined,
          direction: direction && (DIRECTIONS_MESSAGE as readonly string[]).includes(direction)
            ? direction
            : undefined,
          type: tipo && (TYPES_MESSAGE as readonly string[]).includes(tipo) ? tipo : undefined,
        },
        cursor,
        limite,
      );
    });
    if (!resposta) throw PipeError.naoEncontrado('fluxo');
    return resposta;
  }
}
