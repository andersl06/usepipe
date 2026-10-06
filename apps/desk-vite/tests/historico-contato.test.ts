import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { ConversationOfHistory, PassagemDoBot } from '@pipe/contracts';
import { caminhoDaPassagem, entradasDoHistorico, resumoDaPassagem } from '../src/lib/historico-contato.ts';

const ticket = (id: string, criadaEm: string): ConversationOfHistory => ({
  id,
  sequentialId: 1,
  parentSequentialId: null,
  criadaEm,
  encerradaEm: null,
  estado: 'ClosedClient',
  filaNome: null,
  closedBy: null,
});

const passagem = (id: string, iniciadaEm: string, extra: Partial<PassagemDoBot> = {}): PassagemDoBot => ({
  id,
  executionId: '11111111-1111-4111-8111-111111111111',
  iniciadaEm,
  encerradaEm: '2026-09-05T19:30:00.000Z',
  mensagens: 3,
  ultimoBlocoCodigo: 'despedida',
  ultimoBlocoNome: 'Despedida',
  ...extra,
});

describe('entradasDoHistorico', () => {
  it('mistura tickets e passagens do bot, da mais recente para a mais antiga', () => {
    const entradas = entradasDoHistorico(
      [ticket('t1', '2026-09-05T10:00:00.000Z'), ticket('t2', '2026-09-05T18:00:00.000Z')],
      [passagem('p1', '2026-09-05T17:49:00.000Z')],
    );
    assert.deepEqual(entradas.map((e) => e.chave), ['t-t2', 'b-p1', 't-t1']);
    assert.deepEqual(entradas.map((e) => e.tipo), ['ticket', 'bot', 'ticket']);
  });

  it('sem passagens devolve só os tickets', () => {
    assert.deepEqual(entradasDoHistorico([ticket('t1', '2026-09-05T10:00:00.000Z')], []).map((e) => e.tipo), ['ticket']);
    assert.deepEqual(entradasDoHistorico([], []), []);
  });
});

describe('passagem pelo bot', () => {
  it('o caminho leva execução, início e fim codificados', () => {
    const c = caminhoDaPassagem('c-1', passagem('p1', '2026-09-05T17:49:00.000+00:00'));
    assert.match(c, /^\/v1\/desk\/contacts\/c-1\/bot-passages\/11111111-1111-4111-8111-111111111111\?/);
    const q = new URLSearchParams(c.split('?')[1]);
    assert.equal(q.get('inicio'), '2026-09-05T17:49:00.000+00:00');
    assert.equal(q.get('fim'), '2026-09-05T19:30:00.000Z');
  });

  it('o resumo conta as mensagens e diz onde o bot parou', () => {
    assert.equal(resumoDaPassagem(passagem('p', '2026-09-05T17:49:00.000Z')), '3 mensagens · parou em Despedida');
    assert.equal(resumoDaPassagem(passagem('p', '2026-09-05T17:49:00.000Z', { mensagens: 1, ultimoBlocoNome: null })), '1 mensagem');
  });
});
