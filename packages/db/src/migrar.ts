import 'dotenv/config';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { criarBanco, fecharBanco } from './cliente.js';
import { garantirParticoes } from './particoes.js';

const AQUI = path.dirname(fileURLToPath(import.meta.url));

/** A pasta `drizzle` fica na raiz do pacote, tanto rodando de `src` quanto de `dist`. */
export const PASTA_MIGRATIONS = path.resolve(AQUI, '..', 'drizzle');

export async function migrar(url?: string): Promise<void> {
  const db = criarBanco({ url: url ?? process.env['DATABASE_URL'], maxConexoes: 1 });
  try {
    await migrate(db, { migrationsFolder: PASTA_MIGRATIONS });
    await garantirParticoes(db);
  } finally {
    await fecharBanco(db);
  }
}

const executadoDiretamente = process.argv[1]
  ? path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))
  : false;

if (executadoDiretamente) {
  migrar()
    .then(() => {
      process.stdout.write('migrations aplicadas e partições garantidas\n');
    })
    .catch((erro: unknown) => {
      process.stderr.write(`falha ao migrar: ${String(erro)}\n`);
      process.exitCode = 1;
    });
}
