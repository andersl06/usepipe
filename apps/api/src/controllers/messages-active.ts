import { Body, Controller, Get, HttpCode, Post, Query, Req } from '@nestjs/common';
import { KeyOrSession, atorDe } from '../authentication.js';
import type { RequestAuthenticated } from '../authentication.js';
import { resolveChannel } from '../database.js';
import {
  DAILY_LIMIT_BY_CONTACT,
  MAX_CONTACTS_BY_TRIGGER,
  dispararMessageActive,
  applicationOfActive,
} from '../domain/message-active.js';
import type { DestinationOfTrigger } from '../domain/message-active.js';
import { PipeError } from '../errors.js';
import type { RequestWithSession } from '../session.js';

/**
 * `/v1/mensagens-ativas` — disparo de template para uma lista de contatos.
 *
 * Ver `referencias-blip/pesquisa/blip-desk-mensagens-ativas.md` e `dominio/mensagem-ativa.ts`.
 *
 * **A resposta é 207-em-espírito**: 201 com o resultado POR CONTATO. Um número
 * inválido no meio de quinze não derruba os catorze bons, e a tela precisa saber
 * exatamente quem entrou e quem foi recusado — é assim que a tela deles se comporta.
 */

interface CorpoDoDisparo {
  channelId?: string;
  template_id?: string;
  contacts?: { contactId?: string; phone?: string; name?: string; parametros?: string[] }[];
  parametros?: string[];
}

@Controller('v1/messages-active')
export class ActiveMessagesController {
  /** Os limites em vigor, para a tela não repetir número mágico. */
  @Get('limits')
  @KeyOrSession('mensagens:ler')
  limites(): Record<string, unknown> {
    return {
      maxContactsByTrigger: MAX_CONTACTS_BY_TRIGGER,
      // 0 desliga, como o `ActiveMessageLimitCount` deles.
      dailyLimitByContact: DAILY_LIMIT_BY_CONTACT,
    };
  }

  /** O painel "Status geral": últimas 72 horas, como o deles. */
  @Get()
  @KeyOrSession('mensagens:ler')
  async application(
    @Req() request: RequestAuthenticated & RequestWithSession,
    @Query('horas') horas: string | undefined,
  ): Promise<Record<string, unknown>> {
    const ator = atorDe(request);
    const window = Math.min(Math.max(Number(horas ?? 72) || 72, 1), 720);
    const linhas = await applicationOfActive(ator.tenantId, window);
    return {
      windowHours: window,
      data: linhas.map((l) => ({
        id: l.messageId,
        conversa_id: l.conversationId,
        contato_id: l.contactId,
        contato_nome: l.contactName,
        telefone: l.phone,
        template_nome: l.templateNome,
        estado_entrega: l.stateDelivery,
        erro_codigo: l.errorCode,
        criada_em: l.criadaEm,
      })),
    };
  }

  @Post()
  @HttpCode(201)
  @KeyOrSession('mensagens:escrever')
  async disparar(
    @Req() requisicao: RequestAuthenticated & RequestWithSession,
    @Body() corpo: CorpoDoDisparo,
  ): Promise<Record<string, unknown>> {
    const ator = atorDe(requisicao);
    if (!corpo.channelId) throw PipeError.request('channel_required', 'Informe `canal_id`.');
    if (!corpo.template_id) {
      throw PipeError.request('template_required', 'Escolha um modelo aprovado.');
    }

    const channel = await resolveChannel(corpo.channelId);
    // O canal é resolvido pelo papel dono, então CONFERIR O TENANT aqui não é
    // paranoia: sem isto, um `canal_id` de outro cliente viraria disparo no número
    // dele com a nossa credencial.
    if (!channel || channel.tenantId !== ator.tenantId) throw PipeError.naoEncontrado('Canal');
    if (!channel.active) throw PipeError.conflito('channel_inactive', 'O canal está desativado.');

    const destinos: DestinationOfTrigger[] = (corpo.contacts ?? []).map((c) => ({
      contatoId: c.contactId ?? null,
      telefone: c.phone ?? null,
      nome: c.name ?? null,
      parametros: c.parametros ?? null,
    }));
    if (destinos.some((d) => !d.contatoId && !d.phone)) {
      throw PipeError.request(
        'destination_invalid',
        'Cada contato precisa de `contato_id` ou `telefone`.',
      );
    }

    const resultados = await dispararMessageActive(channel, {
      tenantId: ator.tenantId,
      channelId: corpo.channelId,
      templateId: corpo.template_id,
      destinos,
      ...(corpo.parametros ? { parametros: corpo.parametros } : {}),
      agentId: ator.viaSession ? ator.userId : null,
    });

    return {
      enviadas: resultados.filter((r) => r.enviada).length,
      recusadas: resultados.filter((r) => !r.enviada).length,
      data: resultados.map((r) => ({
        telefone: r.phone,
        contato_id: r.contatoId,
        enviada: r.enviada,
        mensagem_id: r.mensagemId ?? null,
        conversa_id: r.conversationId ?? null,
        motivo: r.motivo ?? null,
        detalhe: r.detalhe ?? null,
      })),
    };
  }
}
