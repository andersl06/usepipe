import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  AGENT_STATUS_FILTER_VALUES, AGENT_STATUS_LABELS, TICKET_STATUS_LABELS,
  agentStatusLabel, isClosedTicket, ticketNumber, ticketStatusLabel,
} from '../src/status-labels.ts';

test('cada estado Blip do ticket tem um texto', () => {
  assert.deepEqual(TICKET_STATUS_LABELS, {
    Waiting: 'Na fila',
    Assigned: 'Atribuído',
    Open: 'Em atendimento',
    ClosedAttendant: 'Encerrado pelo atendente',
    ClosedClient: 'Encerrado pelo cliente',
    ClosedClientInactivity: 'Encerrado por inatividade',
    Transferred: 'Transferido',
  });
});

test('status do atendente em português', () => {
  assert.deepEqual(AGENT_STATUS_LABELS, {
    Online: 'Online', Pause: 'Pausa', Invisible: 'Invisível', Offline: 'Offline',
  });
  assert.equal(agentStatusLabel('Pause'), 'Pausa');
  assert.equal(agentStatusLabel('qualquer'), 'qualquer');
  assert.deepEqual([...AGENT_STATUS_FILTER_VALUES], ['Online', 'Pause', 'Invisible']);
});

test('espera só vale para ticket aberto; fechado pelo bot tem texto próprio', () => {
  assert.equal(ticketStatusLabel({ state: 'Open', standby: true }), 'Em espera');
  assert.equal(ticketStatusLabel({ state: 'Open', standby: false }), 'Em atendimento');
  assert.equal(ticketStatusLabel({ state: 'Assigned', standby: true }), 'Atribuído');
  assert.equal(ticketStatusLabel({ state: 'ClosedAttendant', closedBy: 'bot' }), 'Encerrado pelo bot');
  assert.equal(ticketStatusLabel({ state: 'Open', closedBy: 'bot' }), 'Em atendimento');
  assert.equal(ticketStatusLabel({ state: 'Inexistente' }), 'Inexistente');
});

test('transferido conta como fechado', () => {
  assert.equal(isClosedTicket('Transferred'), true);
  assert.equal(isClosedTicket('ClosedClient'), true);
  assert.equal(isClosedTicket('Open'), false);
  assert.equal(isClosedTicket('Waiting'), false);
});

test('o número do ticket é o sequencial com #', () => {
  assert.equal(ticketNumber(42), '#42');
});
