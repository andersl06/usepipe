import type { CanalWhatsApp } from './canal.js';
import { configurarWebhook } from './configuracao-de-webhook.js';
import { criarCanal } from './criacao-de-canal.js';
import { validarConfiguracaoManual } from './validacao-da-configuracao-manual.js';

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
 */

export interface ConfiguracaoManual {
  canal: CanalWhatsApp;
  /** `webhook_error`. `null` é o `webhook_setup?` verdadeiro. */
  erroDeWebhook: string | null;
}

export async function executarConfiguracaoManual(pedido: {
  tenantId: string;
  usuarioId: string;
  wabaId?: string | undefined;
  numeroId?: string | undefined;
  token?: string | undefined;
  nome?: string | undefined;
}): Promise<ConfiguracaoManual> {
  const previa = await validarConfiguracaoManual(pedido);

  const canal = await criarCanal({
    tenantId: pedido.tenantId,
    usuarioId: pedido.usuarioId,
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
  });

  // `setup_webhook`: erro de registro também conta como erro de webhook.
  try {
    const resultado = await configurarWebhook(canal, { wabaId: previa.wabaId });
    if (resultado.erroDeRegistro) throw resultado.erroDeRegistro;
    return { canal: resultado.canal, erroDeWebhook: null };
  } catch (erro) {
    return { canal, erroDeWebhook: (erro as Error).message };
  }
}
