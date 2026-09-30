/**
 * P9 — `ExecuteTemplate`: core builds the Handlebars data from the input variables and asks the api
 * to render it. The renderer is faked here; `apps/api/tests/template-sandbox.test.ts` runs Handlebars
 * inside the real isolate. Values are invented.
 */
import { describe, expect, it } from 'vitest';
import { createInbound } from './context.js';
import type { Context, TemplateRequest } from './context.js';
import { processInbound } from './manager.js';
import type { Acao } from './modelos.js';
import { TEMPLATE_TIMEOUT_MS, parseTemplateValue, templateData } from './template.js';

function contextWith(actions: Acao[], render?: (request: TemplateRequest) => Promise<string>) {
  const lookups: string[] = [];
  const context: Context = {
    user: 'user@domain',
    flow: { id: 'f1', states: [{ id: 'root', root: true, input: {}, outputActions: actions, outputs: [] }] },
    inbound: createInbound({ id: 'm1', tipo: 'text/plain', conteudo: 'oi' }),
    variables: {
      pedido: '{"numero":42,"itens":[{"nome":"Caneta"},{"nome":"Caderno"}]}',
      ativo: 'true',
    },
    inboundContext: new Map(),
    contact: { identity: 'user@domain', name: 'Ana Inventada' } as Context['contact'],
    services: {
      async send() {},
      async forwardForAttendance() {
        return { id: 'atd', status: 'Open' };
      },
      async registerEvent() {},
      async resolveSecret(name) {
        lookups.push(name);
        return 'tok-INVENTED-1234567890';
      },
      ...(render ? { renderTemplate: render } : {}),
    },
  };
  return { context, lookups };
}

const template = (settings: Record<string, unknown>): Acao => ({ type: 'ExecuteTemplate', settings });

describe('templateData', () => {
  it('keeps the raw name and nests dotted names', () => {
    expect(templateData([['contact.name', 'Ana'], ['x', 1]])).toEqual({ 'contact.name': 'Ana', contact: { name: 'Ana' }, x: 1 });
  });

  it('lets a dotted input override the same field of a JSON input', () => {
    const data = templateData([['pedido', { numero: 1, status: 'novo' }], ['pedido.numero', 7]]);
    expect(data['pedido']).toEqual({ numero: 7, status: 'novo' });
    expect(data['pedido.numero']).toBe(7);
  });

  it('leaves a path raw when it crosses a non-object or a prototype key', () => {
    expect(templateData([['a', 'texto'], ['a.b', 1]])).toEqual({ a: 'texto', 'a.b': 1 });
    const data = templateData([['__proto__.polluted', 1], ['x.constructor.y', 2], ['__proto__', 3], ['a..b', 4]]);
    expect(data).toEqual({ '__proto__.polluted': 1, 'x.constructor.y': 2, 'a..b': 4 });
    expect(({} as Record<string, unknown>)['polluted']).toBeUndefined();
  });

  it('parses JSON text and keeps other text as is', () => {
    expect(parseTemplateValue('{"a":1}')).toEqual({ a: 1 });
    expect(parseTemplateValue('12')).toBe(12);
    expect(parseTemplateValue('Olá')).toBe('Olá');
    expect(parseTemplateValue(null)).toBeNull();
  });
});

describe('ExecuteTemplate action', () => {
  it('sends the raw template and the input data to the renderer and stores the text', async () => {
    const seen: TemplateRequest[] = [];
    const { context } = contextWith(
      [template({
        template: 'Pedido {{pedido.numero}} de {{contact.name}}{{#each pedido.itens}} {{nome}}{{/each}}',
        inputVariables: ['pedido', 'contact.name', 'ativo', 'faltando'],
        outputVariable: 'texto',
      })],
      async (r) => {
        seen.push(r);
        return 'renderizado';
      },
    );
    await processInbound(context);
    expect(seen).toEqual([{
      template: 'Pedido {{pedido.numero}} de {{contact.name}}{{#each pedido.itens}} {{nome}}{{/each}}',
      data: {
        pedido: { numero: 42, itens: [{ nome: 'Caneta' }, { nome: 'Caderno' }] },
        'contact.name': 'Ana Inventada',
        contact: { name: 'Ana Inventada' },
        ativo: true,
        faltando: null,
      },
      timeoutMs: TEMPLATE_TIMEOUT_MS,
    }]);
    expect(context.variables['texto']).toBe('renderizado');
  });

  it('never gives the template a secret (P11)', async () => {
    const seen: TemplateRequest[] = [];
    const { context, lookups } = contextWith(
      [template({ template: '{{secret.apiToken}}', inputVariables: ['secret.apiToken'], outputVariable: 'texto' })],
      async (r) => {
        seen.push(r);
        return '';
      },
    );
    await processInbound(context);
    expect(seen[0]!.data).toEqual({ 'secret.apiToken': null, secret: { apiToken: null } });
    expect(lookups).toEqual([]);
  });

  it('a renderer error fails the action', async () => {
    const { context } = contextWith(
      [template({ template: '{{#if}}', outputVariable: 'texto' })],
      async () => {
        throw new Error('Template inválido: erro de sintaxe.');
      },
    );
    await expect(processInbound(context)).rejects.toThrow('Template inválido');
  });

  it('fails in Portuguese when no renderer is available', async () => {
    const { context } = contextWith([template({ template: 'x', outputVariable: 'texto' })]);
    await expect(processInbound(context)).rejects.toThrow('A ação ExecuteTemplate não está disponível neste fluxo.');
  });

  it('keeps the required-field errors', async () => {
    const { context } = contextWith([template({ outputVariable: 'texto' })], async () => '');
    await expect(processInbound(context)).rejects.toThrow("O valor 'template' é obrigatório");
  });
});
