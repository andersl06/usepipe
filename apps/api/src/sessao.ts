import { SetMetadata } from '@nestjs/common';
import type { CanActivate, ExecutionContext } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { NOME_DO_COOKIE, hashDoToken, resolverSessao } from '@pipe/autenticacao';
import type { SessaoAtiva } from '@pipe/autenticacao';
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
  if (!cabecalho) return undefined;
  for (const parte of cabecalho.split(';')) {
    const igual = parte.indexOf('=');
    if (igual < 0) continue;
    if (parte.slice(0, igual).trim() !== nome) continue;
    return decodeURIComponent(parte.slice(igual + 1).trim());
  }
  return undefined;
}

export function tokenDaSessao(requisicao: Request): string | undefined {
  return lerCookie(requisicao.header('cookie'), NOME_DO_COOKIE);
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
    const token = tokenDaSessao(requisicao);
    if (!token) throw recusa();

    // Pelo HASH, com índice único: o token em claro nunca chega ao banco.
    const sessao = await resolverSessao(bancoDono(), hashDoToken(token));
    if (!sessao) throw recusa();

    requisicao.sessao = sessao;
    return true;
  }
}
