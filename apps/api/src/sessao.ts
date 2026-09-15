import { SetMetadata } from '@nestjs/common';
import type { CanActivate, ExecutionContext } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import { sql } from 'drizzle-orm';
import type { Request } from 'express';
import { NOME_DO_COOKIE, hashDoToken, resolverSessao } from '@pipe/autenticacao';
import type { SessaoAtiva } from '@pipe/autenticacao';
import type { TransacaoPipe } from '@pipe/db';
import { bancoDono } from './banco.js';
import { ErroPipe } from './erros.js';

/**
 * Autenticação por SESSÃO, para as telas — irmã da autenticação por chave de API de
 * `autenticacao.ts`, e com a mesma promessa: o controlador nunca lê header nem
 * cookie, e o `tenant_id` é resolvido no servidor.
 *
 * As duas convivem porque servem a clientes diferentes: a chave é integração de
 * cliente (`Authorization: Bearer pipe_...`), a sessão é gente num navegador
 * (cookie `pipe_sessao`). Uma rota declara `@Escopos(...)` ou `@ComSessao()`; sem
 * marca nenhuma, é pública de propósito (webhook, `/saude`).
 *
 * O cookie é lido à mão, sem `cookie-parser`: é um `split` de ponto-e-vírgula, e
 * uma dependência a menos na imagem.
 */

export const CHAVE_SESSAO = 'pipe:sessao';

/** Marca a rota como exigindo sessão de navegador. */
export const ComSessao = () => SetMetadata(CHAVE_SESSAO, true);

/**
 * Marca a rota como aceitando **chave de API OU sessão** — não as duas juntas.
 *
 * Sem esta marca, declarar `@Escopos(...)` e `@ComSessao()` na mesma rota exigiria as
 * DUAS credenciais, porque os dois guardas são globais e independentes. Com ela, vale
 * a regra "quem se apresentou manda":
 *
 * - veio `Authorization: Bearer pipe_…` → o guarda da chave confere, o da sessão sai;
 * - não veio → o guarda da chave sai, e o da sessão confere o cookie;
 * - não veio nenhum dos dois → 401 pelo guarda da sessão.
 *
 * O Bearer ganha do cookie de propósito: uma integração que também tenha cookie no
 * mesmo navegador (o caso de quem testa a API logado no Desk) tem de ser tratada como
 * integração, e não silenciosamente como a pessoa.
 *
 * O decorador composto vive em `autenticacao.ts`, junto de `@Escopos`; aqui fica só a
 * chave, para os dois guardas a enxergarem sem ciclo de import.
 */
export const CHAVE_QUALQUER_CREDENCIAL = 'pipe:qualquer-credencial';

/** Há `Authorization: Bearer` na requisição? É o que desempata as duas credenciais. */
export function temBearer(requisicao: Request): boolean {
  return /^Bearer\s+\S/i.test(requisicao.header('authorization') ?? '');
}

export type RequisicaoComSessao = Request & { sessao?: SessaoAtiva };

export function sessaoDe(requisicao: RequisicaoComSessao): SessaoAtiva {
  if (!requisicao.sessao) throw recusa();
  return requisicao.sessao;
}

/**
 * Token ausente, token inexistente, sessão expirada e sessão encerrada dão a MESMA
 * resposta. Distinguir seria contar a quem tenta qual metade do palpite acertou.
 */
function recusa(): ErroPipe {
  return ErroPipe.naoAutorizado('Sessão ausente ou expirada.');
}

export function lerCookie(cabecalho: string | undefined, nome: string): string | undefined {
  return lerCookies(cabecalho, nome)[0];
}

/**
 * TODOS os valores enviados com aquele nome, na ordem em que vieram.
 *
 * O navegador manda um cookie por escopo, e o mesmo nome pode chegar duas vezes:
 * é o que acontece quando o `Domain` muda entre uma versão e outra (de host
 * para domínio-pai, por exemplo) e o antigo continua guardado. O primeiro da
 * lista nem sempre é o que vale — e ler só ele derruba o login de quem ainda
 * carrega o cookie velho, sem erro nenhum no caminho.
 */
export function lerCookies(cabecalho: string | undefined, nome: string): string[] {
  if (!cabecalho) return [];
  const achados: string[] = [];
  for (const parte of cabecalho.split(';')) {
    const igual = parte.indexOf('=');
    if (igual < 0) continue;
    if (parte.slice(0, igual).trim() !== nome) continue;
    achados.push(decodeURIComponent(parte.slice(igual + 1).trim()));
  }
  return achados;
}

export function tokenDaSessao(requisicao: Request): string | undefined {
  return lerCookie(requisicao.header('cookie'), NOME_DO_COOKIE);
}

/**
 * A pessoa tem a permissão? Se não tiver, a requisição para aqui.
 *
 * Função, e não decorador com guarda própria: a permissão mora numa tabela do
 * tenant, e conferir antes de fixar `pipe.tenant_id` exigiria uma segunda consulta
 * com o papel dono só para repetir o que a transação já pode responder. Chame
 * dentro do `noTenant`, antes de escrever qualquer coisa.
 *
 * A permissão é a UNIÃO dos papéis — a mesma regra do `GET /v1/eu`.
 */
export async function exigirPermissao(
  tx: TransacaoPipe,
  usuarioId: string,
  codigo: string,
): Promise<void> {
  const { rows } = await tx.execute<{ tem: boolean }>(sql`
    select exists (
      select 1
        from usuario_papel up
        join papel_permissao pp on pp.papel_id = up.papel_id
       where up.usuario_id = ${usuarioId}::uuid and pp.permissao_codigo = ${codigo}
    ) as tem
  `);
  if (!rows[0]?.tem) throw ErroPipe.semPermissao(codigo);
}

export class GuardaSessao implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  async canActivate(contexto: ExecutionContext): Promise<boolean> {
    const exige = this.reflector.getAllAndOverride<boolean | undefined>(CHAVE_SESSAO, [
      contexto.getHandler(),
      contexto.getClass(),
    ]);
    if (!exige) return true;

    const requisicao = contexto.switchToHttp().getRequest<RequisicaoComSessao>();

    // Rota que aceita as duas credenciais e recebeu Bearer: quem confere é o guarda
    // da chave. Ver `CHAVE_QUALQUER_CREDENCIAL`.
    const qualquer = this.reflector.getAllAndOverride<boolean | undefined>(
      CHAVE_QUALQUER_CREDENCIAL,
      [contexto.getHandler(), contexto.getClass()],
    );
    if (qualquer && temBearer(requisicao)) return true;

    const token = tokenDaSessao(requisicao);
    if (!token) throw recusa();

    // Pelo HASH, com índice único: o token em claro nunca chega ao banco.
    const sessao = await resolverSessao(bancoDono(), hashDoToken(token));
    if (!sessao) throw recusa();

    requisicao.sessao = sessao;
    return true;
  }
}
