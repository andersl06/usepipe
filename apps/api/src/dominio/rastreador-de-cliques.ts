import { randomBytes } from 'node:crypto';
import { sql } from 'drizzle-orm';
import type { TransactionPipe } from '@pipe/db';
import { databaseOwner, noTenant } from '../banco.js';
import { PipeError } from '../erros.js';
import { codigoDoPostgres } from './dominios.js';
import { confirmarUrlSegura } from './gestao/integracoes.js';

/**
 * Rastreador de cliques (Growth › Click Tracker): um link curto por fluxo, e o
 * clique público que ele registra.
 *
 * A tela `growth/clicktracker` que já existe (`apps/gestao-vite/.../clicktracker.tsx`)
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

export interface ContextOfClique {
  agenteUser: string | null;
  origin: string | null;
  /** Chave do limitador de taxa — o IP visto pelo servidor. */
  ip: string;
}

function basePublica(): string {
  return (process.env['PIPE_API_URL_PUBLICA'] ?? 'https://api.pipe.app').replace(/\/$/, '');
}

/** `GET /l/:codigo` — curto de propósito; é o que vai no anúncio/mensagem. */
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
 * Cadastra o link e gera o código curto.
 *
 * `confirmarUrlSegura` é a mesma barreira de SSRF da tela de Webhook
 * (`dominio/gestao/integracoes.ts`): HTTPS, sem localhost, sem IP de rede privada.
 * Faz sentido aqui pela MESMA razão de lá — quem cadastra o destino não é
 * necessariamente quem vai clicar, e a rota pública de redirecionamento
 * devolveria esse destino para qualquer um.
 */
export async function createLinkTracked(
  tx: TransactionPipe,
  tenantId: string,
  fluxoId: string,
  pedido: PedidoDeLink,
): Promise<LinkRastreado> {
  const nome = pedido.nome.trim();
  if (!nome) throw PipeError.request('name_required', 'Dê um nome para o link.');
  confirmarUrlSegura(pedido.destination);
  await flowExists(tx, tenantId, fluxoId);

  // Colisão de 6 bytes em base64url é praticamente nula; a tentativa de novo cobre
  // o caso raro sem precisar de sequência à parte.
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
        flowId,
        nome,
        destinationUrl: pedido.destination,
        codigo,
        urlCurta: urlCurtaDe(codigo),
        cliques: 0,
        criadoEm: new Date(linha.criado_em).toISOString(),
      };
    } catch (error) {
      if (codigoDoPostgres(error) === '23505') continue;
      throw error;
    }
  }
  throw new Error('não conseguiu gerar um código curto único');
}

/** A lista da tela, com a contagem de cliques — total, ou só do período pedido. */
export async function listarLinksRastreados(
  tx: TransactionPipe,
  tenantId: string,
  flowId: string,
  period: PeriodOfCount = { desde: null, ate: null },
): Promise<LinkRastreado[]> {
  await flowExists(tx, tenantId, flowId);
  const desde = period.desde ?? new Date(0);
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
    nome: linha.nome,
    destinoUrl: linha.destino_url,
    codigo: linha.codigo,
    urlCurta: urlCurtaDe(linha.codigo),
    cliques: Number(linha.cliques),
    criadoEm: new Date(linha.criado_em).toISOString(),
  }));
}

const WINDOW_OF_RATE_MS = 60_000;
const LIMIT_BY_WINDOW = 30;
const countByKey = new Map<string, { start: number; n: number }>();

/**
 * Limitador de taxa simples: N cliques por IP por minuto na rota pública.
 *
 * ponytail: janela fixa em memória de processo — reseta em cada deploy e não
 * divide entre réplicas. Um limitador distribuído (Redis) é o upgrade natural
 * se o Pipe rodar mais de uma instância da `api`; ninguém pediu isso ainda.
 */
function respeitaLimiteDeTaxa(key: string): boolean {
  const agora = Date.now();
  const atual = countByKey.get(key);
  if (!atual || agora - atual.inicio > WINDOW_OF_RATE_MS) {
    countByKey.set(key, { inicio: agora, n: 1 });
    return true;
  }
  atual.n += 1;
  return atual.n <= LIMIT_BY_WINDOW;
}

/**
 * A rota pública: resolve o código, registra o clique e devolve o destino para o
 * 302. `null` é "não achei" — o controlador transforma em 404 igual para código
 * inexistente e para link de outro tenant (a consulta abaixo não filtra tenant
 * de propósito: ainda não HÁ tenant em vigor, o mesmo problema de `resolverCanal`
 * no webhook da Meta) — não é o dado de outro tenant que vaza, é só "existe ou não".
 */
export async function redirecionarClique(
  codigo: string,
  context: ContextOfClique,
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
      values (${link.tenant_id}, ${link.id}::uuid, ${context.agenteUser}, ${context.origem})
    `),
  );

  return link.destino_url;
}
