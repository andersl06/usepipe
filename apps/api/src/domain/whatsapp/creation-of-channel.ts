import { sql } from 'drizzle-orm';
import { cifrarConfig, registrarAuditoria } from '@pipe/db';
import { keyring, noTenant } from '../../database.js';
import { PipeError } from '../../errors.js';
import { codigoDoPostgres } from '../dominios.js';
import { readChannelWhatsApp, novoVerifyToken, numeroJaConectado } from './channel.js';
import type { ChannelWhatsApp } from './channel.js';
import { versaoDaApi } from './cliente-graph.js';
import type { InfoDoNumero } from './info-do-numero.js';

/**
 * Portado de chatwoot/chatwoot (MIT), app/services/whatsapp/channel_creation_service.rb
 *
 * Mesmos passos: valida, recusa número que já existe **em qualquer cliente**, e
 * cria canal e caixa de entrada na MESMA transação — canal sem caixa é canal que
 * recebe mensagem sem ter onde pô-la.
 *
 * Acréscimos do Pipe:
 * - o token e o `verify_token` gravados **cifrados** (`cifrarConfig`);
 * - a caixa nasce apontando para a primeira fila ativa, que é quem a distribuição
 *   usa (`fila_padrao_id`) — o Chatwoot não tem fila;
 * - auditoria com o autor, na mesma transação;
 * - o índice único de `numero_id` fecha a corrida que o `find_by` deixa aberta:
 *   duas conexões simultâneas do mesmo número, uma delas cai no `23505`.
 */

export interface InfoDaWaba {
  wabaId: string;
  nomeDaEmpresa?: string | undefined;
}

export type OriginOfChannel = 'embedded_signup' | 'manual_setup_v2';

export interface RequestOfCreation {
  tenantId: string;
  userId: string;
  infoDaWaba: InfoDaWaba | null;
  infoDoNumero: InfoDoNumero | null;
  token: string;
  origin?: OriginOfChannel;
  /** Só a configuração manual permite escolher o nome; o cadastro embutido usa o da empresa. */
  name?: string | undefined;
  /** Configuração manual: o segredo e o id do app DO CLIENTE, que assina o webhook dele. */
  appSecret?: string | undefined;
  appId?: string | null | undefined;
}

/** `errors.whatsapp.phone_number_already_exists`, no texto do pt_BR do próprio Chatwoot. */
export function numeroEmUso(numero: string): PipeError {
  return PipeError.conflito(
    'number_in_use',
    `Já existe um canal para este número de telefone: ${numero}. Entre em contato com o suporte se o erro persistir`,
  );
}

export async function createChannel(pedido: RequestOfCreation): Promise<ChannelWhatsApp> {
  // `validate_parameters!`
  if (!pedido.tenantId) throw PipeError.request('account_missing', 'A conta é obrigatória.');
  if (!pedido.infoDaWaba?.wabaId) {
    throw PipeError.request('waba_missing', 'As informações da WABA são obrigatórias.');
  }
  if (!pedido.infoDoNumero) {
    throw PipeError.request('number_missing', 'As informações do número são obrigatórias.');
  }
  if (!pedido.token) throw PipeError.request('token_missing', 'O token de acesso é obrigatório.');

  const info = pedido.infoDoNumero;
  const waba = pedido.infoDaWaba;
  if (await numeroJaConectado(info.numeroId, info.numero)) throw numeroEmUso(info.numero);

  // `build_inbox_name`: "#{business_name} WhatsApp".
  const nomeDaEmpresa = info.nomeDaEmpresa || waba.nomeDaEmpresa || info.numero;
  const nome = pedido.nome?.trim() || `${nomeDaEmpresa} WhatsApp`;
  const origem: OriginOfChannel = pedido.origem ?? 'embedded_signup';

  // `build_provider_config`. No cadastro embutido o `appSecret` é do NOSSO
  // aplicativo; ausente, não é gravado, e o webhook cai no `WHATSAPP_APP_SECRET`
  // do ambiente. Na configuração manual é o do app do cliente.
  const appSecret = pedido.appSecret || process.env['WHATSAPP_APP_SECRET'] || '';
  const config = cifrarConfig(
    {
      tokenAcesso: pedido.token,
      phoneNumberId: info.numeroId,
      verifyToken: novoVerifyToken(),
      apiVersao: versaoDaApi(),
      numero: info.numero,
      nomeExibicao: nomeDaEmpresa,
      origem,
      ...(appSecret ? { appSecret } : {}),
      ...(pedido.appId ? { appId: pedido.appId } : {}),
    },
    keyring(),
  );

  let channelId: string;
  try {
    channelId = await noTenant(pedido.tenantId, async (tx) => {
      // Em série, nunca em `Promise.all`: paralelo dentro da transação derruba o
      // `pipe.tenant_id` e a consulta passa a rodar sem tenant — ver o README.
      const { rows } = await tx.execute<{ id: string }>(sql`
        insert into canal (tenant_id, tipo, nome, config, waba_id, numero_id)
        values (${pedido.tenantId}::uuid, 'whatsapp_cloud', ${nome},
                ${JSON.stringify(config)}::jsonb, ${waba.wabaId}, ${info.numeroId})
        returning id
      `);
      const id = rows[0]!.id;

      const { rows: queues } = await tx.execute<{ id: string }>(
        sql`select id from fila where ativa order by ordem, criado_em limit 1`,
      );
      await tx.execute(sql`
        insert into inbox (tenant_id, canal_id, nome, fila_padrao_id)
        values (${pedido.tenantId}::uuid, ${id}::uuid, ${nome}, ${queues[0]?.id ?? null})
      `);

      await registrarAuditoria(tx, pedido.tenantId, {
        ator: { type: 'usuario', id: pedido.userId },
        acao: 'criou',
        objetoTipo: 'canal',
        objetoId: id,
        depois: { id, nome, waba_id: waba.wabaId, numero_id: info.numeroId, origem },
      });
      return id;
    });
  } catch (error) {
    if (codigoDoPostgres(error) === '23505') throw numeroEmUso(info.numero);
    throw error;
  }

  return readChannelWhatsApp(pedido.tenantId, channelId);
}
