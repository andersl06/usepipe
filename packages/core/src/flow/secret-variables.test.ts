/**
 * P11 — `{{secret.*}}` (Blip "Variáveis sensíveis"): resolves only while an HTTP action's settings
 * are substituted, and never reaches `variables`, the trace or an error message. Values are invented.
 */
import { describe, expect, it } from 'vitest';
import {
  FONTES_SUPORTADAS,
  SECRET_MASK,
  createInbound,
  getVariable,
  maskSecrets,
  replaceVariables,
} from './context.js';
import type { Context, OutputMessage, PedidoDeHttp, RespostaDeHttp } from './context.js';
import { EngineError, SuspensaoDeProcessHttp, processInbound } from './manager.js';
import type { Acao, FlowBlip } from './modelos.js';

const SECRETS: Record<string, string> = {
  apiToken: 'tok-INVENTED-1234567890',
  credentials: '{"clientId":"id-invented","clientSecret":"shh-invented-999"}',
};

function contextWith(
  actions: Acao[],
  overrides: {
    callHttp?: (p: PedidoDeHttp) => Promise<RespostaDeHttp>;
    suspendHttp?: (p: PedidoDeHttp, c: unknown) => Promise<never>;
  } = {},
) {
  const sent: string[] = [];
  const requests: PedidoDeHttp[] = [];
  const lookups: string[] = [];
  const flow: FlowBlip = {
    id: 'f1',
    states: [{ id: 'root', root: true, input: {}, outputActions: actions, outputs: [] }],
  };
  const variables: Record<string, string> = {};
  const context: Context = {
    user: 'user@domain',
    flow,
    inbound: createInbound({ id: 'm1', tipo: 'text/plain', conteudo: 'oi' }),
    variables,
    inboundContext: new Map(),
    contact: null,
    services: {
      async send(m: OutputMessage) {
        sent.push(String(m.conteudo));
      },
      async forwardForAttendance() {
        return { id: 'atd', status: 'Open' };
      },
      async registerEvent() {},
      async callHttp(p) {
        requests.push(p);
        return overrides.callHttp ? overrides.callHttp(p) : { status: 200, corpo: '{"ok":true}' };
      },
      ...(overrides.suspendHttp ? { suspendHttp: overrides.suspendHttp } : {}),
      async resolveSecret(name) {
        lookups.push(name);
        return SECRETS[name] ?? null;
      },
    },
  };
  return { context, sent, requests, lookups, variables };
}

describe('secret variable source', () => {
  it('is a supported source', () => {
    expect(FONTES_SUPORTADAS.has('secret')).toBe(true);
  });

  it('reads empty outside an HTTP action and never asks the api for the value', async () => {
    const { context, lookups } = contextWith([]);
    expect(await getVariable(context, 'secret.apiToken')).toBeNull();
    expect(await replaceVariables('x{{secret.apiToken}}y', context)).toBe('xy');
    expect(lookups).toEqual([]);
  });

  it('resolves with the secrets option and records the value (and a JSON property) for masking', async () => {
    const { context } = contextWith([]);
    const secrets = new Set<string>();
    expect(await getVariable(context, 'secret.apiToken', { secrets })).toBe(SECRETS['apiToken']);
    expect(await getVariable(context, 'secret.credentials@clientSecret', { secrets })).toBe('shh-invented-999');
    expect(await getVariable(context, 'secret.missing', { secrets })).toBeNull();
    expect(secrets.has(SECRETS['apiToken']!)).toBe(true);
    expect(secrets.has('shh-invented-999')).toBe(true);
  });

  it('SendMessage and SetVariable get an empty value, so the secret never reaches the customer or the context', async () => {
    const { context, sent, variables, lookups } = contextWith([
      { type: 'SendMessage', settings: { type: 'text/plain', content: 'token=[{{secret.apiToken}}]' } },
      { type: 'SetVariable', settings: { variable: 'copia', value: '{{secret.apiToken}}' } },
    ]);
    await processInbound(context);
    expect(sent).toEqual(['token=[]']);
    expect(variables['copia']).toBe('');
    expect(lookups).toEqual([]);
  });

  it('ProcessHttp substitutes the secret in url, headers and body', async () => {
    const { context, requests } = contextWith([
      {
        type: 'ProcessHttp',
        settings: {
          method: 'POST',
          uri: 'https://api.example.test/v1?key={{secret.apiToken}}',
          headers: { Authorization: 'Bearer {{secret.apiToken}}' },
          body: '{"client":"{{secret.credentials@clientId}}"}',
          responseStatusVariable: 'status',
        },
      },
    ]);
    await processInbound(context);
    expect(requests).toHaveLength(1);
    expect(requests[0]!.url).toBe(`https://api.example.test/v1?key=${SECRETS['apiToken']}`);
    expect(requests[0]!.cabecalhos['Authorization']).toBe(`Bearer ${SECRETS['apiToken']}`);
    expect(requests[0]!.corpo).toBe('{"client":"id-invented"}');
    expect(requests[0]!.sensivel).toBe(true);
  });

  it('a ProcessHttp without secrets is not marked sensitive', async () => {
    const { context, requests } = contextWith([
      { type: 'ProcessHttp', settings: { uri: 'https://api.example.test/', responseStatusVariable: 's' } },
    ]);
    await processInbound(context);
    expect(requests[0]!.sensivel).toBeUndefined();
  });

  it('masks a secret the service echoes before writing the response body to a variable', async () => {
    const { context, variables } = contextWith(
      [
        {
          type: 'ProcessHttp',
          settings: {
            uri: 'https://api.example.test/',
            headers: { 'X-Key': '{{secret.apiToken}}' },
            responseBodyVariable: 'resposta',
          },
        },
      ],
      { callHttp: async (p) => ({ status: 401, corpo: `{"error":"invalid key ${p.cabecalhos['X-Key']}"}` }) },
    );
    await processInbound(context);
    expect(variables['resposta']).toBe(`{"error":"invalid key ${SECRET_MASK}"}`);
    expect(JSON.stringify(variables)).not.toContain(SECRETS['apiToken']);
  });

  it('masks the secret in the trace and in the error when the HTTP action fails', async () => {
    const { context } = contextWith(
      [{ type: 'ProcessHttp', settings: { uri: 'https://api.example.test/{{secret.apiToken}}' } }],
      {
        callHttp: async (p) => {
          throw new Error(`fetch failed for ${p.url}`);
        },
      },
    );
    const error = await processInbound(context).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(EngineError);
    const serialized = JSON.stringify({ message: (error as Error).message, rastro: (error as EngineError).rastro });
    expect(serialized).not.toContain(SECRETS['apiToken']);
    expect(serialized).toContain(SECRET_MASK);
    const cause = (error as { cause?: { cause?: Error } }).cause?.cause;
    expect(String(cause?.message ?? '')).not.toContain(SECRETS['apiToken']);
  });

  it('marks a suspended request as sensitive and masks the body when the suspension resumes', async () => {
    const actions: Acao[] = [
      {
        type: 'ProcessHttp',
        settings: {
          uri: 'https://api.example.test/',
          headers: { Authorization: 'Bearer {{secret.apiToken}}' },
          responseBodyVariable: 'corpo',
        },
      },
    ];
    const first = contextWith(actions, {
      suspendHttp: async (p, c) => {
        throw new SuspensaoDeProcessHttp(p, c as never);
      },
    });
    const suspended = await processInbound(first.context).catch((e: unknown) => e);
    expect(suspended).toBeInstanceOf(SuspensaoDeProcessHttp);
    expect((suspended as SuspensaoDeProcessHttp).pedido.sensivel).toBe(true);

    const second = contextWith(actions);
    await processInbound(second.context, {
      retomarProcessHttp: {
        lista: 'conteudo',
        estadoId: 'root',
        indice: 0,
        resposta: { status: 200, corpo: `echo ${SECRETS['apiToken']}` },
      },
    });
    expect(second.variables['corpo']).toBe(`echo ${SECRET_MASK}`);
  });
});

describe('maskSecrets', () => {
  it('masks raw, JSON-escaped and URL-encoded forms, longest first, and ignores very short values', () => {
    const secrets = new Set(['a"b/c-long', 'ab', 'key+with space']);
    expect(maskSecrets('x a"b/c-long y', secrets)).toBe(`x ${SECRET_MASK} y`);
    expect(maskSecrets('x a\\"b/c-long y', secrets)).toBe(`x ${SECRET_MASK} y`);
    expect(maskSecrets('q=key%2Bwith%20space', secrets)).toBe(`q=${SECRET_MASK}`);
    expect(maskSecrets('ab stays', secrets)).toBe('ab stays');
    expect(maskSecrets('nothing', null)).toBe('nothing');
  });
});
