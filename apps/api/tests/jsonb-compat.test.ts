/**
 * Compatibilidade jsonb (STD-06): prova que documentos jsonb no formato de HOJE
 * continuam passando pelo código de PRODUÇÃO depois de qualquer fatia de rename. As
 * fixtures de `fixtures/jsonb/*.json` (ver `01-34-SUMMARY.md`: sintéticas, geradas por
 * `tools/std/gerar-fixtures-jsonb.ts`, não dado real de tenant) são inseridas por SQL
 * cru — nunca pelo helper TS de insert — para que a camada TypeScript não tenha chance
 * de traduzir nome de chave na entrada; só depois disso o teste lê pelo caminho de
 * código real (motor do fluxo, `processarOutbox`, `entregarPendentes`, `GET
 * /v1/contatos/:id`, `logAuditoria`, select tipado em `lead`/`contato`).
 *
 * Regra para TODAS as fases seguintes desta fase (repetida aqui em inglês, como
 * `01-34-PLAN.md` pede): a golden mismatch after a rename is a FAIL; a golden may only
 * be re-recorded when Sonnet proves the differing key is not stored in any jsonb
 * column (listed in that plan's SUMMARY and re-checked in 01-32 FINAL-REVIEW invariant
 * (o)).
 *
 * Desvios do plano (detalhados em `01-34-SUMMARY.md`):
 * - "outbox group" lê `mensagem.dados` (não `outbox_mensagem`, que não tem coluna
 *   jsonb nenhuma — é só uma fila).
 * - grupo "audit": não existe endpoint de leitura de auditoria na `api` hoje; o teste
 *   lê pela tabela drizzle `logAuditoria`, o mesmo objeto que `registrarAuditoria`
 *   escreve.
 * - grupo "crm": `contato.atributos` tem endpoint real (`GET /v1/contatos/:id`);
 *   `lead.utm`/`lead.customizados` não têm endpoint em `apps/api` nem em `apps/crm`
 *   acessível fora de uma requisição Next.js — lidos por select tipado direto nas
 *   colunas drizzle (`lead.utm`, `lead.customizados`), que é o mesmo objeto de coluna
 *   que qualquer leitura futura usaria.
 */

process.env['PIPE_FILAS'] = 'memoria';
process.env['PIPE_WHATSAPP_CLIENTE'] = 'duble';
process.env['DATABASE_URL'] ??= 'postgres://pipe:pipe@localhost:5433/pipe';
process.env['DATABASE_URL_APP'] ??= 'postgres://pipe_app:pipe_app@localhost:5433/pipe';

import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { logAuditoria, lead } from '@pipe/db/schema';
import type { Contexto } from '@pipe/core';
import { criarEntrada, processarEntrada } from '@pipe/core';
import { dubleWhatsApp, processarOutbox } from '@pipe/workers';

const { montarCenario } = await import('./ajuda.js');
const { subirApi } = await import('../src/servidor.js');
const { noTenant } = await import('../src/banco.js');
const { carregarFluxo } = await import('../src/dominio/fluxo.js');
const { entregarPendentes } = await import('../src/webhooks-saida.js');

type Cenario = Awaited<ReturnType<typeof montarCenario>>;
type ApiNoAr = Awaited<ReturnType<typeof subirApi>>;

const FIXTURES_DIR = fileURLToPath(new URL('./fixtures/jsonb/', import.meta.url));
const GOLDEN_DIR = join(FIXTURES_DIR, 'golden');

function carregarFixture(nome: string): { id: string; [campo: string]: unknown }[] {
  return JSON.parse(readFileSync(join(FIXTURES_DIR, nome), 'utf8')) as {
    id: string;
    [campo: string]: unknown;
  }[];
}

/**
 * `RECORD_GOLDEN=1` grava `golden/<nome>`; sem a variável, compara contra o que já
 * está gravado. Golden diferente depois de um rename é FALHA — só se re-grava com
 * prova (ver cabeçalho deste arquivo).
 */
function golden(nome: string, valor: unknown): void {
  const caminho = join(GOLDEN_DIR, nome);
  if (process.env['RECORD_GOLDEN'] === '1') {
    mkdirSync(GOLDEN_DIR, { recursive: true });
    writeFileSync(caminho, `${JSON.stringify(valor, null, 2)}\n`);
    return;
  }
  if (!existsSync(caminho)) {
    throw new Error(`golden ausente: ${caminho}. Rode com RECORD_GOLDEN=1 primeiro.`);
  }
  const esperado = JSON.parse(readFileSync(caminho, 'utf8')) as unknown;
  expect(valor).toEqual(esperado);
}

/** IDs fixos: o resultado golden inclui `stateId@<fluxoId>` como nome de chave — precisa
 * ser estável entre execuções, senão todo `RECORD_GOLDEN` muda a chave sozinho. */
const FLUXO_ID_RUN = '10000000-0000-4000-8000-000000000001';
const VERSAO_ID_RUN = '10000000-0000-4000-8000-000000000002';
const FLUXO_ID_RESUME = '20000000-0000-4000-8000-000000000001';
const VERSAO_ID_RESUME = '20000000-0000-4000-8000-000000000002';

/**
 * Remonta, com SQL cru e os valores exatos das fixtures (`bloco.conteudo/posicao`,
 * `transicao.condicao`, `fluxo_versao.global`), o MESMO fluxo sintético de
 * `packages/core/src/fluxo/fixtures/editor-sintetico.json` que gerou essas fixtures —
 * a fiação (código do bloco, de/para) é montada aqui porque a fixture só guarda o
 * VALOR de cada coluna, não a estrutura entre linhas.
 */
async function montarFluxoDeTeste(
  cenario: Cenario,
  fluxoId: string,
  versaoId: string,
): Promise<void> {
  const global = carregarFixture('flow-version-global.json')[0]!['value'];
  const blocos = carregarFixture('flow-block-content.json');
  const posicoes = new Map(
    carregarFixture('flow-block-position.json').map((r) => [r.id, r['value']]),
  );
  const condicoes = carregarFixture('flow-transition-condition.json');

  await cenario.dono.execute(sql`
    insert into fluxo (id, tenant_id, nome, tipo, estado)
    values (${fluxoId}::uuid, ${cenario.tenantId}::uuid, 'Fluxo de teste (jsonb-compat)', 'fluxo', 'publicado')
  `);
  await cenario.dono.execute(sql`
    insert into fluxo_versao (id, tenant_id, fluxo_id, versao, estado, global)
    values (${versaoId}::uuid, ${cenario.tenantId}::uuid, ${fluxoId}::uuid, 1, 'publicada', ${JSON.stringify(global)}::jsonb)
  `);

  const codigoParaId = new Map<string, string>();
  for (const b of blocos) {
    const conteudo = b['value'] as { original: { id: string } };
    const codigo = conteudo.original.id;
    const blocoId = randomUUID();
    codigoParaId.set(codigo, blocoId);
    await cenario.dono.execute(sql`
      insert into bloco (id, tenant_id, versao_id, codigo, nome, tipo, conteudo, posicao)
      values (
        ${blocoId}::uuid, ${cenario.tenantId}::uuid, ${versaoId}::uuid, ${codigo}, ${codigo}, 'mensagem',
        ${JSON.stringify(b['value'])}::jsonb, ${JSON.stringify(posicoes.get(b.id) ?? {})}::jsonb
      )
    `);
  }

  // Acha, pelo CONTEÚDO da condição (não pela ordem do array — a consulta que gerou a
  // fixture não tem `order by`), qual transição cada documento fixture era.
  const acha = (pred: (c: { source?: string; variable?: string; values?: string[] }) => boolean) => {
    const registro = condicoes.find((c) => {
      const conds = (c['value'] as { conditions: unknown[] }).conditions;
      return Array.isArray(conds) && conds.some((cond) => pred(cond as never));
    });
    if (!registro) throw new Error('fixture de transição esperada não encontrada');
    return registro['value'];
  };
  const condMenuFinanceiro = acha((c) => c.source === 'input' && !!c.values?.includes('Financeiro'));
  const condMenuSuporte = acha((c) => c.source === 'input' && !!c.values?.includes('Suporte'));
  const condDeskTicket = acha((c) => c.variable === 'input.content@status');
  const condDeskErro = acha((c) => c.variable === 'desk_forwardToDeskState_status');

  const transicao = async (
    de: string,
    para: string,
    condicao: unknown,
    ordem: number,
  ): Promise<void> => {
    await cenario.dono.execute(sql`
      insert into transicao (tenant_id, versao_id, de_bloco_id, para_bloco_id, condicao, ordem)
      values (
        ${cenario.tenantId}::uuid, ${versaoId}::uuid, ${codigoParaId.get(de)}::uuid,
        ${codigoParaId.get(para)}::uuid, ${JSON.stringify(condicao)}::jsonb, ${ordem}
      )
    `);
  };

  await transicao('onboarding', 'boas-vindas', {}, 0);
  await transicao('boas-vindas', 'menu', {}, 0);
  await transicao('menu', 'financeiro', condMenuFinanceiro, 0);
  await transicao('menu', 'desk:suporte', condMenuSuporte, 1);
  await transicao('menu', 'nao-entendi', {}, 2);
  await transicao('financeiro', 'onboarding', {}, 0);
  await transicao('nao-entendi', 'menu', {}, 0);
  await transicao('desk:suporte', 'pos-atendimento', condDeskTicket, 0);
  await transicao('desk:suporte', 'nao-entendi', condDeskErro, 1);
  await transicao('pos-atendimento', 'menu', {}, 0);
}

interface ResultadoDoMotor {
  mensagens: unknown[];
  estadoFinalId: string | null;
  variaveis: Record<string, string>;
}

async function rodarMotor(
  cenario: Cenario,
  fluxoId: string,
  versaoId: string,
  variaveisIniciais: Record<string, string>,
  textoDeEntrada: string,
): Promise<ResultadoDoMotor> {
  const { fluxo } = await noTenant(cenario.tenantId, (tx) =>
    carregarFluxo(tx, { fluxoId, versaoId }),
  );
  const mensagens: unknown[] = [];
  const contexto: Contexto = {
    usuario: `contato-jsonb-compat-${randomUUID().slice(0, 8)}`,
    fluxo,
    entrada: criarEntrada({
      id: `jsonb-compat-${randomUUID().slice(0, 8)}`,
      tipo: 'text/plain',
      conteudo: textoDeEntrada,
      de: 'jsonb-compat',
    }),
    variaveis: { ...variaveisIniciais },
    entradaContexto: new Map(),
    contato: null,
    servicos: {
      enviar: async (m) => {
        mensagens.push(m);
      },
      encaminharParaAtendimento: async () => {
        throw new Error('não usado no teste de compatibilidade jsonb');
      },
      registrarEvento: async () => {},
    },
  };
  const rastro = await processarEntrada(contexto, {});
  return { mensagens, estadoFinalId: rastro.estadoFinalId, variaveis: contexto.variaveis };
}

let cenario: Cenario;
let api: ApiNoAr;

beforeAll(async () => {
  cenario = await montarCenario(`jsonb-compat-${randomUUID().slice(0, 8)}`);
  api = await subirApi(0);
}, 180_000);

afterAll(async () => {
  await api?.fechar();
  await cenario?.encerrar();
});

describe('jsonb-compat: flow version', () => {
  it('um fluxo remontado com bloco.conteudo/posicao e transicao.condicao das fixtures roda uma entrada fixa', async () => {
    await montarFluxoDeTeste(cenario, FLUXO_ID_RUN, VERSAO_ID_RUN);
    const resultado = await rodarMotor(cenario, FLUXO_ID_RUN, VERSAO_ID_RUN, {}, 'oi');
    expect(resultado.estadoFinalId).toBe('boas-vindas');
    golden('flow-run.json', resultado);
  });
});

describe('jsonb-compat: flow execution (resume)', () => {
  it('um execucao_fluxo.contexto guardado é retomado com uma entrada fixa', async () => {
    await montarFluxoDeTeste(cenario, FLUXO_ID_RESUME, VERSAO_ID_RESUME);
    const contextoGuardado = carregarFixture('flow-execution-context.json')[0]!['value'] as Record<
      string,
      string
    >;
    const resultado = await rodarMotor(
      cenario,
      FLUXO_ID_RESUME,
      VERSAO_ID_RESUME,
      contextoGuardado,
      'oi',
    );
    // As chaves do documento guardado sobrevivem no meio das novas: é a prova de
    // compatibilidade. `stateId@<fluxoId antigo>` fica como legado inofensivo.
    expect(resultado.variaveis['nome']).toBe(contextoGuardado['nome']);
    golden('flow-resume.json', resultado);
  });
});

describe('jsonb-compat: outbox', () => {
  it('mensagem.dados (pergunta de menu) é lido pelo construtor de entrega de verdade, canal mockado', async () => {
    const contatoId = randomUUID();
    const conversaId = randomUUID();
    const mensagemId = randomUUID();
    const telefone = '+5511900000999';
    const dadosFixture = carregarFixture('outbox-message-data.json')[0]!['value'];

    await cenario.dono.execute(sql`
      insert into contato (id, tenant_id, nome, telefone_e164)
      values (${contatoId}::uuid, ${cenario.tenantId}::uuid, 'Contato jsonb-compat', ${telefone})
    `);
    const { rows: conversaRows } = await cenario.dono.execute<{ id: string }>(sql`
      insert into conversa (id, tenant_id, inbox_id, contato_id, estado)
      values (${conversaId}::uuid, ${cenario.tenantId}::uuid, ${cenario.inboxId}::uuid, ${contatoId}::uuid, 'em_atendimento')
      returning id
    `);
    expect(conversaRows[0]?.id).toBe(conversaId);
    await cenario.dono.execute(sql`
      insert into mensagem (id, tenant_id, conversa_id, direcao, autor_tipo, tipo, conteudo, estado_entrega, dados)
      values (
        ${mensagemId}::uuid, ${cenario.tenantId}::uuid, ${conversaId}::uuid, 'saida', 'bot', 'texto',
        'Prazer, Compat. Como posso ajudar?', 'pendente', ${JSON.stringify(dadosFixture)}::jsonb
      )
    `);
    await cenario.dono.execute(sql`
      insert into outbox_mensagem (tenant_id, mensagem_id, estado)
      values (${cenario.tenantId}::uuid, ${mensagemId}::uuid, 'pendente')
    `);

    const capturado: unknown[] = [];
    const espiao = vi.spyOn(dubleWhatsApp, 'enviar').mockImplementation(async (pedido) => {
      capturado.push(pedido);
      return { idProvedor: 'wamid.JSONB-COMPAT' };
    });
    try {
      await processarOutbox();
    } finally {
      espiao.mockRestore();
    }

    const pedido = capturado.find(
      (p): p is { para: string; conteudo: unknown } =>
        typeof p === 'object' && p !== null && (p as { para?: string }).para === '5511900000999',
    );
    expect(pedido).toBeDefined();
    golden('outbox-delivery.json', { conteudo: pedido!.conteudo });
  });

  it('entrega_webhook.payload é lido pelo remetente de webhook de verdade, fetch mockado', async () => {
    const payloadFixture = carregarFixture('outbox-webhook-payload.json')[0]!['value'];
    const { rows: webhookRows } = await cenario.dono.execute<{ id: string }>(sql`
      insert into webhook_saida (tenant_id, url, eventos, segredo, ativo)
      values (${cenario.tenantId}::uuid, 'https://jsonb-compat.exemplo.pipe.app/webhook',
              '{conversa.criada}'::text[], 'segredo-jsonb-compat', true)
      returning id
    `);
    const webhookId = webhookRows[0]!.id;
    await cenario.dono.execute(sql`
      insert into entrega_webhook (tenant_id, webhook_id, evento, payload, estado)
      values (${cenario.tenantId}::uuid, ${webhookId}::uuid, 'conversa.criada', ${JSON.stringify(payloadFixture)}::jsonb, 'pendente')
    `);

    const capturado: { url: string; corpo: unknown }[] = [];
    const fetchDeVerdade = fetch;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        if (url.startsWith(api.url)) return fetchDeVerdade(url, init);
        capturado.push({ url, corpo: JSON.parse(String(init?.body ?? '{}')) });
        return new Response('ok', { status: 200 });
      }),
    );
    try {
      await entregarPendentes(cenario.tenantId);
    } finally {
      vi.unstubAllGlobals();
    }

    expect(capturado).toHaveLength(1);
    golden('webhook-delivery.json', { corpo: capturado[0]!.corpo });
  });
});

describe('jsonb-compat: audit', () => {
  it('log_auditoria.antes/depois lidos pela tabela drizzle batem com o documento da fixture', async () => {
    const fixture = carregarFixture('audit-before-after.json')[0]!;
    const id = randomUUID();
    await cenario.dono.execute(sql`
      insert into log_auditoria (id, tenant_id, ator_tipo, acao, objeto_tipo, objeto_id, antes, depois)
      values (
        ${id}::uuid, ${cenario.tenantId}::uuid, 'usuario', 'alterou', 'contato', ${randomUUID()}::uuid,
        ${JSON.stringify(fixture['antes'])}::jsonb, ${JSON.stringify(fixture['depois'])}::jsonb
      )
    `);

    const linha = await noTenant(cenario.tenantId, async (tx) => {
      const [linha] = await tx
        .select({ antes: logAuditoria.antes, depois: logAuditoria.depois })
        .from(logAuditoria)
        .where(eq(logAuditoria.id, id))
        .limit(1);
      return linha;
    });
    expect(linha?.antes).toEqual(fixture['antes']);
    expect(linha?.depois).toEqual(fixture['depois']);
  });
});

describe('jsonb-compat: crm', () => {
  it('contato.atributos e lead.utm/customizados lidos pelo caminho de leitura real batem com as fixtures', async () => {
    const atributosFixture = carregarFixture('crm-contact-attributes.json')[0]!['value'];
    const utmFixture = carregarFixture('crm-lead-utm.json')[0]!['value'];
    const customizadosFixture = carregarFixture('crm-lead-custom-fields.json')[0]!['value'];

    const contatoId = randomUUID();
    await cenario.dono.execute(sql`
      insert into contato (id, tenant_id, nome, telefone_e164, atributos)
      values (${contatoId}::uuid, ${cenario.tenantId}::uuid, 'Contato CRM jsonb-compat',
              '+5511900000998', ${JSON.stringify(atributosFixture)}::jsonb)
    `);
    const leadId = randomUUID();
    await cenario.dono.execute(sql`
      insert into lead (id, tenant_id, contato_id, utm, customizados)
      values (${leadId}::uuid, ${cenario.tenantId}::uuid, ${contatoId}::uuid,
              ${JSON.stringify(utmFixture)}::jsonb, ${JSON.stringify(customizadosFixture)}::jsonb)
    `);

    // contato.atributos: caminho real, `GET /v1/contatos/:id` (apps/api/src/controladores/catalogo.ts).
    const respostaContato = await fetch(`${api.url}/v1/contatos/${contatoId}`, {
      headers: { authorization: `Bearer ${cenario.token}` },
    });
    expect(respostaContato.status).toBe(200);
    const corpoContato = (await respostaContato.json()) as { atributos: unknown };
    expect(corpoContato.atributos).toEqual(atributosFixture);

    // lead.utm/lead.customizados: sem endpoint hoje (ver cabeçalho do arquivo) — select
    // tipado direto na coluna drizzle, o mesmo objeto de coluna que qualquer leitura usaria.
    const leadLido = await noTenant(cenario.tenantId, async (tx) => {
      const [linha] = await tx
        .select({ utm: lead.utm, customizados: lead.customizados })
        .from(lead)
        .where(eq(lead.id, leadId))
        .limit(1);
      return linha;
    });
    expect(leadLido?.utm).toEqual(utmFixture);
    expect(leadLido?.customizados).toEqual(customizadosFixture);

    golden('crm-read.json', {
      contato: { atributos: corpoContato.atributos },
      lead: { utm: leadLido?.utm, customizados: leadLido?.customizados },
    });
  });
});
