import { randomBytes } from 'node:crypto';
import { sql } from 'drizzle-orm';
import type { TransactionPipe } from '@pipe/db';
import { databaseOwner, noTenant } from '../database.js';
import { PipeError } from '../errors.js';
import { codigoDoPostgres } from './dominios.js';
import { confirmarUrlSegura } from './management/integrations.js';

/**
 * Rastreador de cliques (Growth › Click Tracker): um link curto por fluxo, e o
 * clique público que ele registra.
 *
 * A tela `growth/clicktracker` que já existe (`apps/management-vite/.../clicktracker.tsx`)
 * é a MEDIÇÃO da Blip de anúncios Click-to-WhatsApp da Meta (atribuição de conversas a
 * campanha de anúncio) — outra coisa, sem link nenhum para cadastrar
 * (`referencias-blip/pesquisa/blip-produtos-novos.md` linha 12). O que esta tarefa pede — cadastrar
 * um link, gerar encurtador, redirecionar em público e contar clique — é o recurso
 * descrito no pedido, não aquela tela; por isso o backend nasce aqui, sozinho, sem
 * mexer no componente visual existente (fora do escopo pedido: só o backend).
 *
 * Raw SQL, como `mensagem-ativa.ts`: as tabelas (`link_rastreado`, `clique_link`,
 * migration 0038) não entram no schema Drizzle para não competir com quem mexe em
 * `identidade`/`automacao` ao mesmo tempo.
 */

export interface LinkRastreado {
  id: string;
  flowId: string;
  name: string;
  destinationUrl: string;
  code: string;
  urlCurta: string;
  cliques: number;
  criadoEm: string;
}

export interface PedidoDeLink {
  name: string;
  destination: string;
}

export interface PeriodOfCount {
  since: Date | null;
  ate: Date | null;
}

export interface ContextOfClick {
  agentUser: string | null;
  origin: string | null;
  /** Chave do limitador de taxa — o IP visto pelo servidor. */
  ip: string;
}

function basePublica(): string {
  return (process.env['PIPE_API_URL_PUBLICA'] ?? 'https://api.pipe.app').replace(/\/$/, '');
}

/** `GET /l/:codigo` is deliberately short for ads and messages. */
export function urlCurtaDe(codigo: string): string {
  return `${basePublica()}/l/${codigo}`;
}

async function flowExists(tx: TransactionPipe, tenantId: string, fluxoId: string): Promise<void> {
  const { rows } = await tx.execute<{ id: string }>(sql`
    select id from fluxo where tenant_id = ${tenantId} and id = ${fluxoId}::uuid limit 1
  `);
  if (!rows[0]) throw PipeError.naoEncontrado('fluxo');
}

/**
 * Register a link and generate its short code. `confirmarUrlSegura` applies the same SSRF barrier as the Webhook screen (`dominio/gestao/integracoes.ts`): HTTPS only, no localhost or private IPs. The registrant may differ from the visitor, and the public redirect would otherwise expose unsafe destinations to anyone.
 */
export async function createLinkTracked(
  tx: TransactionPipe,
  tenantId: string,
  fluxoId: string,
  pedido: PedidoDeLink,
): Promise<LinkRastreado> {
  const nome = pedido.name.trim();
  if (!nome) throw PipeError.request('name_required', 'Dê um nome para o link.');
  confirmarUrlSegura(pedido.destination);
  await flowExists(tx, tenantId, fluxoId);

  // A collision among six base64url bytes is very unlikely; retrying covers it without a separate sequence.
  for (let tentativa = 0; tentativa < 5; tentativa++) {
    const codigo = randomBytes(6).toString('base64url');
    try {
      const { rows } = await tx.execute<{ id: string; createdAt: string }>(sql`
        insert into link_rastreado (tenant_id, fluxo_id, nome, destino_url, codigo)
        values (${tenantId}, ${fluxoId}::uuid, ${nome}, ${pedido.destination}, ${codigo})
        returning id, criado_em
      `);
      const linha = rows[0];
      if (!linha) throw new Error('não criou o link');
      return {
        id: linha.id,
        flowId: fluxoId,
        name: nome,
        destinationUrl: pedido.destination,
        code: codigo,
        urlCurta: urlCurtaDe(codigo),
        cliques: 0,
        criadoEm: new Date(linha.createdAt).toISOString(),
      };
    } catch (error) {
      if (codigoDoPostgres(error) === '23505') continue;
      throw error;
    }
  }
  throw new Error('não conseguiu gerar um código curto único');
}

/** Screen list with total clicks or clicks in the requested period. */
export async function listarLinksRastreados(
  tx: TransactionPipe,
  tenantId: string,
  flowId: string,
  period: PeriodOfCount = { since: null, ate: null },
): Promise<LinkRastreado[]> {
  await flowExists(tx, tenantId, flowId);
  const desde = period.since ?? new Date(0);
  const ate = period.ate ?? new Date('9999-12-31T23:59:59Z');

  const { rows } = await tx.execute<{
    id: string;
    name: string;
    destinationUrl: string;
    code: string;
    createdAt: string;
    cliques: string;
  }>(sql`
    select l.id, l.nome, l.destino_url, l.codigo, l.criado_em,
           count(c.id) filter (where c.criado_em >= ${desde} and c.criado_em <= ${ate})::text as cliques
      from link_rastreado l
      left join clique_link c on c.link_id = l.id
     where l.tenant_id = ${tenantId} and l.fluxo_id = ${flowId}::uuid
     group by l.id
     order by l.criado_em desc
  `);
  return rows.map((linha) => ({
    id: linha.id,
    flowId,
    name: linha.name,
    destinationUrl: linha.destinationUrl,
    code: linha.code,
    urlCurta: urlCurtaDe(linha.code),
    cliques: Number(linha.cliques),
    criadoEm: new Date(linha.createdAt).toISOString(),
  }));
}

const WINDOW_OF_RATE_MS = 60_000;
const LIMIT_BY_WINDOW = 30;
const countByKey = new Map<string, { start: number; n: number }>();

/**
 * Simple public-route rate limit of N clicks per IP per minute. ponytail: this fixed window is process-local and resets on deployment; if the `api` gains replicas, use a distributed limiter such as Redis.
 */
function respeitaLimiteDeTaxa(key: string): boolean {
  const agora = Date.now();
  const atual = countByKey.get(key);
  if (!atual || agora - atual.start > WINDOW_OF_RATE_MS) {
    countByKey.set(key, { start: agora, n: 1 });
    return true;
  }
  atual.n += 1;
  return atual.n <= LIMIT_BY_WINDOW;
}

/**
 * Public route: resolve the code, record the click, and return the 302 destination. `null` means not found; the controller returns the same 404 for missing codes and links from another tenant. This query intentionally has no tenant filter because no tenant is established yet, like `resolverCanal` in Meta webhooks. It reveals only existence, not another tenant's data.
 */
export async function redirecionarClique(
  codigo: string,
  context: ContextOfClick,
): Promise<string | null> {
  if (!respeitaLimiteDeTaxa(context.ip)) {
    throw new PipeError(429, 'limit_of_rate', 'Muitos cliques em pouco tempo. Tente de novo em instantes.');
  }

  const { rows } = await databaseOwner().execute<{
    id: string;
    tenant_id: string;
    destinationUrl: string;
  }>(sql`select id, tenant_id, destino_url from link_rastreado where codigo = ${codigo} limit 1`);
  const link = rows[0];
  if (!link) return null;

  await noTenant(link.tenant_id, (tx) =>
    tx.execute(sql`
      insert into clique_link (tenant_id, link_id, agente_usuario, origem)
      values (${link.tenant_id}, ${link.id}::uuid, ${context.agentUser}, ${context.origin})
    `),
  );

  return link.destinationUrl;
}
