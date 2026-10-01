import { describe, expect, it } from 'vitest';
import { conditionChecked } from '../src/domain/management/rules-priority.js';

describe('Validar a condição de uma regra de priorização', () => {
  it('aceita ausência e objeto vazio (vale para toda a fila)', () => {
    expect(conditionChecked(undefined)).toEqual({});
    expect(conditionChecked({})).toEqual({});
  });

  it('aceita a expressão do motor e normaliza os textos', () => {
    expect(
      conditionChecked({
        combinador: 'ou',
        condicoes: [
          { campo: 'mensagem', operador: 'contem', valor: ' boleto ' },
          { campo: 'contato.atributos.plano', operador: 'igual', valor: 'ouro' },
        ],
      }),
    ).toEqual({
      combinador: 'ou',
      condicoes: [
        { campo: 'mensagem', operador: 'contem', valor: 'boleto' },
        { campo: 'contato.atributos.plano', operador: 'igual', valor: 'ouro' },
      ],
    });
  });

  it.each([
    ['lista', []],
    ['texto', 'x'],
    ['combinador inválido', { combinador: 'xor', condicoes: [{ campo: 'mensagem', operador: 'contem', valor: 'a' }] }],
    ['sem condições', { combinador: 'e', condicoes: [] }],
    ['campo desconhecido', { combinador: 'e', condicoes: [{ campo: 'foo', operador: 'contem', valor: 'a' }] }],
    ['operador inválido', { combinador: 'e', condicoes: [{ campo: 'mensagem', operador: 'maior', valor: 'a' }] }],
    ['valor vazio', { combinador: 'e', condicoes: [{ campo: 'mensagem', operador: 'contem', valor: ' ' }] }],
  ])('recusa %s', (_nome, bruto) => {
    expect(() => conditionChecked(bruto)).toThrow();
  });
});
