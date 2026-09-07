import { sql } from 'drizzle-orm';
import { criarBanco, comTenant, chaveiroDoAmbiente, decifrarConfig } from '@pipe/db';
import type { BancoPipe, Chaveiro, TransacaoPipe } from '@pipe/db';

/**
 * Dois pools, dois papéis — a mesma divisão do Desk e dos workers.
 *
 * Tudo que é dado de negócio passa por `noTenant`, com `pipe.tenant_id` fixado e a
 * RLS valendo. O papel dono existe para duas resoluções que acontecem **antes** de
 * haver tenant em vigor e por isso não têm como passar pela política:
 *
 * - achar o tenant do canal a partir do `:canalId` da URL do webhook da Meta;
 * - achar a chave de API pelo prefixo, para descobrir de quem é o `Bearer`.
 *
 * As duas devolvem só o `tenant_id` e o mínimo para autorizar. Nenhuma outra
 * consulta roda com o papel dono; a lacuna está registrada na migration `0001_rls`.
 */

const URL_APP =
  process.env['DATABASE_URL_APP'] ?? 'postgres://pipe_app:pipe_app@localhost:5433/pipe';
const URL_DONO = process.env['DATABASE_URL'] ?? 'postgres://pipe:pipe@localhost:5433/pipe';

let app: BancoPipe | null = null;
let dono: BancoPipe | null = null;

export function bancoApp(): BancoPipe {
  app ??= criarBanco({ url: URL_APP, maxConexoes: 10 });
  return app;
}

export function bancoDono(): BancoPipe {
  dono ??= criarBanco({ url: URL_DONO, maxConexoes: 2 });
  return dono;
}

/**
 * Roda o trabalho com `pipe.tenant_id` fixado.
 *
 * Dentro do callback as consultas vão **em série**. `Promise.all` aqui derruba o
 * `set_config` da transação e a consulta passa a rodar sem tenant — ver o README.
 */
export function noTenant<T>(tenantId: string, fn: (tx: TransacaoPipe) => Promise<T>): Promise<T> {
  return comTenant(bancoApp(), tenantId, fn);
}

export interface CanalResolvido {
  id: string;
  tenantId: string;
  tipo: string;
  ativo: boolean;
  config: Record<string, unknown>;
}

const cacheDeCanal = new Map<string, CanalResolvido>();

/**
 * O chaveiro é lido do ambiente uma vez e guardado. Ler a cada evento da Meta
 * seria trabalho repetido, e uma chave que muda em tempo de execução é reinício
 * de processo, não recarga.
 */
let chaveiroGuardado: Chaveiro | null = null;

function chaveiro(): Chaveiro {
  chaveiroGuardado ??= chaveiroDoAmbiente();
  return chaveiroGuardado;
}

/**
 * Resolve o canal do webhook. Guardado em memória porque é lido a cada evento da
 * Meta e muda quase nunca; `esquecerCanal` invalida quando a configuração mudar.
 */
export async function resolverCanal(canalId: string): Promise<CanalResolvido | null> {
  const guardado = cacheDeCanal.get(canalId);
  if (guardado) return guardado;

  const { rows } = await bancoDono().execute<{
    id: string;
    tenant_id: string;
    tipo: string;
    ativo: boolean;
    config: Record<string, unknown> | null;
  }>(sql`select id, tenant_id, tipo, ativo, config from canal where id = ${canalId} limit 1`);

  const linha = rows[0];
  if (!linha) return null;
  const canal: CanalResolvido = {
    id: linha.id,
    tenantId: linha.tenant_id,
    tipo: linha.tipo,
    ativo: linha.ativo,
    // Decifrado UMA vez, aqui, e o resto do código continua lendo
    // `config.tokenAcesso` como sempre leu. O segredo vive cifrado no banco e em
    // texto só na memória de quem precisa dele — ver `packages/db/src/segredo.ts`.
    config: decifrarConfig(linha.config ?? {}, chaveiro()),
  };
  cacheDeCanal.set(canalId, canal);
  return canal;
}

/**
 * Resolve o canal a partir do PAYLOAD, para a rota guarda-chuva.
 *
 * Os eventos de template e de conta da Meta não aceitam URL por cliente e chegam
 * todos no mesmo endereço. Aqui o tenant não pode vir do caminho, então vem do
 * `phone_number_id` ou, na falta dele, do WABA — nessa ordem, porque o número é
 * único e o WABA pode ter vários.
 *
 * Devolve `null` quando não casa, e quem chama DESCARTA. Evento sem dono é de
 * outro aplicativo ou de canal removido; processar no melhor palpite é como se
 * entrega o dado de um cliente a outro.
 */
export async function resolverCanalPorIdentificador(
  numeroId: string | undefined,
  wabaId: string | undefined,
): Promise<CanalResolvido | null> {
  if (!numeroId && !wabaId) return null;

  const { rows } = await bancoDono().execute<{
    id: string;
    tenant_id: string;
    tipo: string;
    ativo: boolean;
    config: Record<string, unknown> | null;
  }>(sql`
    select id, tenant_id, tipo, ativo, config
      from canal
     where ${numeroId ? sql`numero_id = ${numeroId}` : sql`false`}
        or ${wabaId ? sql`waba_id = ${wabaId}` : sql`false`}
     -- O número ganha do WABA: ele identifica um canal, o WABA identifica vários.
     order by (numero_id is not null and numero_id = ${numeroId ?? null}) desc
     limit 1
  `);

  const linha = rows[0];
  if (!linha) return null;
  return {
    id: linha.id,
    tenantId: linha.tenant_id,
    tipo: linha.tipo,
    ativo: linha.ativo,
    config: decifrarConfig(linha.config ?? {}, chaveiro()),
  };
}

export function esquecerCanal(canalId?: string): void {
  if (canalId) cacheDeCanal.delete(canalId);
  else cacheDeCanal.clear();
}

export async function fecharBancos(): Promise<void> {
  if (app) await app.$client.end();
  if (dono) await dono.$client.end();
  app = null;
  dono = null;
  esquecerCanal();
}
