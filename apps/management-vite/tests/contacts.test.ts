import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  messageStamp,
  formatPeriodLimit,
  messageSide,
  periodDefault,
  countLabel,
  contactLabel,
  rotuloDoStatus,
  ticketAtivo,
  ticketHeader,
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
    assert.equal(rotuloDoStatus('ClosedAttendant'), 'Encerrado pelo atendente');
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

describe('contacts: row label', () => {
  it('shows the identity first and the name second', () => {
    assert.deepEqual(contactLabel({ identidade: 'x@wa.gw.msging.net', nome: 'Ana' }), { primary: 'x@wa.gw.msging.net', secondary: 'Ana' });
  });
  it('falls back to the name, then to a dash', () => {
    assert.deepEqual(contactLabel({ identidade: null, nome: 'Ana' }), { primary: 'Ana', secondary: null });
    assert.deepEqual(contactLabel({ identidade: null, nome: null }), { primary: '-', secondary: null });
  });
});

describe('contacts: ticket header', () => {
  const iso = '2026-09-16T16:26:00.000Z';
  it('shows number, Blip status and opened stamp; no closed stamp while open', () => {
    const header = ticketHeader({ numero: 42, estado: 'Open', criadaEm: iso, encerradaEm: null });
    assert.deepEqual(header, {
      title: 'Ticket #42',
      status: 'Em atendimento',
      opened: messageStamp(new Date(iso)),
      closed: null,
    });
  });
  it('maps closed states to Atendido and formats the closed stamp', () => {
    const header = ticketHeader({ numero: 7, estado: 'ClosedClient', criadaEm: iso, encerradaEm: iso });
    assert.equal(header.status, 'Atendido');
    assert.equal(header.closed, messageStamp(new Date(iso)));
  });
  it('keeps an unknown state as is', () => {
    assert.equal(ticketHeader({ numero: 1, estado: 'Xyz', criadaEm: iso, encerradaEm: null }).status, 'Xyz');
  });
});
