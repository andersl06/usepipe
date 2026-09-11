import assert from 'node:assert/strict';
import { test } from 'node:test';
import { montarPassos } from '../src/lib/passos-da-implantacao.ts';
import type { SinaisDaImplantacao } from '../src/lib/passos-da-implantacao.ts';

/**
 * Os passos do assistente de implantação, a partir dos sinais do banco. Cada
 * passo está feito quando o que ele pede existe — nunca por clique.
 */

const NADA: SinaisDaImplantacao = {
  adminEntrou: false,
  canaisConectados: 0,
  canaisPendentes: 0,
  convites: 0,
  membros: 1,
  filasAtivas: 0,
  filasComAtendente: 0,
  ultimaImportacao: null,
  conversaAtendida: false,
};

const DESK = 'https://app.teste';

function estados(sinais: SinaisDaImplantacao): Record<string, string> {
  return Object.fromEntries(montarPassos(sinais, DESK).map((p) => [p.id, p.estado]));
}

test('tenant recém-provisionado: seis passos, na ordem do onboarding, todos pendentes', () => {
  const passos = montarPassos(NADA, DESK);
  assert.deepEqual(
    passos.map((p) => p.id),
    ['acesso', 'whatsapp', 'equipe', 'fila', 'contatos', 'conversa'],
  );
  assert.ok(passos.every((p) => p.estado === 'pendente'));
});

test('a conversa de teste depende do WhatsApp, e só então oferece o Desk', () => {
  const sem = montarPassos(NADA, DESK).find((p) => p.id === 'conversa')!;
  assert.equal(sem.acao, null);
  assert.match(sem.resumo, /Depende do WhatsApp/);

  const com = montarPassos({ ...NADA, canaisConectados: 1 }, DESK).find((p) => p.id === 'conversa')!;
  assert.deepEqual(com.acao, { rotulo: 'Abrir o Desk', href: DESK, externo: true });
});

test('canal marcado para reautorização é andamento, não feito', () => {
  assert.equal(estados({ ...NADA, canaisPendentes: 1 })['whatsapp'], 'andamento');
});

test('convite sem aceite é andamento; alguém além do administrador é feito', () => {
  assert.equal(estados({ ...NADA, convites: 2 })['equipe'], 'andamento');
  assert.equal(estados({ ...NADA, convites: 2, membros: 3 })['equipe'], 'feito');
});

test('fila sem atendente não conta: a conversa chegaria e ninguém a receberia', () => {
  const passo = montarPassos({ ...NADA, filasAtivas: 2 }, DESK).find((p) => p.id === 'fila')!;
  assert.equal(passo.estado, 'pendente');
  assert.match(passo.resumo, /nenhum atendente/);
  assert.equal(estados({ ...NADA, filasAtivas: 2, filasComAtendente: 1 })['fila'], 'feito');
});

test('importação: em andamento, falha e concluída sem aceito não fecham o passo', () => {
  const importacao = { id: 'i', aceitos: 0, rejeitados: 0, temFalhas: false };
  assert.equal(estados({ ...NADA, ultimaImportacao: { ...importacao, estado: 'executando' } })['contatos'], 'andamento');
  assert.equal(estados({ ...NADA, ultimaImportacao: { ...importacao, estado: 'falhou' } })['contatos'], 'pendente');
  assert.equal(
    estados({ ...NADA, ultimaImportacao: { ...importacao, estado: 'concluida', rejeitados: 4 } })['contatos'],
    'pendente',
  );
  const feita = montarPassos(
    { ...NADA, ultimaImportacao: { ...importacao, estado: 'concluida', aceitos: 12, rejeitados: 1 } },
    DESK,
  ).find((p) => p.id === 'contatos')!;
  assert.equal(feita.estado, 'feito');
  assert.equal(feita.resumo, '12 contatos importados, 1 linha rejeitada.');
});

test('tudo pronto: seis de seis', () => {
  const tudo = estados({
    adminEntrou: true,
    canaisConectados: 1,
    canaisPendentes: 0,
    convites: 1,
    membros: 2,
    filasAtivas: 1,
    filasComAtendente: 1,
    ultimaImportacao: { id: 'i', estado: 'concluida', aceitos: 3, rejeitados: 0, temFalhas: false },
    conversaAtendida: true,
  });
  assert.ok(Object.values(tudo).every((e) => e === 'feito'));
});
