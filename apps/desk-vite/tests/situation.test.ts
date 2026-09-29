import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { closedByLabel, situationLabel } from '../src/lib/situation.ts';

describe('closed conversation label', () => {
  it('names the real closing actor', () => {
    assert.equal(closedByLabel('atendente'), 'Finalizado pelo atendente');
    assert.equal(closedByLabel('cliente'), 'Finalizado pelo cliente');
    assert.equal(closedByLabel('inatividade'), 'Finalizado por inatividade');
    assert.equal(closedByLabel('transferencia'), 'Transferido');
    assert.equal(closedByLabel('bot'), 'Finalizado pelo bot');
  });

  it('falls back to a neutral label for null or unknown actors', () => {
    assert.equal(closedByLabel(null), 'Finalizado');
    assert.equal(closedByLabel(undefined), 'Finalizado');
    assert.equal(closedByLabel('algo-novo'), 'Finalizado');
    assert.equal(closedByLabel('toString'), 'Finalizado');
  });

  it('only uses the actor for closed conversations', () => {
    assert.equal(situationLabel({ estado: 'encerrada', closedBy: 'cliente' }), 'Finalizado pelo cliente');
    assert.equal(situationLabel({ estado: 'encerrada', closedBy: null }), 'Finalizado');
    assert.equal(situationLabel({ estado: 'na_fila', closedBy: 'cliente' }), 'Aguardando');
    assert.equal(situationLabel({ estado: 'atribuida' }), 'Atribuído');
    assert.equal(situationLabel({ estado: 'em_atendimento' }), 'Aberto');
  });
});
