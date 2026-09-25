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
import { noTenant } from '../banco.js';
import { PipeError } from '../erros.js';
import { WithSession, sessionOf } from '../sessao.js';
import type { RequestWithSession } from '../sessao.js';
import { fusoDoTenant } from '../dominio/gestao/janela.js';
import { uuidOuNada } from '../dominio/gestao/formato.js';
import * as cadastros from '../dominio/gestao/cadastros.js';
import * as comunicacao from '../dominio/gestao/comunicacao.js';
import * as configuracoes from '../dominio/gestao/configuracoes.js';
import * as palavrasProibidas from '../dominio/gestao/palavras-proibidas.js';
import * as regrasSla from '../dominio/gestao/regras-sla.js';
import * as regrasPrioridade from '../dominio/gestao/regras-prioridade.js';
import * as permissoesDoAtendente from '../dominio/gestao/permissoes-do-atendente.js';
import * as acoesRegras from '../dominio/gestao/acoes/regras.js';
import * as acoesAtendentes from '../dominio/gestao/acoes/atendentes.js';
import * as acoesComunicacao from '../dominio/gestao/acoes/comunicacao.js';
import * as acoesConfiguracoes from '../dominio/gestao/acoes/configuracoes.js';
import { Campos, type CamposCrus, type Resultado } from '../dominio/gestao/acoes/campos.js';

/**
 * `id` de recurso na URL: fora do padrão de uuid a resposta é 404 antes de ir
 * ao banco — mesma regra de `gestao-fluxo.ts` (URL é texto de fora, e o
 * Postgres recusa uuid malformado com 500, não 404).
 */
function idOu404(value: string, oQue: string): string {
  if (!uuidOuNada(value)) throw PipeError.naoEncontrado(oQue);
  return value;
}

/**
 * Os CADASTROS da Gestão — Regras, Atendentes, Comunicação e Preferências —
 * por sessão de navegador: as leituras de cada tela e as ações dos formulários.
 *
 * As ações são as Server Actions da Gestão em Next, movidas para
 * `dominio/gestao/acoes/*` com o corpo intacto: o formulário manda os campos
 * como JSON (`{ campos }`), `Campos` os oferece com `get`/`getAll` como o
 * `FormData` fazia, e a resposta é o mesmo `Resultado` — `ok` ou o motivo em
 * texto para a tela mostrar ao lado do botão.
 *
 * A lista de ações é FECHADA: só o que está no mapa abaixo pode ser chamado
 * pelo nome. Nome fora do mapa é 404, não `eval`.
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

@Controller('v1/gestao')
export class ManagementRegistrationsController {
  /* ------------------------------------------------------------ leituras */

  @Get('regras/atendimento')
  @WithSession()
  rulesOfAttendance(@Req() requisicao: RequestWithSession) {
    const sessao = sessionOf(requisicao);
    return noTenant(sessao.tenantId, (tx) => cadastros.loadRulesOfQueue(tx));
  }

  @Get('regras/horarios')
  @WithSession()
  horarios(@Req() requisicao: RequestWithSession) {
    const sessao = sessionOf(requisicao);
    return noTenant(sessao.tenantId, async (tx) => ({
      fuso: await fusoDoTenant(tx),
      ...(await cadastros.carregarHorarios(tx)),
    }));
  }

  @Get('atendentes/gestao')
  @WithSession()
  agents(@Req() requisicao: RequestWithSession) {
    const sessao = sessionOf(requisicao);
    return noTenant(sessao.tenantId, (tx) => cadastros.loadAgents(tx));
  }

  @Get('atendentes/filas')
  @WithSession()
  queues(@Req() request: RequestWithSession) {
    const session = sessionOf(request);
    return noTenant(session.tenantId, (tx) => cadastros.loadQueues(tx));
  }

  @Get('atendentes/pausas')
  @WithSession()
  pausas(@Req() requisicao: RequestWithSession) {
    const sessao = sessionOf(requisicao);
    return noTenant(sessao.tenantId, (tx) => cadastros.carregarPausas(tx));
  }

  @Get('comunicacao/modelos')
  @WithSession()
  modelos(@Req() requisicao: RequestWithSession) {
    const sessao = sessionOf(requisicao);
    /* Em série: as duas consultas dividem a mesma conexão. */
    return noTenant(sessao.tenantId, async (tx) => ({
      modelos: await comunicacao.carregarModelos(tx),
      canais: await comunicacao.loadChannelsWhatsapp(tx),
    }));
  }

  @Get('comunicacao/respostas-prontas')
  @WithSession()
  respostasProntas(@Req() requisicao: RequestWithSession) {
    const sessao = sessionOf(requisicao);
    return noTenant(sessao.tenantId, (tx) => comunicacao.carregarRespostasProntas(tx));
  }

  @Get('canais')
  @WithSession()
  channels(@Req() requisicao: RequestWithSession) {
    const sessao = sessionOf(requisicao);
    return noTenant(sessao.tenantId, (tx) => configuracoes.loadChannels(tx));
  }

  @Get('configuracoes/regras')
  @WithSession()
  regrasDeSla(@Req() requisicao: RequestWithSession) {
    const sessao = sessionOf(requisicao);
    return noTenant(sessao.tenantId, (tx) => configuracoes.carregarRegras(tx));
  }

  @Get('configuracoes/dados')
  @WithSession()
  data(@Req() requisicao: RequestWithSession) {
    const sessao = sessionOf(requisicao);
    return noTenant(sessao.tenantId, (tx) => configuracoes.loadData(tx));
  }

  @Get('configuracoes/gerais')
  @WithSession()
  general(@Req() requisicao: RequestWithSession) {
    const sessao = sessionOf(requisicao);
    return noTenant(sessao.tenantId, (tx) => configuracoes.loadGeneral(tx));
  }

  @Get('regras/prioridade')
  @WithSession()
  rulesOfPriority(@Req() requisicao: RequestWithSession) {
    const sessao = sessionOf(requisicao);
    return noTenant(sessao.tenantId, (tx) => regrasPrioridade.loadRulesOfPriority(tx));
  }

  /* -------------------------------------------------------- filas (item 1) */

  @Post('atendentes/filas')
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

  /* ------------------------------------------------------- horários (item 3) */

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

  @Post('configuracoes/regras')
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

  @Get('configuracoes/palavras-proibidas')
  @WithSession()
  listarPalavrasProibidas(@Req() requisicao: RequestWithSession) {
    const sessao = sessionOf(requisicao);
    return noTenant(sessao.tenantId, (tx) =>
      palavrasProibidas.carregarPalavrasProibidas(tx, sessao.tenantId),
    );
  }

  @Post('configuracoes/palavras-proibidas')
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

  @Post('regras/prioridade')
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

  /* ------------------------------------ permissões do atendente (tela própria)
     A origem abre `attendance.desk.team.permission` como PÁGINA, com a tabela
     "Tipo de permissão" × "Status" e "Salvar alterações"
     (`FICHA-atendentes-filas-pausas.md` §a.4). A seleção vai por
     `?atendentes=id,id` — a rota da origem também não tem `:id` na URL, porque
     a página atende vários de uma vez. */

  @Get('atendentes/permissoes')
  @WithSession()
  permissionsOfAgent(
    @Req() requisicao: RequestWithSession,
    @Query('atendentes') agents = '',
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

  @Patch('atendentes/permissoes')
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

  @Post('comunicacao/respostas-prontas')
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

  @Post('atendentes/pausas')
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

  /* --------------------------------------------------------------- ações */

  /** Um formulário da Gestão: `{ campos }` entra, `Resultado` sai. */
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
    const ator: Ator = { tipo: 'usuario', id: sessao.userId };
    const campos = new Campos(corpo?.campos ?? {});
    return noTenant(sessao.tenantId, (tx) => acao(tx, sessao.tenantId, ator, campos));
  }
}
