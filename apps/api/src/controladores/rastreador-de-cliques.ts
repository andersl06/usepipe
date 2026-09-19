import { Body, Controller, Get, HttpCode, Param, Post, Query, Req } from '@nestjs/common';
import { noTenant } from '../banco.js';
import { ComSessao, sessaoDe } from '../sessao.js';
import type { RequisicaoComSessao } from '../sessao.js';
import { ErroPipe } from '../erros.js';
import {
  criarLinkRastreado,
  listarLinksRastreados,
  type LinkRastreado,
  type PeriodoDeContagem,
} from '../dominio/rastreador-de-cliques.js';

/**
 * `/v1/gestao/fluxos/:fluxoId/links-rastreados` — cadastro e leitura do link
 * curto do rastreador de cliques. Controlador próprio (não `gestao-fluxo.ts`,
 * fora do escopo desta tarefa), no mesmo formato de `mensagens-ativas.ts`.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function uuidOu404(valor: string): string {
  if (!UUID.test(valor)) throw ErroPipe.naoEncontrado('fluxo');
  return valor;
}

function periodoDaQuery(desde: string | undefined, ate: string | undefined): PeriodoDeContagem {
  const d = desde ? new Date(desde) : null;
  const a = ate ? new Date(ate) : null;
  return {
    desde: d && !Number.isNaN(d.getTime()) ? d : null,
    ate: a && !Number.isNaN(a.getTime()) ? a : null,
  };
}

interface CorpoDeLink {
  nome?: string;
  destino?: string;
}

@Controller('v1/gestao/fluxos/:fluxoId/links-rastreados')
export class ControladorLinksRastreados {
  @Get()
  @ComSessao()
  async listar(
    @Req() requisicao: RequisicaoComSessao,
    @Param('fluxoId') fluxoId: string,
    @Query('desde') desde: string | undefined,
    @Query('ate') ate: string | undefined,
  ): Promise<{ data: LinkRastreado[] }> {
    const sessao = sessaoDe(requisicao);
    uuidOu404(fluxoId);
    const data = await noTenant(sessao.tenantId, (tx) =>
      listarLinksRastreados(tx, sessao.tenantId, fluxoId, periodoDaQuery(desde, ate)),
    );
    return { data };
  }

  @Post()
  @HttpCode(201)
  @ComSessao()
  async criar(
    @Req() requisicao: RequisicaoComSessao,
    @Param('fluxoId') fluxoId: string,
    @Body() corpo: CorpoDeLink,
  ): Promise<LinkRastreado> {
    const sessao = sessaoDe(requisicao);
    uuidOu404(fluxoId);
    if (!corpo.destino) {
      throw ErroPipe.requisicao('destino_obrigatorio', 'Informe a URL de destino.');
    }
    return noTenant(sessao.tenantId, (tx) =>
      criarLinkRastreado(tx, sessao.tenantId, fluxoId, {
        nome: corpo.nome ?? '',
        destino: corpo.destino!,
      }),
    );
  }
}
