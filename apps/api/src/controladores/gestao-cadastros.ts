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
import type { Ator, TransacaoPipe } from '@pipe/db';
import { noTenant } from '../banco.js';
import { ErroPipe } from '../erros.js';
import { ComSessao, sessaoDe } from '../sessao.js';
import type { RequisicaoComSessao } from '../sessao.js';
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
function idOu404(valor: string, oQue: string): string {
  if (!uuidOuNada(valor)) throw ErroPipe.naoEncontrado(oQue);
  return valor;
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
type Acao = (tx: TransacaoPipe, tid: string, ator: Ator, dados: Campos) => Promise<Resultado>;

const ACOES: Record<string, Acao> = {
  salvarHorario: acoesRegras.salvarHorario,
  salvarFaixa: acoesRegras.salvarFaixa,
  salvarExcecao: acoesRegras.salvarExcecao,
  salvarRegraFila: acoesRegras.salvarRegraFila,
  alternarRegraFila: acoesRegras.alternarRegraFila,
  salvarFila: acoesAtendentes.salvarFila,
  salvarMotivoPausa: acoesAtendentes.salvarMotivoPausa,
  salvarRespostaPronta: acoesComunicacao.salvarRespostaPronta,
  salvarModelo: acoesComunicacao.salvarModelo,
  salvarIdentidade: acoesConfiguracoes.salvarIdentidade,
  salvarPesquisa: acoesConfiguracoes.salvarPesquisa,
  salvarEtiquetasDeEncerramento: acoesConfiguracoes.salvarEtiquetasDeEncerramento,
};

@Controller('v1/gestao')
export class ControladorGestaoCadastros {
  /* ------------------------------------------------------------ leituras */

  @Get('regras/atendimento')
  @ComSessao()
  regrasDeAtendimento(@Req() requisicao: RequisicaoComSessao) {
    const sessao = sessaoDe(requisicao);
    return noTenant(sessao.tenantId, (tx) => cadastros.carregarRegrasDeFila(tx));
  }

  @Get('regras/horarios')
  @ComSessao()
  horarios(@Req() requisicao: RequisicaoComSessao) {
    const sessao = sessaoDe(requisicao);
    return noTenant(sessao.tenantId, async (tx) => ({
      fuso: await fusoDoTenant(tx),
      ...(await cadastros.carregarHorarios(tx)),
    }));
  }

  @Get('atendentes/gestao')
  @ComSessao()
  atendentes(@Req() requisicao: RequisicaoComSessao) {
    const sessao = sessaoDe(requisicao);
    return noTenant(sessao.tenantId, (tx) => cadastros.carregarAtendentes(tx));
  }

  @Get('atendentes/filas')
  @ComSessao()
  filas(@Req() requisicao: RequisicaoComSessao) {
    const sessao = sessaoDe(requisicao);
    return noTenant(sessao.tenantId, (tx) => cadastros.carregarFilas(tx));
  }

  @Get('atendentes/pausas')
  @ComSessao()
  pausas(@Req() requisicao: RequisicaoComSessao) {
    const sessao = sessaoDe(requisicao);
    return noTenant(sessao.tenantId, (tx) => cadastros.carregarPausas(tx));
  }

  @Get('comunicacao/modelos')
  @ComSessao()
  modelos(@Req() requisicao: RequisicaoComSessao) {
    const sessao = sessaoDe(requisicao);
    /* Em série: as duas consultas dividem a mesma conexão. */
    return noTenant(sessao.tenantId, async (tx) => ({
      modelos: await comunicacao.carregarModelos(tx),
      canais: await comunicacao.carregarCanaisWhatsapp(tx),
    }));
  }

  @Get('comunicacao/respostas-prontas')
  @ComSessao()
  respostasProntas(@Req() requisicao: RequisicaoComSessao) {
    const sessao = sessaoDe(requisicao);
    return noTenant(sessao.tenantId, (tx) => comunicacao.carregarRespostasProntas(tx));
  }

  @Get('canais')
  @ComSessao()
  canais(@Req() requisicao: RequisicaoComSessao) {
    const sessao = sessaoDe(requisicao);
    return noTenant(sessao.tenantId, (tx) => configuracoes.carregarCanais(tx));
  }

  @Get('configuracoes/regras')
  @ComSessao()
  regrasDeSla(@Req() requisicao: RequisicaoComSessao) {
    const sessao = sessaoDe(requisicao);
    return noTenant(sessao.tenantId, (tx) => configuracoes.carregarRegras(tx));
  }

  @Get('configuracoes/dados')
  @ComSessao()
  dados(@Req() requisicao: RequisicaoComSessao) {
    const sessao = sessaoDe(requisicao);
    return noTenant(sessao.tenantId, (tx) => configuracoes.carregarDados(tx));
  }

  @Get('configuracoes/gerais')
  @ComSessao()
  gerais(@Req() requisicao: RequisicaoComSessao) {
    const sessao = sessaoDe(requisicao);
    return noTenant(sessao.tenantId, (tx) => configuracoes.carregarGerais(tx));
  }

  @Get('regras/prioridade')
  @ComSessao()
  regrasDePrioridade(@Req() requisicao: RequisicaoComSessao) {
    const sessao = sessaoDe(requisicao);
    return noTenant(sessao.tenantId, (tx) => regrasPrioridade.carregarRegrasDePrioridade(tx));
  }

  /* -------------------------------------------------------- filas (item 1) */

  @Post('atendentes/filas')
  @ComSessao()
  async criarFila(
    @Req() requisicao: RequisicaoComSessao,
    @Body() corpo: cadastros.PedidoDeFila,
  ): Promise<{ id: string }> {
    const sessao = sessaoDe(requisicao);
    return noTenant(sessao.tenantId, (tx) =>
      cadastros.criarFila(tx, sessao.tenantId, sessao.usuarioId, corpo),
    );
  }

  @Patch('atendentes/filas/:id')
  @ComSessao()
  async editarFila(
    @Req() requisicao: RequisicaoComSessao,
    @Param('id') id: string,
    @Body() corpo: cadastros.PedidoDeEdicaoDeFila,
  ): Promise<cadastros.FilaGravada> {
    const sessao = sessaoDe(requisicao);
    idOu404(id, 'fila');
    return noTenant(sessao.tenantId, (tx) =>
      cadastros.editarFila(tx, sessao.tenantId, sessao.usuarioId, id, corpo),
    );
  }

  @Delete('atendentes/filas/:id')
  @HttpCode(204)
  @ComSessao()
  async excluirFila(@Req() requisicao: RequisicaoComSessao, @Param('id') id: string): Promise<void> {
    const sessao = sessaoDe(requisicao);
    idOu404(id, 'fila');
    await noTenant(sessao.tenantId, (tx) =>
      cadastros.excluirFila(tx, sessao.tenantId, sessao.usuarioId, id),
    );
  }

  @Post('atendentes/filas/:id/atendentes')
  @ComSessao()
  async vincularAtendente(
    @Req() requisicao: RequisicaoComSessao,
    @Param('id') id: string,
    @Body() corpo: { usuarioId?: string; capacidadeOverride?: number | null },
  ): Promise<{ ok: true }> {
    const sessao = sessaoDe(requisicao);
    idOu404(id, 'fila');
    const atendenteId = idOu404(String(corpo?.usuarioId ?? ''), 'atendente');
    await noTenant(sessao.tenantId, (tx) =>
      cadastros.vincularAtendenteNaFila(
        tx,
        sessao.tenantId,
        sessao.usuarioId,
        id,
        atendenteId,
        corpo?.capacidadeOverride ?? null,
      ),
    );
    return { ok: true };
  }

  @Delete('atendentes/filas/:id/atendentes/:atendenteId')
  @HttpCode(204)
  @ComSessao()
  async desvincularAtendente(
    @Req() requisicao: RequisicaoComSessao,
    @Param('id') id: string,
    @Param('atendenteId') atendenteId: string,
  ): Promise<void> {
    const sessao = sessaoDe(requisicao);
    idOu404(id, 'fila');
    idOu404(atendenteId, 'atendente');
    await noTenant(sessao.tenantId, (tx) =>
      cadastros.desvincularAtendenteDaFila(tx, sessao.tenantId, sessao.usuarioId, id, atendenteId),
    );
  }

  /* ------------------------------------------- regras de atendimento (item 1) */

  @Patch('regras/atendimento/:id')
  @ComSessao()
  async editarRegraFila(
    @Req() requisicao: RequisicaoComSessao,
    @Param('id') id: string,
    @Body() corpo: cadastros.PedidoDeEdicaoDeRegraFila,
  ): Promise<cadastros.RegraFilaGravada> {
    const sessao = sessaoDe(requisicao);
    idOu404(id, 'regra');
    return noTenant(sessao.tenantId, (tx) =>
      cadastros.editarRegraFila(tx, sessao.tenantId, sessao.usuarioId, id, corpo),
    );
  }

  @Delete('regras/atendimento/:id')
  @HttpCode(204)
  @ComSessao()
  async excluirRegraFila(@Req() requisicao: RequisicaoComSessao, @Param('id') id: string): Promise<void> {
    const sessao = sessaoDe(requisicao);
    idOu404(id, 'regra');
    await noTenant(sessao.tenantId, (tx) =>
      cadastros.excluirRegraFila(tx, sessao.tenantId, sessao.usuarioId, id),
    );
  }

  /* ------------------------------------------------------- horários (item 3) */

  @Patch('regras/horarios/faixas/:id')
  @ComSessao()
  async editarFaixaHorario(
    @Req() requisicao: RequisicaoComSessao,
    @Param('id') id: string,
    @Body() corpo: cadastros.PedidoDeEdicaoDeFaixa,
  ): Promise<cadastros.FaixaGravada> {
    const sessao = sessaoDe(requisicao);
    idOu404(id, 'faixa de horário');
    return noTenant(sessao.tenantId, (tx) =>
      cadastros.editarFaixaHorario(tx, sessao.tenantId, sessao.usuarioId, id, corpo),
    );
  }

  @Delete('regras/horarios/faixas/:id')
  @HttpCode(204)
  @ComSessao()
  async excluirFaixaHorario(@Req() requisicao: RequisicaoComSessao, @Param('id') id: string): Promise<void> {
    const sessao = sessaoDe(requisicao);
    idOu404(id, 'faixa de horário');
    await noTenant(sessao.tenantId, (tx) =>
      cadastros.excluirFaixaHorario(tx, sessao.tenantId, sessao.usuarioId, id),
    );
  }

  @Patch('regras/horarios/excecoes/:id')
  @ComSessao()
  async editarExcecaoHorario(
    @Req() requisicao: RequisicaoComSessao,
    @Param('id') id: string,
    @Body() corpo: cadastros.PedidoDeEdicaoDeExcecao,
  ): Promise<cadastros.ExcecaoGravada> {
    const sessao = sessaoDe(requisicao);
    idOu404(id, 'exceção de horário');
    return noTenant(sessao.tenantId, (tx) =>
      cadastros.editarExcecaoHorario(tx, sessao.tenantId, sessao.usuarioId, id, corpo),
    );
  }

  @Delete('regras/horarios/excecoes/:id')
  @HttpCode(204)
  @ComSessao()
  async excluirExcecaoHorario(@Req() requisicao: RequisicaoComSessao, @Param('id') id: string): Promise<void> {
    const sessao = sessaoDe(requisicao);
    idOu404(id, 'exceção de horário');
    await noTenant(sessao.tenantId, (tx) =>
      cadastros.excluirExcecaoHorario(tx, sessao.tenantId, sessao.usuarioId, id),
    );
  }

  /* ------------------------------------------------------------ SLA (item 2) */

  @Post('configuracoes/regras')
  @ComSessao()
  async criarRegraSla(
    @Req() requisicao: RequisicaoComSessao,
    @Body() corpo: regrasSla.PedidoDeRegraSla,
  ): Promise<{ id: string }> {
    const sessao = sessaoDe(requisicao);
    return noTenant(sessao.tenantId, (tx) =>
      regrasSla.criarRegraSla(tx, sessao.tenantId, sessao.usuarioId, corpo),
    );
  }

  @Patch('configuracoes/regras/:id')
  @ComSessao()
  async editarRegraSla(
    @Req() requisicao: RequisicaoComSessao,
    @Param('id') id: string,
    @Body() corpo: regrasSla.PedidoDeEdicaoDeRegraSla,
  ): Promise<regrasSla.RegraSlaGravada> {
    const sessao = sessaoDe(requisicao);
    idOu404(id, 'regra de SLA');
    return noTenant(sessao.tenantId, (tx) =>
      regrasSla.editarRegraSla(tx, sessao.tenantId, sessao.usuarioId, id, corpo),
    );
  }

  @Delete('configuracoes/regras/:id')
  @HttpCode(204)
  @ComSessao()
  async excluirRegraSla(@Req() requisicao: RequisicaoComSessao, @Param('id') id: string): Promise<void> {
    const sessao = sessaoDe(requisicao);
    idOu404(id, 'regra de SLA');
    await noTenant(sessao.tenantId, (tx) =>
      regrasSla.excluirRegraSla(tx, sessao.tenantId, sessao.usuarioId, id),
    );
  }

  /* ------------------------------------------------------ palavras proibidas */

  @Get('configuracoes/palavras-proibidas')
  @ComSessao()
  listarPalavrasProibidas(@Req() requisicao: RequisicaoComSessao) {
    const sessao = sessaoDe(requisicao);
    return noTenant(sessao.tenantId, (tx) =>
      palavrasProibidas.carregarPalavrasProibidas(tx, sessao.tenantId),
    );
  }

  @Post('configuracoes/palavras-proibidas')
  @ComSessao()
  async criarPalavraProibida(
    @Req() requisicao: RequisicaoComSessao,
    @Body() corpo: palavrasProibidas.PedidoDePalavraProibida,
  ): Promise<{ id: string }> {
    const sessao = sessaoDe(requisicao);
    return noTenant(sessao.tenantId, (tx) =>
      palavrasProibidas.criarPalavraProibida(tx, sessao.tenantId, sessao.usuarioId, corpo),
    );
  }

  @Patch('configuracoes/palavras-proibidas/:id')
  @ComSessao()
  async editarPalavraProibida(
    @Req() requisicao: RequisicaoComSessao,
    @Param('id') id: string,
    @Body() corpo: palavrasProibidas.PedidoDeEdicaoDePalavraProibida,
  ): Promise<palavrasProibidas.PalavraProibidaListada> {
    const sessao = sessaoDe(requisicao);
    idOu404(id, 'palavra proibida');
    return noTenant(sessao.tenantId, (tx) =>
      palavrasProibidas.editarPalavraProibida(tx, sessao.tenantId, sessao.usuarioId, id, corpo),
    );
  }

  @Delete('configuracoes/palavras-proibidas/:id')
  @HttpCode(204)
  @ComSessao()
  async excluirPalavraProibida(
    @Req() requisicao: RequisicaoComSessao,
    @Param('id') id: string,
  ): Promise<void> {
    const sessao = sessaoDe(requisicao);
    idOu404(id, 'palavra proibida');
    await noTenant(sessao.tenantId, (tx) =>
      palavrasProibidas.excluirPalavraProibida(tx, sessao.tenantId, sessao.usuarioId, id),
    );
  }

  /* ------------------------------------------------------- prioridade (item 4) */

  @Post('regras/prioridade')
  @ComSessao()
  async criarRegraPrioridade(
    @Req() requisicao: RequisicaoComSessao,
    @Body() corpo: regrasPrioridade.PedidoDeRegraPrioridade,
  ): Promise<{ id: string }> {
    const sessao = sessaoDe(requisicao);
    return noTenant(sessao.tenantId, (tx) =>
      regrasPrioridade.criarRegraPrioridade(tx, sessao.tenantId, sessao.usuarioId, corpo),
    );
  }

  @Patch('regras/prioridade/:id')
  @ComSessao()
  async editarRegraPrioridade(
    @Req() requisicao: RequisicaoComSessao,
    @Param('id') id: string,
    @Body() corpo: regrasPrioridade.PedidoDeEdicaoDeRegraPrioridade,
  ): Promise<regrasPrioridade.RegraPrioridadeGravada> {
    const sessao = sessaoDe(requisicao);
    idOu404(id, 'regra de prioridade');
    return noTenant(sessao.tenantId, (tx) =>
      regrasPrioridade.editarRegraPrioridade(tx, sessao.tenantId, sessao.usuarioId, id, corpo),
    );
  }

  @Delete('regras/prioridade/:id')
  @HttpCode(204)
  @ComSessao()
  async excluirRegraPrioridade(@Req() requisicao: RequisicaoComSessao, @Param('id') id: string): Promise<void> {
    const sessao = sessaoDe(requisicao);
    idOu404(id, 'regra de prioridade');
    await noTenant(sessao.tenantId, (tx) =>
      regrasPrioridade.excluirRegraPrioridade(tx, sessao.tenantId, sessao.usuarioId, id),
    );
  }

  /* ------------------------------------ permissões do atendente (tela própria)
     A origem abre `attendance.desk.team.permission` como PÁGINA, com a tabela
     "Tipo de permissão" × "Status" e "Salvar alterações"
     (`FICHA-atendentes-filas-pausas.md` §a.4). A seleção vai por
     `?atendentes=id,id` — a rota da origem também não tem `:id` na URL, porque
     a página atende vários de uma vez. */

  @Get('atendentes/permissoes')
  @ComSessao()
  permissoesDoAtendente(
    @Req() requisicao: RequisicaoComSessao,
    @Query('atendentes') atendentes = '',
  ): Promise<permissoesDoAtendente.PermissoesDoAtendente> {
    const sessao = sessaoDe(requisicao);
    const ids = atendentes
      .split(',')
      .map((i) => i.trim())
      .filter(Boolean)
      .map((i) => idOu404(i, 'atendente'));
    return noTenant(sessao.tenantId, (tx) =>
      permissoesDoAtendente.carregarPermissoesDoAtendente(tx, ids),
    );
  }

  @Patch('atendentes/permissoes')
  @ComSessao()
  async salvarPermissoesDoAtendente(
    @Req() requisicao: RequisicaoComSessao,
    @Body() corpo: permissoesDoAtendente.PedidoDePermissoes,
  ): Promise<{ ok: true }> {
    const sessao = sessaoDe(requisicao);
    for (const id of corpo?.usuarioIds ?? []) idOu404(id, 'atendente');
    return noTenant(sessao.tenantId, (tx) =>
      permissoesDoAtendente.gravarPermissoesDoAtendente(tx, sessao.tenantId, sessao.usuarioId, corpo),
    );
  }

  /* ------------------------------------------------ respostas prontas (item 2) */

  @Post('comunicacao/respostas-prontas')
  @ComSessao()
  async criarRespostaPronta(
    @Req() requisicao: RequisicaoComSessao,
    @Body() corpo: comunicacao.PedidoDeRespostaPronta,
  ): Promise<{ id: string }> {
    const sessao = sessaoDe(requisicao);
    return noTenant(sessao.tenantId, (tx) =>
      comunicacao.criarRespostaPronta(tx, sessao.tenantId, sessao.usuarioId, corpo),
    );
  }

  @Patch('comunicacao/respostas-prontas/:id')
  @ComSessao()
  async editarRespostaPronta(
    @Req() requisicao: RequisicaoComSessao,
    @Param('id') id: string,
    @Body() corpo: comunicacao.PedidoDeEdicaoDeRespostaPronta,
  ): Promise<comunicacao.RespostaProntaListada> {
    const sessao = sessaoDe(requisicao);
    idOu404(id, 'resposta pronta');
    return noTenant(sessao.tenantId, (tx) =>
      comunicacao.editarRespostaPronta(tx, sessao.tenantId, sessao.usuarioId, id, corpo),
    );
  }

  @Delete('comunicacao/respostas-prontas/:id')
  @HttpCode(204)
  @ComSessao()
  async excluirRespostaPronta(
    @Req() requisicao: RequisicaoComSessao,
    @Param('id') id: string,
  ): Promise<void> {
    const sessao = sessaoDe(requisicao);
    idOu404(id, 'resposta pronta');
    await noTenant(sessao.tenantId, (tx) =>
      comunicacao.excluirRespostaPronta(tx, sessao.tenantId, sessao.usuarioId, id),
    );
  }

  /* -------------------------------------------------------- pausas (item 3) */

  @Post('atendentes/pausas')
  @ComSessao()
  async criarMotivoPausa(
    @Req() requisicao: RequisicaoComSessao,
    @Body() corpo: cadastros.PedidoDeMotivoPausa,
  ): Promise<{ id: string }> {
    const sessao = sessaoDe(requisicao);
    return noTenant(sessao.tenantId, (tx) =>
      cadastros.criarMotivoPausa(tx, sessao.tenantId, sessao.usuarioId, corpo),
    );
  }

  @Patch('atendentes/pausas/:id')
  @ComSessao()
  async editarMotivoPausa(
    @Req() requisicao: RequisicaoComSessao,
    @Param('id') id: string,
    @Body() corpo: cadastros.PedidoDeEdicaoDeMotivoPausa,
  ): Promise<cadastros.MotivoPausaGravado> {
    const sessao = sessaoDe(requisicao);
    idOu404(id, 'motivo de pausa');
    return noTenant(sessao.tenantId, (tx) =>
      cadastros.editarMotivoPausa(tx, sessao.tenantId, sessao.usuarioId, id, corpo),
    );
  }

  @Delete('atendentes/pausas/:id')
  @HttpCode(204)
  @ComSessao()
  async excluirMotivoPausa(
    @Req() requisicao: RequisicaoComSessao,
    @Param('id') id: string,
  ): Promise<void> {
    const sessao = sessaoDe(requisicao);
    idOu404(id, 'motivo de pausa');
    await noTenant(sessao.tenantId, (tx) =>
      cadastros.excluirMotivoPausa(tx, sessao.tenantId, sessao.usuarioId, id),
    );
  }

  /* --------------------------------------------------------------- ações */

  /** Um formulário da Gestão: `{ campos }` entra, `Resultado` sai. */
  @Post('acoes/:acao')
  @HttpCode(200)
  @ComSessao()
  async acao(
    @Req() requisicao: RequisicaoComSessao,
    @Param('acao') nome: string,
    @Body() corpo: { campos?: CamposCrus },
  ): Promise<Resultado> {
    const sessao = sessaoDe(requisicao);
    const acao = Object.hasOwn(ACOES, nome) ? ACOES[nome] : undefined;
    if (!acao) throw ErroPipe.naoEncontrado('ação');
    const ator: Ator = { tipo: 'usuario', id: sessao.usuarioId };
    const campos = new Campos(corpo?.campos ?? {});
    return noTenant(sessao.tenantId, (tx) => acao(tx, sessao.tenantId, ator, campos));
  }
}
