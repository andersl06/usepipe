import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';
import { MAP_COLUMNS, type MapRow } from './lib/map.ts';
import { traceJsonbReach, type JsonbReachRow } from './lib/jsonb-reach.ts';
import { loadWorkspaceProject } from './lib/project.ts';
import { isPtComment, isPtToken, ptCommentScore, splitIdentifier } from './pt-detect.ts';
import { collectRoutes, normalizePath } from './route-match.ts';

export interface CommentRow {
  id: string; scope: string; file: string; start_line: string; end_line: string;
  kind: 'line' | 'block' | 'jsdoc' | 'hash' | 'css'; pt_score: string; text: string;
  action: string; new_text: string; sensitivity: string; evidence: string; reviewed_by: string; status: string;
}

export interface RouteDependent {
  route_row_id: string; app: string; route: string; file: string; line: string;
  kind: 'navigate' | 'link' | 'redirect' | 'href' | 'path-builder' | 'test' | 'doc' | 'regex' | 'other'; snippet: string;
}

export interface InventoryResult { rows: MapRow[]; comments: CommentRow[]; routeDependents: RouteDependent[] }
export interface SourceText { fileName: string; sourceText: string }

export const SCOPES = [
  'packages-core', 'packages-db', 'packages-contracts', 'packages-ui', 'packages-ai',
  'packages-autenticacao', 'packages-armazenamento', 'packages-tempo-real', 'packages-mcp',
  'workers', 'api', 'ponte', 'desk-vite', 'gestao-vite', 'crm', 'site', 'infra', 'css',
] as const;

const CODE = /\.(?:[cm]?[jt]sx?)$/;
const PERSISTED = new Set(['error-code', 'storage-key', 'cookie', 'ws-event', 'job-name', 'queue', 'wire-key', 'literal-value']);
const COMMENT_HEADERS = ['id', 'scope', 'file', 'start_line', 'end_line', 'kind', 'pt_score', 'text', 'action', 'new_text', 'sensitivity', 'evidence', 'reviewed_by', 'status'];
const DEPENDENT_HEADERS = ['route_row_id', 'app', 'route', 'file', 'line', 'kind', 'snippet'];

function slash(value: string): string { return value.replaceAll('\\', '/').replace(/^\.\//, ''); }
function sha(value: string): string { return createHash('sha1').update(value).digest('hex').slice(0, 8); }
function lineOf(source: ts.SourceFile, node: ts.Node): number { return source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1; }
function isPt(value: string): boolean { return splitIdentifier(value).some((token) => isPtToken(token)); }
function scopeOf(file: string): string {
  const parts = slash(file).split('/');
  if (parts[0] === 'packages') return `packages-${parts[1]}`;
  if (parts[0] === 'apps') return parts[1] ?? 'infra';
  return parts[0] === 'site' || file.startsWith('apps/site/') ? 'site' : 'infra';
}
function sliceOf(scope: string, kind: string): string {
  if (kind === 'test-title') return ['workers', 'api', 'ponte'].includes(scope) ? '2' : ['desk-vite', 'gestao-vite', 'crm'].includes(scope) ? '3' : scope === 'site' ? '4' : '1';
  if (kind === 'package' || kind === 'app') return '4';
  if (scope.startsWith('packages-')) return '1';
  if (['workers', 'api', 'ponte'].includes(scope)) return '2';
  if (['desk-vite', 'gestao-vite', 'crm', 'css'].includes(scope)) return '3';
  return '4';
}
function row(scope: string, kind: string, old: string, declaredAt: string, notes = '', force = false): MapRow | undefined {
  if (!force && !isPt(old)) return undefined;
  return {
    id: `${scope}-${kind}-${sha(old + declaredAt)}`, scope, slice: sliceOf(scope, kind), kind, old, new: '',
    declared_at: declaredAt, consumers: '0', persisted: PERSISTED.has(kind) ? 'unknown' : 'no',
    category: '', decision_ref: '', status: 'candidate', owner: '', notes,
  };
}
function literal(node: ts.Node | undefined): string | undefined {
  if (node && ts.isStringLiteralLike(node)) return node.text;
  return undefined;
}
function nameText(node: ts.Node | undefined): string | undefined {
  if (!node) return undefined;
  if (ts.isIdentifier(node) || ts.isPrivateIdentifier(node) || ts.isStringLiteralLike(node)) return node.text;
  return undefined;
}
function scriptKind(file: string): ts.ScriptKind { return file.endsWith('.tsx') ? ts.ScriptKind.TSX : file.endsWith('.jsx') ? ts.ScriptKind.JSX : ts.ScriptKind.TS; }
function callName(expression: ts.Expression): string {
  if (ts.isIdentifier(expression)) return expression.text;
  if (ts.isPropertyAccessExpression(expression)) return `${callName(expression.expression)}.${expression.name.text}`;
  if (ts.isCallExpression(expression)) return callName(expression.expression);
  return '';
}

function declarationKind(node: ts.Node): string | undefined {
  if (ts.isParameter(node) || (ts.isVariableDeclaration(node) && !ts.isVariableStatement(node.parent.parent))) return 'ts-local';
  if (ts.isBindingElement(node)) return 'ts-local';
  if (ts.isPropertySignature(node) || ts.isPropertyDeclaration(node)) return 'ts-prop';
  if (ts.isMethodDeclaration(node) || ts.isMethodSignature(node) || ts.isFunctionDeclaration(node) ||
      ts.isClassDeclaration(node) || ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node) ||
      ts.isEnumDeclaration(node) || ts.isEnumMember(node)) return 'symbol';
  if (ts.isVariableDeclaration(node) && ts.isVariableStatement(node.parent.parent)) return 'symbol';
  return undefined;
}
function exportedObjectProperty(node: ts.PropertyAssignment): boolean {
  const declaration = node.parent.parent;
  return ts.isVariableDeclaration(declaration) && ts.isVariableStatement(declaration.parent.parent) &&
    declaration.parent.parent.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword) === true;
}
function drizzleInfo(node: ts.PropertyAssignment): string {
  if (!ts.isObjectLiteralExpression(node.parent)) return '';
  let current: ts.Node = node.parent;
  while (current.parent && !ts.isCallExpression(current.parent)) current = current.parent;
  const call = current.parent;
  if (!call || !ts.isCallExpression(call) || callName(call.expression) !== 'pgTable') return '';
  if (!ts.isCallExpression(node.initializer)) return '';
  let init: ts.Expression = node.initializer;
  while (ts.isCallExpression(init) && ts.isPropertyAccessExpression(init.expression)) init = init.expression.expression;
  if (!ts.isCallExpression(init)) return '';
  const sql = literal(init.arguments[0]);
  return sql ? `sql=${sql}` : '';
}

function collectCode(source: SourceText, rows: MapRow[], comments: CommentRow[]): void {
  const file = slash(source.fileName); const scope = scopeOf(file);
  const sf = ts.createSourceFile(file, source.sourceText, ts.ScriptTarget.Latest, true, scriptKind(file));
  const add = (kind: string, old: string, node: ts.Node, notes = '', force = false): void => {
    const item = row(scope, kind, old, `${file}:${lineOf(sf, node)}`, notes, force); if (item) rows.push(item);
  };
  const visit = (node: ts.Node): void => {
    const kind = declarationKind(node);
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer && ts.isStringLiteral(node.initializer)) {
      const name = node.name.text;
      if (/^FILA_[A-Z_]+$/.test(name) && node.initializer.text.startsWith('pipe-')) add('queue', node.initializer.text, node.initializer);
      if (/^(?:COOKIE_[A-Z_]+|NOME_DO_COOKIE)$/.test(name)) add('cookie', node.initializer.text, node.initializer);
      if (name === 'CHAVE_TEMA' || (name === 'CHAVE' && file.endsWith('/visoes-salvas.tsx'))) add('storage-key', node.initializer.text, node.initializer);
    }
    if (kind && 'name' in node) {
      const name = nameText((node as ts.NamedDeclaration).name);
      if (name) add(kind, name, node, ts.isPropertyDeclaration(node) || ts.isPropertySignature(node) ? drizzleInfo(node as never) : '');
    }
    if (ts.isPropertyAssignment(node)) {
      const name = nameText(node.name);
      const notes = drizzleInfo(node);
      if (name && (notes || exportedObjectProperty(node))) add('ts-prop', name, node, notes);
      if (name?.startsWith('pipe_') && ts.isVariableDeclaration(node.parent.parent) && node.parent.parent.name.getText(sf) === 'AJUDA') add('metric', name, node, '', true);
    }
    if (ts.isTypeAliasDeclaration(node) && ts.isUnionTypeNode(node.type)) {
      for (const member of node.type.types) if (ts.isLiteralTypeNode(member) && ts.isStringLiteral(member.literal)) add('literal-value', member.literal.text, member.literal, '', isPt(node.name.text));
    }
    if (ts.isEnumMember(node) && node.initializer && ts.isStringLiteralLike(node.initializer)) add('literal-value', node.initializer.text, node.initializer);
    if (ts.isNewExpression(node) && node.expression.getText(sf) === 'ErroPipe' && node.arguments?.[1] && ts.isStringLiteralLike(node.arguments[1])) add('error-code', node.arguments[1].text, node.arguments[1], '', true);
    if (ts.isStringLiteralLike(node) && insideConstAssertion(node) && /^[a-z][a-z0-9_.:/*-]*$/.test(node.text)) add('literal-value', node.text, node);
    if (ts.isJsxAttribute(node) && node.name.text.startsWith('data-')) {
      const value = ts.isStringLiteral(node.initializer) ? node.initializer.text : undefined;
      const declared = `${file}:${lineOf(sf, node)}`;
      const attr = row('css', 'data-attr', node.name.text, declared); if (attr) rows.push(attr);
      if (value) { const valued = row('css', 'data-attr', `${node.name.text}=${value}`, declared); if (valued) rows.push(valued); }
    }
    if (ts.isPropertyAccessExpression(node) && ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === 'dataset') addCssData(node.name.text, node, file, sf, rows);
    if (ts.isCallExpression(node)) collectTechnicalCall(node, file, scope, sf, rows, add);
    ts.forEachChild(node, visit);
  };
  visit(sf);
  collectTsComments(sf, source.sourceText, scope, comments);
}

function insideConstAssertion(node: ts.Node): boolean {
  for (let current = node.parent; current; current = current.parent) {
    if (ts.isAsExpression(current) && current.type.getText() === 'const') return true;
    if (!ts.isArrayLiteralExpression(current) && !ts.isObjectLiteralExpression(current) && !ts.isPropertyAssignment(current)) break;
  }
  return false;
}
function addCssData(name: string, node: ts.Node, file: string, sf: ts.SourceFile, rows: MapRow[]): void {
  const old = `data-${name.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`;
  const item = row('css', 'data-attr', old, `${file}:${lineOf(sf, node)}`); if (item) rows.push(item);
}
function collectTechnicalCall(node: ts.CallExpression, file: string, scope: string, sf: ts.SourceFile, rows: MapRow[], add: (kind: string, old: string, node: ts.Node, notes?: string, force?: boolean) => void): void {
  const name = callName(node.expression); const first = literal(node.arguments[0]);
  if (['describe', 'it', 'test'].includes(name) && first) add('test-title', first, node.arguments[0]!);
  if (['ErroPipe.requisicao', 'ErroPipe.conflito'].includes(name) && first) add('error-code', first, node.arguments[0]!, '', true);
  if (['localStorage.getItem', 'localStorage.setItem', 'localStorage.removeItem', 'sessionStorage.getItem', 'sessionStorage.setItem'].includes(name) && first) add('storage-key', first, node.arguments[0]!);
  if (['cookie', 'res.cookie', 'clearCookie'].includes(name) && first) add('cookie', first, node.arguments[0]!);
  if (/metric|Counter|Gauge|Histogram/.test(name) && first) add('metric', first, node.arguments[0]!);
  if (['getAttribute', 'setAttribute', 'hasAttribute', 'removeAttribute'].includes(name.split('.').at(-1) ?? '') && first?.startsWith('data-')) addCssData(first.slice(5), node.arguments[0]!, file, sf, rows);
  if (name.endsWith('.upsertJobScheduler') && first) add('job-name', first, node.arguments[0]!, '', true);
  if (name === 'Controller' || ['Get', 'Post', 'Put', 'Patch', 'Delete'].includes(name)) return;
  if ((name.endsWith('Queue') || name.endsWith('Worker')) && first) add('queue', first, node.arguments[0]!);
}

function collectTsComments(sf: ts.SourceFile, text: string, scope: string, output: CommentRow[]): void {
  const ranges = [...text.matchAll(/\/\/[^\r\n]*|\/\*[\s\S]*?\*\//g)];
  for (const match of ranges) {
    const raw = match[0]; if (!raw || /eslint-|@ts-|license|copyright/i.test(raw) || !isPtComment(raw)) continue;
    const start = match.index ?? 0; const startLine = sf.getLineAndCharacterOfPosition(start).line + 1;
    const endLine = startLine + (raw.match(/\n/g)?.length ?? 0); const kind = raw.startsWith('/**') ? 'jsdoc' : raw.startsWith('//') ? 'line' : 'block';
    const file = slash(sf.fileName); output.push(commentRow(scope, file, startLine, endLine, kind, raw));
  }
}
function commentRow(scope: string, file: string, start: number, end: number, kind: CommentRow['kind'], text: string): CommentRow {
  return { id: `${scope}-comment-${sha(text + file + start)}`, scope, file, start_line: String(start), end_line: String(end), kind,
    pt_score: String(ptCommentScore(text)), text, action: '', new_text: '', sensitivity: '', evidence: '', reviewed_by: '', status: '' };
}

function listFiles(root: string): string[] {
  try { return execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8' }).split('\0').filter(Boolean); }
  catch {
    const result: string[] = []; const walk = (dir: string): void => { for (const entry of fs.readdirSync(dir, { withFileTypes: true })) { const full = path.join(dir, entry.name); if (entry.isDirectory()) walk(full); else result.push(slash(path.relative(root, full))); } }; walk(root); return result;
  }
}
function sourcesAt(root: string, files: string[]): SourceText[] { return files.map((file) => ({ fileName: slash(file), sourceText: fs.readFileSync(path.join(root, file), 'utf8') })); }

function collectPaths(files: string[], rows: MapRow[]): void {
  const dirs = new Set<string>();
  for (const file of files) {
    const scope = scopeOf(file); const base = path.posix.basename(slash(file)); const fileRow = row(scope, 'file', base, slash(file)); if (fileRow) rows.push(fileRow);
    let dir = path.posix.dirname(slash(file)); while (dir !== '.' && dir !== '/' && dir) { dirs.add(dir); dir = path.posix.dirname(dir); }
  }
  for (const dir of dirs) { const item = row(scopeOf(dir), 'dir', dir, dir); if (item) rows.push(item); }
}
function collectManifests(root: string, files: string[], rows: MapRow[]): void {
  for (const file of files.filter((f) => f.endsWith('package.json'))) {
    let json: { name?: string; scripts?: Record<string, string>; exports?: Record<string, unknown> }; try { json = JSON.parse(fs.readFileSync(path.join(root, file), 'utf8')); } catch { continue; }
    const scope = scopeOf(file);
    if (json.name?.startsWith('@pipe/')) { const item = row(scope, 'package', json.name, `${file}:1`); if (item) rows.push(item); }
    for (const key of Object.keys(json.scripts ?? {})) { const item = row(scope, 'script', key, `${file}:1`); if (item) rows.push(item); }
    for (const key of Object.keys(json.exports ?? {})) { const item = row(scope, 'subpath-export', key, `${file}:1`); if (item) rows.push(item); }
  }
  for (const app of new Set(files.filter((f) => f.startsWith('apps/')).map((f) => f.split('/')[1]).filter(Boolean))) { const item = row(app!, 'app', app!, `apps/${app}`); if (item) rows.push(item); }
}
function collectStyles(source: SourceText, rows: MapRow[]): void {
  const lines = source.sourceText.split(/\r?\n/); const file = slash(source.fileName);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]!;
    for (const match of line.matchAll(/\.([_a-zA-Z][\w-]*)/g)) { const item = row('css', 'css-class', match[1]!, `${file}:${index + 1}`); if (item) rows.push(item); }
    for (const match of line.matchAll(/(--[\w-]+)/g)) { const item = row('css', 'css-var', match[1]!, `${file}:${index + 1}`); if (item) rows.push(item); }
    for (const match of line.matchAll(/\[\s*(data-[\w-]+)(?:\s*=\s*["']?([^\]"']+))?/g)) {
      for (const value of [match[1], match[2] ? `${match[1]}=${match[2]}` : ''].filter(Boolean)) { const item = row('css', 'data-attr', value!, `${file}:${index + 1}`); if (item) rows.push(item); }
    }
  }
  for (const match of source.sourceText.matchAll(/\/\*[\s\S]*?\*\//g)) if (isPtComment(match[0])) { const start = source.sourceText.slice(0, match.index).split('\n').length; commentsSink?.push(commentRow('css', file, start, start + (match[0].match(/\n/g)?.length ?? 0), 'css', match[0])); }
}
let commentsSink: CommentRow[] | undefined;
let lastJsonbReport: JsonbReachRow[] = [];

function jsxAttribute(node: ts.JsxOpeningLikeElement, name: string): ts.JsxAttribute | undefined { return node.attributes.properties.find((p): p is ts.JsxAttribute => ts.isJsxAttribute(p) && p.name.text === name); }
function attrString(attribute: ts.JsxAttribute | undefined): string | undefined { return attribute && ts.isStringLiteral(attribute.initializer) ? attribute.initializer.text : undefined; }
function joinRoute(parent: string, child: string): string { if (child.startsWith('/')) return normalizePath(child); return normalizePath(`${parent}/${child}`); }
function collectFrontRoutes(sources: SourceText[], rows: MapRow[]): void {
  for (const input of sources.filter((s) => /apps\/(desk-vite|gestao-vite)\/src\/App\.tsx$/.test(slash(s.fileName)))) {
    const file = slash(input.fileName); const scope = scopeOf(file); const sf = ts.createSourceFile(file, input.sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const fragments = new Map<string, ts.JsxChild[]>();
    sf.forEachChild((node) => { if (ts.isVariableStatement(node)) for (const declaration of node.declarationList.declarations) if (ts.isIdentifier(declaration.name) && declaration.initializer && (ts.isParenthesizedExpression(declaration.initializer) || ts.isJsxFragment(declaration.initializer))) { let init: ts.Expression = declaration.initializer; if (ts.isParenthesizedExpression(init)) init = init.expression; if (ts.isJsxFragment(init)) fragments.set(declaration.name.text, [...init.children]); } });
    const walk = (children: readonly ts.JsxChild[], parent: string, stack = new Set<string>()): void => {
      for (const child of children) {
        if ((ts.isJsxElement(child) && child.openingElement.tagName.getText(sf) === 'Route') || (ts.isJsxSelfClosingElement(child) && child.tagName.getText(sf) === 'Route')) {
          const opening = ts.isJsxElement(child) ? child.openingElement : child;
          const value = attrString(jsxAttribute(opening, 'path')); const full = value ? joinRoute(parent, value) : parent;
          if (value) { const item = row(scope, 'front-route', full, `${file}:${lineOf(sf, opening)}`); if (item) rows.push(item); }
          if (ts.isJsxElement(child)) walk(child.children, full, stack);
        } else if (ts.isJsxElement(child) || ts.isJsxFragment(child)) walk(child.children, parent, stack);
        else if (ts.isJsxExpression(child) && child.expression && ts.isIdentifier(child.expression) && fragments.has(child.expression.text) && !stack.has(child.expression.text)) {
          walk(fragments.get(child.expression.text)!, parent, new Set([...stack, child.expression.text]));
        }
      }
    };
    const root = sf.statements.flatMap((statement) => findJsxRoots(statement)); walk(root, '');
  }
}
function findJsxRoots(node: ts.Node): ts.JsxChild[] { const found: ts.JsxChild[] = []; const visit = (child: ts.Node): void => { if (ts.isJsxElement(child) && child.openingElement.tagName.getText() === 'Routes') found.push(...child.children); else ts.forEachChild(child, visit); }; visit(node); return found; }
function collectCrmRoutes(files: string[], rows: MapRow[]): void {
  for (const file of files.filter((f) => /^apps\/crm\/src\/app\/.*\/(?:page|route|layout)\.tsx?$/.test(slash(f)))) {
    const relative = slash(file).replace(/^apps\/crm\/src\/app\/?/, '').replace(/\/(?:page|route|layout)\.tsx?$/, '').split('/').filter((p) => !/^\(.+\)$/.test(p)).map((p) => /^\[\.\.\.(.+)\]$/.test(p) ? `:${RegExp.$1}*` : /^\[(.+)\]$/.test(p) ? `:${RegExp.$1}` : p).join('/');
    const route = normalizePath(`/${relative}`); const item = row('crm', 'front-route', route, file); if (item) rows.push(item);
  }
}
function collectEndpoints(sources: SourceText[], rows: MapRow[]): void {
  const api = sources.filter((s) => s.fileName.startsWith('apps/api/src/') && s.fileName.endsWith('.ts'));
  for (const route of collectRoutes(api)) { const item = row('api', 'endpoint', route.path, `${route.file}:${route.line}`); if (item) rows.push(item); }
}

function routeMatches(value: string, route: string): boolean {
  const candidate = normalizePath(value).split('/').filter(Boolean); const pattern = route.split('/').filter(Boolean);
  return candidate.length === pattern.length &&
    candidate.some((part, index) => part !== ':*' && pattern[index] !== ':*' && part === pattern[index]) &&
    candidate.every((part, index) => part === ':*' || pattern[index] === ':*' || part === pattern[index]);
}
function dependentMatches(snippet: string, route: string, file: string): boolean {
  const literals = [...snippet.matchAll(/(?:["'`])(\/[^"'`\s]*)/g)].map((m) => m[1]!.replace(/\$\{[^}]+\}/g, ':x'));
  if (literals.some((candidate) => routeMatches(candidate, route))) return true;
  if (!/^\/(?:fluxo|roteador)\/:[^/]+\//.test(route)) return false;
  if (file.endsWith('/paginas/operacao/casca.tsx') && route.includes('/atendimento/')) {
    const match = /\brota:\s*['"]([^'"]+)['"]/.exec(snippet);
    if (match && route.endsWith(`/atendimento/${match[1]}`)) return true;
  }
  if (file.endsWith('/paginas/fluxo/canais/whatsapp/casca.tsx')) {
    const match = /\bsegmento:\s*['"]([^'"]+)['"]/.exec(snippet);
    if (match && route.endsWith(`/canais/whatsapp/${match[1]}`)) return true;
  }
  if (file.endsWith('/paginas/fluxo/equipe/tela.tsx') && route.endsWith('/equipe/editar/:*') && /navegar\(`editar\/\$\{/.test(snippet)) return true;
  const parts = route.split('/');
  return [...snippet.matchAll(/\}(\/[^"'`\s]*)/g)].some((match) =>
    parts.slice(3).some((_, index) => routeMatches(match[1]!, `/${parts.slice(3 + index).join('/')}`)));
}
function dependentKind(file: string, line: string): RouteDependent['kind'] {
  if (/tests?\//.test(file) || /\.test\./.test(file)) return 'test'; if (/\.md$/.test(file)) return 'doc';
  if (/navigate\s*\(/.test(line)) return 'navigate'; if (/redirect\s*\(/.test(line) || /<Navigate/.test(line)) return 'redirect';
  if (/<Link|\bto=/.test(line)) return 'link'; if (/href\s*=|window\.location/.test(line)) return 'href'; if (/RegExp|\/\^/.test(line)) return 'regex';
  if (/function|=>|return/.test(line)) return 'path-builder'; return 'other';
}
function collectDependents(sources: SourceText[], rows: MapRow[]): RouteDependent[] {
  const result: RouteDependent[] = []; const routes = rows.filter((r) => r.kind === 'front-route');
  for (const route of routes) {
    const app = route.scope;
    for (const source of sources) {
      const file = slash(source.fileName); if (!(file.startsWith(`apps/${app}/`) || file.startsWith('docs/') || /(^|\/)README\.md$/.test(file))) continue;
      const lines = source.sourceText.split(/\r?\n/);
      for (let i = 0; i < lines.length; i += 1) {
        const snippet = lines[i]!.trim(); if (snippet.includes('<Route') || !/["'`/]/.test(snippet)) continue;
        if (dependentMatches(snippet, route.old, file)) result.push({ route_row_id: route.id, app, route: route.old, file, line: String(i + 1), kind: dependentKind(file, snippet), snippet: snippet.slice(0, 240) });
      }
    }
    route.consumers = String(result.filter((item) => item.route_row_id === route.id).length);
  }
  return result;
}
function countConsumers(sources: SourceText[], rows: MapRow[]): void {
  const counts = new Map<string, number>();
  for (const source of sources) for (const token of source.sourceText.match(/[\p{L}\p{N}_$.-]+/gu) ?? []) counts.set(token, (counts.get(token) ?? 0) + 1);
  for (const item of rows) if (item.kind !== 'front-route') item.consumers = String(counts.get(item.old) ?? 0);
}
function uniqueRows(rows: MapRow[]): MapRow[] { return [...new Map(rows.sort((a, b) => `${a.scope}\0${a.kind}\0${a.old}\0${a.declared_at}`.localeCompare(`${b.scope}\0${b.kind}\0${b.old}\0${b.declared_at}`)).map((r) => [r.id, r])).values()]; }

export function extractSources(sources: SourceText[], files = sources.map((s) => s.fileName)): InventoryResult {
  const rows: MapRow[] = []; const comments: CommentRow[] = []; commentsSink = comments;
  collectPaths(files, rows); for (const source of sources.filter((s) => CODE.test(s.fileName))) collectCode(source, rows, comments);
  for (const source of sources.filter((s) => s.fileName.endsWith('.css') || /apps\/site\/.*\.html$/.test(s.fileName))) collectStyles(source, rows);
  collectFrontRoutes(sources, rows); collectCrmRoutes(files, rows); collectEndpoints(sources, rows);
  const deduped = uniqueRows(rows); countConsumers(sources, deduped); const routeDependents = collectDependents(sources, deduped); commentsSink = undefined;
  return { rows: deduped, comments: comments.sort((a, b) => `${a.scope}\0${a.file}\0${a.start_line}`.localeCompare(`${b.scope}\0${b.file}\0${b.start_line}`)), routeDependents };
}
export function applyJsonbReach(result: InventoryResult, report: JsonbReachRow[]): void {
  const byDeclaration = new Map<string, JsonbReachRow[]>();
  for (const item of report) { const key = `${slash(item.declared_at)}\0${item.kind}\0${item.name}`; const list = byDeclaration.get(key) ?? []; list.push(item); byDeclaration.set(key, list); }
  const existing = new Map(result.rows.map((item) => [`${slash(item.declared_at)}\0${item.kind}\0${item.old}`, item]));
  for (const [key, items] of byDeclaration) {
    let item = existing.get(key);
    if (!item) {
      const first = items[0]!; const file = first.declared_at.replace(/:\d+$/, ''); const created = row(scopeOf(file), first.kind, first.name, slash(first.declared_at), '', true); if (!created) continue;
      if (!isPt(first.name)) created.new = 'KEEP'; result.rows.push(created); item = created; existing.set(key, item);
    }
    item.persisted = 'unknown';
    const columns = [...new Set(items.map((origin) => `jsonb:${origin.table}.${origin.column}`))].sort();
    item.notes = [...new Set([item.notes, ...columns].filter(Boolean))].join(';');
  }
  result.rows = uniqueRows(result.rows);
}
export function extract(root: string): InventoryResult {
  const files = listFiles(root).map(slash).filter((file) => !file.startsWith('tools/std/fixtures/')); const sources = sourcesAt(root, files.filter((f) => CODE.test(f) || f.endsWith('.css') || f.endsWith('.html') || f.endsWith('.md')));
  const result = extractSources(sources, files); collectManifests(root, files, result.rows);
  const reach = traceJsonbReach(loadWorkspaceProject(root)); lastJsonbReport = reach.report; applyJsonbReach(result, reach.report); result.rows = uniqueRows(result.rows); return result;
}

function csv(headers: readonly string[], rows: Record<string, string>[]): string { const cell = (v: string): string => /[",\r\n]/.test(v) ? `"${v.replaceAll('"', '""')}"` : v; return `${headers.join(',')}\n${rows.map((r) => headers.map((h) => cell(r[h] ?? '')).join(',')).join('\n')}\n`; }
function summary(result: InventoryResult): string { const lines = ['# Inventory summary', '', '| Scope | Kind | Rows |', '|---|---|---:|']; for (const scope of SCOPES) { const byKind = new Map<string, number>(); for (const r of result.rows.filter((r) => r.scope === scope)) byKind.set(r.kind, (byKind.get(r.kind) ?? 0) + 1); if (byKind.size === 0) lines.push(`| ${scope} | - | 0 |`); else for (const [kind, count] of [...byKind].sort()) lines.push(`| ${scope} | ${kind} | ${count} |`); } lines.push('', `Total rows: ${result.rows.length}`, `Total comments: ${result.comments.length}`, `Total route dependents: ${result.routeDependents.length}`); return `${lines.join('\n')}\n`; }
function writeInventoryMap(out: string, rows: MapRow[]): void {
  const dir = path.join(out, 'map'); fs.mkdirSync(dir, { recursive: true });
  for (const scope of SCOPES) {
    const scoped = rows.filter((r) => r.scope === scope);
    fs.writeFileSync(path.join(dir, `${scope}.csv`), scoped.length
      ? csv(MAP_COLUMNS, scoped)
      : MAP_COLUMNS.join(','));
  }
}
function printTotals(result: InventoryResult): void { for (const scope of SCOPES) console.log(`${scope}: ${result.rows.filter((r) => r.scope === scope).length}`); const kinds = new Map<string, number>(); for (const row of result.rows) kinds.set(row.kind, (kinds.get(row.kind) ?? 0) + 1); for (const [kind, count] of [...kinds].sort()) console.log(`kind ${kind}: ${count}`); console.log(`jsonb-reach: ${lastJsonbReport.length}`); const columns = new Map<string, number>(); for (const item of lastJsonbReport) columns.set(`${item.table}.${item.column}`, (columns.get(`${item.table}.${item.column}`) ?? 0) + 1); for (const [column, count] of [...columns].sort()) console.log(`jsonb ${column}: ${count}`); console.log(`jsonb names: ${[...new Set(lastJsonbReport.map((item) => item.name))].sort().join(',')}`); console.log(`comments: ${result.comments.length}; route-dependents: ${result.routeDependents.length}`); }
function main(): void { const args = process.argv.slice(2); const outIndex = args.indexOf('--out'); if (outIndex < 0 || !args[outIndex + 1]) throw new Error('Usage: node tools/std/inventory.ts --out <STD> [--dry-run]'); const result = extract(process.cwd()); printTotals(result); if (args.includes('--dry-run')) return; const out = path.resolve(args[outIndex + 1]!); writeInventoryMap(out, result.rows); for (const scope of SCOPES) { const scoped = result.comments.filter((r) => r.scope === scope); if (scoped.length) { const file = path.join(out, 'comments', `${scope}.csv`); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, csv(COMMENT_HEADERS, scoped as unknown as Record<string, string>[])); } } fs.mkdirSync(path.join(out, 'reports'), { recursive: true }); fs.writeFileSync(path.join(out, 'reports/front-route-dependents.csv'), csv(DEPENDENT_HEADERS, result.routeDependents as unknown as Record<string, string>[])); fs.writeFileSync(path.join(out, 'reports/jsonb-reach.csv'), csv(['table', 'column', 'via', 'root_type', 'kind', 'name', 'declared_at'], lastJsonbReport as unknown as Record<string, string>[])); fs.writeFileSync(path.join(out, 'inventory-summary.md'), summary(result)); }
const invoked = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : ''; if (import.meta.url === invoked) { try { main(); } catch (error) { console.error(error); process.exitCode = 1; } }
