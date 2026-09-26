import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Req } from '@nestjs/common';
import type {
  TeamOfFlow,
  MemberOfFlow,
  MyPermissionsInFlow,
  RequestOfMemberOfFlow,
} from '@pipe/contracts';
import { noTenant } from '../database.js';
import { PipeError } from '../errors.js';
import { WithSession, sessionOf } from '../session.js';
import type { RequestWithSession } from '../session.js';
import {
  adicionarMember,
  editarMember,
  listarEquipe,
  myPermissionsInFlow,
  removeMember,
} from '../domain/management/team-of-flow.js';

/**
 * The contact's "Equipe" tab (`/fluxo/:id/equipe`) uses a browser session. Keep per-flow team logic in `dominio/gestao/equipe-do-fluxo.ts`, with a thin adapter like `gestao-builder.ts`. `GET :id/equipe` loads members, edit-modal resources and caller editability; `GET :id/equipe/eu` supplies `itensDoMenu`; `POST :id/equipe` adds someone already on the contract by email; `PATCH :id/equipe/:usuarioId` saves changes; `DELETE :id/equipe/:usuarioId` returns 204. The tenant comes from the session, never the URL, so another customer's flow looks absent (404). Invalid UUID `id` is rejected with 404 before Postgres can return 500.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/*
 * Copy `uuidOu404` from `gestao-fluxo.ts` rather than coupling this controller to that file; the three-line rule is the same.
 */
function uuidOu404(value: string, oQue: string): string {
  if (!UUID.test(value)) throw PipeError.naoEncontrado(oQue);
  return value;
}

@Controller('v1/gestao/fluxos')
export class ManagementTeamController {
  @Get(':id/equipe')
  @WithSession()
  async listar(
    @Req() requisicao: RequestWithSession,
    @Param('id') id: string,
  ): Promise<TeamOfFlow> {
    const sessao = sessionOf(requisicao);
    uuidOu404(id, 'fluxo');
    return noTenant(sessao.tenantId, (tx) =>
      listarEquipe(tx, sessao.tenantId, sessao.userId, id),
    );
  }

  /** No separate permission is needed: this response describes the caller and is always that caller's own data. */
  @Get(':id/equipe/eu')
  @WithSession()
  async minhas(
    @Req() requisicao: RequestWithSession,
    @Param('id') id: string,
  ): Promise<MyPermissionsInFlow> {
    const sessao = sessionOf(requisicao);
    uuidOu404(id, 'fluxo');
    return noTenant(sessao.tenantId, (tx) =>
      myPermissionsInFlow(tx, sessao.tenantId, sessao.userId, id),
    );
  }

  @Post(':id/equipe')
  @HttpCode(201)
  @WithSession()
  async adicionar(
    @Req() requisicao: RequestWithSession,
    @Param('id') id: string,
    @Body() corpo: RequestOfMemberOfFlow,
  ): Promise<MemberOfFlow> {
    const sessao = sessionOf(requisicao);
    uuidOu404(id, 'fluxo');
    return noTenant(sessao.tenantId, (tx) =>
      adicionarMember(tx, sessao.tenantId, sessao.userId, id, corpo ?? {}),
    );
  }

  @Patch(':id/equipe/:usuarioId')
  @WithSession()
  async editar(
    @Req() requisicao: RequestWithSession,
    @Param('id') id: string,
    @Param('usuarioId') usuarioId: string,
    @Body() corpo: RequestOfMemberOfFlow,
  ): Promise<MemberOfFlow> {
    const sessao = sessionOf(requisicao);
    uuidOu404(id, 'fluxo');
    uuidOu404(usuarioId, 'membro');
    return noTenant(sessao.tenantId, (tx) =>
      editarMember(tx, sessao.tenantId, sessao.userId, id, usuarioId, corpo ?? {}),
    );
  }

  @Delete(':id/equipe/:usuarioId')
  @HttpCode(204)
  @WithSession()
  async remover(
    @Req() request: RequestWithSession,
    @Param('id') id: string,
    @Param('usuarioId') userId: string,
  ): Promise<void> {
    const session = sessionOf(request);
    uuidOu404(id, 'fluxo');
    uuidOu404(userId, 'membro');
    await noTenant(session.tenantId, (tx) =>
      removeMember(tx, session.tenantId, session.userId, id, userId),
    );
  }
}
