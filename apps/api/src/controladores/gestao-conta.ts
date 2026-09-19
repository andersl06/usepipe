import { Body, Controller, Get, HttpCode, Post, Req } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import type { Ator, TransacaoPipe } from '@pipe/db';
import { noTenant } from '../banco.js';
import { ErroPipe } from '../erros.js';
import { ComSessao, sessaoDe } from '../sessao.js';
import type { RequisicaoComSessao } from '../sessao.js';
import {
  cancelarConvite,
  carregarMembros,
  carregarPapeisDaConta,
  carregarResumoDoContrato,
  definirPapelDoConvite,
  definirPapelDoMembro,
  removerMembro,
  type Gravacao,
  type MembroDoContrato,
  type PapelDaConta,
  type ResumoDoContrato,
} from '../dominio/gestao/contrato.js';
import { carregarImplantacao, type Implantacao } from '../dominio/gestao/implantacao.js';

/**
 * O CONTRATO e a conta na Gestão — o painel do contrato e os membros — por
 * sessão de navegador. A criação de contato (fluxo/roteador) nasceu aqui e
 * foi para `gestao-fluxo.ts`, junto do resto do ciclo de vida.
 *
 * A permissão é conferida AQUI, na gravação: tela escondida não é porta
 * trancada. `permissoesDe` é a mesma união de papéis que `GET /v1/eu` devolve.
 */
async function permissoesDe(tx: TransacaoPipe, usuarioId: string): Promise<string[]> {
  const { rows } = await tx.execute<{ codigo: string }>(sql`
    select distinct pp.permissao_codigo as codigo
      from usuario_papel up
      join papel_permissao pp on pp.papel_id = up.papel_id
     where up.usuario_id = ${usuarioId}::uuid
     order by 1
  `);
  return rows.map((p) => p.codigo);
}

const LER_MEMBROS = 'conta.membros.ler';
const ESCREVER_MEMBROS = 'conta.membros.escrever';

export interface AlvoDeMembro {
  tipo: 'usuario' | 'convite';
  id: string;
}

/** `usuario:<id>` / `convite:<id>`, como a tela de membros manda. */
function lerAlvos(valores: readonly string[] | undefined): AlvoDeMembro[] {
  const lidos: AlvoDeMembro[] = [];
  for (const cru of valores ?? []) {
    const corte = cru.indexOf(':');
    if (corte < 0) continue;
    const tipo = cru.slice(0, corte);
    const id = cru.slice(corte + 1).trim();
    if ((tipo === 'usuario' || tipo === 'convite') && id) lidos.push({ tipo, id });
  }
  return lidos;
}

export interface ResultadoSimples {
  ok: boolean;
  erro?: string;
}

const falha = (erro: string): ResultadoSimples => ({ ok: false, erro });
const conferirGravacao = (g: Gravacao): ResultadoSimples => (g.ok ? { ok: true } : falha(g.erro));

@Controller('v1/gestao')
export class ControladorGestaoConta {
  @Get('contrato/resumo')
  @ComSessao()
  resumo(@Req() requisicao: RequisicaoComSessao): Promise<ResumoDoContrato> {
    const sessao = sessaoDe(requisicao);
    return noTenant(sessao.tenantId, (tx) => carregarResumoDoContrato(tx, sessao.tenantId));
  }

  @Get('contrato/membros')
  @ComSessao()
  async membros(
    @Req() requisicao: RequisicaoComSessao,
  ): Promise<{ membros: MembroDoContrato[]; papeis: PapelDaConta[] }> {
    const sessao = sessaoDe(requisicao);
    return noTenant(sessao.tenantId, async (tx) => {
      const permissoes = await permissoesDe(tx, sessao.usuarioId);
      if (!permissoes.includes(LER_MEMBROS)) throw ErroPipe.semPermissao(LER_MEMBROS);
      return { membros: await carregarMembros(tx), papeis: await carregarPapeisDaConta(tx) };
    });
  }

  @Post('contrato/membros/papel')
  @HttpCode(200)
  @ComSessao()
  async trocarPapel(
    @Req() requisicao: RequisicaoComSessao,
    @Body() corpo: { papelId?: string; alvos?: string[] },
  ): Promise<ResultadoSimples> {
    const sessao = sessaoDe(requisicao);
    const papelId = String(corpo?.papelId ?? '').trim();
    if (!papelId) return falha('Escolha o papel de quem está sendo alterado.');
    const alvos = lerAlvos(corpo?.alvos);
    if (alvos.length === 0) return falha('Escolha quem terá o papel alterado.');
    return noTenant(sessao.tenantId, async (tx) => {
      const permissoes = await permissoesDe(tx, sessao.usuarioId);
      if (!permissoes.includes(ESCREVER_MEMBROS)) {
        return falha('Você não tem permissão para gerenciar os membros deste contrato.');
      }
      const ator: Ator = { tipo: 'usuario', id: sessao.usuarioId };
      for (const alvo of alvos) {
        const r = conferirGravacao(
          alvo.tipo === 'convite'
            ? await definirPapelDoConvite(tx, sessao.tenantId, ator, alvo.id, papelId)
            : await definirPapelDoMembro(tx, sessao.tenantId, ator, alvo.id, papelId),
        );
        if (!r.ok) return r;
      }
      return { ok: true };
    });
  }

  @Post('contrato/membros/excluir')
  @HttpCode(200)
  @ComSessao()
  async excluirMembros(
    @Req() requisicao: RequisicaoComSessao,
    @Body() corpo: { alvos?: string[] },
  ): Promise<ResultadoSimples> {
    const sessao = sessaoDe(requisicao);
    const alvos = lerAlvos(corpo?.alvos);
    if (alvos.length === 0) return falha('Escolha quem sai do contrato.');
    /* Ninguém se remove sozinho: quem o fizesse perderia o acesso no clique
       seguinte, e um contrato pode ficar sem nenhum administrador. */
    if (alvos.some((a) => a.tipo === 'usuario' && a.id === sessao.usuarioId)) {
      return falha('Você não pode excluir o seu próprio acesso a este contrato.');
    }
    return noTenant(sessao.tenantId, async (tx) => {
      const permissoes = await permissoesDe(tx, sessao.usuarioId);
      if (!permissoes.includes(ESCREVER_MEMBROS)) {
        return falha('Você não tem permissão para gerenciar os membros deste contrato.');
      }
      const ator: Ator = { tipo: 'usuario', id: sessao.usuarioId };
      for (const alvo of alvos) {
        const r = conferirGravacao(
          alvo.tipo === 'convite'
            ? await cancelarConvite(tx, sessao.tenantId, ator, alvo.id)
            : await removerMembro(tx, sessao.tenantId, ator, alvo.id),
        );
        if (!r.ok) return r;
      }
      return { ok: true };
    });
  }

  @Get('implantacao')
  @ComSessao()
  implantacao(@Req() requisicao: RequisicaoComSessao): Promise<Implantacao> {
    const sessao = sessaoDe(requisicao);
    return noTenant(sessao.tenantId, (tx) => carregarImplantacao(tx));
  }
}
