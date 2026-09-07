import assert from 'node:assert/strict';
import { test } from 'node:test';
import { iniciaisDe } from '../src/lib/nome.ts';
import { data, dataOuNulo } from '../src/servidor/consultas.ts';

/**
 * As duas normalizações que o Desk faz antes de qualquer tela existir.
 *
 * Nenhuma abre conexão: `banco.ts` só cria o pool quando alguém consulta.
 */

test('a data do driver é normalizada venha ela como Date ou como texto', () => {
  /* O `pg` devolve `timestamptz` como `Date` quando é carregado uma vez, e como
     texto quando o empacotador do Next carrega uma segunda cópia do parser.
     Sem normalizar, `decorrido` recebe string e `getTime()` explode em tela
     branca — só em produção, porque em desenvolvimento o parser é único. */
  const d = new Date('2026-09-07T02:00:00Z');
  assert.equal(data(d).getTime(), d.getTime());
  assert.equal(data('2026-09-07T02:00:00Z').getTime(), d.getTime());
  assert.ok(data('2026-09-07T02:00:00Z') instanceof Date);
});

test('a mesma instância volta quando já é Date', () => {
  /* Clonar à toa a cada linha da lista custa em conversa aberta. */
  const d = new Date();
  assert.equal(data(d), d);
});

test('nulo continua nulo, e não vira 1970', () => {
  /* `janela_expira_em` é nulo em conversa que nunca recebeu mensagem. Se ele
     virasse `new Date(null)`, a tela anunciaria janela vencida desde 1970 e o
     atendente pararia de responder quem podia ser respondido. */
  assert.equal(dataOuNulo(null), null);
  assert.equal(dataOuNulo('2026-09-07T02:00:00Z')?.getTime(), Date.parse('2026-09-07T02:00:00Z'));
});

test('as iniciais do avatar pegam o primeiro e o último nome', () => {
  assert.equal(iniciaisDe('Ana Ribeiro'), 'AR');
  assert.equal(iniciaisDe('Ana Paula de Souza Ribeiro'), 'AR');
});

test('nome de uma palavra rende uma inicial só, sem estourar', () => {
  /* O avatar do trilho é obrigatório: sem letra, a lateral fica com um círculo
     vazio e não dá para saber quem está logado. */
  assert.equal(iniciaisDe('Ana'), 'A');
  assert.equal(iniciaisDe('  Ana  '), 'A');
  assert.equal(iniciaisDe('ana ribeiro'), 'AR');
});

test('nome vazio não derruba o avatar', () => {
  /* `usuario.nome` é obrigatório no banco, mas espaço em branco passa pela
     restrição. Sem a interrogação, o trilho renderizaria vazio. */
  assert.equal(iniciaisDe(''), '?');
  assert.equal(iniciaisDe('   '), '?');
});
