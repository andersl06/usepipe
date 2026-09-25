import type { ChannelWhatsApp } from './canal.js';
import { texto, urlDoWebhook } from './canal.js';
import { configurarWebhook } from './configuracao-de-webhook.js';
import { createChannel } from './criacao-de-canal.js';
import { validateConfigurationManual } from './validacao-da-configuracao-manual.js';
import { reautorizar } from './reautorizacao.js';
import { atualizarChannel } from './canal.js';

/**
 * Portado de chatwoot/chatwoot (MIT), app/services/whatsapp/manual_setup_service.rb
 *
 * Valida, cria canal e caixa (origem `manual_setup_v2`) e configura o webhook. Um
 * webhook que falha NÃO desfaz o canal: volta em `erroDeWebhook`, para a tela
 * dizer o que aconteceu em vez de engolir — é por isso que o original roda o
 * webhook explicitamente e não num callback de gravação.
 *
 * A diferença para o cadastro embutido: aqui o token é do cliente (usuário de
 * sistema dele), então desconectar não solta o número nem desassina a WABA — ver
 * `desmontagem-de-webhook.ts`.
 *
 * Acréscimo do Pipe: o App Secret do app do cliente. É com ele que a Meta assina
 * o que manda para o nosso webhook — o Chatwoot usa um segredo global porque lá o
 * app é sempre o da instalação.
 */

export interface ConfigurationManual {
  channel: ChannelWhatsApp;
  /** `webhook_error`. `null` é o `webhook_setup?` verdadeiro. */
  webhookError: string | null;
  /**
   * O que o cliente cola no webhook DO APP dele (Painel → WhatsApp → Configuração).
   * Mensagens chegam pelo override do número, que já foi feito; mas status de
   * template, qualidade e `account_update` não aceitam override e só chegam se o
   * app do cliente apontar para cá.
   */
  webhook: { url: string; verifyToken: string };
}

export async function executarConfigurationManual(pedido: {
  tenantId: string;
  userId: string;
  wabaId?: string | undefined;
  numberId?: string | undefined;
  token?: string | undefined;
  appSecret?: string | undefined;
  name?: string | undefined;
  /**
   * Reconexão POR CIMA do canal que já existe. Na origem o token é da
   * plataforma e, quando ele cai, refaz-se a conexão no mesmo canal — não há
   * botão de desconectar no WhatsApp (`FICHA-conectar-canal-no-bot.md` §5).
   * Aqui o token é do cliente e expira; sem esta porta, trocar o token vira um
   * beco: criar de novo esbarra no próprio número (`numero_em_uso`).
   */
  channelId?: string | undefined;
}): Promise<ConfigurationManual> {
  const previa = await validateConfigurationManual(pedido);

  if (pedido.channelId) {
    const religado = await reautorizar({
      tenantId: pedido.tenantId,
      channelId: pedido.channelId,
      numeroId: previa.numeroId,
      wabaId: previa.wabaId,
      token: pedido.token ?? '',
      info: {
        numeroId: previa.numeroId,
        numero: previa.numero,
        verificado: true,
        nomeDaEmpresa: previa.nomeVerificado ?? previa.numero,
      },
    });
    /* O App Secret é do app DO CLIENTE e pode ter mudado junto com o token —
       sem ele a assinatura do webhook deixa de conferir. A origem volta a ser a
       manual: `reautorizar` nasceu para o cadastro embutido. */
    const withSecret = await atualizarChannel(religado, {
      origem: 'manual_setup_v2',
      ...(pedido.appSecret ? { appSecret: pedido.appSecret } : {}),
      ...(previa.appId ? { appId: previa.appId } : {}),
    });
    const webhookDele = {
      url: urlDoWebhook(withSecret.id),
      verifyToken: texto(withSecret.config['verifyToken']) ?? '',
    };
    try {
      const resultado = await configurarWebhook(withSecret, { wabaId: previa.wabaId });
      if (resultado.errorOfRegistro) throw resultado.errorOfRegistro;
      return { channel: resultado.channel, webhookError: null, webhook: webhookDele };
    } catch (erro) {
      return { channel: withSecret, webhookError: (erro as Error).message, webhook: webhookDele };
    }
  }

  const channel = await createChannel({
    tenantId: pedido.tenantId,
    userId: pedido.userId,
    infoDaWaba: { wabaId: previa.wabaId, nomeDaEmpresa: previa.nomeVerificado ?? undefined },
    infoDoNumero: {
      numeroId: previa.numeroId,
      numero: previa.numero,
      verificado: true,
      nomeDaEmpresa: previa.nomeVerificado ?? previa.numero,
    },
    token: pedido.token ?? '',
    origem: 'manual_setup_v2',
    nome: pedido.nome?.trim() || previa.nomeSugerido,
    appSecret: pedido.appSecret,
    appId: previa.appId,
  });
  const webhook = { url: urlDoWebhook(channel.id), verifyToken: texto(channel.config['verifyToken']) ?? '' };

  // `setup_webhook`: erro de registro também conta como erro de webhook.
  try {
    const resultado = await configurarWebhook(channel, { wabaId: previa.wabaId });
    if (resultado.errorOfRegistro) throw resultado.errorOfRegistro;
    return { channel: resultado.channel, webhookError: null, webhook };
  } catch (error) {
    return { channel, webhookError: (error as Error).message, webhook };
  }
}
