import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  camposVisiveisDoServico,
  chatbotsDaBusca,
  pedidoDoFormulario,
} from '../src/paginas/fluxo/servicos/regras';

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

  it('o campo escondido não vai no pedido', () => {
    const base = { nome: ' Suporte ', chatbotId: 'c1', expiracao: '30' };
    assert.deepEqual(pedidoDoFormulario({ ...base, principal: true, persistente: true }), {
      nome: 'Suporte',
      chatbotId: 'c1',
      principal: true,
      persistente: false,
      expiracaoMin: null,
    });
    assert.equal(
      pedidoDoFormulario({ ...base, principal: false, persistente: true }).expiracaoMin,
      null,
    );
    assert.equal(
      pedidoDoFormulario({ ...base, principal: false, persistente: false }).expiracaoMin,
      30,
    );
  });

  it('a busca filtra por nome e tira o que já é serviço', () => {
    const bot = (id: string, nome: string) => ({
      id,
      nome,
      estado: 'publicado',
      tipo: 'fluxo',
      shortName: null,
    });
    const busca = [bot('1', 'Suporte'), bot('2', 'Vendas'), bot('3', 'Suporte VIP')];
    assert.deepEqual(
      chatbotsDaBusca(busca, 'sup', new Set(['1'])).map((b) => b.id),
      ['3'],
    );
    assert.deepEqual(chatbotsDaBusca(busca, 'nada', new Set()), []);
  });
});
