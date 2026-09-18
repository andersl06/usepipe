import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { camposVisiveisDoServico } from '../src/paginas/fluxo/servicos/regras';

describe('formulário de serviço', () => {
  it('esconde redirecionamento quando o serviço é o principal', () => {
    assert.deepEqual(camposVisiveisDoServico(true, false), {
      mostrarPersistente: false,
      mostrarExpiracao: false,
    });
  });

  it('esconde somente a expiração quando o redirecionamento é persistente', () => {
    assert.deepEqual(camposVisiveisDoServico(false, true), {
      mostrarPersistente: true,
      mostrarExpiracao: false,
    });
  });
});
