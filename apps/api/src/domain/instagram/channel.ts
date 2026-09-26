import { sql } from 'drizzle-orm';
import { cifrarConfig, decifrarConfig, registrarAuditoria } from '@pipe/db';
import { databaseOwner, keyring, esquecerChannel, noTenant } from '../../database.js';
import { PipeError } from '../../errors.js';
import { codigoDoPostgres } from '../dominios.js';
import { novoVerifyToken, texto } from '../whatsapp/channel.js';
import { clienteGraphInstagram, versaoDaApiInstagram } from './cliente-graph.js';

/**
 * Manual Instagram Direct channel, reconstructed from chatwoot/chatwoot (MIT) `Channel::Instagram` and app/controllers/api/v1/accounts/instagram/authorizations_controller.rb. Chatwoot obtains the token through its installation app's OAuth; Pipe has no Meta-approved app, so the customer creates their own "Instagram API with Instagram Login" app and pastes its long-lived token and App Secret, as in manual WhatsApp setup (`../whatsapp/configuracao-manual.ts`). Store the professional account ID (`user_id` from `/me`) in `canal.numero_id`. Its global unique index (migration 0008) prevents an account from joining two tenants, including races, without another migration.
 */

export interface ChannelInstagram {
  id: string;
  tenantId: string;
  name: string;
  active: boolean;
  igUserId: string;
  /** Decrypted; memory only. */
  config: Record<string, unknown>;
}

export interface ChannelInstagramVisible {
  id: string;
  name: string;
  active: boolean;
  igUserId: string | null;
  username: string | null;
  state: 'conectado' | 'desligado' | 'indisponivel';
  motivo: string | null;
  tokenExpiresAt: string | null;
  webhookUrl: string;
  criadoEm: Date;
}

export interface ConexaoInstagram {
  channel: ChannelInstagramVisible;
  /** Webhook subscription failed; keep the channel and report the failure to the screen. */
  webhookError: string | null;
  /** O que o cliente cola no webhook DO APP dele (Painel → Instagram → Webhooks). */
  webhook: { url: string; verifyToken: string };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FORMAT_OF_SECRET = /^[0-9a-f]{32}$/i;
/** Instagram long-lived tokens are valid for 60 days. */
export const VALIDITY_OF_TOKEN_MS = 60 * 24 * 3600 * 1000;

export function urlDoWebhookInstagram(canalId: string): string {
  const base = (process.env['PIPE_URL_API'] ?? 'http://localhost:3100').replace(/\/$/, '');
  return `${base}/webhooks/instagram/${canalId}`;
}

function recusa(message: string): PipeError {
  return new PipeError(422, 'configuration_invalid', message);
}

const accountInUse = () => recusa('Esta conta do Instagram já está conectada a outra caixa de entrada.');

type LineChannel = {
  [column: string]: unknown;
  id: string;
  tenant_id: string;
  name: string;
  active: boolean;
  numero_id: string | null;
  createdAt: string | Date;
  config: Record<string, unknown> | null;
};

export async function readChannelInstagram(tenantId: string, canalId: string): Promise<ChannelInstagram> {
  if (!UUID.test(canalId)) throw PipeError.naoEncontrado('Canal');
  const linha = await noTenant(tenantId, async (tx) => {
    const { rows } = await tx.execute<LineChannel>(sql`
      select id, tenant_id, nome as name, ativo as active, numero_id,
             criado_em as "createdAt", config
        from canal where id = ${canalId}::uuid and tipo = 'instagram' limit 1
    `);
    return rows[0] ?? null;
  });
  if (!linha) throw PipeError.naoEncontrado('Canal');
  return {
    id: linha.id,
    tenantId: linha.tenant_id,
    name: linha.name,
    active: linha.active,
    igUserId: linha.numero_id ?? '',
    config: decifrarConfig(linha.config ?? {}, keyring()),
  };
}

/** Rewrite the entire encrypted `config`; `cifrarConfig` is idempotent. */
export async function atualizarConfigInstagram(
  channel: ChannelInstagram,
  changes: Record<string, unknown>,
): Promise<ChannelInstagram> {
  const config = { ...channel.config, ...changes };
  await noTenant(channel.tenantId, async (tx) => {
    await tx.execute(sql`
      update canal set config = ${JSON.stringify(cifrarConfig(config, keyring()))}::jsonb,
                       atualizado_em = now()
       where id = ${channel.id}::uuid
    `);
  });
  esquecerChannel(channel.id);
  return { ...channel, config };
}

function visivel(linha: LineChannel): ChannelInstagramVisible {
  // `username` and expiry are not secrets and stay readable in encrypted `config`.
  const config = linha.config ?? {};
  const pendente = config['reautorizacaoPendente'] === true;
  return {
    id: linha.id,
    name: linha.name,
    active: linha.active,
    igUserId: linha.numero_id,
    username: texto(config['username']),
    state: !linha.active ? 'desligado' : pendente ? 'indisponivel' : 'conectado',
    motivo: linha.active && pendente ? 'reautorizacao_pendente' : null,
    tokenExpiresAt: texto(config['tokenExpiraEm']),
    webhookUrl: urlDoWebhookInstagram(linha.id),
    criadoEm: linha.createdAt instanceof Date ? linha.createdAt : new Date(linha.createdAt),
  };
}

/**
 * ponytail: listing does not query Meta, unlike the WhatsApp health check. `conectado` means enabled with no pending reauthorization; daily token renewal detects revocation. Query `/me` here if the screen needs live health.
 */
export async function listChannelsInstagram(tenantId: string): Promise<ChannelInstagramVisible[]> {
  return noTenant(tenantId, async (tx) => {
    const { rows } = await tx.execute<LineChannel>(sql`
      select id, tenant_id, nome as name, ativo as active, numero_id, criado_em as "createdAt", config
        from canal where tipo = 'instagram' order by criado_em
    `);
    return rows.map(visivel);
  });
}

async function lerVisivel(tenantId: string, channelId: string): Promise<ChannelInstagramVisible> {
  const linha = await noTenant(tenantId, async (tx) => {
    const { rows } = await tx.execute<LineChannel>(sql`
      select id, tenant_id, nome as name, ativo as active, numero_id, criado_em as "createdAt", config
        from canal where id = ${channelId}::uuid and tipo = 'instagram' limit 1
    `);
    return rows[0] ?? null;
  });
  if (!linha) throw PipeError.naoEncontrado('Canal');
  return visivel(linha);
}

/**
 * Validate the token with `/me` and verify the App Secret through `appsecret_proof`. Reject an account already connected to any tenant; create channel and inbox in one transaction, subscribe the webhook, and return `{ url, verifyToken }` for the customer's app. An inactive account in the same tenant is reconnected with the new token, unlike WhatsApp's reauthorization by `canal_id`.
 */
export async function conectarInstagramManual(pedido: {
  tenantId: string;
  userId: string;
  token?: string | undefined;
  appSecret?: string | undefined;
  name?: string | undefined;
}): Promise<ConexaoInstagram> {
  if (!pedido.token) throw recusa('O token de acesso é obrigatório.');
  if (!pedido.appSecret) throw recusa('O App Secret é obrigatório.');
  if (!FORMAT_OF_SECRET.test(pedido.appSecret)) {
    throw recusa('O App Secret tem 32 caracteres, só números e letras de a a f.');
  }
  const { token, appSecret } = pedido as { token: string; appSecret: string };
  const cliente = clienteGraphInstagram(token);

  let account;
  try {
    account = await cliente.fetchAccount();
  } catch (error) {
    if (error instanceof PipeError && error.codigo === 'meta_refused') {
      throw recusa('O token não foi aceito pelo Instagram. Gere de novo o token de longa duração no painel do app.');
    }
    throw error;
  }
  const igUserId = account.user_id ? String(account.user_id) : '';
  if (!igUserId) throw recusa('O token não é de uma conta profissional do Instagram.');

  if (!(await cliente.checkSecretOfApp(appSecret))) {
    throw recusa('Este App Secret não é do aplicativo que gerou o token.');
  }

  // Check global uniqueness with the owner role: RLS would hide another tenant's channel. Return only the information needed to decide.
  const { rows: existentes } = await databaseOwner().execute<{ id: string; tenant_id: string; active: boolean }>(sql`
    select id, tenant_id, ativo from canal where numero_id = ${igUserId} limit 1
  `);
  const existente = existentes[0];
  if (existente && (existente.tenant_id !== pedido.tenantId || existente.active)) throw accountInUse();

  const agora = new Date();
  const username = account.username ?? null;
  const nome = pedido.name?.trim() || `${username ? `@${username}` : (account.name ?? igUserId)} Instagram`;
  const configNova = {
    tokenAcesso: token,
    appSecret,
    verifyToken: novoVerifyToken(),
    apiVersao: versaoDaApiInstagram(),
    igUserId,
    ...(account.id ? { igId: String(account.id) } : {}),
    ...(username ? { username } : {}),
    nomeExibicao: account.name ?? username ?? igUserId,
    origem: 'manual',
    // The pasted token's real age is unknown; start counting now.
    // Conferir com token real se vale ler `GET /debug_token` ou equivalente.
    tokenRenovadoEm: agora.toISOString(),
    tokenExpiraEm: new Date(agora.getTime() + VALIDITY_OF_TOKEN_MS).toISOString(),
    reautorizacaoPendente: false,
  };
  const config = cifrarConfig(configNova, keyring());

  let channelId: string;
  try {
    channelId = await noTenant(pedido.tenantId, async (tx) => {
      let id: string;
      if (existente) {
        await tx.execute(sql`
          update canal set ativo = true, config = ${JSON.stringify(config)}::jsonb, atualizado_em = now()
           where id = ${existente.id}::uuid
        `);
        id = existente.id;
      } else {
        const { rows } = await tx.execute<{ id: string }>(sql`
          insert into canal (tenant_id, tipo, nome, config, numero_id)
          values (${pedido.tenantId}::uuid, 'instagram', ${nome}, ${JSON.stringify(config)}::jsonb, ${igUserId})
          returning id
        `);
        id = rows[0]!.id;
        // Run serially, never with `Promise.all`; see `../whatsapp/criacao-de-canal.ts`.
        const { rows: queues } = await tx.execute<{ id: string }>(
          sql`select id from fila where ativa order by ordem, criado_em limit 1`,
        );
        await tx.execute(sql`
          insert into inbox (tenant_id, canal_id, nome, fila_padrao_id)
          values (${pedido.tenantId}::uuid, ${id}::uuid, ${nome}, ${queues[0]?.id ?? null})
        `);
      }
      await registrarAuditoria(tx, pedido.tenantId, {
        ator: { type: 'usuario', id: pedido.userId },
        acao: existente ? 'ativou' : 'criou',
        objetoTipo: 'canal',
        objetoId: id,
        depois: { id, nome, tipo: 'instagram', ig_user_id: igUserId, origem: 'manual' },
      });
      return id;
    });
  } catch (erro) {
    if (codigoDoPostgres(erro) === '23505') throw accountInUse();
    throw erro;
  }
  esquecerChannel(channelId);

  const webhook = { url: urlDoWebhookInstagram(channelId), verifyToken: configNova.verifyToken };
  let errorOfWebhook: string | null = null;
  try {
    await cliente.assinarWebhook(igUserId);
  } catch (erro) {
    errorOfWebhook = (erro as Error).message;
    console.error(`[instagram] a assinatura do webhook do canal ${channelId} falhou: ${errorOfWebhook}`);
  }
  return { channel: await lerVisivel(pedido.tenantId, channelId), webhookError: errorOfWebhook, webhook };
}

/**
 * Disable the channel without deleting conversations or messages, as for WhatsApp. Unsubscribing the webhook is best effort: an already revoked token must not prevent disablement.
 */
export async function desconectarInstagram(
  tenantId: string,
  userId: string,
  canalId: string,
): Promise<ChannelInstagramVisible> {
  const channel = await readChannelInstagram(tenantId, canalId);
  const token = texto(channel.config['tokenAcesso']);
  if (token && channel.igUserId) {
    try {
      await clienteGraphInstagram(token).desassinarWebhook(channel.igUserId);
    } catch (erro) {
      console.error(`[instagram] o webhook do canal ${channel.id} não foi desassinado: ${(erro as Error).message}`);
    }
  }

  const linha = await noTenant(tenantId, async (tx) => {
    const { rows } = await tx.execute<LineChannel>(sql`
      update canal set ativo = false, atualizado_em = now()
       where id = ${canalId}::uuid and tipo = 'instagram'
      returning id, tenant_id, nome as name, ativo as active, numero_id, criado_em as "createdAt", config
    `);
    const gravado = rows[0];
    if (!gravado) throw PipeError.naoEncontrado('Canal');
    await registrarAuditoria(tx, tenantId, {
      ator: { type: 'usuario', id: userId },
      acao: 'desativou',
      objetoTipo: 'canal',
      objetoId: canalId,
      depois: { id: canalId, ativo: false },
    });
    return gravado;
  });
  esquecerChannel(canalId);
  return visivel(linha);
}
