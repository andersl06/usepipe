import { Body, Controller, Get, HttpCode, Param, Post, Query, Req } from '@nestjs/common';
import type { CloseConversationInput } from '@pipe/contracts';
import { noTenant } from '../database.js';
import { PipeError } from '../errors.js';
import { WithSession, sessionOf } from '../session.js';
import type { RequestWithSession } from '../session.js';
import { carregarCabecalho, type HeaderOfManagement } from '../domain/management/cabecalho.js';
import { dataIso, fusoDoTenant, windowOfDatas, windowOfToday } from '../domain/management/window.js';
import {
  loadMonitoring,
  loadPreviaOfConversation,
  falarWithAgentInMonitoring,
  type Monitoring,
} from '../domain/management/monitoring.js';
import {
  carregarCatalogos,
  loadHistory,
  type Catalogos,
  type LineHistory,
} from '../domain/management/history.js';
import { loadAttendance, type ReportAttendance } from '../domain/management/attendance.js';
import { loadEffort, type ReportEffort } from '../domain/management/effort.js';
import { loadSatisfaction, type ReportSatisfaction } from '../domain/management/satisfaction.js';
import {
  carregarFicha,
  loadQualityReview,
  type RecordOfEvaluation,
  type ApplicationOfQualityReview,
} from '../domain/management/quality-review.js';
import type { TransactionPipe } from '@pipe/db';
import { registrarAuditoria } from '@pipe/db';
import { closeConversation, transferConversation } from '../domain/conversation.js';
import { exigirPermission } from '../session.js';

/**
 * A OPERAÇÃO da Gestão — monitoramento, histórico, relatórios e monitoria —
 * por sessão de navegador. As consultas são as de `dominio/gestao/*`, movidas
 * da Gestão em Next; aqui só se resolve fuso, janela e filtro, como as páginas
 * faziam no servidor.
 *
 * Todo id de filtro passa por `uuidOuNada` e toda data por `dataOuNada`: link
 * colado com `?fila=abc` vira "sem filtro", não 500 no `::uuid` do Postgres.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATA = /^\d{4}-\d{2}-\d{2}$/;
const uuidOuNada = (v?: string) => (v && UUID.test(v) ? v : undefined);
const uuidsOfFilter = (v?: string | string[]) => [...new Set((Array.isArray(v) ? v : [v ?? ''])
  .flatMap(item => item.split(',')).map(item => item.trim()).filter(item => UUID.test(item)))];
const dataOuNada = (v?: string) => (v && DATA.test(v) ? v : undefined);

/** O período pedido, ou os últimos `dias` dias incluindo hoje. */
async function period(
  tx: TransactionPipe,
  fuso: string,
  de: string | undefined,
  ate: string | undefined,
  dias: number,
): Promise<{ de: string; ate: string; window: { start: Date; fim: Date } }> {
  const hoje = await windowOfToday(tx, fuso);
  const ateFinal = ate || dataIso(hoje.inicio, fuso);
  const deFinal = de || dataIso(new Date(hoje.inicio.getTime() - (dias - 1) * 86400e3), fuso);
  return { de: deFinal, ate: ateFinal, window: await windowOfDatas(tx, fuso, deFinal, ateFinal) };
}

/** Apenas o Histórico conta 30 datas civis, inclusive em mudança de fuso/DST. */
async function periodHistory(
  tx: TransactionPipe,
  fuso: string,
  de: string | undefined,
  ate: string | undefined,
): Promise<{ de: string; ate: string; janela: { start: Date; fim: Date } }> {
  const hoje = await windowOfToday(tx, fuso);
  const hojeLocal = dataIso(hoje.inicio, fuso);
  const ateFinal = ate || hojeLocal;
  const dia = new Date(`${hojeLocal}T00:00:00.000Z`);
  dia.setUTCDate(dia.getUTCDate() - 29);
  const deFinal = de || dia.toISOString().slice(0, 10);
  return { de: deFinal, ate: ateFinal, janela: await windowOfDatas(tx, fuso, deFinal, ateFinal) };
}

export interface ResponseOfMonitoring {
  fuso: string;
  /** O dia de hoje no fuso da conta, para o título. */
  janela: { start: Date; fim: Date };
  data: Monitoring;
}

export interface ResponseOfHistory {
  fuso: string;
  de: string;
  ate: string;
  catalogos: Catalogos;
  linhas: LineHistory[];
  truncado: boolean;
}

export interface ResponseOfReportOfAttendance {
  fuso: string;
  de: string;
  ate: string;
  catalogos: Catalogos;
  report: ReportAttendance;
}

export interface ResponseOfReport<T> {
  fuso: string;
  de: string;
  ate: string;
  relatorio: T;
}

export interface ResponseOfQualityReview {
  fuso: string;
  de: string;
  ate: string;
  catalogos: Catalogos;
  application: ApplicationOfQualityReview;
}

@Controller('v1/management')
export class ManagementOperationsController {
  /** As duas barras do topo: canais e avisos. Conta e pessoa vêm de `GET /v1/eu`. */
  @Get('header')
  @WithSession()
  async cabecalho(@Req() request: RequestWithSession): Promise<HeaderOfManagement> {
    const session = sessionOf(request);
    /* Banco fora do ar não pode apagar a barra: os canais somem, a tela fica. */
    return noTenant(session.tenantId, (tx) => carregarCabecalho(tx)).catch(
      (): HeaderOfManagement => ({ channels: [], avisos: 0 }),
    );
  }

  @Get('monitoring')
  @WithSession()
  async monitoring(
    @Req() requisicao: RequestWithSession,
    @Query('queue') queue?: string | string[],
    @Query('agent') agent?: string | string[],
  ): Promise<ResponseOfMonitoring> {
    const sessao = sessionOf(requisicao);
    return noTenant(sessao.tenantId, async (tx) => {
      const fuso = await fusoDoTenant(tx);
      const window = await windowOfToday(tx, fuso);
      const data = await loadMonitoring(tx, window, fuso, {
        queueIds: uuidsOfFilter(queue),
        agentIds: uuidsOfFilter(agent),
      });
      return { fuso, window, data };
    });
  }

  @Get('monitoramento/conversas/:id')
  @WithSession()
  async previaOfConversation(@Req() requisicao: RequestWithSession, @Param('id') id: string) {
    const sessao = sessionOf(requisicao);
    if (!UUID.test(id)) throw PipeError.naoEncontrado('Conversa');
    const previa = await noTenant(sessao.tenantId, async (tx) => {
      await exigirPermission(tx, sessao.userId, 'monitoramento.tempo_real.ver');
      return loadPreviaOfConversation(tx, sessao.userId, id);
    });
    if (!previa) throw PipeError.naoEncontrado('Conversa');
    return previa;
  }

  @Post('monitoramento/conversas/:id/notas')
  @HttpCode(201)
  @WithSession()
  async falarWithAgent(
    @Req() requisicao: RequestWithSession,
    @Param('id') id: string,
    @Body() corpo: { texto?: string },
  ): Promise<{ ok: true }> {
    const sessao = sessionOf(requisicao);
    if (!UUID.test(id)) throw PipeError.naoEncontrado('Conversa');
    await noTenant(sessao.tenantId, (tx) =>
      falarWithAgentInMonitoring(tx, sessao.tenantId, sessao.userId, id, corpo?.texto ?? ''),
    );
    return { ok: true };
  }

  @Post('monitoramento/conversas/:id/transferir')
  @WithSession()
  async transferInMonitoring(
    @Req() requisicao: RequestWithSession,
    @Param('id') id: string,
    @Body() corpo: { forQueueId?: string; forAgentId?: string },
  ): Promise<{ forConversationId: string }> {
    const sessao = sessionOf(requisicao);
    if (!UUID.test(id)) throw PipeError.naoEncontrado('Conversa');
    return noTenant(sessao.tenantId, async (tx) => {
      await exigirPermission(tx, sessao.userId, 'monitoramento.tempo_real.ver');
      await exigirPermission(tx, sessao.userId, 'conversa.transferir');
      const resultado = await transferConversation(
        { tenantId: sessao.tenantId, agentId: sessao.userId, exigirAssignment: false },
        { conversationId: id, forQueueId: corpo?.forQueueId ?? null, forAgentId: corpo?.forAgentId ?? null, motivo: null },
      );
      await registrarAuditoria(tx, sessao.tenantId, {
        ator: { tipo: 'usuario', id: sessao.userId }, acao: 'alterou', objetoTipo: 'conversa', objetoId: id,
        depois: { acao: 'transferiu_no_monitoramento', para: resultado.forConversationId },
      });
      return { para_conversa_id: resultado.forConversationId };
    });
  }

  @Post('monitoramento/conversas/:id/finalizar')
  @WithSession()
  async finalizeInMonitoring(
    @Req() requisicao: RequestWithSession,
    @Param('id') id: string,
    @Body() corpo: CloseConversationInput,
  ): Promise<{ state: string }> {
    const sessao = sessionOf(requisicao);
    if (!UUID.test(id)) throw PipeError.naoEncontrado('Conversa');
    return noTenant(sessao.tenantId, async (tx) => {
      await exigirPermission(tx, sessao.userId, 'monitoramento.tempo_real.ver');
      await exigirPermission(tx, sessao.userId, 'conversa.encerrar');
      const resultado = await closeConversation(
        { tenantId: sessao.tenantId, agentId: sessao.userId, exigirAssignment: false },
        { conversaId: id, etiquetaIds: corpo?.etiqueta_ids, etiquetaId: corpo?.etiqueta_id },
      );
      await registrarAuditoria(tx, sessao.tenantId, {
        ator: { tipo: 'usuario', id: sessao.userId }, acao: 'alterou', objetoTipo: 'conversa', objetoId: id,
        depois: { acao: 'finalizou_no_monitoramento' },
      });
      return { estado: resultado.estado };
    });
  }

  @Get('history')
  @WithSession()
  async history(
    @Req() requisicao: RequestWithSession,
    @Query('queue') fila?: string,
    @Query('agent') atendente?: string,
    @Query('etiqueta') etiqueta?: string,
    @Query('from') de?: string,
    @Query('to') ate?: string,
  ): Promise<ResponseOfHistory> {
    const sessao = sessionOf(requisicao);
    return noTenant(sessao.tenantId, async (tx) => {
      const fuso = await fusoDoTenant(tx);
      const p = await periodHistory(tx, fuso, dataOuNada(de), dataOuNada(ate));
      const catalogos = await carregarCatalogos(tx);
      const { linhas, truncado } = await loadHistory(tx, p.janela, {
        queueId: uuidOuNada(fila),
        agentId: uuidOuNada(atendente),
        etiquetaId: uuidOuNada(etiqueta),
      });
      return { fuso, de: p.de, ate: p.ate, catalogos, linhas, truncado };
    });
  }

  @Get('reports/attendance')
  @WithSession()
  async reportOfAttendance(
    @Req() requisicao: RequestWithSession,
    @Query('queue') fila?: string,
    @Query('agent') atendente?: string,
    @Query('from') de?: string,
    @Query('to') ate?: string,
  ): Promise<ResponseOfReportOfAttendance> {
    const sessao = sessionOf(requisicao);
    return noTenant(sessao.tenantId, async (tx) => {
      const fuso = await fusoDoTenant(tx);
      const p = await period(tx, fuso, dataOuNada(de), dataOuNada(ate), 7);
      const catalogos = await carregarCatalogos(tx);
      const report = await loadAttendance(tx, p.window, {
        queueId: uuidOuNada(fila),
        agentId: uuidOuNada(atendente),
      });
      return { fuso, de: p.de, ate: p.ate, catalogos, report };
    });
  }

  @Get('reports/effort')
  @WithSession()
  async reportOfEffort(
    @Req() requisicao: RequestWithSession,
    @Query('from') de?: string,
    @Query('to') ate?: string,
  ): Promise<ResponseOfReport<ReportEffort>> {
    const sessao = sessionOf(requisicao);
    return noTenant(sessao.tenantId, async (tx) => {
      const fuso = await fusoDoTenant(tx);
      const p = await period(tx, fuso, dataOuNada(de), dataOuNada(ate), 7);
      return { fuso, de: p.de, ate: p.ate, relatorio: await loadEffort(tx, p.window) };
    });
  }

  @Get('reports/satisfaction')
  @WithSession()
  async reportOfSatisfaction(
    @Req() requisicao: RequestWithSession,
    @Query('from') de?: string,
    @Query('to') ate?: string,
  ): Promise<ResponseOfReport<ReportSatisfaction>> {
    const sessao = sessionOf(requisicao);
    return noTenant(sessao.tenantId, async (tx) => {
      const fuso = await fusoDoTenant(tx);
      /* Satisfação olha 30 dias por padrão: pesquisa respondida é mais rara que conversa. */
      const p = await period(tx, fuso, dataOuNada(de), dataOuNada(ate), 30);
      return { fuso, de: p.de, ate: p.ate, relatorio: await loadSatisfaction(tx, p.window) };
    });
  }

  @Get('quality-review')
  @WithSession()
  async qualityReview(
    @Req() requisicao: RequestWithSession,
    @Query('agent') atendente?: string,
    @Query('avaliador') avaliador?: string,
    @Query('from') de?: string,
    @Query('to') ate?: string,
  ): Promise<ResponseOfQualityReview> {
    const sessao = sessionOf(requisicao);
    return noTenant(sessao.tenantId, async (tx) => {
      const fuso = await fusoDoTenant(tx);
      const p = await period(tx, fuso, dataOuNada(de), dataOuNada(ate), 30);
      const catalogos = await carregarCatalogos(tx);
      const application = await loadQualityReview(tx, p.window, {
        agentId: uuidOuNada(atendente),
        avaliadorTipo: avaliador || undefined,
      });
      return { fuso, de: p.de, ate: p.ate, catalogos, application };
    });
  }

  @Get('monitoria/:id')
  @WithSession()
  async ficha(
    @Req() requisicao: RequestWithSession,
    @Param('id') id: string,
  ): Promise<{ fuso: string; record: RecordOfEvaluation }> {
    const sessao = sessionOf(requisicao);
    if (!UUID.test(id)) throw PipeError.naoEncontrado('avaliação');
    const resposta = await noTenant(sessao.tenantId, async (tx) => {
      const ficha = await carregarFicha(tx, id);
      return ficha ? { fuso: await fusoDoTenant(tx), ficha } : null;
    });
    if (!resposta) throw PipeError.naoEncontrado('avaliação');
    return resposta;
  }
}
