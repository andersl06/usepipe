import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { analisarCsv, filtrarEnvios, resumirEnvios } from '../src/paginas/fluxo/growth/regras';
import type { EnvioGrowth } from '@pipe/contracts';

const envios: EnvioGrowth[] = [
  {
    id: '1',
    disparoId: null,
    contatoNome: 'Ana',
    templateNome: 'Boas-vindas',
    canalNome: 'WhatsApp',
    estado: 'lida',
    erroCodigo: null,
    criadaEm: '2026-09-14T12:00:00Z',
    custoCentavos: null,
  },
  {
    id: '2',
    disparoId: null,
    contatoNome: 'Bia',
    templateNome: 'Aviso',
    canalNome: 'WhatsApp',
    estado: 'falhou',
    erroCodigo: null,
    criadaEm: '2026-09-14T12:00:00Z',
    custoCentavos: null,
  },
];

describe('Growth — mensagens ativas', () => {
  it('resume destinatários únicos e estados de entrega', () => {
    assert.deepEqual(resumirEnvios(envios), { audiencia: 2, recebidas: 1, lidas: 1, falharam: 1 });
  });

  it('filtra por nome de modelo e estado simultaneamente', () => {
    assert.deepEqual(
      filtrarEnvios(envios, 'boas', 'lida').map(({ id }) => id),
      ['1'],
    );
    assert.deepEqual(filtrarEnvios(envios, '', 'entregue'), []);
  });
});

describe('Growth — audiência em massa (CSV)', () => {
  it('descarta o cabeçalho e lê telefone, nome e parâmetros por posição', () => {
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
