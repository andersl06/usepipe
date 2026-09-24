import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

export interface GuardInfo {
  name: string;
  args: string[];
}

export interface RouteInfo {
  method: string;
  path: string;
  rawPath: string;
  controller: string;
  handler: string;
  guards: GuardInfo[];
  file: string;
  line: number;
}

export interface ConsumerInfo {
  file: string;
  line: number;
  raw: string;
  normalized: string;
  match: string;
  kind: 'consumer' | 'internal';
}

export interface RenameRow {
  kind: string;
  old: string;
  new: string;
  status: string;
  [key: string]: string;
}

export interface RouteComparison {
  equal: boolean;
  differences: string[];
  expected: ComparableRoute[];
  current: ComparableRoute[];
}

type SourceInput = string | ts.SourceFile | { fileName: string; sourceText: string };
type ComparableRoute = Pick<RouteInfo, 'method' | 'path' | 'guards'>;

const HTTP_DECORATORS = new Map([
  ['Get', 'GET'],
  ['Post', 'POST'],
  ['Put', 'PUT'],
  ['Patch', 'PATCH'],
  ['Delete', 'DELETE'],
  ['All', 'ALL'],
  ['Head', 'HEAD'],
  ['Options', 'OPTIONS'],
]);
const ROUTE_DECORATORS = new Set(['Controller', ...HTTP_DECORATORS.keys()]);

export function normalizePath(value: string): string {
  let normalized = value.trim();
  const v1At = normalized.search(/\/v1(?:\/|$)/);
  if (v1At > 0) normalized = normalized.slice(v1At);
  normalized = normalized.replace(/\$\{[^}]*\}/g, ':*');
  normalized = normalized.split(/[\s)\]}>…,.;"']/, 1)[0] ?? normalized;
  normalized = normalized.split(/[?#]/, 1)[0] ?? normalized;
  normalized = normalized.replace(/\\\//g, '/');
  normalized = normalized.replace(/:([A-Za-z_$][\w$]*)(?:\([^/]*\))?/g, ':*');
  normalized = normalized.replace(/(?<!\/):\*/g, '');
  normalized = normalized.replace(/\/+/, '/').replace(/\/{2,}/g, '/');
  if (!normalized.startsWith('/')) normalized = `/${normalized}`;
  if (normalized.length > 1) normalized = normalized.replace(/\/+$/, '');
  return normalized;
}

export function collectRoutes(files: SourceInput[]): RouteInfo[] {
  const sources = files.map(toSourceFile);
  const globalPrefix = findGlobalPrefix(sources);
  const routes: RouteInfo[] = [];

  for (const sourceFile of sources) {
    const visit = (node: ts.Node): void => {
      if (ts.isClassDeclaration(node)) {
        const controllerDecorator = decoratorsOf(node).find(
          (decorator) => decoratorInfo(decorator, sourceFile)?.name === 'Controller',
        );
        if (controllerDecorator) {
          const controllerInfo = decoratorInfo(controllerDecorator, sourceFile);
          const controllerPath = controllerInfo?.values[0] ?? '';
          const classGuards = decoratorsOf(node)
            .map((decorator) => guardFromDecorator(decorator, sourceFile))
            .filter((guard): guard is GuardInfo => guard !== null);

          for (const member of node.members) {
            if (!ts.isMethodDeclaration(member)) continue;
            const methodDecorators = decoratorsOf(member);
            for (const decorator of methodDecorators) {
              const info = decoratorInfo(decorator, sourceFile);
              if (!info) continue;
              const httpMethod = HTTP_DECORATORS.get(info.name);
              if (!httpMethod) continue;

              const methodPath = info.values[0] ?? '';
              const rawPath = joinPaths(globalPrefix, controllerPath, methodPath);
              const methodGuards = methodDecorators
                .map((candidate) => guardFromDecorator(candidate, sourceFile))
                .filter((guard): guard is GuardInfo => guard !== null);
              const line = sourceFile.getLineAndCharacterOfPosition(member.getStart(sourceFile)).line + 1;
              routes.push({
                method: httpMethod,
                path: normalizePath(rawPath),
                rawPath,
                controller: node.name?.text ?? '<anonymous>',
                handler: member.name.getText(sourceFile),
                guards: [...classGuards, ...methodGuards],
                file: normalizeFileName(sourceFile.fileName),
                line,
              });
            }
          }
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(sourceFile);
  }

  return routes.sort(compareRouteInfo);
}

export function collectConsumers(files: SourceInput[], routes: RouteInfo[] = []): ConsumerInfo[] {
  const results: ConsumerInfo[] = [];
  const seen = new Set<string>();
  for (const input of files) {
    const sourceFile = toSourceFile(input);
    const visit = (node: ts.Node): void => {
      if (isPathLiteral(node)) {
        const raw = literalValue(node, sourceFile);
        if (raw.includes('/v1/')) {
          addOccurrence(
            results,
            seen,
            sourceFile,
            node,
            raw,
            'consumer',
            routes,
            ts.isTemplateExpression(node) ? normalizedTemplate(node) : undefined,
          );
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(sourceFile);
  }
  return results.sort(compareOccurrence);
}

export function compareRoutes(
  baseline: RouteInfo[],
  current: RouteInfo[],
  renames: RenameRow[],
): RouteComparison {
  const active = renames.filter((row) => row.status === 'applied' || row.status === 'verified');
  const endpointRenames = active.filter((row) => row.kind === 'endpoint');
  const symbolRenames = new Map(
    active.filter((row) => row.kind === 'symbol').map((row) => [row.old, row.new]),
  );
  const translatePath = (routePath: string): string => {
    for (const row of endpointRenames) {
      if (normalizePath(row.old) === routePath) return normalizePath(row.new);
    }
    return routePath;
  };
  const simplify = (route: RouteInfo, translate: boolean): ComparableRoute => ({
    method: route.method,
    path: translate ? translatePath(route.path) : route.path,
    guards: route.guards.map((guard) => ({
      name: translate ? (symbolRenames.get(guard.name) ?? guard.name) : guard.name,
      args: guard.args.map((argument) =>
        translate ? replaceSymbols(argument, symbolRenames) : argument,
      ),
    })),
  });
  const expected = baseline.map((route) => simplify(route, true)).sort(compareComparableRoute);
  const actual = current.map((route) => simplify(route, false)).sort(compareComparableRoute);
  const expectedLines = expected.map(stableComparable);
  const actualLines = actual.map(stableComparable);
  const differences = diffLines(expectedLines, actualLines);
  return { equal: differences.length === 0, differences, expected, current: actual };
}

function toSourceFile(input: SourceInput): ts.SourceFile {
  if (typeof input === 'string') {
    const text = fs.readFileSync(input, 'utf8');
    return ts.createSourceFile(input, text, ts.ScriptTarget.Latest, true, scriptKind(input));
  }
  if ('kind' in input) return input;
  return ts.createSourceFile(
    input.fileName,
    input.sourceText,
    ts.ScriptTarget.Latest,
    true,
    scriptKind(input.fileName),
  );
}

function scriptKind(fileName: string): ts.ScriptKind {
  return fileName.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
}

function decoratorsOf(node: ts.Node): readonly ts.Decorator[] {
  return ts.canHaveDecorators(node) ? (ts.getDecorators(node) ?? []) : [];
}

function decoratorInfo(
  decorator: ts.Decorator,
  sourceFile: ts.SourceFile,
): { name: string; args: string[]; values: string[] } | null {
  const expression = decorator.expression;
  if (ts.isCallExpression(expression)) {
    const name = decoratorName(expression.expression);
    if (!name) return null;
    return {
      name,
      args: expression.arguments.map((argument) => argument.getText(sourceFile)),
      values: expression.arguments.map((argument) => literalValue(argument, sourceFile)),
    };
  }
  const name = decoratorName(expression);
  return name ? { name, args: [], values: [] } : null;
}

function decoratorName(expression: ts.Expression): string | null {
  if (ts.isIdentifier(expression)) return expression.text;
  if (ts.isPropertyAccessExpression(expression)) return expression.name.text;
  return null;
}

function guardFromDecorator(
  decorator: ts.Decorator,
  sourceFile: ts.SourceFile,
): GuardInfo | null {
  const info = decoratorInfo(decorator, sourceFile);
  if (!info || ROUTE_DECORATORS.has(info.name)) return null;
  return { name: info.name, args: info.args };
}

function literalValue(node: ts.Node, sourceFile: ts.SourceFile): string {
  if (ts.isStringLiteralLike(node)) return node.text;
  if (ts.isTemplateExpression(node)) {
    let value = node.head.text;
    for (const span of node.templateSpans) {
      value += `\${${span.expression.getText(sourceFile)}}${span.literal.text}`;
    }
    return value;
  }
  if (ts.isRegularExpressionLiteral(node)) return node.text;
  return node.getText(sourceFile);
}

function isPathLiteral(node: ts.Node): node is ts.StringLiteralLike | ts.TemplateExpression {
  return ts.isStringLiteralLike(node) || ts.isTemplateExpression(node);
}

function findGlobalPrefix(files: ts.SourceFile[]): string {
  for (const sourceFile of files) {
    let prefix = '';
    const visit = (node: ts.Node): void => {
      if (
        !prefix &&
        ts.isCallExpression(node) &&
        ts.isPropertyAccessExpression(node.expression) &&
        node.expression.name.text === 'setGlobalPrefix' &&
        node.arguments[0] &&
        ts.isStringLiteralLike(node.arguments[0])
      ) {
        prefix = node.arguments[0].text;
      }
      ts.forEachChild(node, visit);
    };
    visit(sourceFile);
    if (prefix) return prefix;
  }
  return '';
}

function joinPaths(...parts: string[]): string {
  return `/${parts
    .map((part) => part.trim().replace(/^\/+|\/+$/g, ''))
    .filter(Boolean)
    .join('/')}`;
}

function addOccurrence(
  results: ConsumerInfo[],
  seen: Set<string>,
  sourceFile: ts.SourceFile,
  node: ts.Node,
  raw: string,
  kind: ConsumerInfo['kind'],
  routes: RouteInfo[],
  normalizedValue?: string,
): void {
  const file = normalizeFileName(sourceFile.fileName);
  const line = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
  const key = `${file}\0${line}\0${raw}\0${kind}`;
  if (seen.has(key)) return;
  seen.add(key);
  const normalized = normalizedValue ?? normalizePath(raw);
  results.push({
    file,
    line,
    raw,
    normalized,
    match: findMatchingRoute(normalized, routes)?.path ?? 'ORPHAN',
    kind,
  });
}

function findMatchingRoute(candidate: string, routes: RouteInfo[], fragment = false): RouteInfo | null {
  for (const route of routes) {
    if (pathIsPrefix(candidate, route.path)) return route;
    if (fragment && pathContainsFragment(route.path, candidate)) return route;
  }
  return null;
}

function normalizedTemplate(node: ts.TemplateExpression): string {
  let value = node.head.text;
  for (const span of node.templateSpans) value += `\${...}${span.literal.text}`;
  return normalizePath(value);
}

function pathIsPrefix(candidate: string, routePath: string): boolean {
  const candidateParts = segments(candidate);
  const routeParts = segments(routePath);
  if (candidateParts.length > routeParts.length) return false;
  return candidateParts.every(
    (part, index) => part === ':*' || routeParts[index] === ':*' || part === routeParts[index],
  );
}

function pathContainsFragment(routePath: string, fragment: string): boolean {
  const routeParts = segments(routePath);
  const fragmentParts = segments(fragment).filter((part) => part.length > 0);
  if (fragmentParts.length === 0) return false;
  return routeParts.some((_, start) =>
    fragmentParts.every(
      (part, offset) =>
        start + offset < routeParts.length &&
        (part === ':*' || part === routeParts[start + offset]),
    ),
  );
}

function segments(value: string): string[] {
  return value.split('/').filter(Boolean);
}

function replaceSymbols(value: string, renames: Map<string, string>): string {
  let result = value;
  for (const [oldName, newName] of renames) {
    result = result.replace(new RegExp(`\\b${escapeRegExp(oldName)}\\b`, 'g'), newName);
  }
  return result;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function stableComparable(route: ComparableRoute): string {
  return JSON.stringify(route);
}

function diffLines(expected: string[], actual: string[]): string[] {
  const expectedCounts = counts(expected);
  const actualCounts = counts(actual);
  const differences: string[] = [];
  for (const [line, count] of expectedCounts) {
    const missing = count - (actualCounts.get(line) ?? 0);
    for (let index = 0; index < missing; index += 1) differences.push(`- ${line}`);
  }
  for (const [line, count] of actualCounts) {
    const added = count - (expectedCounts.get(line) ?? 0);
    for (let index = 0; index < added; index += 1) differences.push(`+ ${line}`);
  }
  return differences;
}

function counts(values: string[]): Map<string, number> {
  const result = new Map<string, number>();
  for (const value of values) result.set(value, (result.get(value) ?? 0) + 1);
  return result;
}

function compareRouteInfo(left: RouteInfo, right: RouteInfo): number {
  return (
    `${left.method}\0${left.path}\0${left.file}\0${left.line}`.localeCompare(
      `${right.method}\0${right.path}\0${right.file}\0${right.line}`,
    )
  );
}

function compareComparableRoute(left: ComparableRoute, right: ComparableRoute): number {
  return stableComparable(left).localeCompare(stableComparable(right));
}

function compareOccurrence(left: ConsumerInfo, right: ConsumerInfo): number {
  return `${left.file}\0${left.line}\0${left.raw}`.localeCompare(`${right.file}\0${right.line}\0${right.raw}`);
}

function normalizeFileName(fileName: string): string {
  return path.relative(process.cwd(), path.resolve(fileName)).replaceAll('\\', '/');
}

function allTrackedFiles(): string[] {
  const output = execFileSync('git', ['ls-files'], { encoding: 'utf8' });
  return output.split(/\r?\n/).filter(Boolean);
}

function collectInternal(files: SourceInput[], routes: RouteInfo[]): ConsumerInfo[] {
  const results: ConsumerInfo[] = [];
  const seen = new Set<string>();
  for (const input of files) {
    const sourceFile = toSourceFile(input);
    const decoratorRanges = collectDecoratorRanges(sourceFile);
    const visit = (node: ts.Node): void => {
      if (decoratorRanges.some(([start, end]) => node.pos >= start && node.end <= end)) return;
      if (ts.isRegularExpressionLiteral(node) && (/v1/.test(node.text) || /fluxos/.test(node.text))) {
        const raw = regexPath(node.text);
        if (raw) addInternal(results, seen, sourceFile, node, raw, routes, true);
      } else if (isPathLiteral(node)) {
        if (isImportLikeLiteral(node)) return;
        const raw = literalValue(node, sourceFile);
        if (raw.includes('/v1/')) addInternal(results, seen, sourceFile, node, raw, routes, false);
      }
      ts.forEachChild(node, visit);
    };
    visit(sourceFile);
  }
  return results.sort(compareOccurrence);
}

function addInternal(
  results: ConsumerInfo[],
  seen: Set<string>,
  sourceFile: ts.SourceFile,
  node: ts.Node,
  raw: string,
  routes: RouteInfo[],
  fragment: boolean,
): void {
  const before = results.length;
  addOccurrence(results, seen, sourceFile, node, raw, 'internal', []);
  if (results.length === before) return;
  const item = results.at(-1);
  if (item) item.match = findMatchingRoute(item.normalized, routes, fragment)?.path ?? 'ORPHAN';
}

function collectDecoratorRanges(sourceFile: ts.SourceFile): Array<[number, number]> {
  const ranges: Array<[number, number]> = [];
  const visit = (node: ts.Node): void => {
    for (const decorator of decoratorsOf(node)) ranges.push([decorator.pos, decorator.end]);
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return ranges;
}

function isImportLikeLiteral(node: ts.Node): boolean {
  const parent = node.parent;
  return (
    ts.isImportDeclaration(parent) ||
    ts.isExportDeclaration(parent) ||
    (ts.isCallExpression(parent) && parent.expression.kind === ts.SyntaxKind.ImportKeyword)
  );
}

function regexPath(raw: string): string {
  const body = raw.replace(/^\//, '').replace(/\/[a-z]*$/i, '').replaceAll('\\/', '/');
  const v1 = body.indexOf('/v1/');
  const fluxo = body.indexOf('/fluxos/');
  const start = v1 >= 0 ? v1 : fluxo;
  if (start < 0) return '';
  return body
    .slice(start)
    .replace(/:\\?\(\\w\+\\?\)|:\([^)]*\)|:\\w\+/g, ':*')
    .replace(/\(\?=[^)]*\).*$/, '')
    .replace(/[\\^$]/g, '');
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"') quoted = true;
    else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\n') {
      row.push(field.replace(/\r$/, ''));
      if (row.some((value) => value.length > 0)) rows.push(row);
      row = [];
      field = '';
    } else field += char;
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function readRenameRows(target: string): RenameRow[] {
  const files = fs.statSync(target).isDirectory()
    ? fs.readdirSync(target).filter((name) => name.endsWith('.csv')).map((name) => path.join(target, name))
    : [target];
  const rows: RenameRow[] = [];
  for (const file of files) {
    const [header = [], ...values] = parseCsv(fs.readFileSync(file, 'utf8'));
    for (const value of values) {
      const row = Object.fromEntries(header.map((name, index) => [name, value[index] ?? ''])) as RenameRow;
      rows.push(row);
    }
  }
  return rows;
}

function csvCell(value: string | number): string {
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function writeConsumers(file: string, consumers: ConsumerInfo[]): void {
  const rows = ['file,line,raw,normalized,match'];
  for (const item of consumers) {
    rows.push([item.file, item.line, item.raw, item.normalized, item.match].map(csvCell).join(','));
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${rows.join('\n')}\n`);
}

function readAllowlist(file: string | undefined): Set<string> {
  if (!file || !fs.existsSync(file)) return new Set();
  const [header = [], ...rows] = parseCsv(fs.readFileSync(file, 'utf8'));
  const fileIndex = header.indexOf('file');
  const rawIndex = header.indexOf('raw');
  return new Set(rows.map((row) => `${row[fileIndex] ?? ''}\0${row[rawIndex] ?? ''}`));
}

function parseArguments(argv: string[]): Map<string, string | true> {
  const result = new Map<string, string | true>();
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (!argument?.startsWith('--')) throw new Error(`Argumento inválido: ${argument}`);
    if (argument === '--check') result.set(argument, true);
    else {
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) throw new Error(`Valor ausente para ${argument}`);
      result.set(argument, value);
      index += 1;
    }
  }
  return result;
}

function requiredArgument(args: Map<string, string | true>, name: string): string {
  const value = args.get(name);
  if (typeof value !== 'string') throw new Error(`Argumento obrigatório: ${name}`);
  return value;
}

function main(): void {
  const args = parseArguments(process.argv.slice(2));
  const emitFile = requiredArgument(args, '--emit');
  const trackedFiles = allTrackedFiles();
  const apiFiles = trackedFiles.filter(
    (file) => file.startsWith('apps/api/src/') && file.endsWith('.ts'),
  );
  const routes = collectRoutes(apiFiles);
  fs.mkdirSync(path.dirname(emitFile), { recursive: true });
  fs.writeFileSync(emitFile, `${JSON.stringify(routes, null, 2)}\n`);

  const consumerApps = new Set(['desk-vite', 'gestao-vite', 'crm', 'ponte', 'workers']);
  const consumerFiles = trackedFiles.filter((file) => {
    if (!/\.tsx?$/.test(file)) return false;
    const parts = file.split('/');
    if (parts[0] === 'apps' && parts[2] === 'tests') return true;
    if (parts[0] === 'apps' && parts[2] === 'src' && consumerApps.has(parts[1] ?? '')) return true;
    return parts[0] === 'packages' && (parts[2] === 'src' || parts[2] === 'tests');
  });
  const occurrences = [...collectConsumers(consumerFiles, routes), ...collectInternal(apiFiles, routes)].sort(
    compareOccurrence,
  );
  const consumersFile = args.get('--consumers');
  if (typeof consumersFile === 'string') writeConsumers(consumersFile, occurrences);

  let failed = false;
  if (args.has('--compare')) {
    const baseline = JSON.parse(fs.readFileSync(requiredArgument(args, '--compare'), 'utf8')) as RouteInfo[];
    const renames = readRenameRows(requiredArgument(args, '--map'));
    const comparison = compareRoutes(baseline, routes, renames);
    if (!comparison.equal) {
      failed = true;
      console.error('ROUTE SET CHANGED');
      for (const difference of comparison.differences) console.error(difference);
    }
  }

  const allowlist = readAllowlist(typeof args.get('--allow') === 'string' ? String(args.get('--allow')) : undefined);
  const unallowed = occurrences.filter(
    (item) => item.match === 'ORPHAN' && !allowlist.has(`${item.file}\0${item.raw}`),
  );
  if (args.has('--check') && unallowed.length > 0) {
    failed = true;
    console.error(`UNMATCHED PATHS: ${unallowed.length}`);
    for (const item of unallowed) console.error(`${item.file}:${item.line} [${item.kind}] ${item.raw}`);
  }

  const orphans = occurrences.filter((item) => item.match === 'ORPHAN').length;
  console.log(`Routes: ${routes.length}; references: ${occurrences.length}; orphan/unmatched: ${orphans}`);
  if (failed) process.exitCode = 1;
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : '';
if (import.meta.url === invokedPath) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
