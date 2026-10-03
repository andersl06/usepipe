import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  messageStamp,
  formatPeriodLimit,
  messageSide,
  periodDefault,
  countLabel,
  rotuloDoStatus,
  ticketAtivo,
} from '../src/pages/flow/contacts/regras';

describe('contacts: count and period', () => {
  it('counts like the source: singular up to 1, "Approximately" above that', () => {
    assert.equal(countLabel(0), '0 Contato');
    assert.equal(countLabel(1), '1 Contato');
    assert.equal(countLabel(6), '6 Contatos Aproximadamente');
  });

  it('the default period covers the last 7 days, from 00:00 to 23:59', () => {
    const { inicio, fim } = periodDefault(new Date(2026, 8, 16, 15, 30));
    assert.equal(formatPeriodLimit(inicio), '09 set, 2026 - 00:00');
    assert.equal(formatPeriodLimit(fim), '16 set, 2026 - 23:59');
  });
});

describe('contacts: opening the detail view', () => {
  const tickets = [{ id: 'novo' }, { id: 'antigo' }];

  it('abre o ticket da URL quando existe, senão o mais recente', () => {
    assert.equal(ticketAtivo(tickets, 'antigo')?.id, 'antigo');
    assert.equal(ticketAtivo(tickets, 'inexistente')?.id, 'novo');
    assert.equal(ticketAtivo(tickets)?.id, 'novo');
    assert.equal(ticketAtivo([], 'x'), undefined);
  });

  it('puts the contact on the right and the bot/agent on the left', () => {
    assert.equal(messageSide('entrada'), 'direita');
    assert.equal(messageSide('saida'), 'esquerda');
    assert.equal(messageSide('interna'), 'esquerda');
  });

  it("stamps the message as day - time and translates the ticket's state", () => {
    assert.equal(messageStamp(new Date(2026, 8, 16, 13, 26)), '16/09/2026 - 13:26');
    assert.equal(rotuloDoStatus('ClosedAttendant'), 'Atendido');
    assert.equal(rotuloDoStatus('Waiting'), 'Na fila');
    assert.equal(rotuloDoStatus('outro'), 'outro');
  });
});

describe('contacts: controls without backend', () => {
  it('filter and period controls are disabled and say why', async () => {
    const { readFileSync } = await import('node:fs');
    const { NAO_DISPONIVEL } = await import('../src/pages/flow/contacts/regras');
    assert.equal(NAO_DISPONIVEL, 'não disponível no Pipe');
    const fonte = readFileSync('src/pages/flow/contacts/lista.tsx', 'utf8');
    assert.match(
      fonte,
      /className="ct-add-filter" type="button" disabled title=\{NAO_DISPONIVEL\}/,
    );
    assert.equal(fonte.match(/readOnly\s+disabled/g)?.length, 2);
  });
});
