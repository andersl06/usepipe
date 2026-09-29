import { describe, expect, it } from 'vitest';

import {
  campoValido,
  descreverRegra,
  destinationQueue,
  ordenarRegras,
  regrasInalcancaveis,
  type QueueRule,
} from './queue-rule.js';

const regra = (parcial: Partial<QueueRule> = {}): QueueRule => ({
  id: 'r1',
  name: 'Regra 1',
  order: 0,
  combiner: 'e',
  queueDestinationId: 'f1',
  queueDestinationName: 'Suporte',
  active: true,
  conditions: [{ field: 'mensagem', operator: 'contem', value: 'boleto' }],
  ...parcial,
});

const context = {
  message: 'Preciso da segunda via do BOLETO',
  contact: { name: 'Ana Maria', email: 'ana@empresa.com.br', phone: '+5511999990000', extras: { plano: 'ouro' } },
};

describe('destinationQueue', () => {
  it('lets the first matching rule win, in screen order', () => {
    const casou = destinationQueue(
      [
        regra({ id: 'b', order: 2, queueDestinationId: 'f-fin', queueDestinationName: 'Financeiro' }),
        regra({ id: 'a', order: 1, queueDestinationId: 'f-cob', queueDestinationName: 'Cobrança' }),
      ],
      context,
    );
    expect(casou).toMatchObject({ regraId: 'a', queueDestinationId: 'f-cob' });
  });

  it('breaks order ties by id', () => {
    expect(ordenarRegras([regra({ id: 'zz' }), regra({ id: 'aa' }), regra({ id: 'mm' })]).map((r) => r.id)).toEqual([
      'aa',
      'mm',
      'zz',
    ]);
  });

  it('returns null when nothing matches or the rule is inactive', () => {
    expect(destinationQueue([regra()], { message: 'quero cancelar' })).toBeNull();
    expect(destinationQueue([regra({ active: false })], context)).toBeNull();
  });

  it('reads Contact.Name, Contact.Email and the phone under the stored field names', () => {
    const porContato = (field: string, value: string) =>
      destinationQueue([regra({ conditions: [{ field, operator: 'igual', value }] })], context);
    expect(porContato('contato.nome', 'ana maria')).not.toBeNull();
    expect(porContato('contato.email', 'ANA@empresa.com.br')).not.toBeNull();
    expect(porContato('contato.telefone', '+5511999990000')).not.toBeNull();
    expect(porContato('contato.nome', 'Bia')).toBeNull();
  });

  it('reads Contact.Extras.<prop> through contato.atributos.<key>', () => {
    const extra = regra({ conditions: [{ field: 'contato.atributos.plano', operator: 'igual', value: 'Ouro' }] });
    expect(destinationQueue([extra], context)).not.toBeNull();
    expect(destinationQueue([extra], { message: 'x', contact: { extras: { plano: 'prata' } } })).toBeNull();
  });

  it('applies NotContains and NotEquals', () => {
    const nao = regra({
      conditions: [
        { field: 'mensagem', operator: 'nao_contem', value: 'cancelar' },
        { field: 'contato.nome', operator: 'diferente', value: 'Bia' },
      ],
    });
    expect(destinationQueue([nao], context)).not.toBeNull();
    expect(destinationQueue([nao], { ...context, message: 'quero CANCELAR' })).toBeNull();
  });

  it('honours E and OU as stored', () => {
    const conds = [
      { field: 'mensagem', operator: 'contem', value: 'boleto' },
      { field: 'contato.email', operator: 'contem', value: '@gmail' },
    ] as const;
    expect(destinationQueue([regra({ combiner: 'e', conditions: conds })], context)).toBeNull();
    expect(destinationQueue([regra({ combiner: 'ou', conditions: conds })], context)).not.toBeNull();
  });

  it('never matches an active rule without conditions, and flags it as unreachable', () => {
    const vazia = regra({ conditions: [] });
    expect(destinationQueue([vazia], context)).toBeNull();
    expect(regrasInalcancaveis([vazia])).toEqual(['r1']);
  });

  it('flags an identical rule below another as unreachable', () => {
    expect(
      regrasInalcancaveis([
        regra({ id: 'topo', order: 1 }),
        regra({ id: 'sombra', order: 2 }),
        regra({ id: 'outra', order: 3, conditions: [{ field: 'mensagem', operator: 'contem', value: 'nota' }] }),
      ]),
    ).toEqual(['sombra']);
  });
});

describe('queue rule labels and validation', () => {
  it('accepts only known fields and usable extra keys', () => {
    expect(campoValido('mensagem')).toBe(true);
    expect(campoValido('contato.atributos.plano')).toBe(true);
    expect(campoValido('contato.atributos.')).toBe(false);
    expect(campoValido('contato.telefone_do_avô')).toBe(false);
  });

  it('spells the rule out with its combiner', () => {
    expect(
      descreverRegra(
        regra({
          combiner: 'ou',
          conditions: [
            { field: 'mensagem', operator: 'contem', value: 'boleto' },
            { field: 'contato.atributos.plano', operator: 'igual', value: 'ouro' },
          ],
        }),
      ),
    ).toBe('Conteúdo da mensagem contém “boleto” OU Campo extra “plano” é igual a “ouro”');
  });
});
