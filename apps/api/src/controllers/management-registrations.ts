import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import type { Ator, TransactionPipe } from '@pipe/db';
import { noTenant } from '../database.js';
import { PipeError } from '../errors.js';
import { WithSession, sessionOf } from '../session.js';
import type { RequestWithSession } from '../session.js';
import { fusoDoTenant } from '../domain/management/window.js';
import { uuidOuNada } from '../domain/management/format.js';
import * as cadastros from '../domain/management/registrations.js';
import * as comunicacao from '../domain/management/communication.js';
import * as configuracoes from '../domain/management/settings.js';
import * as palavrasProibidas from '../domain/management/palavras-proibidas.js';
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
};

@Controller('v1/management')
export class ManagementRegistrationsController {
  /* ------------------------------------------------------------ leituras */

  @Get('rules/attendance')
  @WithSession()
  rulesOfAttendance(@Req() requisicao: RequestWithSession) {
    const sessao = sessionOf(requisicao);
    return noTenant(sessao.tenantId, (tx) => cadastros.loadRulesOfQueue(tx));
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
  queues(@Req() request: RequestWithSession) {
    const session = sessionOf(request);
    return noTenant(session.tenantId, (tx) => cadastros.loadQueues(tx));
  }

  @Get('agents/pauses')
  @WithSession()
  pausas(@Req() requisicao: RequestWithSession) {
    const sessao = sessionOf(requisicao);
    return noTenant(sessao.tenantId, (tx) => cadastros.carregarPausas(tx));
  }

  @Get('communication/templates')
  @WithSession()
  modelos(@Req() requisicao: RequestWithSession) {
    const sessao = sessionOf(requisicao);
    /* Run serially: both queries share one connection. */
    return noTenant(sessao.tenantId, async (tx) => ({
      modelos: await comunicacao.carregarModelos(tx),
      channels: await comunicacao.loadChannelsWhatsapp(tx),
    }));
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

  @Get('settings/general')
  @WithSession()
  general(@Req() requisicao: RequestWithSession) {
    const sessao = sessionOf(requisicao);
    return noTenant(sessao.tenantId, (tx) => configuracoes.loadGeneral(tx));
  }

  @Get('rules/priority')
  @WithSession()
  rulesOfPriority(@Req() requisicao: RequestWithSession) {
    const sessao = sessionOf(requisicao);
    return noTenant(sessao.tenantId, (tx) => regrasPrioridade.loadRulesOfPriority(tx));
  }

  /* -------------------------------------------------------- filas (item 1) */

  @Post('agents/queues')
  @WithSession()
  async createQueue(
    @Req() requisicao: RequestWithSession,
    @Body() corpo: cadastros.RequestOfQueue,
  ): Promise<{ id: string }> {
    const sessao = sessionOf(requisicao);
    return noTenant(sessao.tenantId, (tx) =>
      cadastros.createQueue(tx, sessao.tenantId, sessao.userId, corpo),
    );
  }

  @Patch('atendentes/filas/:id')
  @WithSession()
  async editarQueue(
    @Req() requisicao: RequestWithSession,
    @Param('id') id: string,
    @Body() corpo: cadastros.RequestOfEditOfQueue,
  ): Promise<cadastros.QueueWritten> {
    const sessao = sessionOf(requisicao);
    idOu404(id, 'fila');
    return noTenant(sessao.tenantId, (tx) =>
      cadastros.editarQueue(tx, sessao.tenantId, sessao.userId, id, corpo),
    );
  }

  @Delete('atendentes/filas/:id')
  @HttpCode(204)
  @WithSession()
  async deleteQueue(@Req() requisicao: RequestWithSession, @Param('id') id: string): Promise<void> {
    const sessao = sessionOf(requisicao);
    idOu404(id, 'fila');
    await noTenant(sessao.tenantId, (tx) =>
      cadastros.deleteQueue(tx, sessao.tenantId, sessao.userId, id),
    );
  }

  @Post('atendentes/filas/:id/atendentes')
  @WithSession()
  async vincularAgent(
    @Req() requisicao: RequestWithSession,
    @Param('id') id: string,
    @Body() corpo: { userId?: string; capacityOverride?: number | null },
  ): Promise<{ ok: true }> {
    const sessao = sessionOf(requisicao);
    idOu404(id, 'fila');
    const agentId = idOu404(String(corpo?.userId ?? ''), 'atendente');
    await noTenant(sessao.tenantId, (tx) =>
      cadastros.vincularAgentInQueue(
        tx,
        sessao.tenantId,
        sessao.userId,
        id,
        agentId,
        corpo?.capacityOverride ?? null,
      ),
    );
    return { ok: true };
  }

  @Delete('atendentes/filas/:id/atendentes/:atendenteId')
  @HttpCode(204)
  @WithSession()
  async unlinkAgent(
    @Req() requisicao: RequestWithSession,
    @Param('id') id: string,
    @Param('atendenteId') agentId: string,
  ): Promise<void> {
    const sessao = sessionOf(requisicao);
    idOu404(id, 'fila');
    idOu404(agentId, 'atendente');
    await noTenant(sessao.tenantId, (tx) =>
      cadastros.unlinkAgentOfQueue(tx, sessao.tenantId, sessao.userId, id, agentId),
    );
  }

  /* ------------------------------------------- regras de atendimento (item 1) */

  @Patch('regras/atendimento/:id')
  @WithSession()
  async editarRuleQueue(
    @Req() requisicao: RequestWithSession,
    @Param('id') id: string,
    @Body() corpo: cadastros.RequestOfEditOfRuleQueue,
  ): Promise<cadastros.RuleQueueWritten> {
    const sessao = sessionOf(requisicao);
    idOu404(id, 'regra');
    return noTenant(sessao.tenantId, (tx) =>
      cadastros.editarRuleQueue(tx, sessao.tenantId, sessao.userId, id, corpo),
    );
  }

  @Delete('regras/atendimento/:id')
  @HttpCode(204)
  @WithSession()
  async deleteRuleQueue(@Req() requisicao: RequestWithSession, @Param('id') id: string): Promise<void> {
    const sessao = sessionOf(requisicao);
    idOu404(id, 'regra');
    await noTenant(sessao.tenantId, (tx) =>
      cadastros.deleteRuleQueue(tx, sessao.tenantId, sessao.userId, id),
    );
  }



  @Patch('regras/horarios/faixas/:id')
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

  @Delete('regras/horarios/faixas/:id')
  @HttpCode(204)
  @WithSession()
  async excluirFaixaHorario(@Req() requisicao: RequestWithSession, @Param('id') id: string): Promise<void> {
    const sessao = sessionOf(requisicao);
    idOu404(id, 'faixa de horário');
    await noTenant(sessao.tenantId, (tx) =>
      cadastros.excluirFaixaHorario(tx, sessao.tenantId, sessao.userId, id),
    );
  }

  @Patch('regras/horarios/excecoes/:id')
  @WithSession()
  async editarExceptionSchedule(
    @Req() requisicao: RequestWithSession,
    @Param('id') id: string,
    @Body() corpo: cadastros.RequestOfEditOfException,
  ): Promise<cadastros.ExceptionWritten> {
    const sessao = sessionOf(requisicao);
    idOu404(id, 'exceção de horário');
    return noTenant(sessao.tenantId, (tx) =>
      cadastros.editarExceptionSchedule(tx, sessao.tenantId, sessao.userId, id, corpo),
    );
  }

  @Delete('regras/horarios/excecoes/:id')
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

  @Patch('configuracoes/regras/:id')
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

  @Delete('configuracoes/regras/:id')
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

  @Patch('configuracoes/palavras-proibidas/:id')
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

  @Delete('configuracoes/palavras-proibidas/:id')
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
    @Body() corpo: regrasPrioridade.RequestOfRulePriority,
  ): Promise<{ id: string }> {
    const sessao = sessionOf(requisicao);
    return noTenant(sessao.tenantId, (tx) =>
      regrasPrioridade.createRulePriority(tx, sessao.tenantId, sessao.userId, corpo),
    );
  }

  @Patch('regras/prioridade/:id')
  @WithSession()
  async editarRulePriority(
    @Req() requisicao: RequestWithSession,
    @Param('id') id: string,
    @Body() corpo: regrasPrioridade.RequestOfEditOfRulePriority,
  ): Promise<regrasPrioridade.RulePriorityWritten> {
    const sessao = sessionOf(requisicao);
    idOu404(id, 'regra de prioridade');
    return noTenant(sessao.tenantId, (tx) =>
      regrasPrioridade.editarRulePriority(tx, sessao.tenantId, sessao.userId, id, corpo),
    );
  }

  @Delete('regras/prioridade/:id')
  @HttpCode(204)
  @WithSession()
  async deleteRulePriority(@Req() requisicao: RequestWithSession, @Param('id') id: string): Promise<void> {
    const sessao = sessionOf(requisicao);
    idOu404(id, 'regra de prioridade');
    await noTenant(sessao.tenantId, (tx) =>
      regrasPrioridade.deleteRulePriority(tx, sessao.tenantId, sessao.userId, id),
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

  @Patch('comunicacao/respostas-prontas/:id')
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

  @Delete('comunicacao/respostas-prontas/:id')
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

  @Patch('atendentes/pausas/:id')
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

  @Delete('atendentes/pausas/:id')
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
    const ator: Ator = { type: 'usuario', id: sessao.userId };
    const campos = new Campos(corpo?.campos ?? {});
    return noTenant(sessao.tenantId, (tx) => acao(tx, sessao.tenantId, ator, campos));
  }
}
