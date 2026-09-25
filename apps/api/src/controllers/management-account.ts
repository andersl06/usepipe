import { Body, Controller, Delete, Get, HttpCode, Param, Post, Req } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import type { Ator, TransacaoPipe as TransactionPipe } from '@pipe/db';
import { noTenant } from '../database.js';
import { PipeError } from '../errors.js';
import { WithSession, sessionOf } from '../session.js';
import type { RequestWithSession } from '../session.js';
import {
  cancelarInvitation,
  loadMembers,
  loadPapeisOfAccount,
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
 * O CONTRATO e a conta na Gestão — o painel do contrato e os membros — por
 * sessão de navegador. A criação de contato (fluxo/roteador) nasceu aqui e
 * foi para `gestao-fluxo.ts`, junto do resto do ciclo de vida.
 *
 * A permissão é conferida AQUI, na gravação: tela escondida não é porta
 * trancada. `permissoesDe` é a mesma união de papéis que `GET /v1/eu` devolve.
 */
async function permissionsOf(tx: TransactionPipe, userId: string): Promise<string[]> {
  const { rows } = await tx.execute<{ code: string }>(sql`
    select distinct pp.permissao_codigo as codigo
      from usuario_papel up
      join papel_permissao pp on pp.papel_id = up.papel_id
     where up.usuario_id = ${userId}::uuid
     order by 1
  `);
  return rows.map((p) => p.codigo);
}

const READ_MEMBERS = 'conta.membros.ler';
const ESCREVER_MEMBERS = 'conta.membros.escrever';

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
      return { membros: await loadMembers(tx), papeis: await loadPapeisOfAccount(tx) };
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
      if (!permissions.includes(ESCREVER_MEMBERS)) {
        return falha('Você não tem permissão para gerenciar os membros deste contrato.');
      }
      const ator: Ator = { tipo: 'usuario', id: session.userId };
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
    /* Ninguém se remove sozinho: quem o fizesse perderia o acesso no clique
       seguinte, e um contrato pode ficar sem nenhum administrador. */
    if (alvos.some((a) => a.type === 'usuario' && a.id === sessao.userId)) {
      return falha('Você não pode excluir o seu próprio acesso a este contrato.');
    }
    return noTenant(sessao.tenantId, async (tx) => {
      const permissoes = await permissionsOf(tx, sessao.userId);
      if (!permissoes.includes(ESCREVER_MEMBERS)) {
        return falha('Você não tem permissão para gerenciar os membros deste contrato.');
      }
      const ator: Ator = { tipo: 'usuario', id: sessao.userId };
      for (const alvo of alvos) {
        const r = checkRecording(
          alvo.type === 'convite'
            ? await cancelarInvitation(tx, sessao.tenantId, ator, alvo.id)
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
   * Certificados de autenticação (mTLS) — mesma guarda de Membros
   * (`conta.membros.ler`/`.escrever`): a origem também tranca as duas telas
   * atrás de `tenant-members` (`blip-certificados-mtls.md`).
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
      if (!permissoes.includes(ESCREVER_MEMBERS)) throw PipeError.withoutPermission(ESCREVER_MEMBERS);
      const ator: Ator = { tipo: 'usuario', id: sessao.userId };
      return createCertificate(tx, sessao.tenantId, ator, corpo);
    });
  }

  @Delete('contrato/certificados/:id')
  @HttpCode(200)
  @WithSession()
  async apagarCertificado(
    @Req() requisicao: RequestWithSession,
    @Param('id') id: string,
  ): Promise<ResultadoSimples> {
    const sessao = sessionOf(requisicao);
    return noTenant(sessao.tenantId, async (tx) => {
      const permissoes = await permissionsOf(tx, sessao.userId);
      if (!permissoes.includes(ESCREVER_MEMBERS)) {
        return falha('Você não tem permissão para gerenciar os certificados deste contrato.');
      }
      const ator: Ator = { tipo: 'usuario', id: sessao.userId };
      return checkRecording(await excluirCertificado(tx, sessao.tenantId, ator, id));
    });
  }

  @Delete('contrato/certificados/:id/hosts/:hostId')
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
      if (!permissoes.includes(ESCREVER_MEMBERS)) {
        return falha('Você não tem permissão para gerenciar os certificados deste contrato.');
      }
      const ator: Ator = { tipo: 'usuario', id: sessao.userId };
      return checkRecording(await excluirHostDoCertificado(tx, sessao.tenantId, ator, id, hostId));
    });
  }
}
