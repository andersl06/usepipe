import { Body, Controller, Delete, Get, HttpCode, Param, Post, Req } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import type { Ator, TransactionPipe } from '@pipe/db';
import { noTenant } from '../database.js';
import { PipeError } from '../errors.js';
import { WithSession, sessionOf } from '../session.js';
import type { RequestWithSession } from '../session.js';
import {
  cancelInvitation,
  loadMembers,
  loadRolesOfAccount,
  loadSummaryOfContract,
  defineRoleOfInvitation,
  defineRoleOfMember,
  removeMember,
  type Recording,
  type MemberOfContract,
  type RoleOfAccount,
  type SummaryOfContract,
} from '../domain/management/contract.js';
import { loadDeployment, type Deployment } from '../domain/management/deployment.js';
import {
  createCertificate,
  excluirCertificado,
  excluirHostDoCertificado,
  listarCertificados,
  type CertificadoMtls,
  type PedidoDeCertificado,
} from '../domain/management/certificados.js';

/**
 * The contract panel and members in Management use a browser session. Contact creation (flow/router) moved to `gestao-fluxo.ts` with the rest of its lifecycle. Check permission here when writing: hiding a screen does not secure an endpoint. `permissoesDe` currently reads distinct role grants from `usuario_papel` and `papel_permissao`; unlike `GET /v1/eu`, it does not apply `usuario_permissao` overrides.
 */
async function permissionsOf(tx: TransactionPipe, userId: string): Promise<string[]> {
  const { rows } = await tx.execute<{ code: string }>(sql`
    select distinct pp.permissao_codigo as code
      from usuario_papel up
      join papel_permissao pp on pp.papel_id = up.papel_id
     where up.usuario_id = ${userId}::uuid
     order by 1
  `);
  return rows.map((p) => p.code);
}

const READ_MEMBERS = 'conta.membros.ler';
const WRITE_MEMBERS = 'conta.membros.escrever';

export interface TargetOfMember {
  type: 'usuario' | 'convite';
  id: string;
}

/** `usuario:<id>` / `convite:<id>`, como a tela de membros manda. */
function lerAlvos(values: readonly string[] | undefined): TargetOfMember[] {
  const lidos: TargetOfMember[] = [];
  for (const cru of values ?? []) {
    const corte = cru.indexOf(':');
    if (corte < 0) continue;
    const tipo = cru.slice(0, corte);
    const id = cru.slice(corte + 1).trim();
    if ((tipo === 'usuario' || tipo === 'convite') && id) lidos.push({ type: tipo, id });
  }
  return lidos;
}

export interface ResultadoSimples {
  ok: boolean;
  error?: string;
}

const falha = (error: string): ResultadoSimples => ({ ok: false, error });
const checkRecording = (g: Recording): ResultadoSimples => (g.ok ? { ok: true } : falha(g.error));

@Controller('v1/management')
export class ManagementAccountController {
  @Get('contract/summary')
  @WithSession()
  resumo(@Req() requisicao: RequestWithSession): Promise<SummaryOfContract> {
    const sessao = sessionOf(requisicao);
    return noTenant(sessao.tenantId, (tx) => loadSummaryOfContract(tx, sessao.tenantId));
  }

  @Get('contract/members')
  @WithSession()
  async members(
    @Req() requisicao: RequestWithSession,
  ): Promise<{ members: MemberOfContract[]; papeis: RoleOfAccount[] }> {
    const sessao = sessionOf(requisicao);
    return noTenant(sessao.tenantId, async (tx) => {
      const permissoes = await permissionsOf(tx, sessao.userId);
      if (!permissoes.includes(READ_MEMBERS)) throw PipeError.withoutPermission(READ_MEMBERS);
      return { members: await loadMembers(tx), papeis: await loadRolesOfAccount(tx) };
    });
  }

  @Post('contract/members/role')
  @HttpCode(200)
  @WithSession()
  async exchangeRole(
    @Req() request: RequestWithSession,
    @Body() corpo: { roleId?: string; alvos?: string[] },
  ): Promise<ResultadoSimples> {
    const session = sessionOf(request);
    const roleId = String(corpo?.roleId ?? '').trim();
    if (!roleId) return falha('Escolha o papel de quem está sendo alterado.');
    const alvos = lerAlvos(corpo?.alvos);
    if (alvos.length === 0) return falha('Escolha quem terá o papel alterado.');
    return noTenant(session.tenantId, async (tx) => {
      const permissions = await permissionsOf(tx, session.userId);
      if (!permissions.includes(WRITE_MEMBERS)) {
        return falha('Você não tem permissão para gerenciar os membros deste contrato.');
      }
      const ator: Ator = { type: 'usuario', id: session.userId };
      for (const alvo of alvos) {
        const r = checkRecording(
          alvo.type === 'convite'
            ? await defineRoleOfInvitation(tx, session.tenantId, ator, alvo.id, roleId)
            : await defineRoleOfMember(tx, session.tenantId, ator, alvo.id, roleId),
        );
        if (!r.ok) return r;
      }
      return { ok: true };
    });
  }

  @Post('contract/members/delete')
  @HttpCode(200)
  @WithSession()
  async deleteMembers(
    @Req() requisicao: RequestWithSession,
    @Body() corpo: { alvos?: string[] },
  ): Promise<ResultadoSimples> {
    const sessao = sessionOf(requisicao);
    const alvos = lerAlvos(corpo?.alvos);
    if (alvos.length === 0) return falha('Escolha quem sai do contrato.');
    /*
     * Do not let someone remove their own membership: they would lose access on the next click, and the account could be left without an administrator.
     */
    if (alvos.some((a) => a.type === 'usuario' && a.id === sessao.userId)) {
      return falha('Você não pode excluir o seu próprio acesso a este contrato.');
    }
    return noTenant(sessao.tenantId, async (tx) => {
      const permissoes = await permissionsOf(tx, sessao.userId);
      if (!permissoes.includes(WRITE_MEMBERS)) {
        return falha('Você não tem permissão para gerenciar os membros deste contrato.');
      }
      const ator: Ator = { type: 'usuario', id: sessao.userId };
      for (const alvo of alvos) {
        const r = checkRecording(
          alvo.type === 'convite'
            ? await cancelInvitation(tx, sessao.tenantId, ator, alvo.id)
            : await removeMember(tx, sessao.tenantId, ator, alvo.id),
        );
        if (!r.ok) return r;
      }
      return { ok: true };
    });
  }

  @Get('deployment')
  @WithSession()
  deployment(@Req() requisicao: RequestWithSession): Promise<Deployment> {
    const sessao = sessionOf(requisicao);
    return noTenant(sessao.tenantId, (tx) => loadDeployment(tx));
  }

  /**
   * Authentication certificates (mTLS) use the same guard as Members (`conta.membros.ler`/`.escrever`). The source also places both screens behind `tenant-members` (`blip-certificados-mtls.md`).
   */
  @Get('contract/certificates')
  @WithSession()
  async certificados(@Req() requisicao: RequestWithSession): Promise<CertificadoMtls[]> {
    const sessao = sessionOf(requisicao);
    return noTenant(sessao.tenantId, async (tx) => {
      const permissoes = await permissionsOf(tx, sessao.userId);
      if (!permissoes.includes(READ_MEMBERS)) throw PipeError.withoutPermission(READ_MEMBERS);
      return listarCertificados(tx, sessao.tenantId);
    });
  }

  @Post('contract/certificates')
  @HttpCode(201)
  @WithSession()
  async cadastrarCertificado(
    @Req() requisicao: RequestWithSession,
    @Body() corpo: PedidoDeCertificado,
  ): Promise<CertificadoMtls> {
    const sessao = sessionOf(requisicao);
    return noTenant(sessao.tenantId, async (tx) => {
      const permissoes = await permissionsOf(tx, sessao.userId);
      if (!permissoes.includes(WRITE_MEMBERS)) throw PipeError.withoutPermission(WRITE_MEMBERS);
      const ator: Ator = { type: 'usuario', id: sessao.userId };
      return createCertificate(tx, sessao.tenantId, ator, corpo);
    });
  }

  @Delete('contract/certificates/:id')
  @HttpCode(200)
  @WithSession()
  async apagarCertificado(
    @Req() requisicao: RequestWithSession,
    @Param('id') id: string,
  ): Promise<ResultadoSimples> {
    const sessao = sessionOf(requisicao);
    return noTenant(sessao.tenantId, async (tx) => {
      const permissoes = await permissionsOf(tx, sessao.userId);
      if (!permissoes.includes(WRITE_MEMBERS)) {
        return falha('Você não tem permissão para gerenciar os certificados deste contrato.');
      }
      const ator: Ator = { type: 'usuario', id: sessao.userId };
      return checkRecording(await excluirCertificado(tx, sessao.tenantId, ator, id));
    });
  }

  @Delete('contract/certificates/:id/hosts/:hostId')
  @HttpCode(200)
  @WithSession()
  async apagarHostDoCertificado(
    @Req() requisicao: RequestWithSession,
    @Param('id') id: string,
    @Param('hostId') hostId: string,
  ): Promise<ResultadoSimples> {
    const sessao = sessionOf(requisicao);
    return noTenant(sessao.tenantId, async (tx) => {
      const permissoes = await permissionsOf(tx, sessao.userId);
      if (!permissoes.includes(WRITE_MEMBERS)) {
        return falha('Você não tem permissão para gerenciar os certificados deste contrato.');
      }
      const ator: Ator = { type: 'usuario', id: sessao.userId };
      return checkRecording(await excluirHostDoCertificado(tx, sessao.tenantId, ator, id, hostId));
    });
  }
}
