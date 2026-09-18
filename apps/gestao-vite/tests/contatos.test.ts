import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  carimboDaMensagem,
  formatarLimiteDoPeriodo,
  ladoDaMensagem,
  periodoPadrao,
  rotuloDeContagem,
  rotuloDoStatus,
  ticketAtivo,
} from '../src/paginas/fluxo/contatos/regras';

describe('contatos: contagem e período', () => {
  it('conta como a origem: singular até 1, "Aproximadamente" acima', () => {
    assert.equal(rotuloDeContagem(0), '0 Contato');
    assert.equal(rotuloDeContagem(1), '1 Contato');
    assert.equal(rotuloDeContagem(6), '6 Contatos Aproximadamente');
  });

  it('período padrão cobre os últimos 7 dias, do 00:00 ao 23:59', () => {
    const { inicio, fim } = periodoPadrao(new Date(2026, 8, 16, 15, 30));
    assert.equal(formatarLimiteDoPeriodo(inicio), '09 set, 2026 - 00:00');
    assert.equal(formatarLimiteDoPeriodo(fim), '16 set, 2026 - 23:59');
  });
});

describe('contatos: abertura do detalhe', () => {
  const tickets = [{ id: 'novo' }, { id: 'antigo' }];

  it('abre o ticket da URL quando existe, senão o mais recente', () => {
    assert.equal(ticketAtivo(tickets, 'antigo')?.id, 'antigo');
    assert.equal(ticketAtivo(tickets, 'inexistente')?.id, 'novo');
    assert.equal(ticketAtivo(tickets)?.id, 'novo');
    assert.equal(ticketAtivo([], 'x'), undefined);
  });

  it('põe o contato à direita e o bot/atendente à esquerda', () => {
    assert.equal(ladoDaMensagem('entrada'), 'direita');
    assert.equal(ladoDaMensagem('saida'), 'esquerda');
    assert.equal(ladoDaMensagem('interna'), 'esquerda');
  });

  it('carimba a mensagem como dia - hora e traduz o estado do ticket', () => {
    assert.equal(carimboDaMensagem(new Date(2026, 8, 16, 13, 26)), '16/09/2026 - 13:26');
    assert.equal(rotuloDoStatus('encerrada'), 'Atendido');
    assert.equal(rotuloDoStatus('na_fila'), 'Na fila');
    assert.equal(rotuloDoStatus('outro'), 'outro');
  });
});
