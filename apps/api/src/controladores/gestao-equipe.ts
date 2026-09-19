import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Req } from '@nestjs/common';
import type {
  EquipeDoFluxo,
  MembroDoFluxo,
  MinhasPermissoesNoFluxo,
  PedidoDeMembroDoFluxo,
} from '@pipe/contracts';
import { noTenant } from '../banco.js';
import { ErroPipe } from '../erros.js';
import { ComSessao, sessaoDe } from '../sessao.js';
import type { RequisicaoComSessao } from '../sessao.js';
import {
  adicionarMembro,
  editarMembro,
  listarEquipe,
  minhasPermissoesNoFluxo,
  removerMembro,
} from '../dominio/gestao/equipe-do-fluxo.js';

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
function uuidOu404(valor: string, oQue: string): string {
  if (!UUID.test(valor)) throw ErroPipe.naoEncontrado(oQue);
  return valor;
}

@Controller('v1/gestao/fluxos')
export class ControladorGestaoEquipe {
  @Get(':id/equipe')
  @ComSessao()
  async listar(
    @Req() requisicao: RequisicaoComSessao,
    @Param('id') id: string,
  ): Promise<EquipeDoFluxo> {
    const sessao = sessaoDe(requisicao);
    uuidOu404(id, 'fluxo');
    return noTenant(sessao.tenantId, (tx) =>
      listarEquipe(tx, sessao.tenantId, sessao.usuarioId, id),
    );
  }

  /** Sem permissão própria: é a resposta sobre QUEM PERGUNTA, e ela é sempre dele. */
  @Get(':id/equipe/eu')
  @ComSessao()
  async minhas(
    @Req() requisicao: RequisicaoComSessao,
    @Param('id') id: string,
  ): Promise<MinhasPermissoesNoFluxo> {
    const sessao = sessaoDe(requisicao);
    uuidOu404(id, 'fluxo');
    return noTenant(sessao.tenantId, (tx) =>
      minhasPermissoesNoFluxo(tx, sessao.tenantId, sessao.usuarioId, id),
    );
  }

  @Post(':id/equipe')
  @HttpCode(201)
  @ComSessao()
  async adicionar(
    @Req() requisicao: RequisicaoComSessao,
    @Param('id') id: string,
    @Body() corpo: PedidoDeMembroDoFluxo,
  ): Promise<MembroDoFluxo> {
    const sessao = sessaoDe(requisicao);
    uuidOu404(id, 'fluxo');
    return noTenant(sessao.tenantId, (tx) =>
      adicionarMembro(tx, sessao.tenantId, sessao.usuarioId, id, corpo ?? {}),
    );
  }

  @Patch(':id/equipe/:usuarioId')
  @ComSessao()
  async editar(
    @Req() requisicao: RequisicaoComSessao,
    @Param('id') id: string,
    @Param('usuarioId') usuarioId: string,
    @Body() corpo: PedidoDeMembroDoFluxo,
  ): Promise<MembroDoFluxo> {
    const sessao = sessaoDe(requisicao);
    uuidOu404(id, 'fluxo');
    uuidOu404(usuarioId, 'membro');
    return noTenant(sessao.tenantId, (tx) =>
      editarMembro(tx, sessao.tenantId, sessao.usuarioId, id, usuarioId, corpo ?? {}),
    );
  }

  @Delete(':id/equipe/:usuarioId')
  @HttpCode(204)
  @ComSessao()
  async remover(
    @Req() requisicao: RequisicaoComSessao,
    @Param('id') id: string,
    @Param('usuarioId') usuarioId: string,
  ): Promise<void> {
    const sessao = sessaoDe(requisicao);
    uuidOu404(id, 'fluxo');
    uuidOu404(usuarioId, 'membro');
    await noTenant(sessao.tenantId, (tx) =>
      removerMembro(tx, sessao.tenantId, sessao.usuarioId, id, usuarioId),
    );
  }
}
