import { Controller, Get, Param, Query, Req } from '@nestjs/common';
import {
  hojeNoFuso,
  intervaloDoPeriodo,
  lerPeriodo,
  type DadosDeMensagensAtivas,
  type DadosDoDashboard,
  type Intervalo,
  type Periodo,
  type ArestaDaJornada,
  type RelatorioPersonalizado,
  type VisaoGeral,
} from '@pipe/core/analise';
import { noTenant } from '../banco.js';
import { ErroPipe } from '../erros.js';
import { ComSessao, sessaoDe } from '../sessao.js';
import type { RequisicaoComSessao } from '../sessao.js';
import { carregarContato, fusoDoTenant } from '../dominio/gestao-fluxo.js';
import {
  carregarDashboard,
  carregarJornada,
  carregarListaDeContatos,
  carregarMensagensAtivas,
  carregarRelatorios,
  carregarVisaoGeral,
  janelaDeDatas,
} from '../dominio/gestao-analise.js';

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

function uuidOu404(valor: string): string {
  if (!UUID.test(valor)) throw ErroPipe.naoEncontrado('fluxo');
  return valor;
}

/** `moment().add(n, 'days')` sobre uma data sem hora. */
function somarDias(dia: string, n: number): string {
  const d = new Date(`${dia}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** `?de=&ate=` válidos e em ordem, ou o padrão da tela. */
function periodoDaUrl(
  de: string | undefined,
  ate: string | undefined,
  padraoDe: string,
  padraoAte: string,
): { de: string; ate: string } {
  if (de && ate && DIA.test(de) && DIA.test(ate) && de <= ate) return { de, ate };
  return { de: padraoDe, ate: padraoAte };
}

export interface RespostaDoDashboard {
  periodo: Periodo;
  intervalo: Intervalo;
  hoje: string;
  dados: DadosDoDashboard;
  lista: { tipo: 'interacao' | 'rejeicao'; nomes: string[] } | null;
}

export interface RespostaDeMensagensAtivas {
  periodo: Periodo;
  intervalo: Intervalo;
  hoje: string;
  /** O `startDateLimit` do `bds-datepicker`: 186 dias atrás. */
  limite: string;
  template: string | null;
  dados: DadosDeMensagensAtivas;
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
  roteador: boolean;
}

export interface RespostaDosRelatorios {
  relatorios: RelatorioPersonalizado[];
  fuso: string;
}

@Controller('v1/gestao/fluxos/:id/analise')
export class ControladorGestaoAnalise {
  @Get('dashboard')
  @ComSessao()
  async dashboard(
    @Req() requisicao: RequisicaoComSessao,
    @Param('id') id: string,
    @Query('periodo') periodoPedido?: string,
    @Query('de') de?: string,
    @Query('ate') ate?: string,
    @Query('contatos') contatos?: string,
  ): Promise<RespostaDoDashboard> {
    const sessao = sessaoDe(requisicao);
    uuidOu404(id);
    const resposta = await noTenant(sessao.tenantId, async (tx) => {
      const fuso = await fusoDoTenant(tx);
      const hoje = hojeNoFuso(fuso);
      let periodo = lerPeriodo(periodoPedido);
      let intervalo = intervaloDoPeriodo(periodo, hoje, { de, ate, limiteDias: 90 });
      if (!intervalo) {
        periodo = 'today';
        intervalo = { inicio: hoje, fim: hoje };
      }
      const tipo: 'interacao' | 'rejeicao' | null =
        contatos === 'interacao' || contatos === 'rejeicao' ? contatos : null;
      const dados = await carregarDashboard(tx, id, intervalo, fuso);
      if (!dados) return null;
      const nomes = tipo ? await carregarListaDeContatos(tx, id, intervalo, fuso, tipo) : null;
      const lista: RespostaDoDashboard['lista'] = tipo && nomes ? { tipo, nomes } : null;
      return { periodo, intervalo, hoje, dados, lista };
    });
    if (!resposta) throw ErroPipe.naoEncontrado('fluxo');
    return resposta;
  }

  @Get('mensagens-ativas')
  @ComSessao()
  async mensagensAtivas(
    @Req() requisicao: RequisicaoComSessao,
    @Param('id') id: string,
    @Query('periodo') periodoPedido?: string,
    @Query('de') de?: string,
    @Query('ate') ate?: string,
    @Query('template') templatePedido?: string,
  ): Promise<RespostaDeMensagensAtivas> {
    const sessao = sessaoDe(requisicao);
    uuidOu404(id);
    return noTenant(sessao.tenantId, async (tx) => {
      const hoje = hojeNoFuso(await fusoDoTenant(tx));
      /* 186 dias é o `startDateLimit` que o `St` põe no `bds-datepicker`. */
      let periodo = lerPeriodo(periodoPedido);
      let intervalo = intervaloDoPeriodo(periodo, hoje, { de, ate, limiteDias: 186 });
      if (!intervalo) {
        periodo = 'today';
        intervalo = { inicio: hoje, fim: hoje };
      }
      const template = templatePedido?.trim() || null;
      const dados = await carregarMensagensAtivas(tx, id, intervalo, template);
      return { periodo, intervalo, hoje, limite: somarDias(hoje, -186), template, dados };
    });
  }

  @Get('visao-geral')
  @ComSessao()
  async visaoGeral(
    @Req() requisicao: RequisicaoComSessao,
    @Param('id') id: string,
    @Query('de') dePedido?: string,
    @Query('ate') atePedido?: string,
  ): Promise<RespostaDaVisaoGeral> {
    const sessao = sessaoDe(requisicao);
    uuidOu404(id);
    return noTenant(sessao.tenantId, async (tx) => {
      const fuso = await fusoDoTenant(tx);
      const hoje = hojeNoFuso(fuso);
      const { de, ate } = periodoDaUrl(dePedido, atePedido, somarDias(hoje, -7), hoje);
      const dados = await carregarVisaoGeral(tx, id, await janelaDeDatas(tx, fuso, de, ate), fuso);
      return { dados, de, ate };
    });
  }

  @Get('jornada')
  @ComSessao()
  async jornada(
    @Req() requisicao: RequisicaoComSessao,
    @Param('id') id: string,
    @Query('de') dePedido?: string,
    @Query('ate') atePedido?: string,
  ): Promise<RespostaDaJornada> {
    const sessao = sessaoDe(requisicao);
    uuidOu404(id);
    const resposta = await noTenant(sessao.tenantId, async (tx) => {
      const contato = await carregarContato(tx, sessao.tenantId, id);
      if (!contato) return null;
      const fuso = await fusoDoTenant(tx);
      const hoje = hojeNoFuso(fuso);
      const { de, ate } = periodoDaUrl(dePedido, atePedido, somarDias(hoje, -1), hoje);
      const arestas = await carregarJornada(tx, id, await janelaDeDatas(tx, fuso, de, ate));
      return {
        arestas,
        de,
        ate,
        min: somarDias(hoje, -30),
        max: somarDias(hoje, 1),
        roteador: contato.tipo === 'roteador',
      };
    });
    if (!resposta) throw ErroPipe.naoEncontrado('fluxo');
    return resposta;
  }

  @Get('relatorios')
  @ComSessao()
  async relatorios(
    @Req() requisicao: RequisicaoComSessao,
    @Param('id') id: string,
  ): Promise<RespostaDosRelatorios> {
    const sessao = sessaoDe(requisicao);
    uuidOu404(id);
    return noTenant(sessao.tenantId, async (tx) => ({
      relatorios: await carregarRelatorios(tx),
      fuso: await fusoDoTenant(tx),
    }));
  }
}
