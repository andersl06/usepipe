import path from 'node:path';
import tsMorph from 'ts-morph';
import type { CallExpression, Node, Project, PropertyAssignment, Type } from 'ts-morph';

const { SyntaxKind } = tsMorph;

export type ReachVia = '$type' | 'insert-values' | 'update-set' | 'read-cast' | 'known-sink';
export interface ReachOrigin { table: string; column: string; via: ReachVia; rootType: string }
export interface JsonbReachRow { table: string; column: string; via: ReachVia; root_type: string; kind: 'ts-prop' | 'literal-value'; name: string; declared_at: string }
export interface JsonbReachResult { reached: Map<string, ReachOrigin[]>; report: JsonbReachRow[] }

interface Column { table: string; column: string; sql: string; node: PropertyAssignment }

function normalized(file: string): string {
  const relative = path.relative(process.cwd(), file).replaceAll('\\', '/');
  return relative.startsWith('../') ? file.replaceAll('\\', '/') : relative;
}
function declarationKey(file: string, line: number, kind: string, name: string): string { return `${normalized(file)}:${line}:${kind}:${name}`; }
function callBaseName(call: CallExpression): string {
  let expression: Node = call.getExpression();
  while (expression.isKind(SyntaxKind.PropertyAccessExpression)) expression = expression.getExpression();
  return expression.getText();
}
function startsWithJsonb(node: Node): boolean {
  let current: Node = node;
  while (current.isKind(SyntaxKind.CallExpression)) {
    const expression = current.getExpression();
    if (expression.isKind(SyntaxKind.Identifier) && expression.getText() === 'jsonb') return true;
    if (!expression.isKind(SyntaxKind.PropertyAccessExpression)) return false;
    current = expression.getExpression();
  }
  return false;
}
function columns(project: Project): Column[] {
  const result: Column[] = [];
  for (const source of project.getSourceFiles()) {
    for (const declaration of source.getVariableDeclarations()) {
      const call = declaration.getInitializerIfKind(SyntaxKind.CallExpression); if (!call || callBaseName(call) !== 'pgTable') continue;
      const object = call.getArguments()[1]?.asKind(SyntaxKind.ObjectLiteralExpression); if (!object) continue;
      for (const property of object.getProperties()) {
        if (!property.isKind(SyntaxKind.PropertyAssignment) || !startsWithJsonb(property.getInitializerOrThrow())) continue;
        const initializer = property.getInitializerOrThrow(); let sql = property.getName();
        for (const nested of initializer.getDescendantsOfKind(SyntaxKind.CallExpression)) {
          if (callBaseName(nested) === 'jsonb') { sql = nested.getArguments()[0]?.getLiteralText() ?? sql; break; }
        }
        if (initializer.isKind(SyntaxKind.CallExpression) && callBaseName(initializer) === 'jsonb') sql = initializer.getArguments()[0]?.getLiteralText() ?? sql;
        result.push({ table: declaration.getName(), column: property.getName(), sql, node: property });
      }
    }
  }
  return result;
}
function property(object: Node | undefined, name: string): PropertyAssignment | undefined {
  const literal = object?.asKind(SyntaxKind.ObjectLiteralExpression); if (!literal) return undefined;
  return literal.getProperty(name)?.asKind(SyntaxKind.PropertyAssignment);
}
function tableFromText(text: string): string | undefined { return /\b(?:insert|update)\s*\(\s*([\w$]+)/.exec(text)?.[1]; }
function nearestChainText(node: Node): string {
  let current: Node = node; while (current.getParentIfKind(SyntaxKind.CallExpression) || current.getParentIfKind(SyntaxKind.PropertyAccessExpression)) current = current.getParentOrThrow(); return current.getText();
}
function namedType(type: Type): string { return type.getAliasSymbol()?.getName() ?? type.getSymbol()?.getName() ?? type.getText(); }

export function traceJsonbReach(project: Project): JsonbReachResult {
  const roots = columns(project); const reached = new Map<string, ReachOrigin[]>(); const report: JsonbReachRow[] = [];
  const seenReport = new Set<string>();

  const addDeclaration = (declaration: Node, kind: JsonbReachRow['kind'], name: string, origin: ReachOrigin): void => {
    const source = declaration.getSourceFile(); const line = declaration.getStartLineNumber(); const key = declarationKey(source.getFilePath(), line, kind, name);
    const origins = reached.get(key) ?? []; if (!origins.some((item) => item.table === origin.table && item.column === origin.column && item.via === origin.via)) origins.push(origin); reached.set(key, origins);
    const reportKey = `${origin.table}\0${origin.column}\0${origin.via}\0${key}`; if (!seenReport.has(reportKey)) { seenReport.add(reportKey); report.push({ table: origin.table, column: origin.column, via: origin.via, root_type: origin.rootType, kind, name, declared_at: `${normalized(source.getFilePath())}:${line}` }); }
  };

  const walk = (type: Type, origin: ReachOrigin, seen = new Set<string>(), fallback?: Node): void => {
    const identity = `${origin.table}.${origin.column}:${type.getText()}`; if (seen.has(identity)) return; seen.add(identity);
    if (type.isStringLiteral()) {
      const value = String(type.getLiteralValue());
      let declaration = type.getAliasSymbol()?.getDeclarations()[0] ?? fallback;
      const typeNode = fallback?.asKind(SyntaxKind.PropertySignature)?.getTypeNode();
      if (typeNode?.isKind(SyntaxKind.TypeReference)) {
        const alias = typeNode.getSourceFile().getTypeAlias(typeNode.getText());
        const literal = alias?.getDescendantsOfKind(SyntaxKind.StringLiteral).find((node) => node.getLiteralText() === value);
        if (literal) declaration = literal;
      }
      if (declaration) addDeclaration(declaration, 'literal-value', value, origin); return;
    }
    const unions = [...type.getUnionTypes(), ...type.getIntersectionTypes()];
    if (unions.length > 0) { for (const union of unions) walk(union, origin, seen, fallback); return; }
    const arrayElement = type.getArrayElementType(); if (arrayElement) { walk(arrayElement, origin, seen, fallback); return; }
    if (type.isTuple()) { for (const element of type.getTupleElements()) walk(element, origin, seen, fallback); return; }
    const symbolName = type.getSymbol()?.getName() ?? '';
    if (['Array', 'ReadonlyArray'].includes(symbolName)) { for (const argument of type.getTypeArguments()) walk(argument, origin, seen, fallback); return; }
    if (['Date', 'Map', 'Set', 'Promise', 'Function'].includes(symbolName)) return;
    if (type.getCallSignatures().length > 0) return;
    for (const symbol of type.getProperties()) {
      const declaration = symbol.getValueDeclaration() ?? symbol.getDeclarations()[0]; if (!declaration) continue;
      const source = declaration.getSourceFile(); const file = source.getFilePath().replaceAll('\\', '/'); if (source.isDeclarationFile() || file.includes('/node_modules/') || file.includes('/typescript/lib/')) continue;
      const name = symbol.getName(); addDeclaration(declaration, 'ts-prop', name, origin);
      walk(symbol.getTypeAtLocation(declaration), origin, seen, declaration);
    }
    for (const argument of type.getTypeArguments()) walk(argument, origin, seen, fallback);
  };
  const addType = (type: Type, column: Column, via: ReachVia): void => {
    const origin = { table: column.table, column: column.column, via, rootType: namedType(type) };
    for (const declaration of type.getSymbol()?.getDeclarations() ?? []) {
      if (declaration.getSourceFile().isDeclarationFile()) continue;
      if (!declaration.isKind(SyntaxKind.InterfaceDeclaration) && !declaration.isKind(SyntaxKind.TypeLiteral)) continue;
      for (const member of declaration.getMembers()) {
        const name = 'getName' in member && typeof member.getName === 'function' ? member.getName() : undefined;
        if (name) addDeclaration(member, 'ts-prop', name, origin);
      }
    }
    walk(type, origin);
  };

  for (const column of roots) {
    const initializer = column.node.getInitializerOrThrow();
    const calls = [initializer.asKind(SyntaxKind.CallExpression), ...initializer.getDescendantsOfKind(SyntaxKind.CallExpression)].filter((call): call is CallExpression => Boolean(call));
    for (const call of calls) {
      if (call.getExpression().asKind(SyntaxKind.PropertyAccessExpression)?.getName() === '$type') {
        const typeNode = call.getTypeArguments()[0];
        if (typeNode) {
          const name = typeNode.getText();
          const declaration = call.getSourceFile().getInterface(name) ?? call.getSourceFile().getTypeAlias(name);
          addType(declaration?.getType() ?? typeNode.getType(), column, '$type');
        }
      }
    }
  }

  for (const source of project.getSourceFiles()) {
    for (const call of source.getDescendantsOfKind(SyntaxKind.CallExpression)) {
      const access = call.getExpression().asKind(SyntaxKind.PropertyAccessExpression); if (!access) continue;
      const method = access.getName(); if (!['values', 'set', 'onConflictDoUpdate'].includes(method)) continue;
      const table = tableFromText(nearestChainText(call)) ?? tableFromText(call.getFirstAncestorByKind(SyntaxKind.CallExpression)?.getText() ?? '');
      if (!table) continue;
      const matching = roots.filter((root) => root.table === table); let object: Node | undefined = call.getArguments()[0];
      if (method === 'onConflictDoUpdate') object = property(object, 'set')?.getInitializer();
      for (const column of matching) {
        const value = property(object, column.column)?.getInitializer(); if (value) addType(value.getType(), column, method === 'values' ? 'insert-values' : 'update-set');
      }
    }

    for (const expression of source.getDescendantsOfKind(SyntaxKind.AsExpression)) {
      const propertyAccess = expression.getExpression().asKind(SyntaxKind.PropertyAccessExpression); if (!propertyAccess) continue;
      for (const column of roots.filter((root) => root.column === propertyAccess.getName())) addType(expression.getTypeNode().getType(), column, 'read-cast');
    }
    for (const declaration of source.getVariableDeclarations()) {
      const initializer = declaration.getInitializerIfKind(SyntaxKind.PropertyAccessExpression); const typeNode = declaration.getTypeNode(); if (!initializer || !typeNode) continue;
      for (const column of roots.filter((root) => root.column === initializer.getName())) addType(typeNode.getType(), column, 'read-cast');
    }
  }

  // Contexto is a runtime wrapper: fluxo.ts serializes only variaveis. EventoDeAuditoria is
  // likewise split into before/after snapshots by auditoria.ts, never stored as a whole.
  const known: Record<string, string[]> = {
    FluxoBlip: ['bloco.conteudo'], Acao: ['bloco.conteudo'], Entrada: ['bloco.conteudo'], Saida: ['bloco.conteudo'], Estado: ['bloco.conteudo'],
    MensagemDeEntrada: ['execucaoPasso.entrada', 'processHttpExecucao.entrada'], MensagemDeSaida: ['execucaoPasso.saida'],
    PedidoDeHttp: ['processHttpExecucao.pedido'], RespostaDeHttp: ['processHttpExecucao.resposta'], CursorDeProcessHttp: ['processHttpExecucao.contexto'],
    ListaDeAcoesSuspensa: ['processHttpExecucao.contexto'],
  };
  const knownFiles: Record<string, string> = {
    FluxoBlip: 'packages/core/src/fluxo/modelos.ts', Acao: 'packages/core/src/fluxo/modelos.ts', Entrada: 'packages/core/src/fluxo/modelos.ts', Saida: 'packages/core/src/fluxo/modelos.ts', Estado: 'packages/core/src/fluxo/modelos.ts',
    MensagemDeEntrada: 'packages/core/src/fluxo/contexto.ts', MensagemDeSaida: 'packages/core/src/fluxo/contexto.ts', PedidoDeHttp: 'packages/core/src/fluxo/contexto.ts', RespostaDeHttp: 'packages/core/src/fluxo/contexto.ts', CursorDeProcessHttp: 'packages/core/src/fluxo/contexto.ts', ListaDeAcoesSuspensa: 'packages/core/src/fluxo/contexto.ts',
  };
  for (const source of project.getSourceFiles()) {
    const declarations = [...source.getInterfaces(), ...source.getTypeAliases()];
    for (const declaration of declarations) for (const target of known[declaration.getName()] ?? []) {
      if (normalized(source.getFilePath()) !== knownFiles[declaration.getName()]) continue;
      const [table, columnName] = target.split('.'); const column = roots.find((item) => item.table === table && item.column === columnName); if (column) addType(declaration.getType(), column, 'known-sink');
    }
  }
  report.sort((a, b) => `${a.table}\0${a.column}\0${a.name}\0${a.declared_at}`.localeCompare(`${b.table}\0${b.column}\0${b.name}\0${b.declared_at}`));
  return { reached, report };
}

export function createJsonbReachProject(files: Record<string, string>): Project {
  const project = new tsMorph.Project({ useInMemoryFileSystem: true, compilerOptions: { strict: true } });
  for (const [file, text] of Object.entries(files)) project.createSourceFile(file, text);
  return project;
}
