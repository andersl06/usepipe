import fs from 'node:fs';
import path from 'node:path';
import { readMap } from '../../../../../../tools/std/lib/map.ts';
import { isPtToken, splitIdentifier } from '../../../../../../tools/std/pt-detect.ts';

const std = path.resolve(import.meta.dirname, '../..');
const backend = new Set(['packages-db', 'packages-contracts', 'packages-autenticacao', 'packages-armazenamento', 'packages-tempo-real', 'packages-mcp', 'workers', 'api', 'infra']);
const count = new Map();
for (const row of readMap(path.join(std, 'map'))) {
  const group = backend.has(row.scope) ? 'backend' : 'front';
  for (const token of splitIdentifier(row.old)) {
    if (!isPtToken(token)) continue;
    const key = `${group}\0${token}`;
    count.set(key, (count.get(key) ?? 0) + 1);
  }
}
const lines = ['group,token,occurrences', ...[...count].sort((a, b) => a[0].localeCompare(b[0])).map(([key, n]) => `${key.replace('\0', ',')},${n}`)];
fs.mkdirSync(path.join(std, 'out'), { recursive: true });
fs.writeFileSync(path.join(std, 'out', 'glossary-token-frequency.csv'), `${lines.join('\n')}\n`);
console.log(`rows=${lines.length - 1}`);
