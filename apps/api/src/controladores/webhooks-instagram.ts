import { Controller, Get, HttpCode, Param, Post, Query, Req, Res } from '@nestjs/common';
import type { Response } from 'express';
import { segredoConfere } from '@pipe/db';
import { resolverCanal } from '../banco.js';
import type { CanalResolvido } from '../banco.js';
import { ErroPipe } from '../erros.js';
import { enfileirarEntrada } from '../filas.js';
import { assinaturaConfere } from './webhooks-whatsapp.js';
import type { RequisicaoComCorpoCru } from './webhooks-whatsapp.js';

/**
 * Webhook do Instagram (Direct), por canal. Reconstruído de chatwoot/chatwoot (MIT),
 * app/controllers/webhooks/instagram_controller.rb, com as regras do webhook do
 * WhatsApp da Pipe (`webhooks-whatsapp.ts`): `verify_token` em tempo constante,
 * assinatura `X-Hub-Signature-256` sobre o corpo cru com o App Secret DO APP DO
 * CLIENTE (gravado no canal), 200 imediato e o processamento na fila.
 *
 * Diferente do WhatsApp, não há segredo do ambiente como reserva: todo canal do
 * Instagram é manual, e sem o segredo do canal a recusa é fechada.
 */
@Controller('webhooks/instagram')
export class ControladorWebhookInstagram {
  @Get(':canalId')
  async verificar(
    @Param('canalId') canalId: string,
    @Query('hub.mode') modo: string | undefined,
    @Query('hub.verify_token') token: string | undefined,
    @Query('hub.challenge') desafio: string | undefined,
    @Res() resposta: Response,
  ): Promise<void> {
    const canal = await canalDoInstagram(canalId);
    const esperado = String(canal.config['verifyToken'] ?? '');
    if (modo !== 'subscribe' || !esperado || !segredoConfere(token ?? '', esperado)) {
      throw new ErroPipe(403, 'verificacao_recusada', 'hub.verify_token não confere.');
    }
    resposta.status(200).type('text/plain').send(desafio ?? '');
  }

  @Post(':canalId')
  @HttpCode(200)
  async receber(
    @Param('canalId') canalId: string,
    @Req() requisicao: RequisicaoComCorpoCru,
  ): Promise<{ recebido: true }> {
    const canal = await canalDoInstagram(canalId);
    if (!canal.ativo) throw ErroPipe.conflito('canal_inativo', 'O canal está desativado.');

    const segredo = String(canal.config['appSecret'] ?? '');
    if (!segredo) {
      throw new ErroPipe(
        403,
        'canal_sem_app_secret',
        'O canal não tem appSecret configurado: sem ele a assinatura não pode ser conferida.',
      );
    }
    const corpo = requisicao.corpoCru;
    if (!corpo) throw new ErroPipe(400, 'corpo_ausente', 'O corpo cru não chegou ao validador.');
    if (!assinaturaConfere(segredo, corpo, requisicao.header('x-hub-signature-256'))) {
      throw new ErroPipe(401, 'assinatura_invalida', 'X-Hub-Signature-256 não confere.');
    }

    await enfileirarEntrada(canalId, requisicao.body);
    return { recebido: true };
  }
}

/** Canal que não é do Instagram é 404 aqui: a URL de um WhatsApp não vira porta de entrada do Direct. */
async function canalDoInstagram(canalId: string): Promise<CanalResolvido> {
  const canal = /^[0-9a-f-]{36}$/i.test(canalId) ? await resolverCanal(canalId) : null;
  if (!canal || canal.tipo !== 'instagram') throw ErroPipe.naoEncontrado('Canal');
  return canal;
}
