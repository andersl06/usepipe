import { Body, Controller, Get, HttpCode, Param, Post, Put, Req } from '@nestjs/common';
import type {
  BuilderOfFlow,
  DesenhoDoBuilder,
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
  loadVersionDrawing,
  publicarRascunho,
  restoreVersion,
  salvarRascunho,
} from '../domain/management/builder-of-flow.js';
import { uuidOu404 } from './management-flow.js';

/**
 * The contact Builder (`/fluxo/:id/builder`) uses a browser session. It shares the HTTP adapter pattern of `gestao-fluxo.ts` but keeps the draft, publish and history lifecycle together here; the rules live in `dominio/gestao/builder-do-fluxo.ts`. `GET :id/builder` loads the design; `PUT :id/builder` saves a draft and returns per-block engine errors with 200 even when invalid; `POST :id/builder/publicar` publishes or returns 409 with `detalhe.erros`; `GET :id/builder/versoes` lists the version history, `GET .../versoes/:version` returns one old version's drawing (to export it), and `POST .../versoes/:version/restaurar` brings it back as the draft. Routers return 409 on all these routes (`roteador_sem_builder`). The tenant comes from the session, never the URL; an invalid UUID `id` returns 404 before querying.
 */
@Controller('v1/management/flows')
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

  @Post(':id/builder/publish')
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

  @Get(':id/builder/versions')
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

  @Get(':id/builder/versions/:version')
  @WithSession()
  async versionDrawing(
    @Req() requisicao: RequestWithSession,
    @Param('id') id: string,
    @Param('version') versao: string,
  ): Promise<DesenhoDoBuilder> {
    const sessao = sessionOf(requisicao);
    uuidOu404(id, 'fluxo');
    const numero = /^\d+$/.test(versao) ? Number(versao) : Number.NaN;
    return noTenant(sessao.tenantId, (tx) =>
      loadVersionDrawing(tx, sessao.tenantId, sessao.userId, id, numero),
    );
  }

  @Post(':id/builder/versions/:version/restore')
  @HttpCode(200)
  @WithSession()
  async restore(
    @Req() requisicao: RequestWithSession,
    @Param('id') id: string,
    @Param('version') versao: string,
  ): Promise<RascunhoGravado> {
    const session = sessionOf(requisicao);
    uuidOu404(id, 'fluxo');
    // An out-of-pattern number becomes NaN, which the domain treats as "version not found".
    const numero = /^\d+$/.test(versao) ? Number(versao) : Number.NaN;
    return noTenant(session.tenantId, (tx) =>
      restoreVersion(tx, session.tenantId, session.userId, id, numero),
    );
  }
}
