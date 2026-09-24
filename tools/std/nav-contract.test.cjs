const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const std = '.planning/phases/01-padronizar-linguagem-t-cnica-navega-o-e-renderiza-o/std';
const contract = fs.readFileSync(`${std}/nav-contract.md`, 'utf8');
const rows = JSON.parse(fs.readFileSync(`${std}/out/codex2-nav.json`, 'utf8')).screens;

test('T-01-07-01: último filtro é isolado por tenant e usuário e IDs obsoletos são rejeitados', () => {
  const key = (tenant, user) => `pipe:gestao-vite:monitoramento:filters:v1:${tenant}:${user}`;
  assert.notEqual(key('tenant-a', 'user-a'), key('tenant-b', 'user-a'));
  assert.notEqual(key('tenant-a', 'user-a'), key('tenant-a', 'user-b'));
  assert.match(contract, /pipe:<app>:<screen>:filters:v1:<tenantId>:<userId>/);
  assert.match(contract, /IDs de fila\/atendente\/contato ainda pertencem ao tenant/);
  const stored = rows.filter((row) => row.proposed === 'storage' && row.state_item === 'last filter');
  assert.equal(stored.length, 13);
  for (const row of stored) assert.match(row.notes, /filters:v1:<tenantId>:<userId>/);
});

test('T-01-07-02: destinoAbsoluto mantém destinos fora do host bloqueados', () => {
  const source = fs.readFileSync('apps/api/src/controladores/entrar.ts', 'utf8');
  const body = source.match(/export function destinoAbsoluto\(destino: string, origem\?: string\): string \{([\s\S]*?)\n\}/)?.[1];
  assert.ok(body, 'função real encontrada');
  const run = new Function('destino', 'origem', 'baseDoApp', body);
  const base = () => 'https://pipe.example';
  assert.equal(run('/contatos/123', undefined, base), 'https://pipe.example/contatos/123');
  for (const input of ['https://evil.example', '//evil.example', '\\\\evil.example', '/\\evil.example']) {
    const output = run(input, undefined, base);
    assert.equal(new URL(output).origin, 'https://pipe.example', input);
  }
  for (const app of ['desk-vite', 'gestao-vite', 'crm']) {
    const file = app === 'crm' ? 'apps/crm/src/lib/sessao.ts' : `apps/${app}/src/lib/entrada.ts`;
    const code = fs.readFileSync(file, 'utf8');
    const guard = code.match(/export function caminhoInterno\(destino: string \| undefined \| null\): string \{([\s\S]*?)\n\}/)?.[1];
    assert.ok(guard, file);
    const front = new Function('destino', 'DESTINO_PADRAO', guard);
    assert.equal(front('https://evil.example', '/'), '/');
    assert.equal(front('//evil.example', '/'), '/');
    assert.equal(front('/contatos/123', '/'), '/contatos/123');
  }
  assert.match(contract, /`destinoAbsoluto`/);
});

test('T-01-07-03: citação Blip próxima, mas errada, não comprova ticketId', (t) => {
  const base = process.env.BLIP_REFERENCE_ROOT;
  if (!base) return t.skip('defina BLIP_REFERENCE_ROOT para verificar as capturas externas');
  const file = 'atendimento/attendance-history-40967cbb-061c-40ba-877e/supernova.blip.ai/portal.js';
  const lines = fs.readFileSync(path.join(base, file), 'utf8').split(/\r?\n/);
  const supports = (number) => /url: "\/:id\?ticketId"/.test(lines[number - 1] ?? '');
  assert.equal(supports(247682), false, 'linha vizinha não sustenta a afirmação');
  assert.equal(supports(247686), true, 'linha citada contém a rota');
  const row = rows.find((item) => item.app === 'gestao-vite' && item.state_item === '?ticketId=');
  assert.ok(row);
  assert.match(row.blip_evidence, /portal\.js:247685-247686/);
  for (const item of rows) {
    if (item.blip_evidence === 'NEEDS VALIDATION') continue;
    const [reference, ...positions] = item.blip_evidence.split(',');
    const [filePart, first] = reference.split(':');
    assert.ok(fs.existsSync(path.join(base, filePart.replace(/^referencias-blip\//, ''))), reference);
    const count = fs.readFileSync(path.join(base, filePart.replace(/^referencias-blip\//, '')), 'utf8').split(/\r?\n/).length;
    for (const position of [first, ...positions]) {
      const last = Number(position.split('-').at(-1));
      assert.ok(last > 0 && last <= count, `${reference},${position}`);
    }
  }
});

test('tabela cobre todos os itens reais e mantém status explícito', () => {
  const section = contract.split('## Per-screen table\n')[1]?.split('## Compatibility strategy')[0];
  assert.ok(section);
  const table = section.split('\n').filter((line) => line.startsWith('| '));
  assert.equal(table.length - 1, rows.length);
  for (const line of table.slice(1)) assert.match(line, /\| (DECIDED|OWNER DECIDES AT GATE 2|NEEDS VALIDATION) \|$/);
});
