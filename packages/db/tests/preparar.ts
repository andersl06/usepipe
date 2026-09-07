import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import pg from 'pg';
import { URL_DONO } from './ajuda.js';

const executar = promisify(execFile);
const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

async function respondeu(url: string): Promise<boolean> {
  const cliente = new pg.Client({ connectionString: url, connectionTimeoutMillis: 2_000 });
  try {
    await cliente.connect();
    await cliente.query('select 1');
    return true;
  } catch {
    return false;
  } finally {
    await cliente.end().catch(() => undefined);
  }
}

/**
 * O teste de RLS só prova alguma coisa contra um Postgres de verdade. Se o do
 * `docker-compose.yml` não estiver de pé, esta rotina sobe ele e espera ficar saudável.
 */
export async function setup(): Promise<void> {
  /*
   * Chave de cifra para o ambiente de teste.
   *
   * A cifra de segredo de canal falha alto quando não há chaveiro, e é isso que
   * queremos em produção: melhor a API não subir do que subir gravando token da
   * Meta em texto claro achando que não. Em teste, a chave é fixa e pública de
   * propósito — ela não protege nada aqui, só faz o caminho existir.
   */
  process.env['PIPE_CHAVES_SEGREDO'] ??= `teste:${Buffer.alloc(32, 7).toString('base64')}`;
  process.env['PIPE_CHAVE_SEGREDO_ATUAL'] ??= 'teste';

  if (await respondeu(URL_DONO)) return;

  await executar('docker', ['compose', 'up', '-d', '--wait', 'postgres', 'redis'], { cwd: RAIZ });

  for (let tentativa = 0; tentativa < 30; tentativa += 1) {
    if (await respondeu(URL_DONO)) return;
    await new Promise((resolver) => setTimeout(resolver, 1_000));
  }
  throw new Error(
    `Postgres não respondeu em ${URL_DONO}. Suba com "pnpm banco:subir" e rode de novo.`,
  );
}
