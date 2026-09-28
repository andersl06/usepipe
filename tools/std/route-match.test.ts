import assert from 'node:assert/strict';
import test from 'node:test';
import ts from 'typescript';
import {
  collectConsumers,
  collectExternalFrontReferences,
  collectFrontConsumers,
  collectFrontRoutes,
  collectRoutes,
  compareRoutes,
  normalizePath,
  type RenameRow,
} from './route-match.ts';

function source(fileName: string, text: string): ts.SourceFile {
  const scriptKind = fileName.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  return ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true, scriptKind);
}

const APP_FIXTURE = `
  <Routes>
    <Route path="/application" element={<PagePortal />} />
    <Route path="/application/detail/:shortName" element={<ContactRoute />}>
      {contactRoutes}
    </Route>
    <Route path="/portal" element={<LegacyRedirect />} />
  </Routes>
`;

const CONTACT_ROUTES_FIXTURE = `
  const contactRoutes = (
    <>
      <Route path="growth" element={<GrowthShell />}>
        <Route path="active-messages" element={<PageActiveMessages />} />
      </Route>
    </>
  );

  ${APP_FIXTURE}
`;

test('normalizePath normalizes templates, parameters and query strings', () => {
  assert.equal(normalizePath('/v1/conversations/${id}/messages?x=1'), '/v1/conversations/:*/messages');
  assert.equal(normalizePath('v1/conversations/:id'), '/v1/conversations/:*');
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

test('collectFrontRoutes builds full nested patterns through a locally interpolated JSX variable and marks LegacyRedirect leaves as legacy', () => {
  const routes = collectFrontRoutes([
    source('apps/management-vite/src/App.tsx', CONTACT_ROUTES_FIXTURE),
  ]);

  const nested = routes.find(
    (route) => route.path === '/application/detail/:shortName/growth/active-messages',
  );
  assert.ok(nested, 'nested route pattern not found');
  assert.equal(nested?.legacy, false);

  const portalContact = routes.find((route) => route.path === '/application/detail/:shortName');
  assert.equal(portalContact?.legacy, false);

  const legacy = routes.find((route) => route.path === '/portal');
  assert.equal(legacy?.legacy, true);
});

test('collectFrontConsumers recognizes every consumer syntax, ignores external links, and flags a dangling reference', () => {
  const routes = collectFrontRoutes([
    source('apps/management-vite/src/App.tsx', CONTACT_ROUTES_FIXTURE),
  ]);

  const consumers = source(
    'apps/management-vite/src/pages/example.tsx',
    `
    function Example({ s }: { s: string }) {
      navigate('/application');
      navegar('/application');
      const item = { rota: '/application' };
      return (
        <>
          <a href="/application">portal</a>
          <Link to="/application">portal</Link>
          <Navigate to="/application" />
          <a href={\`/application/detail/\${s}/growth\`}>growth</a>
          <a href={flowPath(s, 'growth/active-messages')}>active messages</a>
          <a href="/canais">dangling</a>
          <a href="https://example.com">external</a>
          <a href="mailto:a@b.com">external</a>
          <a href="#top">external</a>
        </>
      );
    }
    `,
  );

  const builders = new Map([['flowPath', '/application/detail/:shortName']]);
  const found = collectFrontConsumers([consumers], routes, builders);

  assert.ok(found.some((item) => item.raw === '/application' && !item.dangling));
  assert.ok(
    found.some(
      (item) => item.normalized === '/application/detail/:*/growth' && !item.dangling,
    ),
  );
  const builderHit = found.find(
    (item) => item.raw === '/application/detail/:shortName/growth/active-messages',
  );
  assert.equal(builderHit?.dangling, false);
  const orphan = found.find((item) => item.raw === '/canais');
  assert.equal(orphan?.dangling, true);
  assert.equal(
    found.some((item) => item.raw.startsWith('https://') || item.raw.startsWith('mailto:') || item.raw === '#top'),
    false,
  );
});

test('a consumer matching only a legacy route counts as dangling', () => {
  const routes = collectFrontRoutes([
    source('apps/management-vite/src/App.tsx', '<Route path="/portal" element={<LegacyRedirect />} />'),
  ]);
  const consumer = source('apps/management-vite/src/pages/other.tsx', "navigate('/portal');");
  const found = collectFrontConsumers([consumer], routes, new Map());
  assert.equal(found.length, 1);
  assert.equal(found[0]?.dangling, true);
});

test('collectExternalFrontReferences catches a legacy prefix used outside the front app', () => {
  const routes = collectFrontRoutes([
    source('apps/management-vite/src/App.tsx', CONTACT_ROUTES_FIXTURE),
  ]);
  const external = source(
    'apps/api/src/domain/example.ts',
    "const link = '/portal'; const unrelated = '/v1/x';",
  );
  const found = collectExternalFrontReferences([external], routes);
  assert.equal(found.length, 1);
  assert.equal(found[0]?.raw, '/portal');
  assert.equal(found[0]?.dangling, true);
});

test('compareRoutes keeps persisted guard arguments untranslated', () => {
  const guards = (scope: string) => [{ name: 'Escopos', args: [scope] }];
  const baseline = [
    { method: 'GET', path: '/v1/conversas', guards: guards('conversas:ler') },
  ] as unknown as Parameters<typeof compareRoutes>[0];
  const current = [
    { method: 'GET', path: '/v1/conversations', guards: guards('conversas:ler') },
  ] as unknown as Parameters<typeof compareRoutes>[1];
  const renames = [
    { kind: 'endpoint', old: '/v1/conversas', new: '/v1/conversations', status: 'applied' },
    { kind: 'symbol', old: 'conversas', new: 'conversations', status: 'applied' },
  ] as unknown as Parameters<typeof compareRoutes>[2];
  assert.equal(compareRoutes(baseline, current, renames).equal, false);
  assert.equal(compareRoutes(baseline, current, renames, new Set(['conversas:ler'])).equal, true);
});
