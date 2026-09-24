/**
 * Núcleo de `tools/std/gerar-fixtures-jsonb.ts`, colocado aqui (e não em `tools/std/`)
 * porque precisa resolver `drizzle-orm`/`@pipe/db` e todo o código de domínio da `api`
 * pelo `node_modules` desta workspace — `tools/std` não tem esses pacotes instalados.
 * Não é teste (sem `.test.` no nome, `node --test`/vitest não o coletam); é só a parte
 * do gerador que precisa rodar a partir daqui. Ver o cabeçalho de
 * `tools/std/gerar-fixtures-jsonb.ts` para o propósito e as decisões do dono.
 */

import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { sql } from 'drizzle-orm';
import { registrarAuditoria } from '@pipe/db';
import { montarCenario, assinar, payloadDeMensagem, APP_SECRET } from './ajuda.js';

const RAIZ = fileURLToPath(new URL('../../../', import.meta.url));

const FIXTURE_FLUXO: unknown = JSON.parse(
  readFileSync(`${RAIZ}packages/core/src/fluxo/fixtures/editor-sintetico.json`, 'utf8'),
);

export type Registro = Record<string, unknown>;

/**
 * Gera todas as fixtures dentro de UM tenant descartável (criado e apagado aqui, como
 * `montarCenario` já faz para a suíte de teste inteira) e devolve os registros crus, por
 * nome de arquivo de fixture — quem chama redige e escreve.
 */
export async function gerarRegistros(): Promise<Map<string, Registro[]>> {
  const { subirApi } = await import('../src/servidor.js');
  const { noTenant } = await import('../src/banco.js');
  const { importarFluxoDaBlip } = await import('../src/dominio/fluxo.js');
  const { emitir } = await import('../src/webhooks-saida.js');

  const arquivos = new Map<string, Registro[]>();
  const acumular = (arquivo: string, registro: Registro): void => {
    const lista = arquivos.get(arquivo) ?? [];
    lista.push(registro);
    arquivos.set(arquivo, lista);
  };

  const cenario = await montarCenario(`gerar-jsonb-${randomUUID().slice(0, 8)}`);
  const api = await subirApi(0);

  async function falar(canalId: string, de: string, texto: string): Promise<void> {
    const corpo = JSON.stringify(payloadDeMensagem(de, texto));
    const resposta = await fetch(`${api.url}/webhooks/whatsapp/${canalId}`, {
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
    // Reaproveita a fixture sintética do motor (a mesma de apps/api/tests/fluxo.test.ts):
    // publicar grava fluxo_versao.global, bloco.conteudo/posicao, transicao.condicao;
    // conversar com o bot grava execucao_fluxo.contexto, execucao_passo.entrada/saida e,
    // no menu (select), mensagem.dados.
    const publicacao = await noTenant(cenario.tenantId, (tx) =>
      importarFluxoDaBlip(tx, {
        tenantId: cenario.tenantId,
        nome: 'Gerador de fixtures',
        canalId: cenario.canalId,
        json: FIXTURE_FLUXO,
        publicar: true,
      }),
    );

    const ANA = '5511922220001';
    await falar(cenario.canalId, ANA, 'oi');
    await falar(cenario.canalId, ANA, 'Ana');
    await falar(cenario.canalId, ANA, '2'); // escolhe "Suporte", transfere pra fila

    const { rows: versaoRows } = await cenario.dono.execute<{ global: unknown }>(
      sql`select global from fluxo_versao where id = ${publicacao.versaoId}::uuid`,
    );
    acumular('flow-version-global.json', { id: publicacao.versaoId, value: versaoRows[0]?.global });

    const { rows: blocoRows } = await cenario.dono.execute<{
      id: string;
      conteudo: unknown;
      posicao: unknown;
    }>(sql`select id, conteudo, posicao from bloco where versao_id = ${publicacao.versaoId}::uuid`);
    for (const b of blocoRows) {
      acumular('flow-block-content.json', { id: b.id, value: b.conteudo });
      acumular('flow-block-position.json', { id: b.id, value: b.posicao });
    }

    const { rows: transicaoRows } = await cenario.dono.execute<{ id: string; condicao: unknown }>(
      sql`select id, condicao from transicao where versao_id = ${publicacao.versaoId}::uuid and condicao <> '{}'::jsonb`,
    );
    for (const t of transicaoRows) {
      acumular('flow-transition-condition.json', { id: t.id, value: t.condicao });
    }

    // `cenario.dono` tem `bypassrls` (papel dono): toda leitura daqui em diante filtra
    // `tenant_id = cenario.tenantId` explicitamente, nunca só por telefone/id — sem RLS
    // amarrando, um telefone de teste igual ao de outra execução (deste ou de outro
    // agente, no mesmo Postgres local compartilhado) vazaria linha de outro tenant.
    const { rows: execucaoRows } = await cenario.dono.execute<{ id: string; contexto: unknown }>(sql`
      select e.id, e.contexto from execucao_fluxo e
        join conversa c on c.id = e.conversa_id
        join contato ct on ct.id = c.contato_id
       where e.tenant_id = ${cenario.tenantId}::uuid and ct.telefone_e164 = ${`+${ANA}`}
    `);
    for (const e of execucaoRows) {
      acumular('flow-execution-context.json', { id: e.id, value: e.contexto });
    }

    const { rows: passoRows } = await cenario.dono.execute<{
      id: string;
      entrada: unknown;
      saida: unknown;
    }>(sql`
      select ep.id, ep.entrada, ep.saida from execucao_passo ep
        join execucao_fluxo e on e.id = ep.execucao_id
        join conversa c on c.id = e.conversa_id
        join contato ct on ct.id = c.contato_id
       where ep.tenant_id = ${cenario.tenantId}::uuid and ct.telefone_e164 = ${`+${ANA}`}
    `);
    for (const p of passoRows) {
      if (p.entrada !== null) acumular('flow-step-input.json', { id: p.id, value: p.entrada });
      if (p.saida !== null) acumular('flow-step-output.json', { id: p.id, value: p.saida });
    }

    const { rows: mensagemRows } = await cenario.dono.execute<{ id: string; dados: unknown }>(sql`
      select m.id, m.dados from mensagem m
        join conversa c on c.id = m.conversa_id
        join contato ct on ct.id = c.contato_id
       where m.tenant_id = ${cenario.tenantId}::uuid and ct.telefone_e164 = ${`+${ANA}`}
         and m.dados is not null
    `);
    for (const m of mensagemRows) {
      acumular('outbox-message-data.json', { id: m.id, value: m.dados });
    }

    // --- flow execution: process_http_execucao (suspenso, sem chamada de rede) ---
    // `contexto.servicos.suspenderHttp` está sempre setado em `rodarFluxoNaEntrada`, então
    // toda ação ProcessHttp SEMPRE suspende antes de chamar rede de verdade — a linha nasce
    // com entrada/contexto/pedido preenchidos e `resposta` nula (estado 'pendente'), sem
    // nenhum request sair da máquina.
    const fluxoComProcessHttp = JSON.parse(JSON.stringify(FIXTURE_FLUXO)) as {
      flow: Record<string, { $enteringCustomActions: unknown[] }>;
    };
    fluxoComProcessHttp.flow['boas-vindas']!.$enteringCustomActions.push({
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
      importarFluxoDaBlip(tx, {
        tenantId: cenario.tenantId,
        nome: 'Gerador de fixtures (ProcessHttp)',
        canalId: cenario.canalId,
        json: fluxoComProcessHttp,
        publicar: true,
      }),
    );
    const CAIO = '5511922220002';
    await falar(cenario.canalId, CAIO, 'oi');

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
      const { rows: canalRows } = await cenario.dono.execute<{ id: string }>(sql`
        insert into canal (tenant_id, tipo, nome, config)
        values (${cenario.tenantId}::uuid, 'whatsapp_cloud', 'Roteador de teste', ${JSON.stringify({
          appSecret: APP_SECRET,
          verifyToken: 'token-de-inscricao',
          phoneNumberId: '555000333',
          tokenAcesso: 'token-falso-do-roteador',
        })}::jsonb)
        returning id
      `);
      const canalRoteadorId = canalRows[0]!.id;
      await cenario.dono.execute(sql`
        insert into inbox (tenant_id, canal_id, nome, fila_padrao_id)
        values (${cenario.tenantId}::uuid, ${canalRoteadorId}::uuid, 'Entrada do roteador', ${cenario.filaId}::uuid)
      `);

      const { rows: roteadorRows } = await cenario.dono.execute<{ id: string }>(sql`
        insert into fluxo (tenant_id, nome, canal_id, tipo, estado)
        values (${cenario.tenantId}::uuid, 'Roteador de teste', ${canalRoteadorId}::uuid, 'roteador', 'publicado')
        returning id
      `);
      const roteadorId = roteadorRows[0]!.id;

      const servico = await noTenant(cenario.tenantId, (tx) =>
        importarFluxoDaBlip(tx, {
          tenantId: cenario.tenantId,
          nome: 'Serviço do roteador',
          canalId: null,
          json: FIXTURE_FLUXO,
          publicar: true,
        }),
      );
      await cenario.dono.execute(
        sql`update fluxo set usa_contexto_do_roteador = true where id = ${servico.fluxoId}::uuid`,
      );
      await cenario.dono.execute(sql`
        insert into roteador_servico (tenant_id, roteador_id, servico_id, nome, principal)
        values (${cenario.tenantId}::uuid, ${roteadorId}::uuid, ${servico.fluxoId}::uuid, 'principal', true)
      `);

      const BIA = '5511922220004';
      await falar(canalRoteadorId, BIA, 'oi');
      await falar(canalRoteadorId, BIA, 'Bia');

      const { rows: posicaoRows } = await cenario.dono.execute<{ id: string; contexto: unknown }>(sql`
        select p.id, p.contexto from posicao_no_roteador p
          join contato ct on ct.id = p.contato_id
         where p.tenant_id = ${cenario.tenantId}::uuid and p.roteador_id = ${roteadorId}::uuid
           and ct.telefone_e164 = ${`+${BIA}`}
      `);
      for (const p of posicaoRows) {
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
    const { rows: entregaRows } = await cenario.dono.execute<{ id: string; payload: unknown }>(
      sql`select id, payload from entrega_webhook where webhook_id = ${webhookId}::uuid`,
    );
    for (const e of entregaRows) {
      acumular('outbox-webhook-payload.json', { id: e.id, value: e.payload });
    }

    // --- crm: contato.atributos (POST /v1/contatos de verdade, chave escopo contatos:escrever) ---
    const respostaContato = await fetch(`${api.url}/v1/contatos`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${cenario.token}`,
      },
      body: JSON.stringify({
        telefone_e164: '+5511922220003',
        nome: 'Contato de exemplo',
        atributos: { plano: 'pro', origem_utm: 'anuncio-instagram', pontuacao_nps: 9 },
      }),
    });
    if (!respostaContato.ok) {
      throw new Error(
        `POST /v1/contatos falhou: ${respostaContato.status} ${await respostaContato.text()}`,
      );
    }
    const contatoCriado = (await respostaContato.json()) as { id: string; atributos: unknown };
    acumular('crm-contact-attributes.json', { id: contatoCriado.id, value: contatoCriado.atributos });

    // --- audit: log_auditoria.antes/depois (registrarAuditoria() de verdade) ---
    await noTenant(cenario.tenantId, (tx) =>
      registrarAuditoria(tx, cenario.tenantId, {
        ator: { tipo: 'usuario', id: cenario.atendenteId },
        acao: 'alterou',
        objetoTipo: 'contato',
        objetoId: contatoCriado.id,
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
       where tenant_id = ${cenario.tenantId}::uuid and objeto_id = ${contatoCriado.id}::uuid
    `);
    for (const a of auditRows) {
      acumular('audit-before-after.json', { id: a.id, antes: a.antes, depois: a.depois });
    }

    // --- crm: lead.utm / lead.customizados ---
    // Sem rota de escrita própria hoje; formato igual ao que
    // apps/crm/semente/semente-crm.ts:625-654 grava (citado, não executado).
    const { rows: leadRows } = await cenario.dono.execute<{
      id: string;
      utm: unknown;
      customizados: unknown;
    }>(sql`
      insert into lead (tenant_id, contato_id, origem, campanha, utm, status, customizados)
      values (
        ${cenario.tenantId}::uuid, ${contatoCriado.id}::uuid, 'Anúncio Instagram', 'novos-clientes-2026',
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
    // Sem chamada à Graph API da Meta; reproduz a MESMA transformação determinística de
    // apps/api/src/dominio/whatsapp/modelos.ts:207 (`Array.from({length:n}, (_,i)=>...)`).
    const quantasVariaveis = 2;
    const variaveisPadrao = Array.from(
      { length: quantasVariaveis },
      (_, i) => `Variável ${i + 1}`,
    );
    const { rows: templateRows } = await cenario.dono.execute<{ id: string; variaveis: unknown }>(sql`
      insert into template_mensagem (tenant_id, canal_id, nome, idioma, categoria, status_meta, corpo, variaveis)
      values (
        ${cenario.tenantId}::uuid, ${cenario.canalId}::uuid, 'boas_vindas_exemplo', 'pt_BR', 'utilidade',
        'aprovado', 'Olá {{1}}, seu pedido {{2}} foi confirmado.', ${JSON.stringify(variaveisPadrao)}::jsonb
      )
      returning id, variaveis
    `);
    for (const t of templateRows) {
      acumular('template-variables.json', { id: t.id, value: t.variaveis });
    }

    return arquivos;
  } finally {
    await api.fechar();
    await cenario.encerrar();
  }
}
