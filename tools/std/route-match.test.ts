import assert from 'node:assert/strict';
import test from 'node:test';
import ts from 'typescript';
import {
  collectConsumers,
  collectRoutes,
  compareRoutes,
  normalizePath,
  type RenameRow,
} from './route-match.ts';

function source(fileName: string, text: string): ts.SourceFile {
  return ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
}

test('normalizePath normalizes templates, parameters and query strings', () => {
  assert.equal(normalizePath('/v1/conversas/${id}/mensagens?x=1'), '/v1/conversas/:*/mensagens');
  assert.equal(normalizePath('v1/conversas/:id'), '/v1/conversas/:*');
});

test('collectRoutes joins controller and method paths and captures decorators', () => {
  const routes = collectRoutes([
    source(
      'apps/api/src/example.ts',
      `
      @ComSessao()
      @Controller('v1/x')
      class A {
        @Get(':id')
        @Escopos('x:ler')
        f(@Param('id') id: string) {}
      }
      `,
    ),
  ]);

  assert.deepEqual(routes, [
    {
      method: 'GET',
      path: '/v1/x/:*',
      rawPath: '/v1/x/:id',
      controller: 'A',
      handler: 'f',
      guards: [
        { name: 'ComSessao', args: [] },
        { name: 'Escopos', args: ["'x:ler'"] },
      ],
      file: 'apps/api/src/example.ts',
      line: 5,
    },
  ]);
});

test('collectConsumers matches a live route and reports an orphan', () => {
  const routes = collectRoutes([
    source('apps/api/src/example.ts', `@Controller('v1/x') class A { @Get(':id') f() {} }`),
  ]);
  const consumers = collectConsumers(
    [source('apps/desk-vite/src/example.ts', "api.get(`/v1/x/${id}`); api.get('/v1/y')")],
    routes,
  );

  assert.equal(consumers.find((item) => item.raw === '/v1/x/${id}')?.match, '/v1/x/:*');
  assert.equal(consumers.find((item) => item.raw === '/v1/y')?.match, 'ORPHAN');
});

test('compareRoutes translates only applied endpoint and symbol rows and detects guard loss', () => {
  const baseline = collectRoutes([
    source(
      'apps/api/src/example.ts',
      `@Controller('v1/x') class A { @Get(':id') @ComSessao() f() {} }`,
    ),
  ]);
  const renamed = collectRoutes([
    source(
      'apps/api/src/example.ts',
      `@Controller('v1/items') class A { @Get(':id') @RequireSession() f() {} }`,
    ),
  ]);
  const renames: RenameRow[] = [
    { kind: 'endpoint', old: '/v1/x/:id', new: '/v1/items/:id', status: 'applied' },
    { kind: 'symbol', old: 'ComSessao', new: 'RequireSession', status: 'verified' },
  ];

  assert.equal(compareRoutes(baseline, renamed, renames).equal, true);

  const withoutGuard = collectRoutes([
    source('apps/api/src/example.ts', `@Controller('v1/items') class A { @Get(':id') f() {} }`),
  ]);
  const comparison = compareRoutes(baseline, withoutGuard, renames);
  assert.equal(comparison.equal, false);
  assert.match(comparison.differences.join('\n'), /RequireSession/);
});

test('compareRoutes ignores approved rows until they are applied', () => {
  const baseline = collectRoutes([
    source(
      'apps/api/src/example.ts',
      `@Controller('v1/x') class A { @Get(':id') @ComSessao() f() {} }`,
    ),
  ]);
  const approved: RenameRow[] = [
    { kind: 'endpoint', old: '/v1/x/:id', new: '/v1/items/:id', status: 'approved' },
    { kind: 'symbol', old: 'ComSessao', new: 'RequireSession', status: 'approved' },
  ];

  assert.equal(compareRoutes(baseline, baseline, approved).equal, true);
});
