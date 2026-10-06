import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { analisarCsv, filtrarEnvios } from '../src/pages/flow/growth/regras';
import type { EnvioGrowth } from '@pipe/contracts';

const envios: EnvioGrowth[] = [
  {
    id: '1',
    disparoId: null,
    contactName: 'Ana',
    templateNome: 'Boas-vindas',
    channelName: 'WhatsApp',
    state: 'lida',
    errorCode: null,
    criadaEm: '2026-09-14T12:00:00Z',
    custoCentavos: null,
  },
  {
    id: '2',
    disparoId: null,
    contactName: 'Bia',
    templateNome: 'Aviso',
    channelName: 'WhatsApp',
    state: 'falhou',
    errorCode: null,
    criadaEm: '2026-09-14T12:00:00Z',
    custoCentavos: null,
  },
];

describe('Growth — active messages', () => {
  it('filters by template name and state at the same time', () => {
    assert.deepEqual(
      filtrarEnvios(envios, 'boas', 'lida').map(({ id }) => id),
      ['1'],
    );
    assert.deepEqual(filtrarEnvios(envios, '', 'entregue'), []);
  });
});

describe('Growth — bulk audience (CSV)', () => {
  it('discards the header and reads phone, name and parameters by position', () => {
    const texto = 'telefone,nome,param1,param2\n+5511988887777,Ana,Pedido 123,Amanhã\n+5511977776666,,,';
    assert.deepEqual(analisarCsv(texto), [
      { telefone: '+5511988887777', nome: 'Ana', parametros: ['Pedido 123', 'Amanhã'] },
      { telefone: '+5511977776666', nome: null, parametros: [] },
    ]);
  });

  it('ignora linha em branco e linha sem telefone', () => {
    const texto = 'telefone,nome\n\n,Sem telefone\n+5511988887777,Bia\n';
    assert.deepEqual(analisarCsv(texto), [
      { telefone: '+5511988887777', nome: 'Bia', parametros: [] },
    ]);
  });
});

import { sendBlockReason } from '../src/pages/flow/growth/regras';

describe('sendBlockReason', () => {
  it('blocks templates that are not approved', () => {
    assert.equal(sendBlockReason({ templateStatus: 'PENDING', windowOpen: true }), 'template_not_approved');
    assert.equal(sendBlockReason({ templateStatus: 'pendente' }), 'template_not_approved');
  });
  it('blocks inactive templates', () => {
    assert.equal(sendBlockReason({ templateStatus: 'APPROVED', active: false }), 'template_inactive');
  });
  it('blocks free text outside the 24 h window', () => {
    assert.equal(
      sendBlockReason({ templateStatus: 'APPROVED', active: true, freeText: true, windowOpen: false }),
      'window_expired',
    );
  });
  it('allows a valid template', () => {
    assert.equal(sendBlockReason({ templateStatus: 'aprovado', active: true }), null);
  });
});
