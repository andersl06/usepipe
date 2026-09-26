import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import tsMorph from 'ts-morph';
import { loadWorkspaceProject } from './lib/project.ts';
import { MAP_COLUMNS, readMap, writeMap, type MapRow } from './lib/map.ts';
import { toCsv } from './lib/csv.ts';

const { Node, SyntaxKind } = tsMorph;

export interface RenameCssOptions {
  root?: string;
  mapDir: string;
  scopes?: string[];
  dryRun?: boolean;
  log?: (message: string) => void;
}
export interface DynamicSite {
  file: string;
  line: number;
  snippet: string;
}
export interface RenameCssResult {
  filesChanged: number;
  perFile: Record<string, number>;
  totalReplacements: number;
  unmatchedIds: string[];
  dynamicSites: DynamicSite[];
  dynamicReport?: string;
  unmatchedReport?: string;
}

interface ClassMaps {
  class: Map<string, string>;
  var: Map<string, string>;
  dataAttrBare: Map<string, string>;
  dataAttrValue: Map<string, string>;
}
interface Counters {
  class: Map<string, number>;
  var: Map<string, number>;
  dataAttrBare: Map<string, number>;
  dataAttrValue: Map<string, number>;
  total: number;
}

function normalize(value: string): string {
  return value.replaceAll('\\', '/');
}
function trackedFiles(root: string): string[] {
  return execFileSync('git', ['ls-files'], { cwd: root, encoding: 'utf8' })
    .split(/\r?\n/)
    .filter(Boolean)
    .map(normalize);
}

function newCounters(): Counters {
  return { class: new Map(), var: new Map(), dataAttrBare: new Map(), dataAttrValue: new Map(), total: 0 };
}
function bump(map: Map<string, number>, key: string, counters: Counters): void {
  map.set(key, (map.get(key) ?? 0) + 1);
  counters.total += 1;
}

function buildMaps(rows: MapRow[]): ClassMaps {
  const maps: ClassMaps = {
    class: new Map(),
    var: new Map(),
    dataAttrBare: new Map(),
    dataAttrValue: new Map(),
  };
  for (const row of rows) {
    if (row.kind === 'css-class') maps.class.set(row.old, row.new);
    else if (row.kind === 'css-var') maps.var.set(row.old, row.new);
    else if (row.kind === 'data-attr') {
      if (row.old.includes('=')) maps.dataAttrValue.set(row.old, row.new);
      else maps.dataAttrBare.set(row.old, row.new);
    }
  }
  return maps;
}

// -------- token-level renamers (shared by CSS text, HTML text and TS/TSX AST) --------

function renameClassTokens(text: string, classMap: Map<string, string>, counters: Counters): string {
  if (classMap.size === 0) return text;
  return text.replace(/\.([A-Za-z_-][\w-]*)/g, (whole, name: string) => {
    const next = classMap.get(name);
    if (!next) return whole;
    bump(counters.class, name, counters);
    return `.${next}`;
  });
}
function renameVarTokens(text: string, varMap: Map<string, string>, counters: Counters): string {
  if (varMap.size === 0) return text;
  return text.replace(/--[A-Za-z_][\w-]*/g, (whole) => {
    const next = varMap.get(whole);
    if (!next) return whole;
    bump(counters.var, whole, counters);
    return next;
  });
}
// className-style whitespace-separated token list ("a dk-x b"): every token is a
// complete, boundary-safe class name - whole-token exact match only.
function renameClassListText(text: string, classMap: Map<string, string>, counters: Counters): string {
  if (classMap.size === 0) return text;
  return text.replace(/\S+/g, (token) => {
    const next = classMap.get(token);
    if (!next) return token;
    bump(counters.class, token, counters);
    return next;
  });
}

interface DataAttrOccurrence {
  name: string;
  value: string | undefined;
  changed: boolean;
}
function mapDataAttrOccurrence(
  name: string,
  value: string | undefined,
  maps: ClassMaps,
  counters: Counters,
): DataAttrOccurrence {
  if (value !== undefined) {
    const key = `${name}=${value}`;
    const mapped = maps.dataAttrValue.get(key);
    if (mapped) {
      const eq = mapped.indexOf('=');
      const newName = mapped.slice(0, eq);
      const newValue = mapped.slice(eq + 1);
      bump(counters.dataAttrValue, key, counters);
      return { name: newName, value: newValue, changed: true };
    }
  }
  const bare = maps.dataAttrBare.get(name);
  if (bare) {
    bump(counters.dataAttrBare, name, counters);
    return { name: bare, value, changed: bare !== name };
  }
  return { name, value, changed: false };
}

// `[data-x]`, `[data-x=value]`, `[data-x="value"]` - CSS attribute selectors. Also
// used verbatim inside querySelector(All)/closest/matches selector strings.
const ATTR_BRACKET_RE = /\[\s*(data-[A-Za-z0-9-]+)(\s*[~|^$*]?=\s*(?:"[^"]*"|'[^']*'|[^\]\s]+))?\s*\]/g;
function renameAttrBrackets(text: string, maps: ClassMaps, counters: Counters): string {
  if (maps.dataAttrBare.size === 0 && maps.dataAttrValue.size === 0) return text;
  return text.replace(ATTR_BRACKET_RE, (whole, name: string, valuePart: string | undefined) => {
    if (!valuePart) {
      const mapped = mapDataAttrOccurrence(name, undefined, maps, counters);
      return mapped.changed ? `[${mapped.name}]` : whole;
    }
    const match = /^(\s*)([~|^$*]?=)(\s*)(['"]?)([\s\S]*?)\4(\s*)$/.exec(valuePart);
    if (!match) return whole;
    const [, sp1, op, sp2, quote, rawValue, sp3] = match;
    const mapped = mapDataAttrOccurrence(name, rawValue, maps, counters);
    if (mapped.name === name && mapped.value === rawValue) return whole;
    return `[${mapped.name}${sp1}${op}${sp2}${quote}${mapped.value}${quote}${sp3}]`;
  });
}
function renameSelectorText(text: string, maps: ClassMaps, counters: Counters): string {
  const withAttrs = renameAttrBrackets(text, maps, counters);
  return renameClassTokens(withAttrs, maps.class, counters);
}

// -------- CSS / HTML (text-based) --------

function renameCssCode(code: string, maps: ClassMaps, counters: Counters): string {
  const withAttrs = renameAttrBrackets(code, maps, counters);
  const STRING_RE = /"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/g;
  let result = '';
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = STRING_RE.exec(withAttrs))) {
    const before = withAttrs.slice(last, match.index);
    result += renameVarTokens(renameClassTokens(before, maps.class, counters), maps.var, counters);
    result += match[0];
    last = match.index + match[0].length;
  }
  result += renameVarTokens(renameClassTokens(withAttrs.slice(last), maps.class, counters), maps.var, counters);
  return result;
}
function renameCssText(text: string, maps: ClassMaps, counters: Counters): string {
  return text
    .split(/(\/\*[\s\S]*?\*\/)/)
    .map((part, index) => (index % 2 === 1 ? part : renameCssCode(part, maps, counters)))
    .join('');
}
function renameHtmlText(text: string, maps: ClassMaps, counters: Counters): string {
  let next = text.replace(
    /(<style[^>]*>)([\s\S]*?)(<\/style>)/gi,
    (whole, open: string, body: string, close: string) => `${open}${renameCssText(body, maps, counters)}${close}`,
  );
  next = next
    .replace(/(\bclass\s*=\s*")([^"]*)(")/g, (whole, open: string, value: string, close: string) =>
      `${open}${renameClassListText(value, maps.class, counters)}${close}`)
    .replace(/(\bclass\s*=\s*')([^']*)(')/g, (whole, open: string, value: string, close: string) =>
      `${open}${renameClassListText(value, maps.class, counters)}${close}`);
  next = next.replace(
    /(data-[A-Za-z0-9-]+)(\s*=\s*(["'])([^"']*)\3)?/g,
    (whole, name: string, valuePart: string | undefined, quote: string | undefined, rawValue: string | undefined) => {
      const mapped = mapDataAttrOccurrence(name, valuePart ? rawValue : undefined, maps, counters);
      if (!mapped.changed) return whole;
      return valuePart ? `${mapped.name}=${quote}${mapped.value}${quote}` : mapped.name;
    },
  );
  return next;
}

// -------- TS/TSX (ts-morph AST) --------

function classNameKeys(maps: ClassMaps): string[] {
  return [...maps.class.keys()];
}
function isRelevantPrefix(word: string, keys: string[]): boolean {
  return word.length > 0 && keys.some((key) => key.startsWith(word));
}
function isRelevantSuffix(word: string, keys: string[]): boolean {
  return word.length > 0 && keys.some((key) => key.endsWith(word));
}
function escapeTemplateChunk(value: string): string {
  return value.replaceAll('\\', '\\\\').replaceAll('`', '\\`');
}

// A template literal's static text can be "glued" to an interpolation with no
// whitespace boundary (`dk-${estado}`) - part of the class name is computed at
// runtime and cannot be renamed safely. If the glued word is actually a
// prefix/suffix of a mapped class name, the whole literal is left untouched and
// reported as a dynamic-construction site (for a human to fix in the apply task).
// Glued words unrelated to any mapped class are simply skipped (left as-is,
// nothing to report); the rest of the literal is still renamed normally.
function rewriteClassTemplate(
  templateNode: any,
  maps: ClassMaps,
  counters: Counters,
  dynamicSites: DynamicSite[],
  filePath: string,
): void {
  const spans = templateNode.getTemplateSpans();
  const chunkTexts: string[] = [
    templateNode.getHead().getLiteralText(),
    ...spans.map((span: any) => span.getLiteral().getLiteralText()),
  ];
  const keys = classNameKeys(maps);
  let relevantDynamic = false;
  const plan = chunkTexts.map((chunk, index) => {
    const precededByExpr = index > 0;
    const followedByExpr = index < spans.length;
    const gluedLeft = precededByExpr && chunk.length > 0 && !/^\s/.test(chunk);
    const gluedRight = followedByExpr && chunk.length > 0 && !/\s$/.test(chunk);
    const segments = chunk.split(/(\s+)/);
    let startIndex = 0;
    let endIndex = segments.length - 1;
    let leadingWord = '';
    let trailingWord = '';
    if (gluedLeft) {
      leadingWord = segments[0];
      startIndex = 1;
      if (isRelevantSuffix(leadingWord, keys)) relevantDynamic = true;
    }
    if (gluedRight) {
      trailingWord = segments[segments.length - 1];
      endIndex = segments.length - 2;
      if (isRelevantPrefix(trailingWord, keys)) relevantDynamic = true;
    }
    const middle = endIndex >= startIndex ? segments.slice(startIndex, endIndex + 1).join('') : '';
    return { leadingWord, middle, trailingWord };
  });
  if (relevantDynamic) {
    dynamicSites.push({
      file: filePath,
      line: templateNode.getStartLineNumber(),
      snippet: templateNode.getText(),
    });
    return;
  }
  const newChunks = plan.map(({ leadingWord, middle, trailingWord }) =>
    escapeTemplateChunk(leadingWord) +
    escapeTemplateChunk(renameClassListText(middle, maps.class, counters)) +
    escapeTemplateChunk(trailingWord));
  const parts = [newChunks[0]];
  spans.forEach((span: any, index: number) => {
    parts.push(`\${${span.getExpression().getText()}}`);
    parts.push(newChunks[index + 1]);
  });
  const newText = parts.join('');
  if (newText !== chunkTexts.map(escapeTemplateChunk).join('')) templateNode.replaceWithText(`\`${newText}\``);
}

function visitClassLikeExpr(
  expr: any,
  maps: ClassMaps,
  counters: Counters,
  dynamicSites: DynamicSite[],
  filePath: string,
): void {
  if (!expr) return;
  if (Node.isStringLiteral(expr) || Node.isNoSubstitutionTemplateLiteral(expr)) {
    const value = expr.getLiteralValue();
    const next = renameClassListText(value, maps.class, counters);
    if (next !== value) expr.setLiteralValue(next);
  } else if (Node.isTemplateExpression(expr)) {
    rewriteClassTemplate(expr, maps, counters, dynamicSites, filePath);
  } else if (Node.isConditionalExpression(expr)) {
    visitClassLikeExpr(expr.getWhenTrue(), maps, counters, dynamicSites, filePath);
    visitClassLikeExpr(expr.getWhenFalse(), maps, counters, dynamicSites, filePath);
  } else if (Node.isBinaryExpression(expr) && ['&&', '||', '??'].includes(expr.getOperatorToken().getText())) {
    visitClassLikeExpr(expr.getRight(), maps, counters, dynamicSites, filePath);
  } else if (Node.isParenthesizedExpression(expr)) {
    visitClassLikeExpr(expr.getExpression(), maps, counters, dynamicSites, filePath);
  }
}

function visitClassArg(
  arg: any,
  maps: ClassMaps,
  counters: Counters,
  dynamicSites: DynamicSite[],
  filePath: string,
): void {
  if (Node.isObjectLiteralExpression(arg)) {
    for (const property of arg.getProperties()) {
      if (!Node.isPropertyAssignment(property)) continue;
      const nameNode = property.getNameNode();
      if (Node.isStringLiteral(nameNode)) {
        const value = nameNode.getLiteralValue();
        const next = renameClassListText(value, maps.class, counters);
        if (next !== value) nameNode.setLiteralValue(next);
      } else if (Node.isIdentifier(nameNode)) {
        const next = maps.class.get(nameNode.getText());
        if (next) {
          bump(counters.class, nameNode.getText(), counters);
          nameNode.replaceWithText(next);
        }
      }
    }
  } else if (Node.isArrayLiteralExpression(arg)) {
    for (const element of arg.getElements()) visitClassArg(element, maps, counters, dynamicSites, filePath);
  } else {
    visitClassLikeExpr(arg, maps, counters, dynamicSites, filePath);
  }
}

function toCamel(kebab: string): string {
  return kebab
    .split('-')
    .filter(Boolean)
    .map((segment, index) => (index === 0 ? segment : segment[0].toUpperCase() + segment.slice(1)))
    .join('');
}

function renameJsxAttributes(
  sourceFile: any,
  maps: ClassMaps,
  counters: Counters,
  dynamicSites: DynamicSite[],
  filePath: string,
): void {
  for (const attr of sourceFile.getDescendantsOfKind(SyntaxKind.JsxAttribute)) {
    const attrName = attr.getNameNode().getText();
    const init = attr.getInitializer();
    if (attrName === 'className' || attrName === 'class') {
      if (!init) continue;
      if (Node.isStringLiteral(init)) {
        const value = init.getLiteralValue();
        const next = renameClassListText(value, maps.class, counters);
        if (next !== value) init.setLiteralValue(next);
      } else if (Node.isJsxExpression(init)) {
        visitClassLikeExpr(init.getExpression(), maps, counters, dynamicSites, filePath);
      }
    } else if (attrName === 'style' && init && Node.isJsxExpression(init)) {
      const expr = init.getExpression();
      if (expr && Node.isObjectLiteralExpression(expr)) {
        for (const property of expr.getProperties()) {
          if (!Node.isPropertyAssignment(property)) continue;
          const nameNode = property.getNameNode();
          const keyText = Node.isStringLiteral(nameNode) ? nameNode.getLiteralValue() : nameNode.getText();
          if (!keyText.startsWith('--')) continue;
          const next = maps.var.get(keyText);
          if (!next) continue;
          bump(counters.var, keyText, counters);
          if (Node.isStringLiteral(nameNode)) nameNode.setLiteralValue(next);
          else nameNode.replaceWithText(next);
        }
      }
    } else if (attrName.startsWith('data-')) {
      const bareNew = maps.dataAttrBare.get(attrName);
      if (!init) {
        if (bareNew) {
          attr.getNameNode().replaceWithText(bareNew);
          bump(counters.dataAttrBare, attrName, counters);
        }
        continue;
      }
      if (Node.isStringLiteral(init)) {
        const value = init.getLiteralValue();
        const mapped = mapDataAttrOccurrence(attrName, value, maps, counters);
        if (mapped.name !== attrName) attr.getNameNode().replaceWithText(mapped.name);
        if (mapped.value !== undefined && mapped.value !== value) init.setLiteralValue(mapped.value);
        continue;
      }
      if (!Node.isJsxExpression(init)) continue;
      const expr = init.getExpression();
      if (!expr) continue;
      if (Node.isStringLiteral(expr) || Node.isNoSubstitutionTemplateLiteral(expr)) {
        const value = expr.getLiteralValue();
        const mapped = mapDataAttrOccurrence(attrName, value, maps, counters);
        if (mapped.name !== attrName) attr.getNameNode().replaceWithText(mapped.name);
        if (mapped.value !== undefined && mapped.value !== value) expr.setLiteralValue(mapped.value);
      } else if (Node.isConditionalExpression(expr)) {
        if (bareNew) {
          attr.getNameNode().replaceWithText(bareNew);
          bump(counters.dataAttrBare, attrName, counters);
        }
        for (const branch of [expr.getWhenTrue(), expr.getWhenFalse()]) {
          if (!Node.isStringLiteral(branch) && !Node.isNoSubstitutionTemplateLiteral(branch)) continue;
          const value = branch.getLiteralValue();
          const mapped = mapDataAttrOccurrence(attrName, value, maps, counters);
          if (mapped.value !== undefined && mapped.value !== value) branch.setLiteralValue(mapped.value);
        }
      } else if (bareNew) {
        attr.getNameNode().replaceWithText(bareNew);
        bump(counters.dataAttrBare, attrName, counters);
      }
    }
  }
}

function renameCalls(
  sourceFile: any,
  maps: ClassMaps,
  counters: Counters,
  dynamicSites: DynamicSite[],
  filePath: string,
): void {
  for (const call of sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    const calleeText = call.getExpression().getText();
    if (/(?:^|\.)(?:clsx|cn|classNames)$/.test(calleeText)) {
      for (const arg of call.getArguments()) visitClassArg(arg, maps, counters, dynamicSites, filePath);
    } else if (/\.classList\.(?:add|remove|toggle|contains)$/.test(calleeText)) {
      for (const arg of call.getArguments()) visitClassLikeExpr(arg, maps, counters, dynamicSites, filePath);
    } else if (/(?:^|\.)(?:querySelector|querySelectorAll|closest|matches)$/.test(calleeText)) {
      const arg = call.getArguments()[0];
      if (arg && (Node.isStringLiteral(arg) || Node.isNoSubstitutionTemplateLiteral(arg))) {
        const value = arg.getLiteralValue();
        const next = renameSelectorText(value, maps, counters);
        if (next !== value) arg.setLiteralValue(next);
      }
    } else if (/\.(?:setProperty|getPropertyValue|removeProperty)$/.test(calleeText)) {
      const arg = call.getArguments()[0];
      if (arg && Node.isStringLiteral(arg)) {
        const value = arg.getLiteralValue();
        const next = maps.var.get(value);
        if (next) {
          bump(counters.var, value, counters);
          arg.setLiteralValue(next);
        }
      }
    } else if (/\.(?:getAttribute|setAttribute|hasAttribute|removeAttribute)$/.test(calleeText)) {
      const args = call.getArguments();
      const first = args[0];
      if (!first || !Node.isStringLiteral(first) || !first.getLiteralValue().startsWith('data-')) continue;
      const name = first.getLiteralValue();
      const valueArg = args[1];
      const rawValue = valueArg && Node.isStringLiteral(valueArg) ? valueArg.getLiteralValue() : undefined;
      const mapped = mapDataAttrOccurrence(name, rawValue, maps, counters);
      if (mapped.name !== name) first.setLiteralValue(mapped.name);
      if (valueArg && Node.isStringLiteral(valueArg) && mapped.value !== undefined && mapped.value !== rawValue)
        valueArg.setLiteralValue(mapped.value);
    }
  }
}

function renameDataset(sourceFile: any, maps: ClassMaps, counters: Counters): void {
  if (maps.dataAttrBare.size === 0) return;
  for (const access of sourceFile.getDescendantsOfKind(SyntaxKind.PropertyAccessExpression)) {
    const object = access.getExpression();
    if (!Node.isPropertyAccessExpression(object) || object.getName() !== 'dataset') continue;
    const propName = access.getName();
    for (const [oldName, newName] of maps.dataAttrBare) {
      if (toCamel(oldName.replace(/^data-/, '')) !== propName) continue;
      access.getNameNode().replaceWithText(toCamel(newName.replace(/^data-/, '')));
      bump(counters.dataAttrBare, oldName, counters);
      break;
    }
  }
}

function renameTsSourceFile(
  sourceFile: any,
  maps: ClassMaps,
  counters: Counters,
  dynamicSites: DynamicSite[],
  filePath: string,
): void {
  renameJsxAttributes(sourceFile, maps, counters, dynamicSites, filePath);
  renameCalls(sourceFile, maps, counters, dynamicSites, filePath);
  renameDataset(sourceFile, maps, counters);
}

// -------- orchestration --------

export function renameCss(options: RenameCssOptions): RenameCssResult {
  const root = fs.realpathSync.native(path.resolve(options.root ?? '.'));
  const allRows = readMap(options.mapDir, { kinds: ['css-class', 'css-var', 'data-attr'] });
  const rows = allRows.filter(
    (row) =>
      row.status === 'approved' &&
      (!options.scopes || options.scopes.includes('all') || options.scopes.includes(row.scope)),
  );
  const maps = buildMaps(rows);
  const counters = newCounters();
  const dynamicSites: DynamicSite[] = [];
  const perFile: Record<string, number> = {};
  const files = trackedFiles(root);

  for (const file of files) {
    const isCss = /\.css$/.test(file);
    const isHtml = /\.html?$/.test(file);
    if (!isCss && !isHtml) continue;
    const fullPath = path.join(root, file);
    const original = fs.readFileSync(fullPath, 'utf8');
    const before = counters.total;
    const next = isCss ? renameCssText(original, maps, counters) : renameHtmlText(original, maps, counters);
    const delta = counters.total - before;
    if (delta > 0) {
      perFile[file] = delta;
      if (!options.dryRun && next !== original) fs.writeFileSync(fullPath, next, 'utf8');
    }
  }

  const project = loadWorkspaceProject(root);
  for (const sourceFile of project.getSourceFiles()) {
    const filePath = normalize(path.relative(root, sourceFile.getFilePath()));
    const before = counters.total;
    renameTsSourceFile(sourceFile, maps, counters, dynamicSites, filePath);
    const delta = counters.total - before;
    if (delta > 0) perFile[filePath] = (perFile[filePath] ?? 0) + delta;
  }
  if (!options.dryRun) project.saveSync();

  const unmatchedIds = rows
    .filter((row) => {
      if (row.kind === 'css-class') return !(counters.class.get(row.old) ?? 0);
      if (row.kind === 'css-var') return !(counters.var.get(row.old) ?? 0);
      if (row.old.includes('=')) return !(counters.dataAttrValue.get(row.old) ?? 0);
      return !(counters.dataAttrBare.get(row.old) ?? 0);
    })
    .map((row) => row.id);

  let dynamicReport: string | undefined;
  let unmatchedReport: string | undefined;
  if (!options.dryRun) {
    const applied = rows.filter((row) => !unmatchedIds.includes(row.id));
    for (const row of applied) row.status = 'applied';
    writeMap(options.mapDir, applied);
    const reportsDir = path.join(path.dirname(options.mapDir), 'reports');
    fs.mkdirSync(reportsDir, { recursive: true });
    const timestamp = new Date().toISOString().replaceAll(':', '-');
    dynamicReport = path.join(reportsDir, `css-dynamic-${timestamp}.csv`);
    fs.writeFileSync(
      dynamicReport,
      toCsv([['file', 'line', 'snippet'], ...dynamicSites.map((site) => [site.file, String(site.line), site.snippet])]),
      'utf8',
    );
    unmatchedReport = path.join(reportsDir, `css-unmatched-${timestamp}.csv`);
    fs.writeFileSync(
      unmatchedReport,
      toCsv([
        [...MAP_COLUMNS],
        ...rows.filter((row) => unmatchedIds.includes(row.id)).map((row) => MAP_COLUMNS.map((column) => row[column])),
      ]),
      'utf8',
    );
  }

  const filesChanged = Object.keys(perFile).length;
  options.log?.(
    `files changed=${filesChanged} replacements=${counters.total} unmatched=${unmatchedIds.length} dynamic=${dynamicSites.length}`,
  );
  return {
    filesChanged,
    perFile,
    totalReplacements: counters.total,
    unmatchedIds,
    dynamicSites,
    dynamicReport,
    unmatchedReport,
  };
}

function list(value: string | undefined): string[] | undefined {
  return value
    ?.split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}
function parseArgs(argv: string[]): RenameCssOptions {
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
    dryRun: values.get('dry-run') === 'true',
    log: console.log,
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    await renameCss(parseArgs(process.argv.slice(2)));
  } catch (caught) {
    const error = caught as Error & { exitCode?: number };
    console.error(error.message);
    process.exitCode = error.exitCode ?? 1;
  }
}
