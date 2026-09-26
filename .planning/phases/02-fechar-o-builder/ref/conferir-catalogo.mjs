#!/usr/bin/env node
// Gate automático da whitelist dupla (motor + tela) para o catálogo aprovado
// do Builder (D-24). Uso:
//   node conferir-catalogo.mjs --slot <slot> [--catalogo <arquivo>]
//   node conferir-catalogo.mjs --all [--catalogo <arquivo>]
//
// RED (TDD): esqueleto de CLI/carregamento sem a checagem real de arquivos —
// `locateFile` sempre devolve "não encontrado", então todo item reporta FALTA
// dos dois lados. Isso faz `--slot ja-suportada` sair 1 (deveria sair 0),
// demonstrando a falha esperada antes da implementação real (GREEN, próximo
// commit).

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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

// TODO (GREEN): localizar o arquivo real via `git grep -l -e <PT> -e <EN>`.
// Por ora sempre devolve null — todo item reporta FALTA dos dois lados.
function locateFile() {
  return null;
}

function itensDoSlot(catalogo, args) {
  const conteudos = catalogo.conteudos ?? [];
  const acoes = catalogo.acoes ?? [];
  const filtro = (item) => args.all || item.slot === args.slot;
  return {
    conteudos: conteudos.filter(filtro),
    acoes: acoes.filter(filtro),
  };
}

function conferir(catalogo, args) {
  const { conteudos, acoes } = itensDoSlot(catalogo, args);
  let falhas = 0;
  let checados = 0;

  for (const item of conteudos) {
    if (item.classificacao !== 'reproduzivel' || !item.mime) continue;
    checados += 1;
    for (const lado of ['motor', 'tela', 'canal']) {
      if (!locateFile()) {
        console.log(`FALTA ${lado} ${item.nome}`);
        falhas += 1;
      }
    }
  }

  for (const item of acoes) {
    if (item.classificacao === 'reproduzivel') {
      checados += 1;
      for (const lado of ['motor', 'tela']) {
        if (!locateFile()) {
          console.log(`FALTA ${lado} ${item.tipo}`);
          falhas += 1;
        }
      }
    } else if (item.classificacao === 'externa') {
      checados += 1;
      if (!locateFile()) {
        console.log(`FALTA lista-externa ${item.tipo}`);
        falhas += 1;
      }
    }
  }

  if (falhas > 0) return 1;
  console.log(`OK ${checados} itens`);
  return 0;
}

const args = parseArgs(process.argv.slice(2));
const catalogo = carregarCatalogo(args.catalogo);
process.exit(conferir(catalogo, args));
