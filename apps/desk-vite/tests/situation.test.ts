import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { AGENT_STATUS_LABELS, situationLabel } from '../src/lib/situation.ts';

describe('situationLabel', () => {
  it('usa o mapa único para cada estado Blip', () => {
    assert.equal(situationLabel({ estado: 'Waiting' }), 'Aguardando');
    assert.equal(situationLabel({ estado: 'Assigned' }), 'Atribuído');
    assert.equal(situationLabel({ estado: 'Open' }), 'Aberto');
    assert.equal(situationLabel({ estado: 'ClosedAttendant' }), 'Finalizado pelo atendente');
    assert.equal(situationLabel({ estado: 'ClosedClient' }), 'Finalizado pelo cliente');
    assert.equal(situationLabel({ estado: 'ClosedClientInactivity' }), 'Finalizado por inatividade');
    assert.equal(situationLabel({ estado: 'Transferred' }), 'Transferido');
  });

  it('fechado pelo bot tem rótulo próprio', () => {
    assert.equal(situationLabel({ estado: 'ClosedAttendant', closedBy: 'bot' }), 'Finalizado pelo bot');
    assert.equal(situationLabel({ estado: 'Open', closedBy: 'bot' }), 'Aberto');
  });

  it('rótulos de status do atendente', () => {
    assert.equal(AGENT_STATUS_LABELS.Pause, 'Em pausa');
    assert.equal(AGENT_STATUS_LABELS.Invisible, 'Invisível');
    assert.equal(AGENT_STATUS_LABELS.Online, 'Online');
    assert.equal(AGENT_STATUS_LABELS.Offline, 'Offline');
  });
});
