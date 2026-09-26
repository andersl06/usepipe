import { randomBytes } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { cifrarConfig, decifrarConfig } from '@pipe/db';
import { databaseOwner, keyring, forgetChannel, noTenant } from '../../database.js';
import { PipeError } from '../../errors.js';

/**
 * Ported from chatwoot/chatwoot (MIT), app/models/channel/whatsapp.rb: `ensure_webhook_verify_token`, `prompt_reauthorization!`, `reauthorized!`, and global phone uniqueness (`validates :phone_number, uniqueness: true`). `setup_webhooks` lives in `configuracao-de-webhook.ts` beside its caller. Unlike Chatwoot's single `provider_config` column, Pipe encrypts `canal.config` secret fields (`packages/db/src/segredo.ts`) and stores WABA and phone in columns for umbrella webhook routing (`docs/specs/2026-09-07-webhook-por-cliente.md` §4).
 */

export interface ChannelWhatsApp {
  id: string;
  tenantId: string;
  name: string;
  active: boolean;
  wabaId: string | null;
  numberId: string | null;
  /** Decrypted in memory only; never write this form back to the database. */
  config: Record<string, unknown>;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Meta webhook URL is not secret; the signature protects it. Unlike Chatwoot's `/webhooks/whatsapp/+5511…`, use `canalId` as specified for per-customer webhooks.
 */
export function urlDoWebhook(channelId: string): string {
  const base = (process.env['PIPE_URL_API'] ?? 'http://localhost:3100').replace(/\/$/, '');
  return `${base}/webhooks/whatsapp/${channelId}`;
}

export function texto(value: unknown): string | null {
  return typeof value === 'string' && value !== '' ? value : null;
}

type LineChannel = {
  [column: string]: unknown;
  id: string;
  tenant_id: string;
  nome: string;
  ativo: boolean;
  waba_id: string | null;
  numero_id: string | null;
  config: Record<string, unknown> | null;
};

/** Return this tenant's channel with decrypted `config`; another tenant's channel is 404, not 403. */
export async function readChannelWhatsApp(tenantId: string, canalId: string): Promise<ChannelWhatsApp> {
  if (!UUID.test(canalId)) throw PipeError.naoEncontrado('Canal');
  const linha = await noTenant(tenantId, async (tx) => {
    const { rows } = await tx.execute<LineChannel>(sql`
      select id, tenant_id, nome, ativo, waba_id, numero_id, config
        from canal
       where id = ${canalId}::uuid and tipo = 'whatsapp_cloud'
       limit 1
    `);
    return rows[0] ?? null;
  });
  if (!linha) throw PipeError.naoEncontrado('Canal');
  return {
    id: linha.id,
    tenantId: linha.tenant_id,
    name: linha.nome,
    active: linha.ativo,
    wabaId: linha.waba_id,
    numberId: linha.numero_id,
    config: decifrarConfig(linha.config ?? {}, keyring()),
  };
}

/**
 * Merge and save `channel.provider_config` as in Chatwoot. Reencrypt all of `config` on write; `cifrarConfig` touches only secret fields and is idempotent. This mirrors `channel.provider_config = …merge(…)` followed by `save!`.
 */
export async function updateChannel(
  canal: ChannelWhatsApp,
  changes: Record<string, unknown>,
  colunas: { wabaId?: string; numberId?: string } = {},
): Promise<ChannelWhatsApp> {
  const config = { ...canal.config, ...changes };
  const cifrado = cifrarConfig(config, keyring());
  await noTenant(canal.tenantId, async (tx) => {
    await tx.execute(sql`
      update canal
         set config = ${JSON.stringify(cifrado)}::jsonb,
             waba_id = coalesce(${colunas.wabaId ?? null}, waba_id),
             numero_id = coalesce(${colunas.numberId ?? null}, numero_id),
             atualizado_em = now()
       where id = ${canal.id}::uuid
    `);
  });
  forgetChannel(canal.id);
  return {
    ...canal,
    config,
    wabaId: colunas.wabaId ?? canal.wabaId,
    numberId: colunas.numberId ?? canal.numberId,
  };
}

/** `ensure_webhook_verify_token`: `SecureRandom.hex(16)`. Um por canal, como a spec pede. */
export function novoVerifyToken(): string {
  return randomBytes(16).toString('hex');
}

/**
 * Chatwoot `prompt_reauthorization!` is a channel column; here it is a marker in `config`, where connection state already lives, avoiding a migration.
 */
export function requestReauthorization(channel: ChannelWhatsApp): Promise<ChannelWhatsApp> {
  return updateChannel(channel, { reautorizacaoPendente: true });
}

/** `reauthorized!`. */
export function marcarReautorizado(canal: ChannelWhatsApp): Promise<ChannelWhatsApp> {
  return updateChannel(canal, { reautorizacaoPendente: false });
}

export function reauthorizationPending(canal: { config: Record<string, unknown> }): boolean {
  return canal.config['reautorizacaoPendente'] === true;
}

/**
 * Chatwoot `Channel::Whatsapp.find_by(phone_number:)` requires global uniqueness across tenants. Use the owner role because RLS would hide the other tenant's channel; return only yes/no. Check both indexed `phone_number_id` and the number itself, as in Chatwoot.
 */
export async function numeroJaConectado(numeroId: string, numero: string | null): Promise<boolean> {
  const { rows } = await databaseOwner().execute<{ tem: boolean }>(sql`
    select exists (
      select 1 from canal
       where tipo = 'whatsapp_cloud'
         and (numero_id = ${numeroId}
              or (${numero}::text is not null and config->>'numero' = ${numero}::text))
    ) as tem
  `);
  return rows[0]?.tem === true;
}
