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

/** A React Router `<Route path="...">` pattern, built by joining nested `<Route>` elements. */
export interface FrontRouteInfo {
  path: string;
  /** Only reachable through `LegacyRedirect`/`LegacyContactRedirect`/`Navigate` — a link that
   * only matches a legacy route still counts as dangling: an internal link cannot depend on a
   * redirect. */
  legacy: boolean;
  file: string;
  line: number;
}

/** A reference to a front route found in `href`/`to`/`navigate`/`navegar`/`rota:`/path-builder calls. */
export interface FrontConsumerInfo {
  file: string;
  line: number;
  raw: string;
  normalized: string;
  /** The matched route pattern, or `'dangling'` when no non-legacy route matches. */
  match: string;
  dangling: boolean;
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

const LEGACY_ELEMENT_NAMES = new Set(['LegacyRedirect', 'LegacyContactRedirect', 'Navigate']);
const EXTERNAL_PREFIXES = ['http://', 'https://', 'mailto:', 'data:', 'tel:', '#'];

function isExternalPath(raw: string): boolean {
  return EXTERNAL_PREFIXES.some((prefix) => raw.startsWith(prefix));
}

function normalizeFrontRoutePath(raw: string): string {
  let value = raw.trim().replace(/\/{2,}/g, '/');
  if (!value.startsWith('/')) value = `/${value}`;
  if (value.length > 1) value = value.replace(/\/+$/, '');
  return value;
}

function jsxTagName(name: ts.JsxTagNameExpression, sourceFile: ts.SourceFile): string {
  return ts.isIdentifier(name) ? name.text : name.getText(sourceFile);
}

type JsxElementLike = ts.JsxElement | ts.JsxSelfClosingElement;

function isRouteElement(node: ts.Node, sourceFile: ts.SourceFile): node is JsxElementLike {
  if (ts.isJsxSelfClosingElement(node)) return jsxTagName(node.tagName, sourceFile) === 'Route';
  if (ts.isJsxElement(node)) return jsxTagName(node.openingElement.tagName, sourceFile) === 'Route';
  return false;
}

function jsxAttributesOf(node: JsxElementLike): ts.JsxAttributes {
  return ts.isJsxSelfClosingElement(node) ? node.attributes : node.openingElement.attributes;
}

function jsxAttribute(node: JsxElementLike, name: string, sourceFile: ts.SourceFile): ts.JsxAttribute | undefined {
  return jsxAttributesOf(node).properties.find(
    (property): property is ts.JsxAttribute =>
      ts.isJsxAttribute(property) && property.name.getText(sourceFile) === name,
  );
}

function jsxAttributeExpression(attribute: ts.JsxAttribute): ts.Expression | undefined {
  if (!attribute.initializer) return undefined;
  if (ts.isStringLiteral(attribute.initializer)) return attribute.initializer;
  if (ts.isJsxExpression(attribute.initializer)) return attribute.initializer.expression ?? undefined;
  return undefined;
}

function routePathAttribute(node: JsxElementLike, sourceFile: ts.SourceFile): string | undefined {
  const attribute = jsxAttribute(node, 'path', sourceFile);
  if (!attribute) return undefined;
  const value = jsxAttributeExpression(attribute);
  if (!value || !isPathLiteral(value)) return undefined;
  return literalValue(value, sourceFile);
}

function isLegacyRoute(node: JsxElementLike, sourceFile: ts.SourceFile): boolean {
  const attribute = jsxAttribute(node, 'element', sourceFile);
  if (!attribute) return false;
  const value = jsxAttributeExpression(attribute);
  if (!value) return false;
  if (ts.isJsxSelfClosingElement(value)) return LEGACY_ELEMENT_NAMES.has(jsxTagName(value.tagName, sourceFile));
  if (ts.isJsxElement(value)) {
    return LEGACY_ELEMENT_NAMES.has(jsxTagName(value.openingElement.tagName, sourceFile));
  }
  return false;
}

/** Local `const NAME = (<>...</>)` JSX fragments/elements, so a `<Route>{name}</Route>` child
 * mounted through a variable (as `App.tsx` does for `contactRoutes`) still walks into it. */
function collectJsxVariables(sourceFile: ts.SourceFile): Map<string, ts.Node> {
  const variables = new Map<string, ts.Node>();
  const visit = (node: ts.Node): void => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
      let initializer: ts.Node = node.initializer;
      while (ts.isParenthesizedExpression(initializer)) initializer = initializer.expression;
      if (ts.isJsxElement(initializer) || ts.isJsxSelfClosingElement(initializer) || ts.isJsxFragment(initializer)) {
        variables.set(node.name.text, initializer);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return variables;
}

/**
 * Parses nested `<Route path="...">` JSX (React Router) into full path patterns, one entry per
 * `<Route>` node (both an intermediate node and its leaves are matchable addresses). A route
 * whose `element` is `LegacyRedirect`/`LegacyContactRedirect`/`Navigate` is `legacy: true`.
 */
export function collectFrontRoutes(files: SourceInput[]): FrontRouteInfo[] {
  const routes: FrontRouteInfo[] = [];
  for (const input of files) {
    const sourceFile = toSourceFile(input);
    const jsxVariables = collectJsxVariables(sourceFile);
    const visit = (node: ts.Node, prefix: string): void => {
      if (isRouteElement(node, sourceFile)) {
        const pathValue = routePathAttribute(node, sourceFile);
        const nextPrefix =
          pathValue === undefined
            ? prefix
            : normalizeFrontRoutePath(pathValue.startsWith('/') ? pathValue : `${prefix}/${pathValue}`);
        if (pathValue !== undefined) {
          routes.push({
            path: nextPrefix,
            legacy: isLegacyRoute(node, sourceFile),
            file: normalizeFileName(sourceFile.fileName),
            line: sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1,
          });
        }
        ts.forEachChild(node, (child) => visit(child, nextPrefix));
        return;
      }
      if (ts.isJsxExpression(node) && node.expression && ts.isIdentifier(node.expression)) {
        const mapped = jsxVariables.get(node.expression.text);
        if (mapped) {
          visit(mapped, prefix);
          return;
        }
      }
      ts.forEachChild(node, (child) => visit(child, prefix));
    };
    visit(sourceFile, '');
  }
  return routes.sort((left, right) =>
    `${left.path}\0${left.file}\0${left.line}`.localeCompare(`${right.path}\0${right.file}\0${right.line}`),
  );
}

function frontSegmentMatches(candidateSegment: string, routeSegment: string | undefined): boolean {
  return (
    candidateSegment === routeSegment || candidateSegment === ':*' || (routeSegment?.startsWith(':') ?? false)
  );
}

/**
 * A candidate whose FIRST segment is `:*` came from a template whose leading interpolation is
 * the base path (e.g. `` `${attendanceBase(contact)}/queue-management` ``): the runtime value of
 * that base cannot be resolved statically. Match it as a SUFFIX against any route's trailing
 * segments instead of requiring an exact segment count, so a real relative addition (like
 * `/queue-management`) is not flagged just because its dynamic prefix is opaque here.
 */
function findFrontRouteMatches(normalizedCandidate: string, routes: FrontRouteInfo[]): FrontRouteInfo[] {
  const candidateSegments = segments(normalizedCandidate);
  if (candidateSegments[0] === ':*' && candidateSegments.length > 1) {
    const suffix = candidateSegments.slice(1);
    return routes.filter((route) => {
      const routeSegments = segments(route.path);
      if (suffix.length > routeSegments.length) return false;
      const tail = routeSegments.slice(-suffix.length);
      return tail.every((segment, index) => frontSegmentMatches(suffix[index] ?? '', segment));
    });
  }
  return routes.filter((route) => {
    const routeSegments = segments(route.path);
    return (
      candidateSegments.length === routeSegments.length &&
      candidateSegments.every((segment, index) => frontSegmentMatches(segment, routeSegments[index]))
    );
  });
}

function compareFrontOccurrence(left: FrontConsumerInfo, right: FrontConsumerInfo): number {
  return `${left.file}\0${left.line}\0${left.raw}`.localeCompare(`${right.file}\0${right.line}\0${right.raw}`);
}

function addFrontOccurrence(
  results: FrontConsumerInfo[],
  seen: Set<string>,
  sourceFile: ts.SourceFile,
  node: ts.Node,
  raw: string,
  routes: FrontRouteInfo[],
): void {
  if (isExternalPath(raw)) return;
  // A relative value (no leading slash, e.g. `to="monitoring"` inside a nested <Route>) resolves
  // against React Router's current-route context, which this static scan does not model; treat
  // it as unmatchable rather than a false dangling report. An empty value (from a template that
  // resolves to nothing statically, e.g. a conditional href) is skipped the same way.
  if (!raw.startsWith('/')) return;
  const file = normalizeFileName(sourceFile.fileName);
  const line = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
  const key = `${file}\0${line}\0${raw}`;
  if (seen.has(key)) return;
  seen.add(key);
  const normalized = normalizePath(raw);
  // `/v1/...` is an API endpoint (e.g. a file-download `<a href>`), never a front route.
  if (normalized.startsWith('/v1')) return;
  const candidateSegments = segments(normalized);
  if (candidateSegments[0] === ':*' && candidateSegments.length === 1) {
    // Just a dynamic base with nothing appended (e.g. `href={someUrl}`): unresolvable statically,
    // assumed valid rather than reported as a false dangling link.
    results.push({ file, line, raw, normalized, match: 'dynamic-base', dangling: false });
    return;
  }
  const matches = findFrontRouteMatches(normalized, routes);
  const dangling = matches.length === 0 || matches.every((route) => route.legacy);
  const matched = matches.find((route) => !route.legacy) ?? matches[0];
  results.push({ file, line, raw, normalized, match: dangling ? 'dangling' : (matched?.path ?? 'dangling'), dangling });
}

function propertyAssignmentName(node: ts.PropertyAssignment, sourceFile: ts.SourceFile): string | undefined {
  if (ts.isIdentifier(node.name)) return node.name.text;
  if (ts.isStringLiteralLike(node.name)) return node.name.text;
  return node.name.getText(sourceFile);
}

/**
 * Scans `src/**` of a front app for `href="/x"`, `to="/x"` (covers `<Navigate to="/x">` and
 * `<Link to="/x">` alike), `navigate('/x')`, `navegar('/x')`, `rota: '/x'`, template literals
 * with an interpolated segment (matches `:param`), and calls to a registered path-builder
 * (`--builder name=pattern`: the call's string-literal arguments are appended to `pattern`).
 * An external path (`https://`, `mailto:`, `#`) is ignored.
 */
export function collectFrontConsumers(
  files: SourceInput[],
  routes: FrontRouteInfo[],
  builders: ReadonlyMap<string, string>,
): FrontConsumerInfo[] {
  const results: FrontConsumerInfo[] = [];
  const seen = new Set<string>();
  for (const input of files) {
    const sourceFile = toSourceFile(input);
    const visit = (node: ts.Node): void => {
      let raw: string | undefined;
      if (ts.isJsxAttribute(node) && ['href', 'to'].includes(node.name.getText(sourceFile))) {
        const value = jsxAttributeExpression(node);
        if (value && isPathLiteral(value)) raw = literalValue(value, sourceFile);
      } else if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
        const name = node.expression.text;
        const firstArgument = node.arguments[0];
        if ((name === 'navigate' || name === 'navegar') && firstArgument && isPathLiteral(firstArgument)) {
          raw = literalValue(firstArgument, sourceFile);
        } else if (builders.has(name)) {
          const base = builders.get(name) ?? '';
          const literalArguments = node.arguments
            .filter((argument): argument is ts.StringLiteralLike => ts.isStringLiteralLike(argument))
            .map((argument) => argument.text);
          raw = literalArguments.length > 0 ? `${base}/${literalArguments.join('/')}` : base;
        }
      } else if (
        ts.isPropertyAssignment(node) &&
        propertyAssignmentName(node, sourceFile) === 'rota' &&
        isPathLiteral(node.initializer)
      ) {
        raw = literalValue(node.initializer, sourceFile);
      }
      if (raw !== undefined) addFrontOccurrence(results, seen, sourceFile, node, raw, routes);
      ts.forEachChild(node, visit);
    };
    visit(sourceFile);
  }
  return results.sort(compareFrontOccurrence);
}

/**
 * Scans files OUTSIDE a front app (API, other fronts, docs — via `--scan-extra`) for string or
 * template literals that start with one of the front app's own route prefixes (derived from
 * `routes`, so it also catches the legacy `LegacyRedirect` prefixes like `/portal`), skipping
 * import/export specifiers.
 */
export function collectExternalFrontReferences(
  files: SourceInput[],
  routes: FrontRouteInfo[],
): FrontConsumerInfo[] {
  const prefixes = new Set(routes.map((route) => `/${segments(route.path)[0] ?? ''}`));
  const results: FrontConsumerInfo[] = [];
  const seen = new Set<string>();
  for (const input of files) {
    const sourceFile = toSourceFile(input);
    const visit = (node: ts.Node): void => {
      if (isPathLiteral(node) && !isImportLikeLiteral(node)) {
        const raw = literalValue(node, sourceFile);
        if (raw.startsWith('/') && !isExternalPath(raw)) {
          const normalized = normalizePath(raw);
          // The bare root ("/") is every app's own generic "go home" default — not a distinctive
          // enough signal of a Gestão address to check across unrelated apps.
          const firstSegment = `/${segments(normalized)[0] ?? ''}`;
          if (firstSegment !== '/' && prefixes.has(firstSegment)) {
            addFrontOccurrence(results, seen, sourceFile, node, raw, routes);
          }
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(sourceFile);
  }
  return results.sort(compareFrontOccurrence);
}

export function compareRoutes(
  baseline: RouteInfo[],
  current: RouteInfo[],
  renames: RenameRow[],
  persisted: ReadonlySet<string> = new Set(),
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
        translate && !persisted.has(unquote(argument)) ? replaceSymbols(argument, symbolRenames) : argument,
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

function unquote(value: string): string {
  return value.replace(/^['"`]/, '').replace(/['"`]$/, '');
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
  const flow = body.indexOf('/fluxos/');
  const start = v1 >= 0 ? v1 : flow;
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

function readPersistedValues(mapTarget: string): Set<string> {
  const base = fs.existsSync(mapTarget) && fs.statSync(mapTarget).isDirectory()
    ? path.dirname(mapTarget)
    : path.dirname(path.dirname(mapTarget));
  const file = path.join(base, 'persisted.csv');
  if (!fs.existsSync(file)) return new Set();
  const [header = [], ...rows] = parseCsv(fs.readFileSync(file, 'utf8'));
  const oldIndex = header.indexOf('old');
  if (oldIndex < 0) return new Set();
  const decisionIndex = header.indexOf('decision');
  const values = new Set<string>();
  for (const row of rows) {
    if (decisionIndex >= 0 && row[decisionIndex] && row[decisionIndex] !== 'keep') continue;
    const value = row[oldIndex];
    if (value) values.add(value);
  }
  return values;
}

function readAllowlist(file: string | undefined): Set<string> {
  if (!file || !fs.existsSync(file)) return new Set();
  const [header = [], ...rows] = parseCsv(fs.readFileSync(file, 'utf8'));
  const fileIndex = header.indexOf('file');
  const rawIndex = header.indexOf('raw');
  return new Set(rows.map((row) => `${row[fileIndex] ?? ''}\0${row[rawIndex] ?? ''}`));
}

function writeFrontConsumers(file: string, consumers: FrontConsumerInfo[]): void {
  const rows = ['file,line,raw,normalized,match'];
  for (const item of consumers) {
    rows.push([item.file, item.line, item.raw, item.normalized, item.match].map(csvCell).join(','));
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${rows.join('\n')}\n`);
}

function matchesGlob(pattern: string, file: string): boolean {
  if (pattern.endsWith('/**')) {
    const prefix = pattern.slice(0, -3);
    return file === prefix || file.startsWith(`${prefix}/`);
  }
  if (pattern.endsWith('**')) return file.startsWith(pattern.slice(0, -2));
  return file === pattern;
}

/** Repeatable-flag argument parser: every `--flag` collects into a list, so `--front`,
 * `--builder` and `--scan-extra` can each be passed more than once. */
function parseArguments(argv: string[]): Map<string, (string | true)[]> {
  const result = new Map<string, (string | true)[]>();
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (!argument?.startsWith('--')) throw new Error(`Argumento inválido: ${argument}`);
    const list = result.get(argument) ?? [];
    if (argument === '--check') {
      list.push(true);
    } else {
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) throw new Error(`Valor ausente para ${argument}`);
      list.push(value);
      index += 1;
    }
    result.set(argument, list);
  }
  return result;
}

function getAll(args: Map<string, (string | true)[]>, name: string): string[] {
  return (args.get(name) ?? []).filter((value): value is string => typeof value === 'string');
}

function getOne(args: Map<string, (string | true)[]>, name: string): string | undefined {
  return getAll(args, name)[0];
}

function requiredOne(args: Map<string, (string | true)[]>, name: string): string {
  const value = getOne(args, name);
  if (value === undefined) throw new Error(`Argumento obrigatório: ${name}`);
  return value;
}

function printHelp(): void {
  console.log(
    [
      'Uso:',
      '  route-match --emit <json> [--consumers <csv>] [--compare <json> --map <dir>] [--allow <csv>] [--check]',
      '  route-match --front <appDir> [--front <appDir> ...] [--builder nome=padrão ...]',
      '              [--front-consumers <csv>] [--scan-extra <glob> ...] [--allow <csv>]',
      '',
      '  --emit <json>            Grava as rotas da API coletadas em <json>.',
      '  --consumers <csv>        Grava os consumidores de rota da API em <csv>.',
      '  --compare <json>         Compara as rotas atuais contra um baseline.',
      '  --map <dir|csv>          Mapa de rename usado por --compare.',
      '  --allow <csv>            Lista file,raw isenta de falha.',
      '  --check                  Sai com 1 se houver consumidor de API sem rota.',
      '  --front <appDir>         Modo front: lê <Route path> aninhadas em appDir/src (repetível).',
      '  --builder nome=padrão    Mapeia uma chamada de construtor de caminho ao seu padrão de rota (repetível).',
      '  --front-consumers <csv>  Grava os consumidores de rota de front em <csv>.',
      '  --scan-extra <glob>      Varre arquivos fora dos --front por referências às rotas deles (repetível).',
    ].join('\n'),
  );
}

function main(): void {
  const argv = process.argv.slice(2);
  if (argv.includes('--help')) {
    printHelp();
    return;
  }

  const args = parseArguments(argv);
  const trackedFiles = allTrackedFiles();
  const allowlist = readAllowlist(getOne(args, '--allow'));
  let failed = false;

  const emitFile = getOne(args, '--emit');
  const fronts = getAll(args, '--front');
  if (!emitFile && fronts.length === 0) throw new Error('Informe --emit ou --front.');

  let routes: RouteInfo[] = [];
  if (emitFile) {
    const apiFiles = trackedFiles.filter(
      (file) => file.startsWith('apps/api/src/') && file.endsWith('.ts'),
    );
    routes = collectRoutes(apiFiles);
    fs.mkdirSync(path.dirname(emitFile), { recursive: true });
    fs.writeFileSync(emitFile, `${JSON.stringify(routes, null, 2)}\n`);

    const consumerApps = new Set(['desk-vite', 'management-vite', 'crm', 'bridge', 'workers']);
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
    const consumersFile = getOne(args, '--consumers');
    if (consumersFile) writeConsumers(consumersFile, occurrences);

    if (args.has('--compare')) {
      const baseline = JSON.parse(fs.readFileSync(requiredOne(args, '--compare'), 'utf8')) as RouteInfo[];
      const mapTarget = requiredOne(args, '--map');
      const renames = readRenameRows(mapTarget);
      const comparison = compareRoutes(baseline, routes, renames, readPersistedValues(mapTarget));
      if (!comparison.equal) {
        failed = true;
        console.error('ROUTE SET CHANGED');
        for (const difference of comparison.differences) console.error(difference);
      }
    }

    reportApiCheck(args, allowlist, occurrences, routes, () => {
      failed = true;
    });
  }

  if (fronts.length > 0) {
    const builders = new Map<string, string>();
    for (const definition of getAll(args, '--builder')) {
      const separator = definition.indexOf('=');
      if (separator < 0) throw new Error(`--builder inválido (esperado nome=padrão): ${definition}`);
      builders.set(definition.slice(0, separator), definition.slice(separator + 1));
    }

    const frontSourceFiles = fronts.flatMap((dir) =>
      trackedFiles.filter((file) => file.startsWith(`${dir}/src/`) && /\.tsx?$/.test(file)),
    );
    const frontRoutes = collectFrontRoutes(frontSourceFiles);
    const frontConsumers = collectFrontConsumers(frontSourceFiles, frontRoutes, builders);

    for (const glob of getAll(args, '--scan-extra')) {
      const extraFiles = trackedFiles.filter((file) => matchesGlob(glob, file) && /\.tsx?$/.test(file));
      frontConsumers.push(...collectExternalFrontReferences(extraFiles, frontRoutes));
    }
    frontConsumers.sort(compareFrontOccurrence);

    const frontConsumersFile = getOne(args, '--front-consumers');
    if (frontConsumersFile) writeFrontConsumers(frontConsumersFile, frontConsumers);

    const danglingFront = frontConsumers.filter(
      (item) => item.dangling && !allowlist.has(`${item.file}\0${item.raw}`),
    );
    if (danglingFront.length > 0) {
      failed = true;
      console.error(`DANGLING FRONT LINKS: ${danglingFront.length}`);
      for (const item of danglingFront) console.error(`${item.file}:${item.line} ${item.raw}`);
    }
    console.log(
      `Front routes: ${frontRoutes.length}; front references: ${frontConsumers.length}; dangling: ${danglingFront.length}`,
    );
  }

  if (failed) process.exitCode = 1;
}

function reportApiCheck(
  args: Map<string, (string | true)[]>,
  allowlist: Set<string>,
  occurrences: ConsumerInfo[],
  routes: RouteInfo[],
  markFailed: () => void,
): void {
  const unallowed = occurrences.filter(
    (item) => item.match === 'ORPHAN' && !allowlist.has(`${item.file}\0${item.raw}`),
  );
  if (args.has('--check') && unallowed.length > 0) {
    markFailed();
    console.error(`UNMATCHED PATHS: ${unallowed.length}`);
    for (const item of unallowed) console.error(`${item.file}:${item.line} [${item.kind}] ${item.raw}`);
  }

  const orphans = occurrences.filter((item) => item.match === 'ORPHAN').length;
  console.log(`Routes: ${routes.length}; references: ${occurrences.length}; orphan/unmatched: ${orphans}`);
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
