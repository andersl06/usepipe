import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
} from '@nestjs/common';
import type { Ator, TransactionPipe } from '@pipe/db';
import { noTenant } from '../database.js';
import { lerPagina } from '../pagination.js';
import { PipeError } from '../errors.js';
import { WithSession, sessionOf } from '../session.js';
import type { RequestWithSession } from '../session.js';
import { fusoDoTenant } from '../domain/management/window.js';
import { uuidOuNada } from '../domain/management/format.js';
import * as cadastros from '../domain/management/registrations.js';
import * as autoEncerramento from '../domain/management/queue-auto-close.js';
import * as comunicacao from '../domain/management/communication.js';
import * as atendimentoConfig from '../domain/management/atendimento-config.js';
import * as retornoDoModelo from '../domain/management/modelo-fluxo-retorno.js';
import * as configuracoes from '../domain/management/settings.js';
import * as palavrasProibidas from '../domain/management/palavras-proibidas.js';
import * as horarios from '../domain/management/horarios.js';
import * as regrasSla from '../domain/management/regras-sla.js';
import * as regrasPrioridade from '../domain/management/rules-priority.js';
import * as permissoesDoAtendente from '../domain/management/permissions-of-agent.js';
import * as acoesRegras from '../domain/management/actions/regras.js';
import * as acoesAtendentes from '../domain/management/actions/agents.js';
import * as acoesComunicacao from '../domain/management/actions/communication.js';
import * as acoesConfiguracoes from '../domain/management/actions/settings.js';
import { Campos, type CamposCrus, type Resultado } from '../domain/management/actions/campos.js';

/**
 * Reject a resource URL `id` outside UUID format with 404 before querying, as in `gestao-fluxo.ts`. URLs are untrusted text; Postgres would return a malformed-UUID 500 instead.
 */
function idOu404(value: string, oQue: string): string {
  if (!uuidOuNada(value)) throw PipeError.naoEncontrado(oQue);
  return value;
}

/**
 * The flow of the screen comes in the query (preferred, so DELETE needs no body) or in the body; a missing or malformed value is a 400.
 */
function flowRequired(query: string | undefined, corpo?: { flowId?: unknown }): string {
  const bruto = query ?? corpo?.flowId;
  const flowId = typeof bruto === 'string' ? uuidOuNada(bruto) : undefined;
  if (!flowId) throw PipeError.request('flow_required', 'Informe o fluxo.');
  return flowId;
}

/**
 * Management registrations for Rules, Attendants, Communication and Preferences use browser sessions for screen reads and form actions. The actions are Next Management Server Actions moved unchanged to `dominio/gestao/acoes/*`: the form sends JSON `{ campos }`, `Campos` exposes `get`/`getAll` like `FormData`, and returns the same `Resultado`, either `ok` or a reason shown beside the button. The action-name allowlist is closed: names outside the map return 404 and never reach `eval`.
 */
type Acao = (tx: TransactionPipe, tid: string, ator: Ator, data: Campos) => Promise<Resultado>;

const ACTIONS: Record<string, Acao> = {
  salvarHorario: acoesRegras.salvarHorario,
  salvarFaixa: acoesRegras.salvarFaixa,
  salvarExcecao: acoesRegras.saveException,
  salvarRegraFila: acoesRegras.saveRuleQueue,
  alternarRegraFila: acoesRegras.toggleRuleQueue,
  salvarFila: acoesAtendentes.saveQueue,
  salvarMotivoPausa: acoesAtendentes.salvarMotivoPausa,
  salvarRespostaPronta: acoesComunicacao.salvarRespostaPronta,
  salvarModelo: acoesComunicacao.saveTemplate,
  salvarIdentidade: acoesConfiguracoes.saveIdentity,
  salvarPesquisa: acoesConfiguracoes.salvarPesquisa,
  salvarEtiquetasDeEncerramento: acoesConfiguracoes.saveLabelsOfClosure,
  salvarTagsGlobais: acoesConfiguracoes.saveCatalogLabels,
};

@Controller('v1/management')
export class ManagementRegistrationsController {
  /* ------------------------------------------------------------ leituras */

  @Get('rules/attendance')
  @WithSession()
  rulesOfAttendance(@Req() requisicao: RequestWithSession, @Query('flowId') flowId?: string) {
    const sessao = sessionOf(requisicao);
    const flow = flowRequired(flowId);
    return noTenant(sessao.tenantId, (tx) => cadastros.loadRulesOfQueue(tx, sessao.tenantId, flow));
  }

  @Get('rules/schedules')
  @WithSession()
  horarios(@Req() requisicao: RequestWithSession) {
    const sessao = sessionOf(requisicao);
    return noTenant(sessao.tenantId, async (tx) => ({
      fuso: await fusoDoTenant(tx),
      ...(await cadastros.carregarHorarios(tx)),
    }));
  }

  @Get('agents/management')
  @WithSession()
  agents(@Req() requisicao: RequestWithSession) {
    const sessao = sessionOf(requisicao);
    return noTenant(sessao.tenantId, (tx) => cadastros.loadAgents(tx));
  }

  @Get('agents/queues')
  @WithSession()
  queues(@Req() request: RequestWithSession, @Query('flowId') flowId?: string) {
    const session = sessionOf(request);
    const flow = flowRequired(flowId);
    return noTenant(session.tenantId, (tx) => cadastros.loadQueues(tx, session.tenantId, flow));
  }

  @Get('agents/pauses')
  @WithSession()
  pausas(@Req() requisicao: RequestWithSession) {
    const sessao = sessionOf(requisicao);
    return noTenant(sessao.tenantId, (tx) => cadastros.carregarPausas(tx));
  }

  @Get('communication/templates')
  @WithSession()
  modelos(
    @Req() requisicao: RequestWithSession,
    @Query('pagina') paginaBruta?: string,
    @Query('porPagina') porPaginaBruta?: string,
    @Query('q') q?: string,
    @Query('status') status?: string,
    @Query('enabled') enabled?: string,
    @Query('returnBlock') returnBlock?: string,
  ) {
    const sessao = sessionOf(requisicao);
    const { pagina, porPagina, offset } = lerPagina(paginaBruta, porPaginaBruta);
    /* Run serially: the queries share one connection. */
    return noTenant(sessao.tenantId, async (tx) => {
      const { modelos, total } = await comunicacao.carregarPaginaDeModelos(tx, {
        q,
        status,
        enabled,
        returnBlock,
        limit: porPagina,
        offset,
      });
      const retornos = await retornoDoModelo.resolverRetornos(
        tx,
        sessao.tenantId,
        modelos.map((m) => ({ canalId: m.channelId, codigoGravado: m.codigoGravado })),
      );
      const emUso = await comunicacao.carregarRetornosEmUso(tx);
      const resolvidos = await retornoDoModelo.resolverRetornos(tx, sessao.tenantId, emUso);
      const porCodigo = new Map<string, string>();
      for (const r of resolvidos) {
        if (r.state === 'ok' && r.code) porCodigo.set(r.code, r.label ?? r.code);
      }
      const returnBlocks = [...porCodigo]
        .map(([code, label]) => ({ code, label }))
        .sort((x, y) => x.label.localeCompare(y.label, 'pt-BR'));
      return {
        modelos: modelos.map(({ codigoGravado: _codigo, ...m }, i) => ({ ...m, fluxoRetorno: retornos[i] })),
        returnBlocks,
        total,
        pagina,
        porPagina,
        channels: await comunicacao.loadChannelsWhatsapp(tx),
      };
    });
  }

  @Get('communication/templates/:id/blocks')
  @WithSession()
  blocosDoModelo(@Req() requisicao: RequestWithSession, @Param('id') id: string) {
    const sessao = sessionOf(requisicao);
    idOu404(id, 'modelo de mensagem');
    return noTenant(sessao.tenantId, (tx) => retornoDoModelo.listarBlocosDoModelo(tx, sessao.tenantId, id));
  }

  @Patch('communication/templates/:id')
  @WithSession()
  editarModelo(
    @Req() requisicao: RequestWithSession,
    @Param('id') id: string,
    @Body() corpo: retornoDoModelo.PedidoDeModelo,
  ) {
    const sessao = sessionOf(requisicao);
    idOu404(id, 'modelo de mensagem');
    return noTenant(sessao.tenantId, (tx) =>
      retornoDoModelo.editarModelo(tx, sessao.tenantId, sessao.userId, id, corpo),
    );
  }

  @Get('communication/responses-ready')
  @WithSession()
  respostasProntas(@Req() requisicao: RequestWithSession) {
    const sessao = sessionOf(requisicao);
    return noTenant(sessao.tenantId, (tx) => comunicacao.carregarRespostasProntas(tx));
  }

  @Get('channels')
  @WithSession()
  channels(@Req() requisicao: RequestWithSession) {
    const sessao = sessionOf(requisicao);
    return noTenant(sessao.tenantId, (tx) => configuracoes.loadChannels(tx));
  }

  @Get('settings/rules')
  @WithSession()
  regrasDeSla(@Req() requisicao: RequestWithSession) {
    const sessao = sessionOf(requisicao);
    return noTenant(sessao.tenantId, (tx) => configuracoes.carregarRegras(tx));
  }

  @Get('settings/data')
  @WithSession()
  data(@Req() requisicao: RequestWithSession) {
    const sessao = sessionOf(requisicao);
    return noTenant(sessao.tenantId, (tx) => configuracoes.loadData(tx));
  }

  /** Preferências globais do atendimento: o documento completo, com os padrões onde nada foi gravado. */
  @Get('settings/attendance')
  @WithSession()
  configuracaoDeAtendimento(@Req() requisicao: RequestWithSession) {
    const sessao = sessionOf(requisicao);
    return noTenant(sessao.tenantId, (tx) => atendimentoConfig.lerConfigAtendimento(tx, sessao.tenantId));
  }

  @Put('settings/attendance')
  @WithSession()
  gravarConfiguracaoDeAtendimento(@Req() requisicao: RequestWithSession, @Body() corpo: unknown) {
    const sessao = sessionOf(requisicao);
    return noTenant(sessao.tenantId, (tx) =>
      atendimentoConfig.gravarConfigAtendimento(tx, sessao.tenantId, sessao.userId, corpo),
    );
  }

  @Get('settings/general')
  @WithSession()
  general(@Req() requisicao: RequestWithSession) {
    const sessao = sessionOf(requisicao);
    return noTenant(sessao.tenantId, (tx) => configuracoes.loadGeneral(tx));
  }

  @Get('rules/priority')
  @WithSession()
  rulesOfPriority(@Req() requisicao: RequestWithSession, @Query('flowId') flowId?: string) {
    const sessao = sessionOf(requisicao);
    const flow = flowRequired(flowId);
    return noTenant(sessao.tenantId, (tx) => regrasPrioridade.loadRulesOfPriority(tx, sessao.tenantId, flow));
  }

  /* -------------------------------------------------------- filas (item 1) */

  @Post('agents/queues')
  @WithSession()
  async createQueue(
    @Req() requisicao: RequestWithSession,
    @Body() corpo: cadastros.RequestOfQueue & { flowId?: string },
    @Query('flowId') flowId?: string,
  ): Promise<{ id: string }> {
    const sessao = sessionOf(requisicao);
    const flow = flowRequired(flowId, corpo);
    return noTenant(sessao.tenantId, (tx) =>
      cadastros.createQueue(tx, sessao.tenantId, flow, sessao.userId, corpo),
    );
  }

  /** The default queue of the flow; `queueId: null` clears it. */
  @Put('agents/queues/default')
  @WithSession()
  async setDefaultQueue(
    @Req() requisicao: RequestWithSession,
    @Body() corpo: { flowId?: string; queueId?: string | null },
    @Query('flowId') flowId?: string,
  ): Promise<{ queueId: string | null }> {
    const sessao = sessionOf(requisicao);
    const flow = flowRequired(flowId, corpo);
    const queueId = corpo?.queueId ?? null;
    if (queueId !== null) idOu404(String(queueId), 'Fila');
    return noTenant(sessao.tenantId, (tx) =>
      cadastros.setDefaultQueueOfFlow(tx, sessao.tenantId, sessao.userId, flow, queueId),
    );
  }

  @Patch('agents/queues/:id')
  @WithSession()
  async editQueue(
    @Req() requisicao: RequestWithSession,
    @Param('id') id: string,
    @Body() corpo: cadastros.RequestOfEditOfQueue & { flowId?: string },
    @Query('flowId') flowId?: string,
  ): Promise<cadastros.QueueWritten> {
    const sessao = sessionOf(requisicao);
    idOu404(id, 'fila');
    const flow = flowRequired(flowId, corpo);
    return noTenant(sessao.tenantId, (tx) =>
      cadastros.editQueue(tx, sessao.tenantId, flow, sessao.userId, id, corpo),
    );
  }

  /** Tags da fila: lista completa substitui a anterior. */
  @Put('agents/queues/:id/tags')
  @WithSession()
  async saveQueueTags(
    @Req() requisicao: RequestWithSession,
    @Param('id') id: string,
    @Body() corpo: { tags?: unknown; flowId?: string },
    @Query('flowId') flowId?: string,
  ): Promise<{ tags: string[] }> {
    const sessao = sessionOf(requisicao);
    idOu404(id, 'fila');
    const flow = flowRequired(flowId, corpo);
    return noTenant(sessao.tenantId, (tx) =>
      autoEncerramento.saveQueueTags(tx, sessao.tenantId, flow, sessao.userId, id, corpo?.tags),
    );
  }

  /** Configuração de encerramento automático por inatividade (inclui o interruptor `ativo`). */
  @Put('agents/queues/:id/auto-close')
  @WithSession()
  async saveAutoClose(
    @Req() requisicao: RequestWithSession,
    @Param('id') id: string,
    @Body() corpo: Record<string, unknown>,
    @Query('flowId') flowId?: string,
  ): Promise<autoEncerramento.AutoCloseConfig> {
    const sessao = sessionOf(requisicao);
    idOu404(id, 'fila');
    const flow = flowRequired(flowId, corpo as { flowId?: unknown });
    return noTenant(sessao.tenantId, (tx) =>
      autoEncerramento.saveAutoClose(tx, sessao.tenantId, flow, sessao.userId, id, corpo),
    );
  }

  @Delete('agents/queues/:id')
  @HttpCode(204)
  @WithSession()
  async deleteQueue(
    @Req() requisicao: RequestWithSession,
    @Param('id') id: string,
    @Query('flowId') flowId?: string,
  ): Promise<void> {
    const sessao = sessionOf(requisicao);
    idOu404(id, 'fila');
    const flow = flowRequired(flowId);
    await noTenant(sessao.tenantId, (tx) =>
      cadastros.deleteQueue(tx, sessao.tenantId, flow, sessao.userId, id),
    );
  }

  @Post('agents/queues/:id/agents')
  @WithSession()
  async linkAgent(
    @Req() requisicao: RequestWithSession,
    @Param('id') id: string,
    @Body() corpo: { userId?: string; capacityOverride?: number | null; flowId?: string },
    @Query('flowId') flowId?: string,
  ): Promise<{ ok: true }> {
    const sessao = sessionOf(requisicao);
    idOu404(id, 'fila');
    const agentId = idOu404(String(corpo?.userId ?? ''), 'atendente');
    const flow = flowRequired(flowId, corpo);
    await noTenant(sessao.tenantId, (tx) =>
      cadastros.linkAgentInQueue(
        tx,
        sessao.tenantId,
        flow,
        sessao.userId,
        id,
        agentId,
        corpo?.capacityOverride ?? null,
      ),
    );
    return { ok: true };
  }

  @Delete('agents/queues/:id/agents/:agentId')
  @HttpCode(204)
  @WithSession()
  async unlinkAgent(
    @Req() requisicao: RequestWithSession,
    @Param('id') id: string,
    @Param('agentId') agentId: string,
    @Query('flowId') flowId?: string,
  ): Promise<void> {
    const sessao = sessionOf(requisicao);
    idOu404(id, 'fila');
    idOu404(agentId, 'atendente');
    const flow = flowRequired(flowId);
    await noTenant(sessao.tenantId, (tx) =>
      cadastros.unlinkAgentOfQueue(tx, sessao.tenantId, flow, sessao.userId, id, agentId),
    );
  }

  /* ------------------------------------------- regras de atendimento (item 1) */

  @Patch('rules/attendance/:id')
  @WithSession()
  async editRuleQueue(
    @Req() requisicao: RequestWithSession,
    @Param('id') id: string,
    @Body() corpo: cadastros.RequestOfEditOfRuleQueue & { flowId?: string },
    @Query('flowId') flowId?: string,
  ): Promise<cadastros.RuleQueueWritten> {
    const sessao = sessionOf(requisicao);
    idOu404(id, 'regra');
    const flow = flowRequired(flowId, corpo);
    return noTenant(sessao.tenantId, (tx) =>
      cadastros.editRuleQueue(tx, sessao.tenantId, flow, sessao.userId, id, corpo),
    );
  }

  @Delete('rules/attendance/:id')
  @HttpCode(204)
  @WithSession()
  async deleteRuleQueue(
    @Req() requisicao: RequestWithSession,
    @Param('id') id: string,
    @Query('flowId') flowId?: string,
  ): Promise<void> {
    const sessao = sessionOf(requisicao);
    idOu404(id, 'regra');
    const flow = flowRequired(flowId);
    await noTenant(sessao.tenantId, (tx) =>
      cadastros.deleteRuleQueue(tx, sessao.tenantId, flow, sessao.userId, id),
    );
  }



  @Post('rules/schedules')
  @WithSession()
  async criarHorario(@Req() requisicao: RequestWithSession, @Body() corpo: unknown): Promise<{ id: string }> {
    const sessao = sessionOf(requisicao);
    return noTenant(sessao.tenantId, (tx) => horarios.salvarHorarioCompleto(tx, sessao.tenantId, sessao.userId, corpo));
  }

  @Put('rules/schedules/:id')
  @WithSession()
  async substituirHorario(
    @Req() requisicao: RequestWithSession,
    @Param('id') id: string,
    @Body() corpo: unknown,
  ): Promise<{ id: string }> {
    const sessao = sessionOf(requisicao);
    idOu404(id, 'horário de atendimento');
    return noTenant(sessao.tenantId, (tx) =>
      horarios.salvarHorarioCompleto(tx, sessao.tenantId, sessao.userId, corpo, id),
    );
  }

  @Delete('rules/schedules/:id')
  @HttpCode(204)
  @WithSession()
  async excluirHorario(@Req() requisicao: RequestWithSession, @Param('id') id: string): Promise<void> {
    const sessao = sessionOf(requisicao);
    idOu404(id, 'horário de atendimento');
    await noTenant(sessao.tenantId, (tx) => horarios.excluirHorario(tx, sessao.tenantId, sessao.userId, id));
  }

  @Patch('rules/schedules/ranges/:id')
  @WithSession()
  async editarFaixaHorario(
    @Req() requisicao: RequestWithSession,
    @Param('id') id: string,
    @Body() corpo: cadastros.RequestOfEditOfRange,
  ): Promise<cadastros.FaixaGravada> {
    const sessao = sessionOf(requisicao);
    idOu404(id, 'faixa de horário');
    return noTenant(sessao.tenantId, (tx) =>
      cadastros.editarFaixaHorario(tx, sessao.tenantId, sessao.userId, id, corpo),
    );
  }

  @Delete('rules/schedules/ranges/:id')
  @HttpCode(204)
  @WithSession()
  async excluirFaixaHorario(@Req() requisicao: RequestWithSession, @Param('id') id: string): Promise<void> {
    const sessao = sessionOf(requisicao);
    idOu404(id, 'faixa de horário');
    await noTenant(sessao.tenantId, (tx) =>
      cadastros.excluirFaixaHorario(tx, sessao.tenantId, sessao.userId, id),
    );
  }

  @Patch('rules/schedules/exceptions/:id')
  @WithSession()
  async editExceptionSchedule(
    @Req() requisicao: RequestWithSession,
    @Param('id') id: string,
    @Body() corpo: cadastros.RequestOfEditOfException,
  ): Promise<cadastros.ExceptionWritten> {
    const sessao = sessionOf(requisicao);
    idOu404(id, 'exceção de horário');
    return noTenant(sessao.tenantId, (tx) =>
      cadastros.editExceptionSchedule(tx, sessao.tenantId, sessao.userId, id, corpo),
    );
  }

  @Delete('rules/schedules/exceptions/:id')
  @HttpCode(204)
  @WithSession()
  async deleteExceptionSchedule(@Req() requisicao: RequestWithSession, @Param('id') id: string): Promise<void> {
    const sessao = sessionOf(requisicao);
    idOu404(id, 'exceção de horário');
    await noTenant(sessao.tenantId, (tx) =>
      cadastros.deleteExceptionSchedule(tx, sessao.tenantId, sessao.userId, id),
    );
  }

  /* ------------------------------------------------------------ SLA (item 2) */

  @Post('settings/rules')
  @WithSession()
  async createRuleSla(
    @Req() requisicao: RequestWithSession,
    @Body() corpo: regrasSla.PedidoDeRegraSla,
  ): Promise<{ id: string }> {
    const sessao = sessionOf(requisicao);
    return noTenant(sessao.tenantId, (tx) =>
      regrasSla.createRuleSla(tx, sessao.tenantId, sessao.userId, corpo),
    );
  }

  @Post('settings/rules/policy')
  @WithSession()
  async criarPoliticaSla(@Req() requisicao: RequestWithSession, @Body() corpo: unknown): Promise<{ id: string }> {
    const sessao = sessionOf(requisicao);
    return noTenant(sessao.tenantId, (tx) =>
      regrasSla.salvarPoliticaSla(tx, sessao.tenantId, sessao.userId, corpo),
    );
  }

  @Put('settings/rules/policy/:id')
  @WithSession()
  async substituirPoliticaSla(
    @Req() requisicao: RequestWithSession,
    @Param('id') id: string,
    @Body() corpo: unknown,
  ): Promise<{ id: string }> {
    const sessao = sessionOf(requisicao);
    idOu404(id, 'regra de SLA');
    return noTenant(sessao.tenantId, (tx) =>
      regrasSla.salvarPoliticaSla(tx, sessao.tenantId, sessao.userId, corpo, id),
    );
  }

  @Delete('settings/rules/policy/:id')
  @HttpCode(204)
  @WithSession()
  async excluirPoliticaSla(@Req() requisicao: RequestWithSession, @Param('id') id: string): Promise<void> {
    const sessao = sessionOf(requisicao);
    idOu404(id, 'regra de SLA');
    await noTenant(sessao.tenantId, (tx) =>
      regrasSla.excluirPoliticaSla(tx, sessao.tenantId, sessao.userId, id),
    );
  }

  @Patch('settings/rules/:id')
  @WithSession()
  async editarRegraSla(
    @Req() requisicao: RequestWithSession,
    @Param('id') id: string,
    @Body() corpo: regrasSla.RequestOfEditOfRuleSla,
  ): Promise<regrasSla.RegraSlaGravada> {
    const sessao = sessionOf(requisicao);
    idOu404(id, 'regra de SLA');
    return noTenant(sessao.tenantId, (tx) =>
      regrasSla.editarRegraSla(tx, sessao.tenantId, sessao.userId, id, corpo),
    );
  }

  @Delete('settings/rules/:id')
  @HttpCode(204)
  @WithSession()
  async excluirRegraSla(@Req() requisicao: RequestWithSession, @Param('id') id: string): Promise<void> {
    const sessao = sessionOf(requisicao);
    idOu404(id, 'regra de SLA');
    await noTenant(sessao.tenantId, (tx) =>
      regrasSla.excluirRegraSla(tx, sessao.tenantId, sessao.userId, id),
    );
  }

  /* ------------------------------------------------------ palavras proibidas */

  @Get('settings/words-forbidden')
  @WithSession()
  listarPalavrasProibidas(@Req() requisicao: RequestWithSession) {
    const sessao = sessionOf(requisicao);
    return noTenant(sessao.tenantId, (tx) =>
      palavrasProibidas.carregarPalavrasProibidas(tx, sessao.tenantId),
    );
  }

  @Post('settings/words-forbidden')
  @WithSession()
  async createWordForbidden(
    @Req() requisicao: RequestWithSession,
    @Body() corpo: palavrasProibidas.PedidoDePalavraProibida,
  ): Promise<{ id: string }> {
    const sessao = sessionOf(requisicao);
    return noTenant(sessao.tenantId, (tx) =>
      palavrasProibidas.createWordForbidden(tx, sessao.tenantId, sessao.userId, corpo),
    );
  }

  @Patch('settings/words-forbidden/:id')
  @WithSession()
  async editarPalavraProibida(
    @Req() requisicao: RequestWithSession,
    @Param('id') id: string,
    @Body() corpo: palavrasProibidas.RequestOfEditOfWordForbidden,
  ): Promise<palavrasProibidas.PalavraProibidaListada> {
    const sessao = sessionOf(requisicao);
    idOu404(id, 'palavra proibida');
    return noTenant(sessao.tenantId, (tx) =>
      palavrasProibidas.editarPalavraProibida(tx, sessao.tenantId, sessao.userId, id, corpo),
    );
  }

  @Delete('settings/words-forbidden/:id')
  @HttpCode(204)
  @WithSession()
  async excluirPalavraProibida(
    @Req() requisicao: RequestWithSession,
    @Param('id') id: string,
  ): Promise<void> {
    const sessao = sessionOf(requisicao);
    idOu404(id, 'palavra proibida');
    await noTenant(sessao.tenantId, (tx) =>
      palavrasProibidas.excluirPalavraProibida(tx, sessao.tenantId, sessao.userId, id),
    );
  }

  /* ------------------------------------------------------- prioridade (item 4) */

  @Post('rules/priority')
  @WithSession()
  async createRulePriority(
    @Req() requisicao: RequestWithSession,
    @Body() corpo: regrasPrioridade.RequestOfRulePriority & { flowId?: string },
    @Query('flowId') flowId?: string,
  ): Promise<{ id: string }> {
    const sessao = sessionOf(requisicao);
    const flow = flowRequired(flowId, corpo);
    return noTenant(sessao.tenantId, (tx) =>
      regrasPrioridade.createRulePriority(tx, sessao.tenantId, flow, sessao.userId, corpo),
    );
  }

  @Patch('rules/priority/:id')
  @WithSession()
  async editRulePriority(
    @Req() requisicao: RequestWithSession,
    @Param('id') id: string,
    @Body() corpo: regrasPrioridade.RequestOfEditOfRulePriority & { flowId?: string },
    @Query('flowId') flowId?: string,
  ): Promise<regrasPrioridade.RulePriorityWritten> {
    const sessao = sessionOf(requisicao);
    idOu404(id, 'regra de prioridade');
    const flow = flowRequired(flowId, corpo);
    return noTenant(sessao.tenantId, (tx) =>
      regrasPrioridade.editRulePriority(tx, sessao.tenantId, flow, sessao.userId, id, corpo),
    );
  }

  @Delete('rules/priority/:id')
  @HttpCode(204)
  @WithSession()
  async deleteRulePriority(
    @Req() requisicao: RequestWithSession,
    @Param('id') id: string,
    @Query('flowId') flowId?: string,
  ): Promise<void> {
    const sessao = sessionOf(requisicao);
    idOu404(id, 'regra de prioridade');
    const flow = flowRequired(flowId);
    await noTenant(sessao.tenantId, (tx) =>
      regrasPrioridade.deleteRulePriority(tx, sessao.tenantId, flow, sessao.userId, id),
    );
  }

  /*
   * Attendant permissions are a separate page in the source: `attendance.desk.team.permission`, with the "Tipo de permissão" × "Status" table and "Salvar alterações" (`FICHA-atendentes-filas-pausas.md` §a.4). Selection uses `?atendentes=id,id`; the source route also has no `:id` because the page handles several attendants at once.
   */

  @Get('agents/permissions')
  @WithSession()
  permissionsOfAgent(
    @Req() requisicao: RequestWithSession,
    @Query('agents') agents = '',
  ): Promise<permissoesDoAtendente.PermissionsOfAgent> {
    const sessao = sessionOf(requisicao);
    const ids = agents
      .split(',')
      .map((i) => i.trim())
      .filter(Boolean)
      .map((i) => idOu404(i, 'atendente'));
    return noTenant(sessao.tenantId, (tx) =>
      permissoesDoAtendente.loadPermissionsOfAgent(tx, ids),
    );
  }

  @Patch('agents/permissions')
  @WithSession()
  async savePermissionsOfAgent(
    @Req() requisicao: RequestWithSession,
    @Body() corpo: permissoesDoAtendente.RequestOfPermissions,
  ): Promise<{ ok: true }> {
    const sessao = sessionOf(requisicao);
    for (const id of corpo?.userIds ?? []) idOu404(id, 'atendente');
    return noTenant(sessao.tenantId, (tx) =>
      permissoesDoAtendente.writePermissionsOfAgent(tx, sessao.tenantId, sessao.userId, corpo),
    );
  }

  /* ------------------------------------------------ respostas prontas (item 2) */

  @Post('communication/responses-ready')
  @WithSession()
  async createResponseReady(
    @Req() requisicao: RequestWithSession,
    @Body() corpo: comunicacao.PedidoDeRespostaPronta,
  ): Promise<{ id: string }> {
    const sessao = sessionOf(requisicao);
    return noTenant(sessao.tenantId, (tx) =>
      comunicacao.createResponseReady(tx, sessao.tenantId, sessao.userId, corpo),
    );
  }

  @Patch('communication/response-categories')
  @WithSession()
  async renomearCategoriaDeRespostas(
    @Req() requisicao: RequestWithSession,
    @Body() corpo: { name?: string; newName?: string },
  ): Promise<{ category: string; atualizadas: number }> {
    const sessao = sessionOf(requisicao);
    return noTenant(sessao.tenantId, (tx) =>
      comunicacao.renomearCategoriaDeRespostas(
        tx,
        sessao.tenantId,
        sessao.userId,
        String(corpo?.name ?? ''),
        String(corpo?.newName ?? ''),
      ),
    );
  }

  @Delete('communication/response-categories')
  @HttpCode(204)
  @WithSession()
  async excluirCategoriaDeRespostas(
    @Req() requisicao: RequestWithSession,
    @Query('name') name?: string,
  ): Promise<void> {
    const sessao = sessionOf(requisicao);
    await noTenant(sessao.tenantId, (tx) =>
      comunicacao.excluirCategoriaDeRespostas(tx, sessao.tenantId, sessao.userId, name ?? ''),
    );
  }

  @Patch('communication/responses-ready/:id')
  @WithSession()
  async editarRespostaPronta(
    @Req() requisicao: RequestWithSession,
    @Param('id') id: string,
    @Body() corpo: comunicacao.RequestOfEditOfResponseReady,
  ): Promise<comunicacao.RespostaProntaListada> {
    const sessao = sessionOf(requisicao);
    idOu404(id, 'resposta pronta');
    return noTenant(sessao.tenantId, (tx) =>
      comunicacao.editarRespostaPronta(tx, sessao.tenantId, sessao.userId, id, corpo),
    );
  }

  @Delete('communication/responses-ready/:id')
  @HttpCode(204)
  @WithSession()
  async excluirRespostaPronta(
    @Req() requisicao: RequestWithSession,
    @Param('id') id: string,
  ): Promise<void> {
    const sessao = sessionOf(requisicao);
    idOu404(id, 'resposta pronta');
    await noTenant(sessao.tenantId, (tx) =>
      comunicacao.excluirRespostaPronta(tx, sessao.tenantId, sessao.userId, id),
    );
  }

  /* -------------------------------------------------------- pausas (item 3) */

  @Post('agents/pauses')
  @WithSession()
  async createReasonPause(
    @Req() requisicao: RequestWithSession,
    @Body() corpo: cadastros.PedidoDeMotivoPausa,
  ): Promise<{ id: string }> {
    const sessao = sessionOf(requisicao);
    return noTenant(sessao.tenantId, (tx) =>
      cadastros.createReasonPause(tx, sessao.tenantId, sessao.userId, corpo),
    );
  }

  @Patch('agents/pauses/:id')
  @WithSession()
  async editarMotivoPausa(
    @Req() requisicao: RequestWithSession,
    @Param('id') id: string,
    @Body() corpo: cadastros.RequestOfEditOfReasonPause,
  ): Promise<cadastros.MotivoPausaGravado> {
    const sessao = sessionOf(requisicao);
    idOu404(id, 'motivo de pausa');
    return noTenant(sessao.tenantId, (tx) =>
      cadastros.editarMotivoPausa(tx, sessao.tenantId, sessao.userId, id, corpo),
    );
  }

  @Delete('agents/pauses/:id')
  @HttpCode(204)
  @WithSession()
  async excluirMotivoPausa(
    @Req() requisicao: RequestWithSession,
    @Param('id') id: string,
  ): Promise<void> {
    const sessao = sessionOf(requisicao);
    idOu404(id, 'motivo de pausa');
    await noTenant(sessao.tenantId, (tx) =>
      cadastros.excluirMotivoPausa(tx, sessao.tenantId, sessao.userId, id),
    );
  }




  @Post('actions/:acao')
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
    const ator: Ator = { type: 'usuario', id: sessao.userId };
    const campos = new Campos(corpo?.campos ?? {});
    return noTenant(sessao.tenantId, (tx) => acao(tx, sessao.tenantId, ator, campos));
  }
}
