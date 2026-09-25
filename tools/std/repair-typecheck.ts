/** Repair rename-map mismatches at TypeScript diagnostic positions. */
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { readMap } from './lib/map.ts';

const root = path.resolve(process.argv[2] ?? '.');
const mapDir = path.resolve(process.argv[3] ?? path.join(root, '.planning/phases/01-padronizar-linguagem-t-cnica-navega-o-e-renderiza-o/std/map'));
const projectConfig = path.resolve(root, process.argv[4] ?? 'apps/api/tsconfig.json');
const dryRun = process.argv.includes('--dry-run');
const rows = readMap(mapDir).filter(r =>
  ['approved', 'applied', 'verified'].includes(r.status) &&
  ['ts-prop', 'symbol', 'wire-key'].includes(r.kind) &&
  (r.scope === 'api' || r.scope.startsWith('packages-')) && r.new !== r.old);
const oldByNew = new Map<string, Set<string>>();
const newByOld = new Map<string, Set<string>>();
for (const row of rows) {
  const names = oldByNew.get(row.new) ?? new Set<string>();
  names.add(row.old);
  oldByNew.set(row.new, names);
  const replacements = newByOld.get(row.old) ?? new Set<string>();
  replacements.add(row.new);
  newByOld.set(row.old, replacements);
}
const configFile = ts.readConfigFile(projectConfig, ts.sys.readFile);
if (configFile.error) throw new Error(ts.flattenDiagnosticMessageText(configFile.error.messageText, '\n'));
const config = ts.parseJsonConfigFileContent(configFile.config, ts.sys, path.dirname(projectConfig));
const program = ts.createProgram(config.fileNames, config.options);
const checker = program.getTypeChecker();
const diagnostics = ts.getPreEmitDiagnostics(program).filter(d => d.file && d.start !== undefined);
type Edit = { start: number; end: number; text: string; why: string };
const edits = new Map<string, Edit[]>();
const unresolved: string[] = [];

function nodeAt(node: ts.Node, start: number): ts.Node {
  for (const child of node.getChildren()) {
    if (child.getStart() <= start && start < child.getEnd()) return nodeAt(child, start);
  }
  return node;
}
function hasProperty(type: ts.Type | undefined, name: string): boolean {
  return !!type && !!checker.getPropertyOfType(type, name);
}
function proposedOld(name: string, type: ts.Type | undefined): string | undefined {
  const matches = [...(oldByNew.get(name) ?? []), ...(newByOld.get(name) ?? [])]
    .filter(other => hasProperty(type, other));
  return matches.length === 1 ? matches[0] : undefined;
}
function add(file: ts.SourceFile, start: number, end: number, replacement: string, why: string) {
  if (file.text.slice(start, end) === replacement) return;
  const list = edits.get(file.fileName) ?? [];
  if (!list.some(e => e.start === start && e.end === end)) list.push({start, end, text: replacement, why});
  edits.set(file.fileName, list);
}
function identifierAt(file: ts.SourceFile, start: number): ts.Identifier | undefined {
  const node = nodeAt(file, start);
  if (ts.isIdentifier(node)) return node;
  if (ts.isStringLiteral(node)) return undefined;
  return undefined;
}
function targetType(id: ts.Identifier): ts.Type | undefined {
  const parent = id.parent;
  if (ts.isPropertyAccessExpression(parent) && parent.name === id) return checker.getTypeAtLocation(parent.expression);
  if ((ts.isPropertyAssignment(parent) || ts.isShorthandPropertyAssignment(parent)) && parent.name === id) {
    return checker.getContextualType(parent.parent);
  }
  return undefined;
}
function existingLocal(id: ts.Identifier): string | undefined {
  const candidates = [...(oldByNew.get(id.text) ?? []), ...(newByOld.get(id.text) ?? [])];
  const available = checker.getSymbolsInScope(id, ts.SymbolFlags.Value);
  const matches = candidates.filter(name => available.some(symbol => symbol.name === name));
  return matches.length === 1 ? matches[0] : undefined;
}
for (const d of diagnostics) {
  const file = d.file!;
  const start = d.start!;
  const id = identifierAt(file, start);
  const msg = ts.flattenDiagnosticMessageText(d.messageText, ' ');
  const where = `${path.relative(root, file.fileName).replaceAll('\\', '/')}:${file.getLineAndCharacterOfPosition(start).line + 1}`;
  if (!id) continue;
  if (d.code === 2551 || d.code === 2724 || d.code === 2561) {
    const suggested = /Did you mean (?:to write )?['"]([^'"]+)['"]\?/.exec(msg)?.[1];
    if (suggested) {
      const replacement = d.code === 2724 && ts.isImportSpecifier(id.parent) && id.parent.name === id
        ? `${suggested} as ${id.text}`
        : d.code === 2561 && ts.isShorthandPropertyAssignment(id.parent) ? `${suggested}: ${id.text}`
        : suggested;
      add(file, id.getStart(), id.getEnd(), replacement, `TS${d.code}`);
      continue;
    }
  }
  if (d.code === 18004 && ts.isShorthandPropertyAssignment(id.parent)) {
    const local = existingLocal(id);
    if (local) {
      add(file, id.getStart(), id.getEnd(), `${id.text}: ${local}`, `TS${d.code}`);
      continue;
    }
  }
  if (d.code === 2339 || d.code === 2353) {
    const old = proposedOld(id.text, targetType(id));
    if (old) {
      const parent = id.parent;
      const replacement = ts.isShorthandPropertyAssignment(parent) && parent.name === id
        ? `${old}: ${id.text}` : old;
      add(file, id.getStart(), id.getEnd(), replacement, `TS${d.code}`);
      continue;
    }
  }
  if ([2339, 2353, 2305, 2551, 2724].includes(d.code)) unresolved.push(`${where} TS${d.code} ${msg}`);
}
let count = 0;
for (const [name, list] of edits) {
  const ordered = list.sort((a, b) => b.start - a.start);
  let content = fs.readFileSync(name, 'utf8');
  let last = Infinity;
  for (const edit of ordered) {
    if (edit.end > last) continue;
    content = content.slice(0, edit.start) + edit.text + content.slice(edit.end);
    last = edit.start;
    count++;
  }
  if (!dryRun) fs.writeFileSync(name, content);
}
console.log(`diagnostics=${diagnostics.length} edits=${count} files=${edits.size} unresolved=${unresolved.length}`);
for (const item of unresolved.slice(0, 100)) console.log(item);
