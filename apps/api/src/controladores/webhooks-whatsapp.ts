import { createHmac, timingSafeEqual } from 'node:crypto';
import { Controller, Get, HttpCode, Param, Post, Query, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { resolverCanal, resolverCanalPorIdentificador } from '../banco.js';
import { ErroPipe } from '../erros.js';
import { enfileirarEntrada } from '../filas.js';

/** O corpo cru, guardado pelo `verify` do parser de JSON — a assinatura é sobre ele. */
export type RequisicaoComCorpoCru = Request & { corpoCru?: Buffer };

/**
 * Webhook da Meta.
 *
 * Três coisas que não podem ser negociadas:
 *
 * 1. A assinatura `X-Hub-Signature-256` é conferida sobre o **corpo cru**. Reserializar
 *    o JSON muda espaço e ordem de chave e a assinatura passa a nunca bater.
 * 2. A resposta é 200 imediato. A Meta reenvia o evento quando a resposta demora, e
 *    reentrega vira mensagem repetida — por isso o processamento vai para a fila.
 * 3. O `verify_token` do desafio de inscrição é comparado em tempo constante, como
 *    a assinatura: os dois são segredo compartilhado.
 */
@Controller('webhooks/whatsapp')
export class ControladorWebhookWhatsApp {
  /** Verificação de inscrição: a Meta chama uma vez, com `hub.challenge`. */
  @Get(':canalId')
  async verificar(
    @Param('canalId') canalId: string,
    @Query('hub.mode') modo: string | undefined,
    @Query('hub.verify_token') token: string | undefined,
    @Query('hub.challenge') desafio: string | undefined,
    @Res() resposta: Response,
  ): Promise<void> {
    const canal = await resolverCanal(canalId);
    if (!canal) throw ErroPipe.naoEncontrado('Canal');

    const esperado = String(canal.config['verifyToken'] ?? process.env['WHATSAPP_VERIFY_TOKEN'] ?? '');
    if (modo !== 'subscribe' || !esperado || !igual(token ?? '', esperado)) {
      throw new ErroPipe(403, 'verificacao_recusada', 'hub.verify_token não confere.');
    }
    // A Meta espera o desafio cru, em texto — não JSON.
    resposta.status(200).type('text/plain').send(desafio ?? '');
  }

  @Post(':canalId')
  @HttpCode(200)
  async receber(
    @Param('canalId') canalId: string,
    @Req() requisicao: RequisicaoComCorpoCru,
  ): Promise<{ recebido: true }> {
    const canal = await resolverCanal(canalId);
    if (!canal) throw ErroPipe.naoEncontrado('Canal');
    if (!canal.ativo) throw ErroPipe.conflito('canal_inativo', 'O canal está desativado.');

    const segredo = String(canal.config['appSecret'] ?? process.env['WHATSAPP_APP_SECRET'] ?? '');
    if (!segredo) {
      // Sem segredo não há como distinguir a Meta de qualquer um. Recusa fechada.
      throw new ErroPipe(
        403,
        'canal_sem_app_secret',
        'O canal não tem appSecret configurado: sem ele a assinatura não pode ser conferida.',
      );
    }

    const corpo = requisicao.corpoCru;
    if (!corpo) {
      throw new ErroPipe(400, 'corpo_ausente', 'O corpo cru não chegou ao validador.');
    }
    if (!assinaturaConfere(segredo, corpo, requisicao.header('x-hub-signature-256'))) {
      throw new ErroPipe(401, 'assinatura_invalida', 'X-Hub-Signature-256 não confere.');
    }

    // Enfileira e responde. Processar aqui dentro é o que faz a Meta reenviar.
    await enfileirarEntrada(canalId, requisicao.body);
    return { recebido: true };
  }

  /**
   * A rota guarda-chuva, para o que a Meta NÃO deixa ter URL por cliente.
   *
   * Aprovação e rejeição de template, qualidade do número, mudança de limite e
   * alerta de banimento não aceitam `override_callback_uri`: caem todos aqui,
   * misturando os clientes. Ver `docs/specs/2026-09-07-webhook-por-cliente.md`.
   *
   * Duas diferenças em relação à rota por canal, e as duas importam:
   *
   * 1. A assinatura é conferida com o `appSecret` do NOSSO aplicativo, que é um
   *    só. Ela prova que veio da Meta — não prova de quem é o evento.
   * 2. O tenant sai do payload, e payload que não casa com canal nenhum é
   *    **descartado**, nunca processado no melhor palpite.
   */
  /**
   * O desafio de inscrição da rota guarda-chuva.
   *
   * A Meta chama esta URL uma vez, quando o webhook é cadastrado **no aplicativo**.
   * Aqui o token é o do ambiente e não o do canal: não há canal no caminho, e o
   * webhook do aplicativo é um só. Sem esta rota o cadastro do webhook do app não
   * passa, e sem ele não chega template rejeitado nem queda de qualidade.
   */
  @Get()
  async verificarDaConta(
    @Query('hub.mode') modo: string | undefined,
    @Query('hub.verify_token') token: string | undefined,
    @Query('hub.challenge') desafio: string | undefined,
    @Res() resposta: Response,
  ): Promise<void> {
    const esperado = process.env['WHATSAPP_VERIFY_TOKEN'] ?? '';
    if (modo !== 'subscribe' || !esperado || !igual(token ?? '', esperado)) {
      throw new ErroPipe(403, 'verificacao_recusada', 'hub.verify_token não confere.');
    }
    resposta.status(200).type('text/plain').send(desafio ?? '');
  }

  @Post()
  @HttpCode(200)
  async receberDaConta(@Req() requisicao: RequisicaoComCorpoCru): Promise<{ recebido: true }> {
    const segredo = process.env['WHATSAPP_APP_SECRET'] ?? '';
    if (!segredo) {
      throw new ErroPipe(
        403,
        'app_sem_secret',
        'WHATSAPP_APP_SECRET não está definida: sem ela a assinatura não pode ser conferida.',
      );
    }

    const corpo = requisicao.corpoCru;
    if (!corpo) throw new ErroPipe(400, 'corpo_ausente', 'O corpo cru não chegou ao validador.');
    if (!assinaturaConfere(segredo, corpo, requisicao.header('x-hub-signature-256'))) {
      throw new ErroPipe(401, 'assinatura_invalida', 'X-Hub-Signature-256 não confere.');
    }

    for (const entrada of identificarEntradas(requisicao.body)) {
      const canal = await resolverCanalPorIdentificador(entrada.numeroId, entrada.wabaId);
      if (!canal) {
        // Sem dono: outro aplicativo, ou canal já removido. Fica no log e morre aqui.
        console.warn(
          `[webhook] evento de conta sem canal correspondente (waba=${entrada.wabaId ?? '—'}, numero=${entrada.numeroId ?? '—'})`,
        );
        continue;
      }
      await enfileirarEntrada(canal.id, entrada.corpo);
    }
    return { recebido: true };
  }
}

interface EntradaIdentificada {
  wabaId: string | undefined;
  numeroId: string | undefined;
  corpo: unknown;
}

/**
 * Quebra o payload em uma entrada por `entry`, cada uma com o identificador que
 * permite achar o dono.
 *
 * Um POST da Meta pode trazer várias `entry`, e nada garante que sejam do mesmo
 * cliente nesta rota. Tratar o lote como um só levaria o evento de um cliente
 * para a fila de outro — é exatamente o vazamento que a rota por canal não tem.
 */
export function identificarEntradas(corpo: unknown): EntradaIdentificada[] {
  const raiz = corpo as { entry?: unknown[] } | undefined;
  if (!Array.isArray(raiz?.entry)) return [];

  return raiz.entry.map((entrada) => {
    const e = entrada as {
      id?: string;
      changes?: { value?: { metadata?: { phone_number_id?: string } } }[];
    };
    const numeroId = e.changes?.find((c) => c.value?.metadata?.phone_number_id)?.value?.metadata
      ?.phone_number_id;
    return {
      wabaId: e.id,
      numeroId,
      // Reembrulhado com UMA entry: o processamento a jusante espera o formato da Meta.
      corpo: { object: 'whatsapp_business_account', entry: [entrada] },
    };
  });
}

export function assinaturaConfere(
  segredo: string,
  corpo: Buffer,
  cabecalho: string | undefined,
): boolean {
  if (!cabecalho?.startsWith('sha256=')) return false;
  const calculada = createHmac('sha256', segredo).update(corpo).digest('hex');
  return igual(cabecalho.slice('sha256='.length), calculada);
}

/** Assinar é fácil; comparar sem vazar o tamanho do acerto é o que evita o oráculo. */
function igual(a: string, b: string): boolean {
  const bufferA = Buffer.from(a);
  const bufferB = Buffer.from(b);
  if (bufferA.length !== bufferB.length) return false;
  return timingSafeEqual(bufferA, bufferB);
}
