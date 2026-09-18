import { Body, Controller, Get, HttpCode, Param, Post, Req } from '@nestjs/common';
import type { Ator, TransacaoPipe } from '@pipe/db';
import { noTenant } from '../banco.js';
import { ErroPipe } from '../erros.js';
import { ComSessao, sessaoDe } from '../sessao.js';
import type { RequisicaoComSessao } from '../sessao.js';
import { fusoDoTenant } from '../dominio/gestao/janela.js';
import * as cadastros from '../dominio/gestao/cadastros.js';
import * as comunicacao from '../dominio/gestao/comunicacao.js';
import * as configuracoes from '../dominio/gestao/configuracoes.js';
import * as acoesRegras from '../dominio/gestao/acoes/regras.js';
import * as acoesAtendentes from '../dominio/gestao/acoes/atendentes.js';
import * as acoesComunicacao from '../dominio/gestao/acoes/comunicacao.js';
import * as acoesConfiguracoes from '../dominio/gestao/acoes/configuracoes.js';
import { Campos, type CamposCrus, type Resultado } from '../dominio/gestao/acoes/campos.js';

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
