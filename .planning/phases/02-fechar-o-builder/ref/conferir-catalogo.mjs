#!/usr/bin/env node
// Gate automático da whitelist dupla (motor + tela) para o catálogo aprovado
// do Builder (D-24). Uso:
//   node conferir-catalogo.mjs --slot <slot> [--catalogo <arquivo>]
//   node conferir-catalogo.mjs --all [--catalogo <arquivo>]
//
// Para cada item `reproduzivel`: conteúdo -> o literal do `mime` precisa
// aparecer no arquivo de whitelist do motor (`CONTEUDOS_SUPORTADOS`), no
// catálogo de conteúdo da tela (o que exporta `novoTexto`) e no arquivo de
// tradução para canal (`textoParaOCanal`); ação -> `tipo: '<Tipo>'` precisa
// aparecer no arquivo que define `ACOES_DO_MOTOR` e no que define
// `CATALOGO_DE_ACOES`. Para item `externa`: o `tipo` precisa aparecer na
// lista `EXTERNAL_DEPENDENCY_ACTIONS` (criada em 02-20) — ausente falha só
// quando o slot pedido tem item `externa`.
//
// Cada arquivo é localizado por `git grep -l -e <símbolo PT> -e <símbolo EN>`,
// onde o símbolo EN vem da linha aprovada do `std/map/*.csv` correspondente
// (se existir) — assim o gate funciona antes e depois da aplicação do mapa
// old->new da Phase 1 (D-05). Sem entrada aprovada, procura só o símbolo PT.

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = execFileSync('git', ['rev-parse', '--show-toplevel'], {
  cwd: __dirname,
  encoding: 'utf8',
}).trim();

const MAP_DIR = path.join(
  REPO_ROOT,
  '.planning/phases/01-padronizar-linguagem-t-cnica-navega-o-e-renderiza-o/std/map',
);

// Raízes de busca por papel (motor/tela/canal/externa), cobrindo o nome do
// diretório antes e depois de um rename de Phase 1 ainda não aplicado (D-05).
const ROOTS = {
  motorConteudo: ['packages/core/src'],
  motorAcao: ['packages/core/src'],
  tela: ['apps/gestao-vite/src', 'apps/management-vite/src'],
  canal: ['apps/api/src'],
  externa: ['apps/api/src', 'packages/core/src'],
};

function existingRoots(candidates) {
  return candidates.filter((p) => existsSync(path.join(REPO_ROOT, p)));
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Lê `std/map/*.csv` e devolve o nome EN aprovado para um símbolo PT, ou null. */
function lookupEnName(ptSymbol) {
  if (!existsSync(MAP_DIR)) return null;
  const re = new RegExp(`,symbol,${escapeRegex(ptSymbol)},([^,]+),`);
  for (const f of readdirSync(MAP_DIR)) {
    if (!f.endsWith('.csv')) continue;
    const texto = readFileSync(path.join(MAP_DIR, f), 'utf8');
    const m = texto.match(re);
    if (m) return m[1];
  }
  return null;
}

/** `git grep -l` pelo símbolo PT e (se existir) o EN aprovado, dentro das raízes dadas. */
function locateFile(symbol, roots) {
  const raizes = existingRoots(roots);
  if (raizes.length === 0) return null;
  const enSymbol = lookupEnName(symbol);
  const args = ['grep', '-l', '-I', '-e', symbol];
  if (enSymbol && enSymbol !== symbol) args.push('-e', enSymbol);
  args.push('--', ...raizes);
  try {
    const out = execFileSync('git', args, { cwd: REPO_ROOT, encoding: 'utf8' });
    const arquivos = out.split('\n').filter(Boolean).sort();
    return arquivos[0] ?? null;
  } catch (erro) {
    if (erro.status === 1) return null; // git grep: nenhuma ocorrência
    throw erro;
  }
}

function arquivoContem(caminhoRelativo, literal) {
  if (!caminhoRelativo) return false;
  const conteudo = readFileSync(path.join(REPO_ROOT, caminhoRelativo), 'utf8');
  return conteudo.includes(literal);
}

function parseArgs(argv) {
  const args = { slot: null, all: false, catalogo: path.join(__dirname, 'catalogo-aprovado.json') };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--slot') args.slot = argv[++i];
    else if (a === '--all') args.all = true;
    else if (a === '--catalogo') args.catalogo = path.resolve(argv[++i]);
  }
  if (!args.slot && !args.all) {
    console.error('Uso: conferir-catalogo.mjs --slot <slot> | --all [--catalogo <arquivo>]');
    process.exit(2);
  }
  return args;
}

function carregarCatalogo(caminho) {
  if (!existsSync(caminho)) {
    console.error(`Catálogo não encontrado: ${caminho}`);
    process.exit(2);
  }
  return JSON.parse(readFileSync(caminho, 'utf8'));
}

function itensDoSlot(catalogo, args) {
  const conteudos = catalogo.conteudos ?? [];
  const acoes = catalogo.acoes ?? [];
  const filtro = (item) => args.all || item.slot === args.slot;
  return { conteudos: conteudos.filter(filtro), acoes: acoes.filter(filtro) };
}

function conferirConteudo(item) {
  let falhas = 0;
  const arquivoMotor = locateFile('CONTEUDOS_SUPORTADOS', ROOTS.motorConteudo);
  if (!arquivoContem(arquivoMotor, item.mime)) {
    console.log(`FALTA motor ${item.nome}`);
    falhas += 1;
  }
  const arquivoTela = locateFile('novoTexto', ROOTS.tela);
  if (!arquivoContem(arquivoTela, item.mime)) {
    console.log(`FALTA tela ${item.nome}`);
    falhas += 1;
  }
  const arquivoCanal = locateFile('textoParaOCanal', ROOTS.canal);
  if (!arquivoContem(arquivoCanal, item.mime)) {
    console.log(`FALTA canal ${item.nome}`);
    falhas += 1;
  }
  return falhas;
}

function conferirAcaoReproduzivel(item) {
  let falhas = 0;
  const literal = `tipo: '${item.tipo}'`;
  const arquivoMotor = locateFile('ACOES_DO_MOTOR', ROOTS.motorAcao);
  if (!arquivoContem(arquivoMotor, literal)) {
    console.log(`FALTA motor ${item.tipo}`);
    falhas += 1;
  }
  const arquivoTela = locateFile('CATALOGO_DE_ACOES', ROOTS.tela);
  if (!arquivoContem(arquivoTela, literal)) {
    console.log(`FALTA tela ${item.tipo}`);
    falhas += 1;
  }
  return falhas;
}

function conferirAcaoExterna(item) {
  const literal = `'${item.tipo}'`;
  const arquivo = locateFile('EXTERNAL_DEPENDENCY_ACTIONS', ROOTS.externa);
  if (!arquivoContem(arquivo, literal)) {
    console.log(`FALTA lista-externa ${item.tipo}`);
    return 1;
  }
  return 0;
}

function conferir(catalogo, args) {
  const { conteudos, acoes } = itensDoSlot(catalogo, args);
  let falhas = 0;
  let checados = 0;

  for (const item of conteudos) {
    if (item.classificacao !== 'reproduzivel' || !item.mime) continue; // sem mime confirmado: sem checagem possível ainda (D-03)
    checados += 1;
    falhas += conferirConteudo(item);
  }

  for (const item of acoes) {
    if (item.classificacao === 'reproduzivel') {
      checados += 1;
      falhas += conferirAcaoReproduzivel(item);
    } else if (item.classificacao === 'externa') {
      checados += 1;
      falhas += conferirAcaoExterna(item);
    }
    // classificacao 'bloqueado' (ex.: achado fora de escopo, pendente do dono): sem checagem.
  }

  if (falhas > 0) return 1;
  console.log(`OK ${checados} itens`);
  return 0;
}

const args = parseArgs(process.argv.slice(2));
const catalogo = carregarCatalogo(args.catalogo);
process.exit(conferir(catalogo, args));
