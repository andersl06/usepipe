import { Body, Controller, Get, HttpCode, Param, Post, Req } from '@nestjs/common';
import type { ConviteVisivel } from '@pipe/contracts';
import { noTenant } from '../banco.js';
import { ComSessao, exigirPermissao, sessaoDe } from '../sessao.js';
import type { RequisicaoComSessao } from '../sessao.js';
import { aceitarConvite, criarConvite, lerConvite, reenviarConvite } from '../dominio/convites.js';
import { registrarDominio, verificarDominio } from '../dominio/dominios.js';

/**
 * As duas portas por onde gente nova entra num tenant: o convite e o domínio
 * verificado. Ficam no mesmo arquivo porque são a mesma decisão vista de dois
 * lados — "esta pessoa pertence a este cliente?" — e a regra de uma só faz sentido
 * ao lado da outra.
 *
 * A casca é fina de propósito: convite e domínio moram em `src/dominio/`, testáveis
 * sem subir o Nest. Aqui só há verbo, caminho, permissão e formato.
 *
 * **Rota sem `@ComSessao()` é pública de propósito.** As duas do convite precisam
 * ser: quem abre o link ainda não tem conta, e exigir sessão para ver um convite
 * seria exigir a conta que o convite existe para criar.
 */

@Controller('v1/convites')
export class ControladorConvites {
  /** Convida alguém. Devolve o link com o token — que não volta a aparecer. */
  @Post()
  @HttpCode(201)
  @ComSessao()
  async criar(
    @Req() requisicao: RequisicaoComSessao,
    @Body() corpo: { email?: string; papel?: string },
  ): Promise<Record<string, unknown>> {
    const sessao = sessaoDe(requisicao);
    // O "gerencia membros" do `admin` — a mesma permissão que a tela de Membros confere.
    await permitido(sessao.tenantId, sessao.usuarioId, 'conta.membros.escrever');

    const convite = await criarConvite(sessao.tenantId, {
      email: corpo.email,
      papel: corpo.papel,
      criadoPor: sessao.usuarioId,
    });

    return {
      id: convite.id,
      email: convite.email,
      papel: convite.papel,
      url: convite.url,
      expiraEm: convite.expiraEm.toISOString(),
    };
  }

  /**
   * Reenvia um convite em aberto: mesmo e-mail, mesmo papel, link novo — o de
   * antes morre (ver `emitirConvite`). Mesma permissão de convidar; sem ela ou
   * sem o convite (de outro tenant, já aceito, já vencido) sai 403/404.
   */
  @Post(':id/reenviar')
  @HttpCode(201)
  @ComSessao()
  async reenviar(
    @Req() requisicao: RequisicaoComSessao,
    @Param('id') id: string,
  ): Promise<Record<string, unknown>> {
    const sessao = sessaoDe(requisicao);
    await permitido(sessao.tenantId, sessao.usuarioId, 'conta.membros.escrever');

    const convite = await reenviarConvite(sessao.tenantId, id, sessao.usuarioId);
    return {
      id: convite.id,
      email: convite.email,
      papel: convite.papel,
      url: convite.url,
      expiraEm: convite.expiraEm.toISOString(),
    };
  }

  /**
   * Para quem é o convite. Sem sessão, e devolvendo o MÍNIMO: o e-mail convidado, o
   * papel e o nome do cliente. Quem tem o link já sabe o e-mail; o resto da conta
   * não é assunto de quem ainda está do lado de fora.
   */
  @Get(':token')
  async ver(@Param('token') token: string): Promise<ConviteVisivel> {
    const convite = await lerConvite(token);
    return {
      email: convite.email,
      papel: convite.papel,
      tenant: convite.tenant,
      expiraEm: convite.expiraEm.toISOString(),
    };
  }

  /**
   * Aceita o convite: cria o usuário e queima o token.
   *
   * A conta do Google é ligada quando a pessoa entra — pelo domínio verificado, ou
   * pelo próprio link do convite, que é `entrarEm` aqui embaixo. Esse é o caminho de
   * quem não tem domínio verificado, e por isso ele vem pronto na resposta.
   */
  @Post(':token/aceitar')
  @HttpCode(200)
  async aceitar(@Param('token') token: string): Promise<Record<string, unknown>> {
    const aceito = await aceitarConvite(token);
    return {
      usuarioId: aceito.usuarioId,
      email: aceito.email,
      papel: aceito.papel,
      tenant: aceito.tenant,
      entrarEm: `/v1/auth/google?convite=${encodeURIComponent(token)}`,
    };
  }
}

@Controller('v1/dominios')
export class ControladorDominios {
  /** Registra o domínio e diz qual TXT publicar. Verificar é o passo seguinte. */
  @Post()
  @HttpCode(201)
  @ComSessao()
  async registrar(
    @Req() requisicao: RequisicaoComSessao,
    @Body() corpo: { dominio?: string },
  ): Promise<Record<string, unknown>> {
    const sessao = sessaoDe(requisicao);
    await permitido(sessao.tenantId, sessao.usuarioId, 'tenant.configurar');

    const registrado = await registrarDominio(sessao.tenantId, corpo.dominio);
    return {
      id: registrado.id,
      dominio: registrado.dominio,
      verificadoEm: registrado.verificadoEm?.toISOString() ?? null,
      registro: registrado.registro,
    };
  }

  /** Confere o TXT no DNS. Sai 400 enquanto não achar — publicar e propagar demora. */
  @Post(':id/verificar')
  @HttpCode(200)
  @ComSessao()
  async verificar(
    @Req() requisicao: RequisicaoComSessao,
    @Param('id') id: string,
  ): Promise<Record<string, unknown>> {
    const sessao = sessaoDe(requisicao);
    await permitido(sessao.tenantId, sessao.usuarioId, 'tenant.configurar');

    const verificado = await verificarDominio(sessao.tenantId, id);
    return {
      id: verificado.id,
      dominio: verificado.dominio,
      verificadoEm: verificado.verificadoEm.toISOString(),
    };
  }
}

/**
 * A permissão é conferida numa transação própria, antes da que escreve.
 *
 * Duas transações em vez de uma porque a permissão mora numa tabela do tenant e as
 * funções de domínio abrem a delas. Custa uma consulta de leitura e mantém o
 * controlador sem saber de transação — e a alternativa, empurrar o `usuarioId`
 * para dentro de cada função de domínio, espalharia a regra de acesso por elas.
 */
function permitido(tenantId: string, usuarioId: string, codigo: string): Promise<void> {
  return noTenant(tenantId, (tx) => exigirPermissao(tx, usuarioId, codigo));
}
