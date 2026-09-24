import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';

/**
 * Prova estática de STD-06 para jsonb: toda chave que o código lia numa fixture na
 * baseline continua ocorrendo como nome de propriedade no código depois de uma fatia.
 *
 * `--baseline` grava, por fixture, quais chaves da fixture ocorrem HOJE como nome de
 * propriedade em código rastreado (`present`) e quais não ocorrem (`legacy` — dado que
 * o código nunca leu por aquele nome; nunca falha o `--check`). `--check` recalcula os
 * nomes de propriedade do código e falha se alguma chave `present` da baseline sumiu —
 * isso é o sinal de uma chave jsonb renomeada por engano junto do rename mecânico.
 */

const RAIZ = fileURLToPath(new URL('../../', import.meta.url));
const MANIFESTO = join(RAIZ, 'apps/api/tests/fixtures/jsonb/manifest.json');
const RELATORIO = join(
  RAIZ,
  '.planning/phases/01-padronizar-linguagem-t-cnica-navega-o-e-renderiza-o/std/reports/baseline-jsonb-keys.json',
);

export interface EntradaDoManifesto {
  file: string;
  group: string;
  table: string;
  column: string;
  sqlTable: string;
  sqlColumn: string;
  /** Campo do registro que guarda o valor desta coluna; `value` quando ausente. */
  field?: string;
  provenance: 'local-db' | 'seed' | 'generated';
  opaque: string[];
}

/**
 * Junta os nomes de propriedade que ocorrem em `doc`, ignorando o que estiver sob um
 * caminho opaco (a própria chave do caminho opaco continua entrando — só os FILHOS dela
 * ficam de fora). Caminho opaco é `$.a.b.*`: filhos de `$.a.b`.
 */
export function collectKeys(doc: unknown, opaque: readonly string[] = []): string[] {
  const chaves = new Set<string>();
  const opacos = new Set(opaque);

  function andar(valor: unknown, caminho: string): void {
    if (Array.isArray(valor)) {
      for (const item of valor) andar(item, caminho);
      return;
    }
    if (valor && typeof valor === 'object') {
      for (const [chave, filho] of Object.entries(valor as Record<string, unknown>)) {
        chaves.add(chave);
        const caminhoFilho = `${caminho}.${chave}`;
        if (opacos.has(`${caminhoFilho}.*`)) continue;
        andar(filho, caminhoFilho);
      }
    }
  }

  andar(doc, '$');
  return [...chaves];
}

/**
 * Nomes de propriedade que aparecem em `raiz` (um `ts.SourceFile`, ou qualquer nó):
 * membro de interface/type literal, chave de objeto literal (inclusive shorthand),
 * nome de `acesso.propriedade` e chave string de `acesso['indice']`. Nome computado
 * (`[expr]`) não entra: não dá para saber estaticamente o que é.
 */
export function codePropertyNames(raiz: ts.Node): Set<string> {
  const nomes = new Set<string>();

  function nomeDePropriedade(nome: ts.PropertyName): string | null {
    if (ts.isIdentifier(nome)) return nome.text;
    if (ts.isPrivateIdentifier(nome)) return nome.text.replace(/^#/, '');
    if (ts.isStringLiteralLike(nome)) return nome.text;
    if (ts.isNumericLiteral(nome)) return nome.text;
    // `{ ['literal']: v }`: nome computado com literal dentro dá para resolver estático.
    if (ts.isComputedPropertyName(nome) && ts.isStringLiteralLike(nome.expression)) {
      return nome.expression.text;
    }
    return null;
  }

  function visitar(node: ts.Node): void {
    if (
      (ts.isPropertySignature(node) ||
        ts.isPropertyDeclaration(node) ||
        ts.isPropertyAssignment(node) ||
        ts.isMethodSignature(node) ||
        ts.isMethodDeclaration(node)) &&
      node.name
    ) {
      const nome = nomeDePropriedade(node.name);
      if (nome !== null) nomes.add(nome);
    } else if (ts.isShorthandPropertyAssignment(node)) {
      nomes.add(node.name.text);
    } else if (ts.isPropertyAccessExpression(node)) {
      nomes.add(node.name.text);
    } else if (
      ts.isElementAccessExpression(node) &&
      ts.isStringLiteralLike(node.argumentExpression)
    ) {
      nomes.add(node.argumentExpression.text);
    }
    ts.forEachChild(node, visitar);
  }

  visitar(raiz);
  return nomes;
}

/** Arquivos rastreados em `apps/*\/src/**` e `packages/*\/src/**`, sem teste nem fixture. */
function arquivosDeCodigo(): string[] {
  const saida = execFileSync('git', ['ls-files', '--', 'apps', 'packages'], {
    cwd: RAIZ,
    encoding: 'utf8',
  });
  return saida
    .split('\n')
    .filter(Boolean)
    .filter((caminho) => /^(apps|packages)\/[^/]+\/src\//.test(caminho))
    .filter((caminho) => /\.(ts|tsx)$/.test(caminho))
    .filter((caminho) => !caminho.endsWith('.d.ts'))
    .filter((caminho) => !/\.(test|teste|spec)\.tsx?$/.test(caminho))
    .filter((caminho) => !/\/(tests|fixtures)\//.test(caminho));
}

function nomesDoCodigoAtual(): Set<string> {
  const todos = new Set<string>();
  for (const caminho of arquivosDeCodigo()) {
    const texto = readFileSync(join(RAIZ, caminho), 'utf8');
    const fonte = ts.createSourceFile(caminho, texto, ts.ScriptTarget.Latest, true);
    for (const nome of codePropertyNames(fonte)) todos.add(nome);
  }
  return todos;
}

function carregarManifesto(): EntradaDoManifesto[] {
  return JSON.parse(readFileSync(MANIFESTO, 'utf8')) as EntradaDoManifesto[];
}

function chavesDaFixture(entrada: EntradaDoManifesto): string[] {
  const caminho = join(RAIZ, 'apps/api/tests/fixtures/jsonb', entrada.file);
  const registros = JSON.parse(readFileSync(caminho, 'utf8')) as Record<string, unknown>[];
  const campo = entrada.field ?? 'value';
  const chaves = new Set<string>();
  for (const registro of registros) {
    for (const chave of collectKeys(registro[campo], entrada.opaque)) chaves.add(chave);
  }
  return [...chaves];
}

function rodarBaseline(): void {
  const manifesto = carregarManifesto();
  const codigo = nomesDoCodigoAtual();
  // Mais de uma entrada do manifesto pode apontar para o MESMO arquivo (ex.:
  // flow-process-http.json tem uma entrada por coluna combinada, cada uma com seu
  // `field` e seu `opaque`) — as chaves de todas elas se juntam no relatório do arquivo,
  // nunca uma sobrescreve a outra.
  const chavesPorArquivo = new Map<string, Set<string>>();
  for (const entrada of manifesto) {
    const chaves = chavesPorArquivo.get(entrada.file) ?? new Set<string>();
    for (const chave of chavesDaFixture(entrada)) chaves.add(chave);
    chavesPorArquivo.set(entrada.file, chaves);
  }
  const relatorio: Record<string, { present: string[]; legacy: string[] }> = {};
  for (const [arquivo, chaves] of chavesPorArquivo) {
    const lista = [...chaves];
    relatorio[arquivo] = {
      present: lista.filter((c) => codigo.has(c)).sort(),
      legacy: lista.filter((c) => !codigo.has(c)).sort(),
    };
  }
  mkdirSync(dirname(RELATORIO), { recursive: true });
  writeFileSync(RELATORIO, `${JSON.stringify(relatorio, null, 2)}\n`);
  console.log(`baseline gravada em ${RELATORIO}`);
}

function rodarCheck(): void {
  if (!existsSync(RELATORIO)) {
    console.error(`sem baseline em ${RELATORIO}; rode --baseline primeiro`);
    process.exit(1);
  }
  const baseline = JSON.parse(readFileSync(RELATORIO, 'utf8')) as Record<
    string,
    { present: string[]; legacy: string[] }
  >;
  const codigo = nomesDoCodigoAtual();
  const falhas: string[] = [];
  for (const [arquivo, { present }] of Object.entries(baseline)) {
    for (const chave of present) {
      if (!codigo.has(chave)) falhas.push(`${arquivo}:${chave}`);
    }
  }
  if (falhas.length > 0) {
    console.error('jsonb-keys --check falhou: chave(s) presente(s) na baseline sumiram do código');
    for (const falha of falhas) console.error(`  ${falha}`);
    process.exit(1);
  }
  console.log('jsonb-keys --check ok: nenhuma chave jsonb presente na baseline sumiu do código');
}

function ehChamadaDireta(): boolean {
  const argv1 = process.argv[1];
  return !!argv1 && import.meta.url === pathToFileURL(argv1).href;
}

if (ehChamadaDireta()) {
  if (process.argv.includes('--baseline')) rodarBaseline();
  else if (process.argv.includes('--check')) rodarCheck();
  else {
    console.error('uso: node tools/std/jsonb-keys.ts --baseline | --check');
    process.exit(1);
  }
}
