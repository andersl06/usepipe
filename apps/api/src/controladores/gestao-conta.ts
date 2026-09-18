import { Body, Controller, Get, HttpCode, Post, Req } from '@nestjs/common';
import { and, eq, sql } from 'drizzle-orm';
import { registrarAuditoria } from '@pipe/db';
import type { Ator, TransacaoPipe } from '@pipe/db';
import { fluxo } from '@pipe/db/schema';
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
import {
  IMAGEM,
  conferir,
  limparNome,
  nomeCurto,
  tipoRealDaImagem,
  type RecadosDoNome,
} from '../dominio/gestao/regras-de-nome.js';

/**
 * O CONTRATO e a conta na Gestão — o painel do contrato, os membros, e a
 * criação de contato (fluxo/roteador) — por sessão de navegador.
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
const EDITAR_FLUXO = 'automacao.fluxo.editar';

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

export interface PedidoDeContato {
  nome: string;
  tipo: 'fluxo' | 'roteador';
  /** `data:image/...;base64,...` ou nada. Os bytes decidem o tipo, não o rótulo. */
  imagem?: string | null;
  recados: RecadosDoNome & { nomeEmUso: string; semPermissao: string };
}

export type ResultadoDeContato =
  { id: string; erro?: undefined } | { id?: undefined; erro: string };

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

  /**
   * Criar um contato (fluxo ou roteador) — o `gravarContato` de
   * `apps/gestao/src/app/criar/gravar.ts`, tal e qual: nome saneado e conferido
   * pelas regras da origem, foto lida pelos BYTES, nome único na prática.
   */
  @Post('fluxos')
  @HttpCode(200)
  @ComSessao()
  async criarContato(
    @Req() requisicao: RequisicaoComSessao,
    @Body() corpo: PedidoDeContato,
  ): Promise<ResultadoDeContato> {
    const sessao = sessaoDe(requisicao);
    const tipo = corpo?.tipo === 'roteador' ? 'roteador' : 'fluxo';
    const recados = corpo?.recados;
    if (!recados) throw ErroPipe.requisicao('recados_ausentes', 'Faltam os recados da tela.');
    const nome = limparNome(String(corpo.nome ?? '')).trim();
    const recusa = conferir(nome, recados);
    if (recusa) return { erro: recusa.motivo };
    const imagemUrl = lerImagem(corpo.imagem);

    return noTenant(sessao.tenantId, async (tx) => {
      const permissoes = await permissoesDe(tx, sessao.usuarioId);
      if (!permissoes.includes(EDITAR_FLUXO)) return { erro: recados.semPermissao };
      const [conflito] = await tx
        .select({ id: fluxo.id })
        .from(fluxo)
        .where(and(eq(fluxo.tenantId, sessao.tenantId), eq(fluxo.nome, nome)))
        .limit(1);
      if (conflito) return { erro: recados.nomeEmUso };
      const [criado] = await tx
        .insert(fluxo)
        .values({ tenantId: sessao.tenantId, nome, tipo, shortName: nomeCurto(nome), imagemUrl })
        .returning({ id: fluxo.id });
      if (!criado) return { erro: recados.nomeEmUso };
      await registrarAuditoria(tx, sessao.tenantId, {
        ator: { tipo: 'usuario', id: sessao.usuarioId },
        acao: 'criou',
        objetoTipo: 'fluxo',
        objetoId: criado.id,
        depois: { nome, tipo, estado: 'rascunho' },
      });
      return { id: criado.id };
    });
  }
}

/** A foto, se veio e se é mesmo imagem: o tipo sai dos bytes, nunca do rótulo. */
function lerImagem(dataUrl: string | null | undefined): string | null {
  if (!dataUrl) return null;
  const m = /^data:[^;]+;base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!m) return null;
  const bytes = new Uint8Array(Buffer.from(m[1] ?? '', 'base64'));
  if (bytes.byteLength === 0 || bytes.byteLength > IMAGEM.maxBytes) return null;
  const mime = tipoRealDaImagem(bytes);
  if (!mime) return null;
  return `data:${mime};base64,${Buffer.from(bytes).toString('base64')}`;
}
