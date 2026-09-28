/**
 * Core of `tools/std/gerar-fixtures-jsonb.ts`, placed here (rather than in `tools/std/`) because it needs to resolve `drizzle-orm`/`@pipe/db` and all of the `api`'s domain code through this workspace's `node_modules` — `tools/std` does not have those packages installed. It is not a test (no `.test.` in the name, so `node --test`/Vitest do not collect it); it is only the part of the generator that must run from here. See the header of `tools/std/gerar-fixtures-jsonb.ts` for the purpose and the owner's decisions.
 */

import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { sql } from 'drizzle-orm';
import { registrarAuditoria } from '@pipe/db';
import { montarCenario, assinar, payloadOfMessage, APP_SECRET } from './ajuda.js';

const RAIZ = fileURLToPath(new URL('../../../', import.meta.url));

const FIXTURE_FLOW: unknown = JSON.parse(
  readFileSync(`${RAIZ}packages/core/src/flow/fixtures/editor-sintetico.json`, 'utf8'),
);

export type Registro = Record<string, unknown>;

/**
 * Generates all fixtures inside a SINGLE disposable tenant (created and deleted here, the same way `montarCenario` already does for the entire test suite) and returns the raw records, keyed by fixture file name — the caller redacts and writes them.
 */
export async function gerarRegistros(): Promise<Map<string, Registro[]>> {
  const { upApi } = await import('../src/servidor.js');
  const { noTenant } = await import('../src/database.js');
  const { importFlowOfBlip } = await import('../src/domain/flow.js');
  const { emitir } = await import('../src/webhooks-saida.js');

  const arquivos = new Map<string, Registro[]>();
  const acumular = (file: string, registro: Registro): void => {
    const lista = arquivos.get(file) ?? [];
    lista.push(registro);
    arquivos.set(file, lista);
  };

  const cenario = await montarCenario(`gerar-jsonb-${randomUUID().slice(0, 8)}`);
  const api = await upApi(0);

  async function falar(channelId: string, de: string, texto: string): Promise<void> {
    const corpo = JSON.stringify(payloadOfMessage(de, texto));
    const resposta = await fetch(`${api.url}/webhooks/whatsapp/${channelId}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-hub-signature-256': assinar(corpo) },
      body: corpo,
    });
    if (resposta.status !== 200) {
      throw new Error(`webhook whatsapp falhou: ${resposta.status} ${await resposta.text()}`);
    }
  }

  try {
    // --- flow version + flow execution + outbox (mensagem.dados) ---
    // Reuses the engine's synthetic fixture (the same one from `apps/api/tests/fluxo.test.ts`):
    // publicar grava fluxo_versao.global, bloco.conteudo/posicao, transicao.condicao;
    // conversar com o bot grava execucao_fluxo.contexto, execucao_passo.entrada/saida e,
    // no menu (select), mensagem.dados.
    const publication = await noTenant(cenario.tenantId, (tx) =>
      importFlowOfBlip(tx, {
        tenantId: cenario.tenantId,
        name: 'Gerador de fixtures',
        channelId: cenario.channelId,
        json: FIXTURE_FLOW,
        publicar: true,
      }),
    );

    const ANA = '5511922220001';
    await falar(cenario.channelId, ANA, 'oi');
    await falar(cenario.channelId, ANA, 'Ana');
    await falar(cenario.channelId, ANA, '2'); // escolhe "Suporte", transfere pra fila

    const { rows: versaoRows } = await cenario.dono.execute<{ global: unknown }>(
      sql`select global from fluxo_versao where id = ${publication.versaoId}::uuid`,
    );
    acumular('flow-version-global.json', { id: publication.versaoId, value: versaoRows[0]?.global });

    const { rows: blockRows } = await cenario.dono.execute<{
      id: string;
      content: unknown;
      position: unknown;
    }>(sql`select id, conteudo, posicao from bloco where versao_id = ${publication.versaoId}::uuid`);
    for (const b of blockRows) {
      acumular('flow-block-content.json', { id: b.id, value: b.content });
      acumular('flow-block-position.json', { id: b.id, value: b.position });
    }

    const { rows: transitionRows } = await cenario.dono.execute<{ id: string; condition: unknown }>(
      sql`select id, condicao from transicao where versao_id = ${publication.versaoId}::uuid and condicao <> '{}'::jsonb`,
    );
    for (const t of transitionRows) {
      acumular('flow-transition-condition.json', { id: t.id, value: t.condition });
    }

    // `cenario.dono` tem `bypassrls` (papel dono): toda leitura daqui em diante filtra
    // Set `tenant_id = cenario.tenantId` explicitly, never by phone/id alone — without RLS
    // enforcing it, a test phone number equal to one from another run (of this or another
    // agente, no mesmo Postgres local compartilhado) vazaria linha de outro tenant.
    const { rows: executionRows } = await cenario.dono.execute<{ id: string; context: unknown }>(sql`
      select e.id, e.contexto from execucao_fluxo e
        join conversa c on c.id = e.conversa_id
        join contato ct on ct.id = c.contato_id
       where e.tenant_id = ${cenario.tenantId}::uuid and ct.telefone_e164 = ${`+${ANA}`}
    `);
    for (const e of executionRows) {
      acumular('flow-execution-context.json', { id: e.id, value: e.context });
    }

    const { rows: passoRows } = await cenario.dono.execute<{
      id: string;
      inbound: unknown;
      saida: unknown;
    }>(sql`
      select ep.id, ep.entrada, ep.saida from execucao_passo ep
        join execucao_fluxo e on e.id = ep.execucao_id
        join conversa c on c.id = e.conversa_id
        join contato ct on ct.id = c.contato_id
       where ep.tenant_id = ${cenario.tenantId}::uuid and ct.telefone_e164 = ${`+${ANA}`}
    `);
    for (const p of passoRows) {
      if (p.inbound !== null) acumular('flow-step-input.json', { id: p.id, value: p.inbound });
      if (p.saida !== null) acumular('flow-step-output.json', { id: p.id, value: p.saida });
    }

    const { rows: messageRows } = await cenario.dono.execute<{ id: string; data: unknown }>(sql`
      select m.id, m.dados from mensagem m
        join conversa c on c.id = m.conversa_id
        join contato ct on ct.id = c.contato_id
       where m.tenant_id = ${cenario.tenantId}::uuid and ct.telefone_e164 = ${`+${ANA}`}
         and m.dados is not null
    `);
    for (const m of messageRows) {
      acumular('outbox-message-data.json', { id: m.id, value: m.data });
    }

    // --- flow execution: process_http_execucao (suspenso, sem chamada de rede) ---
    // `contexto.servicos.suspenderHttp` is always set in `rodarFluxoNaEntrada`, so
    // every ProcessHttp action ALWAYS suspends before making a real network call — the row is created
    // with entrada/contexto/pedido filled in and `resposta` null (state 'pendente'), without
    // any request ever leaving the machine.
    const flowWithProcessHttp = JSON.parse(JSON.stringify(FIXTURE_FLOW)) as {
      flow: Record<string, { $enteringCustomActions: unknown[] }>;
    };
    flowWithProcessHttp.flow['boas-vindas']!.$enteringCustomActions.push({
      $id: 'ph1',
      type: 'ProcessHttp',
      settings: {
        method: 'POST',
        uri: 'https://example.com/pipe/gerar-fixture',
        headers: { 'x-api-key': 'chave-de-exemplo' },
        body: { origem: 'gerar-fixtures-jsonb' },
        requestTimeout: 5,
        responseStatusVariable: 'status_http',
        responseBodyVariable: 'corpo_http',
      },
      conditions: [],
    });
    await noTenant(cenario.tenantId, (tx) =>
      importFlowOfBlip(tx, {
        tenantId: cenario.tenantId,
        name: 'Gerador de fixtures (ProcessHttp)',
        channelId: cenario.channelId,
        json: flowWithProcessHttp,
        publicar: true,
      }),
    );
    const CAIO = '5511922220002';
    await falar(cenario.channelId, CAIO, 'oi');

    const { rows: processoRows } = await cenario.dono.execute<{
      id: string;
      entrada: unknown;
      contexto: unknown;
      pedido: unknown;
      resposta: unknown;
    }>(sql`
      select p.id, p.entrada, p.contexto, p.pedido, p.resposta from process_http_execucao p
        join execucao_fluxo e on e.id = p.execucao_id
        join conversa c on c.id = e.conversa_id
        join contato ct on ct.id = c.contato_id
       where p.tenant_id = ${cenario.tenantId}::uuid and ct.telefone_e164 = ${`+${CAIO}`}
    `);
    for (const p of processoRows) {
      acumular('flow-process-http.json', {
        id: p.id,
        entrada: p.entrada,
        contexto: p.contexto,
        pedido: p.pedido,
        resposta: p.resposta,
      });
    }

    // --- flow execution: posicao_no_roteador.contexto (roteador de verdade) ---
    {
      const { rows: channelRows } = await cenario.dono.execute<{ id: string }>(sql`
        insert into canal (tenant_id, tipo, nome, config)
        values (${cenario.tenantId}::uuid, 'whatsapp_cloud', 'Roteador de teste', ${JSON.stringify({
          appSecret: APP_SECRET,
          verifyToken: 'token-de-inscricao',
          phoneNumberId: '555000333',
          tokenAcesso: 'token-falso-do-roteador',
        })}::jsonb)
        returning id
      `);
      const channelRouterId = channelRows[0]!.id;
      await cenario.dono.execute(sql`
        insert into inbox (tenant_id, canal_id, nome, fila_padrao_id)
        values (${cenario.tenantId}::uuid, ${channelRouterId}::uuid, 'Entrada do roteador', ${cenario.queueId}::uuid)
      `);

      const { rows: routerRows } = await cenario.dono.execute<{ id: string }>(sql`
        insert into fluxo (tenant_id, nome, canal_id, tipo, estado, short_name)
        values (${cenario.tenantId}::uuid, 'Roteador de teste', ${channelRouterId}::uuid, 'roteador', 'publicado', 'roteador-de-teste')
        returning id
      `);
      const routerId = routerRows[0]!.id;

      const service = await noTenant(cenario.tenantId, (tx) =>
        importFlowOfBlip(tx, {
          tenantId: cenario.tenantId,
          name: 'Serviço do roteador',
          channelId: null,
          json: FIXTURE_FLOW,
          publicar: true,
        }),
      );
      await cenario.dono.execute(
        sql`update fluxo set usa_contexto_do_roteador = true where id = ${service.flowId}::uuid`,
      );
      await cenario.dono.execute(sql`
        insert into roteador_servico (tenant_id, roteador_id, servico_id, nome, principal)
        values (${cenario.tenantId}::uuid, ${routerId}::uuid, ${service.flowId}::uuid, 'principal', true)
      `);

      const BIA = '5511922220004';
      await falar(channelRouterId, BIA, 'oi');
      await falar(channelRouterId, BIA, 'Bia');

      const { rows: positionRows } = await cenario.dono.execute<{ id: string; contexto: unknown }>(sql`
        select p.id, p.contexto from posicao_no_roteador p
          join contato ct on ct.id = p.contato_id
         where p.tenant_id = ${cenario.tenantId}::uuid and p.roteador_id = ${routerId}::uuid
           and ct.telefone_e164 = ${`+${BIA}`}
      `);
      for (const p of positionRows) {
        acumular('flow-router-context.json', { id: p.id, value: p.contexto });
      }
    }

    // --- outbox: entrega_webhook.payload (emitir() de verdade) ---
    const { rows: webhookRows } = await cenario.dono.execute<{ id: string }>(sql`
      insert into webhook_saida (tenant_id, url, eventos, segredo, ativo)
      values (${cenario.tenantId}::uuid, 'https://example.com/pipe/webhook',
              '{conversa.criada}'::text[], 'segredo-de-exemplo', true)
      returning id
    `);
    const webhookId = webhookRows[0]!.id;
    await noTenant(cenario.tenantId, async (tx) => {
      await emitir(tx, cenario.tenantId, 'conversa.criada', {
        conversa_id: randomUUID(),
        estado: 'na_fila',
        origem: 'gerar-fixtures-jsonb',
      });
    });
    const { rows: deliveryRows } = await cenario.dono.execute<{ id: string; payload: unknown }>(
      sql`select id, payload from entrega_webhook where webhook_id = ${webhookId}::uuid`,
    );
    for (const e of deliveryRows) {
      acumular('outbox-webhook-payload.json', { id: e.id, value: e.payload });
    }

    // --- crm: contato.atributos (POST /v1/contacts de verdade, chave escopo contatos:escrever) ---
    const responseContact = await fetch(`${api.url}/v1/contacts`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${cenario.token}`,
      },
      body: JSON.stringify({
        phoneE164: '+5511922220003',
        nome: 'Contato de exemplo',
        atributos: { plano: 'pro', origem_utm: 'anuncio-instagram', pontuacao_nps: 9 },
      }),
    });
    if (!responseContact.ok) {
      throw new Error(
        `POST /v1/contacts falhou: ${responseContact.status} ${await responseContact.text()}`,
      );
    }
    const contactCreated = (await responseContact.json()) as { id: string; atributos: unknown };
    acumular('crm-contact-attributes.json', { id: contactCreated.id, value: contactCreated.atributos });

    // --- audit: log_auditoria.antes/depois (registrarAuditoria() de verdade) ---
    await noTenant(cenario.tenantId, (tx) =>
      registrarAuditoria(tx, cenario.tenantId, {
        ator: { type: 'usuario', id: cenario.agentId },
        acao: 'alterou',
        objetoTipo: 'contato',
        objetoId: contactCreated.id,
        antes: { nome: 'Contato de exemplo', email: null, telefone_e164: '+5511922220003' },
        depois: {
          nome: 'Contato Editado',
          email: 'contato@example.com',
          telefone_e164: '+5511922220003',
        },
      }),
    );
    const { rows: auditRows } = await cenario.dono.execute<{
      id: string;
      antes: unknown;
      depois: unknown;
    }>(sql`
      select id, antes, depois from log_auditoria
       where tenant_id = ${cenario.tenantId}::uuid and objeto_id = ${contactCreated.id}::uuid
    `);
    for (const a of auditRows) {
      acumular('audit-before-after.json', { id: a.id, antes: a.antes, depois: a.depois });
    }

    // --- crm: lead.utm / lead.customizados ---
    // There is no dedicated write route for it today; the format matches what
    // `apps/crm/semente/semente-crm.ts:625-654` writes (referenced, not executed).
    const { rows: leadRows } = await cenario.dono.execute<{
      id: string;
      utm: unknown;
      customizados: unknown;
    }>(sql`
      insert into lead (tenant_id, contato_id, origem, campanha, utm, status, customizados)
      values (
        ${cenario.tenantId}::uuid, ${contactCreated.id}::uuid, 'Anúncio Instagram', 'novos-clientes-2026',
        ${JSON.stringify({ source: 'instagram', medium: 'cpc', campaign: 'novos-clientes-2026' })}::jsonb,
        'novo',
        ${JSON.stringify({
          faixa_patrimonio: 'R$ 100 a 250 mil',
          idade: 34,
          whatsapp_confirmado: 'sim',
          respondeu_campanha_julho: 'não',
        })}::jsonb
      )
      returning id, utm, customizados
    `);
    for (const l of leadRows) {
      acumular('crm-lead-utm.json', { id: l.id, value: l.utm });
      acumular('crm-lead-custom-fields.json', { id: l.id, value: l.customizados });
    }

    // --- template: template_mensagem.variaveis ---
    // No call to Meta's Graph API; it reproduces the SAME deterministic transformation as
    // apps/api/src/dominio/whatsapp/modelos.ts:207 (`Array.from({length:n}, (_,i)=>...)`).
    const howManyVariables = 2;
    const variablesDefault = Array.from(
      { length: howManyVariables },
      (_, i) => `Variável ${i + 1}`,
    );
    const { rows: templateRows } = await cenario.dono.execute<{ id: string; variables: unknown }>(sql`
      insert into template_mensagem (tenant_id, canal_id, nome, idioma, categoria, status_meta, corpo, variaveis)
      values (
        ${cenario.tenantId}::uuid, ${cenario.channelId}::uuid, 'boas_vindas_exemplo', 'pt_BR', 'utilidade',
        'aprovado', 'Olá {{1}}, seu pedido {{2}} foi confirmado.', ${JSON.stringify(variablesDefault)}::jsonb
      )
      returning id, variaveis as "variables"
    `);
    for (const t of templateRows) {
      acumular('template-variables.json', { id: t.id, value: t.variables });
    }

    return arquivos;
  } finally {
    await api.fechar();
    await cenario.encerrar();
  }
}
