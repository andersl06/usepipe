/* Recalcula imports relativos (componentes/lib/contexto), troca next/link e
   usePathname, e aponta lib/analise(-portal) para @pipe/core/analise. */
const fs = require('fs');
const path = require('path');
process.chdir(__dirname + '/src');
const raiz = process.argv[2] || 'paginas';
function walk(d) {
  return fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
}
let n = 0;
for (const f of walk(raiz)) {
  if (!/\.tsx?$/.test(f)) continue;
  let s = fs.readFileSync(f, 'utf8');
  const o = s;
  const dir = path.dirname(f);
  const rel = (alvo) => {
    const r = path.relative(dir, alvo).split(path.sep).join('/');
    return r.startsWith('.') ? r : './' + r;
  };
  s = s.replace(/import Link from 'next\/link';/g, `import Link from '${rel('componentes/link')}';`);
  s = s.replace(/import \{ usePathname \} from 'next\/navigation';/g, "import { useLocation } from 'react-router-dom';");
  s = s.replace(/const (\w+) = usePathname\(\);/g, 'const $1 = useLocation().pathname;');
  s = s.replace(/^'use client';\r?\n\r?\n?/m, '');
  s = s.replace(/from '(?:\.\.\/)+lib\/analise(-portal)?'/g, "from '@pipe/core/analise'");
  s = s.replace(/from '((?:\.\.\/)+)(componentes|lib|contexto)\/([\w-]+)'/g, (m, p, alvo, nome) => `from '${rel(alvo + '/' + nome)}'`);
  if (s !== o) {
    fs.writeFileSync(f, s);
    n++;
  }
}
console.log('ajustados', n);
