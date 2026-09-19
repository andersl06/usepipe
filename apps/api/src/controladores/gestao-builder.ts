import { Body, Controller, Get, HttpCode, Param, Post, Put, Req } from '@nestjs/common';
import type {
  BuilderDoFluxo,
  RascunhoGravado,
  VersaoDoFluxo,
  VersaoPublicada,
} from '@pipe/contracts';
import { noTenant } from '../banco.js';
import { ComSessao, sessaoDe } from '../sessao.js';
import type { RequisicaoComSessao } from '../sessao.js';
import {
  carregarBuilder,
  listarVersoes,
  publicarRascunho,
  restaurarVersao,
  salvarRascunho,
} from '../dominio/gestao/builder-do-fluxo.js';
import { uuidOu404 } from './gestao-fluxo.js';

/**
 * O Builder do contato (`/fluxo/:id/builder`), por sessão de navegador — a
 * mesma casca de `gestao-fluxo.ts`, num arquivo à parte porque o ciclo
 * rascunho → publicar → histórico é um assunto só e a regra inteira mora em
 * `dominio/gestao/builder-do-fluxo.ts`.
 *
 * - `GET :id/builder` — o desenho que o editor abre;
 * - `PUT :id/builder` — o "salvar": grava o rascunho, devolve os erros do
 *   motor por bloco (200 mesmo inválido: rascunho é para isso);
 * - `POST :id/builder/publicar` — promove o rascunho; inválido é 409 com a
 *   lista no `detalhe.erros`;
 * - `GET :id/builder/versoes` e `POST .../versoes/:versao/restaurar`.
 *
 * Roteador responde 409 em todas (`roteador_sem_builder`). O tenant vem da
 * sessão, nunca da URL; `id` fora do padrão de uuid é 404 antes do banco.
 */
@Controller('v1/gestao/fluxos')
export class ControladorGestaoBuilder {
  @Get(':id/builder')
  @ComSessao()
  async carregar(
    @Req() requisicao: RequisicaoComSessao,
    @Param('id') id: string,
  ): Promise<BuilderDoFluxo> {
    const sessao = sessaoDe(requisicao);
    uuidOu404(id, 'fluxo');
    return noTenant(sessao.tenantId, (tx) =>
      carregarBuilder(tx, sessao.tenantId, sessao.usuarioId, id),
    );
  }

  @Put(':id/builder')
  @ComSessao()
  async salvar(
    @Req() requisicao: RequisicaoComSessao,
    @Param('id') id: string,
    @Body() corpo: unknown,
  ): Promise<RascunhoGravado> {
    const sessao = sessaoDe(requisicao);
    uuidOu404(id, 'fluxo');
    return noTenant(sessao.tenantId, (tx) =>
      salvarRascunho(tx, sessao.tenantId, sessao.usuarioId, id, corpo),
    );
  }

  @Post(':id/builder/publicar')
  @HttpCode(200)
  @ComSessao()
  async publicar(
    @Req() requisicao: RequisicaoComSessao,
    @Param('id') id: string,
  ): Promise<VersaoPublicada> {
    const sessao = sessaoDe(requisicao);
    uuidOu404(id, 'fluxo');
    return noTenant(sessao.tenantId, (tx) =>
      publicarRascunho(tx, sessao.tenantId, sessao.usuarioId, id),
    );
  }

  @Get(':id/builder/versoes')
  @ComSessao()
  async versoes(
    @Req() requisicao: RequisicaoComSessao,
    @Param('id') id: string,
  ): Promise<VersaoDoFluxo[]> {
    const sessao = sessaoDe(requisicao);
    uuidOu404(id, 'fluxo');
    return noTenant(sessao.tenantId, (tx) =>
      listarVersoes(tx, sessao.tenantId, sessao.usuarioId, id),
    );
  }

  @Post(':id/builder/versoes/:versao/restaurar')
  @HttpCode(200)
  @ComSessao()
  async restaurar(
    @Req() requisicao: RequisicaoComSessao,
    @Param('id') id: string,
    @Param('versao') versao: string,
  ): Promise<RascunhoGravado> {
    const sessao = sessaoDe(requisicao);
    uuidOu404(id, 'fluxo');
    // Número fora do padrão vira NaN, e NaN é "versão não encontrada" no domínio.
    const numero = /^\d+$/.test(versao) ? Number(versao) : Number.NaN;
    return noTenant(sessao.tenantId, (tx) =>
      restaurarVersao(tx, sessao.tenantId, sessao.usuarioId, id, numero),
    );
  }
}
