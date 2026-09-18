import { Controller, Get, Param, Query, Req } from '@nestjs/common';
import { noTenant } from '../banco.js';
import { ErroPipe } from '../erros.js';
import { ComSessao, sessaoDe } from '../sessao.js';
import type { RequisicaoComSessao } from '../sessao.js';
import {
  carregarCanalDoFluxo,
  carregarGradeDoPortal,
  carregarContato,
  carregarDetalheContatoDoFluxo,
  carregarGrowth,
  carregarLogsDoFluxo,
  carregarModelos,
  carregarServicos,
  fusoDoTenant,
  listarContatosDoFluxo,
} from '../dominio/gestao-fluxo.js';
import type { GradeDoPortal } from '@pipe/contracts';
import { POR_PAGINA } from '@pipe/contracts';
import type {
  ContatoDoFluxo,
  ContatoListado,
  DadosDeGrowth,
  DadosDeServicos,
  DetalheDoContato,
  LogDoFluxo,
  ModeloListado,
} from '../dominio/gestao-fluxo.js';

/**
 * As telas do CONTATO da Gestão (`/fluxo/:id/**`), por sessão de navegador.
 *
 * É a primeira leva da migração do front para Vite (README, "Quem fala com o
 * banco"): o que a Gestão em Next consultava por server component passa a
 * pedir aqui. Uma rota por leitura, o mesmo dado, e o tenant vem da sessão —
 * nunca da URL.
 *
 * `id` é o `fluxo.id`. Fora do padrão de uuid a resposta é 404 antes de ir ao
 * banco: URL é texto de fora, e o Postgres recusa uuid malformado com 500.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function uuidOu404(valor: string, oQue: string): string {
  if (!UUID.test(valor)) throw ErroPipe.naoEncontrado(oQue);
  return valor;
}

/** O que a casca do contato precisa: o contato, o canal dele e o fuso da conta. */
export interface CascaDoContato {
  contato: ContatoDoFluxo;
  fuso: string;
}

@Controller('v1/gestao/fluxos')
export class ControladorGestaoFluxo {
  /** A grade do portal. Fora da lista de tamanhos, cai no primeiro; página inválida vira 1. */
  @Get()
  @ComSessao()
  async grade(
    @Req() requisicao: RequisicaoComSessao,
    @Query('busca') busca?: string,
    @Query('pagina') pagina?: string,
    @Query('porPagina') porPagina?: string,
  ): Promise<GradeDoPortal> {
    const sessao = sessaoDe(requisicao);
    const tamanho = Number(porPagina);
    return noTenant(sessao.tenantId, (tx) =>
      carregarGradeDoPortal(tx, {
        busca: busca ?? '',
        pagina: Math.max(1, Math.trunc(Number(pagina)) || 1),
        porPagina: (POR_PAGINA as readonly number[]).includes(tamanho) ? tamanho : POR_PAGINA[0],
      }),
    );
  }

  @Get(':id')
  @ComSessao()
  async contato(
    @Req() requisicao: RequisicaoComSessao,
    @Param('id') id: string,
  ): Promise<CascaDoContato> {
    const sessao = sessaoDe(requisicao);
    uuidOu404(id, 'fluxo');
    const resultado = await noTenant(sessao.tenantId, async (tx) => {
      const contato = await carregarContato(tx, sessao.tenantId, id);
      if (!contato) return null;
      return { contato, fuso: await fusoDoTenant(tx) };
    });
    if (!resultado) throw ErroPipe.naoEncontrado('fluxo');
    return resultado;
  }

  @Get(':id/contatos')
  @ComSessao()
  async contatos(
    @Req() requisicao: RequisicaoComSessao,
    @Param('id') id: string,
  ): Promise<ContatoListado[]> {
    const sessao = sessaoDe(requisicao);
    uuidOu404(id, 'fluxo');
    return noTenant(sessao.tenantId, (tx) => listarContatosDoFluxo(tx, sessao.tenantId, id));
  }

  @Get(':id/contatos/:contatoId')
  @ComSessao()
  async detalheDoContato(
    @Req() requisicao: RequisicaoComSessao,
    @Param('id') id: string,
    @Param('contatoId') contatoId: string,
    @Query('ticketId') ticketId?: string,
  ): Promise<DetalheDoContato> {
    const sessao = sessaoDe(requisicao);
    uuidOu404(id, 'fluxo');
    uuidOu404(contatoId, 'contato');
    const detalhe = await noTenant(sessao.tenantId, (tx) =>
      carregarDetalheContatoDoFluxo(
        tx,
        sessao.tenantId,
        id,
        contatoId,
        ticketId && UUID.test(ticketId) ? ticketId : undefined,
      ),
    );
    if (!detalhe) throw ErroPipe.naoEncontrado('contato');
    return detalhe;
  }

  @Get(':id/logs')
  @ComSessao()
  async logs(
    @Req() requisicao: RequisicaoComSessao,
    @Param('id') id: string,
    @Query('busca') busca?: string,
  ): Promise<LogDoFluxo[]> {
    const sessao = sessaoDe(requisicao);
    uuidOu404(id, 'fluxo');
    return noTenant(sessao.tenantId, (tx) =>
      carregarLogsDoFluxo(tx, sessao.tenantId, id, busca ?? ''),
    );
  }

  /** O Growth é da CONTA, não do contato — a rota leva o `id` só para ficar sob a mesma casca. */
  @Get(':id/growth')
  @ComSessao()
  async growth(
    @Req() requisicao: RequisicaoComSessao,
    @Param('id') id: string,
  ): Promise<DadosDeGrowth> {
    const sessao = sessaoDe(requisicao);
    uuidOu404(id, 'fluxo');
    return noTenant(sessao.tenantId, (tx) => carregarGrowth(tx, sessao.tenantId));
  }

  @Get(':id/conteudos')
  @ComSessao()
  async conteudos(
    @Req() requisicao: RequisicaoComSessao,
    @Param('id') id: string,
  ): Promise<{ canalId: string | null; modelos: ModeloListado[] }> {
    const sessao = sessaoDe(requisicao);
    uuidOu404(id, 'fluxo');
    return noTenant(sessao.tenantId, async (tx) => {
      const canalId = await carregarCanalDoFluxo(tx, sessao.tenantId, id);
      const modelos = canalId ? await carregarModelos(tx, canalId) : [];
      return { canalId, modelos };
    });
  }

  @Get(':id/servicos')
  @ComSessao()
  async servicos(
    @Req() requisicao: RequisicaoComSessao,
    @Param('id') id: string,
  ): Promise<DadosDeServicos> {
    const sessao = sessaoDe(requisicao);
    uuidOu404(id, 'fluxo');
    return noTenant(sessao.tenantId, (tx) => carregarServicos(tx, sessao.tenantId, id));
  }
}
