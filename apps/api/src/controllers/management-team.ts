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
 * A aba "Equipe" do contato (`/fluxo/:id/equipe`), por sessão de navegador — a
 * mesma casca fina de `gestao-builder.ts`, num arquivo à parte porque a equipe
 * POR FLUXO é um assunto só e a regra inteira mora em
 * `dominio/gestao/equipe-do-fluxo.ts`.
 *
 * - `GET :id/equipe` — a lista, os recursos do modal de editar e se quem olha
 *   pode mexer;
 * - `GET :id/equipe/eu` — o que o menu do contato peneira (`itensDoMenu`);
 * - `POST :id/equipe` — adiciona por e-mail de quem JÁ está no contrato;
 * - `PATCH :id/equipe/:usuarioId` — o "Salvar alterações";
 * - `DELETE :id/equipe/:usuarioId` — 204.
 *
 * O tenant vem da sessão, nunca da URL: fluxo de outro cliente é 404, como
 * fluxo que não existe. `id` fora do padrão de uuid é 404 antes do banco —
 * URL é texto de fora, e o Postgres recusa uuid malformado com 500.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/* Cópia do `uuidOu404` de `gestao-fluxo.ts` para não amarrar este controlador
   àquele arquivo — são três linhas e a regra é a mesma nos dois. */
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

  /** Sem permissão própria: é a resposta sobre QUEM PERGUNTA, e ela é sempre dele. */
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
