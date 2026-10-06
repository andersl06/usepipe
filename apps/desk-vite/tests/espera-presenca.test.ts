import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import type { StateAgent, StateConversation } from '@pipe/contracts';
import { esperaDisponivel } from '../src/lib/espera.ts';
import { presenceStatus } from '../src/lib/presenca-agente.ts';

describe('esperaDisponivel', () => {
  it('só o ticket em atendimento (Open) habilita o Modo de Espera', () => {
    assert.deepEqual(esperaDisponivel({ state: 'Open', emStandby: false }), { habilitada: true, motivo: null });
    assert.deepEqual(esperaDisponivel({ state: 'Open', emStandby: true }), { habilitada: true, motivo: null });
  });

  it('Waiting e Assigned ficam desabilitados com a explicação', () => {
    for (const state of ['Waiting', 'Assigned'] as StateConversation[]) {
      const r = esperaDisponivel({ state, emStandby: false });
      assert.equal(r.habilitada, false, state);
      assert.match(r.motivo ?? '', /só vale para ticket em atendimento/);
    }
  });

  it('ticket encerrado não entra em espera', () => {
    for (const state of ['ClosedAttendant', 'ClosedClient', 'ClosedClientInactivity', 'Transferred'] as StateConversation[]) {
      const r = esperaDisponivel({ state, emStandby: false });
      assert.equal(r.habilitada, false, state);
      assert.match(r.motivo ?? '', /encerrado/);
    }
  });
});

describe('presença do atendente', () => {
  const css = readFileSync(new URL('../src/estilos/global.css', import.meta.url), 'utf8');

  it('cada status Blip emite um valor e o CSS tem uma cor para ele', () => {
    const estados: StateAgent[] = ['Online', 'Pause', 'Invisible', 'Offline'];
    const valores = estados.map(presenceStatus);
    assert.deepEqual(valores, ['online', 'pause', 'invisible', 'offline']);
    for (const valor of valores) {
      assert.ok(css.includes(`.dk-presenca[data-status='${valor}']`), `ponto do rail sem cor para ${valor}`);
      assert.ok(css.includes(`.dk-status-ponto[data-status='${valor}']`), `ponto do menu sem cor para ${valor}`);
    }
  });
});
