import { Body, Controller, Get, HttpCode, Param, Post, Query, Req } from '@nestjs/common';
import type { EncerrarConversaInput } from '@pipe/contracts';
import { noTenant } from '../banco.js';
import { ErroPipe } from '../erros.js';
import { ComSessao, sessaoDe } from '../sessao.js';
import type { RequisicaoComSessao } from '../sessao.js';
import { carregarCabecalho, type CabecalhoDaGestao } from '../dominio/gestao/cabecalho.js';
import { dataIso, fusoDoTenant, janelaDeDatas, janelaDeHoje } from '../dominio/gestao/janela.js';
import {
  carregarMonitoramento,
  carregarPreviaDaConversa,
  falarComAtendenteNoMonitoramento,
  type Monitoramento,
} from '../dominio/gestao/monitoramento.js';
import {
  carregarCatalogos,
  carregarHistorico,
  type Catalogos,
  type LinhaHistorico,
} from '../dominio/gestao/historico.js';
import { carregarAtendimento, type RelatorioAtendimento } from '../dominio/gestao/atendimento.js';
import { carregarEsforco, type RelatorioEsforco } from '../dominio/gestao/esforco.js';
import { carregarSatisfacao, type RelatorioSatisfacao } from '../dominio/gestao/satisfacao.js';
import {
  carregarFicha,
  carregarMonitoria,
  type FichaDeAvaliacao,
  type PainelDeMonitoria,
} from '../dominio/gestao/monitoria.js';
import type { TransacaoPipe } from '@pipe/db';
import { registrarAuditoria } from '@pipe/db';
import { encerrarConversa, transferirConversa } from '../dominio/conversa.js';
import { exigirPermissao } from '../sessao.js';

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
const dataOuNada = (v?: string) => (v && DATA.test(v) ? v : undefined);

/** O período pedido, ou os últimos `dias` dias incluindo hoje. */
async function periodo(
  tx: TransacaoPipe,
  fuso: string,
  de: string | undefined,
  ate: string | undefined,
  dias: number,
): Promise<{ de: string; ate: string; janela: { inicio: Date; fim: Date } }> {
  const hoje = await janelaDeHoje(tx, fuso);
  const ateFinal = ate || dataIso(hoje.inicio, fuso);
  const deFinal = de || dataIso(new Date(hoje.inicio.getTime() - (dias - 1) * 86400e3), fuso);
  return { de: deFinal, ate: ateFinal, janela: await janelaDeDatas(tx, fuso, deFinal, ateFinal) };
}

export interface RespostaDoMonitoramento {
  fuso: string;
  /** O dia de hoje no fuso da conta, para o título. */
  janela: { inicio: Date; fim: Date };
  dados: Monitoramento;
}

export interface RespostaDoHistorico {
  fuso: string;
  de: string;
  ate: string;
  catalogos: Catalogos;
  linhas: LinhaHistorico[];
  truncado: boolean;
}

export interface RespostaDoRelatorioDeAtendimento {
  fuso: string;
  de: string;
  ate: string;
  catalogos: Catalogos;
  relatorio: RelatorioAtendimento;
}

export interface RespostaDeRelatorio<T> {
  fuso: string;
  de: string;
  ate: string;
  relatorio: T;
}

export interface RespostaDaMonitoria {
  fuso: string;
  de: string;
  ate: string;
  catalogos: Catalogos;
  painel: PainelDeMonitoria;
}

@Controller('v1/gestao')
export class ControladorGestaoOperacao {
  /** As duas barras do topo: canais e avisos. Conta e pessoa vêm de `GET /v1/eu`. */
  @Get('cabecalho')
  @ComSessao()
  async cabecalho(@Req() requisicao: RequisicaoComSessao): Promise<CabecalhoDaGestao> {
    const sessao = sessaoDe(requisicao);
    /* Banco fora do ar não pode apagar a barra: os canais somem, a tela fica. */
    return noTenant(sessao.tenantId, (tx) => carregarCabecalho(tx)).catch(
      (): CabecalhoDaGestao => ({ canais: [], avisos: 0 }),
    );
  }

  @Get('monitoramento')
  @ComSessao()
  async monitoramento(
    @Req() requisicao: RequisicaoComSessao,
    @Query('fila') fila?: string,
    @Query('atendente') atendente?: string,
  ): Promise<RespostaDoMonitoramento> {
    const sessao = sessaoDe(requisicao);
    return noTenant(sessao.tenantId, async (tx) => {
      const fuso = await fusoDoTenant(tx);
      const janela = await janelaDeHoje(tx, fuso);
      const dados = await carregarMonitoramento(tx, janela, fuso, {
        filaId: uuidOuNada(fila),
        atendenteId: uuidOuNada(atendente),
      });
      return { fuso, janela, dados };
    });
  }

  @Get('monitoramento/conversas/:id')
  @ComSessao()
  async previaDaConversa(@Req() requisicao: RequisicaoComSessao, @Param('id') id: string) {
    const sessao = sessaoDe(requisicao);
    if (!UUID.test(id)) throw ErroPipe.naoEncontrado('Conversa');
    const previa = await noTenant(sessao.tenantId, async (tx) => {
      await exigirPermissao(tx, sessao.usuarioId, 'monitoramento.tempo_real.ver');
      return carregarPreviaDaConversa(tx, sessao.usuarioId, id);
    });
    if (!previa) throw ErroPipe.naoEncontrado('Conversa');
    return previa;
  }

  @Post('monitoramento/conversas/:id/notas')
  @HttpCode(201)
  @ComSessao()
  async falarComAtendente(
    @Req() requisicao: RequisicaoComSessao,
    @Param('id') id: string,
    @Body() corpo: { texto?: string },
  ): Promise<{ ok: true }> {
    const sessao = sessaoDe(requisicao);
    if (!UUID.test(id)) throw ErroPipe.naoEncontrado('Conversa');
    await noTenant(sessao.tenantId, (tx) =>
      falarComAtendenteNoMonitoramento(tx, sessao.tenantId, sessao.usuarioId, id, corpo?.texto ?? ''),
    );
    return { ok: true };
  }

  @Post('monitoramento/conversas/:id/transferir')
  @ComSessao()
  async transferirNoMonitoramento(
    @Req() requisicao: RequisicaoComSessao,
    @Param('id') id: string,
    @Body() corpo: { para_fila_id?: string; para_atendente_id?: string },
  ): Promise<{ para_conversa_id: string }> {
    const sessao = sessaoDe(requisicao);
    if (!UUID.test(id)) throw ErroPipe.naoEncontrado('Conversa');
    return noTenant(sessao.tenantId, async (tx) => {
      await exigirPermissao(tx, sessao.usuarioId, 'monitoramento.tempo_real.ver');
      await exigirPermissao(tx, sessao.usuarioId, 'conversa.transferir');
      const resultado = await transferirConversa(
        { tenantId: sessao.tenantId, atendenteId: sessao.usuarioId, exigirAtribuicao: false },
        { conversaId: id, paraFilaId: corpo?.para_fila_id ?? null, paraAtendenteId: corpo?.para_atendente_id ?? null, motivo: null },
      );
      await registrarAuditoria(tx, sessao.tenantId, {
        ator: { tipo: 'usuario', id: sessao.usuarioId }, acao: 'alterou', objetoTipo: 'conversa', objetoId: id,
        depois: { acao: 'transferiu_no_monitoramento', para: resultado.paraConversaId },
      });
      return { para_conversa_id: resultado.paraConversaId };
    });
  }

  @Post('monitoramento/conversas/:id/finalizar')
  @ComSessao()
  async finalizarNoMonitoramento(
    @Req() requisicao: RequisicaoComSessao,
    @Param('id') id: string,
    @Body() corpo: EncerrarConversaInput,
  ): Promise<{ estado: string }> {
    const sessao = sessaoDe(requisicao);
    if (!UUID.test(id)) throw ErroPipe.naoEncontrado('Conversa');
    return noTenant(sessao.tenantId, async (tx) => {
      await exigirPermissao(tx, sessao.usuarioId, 'monitoramento.tempo_real.ver');
      await exigirPermissao(tx, sessao.usuarioId, 'conversa.encerrar');
      const resultado = await encerrarConversa(
        { tenantId: sessao.tenantId, atendenteId: sessao.usuarioId, exigirAtribuicao: false },
        { conversaId: id, etiquetaIds: corpo?.etiqueta_ids, etiquetaId: corpo?.etiqueta_id },
      );
      await registrarAuditoria(tx, sessao.tenantId, {
        ator: { tipo: 'usuario', id: sessao.usuarioId }, acao: 'alterou', objetoTipo: 'conversa', objetoId: id,
        depois: { acao: 'finalizou_no_monitoramento' },
      });
      return { estado: resultado.estado };
    });
  }

  @Get('historico')
  @ComSessao()
  async historico(
    @Req() requisicao: RequisicaoComSessao,
    @Query('fila') fila?: string,
    @Query('atendente') atendente?: string,
    @Query('etiqueta') etiqueta?: string,
    @Query('de') de?: string,
    @Query('ate') ate?: string,
  ): Promise<RespostaDoHistorico> {
    const sessao = sessaoDe(requisicao);
    return noTenant(sessao.tenantId, async (tx) => {
      const fuso = await fusoDoTenant(tx);
      const p = await periodo(tx, fuso, dataOuNada(de), dataOuNada(ate), 7);
      const catalogos = await carregarCatalogos(tx);
      const { linhas, truncado } = await carregarHistorico(tx, p.janela, {
        filaId: uuidOuNada(fila),
        atendenteId: uuidOuNada(atendente),
        etiquetaId: uuidOuNada(etiqueta),
      });
      return { fuso, de: p.de, ate: p.ate, catalogos, linhas, truncado };
    });
  }

  @Get('relatorios/atendimento')
  @ComSessao()
  async relatorioDeAtendimento(
    @Req() requisicao: RequisicaoComSessao,
    @Query('fila') fila?: string,
    @Query('atendente') atendente?: string,
    @Query('de') de?: string,
    @Query('ate') ate?: string,
  ): Promise<RespostaDoRelatorioDeAtendimento> {
    const sessao = sessaoDe(requisicao);
    return noTenant(sessao.tenantId, async (tx) => {
      const fuso = await fusoDoTenant(tx);
      const p = await periodo(tx, fuso, dataOuNada(de), dataOuNada(ate), 7);
      const catalogos = await carregarCatalogos(tx);
      const relatorio = await carregarAtendimento(tx, p.janela, {
        filaId: uuidOuNada(fila),
        atendenteId: uuidOuNada(atendente),
      });
      return { fuso, de: p.de, ate: p.ate, catalogos, relatorio };
    });
  }

  @Get('relatorios/esforco')
  @ComSessao()
  async relatorioDeEsforco(
    @Req() requisicao: RequisicaoComSessao,
    @Query('de') de?: string,
    @Query('ate') ate?: string,
  ): Promise<RespostaDeRelatorio<RelatorioEsforco>> {
    const sessao = sessaoDe(requisicao);
    return noTenant(sessao.tenantId, async (tx) => {
      const fuso = await fusoDoTenant(tx);
      const p = await periodo(tx, fuso, dataOuNada(de), dataOuNada(ate), 7);
      return { fuso, de: p.de, ate: p.ate, relatorio: await carregarEsforco(tx, p.janela) };
    });
  }

  @Get('relatorios/satisfacao')
  @ComSessao()
  async relatorioDeSatisfacao(
    @Req() requisicao: RequisicaoComSessao,
    @Query('de') de?: string,
    @Query('ate') ate?: string,
  ): Promise<RespostaDeRelatorio<RelatorioSatisfacao>> {
    const sessao = sessaoDe(requisicao);
    return noTenant(sessao.tenantId, async (tx) => {
      const fuso = await fusoDoTenant(tx);
      /* Satisfação olha 30 dias por padrão: pesquisa respondida é mais rara que conversa. */
      const p = await periodo(tx, fuso, dataOuNada(de), dataOuNada(ate), 30);
      return { fuso, de: p.de, ate: p.ate, relatorio: await carregarSatisfacao(tx, p.janela) };
    });
  }

  @Get('monitoria')
  @ComSessao()
  async monitoria(
    @Req() requisicao: RequisicaoComSessao,
    @Query('atendente') atendente?: string,
    @Query('avaliador') avaliador?: string,
    @Query('de') de?: string,
    @Query('ate') ate?: string,
  ): Promise<RespostaDaMonitoria> {
    const sessao = sessaoDe(requisicao);
    return noTenant(sessao.tenantId, async (tx) => {
      const fuso = await fusoDoTenant(tx);
      const p = await periodo(tx, fuso, dataOuNada(de), dataOuNada(ate), 30);
      const catalogos = await carregarCatalogos(tx);
      const painel = await carregarMonitoria(tx, p.janela, {
        atendenteId: uuidOuNada(atendente),
        avaliadorTipo: avaliador || undefined,
      });
      return { fuso, de: p.de, ate: p.ate, catalogos, painel };
    });
  }

  @Get('monitoria/:id')
  @ComSessao()
  async ficha(
    @Req() requisicao: RequisicaoComSessao,
    @Param('id') id: string,
  ): Promise<{ fuso: string; ficha: FichaDeAvaliacao }> {
    const sessao = sessaoDe(requisicao);
    if (!UUID.test(id)) throw ErroPipe.naoEncontrado('avaliação');
    const resposta = await noTenant(sessao.tenantId, async (tx) => {
      const ficha = await carregarFicha(tx, id);
      return ficha ? { fuso: await fusoDoTenant(tx), ficha } : null;
    });
    if (!resposta) throw ErroPipe.naoEncontrado('avaliação');
    return resposta;
  }
}
