import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { AGENT_STATUS_LABELS, closedTicketTitle, situationLabel } from '../src/lib/situation.ts';

describe('situationLabel', () => {
  it('usa o mapa único para cada estado Blip', () => {
    assert.equal(situationLabel({ estado: 'Waiting' }), 'Na fila');
    assert.equal(situationLabel({ estado: 'Assigned' }), 'Atribuído');
    assert.equal(situationLabel({ estado: 'Open' }), 'Em atendimento');
    assert.equal(situationLabel({ estado: 'ClosedAttendant' }), 'Encerrado pelo atendente');
    assert.equal(situationLabel({ estado: 'ClosedClient' }), 'Encerrado pelo cliente');
    assert.equal(situationLabel({ estado: 'ClosedClientInactivity' }), 'Encerrado por inatividade');
    assert.equal(situationLabel({ estado: 'Transferred' }), 'Transferido');
  });

  it('fechado pelo bot tem rótulo próprio', () => {
    assert.equal(situationLabel({ estado: 'ClosedAttendant', closedBy: 'bot' }), 'Encerrado pelo bot');
    assert.equal(situationLabel({ estado: 'Open', closedBy: 'bot' }), 'Em atendimento');
  });

  it('rótulos de status do atendente', () => {
    assert.equal(AGENT_STATUS_LABELS.Pause, 'Pausa');
    assert.equal(AGENT_STATUS_LABELS.Invisible, 'Invisível');
    assert.equal(AGENT_STATUS_LABELS.Online, 'Online');
    assert.equal(AGENT_STATUS_LABELS.Offline, 'Offline');
  });
});

describe('closedTicketTitle', () => {
  it('concorda no masculino com o prefixo Ticket', () => {
    assert.equal(closedTicketTitle('ClosedClient'), 'Ticket encerrado pelo cliente.');
    assert.equal(closedTicketTitle('ClosedAttendant'), 'Ticket encerrado pelo atendente.');
    assert.equal(closedTicketTitle('ClosedClientInactivity'), 'Ticket encerrado por inatividade.');
    assert.equal(closedTicketTitle('Transferred'), 'Ticket transferido.');
  });
});
