import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { ConversationOfList } from '@pipe/contracts';
import {
  applyFilter,
  buscar,
  contagens,
  windowOpen,
  displayName,
  ordenar,
  telefoneInternacional,
} from '../src/lib/order';

const agora = new Date('2026-09-17T12:00:00Z');

function conversation(parte: Partial<ConversationOfList>): ConversationOfList {
  return {
    id: 'a',
    estado: 'Open',
    emStandby: false,
    prioridade: 'media',
    criadaEm: '2026-09-17T10:00:00Z',
    primeiraRespostaEm: null,
    ultimaMensagemEm: '2026-09-17T11:00:00Z',
    lastMessageFrom: 'atendente',
    janelaExpiraEm: '2026-09-18T00:00:00Z',
    emEsperaDesde: null,
    contatoNome: 'Maria',
    contatoTelefone: '+5531994714471',
    filaNome: 'Suporte',
    canalTipo: 'whatsapp_cloud',
    lastMessage: 'oi',
    lastMessageType: 'texto',
    fixadaEm: null,
    naoLidaEm: null,
    ...parte,
  };
}

test('the cards count over the entire list', () => {
  const lista = [
    conversation({ id: '1', lastMessageFrom: 'contato' }),
    conversation({ id: '2', emStandby: true }),
    conversation({ id: '3', janelaExpiraEm: '2026-09-16T00:00:00Z' }),
  ];
  assert.deepEqual(contagens(lista, agora), {
    todos: 3,
    'nao-lidos': 1,
    'em-espera': 1,
    inativos: 1,
  });
  assert.deepEqual(
    applyFilter(lista, 'nao-lidos', agora).map((c) => c.id),
    ['1'],
  );
  assert.deepEqual(
    applyFilter(lista, 'inativos', agora).map((c) => c.id),
    ['3'],
  );
});

test('the default order puts the newest message on top; the opening order puts the oldest ticket on top', () => {
  const lista = [
    conversation({
      id: 'velha',
      ultimaMensagemEm: '2026-09-17T09:00:00Z',
      criadaEm: '2026-09-17T08:00:00Z',
    }),
    conversation({
      id: 'nova',
      ultimaMensagemEm: '2026-09-17T11:00:00Z',
      criadaEm: '2026-09-17T10:00:00Z',
    }),
  ];
  assert.deepEqual(
    ordenar(lista, 'ultima-mensagem').map((c) => c.id),
    ['nova', 'velha'],
  );
  assert.deepEqual(
    ordenar(lista, 'abertura').map((c) => c.id),
    ['velha', 'nova'],
  );
});

test('pinned items stay on top, the most recently pinned above the others, and the rest follow the normal order', () => {
  const lista = [
    conversation({ id: 'nova', ultimaMensagemEm: '2026-09-17T11:00:00Z' }),
    conversation({
      id: 'fixada-antiga',
      ultimaMensagemEm: '2026-09-17T08:00:00Z',
      fixadaEm: '2026-09-17T09:00:00Z',
    }),
    conversation({
      id: 'fixada-recente',
      ultimaMensagemEm: '2026-09-17T07:00:00Z',
      fixadaEm: '2026-09-17T10:00:00Z',
    }),
    conversation({ id: 'velha', ultimaMensagemEm: '2026-09-17T09:30:00Z' }),
  ];
  assert.deepEqual(
    ordenar(lista, 'ultima-mensagem').map((c) => c.id),
    ['fixada-recente', 'fixada-antiga', 'nova', 'velha'],
  );
  assert.deepEqual(
    ordenar(lista, 'abertura').map((c) => c.id),
    ['fixada-recente', 'fixada-antiga', 'nova', 'velha'],
  );
});

test('manually marked as unread appears in the "Unread" card even when the agent sent the last message', () => {
  const lista = [
    conversation({ id: 'manual', lastMessageFrom: 'atendente', naoLidaEm: '2026-09-17T11:30:00Z' }),
    conversation({ id: 'lida', lastMessageFrom: 'atendente' }),
  ];
  assert.deepEqual(
    applyFilter(lista, 'nao-lidos', agora).map((c) => c.id),
    ['manual'],
  );
  assert.equal(contagens(lista, agora)['nao-lidos'], 1);
});

test('search matches by name without accents and by phone digits', () => {
  const lista = [
    conversation({ id: '1', contatoNome: 'João Álvares' }),
    conversation({ id: '2', contatoNome: 'Ana' }),
  ];
  assert.deepEqual(
    buscar(lista, 'joao').map((c) => c.id),
    ['1'],
  );
  assert.deepEqual(
    buscar(lista, '(31) 99471').map((c) => c.id),
    ['1', '2'],
  );
  assert.equal(buscar(lista, '').length, 2);
});

test('the 24-hour window', () => {
  assert.equal(windowOpen(null, 'email', agora), true);
  assert.equal(windowOpen(null, 'whatsapp_cloud', agora), false);
  assert.equal(windowOpen('2026-09-17T13:00:00Z', 'whatsapp_cloud', agora), true);
  assert.equal(windowOpen('2026-09-17T11:00:00Z', 'whatsapp_cloud', agora), false);
});

test('the display name is never left blank', () => {
  assert.equal(displayName({ contactName: ' Ana ', contactPhone: null }), 'Ana');
  assert.equal(
    displayName({ contactName: null, contactPhone: '+5531994714471' }),
    '+55 31 99471-4471',
  );
  assert.equal(
    displayName({ contactName: null, contactPhone: null, contactEmail: 'a@b.c' }),
    'a@b.c',
  );
  assert.equal(telefoneInternacional('+551133334444'), '+55 11 3333-4444');
});
