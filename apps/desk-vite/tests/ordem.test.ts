import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { ConversaDaLista } from '@pipe/contracts';
import {
  aplicarFiltro,
  buscar,
  contagens,
  horasRestantes,
  janelaAberta,
  nomeDeExibicao,
  ordenar,
  telefoneInternacional,
} from '../src/lib/ordem';

const agora = new Date('2026-09-17T12:00:00Z');

function conversa(parte: Partial<ConversaDaLista>): ConversaDaLista {
  return {
    id: 'a',
    estado: 'em_atendimento',
    prioridade: 'media',
    criadaEm: '2026-09-17T10:00:00Z',
    primeiraRespostaEm: null,
    ultimaMensagemEm: '2026-09-17T11:00:00Z',
    ultimaMensagemDe: 'atendente',
    janelaExpiraEm: '2026-09-18T00:00:00Z',
    emEsperaDesde: null,
    contatoNome: 'Maria',
    contatoTelefone: '+5531994714471',
    filaNome: 'Suporte',
    canalTipo: 'whatsapp_cloud',
    ultimaMensagem: 'oi',
    ultimaMensagemTipo: 'texto',
    fixadaEm: null,
    naoLidaEm: null,
    ...parte,
  };
}

test('as fichas contam sobre a lista inteira', () => {
  const lista = [
    conversa({ id: '1', ultimaMensagemDe: 'contato' }),
    conversa({ id: '2', estado: 'em_espera' }),
    conversa({ id: '3', janelaExpiraEm: '2026-09-16T00:00:00Z' }),
  ];
  assert.deepEqual(contagens(lista, agora), {
    todos: 3,
    'nao-lidos': 1,
    'em-espera': 1,
    inativos: 1,
  });
  assert.deepEqual(
    aplicarFiltro(lista, 'nao-lidos', agora).map((c) => c.id),
    ['1'],
  );
  assert.deepEqual(
    aplicarFiltro(lista, 'inativos', agora).map((c) => c.id),
    ['3'],
  );
});

test('a ordem padrão põe a mensagem mais nova no topo; a de abertura, o ticket mais antigo', () => {
  const lista = [
    conversa({
      id: 'velha',
      ultimaMensagemEm: '2026-09-17T09:00:00Z',
      criadaEm: '2026-09-17T08:00:00Z',
    }),
    conversa({
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

test('as fixadas ficam no topo, a fixada mais recente por cima, e o resto segue a ordem normal', () => {
  const lista = [
    conversa({ id: 'nova', ultimaMensagemEm: '2026-09-17T11:00:00Z' }),
    conversa({
      id: 'fixada-antiga',
      ultimaMensagemEm: '2026-09-17T08:00:00Z',
      fixadaEm: '2026-09-17T09:00:00Z',
    }),
    conversa({
      id: 'fixada-recente',
      ultimaMensagemEm: '2026-09-17T07:00:00Z',
      fixadaEm: '2026-09-17T10:00:00Z',
    }),
    conversa({ id: 'velha', ultimaMensagemEm: '2026-09-17T09:30:00Z' }),
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

test('marcada à mão como não lida entra na ficha "Não lidos" mesmo com a última palavra do atendente', () => {
  const lista = [
    conversa({ id: 'manual', ultimaMensagemDe: 'atendente', naoLidaEm: '2026-09-17T11:30:00Z' }),
    conversa({ id: 'lida', ultimaMensagemDe: 'atendente' }),
  ];
  assert.deepEqual(
    aplicarFiltro(lista, 'nao-lidos', agora).map((c) => c.id),
    ['manual'],
  );
  assert.equal(contagens(lista, agora)['nao-lidos'], 1);
});

test('a busca acha por nome sem acento e por dígitos do telefone', () => {
  const lista = [
    conversa({ id: '1', contatoNome: 'João Álvares' }),
    conversa({ id: '2', contatoNome: 'Ana' }),
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

test('a janela de 24 horas', () => {
  assert.equal(janelaAberta(null, 'email', agora), true);
  assert.equal(janelaAberta(null, 'whatsapp_cloud', agora), false);
  assert.equal(janelaAberta('2026-09-17T13:00:00Z', 'whatsapp_cloud', agora), true);
  assert.equal(janelaAberta('2026-09-17T11:00:00Z', 'whatsapp_cloud', agora), false);
  assert.equal(horasRestantes('2026-09-17T13:30:00Z', agora), 2);
  assert.equal(horasRestantes('2026-09-17T11:00:00Z', agora), null);
});

test('o nome de exibição nunca fica em branco', () => {
  assert.equal(nomeDeExibicao({ contatoNome: ' Ana ', contatoTelefone: null }), 'Ana');
  assert.equal(
    nomeDeExibicao({ contatoNome: null, contatoTelefone: '+5531994714471' }),
    '+55 31 99471-4471',
  );
  assert.equal(
    nomeDeExibicao({ contatoNome: null, contatoTelefone: null, contatoEmail: 'a@b.c' }),
    'a@b.c',
  );
  assert.equal(telefoneInternacional('+551133334444'), '+55 11 3333-4444');
});
