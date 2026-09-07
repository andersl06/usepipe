import { createHash, timingSafeEqual } from 'node:crypto';
import { applyDecorators, SetMetadata } from '@nestjs/common';
import type { CanActivate, ExecutionContext } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import { sql } from 'drizzle-orm';
import type { Request } from 'express';
import { bancoDono } from './banco.js';
import { ErroPipe } from './erros.js';
import { CHAVE_QUALQUER_CREDENCIAL, CHAVE_SESSAO, temBearer } from './sessao.js';
import type { RequisicaoComSessao } from './sessao.js';

/**
 * Autenticação por `chave_api`, no formato recomendado em `apis.md` §5.2:
 * `Authorization: Bearer <token>`, token **opaco** (não JWT auto-contido) para poder
 * ser revogado na hora, e `tenant_id` resolvido no servidor — nunca vindo do cliente,
 * nem em payload, nem em header.
 *
 * O token é `pipe_<prefixo>_<segredo>`. O banco guarda o `prefixo` em claro (é o que
 * a tela mostra para o cliente reconhecer a chave) e o `sha256` do segredo. Achar a
 * chave pelo prefixo é a única consulta que roda antes de haver tenant em vigor.
 */

export const CATALOGO_ESCOPOS = [
  'conversas:ler',
  'conversas:escrever',
  'mensagens:ler',
  'mensagens:escrever',
  'contatos:ler',
  'contatos:escrever',
  'filas:ler',
  'atendentes:ler',
  'webhooks:escrever',
] as const;

export type Escopo = (typeof CATALOGO_ESCOPOS)[number];

export interface ContextoDaChave {
  tenantId: string;
  chaveId: string;
  escopos: string[];
}

/** A requisição autenticada carrega o contexto; o controlador nunca lê header. */
export type RequisicaoAutenticada = Request & { contexto?: ContextoDaChave };

export const CHAVE_ESCOPOS = 'pipe:escopos';

/** Marca o escopo exigido por rota. Sem a marca, a rota é pública (webhook). */
export const Escopos = (...escopos: Escopo[]) => SetMetadata(CHAVE_ESCOPOS, escopos);

/**
 * A rota serve aos dois clientes: integração por chave de API **ou** gente logada no
 * navegador. Quem se apresentou manda — ver `CHAVE_QUALQUER_CREDENCIAL` em `sessao.ts`.
 *
 * Existe porque `POST /v1/conversas/:id/mensagens` é a MESMA operação nos dois casos, e
 * duplicá-la numa rota `/v1/desk/...` seria duas implementações da regra de janela de
 * 24 horas, de outbox e de evento — ou seja, duas para divergir.
 */
export const ChaveOuSessao = (...escopos: Escopo[]) =>
  applyDecorators(
    SetMetadata(CHAVE_ESCOPOS, escopos),
    SetMetadata(CHAVE_SESSAO, true),
    SetMetadata(CHAVE_QUALQUER_CREDENCIAL, true),
  );

/**
 * Quem está pedindo: uma integração ou uma pessoa.
 *
 * O `tenantId` sai da credencial nos dois casos, nunca do corpo nem da URL. O
 * `usuarioId` só existe quando é gente — chave de API não tem dono, e mensagem
 * enviada por integração é do sistema.
 */
export interface Ator {
  tenantId: string;
  usuarioId: string | null;
  /** `true` quando veio de navegador. É o que liga as regras de atendente. */
  viaSessao: boolean;
}

export function atorDe(requisicao: RequisicaoAutenticada & RequisicaoComSessao): Ator {
  if (requisicao.contexto) {
    return { tenantId: requisicao.contexto.tenantId, usuarioId: null, viaSessao: false };
  }
  if (requisicao.sessao) {
    return {
      tenantId: requisicao.sessao.tenantId,
      usuarioId: requisicao.sessao.usuarioId,
      viaSessao: true,
    };
  }
  throw ErroPipe.naoAutorizado();
}

export function contextoDe(requisicao: RequisicaoAutenticada): ContextoDaChave {
  if (!requisicao.contexto) throw ErroPipe.naoAutorizado();
  return requisicao.contexto;
}

type LinhaChave = {
  id: string;
  tenant_id: string;
  hash: string;
  escopos: string[] | null;
  expirada: boolean;
  revogada: boolean;
};

export class GuardaChaveApi implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  async canActivate(contexto: ExecutionContext): Promise<boolean> {
    const exigidos = this.reflector.getAllAndOverride<Escopo[] | undefined>(CHAVE_ESCOPOS, [
      contexto.getHandler(),
      contexto.getClass(),
    ]);
    // Rota sem `@Escopos` é pública de propósito: o webhook da Meta se autentica
    // pela assinatura `X-Hub-Signature-256`, não por chave nossa.
    if (!exigidos || exigidos.length === 0) return true;

    const requisicao = contexto.switchToHttp().getRequest<RequisicaoAutenticada>();

    // Rota que aceita as duas credenciais e NÃO recebeu Bearer: quem confere é o
    // guarda da sessão. Ver `CHAVE_QUALQUER_CREDENCIAL` em `sessao.ts`.
    const qualquer = this.reflector.getAllAndOverride<boolean | undefined>(
      CHAVE_QUALQUER_CREDENCIAL,
      [contexto.getHandler(), contexto.getClass()],
    );
    if (qualquer && !temBearer(requisicao)) return true;

    const chave = await autenticar(requisicao.header('authorization'));
    requisicao.contexto = chave;

    const permitido = exigidos.every(
      (escopo) => chave.escopos.includes('*') || chave.escopos.includes(escopo),
    );
    if (!permitido) {
      const faltando = exigidos.find(
        (escopo) => !chave.escopos.includes('*') && !chave.escopos.includes(escopo),
      );
      throw ErroPipe.semEscopo(faltando ?? exigidos[0] ?? 'desconhecido');
    }
    return true;
  }
}

export async function autenticar(cabecalho: string | undefined): Promise<ContextoDaChave> {
  const token = (cabecalho ?? '').replace(/^Bearer\s+/i, '').trim();
  const partes = token.split('_');
  if (partes.length !== 3 || partes[0] !== 'pipe' || !partes[1] || !partes[2]) {
    throw ErroPipe.naoAutorizado();
  }
  const [, prefixo, segredo] = partes;

  const { rows } = await bancoDono().execute<LinhaChave>(sql`
    select id, tenant_id, hash, escopos,
           (expira_em is not null and expira_em <= now()) as expirada,
           (revogada_em is not null) as revogada
      from chave_api
     where prefixo = ${prefixo}
     limit 1
  `);
  const linha = rows[0];
  if (!linha) throw ErroPipe.naoAutorizado();
  if (!igualEmTempoConstante(hashDoSegredo(segredo), linha.hash)) throw ErroPipe.naoAutorizado();
  if (linha.revogada) throw ErroPipe.naoAutorizado('Chave revogada.');
  if (linha.expirada) throw ErroPipe.naoAutorizado('Chave expirada.');

  // Marcar o uso não pode derrubar a requisição: é dado de auditoria, não de rota.
  void bancoDono()
    .execute(sql`update chave_api set ultimo_uso_em = now() where id = ${linha.id}`)
    .catch(() => undefined);

  return { tenantId: linha.tenant_id, chaveId: linha.id, escopos: linha.escopos ?? [] };
}

export function hashDoSegredo(segredo: string): string {
  return createHash('sha256').update(segredo).digest('hex');
}

/** Comparação sem vazar, pelo tempo de resposta, quantos caracteres bateram. */
function igualEmTempoConstante(a: string, b: string): boolean {
  const bufferA = Buffer.from(a);
  const bufferB = Buffer.from(b);
  if (bufferA.length !== bufferB.length) return false;
  return timingSafeEqual(bufferA, bufferB);
}
