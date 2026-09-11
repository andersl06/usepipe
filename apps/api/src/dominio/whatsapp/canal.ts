import { randomBytes } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { cifrarConfig, decifrarConfig } from '@pipe/db';
import { bancoDono, chaveiro, esquecerCanal, noTenant } from '../../banco.js';
import { ErroPipe } from '../../erros.js';

/**
 * Portado de chatwoot/chatwoot (MIT), app/models/channel/whatsapp.rb — as partes
 * que os serviços de conexão usam: `ensure_webhook_verify_token`,
 * `prompt_reauthorization!`, `reauthorized!` e a unicidade do número
 * (`validates :phone_number, uniqueness: true`). O `setup_webhooks` mora em
 * `configuracao-de-webhook.ts`, junto do serviço que ele chama.
 *
 * Diferença de modelo que atravessa o porte inteiro: no Chatwoot o canal guarda
 * `provider_config` numa coluna só; aqui o `canal.config` é cifrado campo a campo
 * (`packages/db/src/segredo.ts`), e o WABA e o número moram em COLUNA porque são
 * a chave de roteamento da rota guarda-chuva
 * (`docs/specs/2026-09-07-webhook-por-cliente.md` §4).
 */

export interface CanalWhatsApp {
  id: string;
  tenantId: string;
  nome: string;
  ativo: boolean;
  wabaId: string | null;
  numeroId: string | null;
  /** Decifrado. Existe só em memória, nunca volta assim para o banco. */
  config: Record<string, unknown>;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * A URL que vai para a Meta. Não é segredo — quem protege é a assinatura.
 *
 * Diferença do original: lá a URL leva o número (`/webhooks/whatsapp/+5511…`);
 * aqui leva o `canalId`, que é o que a spec do webhook por cliente decidiu.
 */
export function urlDoWebhook(canalId: string): string {
  const base = (process.env['PIPE_URL_API'] ?? 'http://localhost:3100').replace(/\/$/, '');
  return `${base}/webhooks/whatsapp/${canalId}`;
}

export function texto(valor: unknown): string | null {
  return typeof valor === 'string' && valor !== '' ? valor : null;
}

type LinhaCanal = {
  [coluna: string]: unknown;
  id: string;
  tenant_id: string;
  nome: string;
  ativo: boolean;
  waba_id: string | null;
  numero_id: string | null;
  config: Record<string, unknown> | null;
};

/** O canal do tenant, com o `config` decifrado. Canal de outro tenant é 404, não 403. */
export async function lerCanalWhatsApp(tenantId: string, canalId: string): Promise<CanalWhatsApp> {
  if (!UUID.test(canalId)) throw ErroPipe.naoEncontrado('Canal');
  const linha = await noTenant(tenantId, async (tx) => {
    const { rows } = await tx.execute<LinhaCanal>(sql`
      select id, tenant_id, nome, ativo, waba_id, numero_id, config
        from canal
       where id = ${canalId}::uuid and tipo = 'whatsapp_cloud'
       limit 1
    `);
    return rows[0] ?? null;
  });
  if (!linha) throw ErroPipe.naoEncontrado('Canal');
  return {
    id: linha.id,
    tenantId: linha.tenant_id,
    nome: linha.nome,
    ativo: linha.ativo,
    wabaId: linha.waba_id,
    numeroId: linha.numero_id,
    config: decifrarConfig(linha.config ?? {}, chaveiro()),
  };
}

/**
 * `channel.provider_config = …merge(…)` + `save!`. O `config` inteiro é cifrado de
 * novo na gravação: `cifrarConfig` só toca os campos secretos e é idempotente.
 */
export async function atualizarCanal(
  canal: CanalWhatsApp,
  alteracoes: Record<string, unknown>,
  colunas: { wabaId?: string; numeroId?: string } = {},
): Promise<CanalWhatsApp> {
  const config = { ...canal.config, ...alteracoes };
  const cifrado = cifrarConfig(config, chaveiro());
  await noTenant(canal.tenantId, async (tx) => {
    await tx.execute(sql`
      update canal
         set config = ${JSON.stringify(cifrado)}::jsonb,
             waba_id = coalesce(${colunas.wabaId ?? null}, waba_id),
             numero_id = coalesce(${colunas.numeroId ?? null}, numero_id),
             atualizado_em = now()
       where id = ${canal.id}::uuid
    `);
  });
  esquecerCanal(canal.id);
  return {
    ...canal,
    config,
    wabaId: colunas.wabaId ?? canal.wabaId,
    numeroId: colunas.numeroId ?? canal.numeroId,
  };
}

/** `ensure_webhook_verify_token`: `SecureRandom.hex(16)`. Um por canal, como a spec pede. */
export function novoVerifyToken(): string {
  return randomBytes(16).toString('hex');
}

/**
 * `prompt_reauthorization!`. No Chatwoot é coluna do canal; aqui é uma marca no
 * `config`, que já é o lugar do estado da conexão e não pede migration.
 */
export function pedirReautorizacao(canal: CanalWhatsApp): Promise<CanalWhatsApp> {
  return atualizarCanal(canal, { reautorizacaoPendente: true });
}

/** `reauthorized!`. */
export function marcarReautorizado(canal: CanalWhatsApp): Promise<CanalWhatsApp> {
  return atualizarCanal(canal, { reautorizacaoPendente: false });
}

export function reautorizacaoPendente(canal: { config: Record<string, unknown> }): boolean {
  return canal.config['reautorizacaoPendente'] === true;
}

/**
 * `Channel::Whatsapp.find_by(phone_number:)`: a unicidade é GLOBAL, entre todos
 * os clientes. Roda com o papel dono porque a RLS esconderia justamente o canal
 * do outro tenant que precisa barrar — e devolve só sim ou não, nada da linha.
 *
 * Confere o `phone_number_id` (coluna com índice único) e o número em si, que é o
 * que o original compara.
 */
export async function numeroJaConectado(numeroId: string, numero: string | null): Promise<boolean> {
  const { rows } = await bancoDono().execute<{ tem: boolean }>(sql`
    select exists (
      select 1 from canal
       where tipo = 'whatsapp_cloud'
         and (numero_id = ${numeroId}
              or (${numero}::text is not null and config->>'numero' = ${numero}::text))
    ) as tem
  `);
  return rows[0]?.tem === true;
}
