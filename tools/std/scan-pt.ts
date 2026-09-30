import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import ts from 'typescript';
import { buildExtraLexicon, isPtComment, isPtToken, lexiconHash, splitIdentifier } from './pt-detect.ts';

const STD = '.planning/phases/01-padronizar-linguagem-t-cnica-navega-o-e-renderiza-o/std';
const DEFAULT_EXCEPTIONS = `${STD}/exceptions.csv`;
const CODE_EXTENSIONS = new Set(['.ts', '.tsx', '.mts', '.mjs', '.js']);
const STRUCTURED_EXTENSIONS = new Set(['.yml', '.yaml', '.sh']);
const SQL_CALLS = new Set([
  'pgTable', 'pgEnum', 'text', 'varchar', 'integer', 'bigint', 'boolean', 'timestamp',
  'jsonb', 'uuid', 'numeric', 'index', 'uniqueIndex', 'primaryKey',
]);
const ROUTE_DECORATORS = new Set([
  'Controller', 'Get', 'Post', 'Put', 'Patch', 'Delete', 'All', 'Head', 'Options',
]);
const TECHNICAL_CALLS = new Set([
  'app.use', 'useLeitura', 'api.get', 'api.post', 'api.put', 'api.patch', 'api.delete',
  'fetch', 'invalidateQueries', 'navigate', 'redirect', 'Queue', 'Worker', 'QueueEvents',
  'upsertJobScheduler', 'removeJobScheduler', 'describe', 'it', 'test', 'suite',
  'localStorage.getItem', 'localStorage.setItem', 'localStorage.removeItem',
  'sessionStorage.getItem', 'sessionStorage.setItem', 'sessionStorage.removeItem',
  'cookies.get', 'res.cookie', 'clearCookie',
]);

type CsvRow = Record<string, string>;
type Finding = {
  file: string;
  line: number;
  kind: string;
  token: string;
  raw: string;
  snippet: string;
  category: string;
  exception_ref: string;
  exceptionIndex?: number;
  productText?: boolean;
};
type ExceptionRow = CsvRow & { index: number };

function usage(): void {
  console.log(`Usage: node tools/std/scan-pt.ts --out <csv> [options]

Options:
  --summary <md>          Write the Markdown summary
  --map <dir>             Build the extra lexicon from map CSVs
  --lexicon-file <txt>    Replace the map-derived lexicon with this file
  --write-lexicon <txt>   Write the sorted lexicon used by this run
  --exceptions <csv>      Exceptions file (default: ${DEFAULT_EXCEPTIONS})
  --ddl <sql>             DDL names for @ddl (default: ${STD}/ddl-before.sql)
  --fail-on-unclassified  Exit 1 when unclassified findings remain
  --help                   Show this help`);
}

function parseArgs(argv: string[]): Record<string, string | boolean> {
  const args: Record<string, string | boolean> = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg?.startsWith('--')) throw new Error(`Unexpected argument: ${arg}`);
    const key = arg.slice(2);
    if (key === 'help' || key === 'fail-on-unclassified') args[key] = true;
    else {
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) throw new Error(`Missing value for ${arg}`);
      args[key] = value;
      index += 1;
    }
  }
  return args;
}

function parseCsv(text: string): CsvRow[] {
  const records: string[][] = [];
  const recordLines: number[] = [];
  let line = 1;
  let recordLine = 1;
  let record: string[] = [];
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
      record.push(field);
      field = '';
    } else if (char === '\n') {
      record.push(field.replace(/\r$/, ''));
      if (record.some(Boolean)) {
        records.push(record);
        recordLines.push(recordLine);
      }
      record = [];
      field = '';
      recordLine = line + 1;
    } else field += char;
    if (char === '\n') line += 1;
  }
  if (field || record.length) {
    record.push(field.replace(/\r$/, ''));
    records.push(record);
    recordLines.push(recordLine);
  }
  const headers = records.shift() ?? [];
  recordLines.shift();
  return records.map((values, index) => ({
    ...Object.fromEntries(headers.map((header, i) => [header, values[i] ?? ''])),
    csvLine: String(recordLines[index]),
  }));
}

function csvCell(value: unknown): string {
  const text = String(value ?? '');
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function csv(headers: string[], rows: Record<string, unknown>[]): string {
  return `${headers.join(',')}\n${rows.map((row) => headers.map((header) => csvCell(row[header])).join(',')).join('\n')}\n`;
}

function normalize(file: string): string {
  return file.replaceAll('\\', '/').replace(/^\.\//, '');
}

function excluded(file: string): boolean {
  const normalized = normalize(file);
  return normalized === 'pnpm-lock.yaml' || normalized.startsWith('.planning/') ||
    normalized.startsWith('referencias-blip/') || normalized.startsWith('tools/std/fixtures/') ||
    normalized.includes('/dist/') || normalized.includes('/node_modules/');
}

function trackedFiles(): string[] {
  return execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' })
    .split('\0').filter(Boolean).map(normalize).filter((file) => !excluded(file));
}

function lineSnippet(text: string, position: number): { line: number; snippet: string } {
  const before = text.slice(0, position);
  const line = before.split('\n').length;
  const start = before.lastIndexOf('\n') + 1;
  const end = text.indexOf('\n', position);
  return { line, snippet: text.slice(start, end < 0 ? undefined : end).trim().slice(0, 120) };
}

function scriptKind(file: string): ts.ScriptKind {
  if (file.endsWith('.tsx')) return ts.ScriptKind.TSX;
  if (file.endsWith('.js') || file.endsWith('.mjs')) return ts.ScriptKind.JS;
  return ts.ScriptKind.TS;
}

function isDeclarationIdentifier(node: ts.Identifier): boolean {
  const parent = node.parent;
  if (!parent || parent.name !== node) return false;
  return ts.isFunctionDeclaration(parent) || ts.isClassDeclaration(parent) ||
    ts.isInterfaceDeclaration(parent) || ts.isTypeAliasDeclaration(parent) ||
    ts.isEnumDeclaration(parent) || ts.isEnumMember(parent) || ts.isVariableDeclaration(parent) ||
    ts.isParameter(parent) || ts.isMethodDeclaration(parent) || ts.isPropertyDeclaration(parent) ||
    ts.isPropertySignature(parent) || ts.isMethodSignature(parent) || ts.isImportSpecifier(parent) ||
    ts.isImportClause(parent) || ts.isNamespaceImport(parent) || ts.isBindingElement(parent) ||
    ts.isPropertyAssignment(parent) || ts.isShorthandPropertyAssignment(parent) ||
    ts.isGetAccessorDeclaration(parent) || ts.isSetAccessorDeclaration(parent);
}

function stringValue(node: ts.Node | undefined): string | undefined {
  if (!node) return undefined;
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  if (ts.isTemplateExpression(node)) {
    return [node.head.text, ...node.templateSpans.map((span) => span.literal.text)].join(' ');
  }
  return undefined;
}

function callName(expression: ts.Expression): string {
  if (ts.isIdentifier(expression)) return expression.text;
  if (ts.isCallExpression(expression)) return callName(expression.expression);
  if (ts.isPropertyAccessExpression(expression)) return `${callName(expression.expression)}.${expression.name.text}`;
  return '';
}

function isConstContext(node: ts.Node): boolean {
  for (let current: ts.Node | undefined = node.parent; current; current = current.parent) {
    if (ts.isAsExpression(current) && current.type.getText() === 'const') return true;
    if (!ts.isArrayLiteralExpression(current) && !ts.isObjectLiteralExpression(current) &&
        !ts.isPropertyAssignment(current) && !ts.isAsExpression(current)) break;
  }
  return false;
}

function isProductContext(node: ts.Node): boolean {
  if (!ts.isStringLiteral(node) && !ts.isNoSubstitutionTemplateLiteral(node)) return false;
  for (let current: ts.Node | undefined = node.parent; current; current = current.parent) {
    if (ts.isBlock(current) || ts.isSourceFile(current)) break;
    if (ts.isTaggedTemplateExpression(current) || ts.isJsxAttribute(current)) return false;
    if (ts.isCallExpression(current) || ts.isNewExpression(current)) {
      const name = callName(current.expression);
      if (name !== 'ErroPipe' && !name.startsWith('ErroPipe.')) return false;
    }
    if (ts.isPropertyAssignment(current) || ts.isVariableDeclaration(current)) {
      const name = current.name.getText().replace(/^['"]|['"]$/g, '');
      if (/(COOKIE|SESSAO)/i.test(name) || /^(className|class|classList|path|to|href|url|sql|query|key|name|id|type|code|event|queue)$/i.test(name)) return false;
    }
  }
  return true;
}

function isProductText(value: string): boolean {
  const text = value.trim();
  if (/\s--[a-z-]+\b|^(?:docker|pnpm|npm|git|terraform|node|curl)\s/i.test(text)) return false;
  if (/^(?:select|insert|update|delete|create|alter|drop|with|truncate|grant|revoke)\s/i.test(text)) return false;
  if (/\$\{|[/\\_{}<>]|\b(?:select|insert|update|delete|create|alter|drop|with)\b[\s\S]*\b(?:from|into|set|table|as|index|where)\b/i.test(text)) return false;
  if (/\p{Ll}\p{Lu}/u.test(text) || /\b[\p{L}\d]+[-.:][\p{L}\d]+\b/u.test(text)) return false;
  return /\p{L}\s+\p{L}/u.test(text) || (/^\p{L}+$/u.test(text) && /[ãõçáéíóúâêôà]/i.test(text));
}

function sqlParts(template: ts.TemplateLiteral): { value: string; identifier: boolean; interpolation?: boolean }[] {
  const parts: ReturnType<typeof sqlParts> = [];
  const addText = (text: string): void => {
    for (const match of text.matchAll(/--[^\n]*|\/\*[\s\S]*?\*\/|'(?:''|[^'])*'|"(?:""|[^"])*"|[\p{L}_][\p{L}\p{N}_$]*/gu)) {
      const value = match[0];
      parts.push({ value: value.startsWith('"') ? value.slice(1, -1).replaceAll('""', '"') : value,
        identifier: !/^(?:'|--|\/\*)/.test(value) });
    }
  };
  if (ts.isNoSubstitutionTemplateLiteral(template)) addText(template.text);
  else {
    addText(template.head.text);
    for (const span of template.templateSpans) {
      parts.push({ value: span.expression.getText(), identifier: false, interpolation: true });
      addText(span.literal.text);
    }
  }
  return parts;
}

function inventoryPath(file: string, mapRows: CsvRow[]): string {
  let result = file;
  const rows = mapRows.filter((row) => ['applied', 'verified'].includes(row.status) &&
    ['file', 'dir'].includes(row.kind) && row.old && row.new).reverse();
  for (const row of rows) {
    const oldPath = normalize(row.old);
    const newPath = normalize(row.new);
    if (row.kind === 'file' && result === newPath) result = oldPath;
    if (row.kind === 'dir' && (result === newPath || result.startsWith(`${newPath}/`))) {
      result = `${oldPath}${result.slice(newPath.length)}`;
    }
  }
  return result;
}

function loadMap(dir: string | undefined): CsvRow[] {
  if (!dir || !existsSync(dir)) return [];
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.csv'))
    .flatMap((entry) => parseCsv(readFileSync(path.join(entry.parentPath, entry.name), 'utf8')));
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    usage();
    return;
  }
  if (typeof args.out !== 'string') throw new Error('--out is required');

  const mapRows = loadMap(typeof args.map === 'string' ? args.map : undefined);
  let extra = buildExtraLexicon(mapRows.map((row) => ({ old: row.old ?? '', new: row.new ?? '' })));
  if (typeof args['lexicon-file'] === 'string') {
    extra = new Set(readFileSync(args['lexicon-file'], 'utf8').split(/\r?\n/).map((x) => x.trim()).filter(Boolean));
  }
  if (typeof args['write-lexicon'] === 'string') {
    mkdirSync(path.dirname(args['write-lexicon']), { recursive: true });
    writeFileSync(args['write-lexicon'], `${[...extra].sort().join('\n')}${extra.size ? '\n' : ''}`, 'utf8');
  }

  const exceptionFile = typeof args.exceptions === 'string' ? args.exceptions : DEFAULT_EXCEPTIONS;
  const exceptions: ExceptionRow[] = existsSync(exceptionFile)
    ? parseCsv(readFileSync(exceptionFile, 'utf8')).map((row) => ({ ...row, index: Number(row.csvLine) }))
    : [];
  for (const exception of exceptions) {
    if (exception.pattern.startsWith('@') && !['@ddl', '@quoted-comment', '@product-text'].includes(exception.pattern)) {
      throw new Error(`Unknown exception resolver ${exception.pattern} at ${exceptionFile}:${exception.index}`);
    }
  }
  const ddlNames = new Set(exceptions.some((row) => row.pattern === '@ddl')
    ? [...readFileSync(typeof args.ddl === 'string' ? args.ddl : `${STD}/ddl-before.sql`, 'utf8')
      .replace(/--[^\n]*|\/\*[\s\S]*?\*\/|'(?:''|[^'])*'/g, ' ')
      .matchAll(/"((?:""|[^"])*)"/g)].map((match) => match[1]!.replaceAll('""', '"')) : []);
  const findings: Finding[] = [];
  const seen = new Set<string>();
  const historicalPaths = new Map<string, string>();
  const applicableExceptions = new Map<string, ExceptionRow[]>();

  function shouldScanComment(comment: string): boolean {
    return isPtComment(comment) ||
      (/['"`«]/.test(comment) && splitIdentifier(comment).some((token) => isPtToken(token, extra)));
  }

  function resolve(pattern: string, finding: Finding): boolean {
    if (pattern === '@ddl') {
      if (finding.kind !== 'sql-name') return false;
      return ddlNames.has(finding.raw);
    }
    if (pattern === '@quoted-comment') {
      if (finding.kind !== 'comment') return false;
      let quotedProduct = false;
      let technicalQuote = false;
      const remaining = finding.raw.replace(/(?<![\p{L}\p{N}])'(?:\\[\s\S]|[^'\\])*'|"(?:\\[\s\S]|[^"\\])*"|`(?:\\[\s\S]|[^`\\])*`|«[^»]*»/gu, (quote) => {
        const content = quote.slice(1, -1).replace(/\\(["'`])/g, '$1');
        if (quote.startsWith('`') && !isProductText(content)) technicalQuote = true;
        if (splitIdentifier(content).some((token) => isPtToken(token, extra))) {
          if (isProductText(content)) quotedProduct = true;
          else technicalQuote = true;
        }
        return ' ';
      });
      return quotedProduct && !technicalQuote && !isPtComment(remaining) &&
        !splitIdentifier(remaining).some((token) => isPtToken(token, extra));
    }
    return ['string-literal', 'literal-value'].includes(finding.kind) &&
      !/(?:^|\/)tests\/|\.test\.[cm]?[jt]sx?$|(?:^|\/)seed\//.test(finding.file) &&
      finding.productText === true && isProductText(finding.raw);
  }

  function classify(finding: Finding): Finding {
    const key = `${finding.file}\0${finding.kind}`;
    let applicable = applicableExceptions.get(key);
    if (!applicable) {
      let historical = historicalPaths.get(finding.file);
      if (historical === undefined) {
        historical = inventoryPath(finding.file, mapRows);
        historicalPaths.set(finding.file, historical);
      }
      applicable = exceptions.filter((exception) =>
        (exception.kind === '*' || exception.kind === finding.kind) &&
        (path.matchesGlob(finding.file, exception.glob) || path.matchesGlob(historical!, exception.glob)));
      applicableExceptions.set(key, applicable);
    }
    for (const exception of applicable) {
      if (finding.kind === 'identifier' && exception.category === 'A') continue;
      const target = finding.kind === 'comment' ? finding.snippet : finding.raw;
      let matches = false;
      try {
        matches = exception.pattern.startsWith('@') ? resolve(exception.pattern, finding) :
          exception.pattern === '*' || new RegExp(exception.pattern).test(target) ||
          new RegExp(exception.pattern).test(finding.token);
      }
      catch { throw new Error(`Invalid exception regex at ${exceptionFile}:${exception.index}`); }
      if (matches) return { ...finding, category: exception.category, exception_ref: exception.ref, exceptionIndex: exception.index };
    }
    return finding;
  }

  function add(file: string, line: number, kind: string, value: string, snippet: string,
    context: Pick<Finding, 'productText'> = {}): void {
    for (const token of splitIdentifier(value)) {
      if (!isPtToken(token, extra)) continue;
      const finding = classify({ file, line, kind, token, raw: value, snippet: snippet.slice(0, 120), category: '', exception_ref: '', ...context });
      const key = `${finding.file}\0${finding.line}\0${finding.kind}\0${finding.token}\0${finding.snippet}`;
      if (!seen.has(key)) {
        seen.add(key);
        findings.push(finding);
      }
    }
  }

  function addComment(file: string, text: string, position: number, comment: string): void {
    if (!shouldScanComment(comment)) return;
    const info = lineSnippet(text, position);
    const finding = classify({ file, line: info.line, kind: 'comment', token: '', raw: comment, snippet: info.snippet, category: '', exception_ref: '' });
    const key = `${file}\0${info.line}\0comment\0${info.snippet}`;
    if (!seen.has(key)) {
      seen.add(key);
      findings.push(finding);
    }
  }

  function scanCode(file: string, text: string): void {
    const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, scriptKind(file));
    const visit = (node: ts.Node): void => {
      if (ts.isIdentifier(node) && isDeclarationIdentifier(node)) {
        const info = lineSnippet(text, node.getStart(source));
        add(file, info.line, 'identifier', node.text, info.snippet);
      }
      if (ts.isCallExpression(node) || ts.isNewExpression(node)) {
        const name = callName(node.expression);
        const first = node.arguments?.[0];
        const value = stringValue(first);
        if (value !== undefined) {
          const info = lineSnippet(text, first!.getStart(source));
          const baseName = name.split('.').at(-1) ?? name;
          const decorator = ts.isCallExpression(node) && ts.isDecorator(node.parent) && ROUTE_DECORATORS.has(baseName);
          if (SQL_CALLS.has(baseName) && file.startsWith('packages/db/src/schema/')) add(file, info.line, 'sql-name', value, info.snippet);
          else if (decorator || TECHNICAL_CALLS.has(name) || TECHNICAL_CALLS.has(baseName) ||
            name.endsWith('.add') || name.startsWith('ErroPipe.') || name === 'ErroPipe') {
            add(file, info.line, 'string-literal', value, info.snippet, { productText: isProductContext(first!) });
          }
          if (['getAttribute', 'setAttribute', 'hasAttribute', 'removeAttribute'].includes(baseName) && value.startsWith('data-')) {
            add(file, info.line, 'data-attr', value, info.snippet);
            const attributeValue = stringValue(node.arguments?.[1]);
            if (baseName === 'setAttribute' && attributeValue !== undefined) {
              add(file, info.line, 'data-attr', attributeValue, info.snippet);
            }
          }
        }
      }
      if (ts.isTaggedTemplateExpression(node) && node.tag.getText(source) === 'sql') {
        const info = lineSnippet(text, node.template.getStart(source));
        for (const part of sqlParts(node.template)) {
          if (part.identifier) add(file, info.line, 'sql-name', part.value, info.snippet);
          else if (!part.interpolation && part.value.startsWith("'")) {
            add(file, info.line, 'literal-value', part.value.slice(1, -1).replaceAll("''", "'"), info.snippet);
          }
        }
      }
      if ((ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) &&
          ((ts.isLiteralTypeNode(node.parent) && ts.isUnionTypeNode(node.parent.parent)) || isConstContext(node))) {
        const info = lineSnippet(text, node.getStart(source));
        add(file, info.line, 'literal-value', node.text, info.snippet, { productText: isProductContext(node) });
      }
      if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) &&
          /(COOKIE|SESSAO)/i.test(node.name.text)) {
        const value = stringValue(node.initializer);
        if (value !== undefined) {
          const info = lineSnippet(text, node.initializer!.getStart(source));
          add(file, info.line, 'string-literal', value, info.snippet);
        }
      }
      if (ts.isPropertyAssignment(node) && node.name.getText(source) === 'name') {
        const value = stringValue(node.initializer);
        let enclosingNew: ts.Node | undefined = node.parent;
        while (enclosingNew && !ts.isNewExpression(enclosingNew)) enclosingNew = enclosingNew.parent;
        if (value !== undefined && enclosingNew && ts.isNewExpression(enclosingNew) &&
            ['Counter', 'Gauge', 'Histogram', 'Summary'].includes(callName(enclosingNew.expression))) {
          const info = lineSnippet(text, node.initializer.getStart(source));
          add(file, info.line, 'string-literal', value, info.snippet);
        }
      }
      if (ts.isJsxAttribute(node)) {
        const name = node.name.getText(source);
        const value = node.initializer && ts.isStringLiteral(node.initializer)
          ? node.initializer.text
          : node.initializer && ts.isJsxExpression(node.initializer)
            ? stringValue(node.initializer.expression)
            : undefined;
        const info = lineSnippet(text, node.getStart(source));
        if (['path', 'to', 'href', 'className'].includes(name) && value !== undefined) add(file, info.line, 'string-literal', value, info.snippet);
        if (name.startsWith('data-')) {
          add(file, info.line, 'data-attr', name, info.snippet);
          if (value !== undefined) add(file, info.line, 'data-attr', value, info.snippet);
        }
      }
      if (ts.isPropertyAccessExpression(node) && ts.isPropertyAccessExpression(node.expression) &&
          node.expression.name.text === 'dataset') {
        const info = lineSnippet(text, node.name.getStart(source));
        add(file, info.line, 'data-attr', node.name.text, info.snippet);
      }
      ts.forEachChild(node, visit);
    };
    visit(source);

    const scanner = ts.createScanner(ts.ScriptTarget.Latest, false, scriptKind(file) === ts.ScriptKind.TSX ? ts.LanguageVariant.JSX : ts.LanguageVariant.Standard, text);
    for (let token = scanner.scan(); token !== ts.SyntaxKind.EndOfFileToken; token = scanner.scan()) {
      if (token === ts.SyntaxKind.SingleLineCommentTrivia || token === ts.SyntaxKind.MultiLineCommentTrivia) {
        addComment(file, text, scanner.getTokenPos(), scanner.getTokenText());
      }
    }
  }

  function scanCss(file: string, text: string): void {
    for (const match of text.matchAll(/\/\*[\s\S]*?\*\//g)) addComment(file, text, match.index, match[0]);
    for (const match of text.matchAll(/\.(-?[_a-zA-Z]+[_a-zA-Z0-9-]*)/g)) {
      const info = lineSnippet(text, match.index);
      add(file, info.line, 'css-class', match[1]!, info.snippet);
    }
    for (const match of text.matchAll(/--([_a-zA-Z]+[_a-zA-Z0-9-]*)/g)) {
      const info = lineSnippet(text, match.index);
      add(file, info.line, 'css-custom-property', match[1]!, info.snippet);
    }
    for (const match of text.matchAll(/\[(data-[\w-]+)(?:\s*[~|^$*]?=\s*["']([^"']+)["'])?\]/g)) {
      const info = lineSnippet(text, match.index);
      add(file, info.line, 'data-attr', match[1]!, info.snippet);
      if (match[2]) add(file, info.line, 'data-attr', match[2], info.snippet);
    }
  }

  function scanStructured(file: string, text: string): void {
    text.split(/\r?\n/).forEach((lineText, index) => {
      const trimmed = lineText.trim();
      if (trimmed.startsWith('#')) {
        if (shouldScanComment(trimmed)) {
          const finding = classify({ file, line: index + 1, kind: 'comment', token: '', raw: trimmed, snippet: trimmed.slice(0, 120), category: '', exception_ref: '' });
          findings.push(finding);
        }
        return;
      }
      for (const word of lineText.match(/[\p{L}\p{N}_./:-]+/gu) ?? []) add(file, index + 1, 'identifier', word, trimmed);
    });
  }

  function scanPackageJson(file: string, text: string): void {
    const data = JSON.parse(text) as { name?: string; scripts?: Record<string, string> };
    if (data.name) add(file, 1, 'package-name', data.name, `"name": "${data.name}"`);
    for (const key of Object.keys(data.scripts ?? {})) add(file, 1, 'package-script', key, key);
  }

  for (const file of trackedFiles()) {
    for (const segment of file.split('/')) {
      const basename = segment === file.split('/').at(-1) ? segment.replace(/(\.[^.]+)+$/, '') : segment;
      add(file, 1, 'path', basename, file);
    }
    const extension = path.extname(file);
    if (file.endsWith('.md')) continue;
    const text = readFileSync(file, 'utf8');
    if (CODE_EXTENSIONS.has(extension)) scanCode(file, text);
    else if (extension === '.css') scanCss(file, text);
    else if (file.endsWith('package.json')) scanPackageJson(file, text);
    else if (STRUCTURED_EXTENSIONS.has(extension) || path.basename(file) === 'Dockerfile' || path.basename(file) === '.dockerignore') scanStructured(file, text);
  }

  findings.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line || a.kind.localeCompare(b.kind) || a.token.localeCompare(b.token));
  mkdirSync(path.dirname(args.out), { recursive: true });
  writeFileSync(args.out, csv(
    ['file', 'line', 'kind', 'token', 'snippet', 'category', 'exception_ref'], findings,
  ), 'utf8');

  const unclassified = findings.filter((finding) => !finding.category).length;
  if (typeof args.summary === 'string') {
    const byKind = new Map<string, number>();
    const byCategory = new Map<string, number>();
    const byException = new Map<number, number>();
    for (const finding of findings) {
      byKind.set(finding.kind, (byKind.get(finding.kind) ?? 0) + 1);
      if (finding.category) byCategory.set(finding.category, (byCategory.get(finding.category) ?? 0) + 1);
      if (finding.exceptionIndex) byException.set(finding.exceptionIndex, (byException.get(finding.exceptionIndex) ?? 0) + 1);
    }
    const lines = [
      '# Baseline STD-11', '', `Total: ${findings.length}`, `Unclassified: ${unclassified}`,
      `Lexicon: ${extra.size ? lexiconHash(extra) : 'none'}`, '', '## Findings by kind', '',
      '| Kind | Count |', '|---|---:|',
      ...[...byKind].sort().map(([kind, count]) => `| ${kind} | ${count} |`),
      '', '## Classified by category', '', '| Category | Count |', '|---|---:|',
      ...['A', 'B', 'C'].map((category) => `| ${category} | ${byCategory.get(category) ?? 0} |`),
      '', '## Matches by exception row', '', '| Row | Matches | Ref |', '|---:|---:|---|',
      ...[...byException].sort((a, b) => a[0] - b[0]).map(([row, count]) => `| ${row} | ${count} | ${exceptions.find((x) => x.index === row)?.ref ?? ''} |`),
      '',
    ];
    mkdirSync(path.dirname(args.summary), { recursive: true });
    writeFileSync(args.summary, lines.join('\n'), 'utf8');
  }
  console.log(`findings=${findings.length} unclassified=${unclassified} lexicon=${extra.size ? lexiconHash(extra) : 'none'}`);
  if (args['fail-on-unclassified'] && unclassified > 0) process.exitCode = 1;
}

try { main(); }
catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 2;
}
