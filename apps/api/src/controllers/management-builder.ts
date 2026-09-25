import { Body, Controller, Get, HttpCode, Param, Post, Put, Req } from '@nestjs/common';
import type {
  BuilderOfFlow,
  RascunhoGravado,
  VersionOfFlow,
  VersaoPublicada,
} from '@pipe/contracts';
import { noTenant } from '../database.js';
import { WithSession, sessionOf } from '../session.js';
import type { RequestWithSession } from '../session.js';
import {
  carregarBuilder,
  listVersions,
  publicarRascunho,
  restoreVersion,
  salvarRascunho,
} from '../domain/management/builder-of-flow.js';
import { uuidOu404 } from './management-flow.js';

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
export class ManagementBuilderController {
  @Get(':id/builder')
  @WithSession()
  async carregar(
    @Req() request: RequestWithSession,
    @Param('id') id: string,
  ): Promise<BuilderOfFlow> {
    const sessao = sessionOf(request);
    uuidOu404(id, 'fluxo');
    return noTenant(sessao.tenantId, (tx) =>
      carregarBuilder(tx, sessao.tenantId, sessao.userId, id),
    );
  }

  @Put(':id/builder')
  @WithSession()
  async salvar(
    @Req() requisicao: RequestWithSession,
    @Param('id') id: string,
    @Body() corpo: unknown,
  ): Promise<RascunhoGravado> {
    const sessao = sessionOf(requisicao);
    uuidOu404(id, 'fluxo');
    return noTenant(sessao.tenantId, (tx) =>
      salvarRascunho(tx, sessao.tenantId, sessao.userId, id, corpo),
    );
  }

  @Post(':id/builder/publicar')
  @HttpCode(200)
  @WithSession()
  async publicar(
    @Req() requisicao: RequestWithSession,
    @Param('id') id: string,
  ): Promise<VersaoPublicada> {
    const sessao = sessionOf(requisicao);
    uuidOu404(id, 'fluxo');
    return noTenant(sessao.tenantId, (tx) =>
      publicarRascunho(tx, sessao.tenantId, sessao.userId, id),
    );
  }

  @Get(':id/builder/versoes')
  @WithSession()
  async versions(
    @Req() requisicao: RequestWithSession,
    @Param('id') id: string,
  ): Promise<VersionOfFlow[]> {
    const sessao = sessionOf(requisicao);
    uuidOu404(id, 'fluxo');
    return noTenant(sessao.tenantId, (tx) =>
      listVersions(tx, sessao.tenantId, sessao.userId, id),
    );
  }

  @Post(':id/builder/versoes/:versao/restaurar')
  @HttpCode(200)
  @WithSession()
  async restore(
    @Req() requisicao: RequestWithSession,
    @Param('id') id: string,
    @Param('versao') versao: string,
  ): Promise<RascunhoGravado> {
    const session = sessionOf(requisicao);
    uuidOu404(id, 'fluxo');
    // Número fora do padrão vira NaN, e NaN é "versão não encontrada" no domínio.
    const numero = /^\d+$/.test(versao) ? Number(versao) : Number.NaN;
    return noTenant(session.tenantId, (tx) =>
      restoreVersion(tx, session.tenantId, session.userId, id, numero),
    );
  }
}
