/**
 * P9 — `ExecuteTemplate` renders with Handlebars inside the script isolate. No database needed.
 * Values are invented.
 */
import { describe, expect, it } from 'vitest';
import { MAX_TEMPLATE_BYTES, createInbound, processInbound, type Context, type TemplateRequest } from '@pipe/core';
import { MAX_RESULTADO_BYTES } from '../src/domain/script-sandbox.js';
import { renderFlowTemplate } from '../src/domain/template-sandbox.js';

const render = (template: string, data: Record<string, unknown> = {}, extra: Partial<TemplateRequest> = {}) =>
  renderFlowTemplate({ template, data, timeoutMs: 5_000, ...extra });

describe('renderFlowTemplate', () => {
  it('renders nested paths and a missing variable as empty text', async () => {
    const data = { pedido: { numero: 42, cliente: { nome: 'Ana' } }, 'contact.name': 'Ana', contact: { name: 'Ana' } };
    expect(await render('Pedido {{pedido.numero}} de {{pedido.cliente.nome}} [{{faltando}}] [{{pedido.x.y}}]', data))
      .toBe('Pedido 42 de Ana [] []');
    expect(await render('{{contact.name}} / {{[contact.name]}}', data)).toBe('Ana / Ana');
  });

  it('supports #if, #unless, #each (with @index, @key and this) and #with', async () => {
    const data = { ativo: true, vazio: [], itens: ['a', 'b'], mapa: { x: 1, y: 2 }, pessoa: { nome: 'Bia' } };
    expect(await render('{{#if ativo}}sim{{else}}não{{/if}}|{{#unless vazio}}vazio{{/unless}}', data)).toBe('sim|vazio');
    expect(await render('{{#each itens}}{{@index}}={{this}};{{/each}}', data)).toBe('0=a;1=b;');
    expect(await render('{{#each mapa}}{{@key}}:{{this}} {{/each}}', data)).toBe('x:1 y:2 ');
    expect(await render('{{#with pessoa}}{{nome}}{{/with}}', data)).toBe('Bia');
    expect(await render('{{#each vazio}}x{{else}}nenhum{{/each}}', data)).toBe('nenhum');
  });

  it('does not HTML-escape the text', async () => {
    expect(await render('{{texto}}', { texto: '<b>R&D</b> "ok"' })).toBe('<b>R&D</b> "ok"');
  });

  it('blocks prototype access', async () => {
    const data = { obj: { a: 1 } };
    expect(await render('[{{obj.constructor}}][{{obj.__proto__}}][{{lookup obj "constructor"}}]', data)).toBe('[][][]');
    expect(await render('{{#with obj.constructor}}x{{name}}{{/with}}', data)).toBe('');
  });

  it('gives the template no host or Node access', async () => {
    expect(await render('[{{process}}][{{require}}][{{globalThis}}]')).toBe('[][][]');
  });

  it('fails with a Portuguese message on a syntax error or a missing helper', async () => {
    await expect(render('{{#if}}x')).rejects.toThrow(/^Não foi possível renderizar o template: /);
    await expect(render('{{#each itens}}x')).rejects.toThrow(/Não foi possível renderizar o template/);
    await expect(render('{{formatar data}}', { data: 1 })).rejects.toThrow(/Não foi possível renderizar o template: .*formatar/);
  });

  it('refuses a template or a result over 64 KB', async () => {
    await expect(render('x'.repeat(MAX_TEMPLATE_BYTES + 1))).rejects.toThrow('O template excede 64 KB.');
    const big = 'y'.repeat(MAX_RESULTADO_BYTES);
    await expect(render('{{a}}{{a}}', { a: big })).rejects.toThrow('O resultado do template excede 64 KB.');
  });

  it('applies the time limit', async () => {
    const itens = Array.from({ length: 2_000 }, (_, i) => i);
    await expect(
      render('{{#each itens}}{{#each ../itens}}{{#each ../../itens}}.{{/each}}{{/each}}{{/each}}', { itens }, { timeoutMs: 300 }),
    ).rejects.toThrow(/tempo limite|limite de memória/);
  });

  it('does not keep state between renders', async () => {
    expect(await render('{{a}}', { a: 1 })).toBe('1');
    expect(await render('{{a}}', {})).toBe('');
  });
});

describe('ExecuteTemplate through the engine', () => {
  it('stores the rendered text and never reads secret.* (P11)', async () => {
    const lookups: string[] = [];
    const context: Context = {
      user: 'user@domain',
      flow: {
        id: 'f1',
        states: [{
          id: 'root',
          root: true,
          input: {},
          outputs: [],
          outputActions: [{
            type: 'ExecuteTemplate',
            settings: {
              template: 'Olá {{contact.name}}! {{#each pedido.itens}}{{#if @index}}, {{/if}}{{nome}}{{/each}}.[{{secret.apiToken}}]',
              inputVariables: ['contact.name', 'pedido', 'secret.apiToken'],
              outputVariable: 'texto',
            },
          }],
        }],
      },
      inbound: createInbound({ id: 'm1', tipo: 'text/plain', conteudo: 'oi' }),
      variables: { pedido: '{"itens":[{"nome":"Caneta"},{"nome":"Caderno"}]}' },
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
        renderTemplate: renderFlowTemplate,
      },
    };
    await processInbound(context);
    expect(context.variables['texto']).toBe('Olá Ana Inventada! Caneta, Caderno.[]');
    expect(lookups).toEqual([]);
  });
});
