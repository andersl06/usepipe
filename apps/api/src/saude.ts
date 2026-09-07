import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { sql } from 'drizzle-orm';
import { PASTA_MIGRATIONS } from '@pipe/db';
import { bancoApp, bancoDono } from './banco.js';
import { pingRedis } from './filas.js';

/**
 * `GET /saude` e as sondas que ele usa.
 *
 * A regra que manda aqui: **healthcheck que pendura é pior que healthcheck que
 * falha.** Um `select 1` que nunca volta faz o orquestrador ficar esperando em vez
 * de tirar o contêiner de rotação — e o cliente continua batendo num processo que
 * não atende. Por isso toda sonda tem tempo-limite curto e um veredito, sempre.
 */

export const TEMPO_LIMITE_MS = Number(process.env['PIPE_SAUDE_TIMEOUT_MS'] ?? 2_000);

/** A imagem carimba `PIPE_VERSAO` no build; fora dela, vale a versão do pacote. */
export const VERSAO = process.env['PIPE_VERSAO'] ?? '0.1.0';

export type Veredito = 'ok' | 'falha';

export interface Saude {
  ok: boolean;
  versao: string;
  banco: Veredito;
  redis: Veredito;
}

/**
 * Corre a sonda contra o relógio.
 *
 * O `catch` no perdedor não é enfeite: sem ele, a promessa que chega depois do
 * tempo-limite rejeita sozinha e derruba o processo por `unhandledRejection` —
 * o healthcheck matando o serviço que ele deveria vigiar.
 */
async function sondar(trabalho: () => Promise<unknown>): Promise<Veredito> {
  let despertador: NodeJS.Timeout | undefined;
  const emCurso = trabalho();
  emCurso.catch(() => undefined);
  try {
    await Promise.race([
      emCurso,
      new Promise((_, recusar) => {
        despertador = setTimeout(() => recusar(new Error('tempo-limite')), TEMPO_LIMITE_MS);
      }),
    ]);
    return 'ok';
  } catch {
    return 'falha';
  } finally {
    if (despertador) clearTimeout(despertador);
  }
}

export async function verificarSaude(): Promise<Saude> {
  // O pool sondado é o `app`: é por ele que passa todo o tráfego de negócio. O pool
  // dono atende duas resoluções e não representa a saúde de quem serve o cliente.
  const [banco, redis] = await Promise.all([
    sondar(() => bancoApp().execute(sql`select 1`)),
    sondar(() => pingRedis()),
  ]);

  // `ok` segue o banco, e só ele. Sem Redis a API ainda recebe webhook e responde
  // leitura; sem banco ela não faz nada — e é essa a diferença entre 503 e 200.
  return { ok: banco === 'ok', versao: VERSAO, banco, redis };
}

/**
 * Quantas migrations existem no repositório e ainda não foram aplicadas.
 *
 * Devolve `null` quando não dá para saber — imagem sem a pasta `drizzle`, banco
 * fora, tabela de controle ainda não criada. `null` some da coleta em vez de virar
 * um zero mentiroso, que é o que faria o alerta `MigrationPendente` calar para sempre.
 */
export async function migrationsPendentes(): Promise<number | null> {
  try {
    const cru = await readFile(path.join(PASTA_MIGRATIONS, 'meta', '_journal.json'), 'utf8');
    const diario = JSON.parse(cru) as { entries?: unknown[] };
    const noRepositorio = diario.entries?.length ?? 0;

    const { rows } = await bancoDono().execute<{ total: string }>(
      sql`select count(*)::text as total from drizzle.__drizzle_migrations`,
    );
    const aplicadas = Number(rows[0]?.total ?? 0);
    return Math.max(0, noRepositorio - aplicadas);
  } catch {
    return null;
  }
}
