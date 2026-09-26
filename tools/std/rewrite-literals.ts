import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import tsMorph from 'ts-morph';
import { loadWorkspaceProject } from './lib/project.ts';
import { MAP_COLUMNS, readMap, resolvePath, writeMap, type MapRow } from './lib/map.ts';
import { toCsv } from './lib/csv.ts';

const { Node, SyntaxKind } = tsMorph;
const SPECIAL_VALUES = new Set(['KEEP', 'REMOVE', 'STATE']);
const ALLOWED_KINDS = new Set([
  'endpoint',
  'front-route',
  'query-param',
  'queue',
  'job-name',
  'ws-event',
  'error-code',
  'test-title',
  'script',
  'cookie',
  'storage-key',
  'metric',
  'subpath-export',
  'package',
  'wire-key',
  'literal-value',
]);

export interface RewriteLiteralsOptions {
  root?: string;
  mapDir: string;
  scopes?: string[];
  kinds?: string[];
  status?: string[];
  ids?: string[];
  dryRun?: boolean;
  log?: (message: string) => void;
}
export interface RewriteLiteralsResult {
  rewritten: number;
  unmatchedIds: string[];
  report?: string;
}

function normalize(value: string): string {
  return value.replaceAll('\\', '/');
}
function trackedFiles(root: string): string[] {
  return execFileSync('git', ['ls-files'], { cwd: root, encoding: 'utf8' })
    .split(/\r?\n/)
    .filter(Boolean)
    .map(normalize)
    .filter((file) => !file.startsWith('tools/std/fixtures/'));
}
function splitPath(value: string): string[] {
  return value.replace(/^\//, '').split(/[?#]/)[0].split('/').filter(Boolean);
}
function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function rewritePathPattern(
  value: string,
  oldPattern: string,
  newPattern: string,
): string | undefined {
  const offset = value.indexOf(
    oldPattern.startsWith('/') ? `/${splitPath(oldPattern)[0]}` : splitPath(oldPattern)[0],
  );
  if (offset < 0) return undefined;
  const prefix = value.slice(0, offset);
  const candidate = value.slice(offset);
  const oldSegments = splitPath(oldPattern);
  const newSegments = splitPath(newPattern);
  for (let length = oldSegments.length; length >= 1; length -= 1) {
    const captures: number[] = [];
    const parts = oldSegments.slice(0, length).map((segment, index) => {
      if (segment.startsWith(':')) {
        captures.push(index);
        return '([^/?#]+)';
      }
      return escapeRegex(segment);
    });
    const leading = candidate.startsWith('/') ? '/' : '';
    const regex = new RegExp(`^${escapeRegex(leading)}${parts.join('/')}(?=/|\\?|#|$)`);
    const match = regex.exec(candidate);
    if (!match) continue;
    let capture = 1;
    const replacement = newSegments
      .slice(0, length)
      .map((segment, index) => {
        if (oldSegments[index]?.startsWith(':')) return match[capture++];
        return segment;
      })
      .join('/');
    return `${prefix}${leading}${replacement}${candidate.slice(match[0].length)}`;
  }
  return undefined;
}

function literalValue(node: any): string | undefined {
  if (Node.isStringLiteral(node) || Node.isNoSubstitutionTemplateLiteral(node))
    return node.getLiteralValue();
  if (Node.isTemplateExpression(node)) {
    let value = node.getHead().getLiteralText();
    node.getTemplateSpans().forEach((span: any, index: number) => {
      value += `\${${index}}${span.getLiteral().getLiteralText()}`;
    });
    return value;
  }
  return undefined;
}

interface Edit {
  start: number;
  end: number;
  text: string;
  row: MapRow;
  priority: number;
}
type RecordEdit = (node: any, text: string) => void;

function literalText(node: any, value: string): string {
  if (Node.isTemplateExpression(node)) {
    node.getTemplateSpans().forEach((span: any, index: number) => {
      value = value.replace(`\${${index}}`, `\${${span.getExpression().getText()}}`);
    });
    return `\`${value}\``;
  }
  const quote = node.getText()[0];
  const escaped = value.replaceAll('\\', '\\\\').replaceAll(quote, `\\${quote}`)
    .replaceAll('\r', '\\r').replaceAll('\n', '\\n');
  return `${quote}${escaped}${quote}`;
}

function selectEdits(edits: Edit[]): Edit[] {
  const selected: Edit[] = [];
  for (const edit of edits.sort((a, b) => a.start - b.start || b.priority - a.priority || b.row.old.length - a.row.old.length || b.end - a.end)) {
    if (selected.some((prior) => edit.start < prior.end && prior.start < edit.end)) continue;
    selected.push(edit);
  }
  return selected;
}

function matchPriority(value: string, row: MapRow): number {
  if (row.kind !== 'endpoint' && row.kind !== 'front-route') return row.old.length;
  const start = value.indexOf(row.old.startsWith('/') ? `/${splitPath(row.old)[0]}` : splitPath(row.old)[0]);
  if (start < 0) return row.old.length;
  const actual = splitPath(value.slice(start));
  const expected = splitPath(row.old);
  let length = 0;
  while (length < expected.length &&
    (expected[length] === actual[length] ||
      (expected[length].startsWith(':') && actual[length] !== undefined))) length += 1;
  return length * 1000 + row.old.length;
}

function firstLiteral(callLike: any): any | undefined {
  return callLike
    .getArguments?.()
    .map((arg: any) => arg)
    .find((arg: any) => literalValue(arg) !== undefined);
}
function callName(node: any): string {
  const parent = node.getFirstAncestor(
    (ancestor: any) => Node.isCallExpression(ancestor) || Node.isNewExpression(ancestor),
  );
  return parent?.getExpression().getText() ?? '';
}
function isFirstArgument(node: any): boolean {
  const call = node.getFirstAncestor(
    (ancestor: any) => Node.isCallExpression(ancestor) || Node.isNewExpression(ancestor),
  );
  return call?.getArguments()[0] === node;
}

function isArgumentAt(node: any, index: number): boolean {
  const call = node.getFirstAncestor(
    (ancestor: any) => Node.isCallExpression(ancestor) || Node.isNewExpression(ancestor),
  );
  return call?.getArguments()[index] === node;
}

function technicalExactPosition(node: any, kind: string): boolean {
  const name = callName(node);
  if (kind === 'error-code') {
    // `new ErroPipe(statusCode, 'code', message)` carries the code as the
    // second argument, unlike the `ErroPipe.factory('code', message)` static
    // helpers where it is first; both are legitimate call shapes.
    if (Node.isBinaryExpression(node.getParent())) return true;
    return /(?:PipeError|ErroPipe|\.error|\.fail|\.codigo)/.test(name) &&
      (isArgumentAt(node, 0) || isArgumentAt(node, 1));
  }
  if (!isFirstArgument(node)) return false;
  if (kind === 'queue') return /(?:^|\.)(?:Queue|Worker|QueueEvents)$/.test(name);
  if (kind === 'job-name') return /(?:\.add|upsertJobScheduler|removeJobScheduler)$/.test(name);
  if (kind === 'ws-event') return /(?:\.emit|\.on|\.send)$/.test(name);
  if (kind === 'cookie')
    return /(?:cookie|cookies|Cookie).*(?:get|set|clear|remove)|(?:get|set|clear)Cookie/i.test(
      name,
    );
  if (kind === 'storage-key')
    return /(?:localStorage|sessionStorage)\.(?:getItem|setItem|removeItem)/.test(name);
  if (kind === 'metric') {
    const property = node.getFirstAncestorByKind(SyntaxKind.PropertyAssignment);
    return property?.getName() === 'name';
  }
  return false;
}

function isRoutePosition(node: any): boolean {
  const jsx = node.getFirstAncestorByKind(SyntaxKind.JsxAttribute);
  if (jsx && ['path', 'to', 'href'].includes(jsx.getNameNode().getText())) return true;
  const property = node.getFirstAncestorByKind(SyntaxKind.PropertyAssignment);
  if (property?.getName() === 'path') return true;
  const name = callName(node);
  return isFirstArgument(node) && /(?:navigate|redirect|irPara)$/.test(name);
}

function rewriteFrontRoute(value: string, row: MapRow): string | undefined {
  const firstSegment = splitPath(row.old)[0];
  if (!firstSegment || !new RegExp(`^/${escapeRegex(firstSegment)}(?=/|\\?|#|$)`).test(value))
    return undefined;
  return rewritePathPattern(value, row.old, row.new);
}

function typeContainsLiteral(type: any, value: string): boolean {
  if (!type) return false;
  if (type.isStringLiteral?.()) return type.getLiteralValue() === value;
  return (
    type.isUnion?.() &&
    type
      .getUnionTypes()
      .some((part: any) => part.isStringLiteral?.() && part.getLiteralValue() === value)
  );
}

function contextualLiteral(node: any, oldValue: string): boolean {
  if (typeContainsLiteral(node.getContextualType?.(), oldValue)) return true;
  const binary = node.getFirstAncestorByKind(SyntaxKind.BinaryExpression);
  if (binary && ['===', '==', '!==', '!='].includes(binary.getOperatorToken().getText())) {
    const other = binary.getLeft() === node ? binary.getRight() : binary.getLeft();
    if (typeContainsLiteral(other.getType(), oldValue)) return true;
  }
  const caseClause = node.getFirstAncestorByKind(SyntaxKind.CaseClause);
  const switchStatement = caseClause?.getFirstAncestorByKind(SyntaxKind.SwitchStatement);
  return Boolean(
    switchStatement && (
      typeContainsLiteral(switchStatement.getExpression().getType(), oldValue) ||
      !switchStatement.getExpression().getType().isAny()
    ),
  );
}

// `consumers` can list dozens of files per row; re-splitting and re-resolving it for every
// (row, sourceFile) pair in the project made this O(rows x files x consumers) and took minutes
// on real-sized scopes. Resolved once per distinct `consumers` string, reused across every file.
const consumerSetCache = new Map<string, Set<string>>();
function resolvedConsumers(consumers: string, allRows: MapRow[]): Set<string> {
  const cached = consumerSetCache.get(consumers);
  if (cached) return cached;
  const resolved = new Set(consumers.split(';').map((item) => resolvePath(item.trim(), allRows)));
  consumerSetCache.set(consumers, resolved);
  return resolved;
}
function fileMatchesConsumer(
  root: string,
  sourceFile: any,
  consumers: string,
  allRows: MapRow[],
): boolean {
  const relative = normalize(path.relative(root, sourceFile.getFilePath()));
  return resolvedConsumers(consumers, allRows).has(relative);
}

function rewriteWireKey(
  root: string,
  sourceFile: any,
  row: MapRow,
  allRows: MapRow[],
  record: RecordEdit,
): number {
  if (!fileMatchesConsumer(root, sourceFile, row.consumers, allRows)) return 0;
  const targets: any[] = [];
  for (const access of sourceFile.getDescendantsOfKind(SyntaxKind.PropertyAccessExpression)) {
    if (access.getName() === row.old) {
      const receiver = access.getExpression().getType();
      if (receiver.isAny() || receiver.isUnknown()) targets.push(access.getNameNode());
    }
  }
  for (const access of sourceFile.getDescendantsOfKind(SyntaxKind.ElementAccessExpression)) {
    const argument = access.getArgumentExpression();
    const receiver = access.getExpression().getType();
    if (literalValue(argument) === row.old && (receiver.isAny() || receiver.isUnknown()))
      targets.push(argument);
  }
  for (const property of sourceFile.getDescendantsOfKind(SyntaxKind.PropertyAssignment)) {
    if (property.getName() !== row.old) continue;
    const object = property.getParent();
    const type = object.getContextualType?.();
    if (type?.isAny?.() || type?.isUnknown?.()) targets.push(property.getNameNode());
  }
  // Raw SQL row-shape type literals (`tx.execute<{ fluxo_id: string }>(sql\`...\`)`)
  // mirror the wire/DB column name directly in a type declaration - there is
  // no value-level `any`/`unknown` receiver to check, the declaration itself
  // is the wire boundary.
  for (const signature of sourceFile.getDescendantsOfKind(SyntaxKind.PropertySignature)) {
    if (signature.getName() === row.old) targets.push(signature.getNameNode());
  }
  for (const target of targets)
    record(target, Node.isStringLiteral(target) ? literalText(target, row.new) : row.new);
  return targets.length;
}

function rewriteDecorators(sourceFile: any, row: MapRow, record: RecordEdit): number {
  if (row.kind !== 'endpoint') return 0;
  let count = 0;
  for (const classDeclaration of sourceFile.getClasses()) {
    const controller = classDeclaration.getDecorator('Controller');
    const controllerArg = controller && firstLiteral(controller);
    const prefix = controllerArg ? literalValue(controllerArg) : undefined;
    if (prefix === undefined) continue;
    for (const method of classDeclaration.getMethods()) {
      for (const decorator of method.getDecorators()) {
        if (!/^(?:Get|Post|Put|Patch|Delete|Options|Head|All)$/.test(decorator.getName())) continue;
        const methodArg = firstLiteral(decorator);
        const suffix = methodArg ? (literalValue(methodArg) ?? '') : '';
        const joined = `/${[prefix, suffix]
          .map((part) => part.replace(/^\/+|\/+$/g, ''))
          .filter(Boolean)
          .join('/')}`;
        if (joined !== row.old) continue;
        const prefixSegments = splitPath(prefix).length;
        const newSegments = splitPath(row.new);
        const newPrefix = newSegments.slice(0, prefixSegments).join('/');
        const newSuffix = newSegments.slice(prefixSegments).join('/');
        count += prefix !== newPrefix ? 1 : 0;
        count += suffix !== newSuffix ? 1 : 0;
        if (prefix !== newPrefix) record(controllerArg, literalText(controllerArg, newPrefix));
        if (methodArg && suffix !== newSuffix) record(methodArg, literalText(methodArg, newSuffix));
      }
    }
  }
  return count;
}

// The AST remains unchanged while every row is matched, so this list is always reusable.
const literalsCache = new WeakMap<object, any[]>();
function fileLiterals(sourceFile: any): any[] {
  const cached = literalsCache.get(sourceFile);
  if (cached) return cached;
  const literals = sourceFile
    .getDescendants()
    .filter((node: any) => literalValue(node) !== undefined);
  literalsCache.set(sourceFile, literals);
  return literals;
}

function rewriteAstRow(
  root: string,
  sourceFile: any,
  row: MapRow,
  allRows: MapRow[],
  record: RecordEdit,
): number {
  if (row.kind === 'wire-key') return rewriteWireKey(root, sourceFile, row, allRows, record);
  let count = rewriteDecorators(sourceFile, row, record);
  const literals = fileLiterals(sourceFile);
  for (const literal of literals) {
    const value = literalValue(literal)!;
    let replacement: string | undefined;
    if (row.kind === 'endpoint' && (value.includes('/v1/') || value.startsWith('v1/')))
      replacement = rewritePathPattern(value, row.old, row.new);
    else if (row.kind === 'front-route' && isRoutePosition(literal))
      replacement = rewriteFrontRoute(value, row);
    else if (row.kind === 'query-param') {
      const name = callName(literal);
      if (
        isFirstArgument(literal) &&
        (/(?:searchParams|URLSearchParams).*(?:get|set|has|delete)/.test(name) ||
          /(?:^|\.)Query$/.test(name)) &&
        value === row.old
      )
        replacement = row.new;
      else if (/[?&][^=]+=/.test(value))
        replacement = value.replace(new RegExp(`([?&])${escapeRegex(row.old)}=`), `$1${row.new}=`);
    } else if (
      row.kind === 'test-title' &&
      isFirstArgument(literal) &&
      /^(?:describe|it|test|suite)$/.test(callName(literal)) &&
      value === row.old
    )
      replacement = row.new;
    else if (
      ['queue', 'job-name', 'ws-event', 'error-code', 'cookie', 'storage-key', 'metric'].includes(
        row.kind,
      ) &&
      value === row.old &&
      technicalExactPosition(literal, row.kind)
    )
      replacement = row.new;
    else if (
      row.kind === 'literal-value' &&
      value === row.old &&
      (contextualLiteral(literal, row.old) || contextualLiteral(literal, row.new))
    )
      replacement = row.new;
    else if (['subpath-export', 'package'].includes(row.kind) && value.includes(row.old)) {
      const modulePosition = Boolean(
        literal.getFirstAncestor(
          (ancestor: any) =>
            Node.isImportDeclaration(ancestor) ||
            Node.isExportDeclaration(ancestor) ||
            Node.isImportTypeNode(ancestor) ||
            Node.isCallExpression(ancestor),
        ),
      );
      if (modulePosition && (value === row.old || value.startsWith(`${row.old}/`)))
        replacement = `${row.new}${value.slice(row.old.length)}`;
    }
    if (replacement !== undefined && replacement !== value) {
      count += 1;
      record(literal, literalText(literal, replacement));
    }
  }

  if (row.kind === 'query-param') {
    for (const creation of sourceFile.getDescendantsOfKind(SyntaxKind.NewExpression)) {
      if (creation.getExpression().getText() !== 'URLSearchParams') continue;
      const object = creation.getArguments()[0];
      if (!object || !Node.isObjectLiteralExpression(object)) continue;
      for (const property of object.getProperties()) {
        if (
          (Node.isPropertyAssignment(property) || Node.isShorthandPropertyAssignment(property)) &&
          property.getName() === row.old
        ) {
          count += 1;
          record(property.getNameNode(), row.new);
        }
      }
    }
  }
  if (
    row.kind === 'endpoint' &&
    row.consumers &&
    fileMatchesConsumer(root, sourceFile, row.consumers, allRows)
  ) {
    for (const regex of sourceFile.getDescendantsOfKind(SyntaxKind.RegularExpressionLiteral)) {
      const text = regex.getText();
      if (!text.includes('/v1/') && !text.includes('fluxos')) continue;
      let changed = text;
      const oldSegments = splitPath(row.old);
      const newSegments = splitPath(row.new);
      oldSegments.forEach((segment, index) => {
        if (!segment.startsWith(':') && newSegments[index] && segment !== newSegments[index])
          changed = changed.replaceAll(segment, newSegments[index]);
      });
      if (changed !== text) {
        count += 1;
        record(regex, changed);
      }
    }
  }

  if (
    ['queue', 'job-name', 'ws-event', 'error-code', 'cookie', 'storage-key', 'metric'].includes(
      row.kind,
    )
  ) {
    for (const declaration of sourceFile.getVariableDeclarations()) {
      const initializer = declaration.getInitializer();
      if (!initializer || literalValue(initializer) !== row.old) continue;
      const usedTechnically = declaration
        .findReferencesAsNodes()
        .some((reference: any) => technicalExactPosition(reference, row.kind));
      if (usedTechnically) {
        count += 1;
        record(initializer, literalText(initializer, row.new));
      }
    }
  }
  return count;
}

function rewriteTextFiles(
  root: string, files: string[], row: MapRow,
  record: (file: string, start: number, end: number, text: string) => void,
): number {
  if (!['script', 'subpath-export', 'package'].includes(row.kind)) return 0;
  const candidates = files.filter((file) =>
    /package\.json$|\.md$|\.sh$|(^|\/)Dockerfile[^/]*$|(?:vite|vitest)\.config\.[^/]+$/.test(file),
  );
  let count = 0;
  for (const file of candidates) {
    const fullPath = path.join(root, file);
    const original = fs.readFileSync(fullPath, 'utf8');
    let changed = false;
    const replace = (oldValue: string, newValue: string) => {
      if (!oldValue || oldValue === newValue) return;
      let offset = 0;
      while ((offset = original.indexOf(oldValue, offset)) >= 0) {
        record(fullPath, offset, offset + oldValue.length, newValue);
        changed = true;
        offset += oldValue.length;
      }
    };
    if (row.kind === 'script') {
      for (const pattern of [
        new RegExp(`(?<=["'])${escapeRegex(row.old)}(?=["']\\s*:)`, 'g'),
        new RegExp(`(?<=pnpm(?: run)?\\s+)${escapeRegex(row.old)}(?=\\s|$)`, 'g'),
      ])
        for (const match of original.matchAll(pattern)) {
          record(fullPath, match.index, match.index + row.old.length, row.new);
          changed = true;
        }
    } else {
      replace(row.old, row.new);
      if (row.kind === 'subpath-export' && file.endsWith('package.json')) {
        const oldParts = row.old.split('/');
        const newParts = row.new.split('/');
        const packageParts = row.old.startsWith('@') ? 2 : 1;
        const oldSubpath = oldParts.slice(packageParts).join('/');
        const newSubpath = newParts.slice(packageParts).join('/');
        if (oldSubpath) {
          replace(`./${oldSubpath}`, `./${newSubpath}`);
          replace(`/${oldSubpath}/`, `/${newSubpath}/`);
        }
      }
    }
    if (changed) count += 1;
  }
  return count;
}

function declaringLiteral(
  project: any,
  root: string,
  row: MapRow,
  allRows: MapRow[],
): any | undefined {
  const match = /^(.*):(\d+)$/.exec(row.declared_at);
  if (!match) return undefined;
  const current = resolvePath(match[1], allRows);
  const source = project.getSourceFile(
    (file: any) => normalize(path.relative(root, file.getFilePath())) === current,
  );
  return source
    ?.getDescendants()
    .filter((node: any) => literalValue(node) === row.old)
    .sort(
      (a: any, b: any) =>
        Math.abs(a.getStartLineNumber() - Number(match[2])) -
        Math.abs(b.getStartLineNumber() - Number(match[2])),
    )[0];
}

export function rewriteLiterals(options: RewriteLiteralsOptions): RewriteLiteralsResult {
  const root = fs.realpathSync.native(path.resolve(options.root ?? '.'));
  const kinds = options.kinds ?? [...ALLOWED_KINDS];
  const invalid = kinds.filter((kind) => !ALLOWED_KINDS.has(kind));
  if (invalid.length) {
    const error = new Error(`unsupported kinds: ${invalid.join(',')}`) as Error & {
      exitCode?: number;
    };
    error.exitCode = 2;
    throw error;
  }
  const statuses = options.status ?? ['approved'];
  if (!options.dryRun && statuses.some((status) => status !== 'approved')) {
    const error = new Error('non-approved status is allowed only with --dry-run') as Error & {
      exitCode?: number;
    };
    error.exitCode = 2;
    throw error;
  }
  const allRows = readMap(options.mapDir);
  const rows = allRows.filter(
    (row) =>
      kinds.includes(row.kind) &&
      statuses.includes(row.status) &&
      !SPECIAL_VALUES.has(row.new) &&
      (!options.scopes || options.scopes.includes('all') || options.scopes.includes(row.scope)) &&
      (!options.ids || options.ids.includes(row.id)),
  );
  const files = trackedFiles(root);
  const project = loadWorkspaceProject(root);
  for (const file of files.filter((file) => /\.(?:js|mjs|mts)$/.test(file)))
    project.addSourceFileAtPathIfExists(path.join(root, file));
  const edits = new Map<string, Edit[]>();
  const counts = new Map<string, number>();
  const physicalCounts = new Map<string, number>();
  const record = (file: string, start: number, end: number, replacement: string, row: MapRow, original = '') => {
    const fileEdits = edits.get(file) ?? [];
    fileEdits.push({ start, end, text: replacement, row, priority: matchPriority(original, row) });
    edits.set(file, fileEdits);
  };
  // All matchers read the original AST and original text. Nothing is mutated until
  // every row has contributed its candidate spans.
  for (const row of rows) {
    const declared = row.kind === 'literal-value'
      ? declaringLiteral(project, root, row, allRows) : undefined;
    for (const sourceFile of project.getSourceFiles()) {
      if (normalize(path.relative(root, sourceFile.getFilePath())).startsWith('tools/std/fixtures/'))
        continue;
      const file = sourceFile.getFilePath();
      counts.set(row.id, (counts.get(row.id) ?? 0) + rewriteAstRow(root, sourceFile, row, allRows,
        (node, replacement) => record(file, node.getStart(), node.getEnd(), replacement, row,
          literalValue(node) ?? node.getText())));
    }
    if (declared && literalValue(declared) === row.old && !contextualLiteral(declared, row.old)) {
      record(declared.getSourceFile().getFilePath(), declared.getStart(), declared.getEnd(),
        literalText(declared, row.new), row);
      counts.set(row.id, (counts.get(row.id) ?? 0) + 1);
    }
    counts.set(row.id, (counts.get(row.id) ?? 0) + rewriteTextFiles(root, files, row,
      (file, start, end, replacement) => record(file, start, end, replacement, row)));
  }
  for (const [file, candidates] of edits) {
    const selected = selectEdits(candidates);
    for (const edit of selected)
      physicalCounts.set(edit.row.id, (physicalCounts.get(edit.row.id) ?? 0) + 1);
    if (!options.dryRun) {
      let content = fs.readFileSync(file, 'utf8');
      for (const edit of selected.reverse())
        content = content.slice(0, edit.start) + edit.text + content.slice(edit.end);
      fs.writeFileSync(file, content, 'utf8');
    }
  }
  let rewritten = 0;
  const unmatchedIds: string[] = [];
  const applied: MapRow[] = [];
  for (const row of rows) {
    const rowCount = counts.get(row.id) ?? 0;
    if (rowCount === 0) unmatchedIds.push(row.id);
    else {
      rewritten += rowCount;
      if (!options.dryRun) {
        row.status = 'applied';
        applied.push(row);
      }
    }
    options.log?.(`${options.dryRun ? 'would rewrite' : 'rewrote'} ${row.id}: ${rowCount}`);
  }
  let report: string | undefined;
  if (!options.dryRun) {
    writeMap(options.mapDir, applied);
    const reports = path.join(path.dirname(options.mapDir), 'reports');
    fs.mkdirSync(reports, { recursive: true });
    report = path.join(
      reports,
      `rewrite-unmatched-${new Date().toISOString().replaceAll(':', '-')}.csv`,
    );
    fs.writeFileSync(
      report,
      toCsv([
        [...MAP_COLUMNS],
        ...rows
          .filter((row) => unmatchedIds.includes(row.id))
          .map((row) => MAP_COLUMNS.map((column) => row[column])),
      ]),
      'utf8',
    );
  }
  options.log?.(`rewritten=${rewritten} edits=${[...physicalCounts.values()].reduce((a, b) => a + b, 0)} unmatched=${unmatchedIds.length}`);
  return { rewritten, unmatchedIds, report };
}

function list(value: string | undefined): string[] | undefined {
  return value
    ?.split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}
function parseArgs(argv: string[]): RewriteLiteralsOptions {
  const values = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--dry-run') values.set('dry-run', 'true');
    else if (argv[index].startsWith('--')) values.set(argv[index].slice(2), argv[++index]);
  }
  if (!values.get('map')) throw new Error('--map is required');
  return {
    root: values.get('root') ?? '.',
    mapDir: values.get('map')!,
    scopes: list(values.get('scopes')),
    kinds: list(values.get('kinds')),
    status: list(values.get('status')),
    ids: list(values.get('ids')),
    dryRun: values.get('dry-run') === 'true',
    log: console.log,
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    rewriteLiterals(parseArgs(process.argv.slice(2)));
  } catch (caught) {
    const error = caught as Error & { exitCode?: number };
    console.error(error.message);
    process.exitCode = error.exitCode ?? 1;
  }
}
