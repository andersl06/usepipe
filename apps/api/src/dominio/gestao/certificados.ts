import { sql } from 'drizzle-orm';
import { registrarAuditoria } from '@pipe/db';
import type { TransacaoPipe, Ator } from '@pipe/db';
import { ErroPipe } from '../../erros.js';

/**
 * Certificados de autenticação (mTLS) do contrato — o que a tela
 * `/contrato/certificados` lê e grava.
 *
 * Na origem tudo é comando LIME para `postmaster@mtls.blip.ai`, que sobe o
 * `.pfx` para o serviço deles e guarda o que ele extrai
 * (`docs/pesquisa/blip-certificados-mtls.md`). O Pipe não tem esse serviço nem
 * o proxy que faria o mTLS de verdade valer alguma coisa — **então esta tabela
 * nunca guarda o arquivo nem a senha dele**, só o que é público de um
 * certificado: descrição, hosts, validade e impressão digital, digitados por
 * quem cadastra. Não há coluna para cifrar com `packages/db/src/segredo.ts`
 * porque não há chave nenhuma para cifrar.
 *
 * ponytail: o upload automático (ler o `.pfx` e extrair validade/impressão
 * digital sozinho) fica de fora — exigiria uma biblioteca de PKCS12 que o
 * projeto não tem, e um proxy mTLS que o Pipe não tem para usá-lo depois. A
 * tela marca essa parte como "em breve"; aqui só o cadastro manual.
 *
 * Raw SQL, como `rastreador-de-cliques.ts` (migration 0038): as tabelas
 * (`certificado_mtls`, `certificado_mtls_host`, migration 0039) não entram no
 * schema Drizzle para não competir com quem mexe em `identidade`/`automacao`
 * ao mesmo tempo.
 */

export interface HostDoCertificado {
  id: string;
  host: string;
}

export interface CertificadoMtls {
  id: string;
  descricao: string;
  /** ISO 8601, só a data (`date` no banco). */
  expiraEm: string;
  impressaoDigital: string;
  hosts: HostDoCertificado[];
  criadoEm: string;
}

export interface PedidoDeCertificado {
  descricao: string;
  /** `YYYY-MM-DD` ou qualquer formato que `Date` entenda. */
  expiraEm: string;
  impressaoDigital: string;
  hosts: string[];
}

export type Gravacao = { ok: true } | { ok: false; erro: string };

const OK: Gravacao = { ok: true };

const URL_HTTPS = /^https:\/\/[a-zA-Z0-9-.]+\.[a-zA-Z]{2,}(:\d+)?(\/.*)?$/;

/** O `o` do `vt` deles (`blip-certificados-mtls.md`): HTTPS com domínio. */
function normalizarHosts(crus: string[] | undefined): string[] {
  const vistos = new Set<string>();
  const limpos: string[] = [];
  for (const cru of crus ?? []) {
    const host = (cru ?? '').trim();
    if (!host) continue;
    if (!URL_HTTPS.test(host)) {
      throw ErroPipe.requisicao('host_invalido', `"${host}" não é uma URL HTTPS válida.`, { host });
    }
    if (vistos.has(host)) continue;
    vistos.add(host);
    limpos.push(host);
  }
  if (limpos.length === 0) {
    throw ErroPipe.requisicao('host_obrigatorio', 'Informe ao menos um host para o certificado.');
  }
  return limpos;
}

function normalizarDescricao(cru: string | undefined): string {
  const descricao = (cru ?? '').trim();
  if (!descricao) {
    throw ErroPipe.requisicao('descricao_obrigatoria', 'Informe a descrição do certificado.');
  }
  if (descricao.length > 50) {
    throw ErroPipe.requisicao(
      'descricao_longa',
      'A descrição do certificado tem no máximo 50 caracteres.',
    );
  }
  return descricao;
}

function normalizarImpressaoDigital(cru: string | undefined): string {
  const impressao = (cru ?? '').trim();
  if (!impressao) {
    throw ErroPipe.requisicao(
      'impressao_digital_obrigatoria',
      'Informe a impressão digital (fingerprint) do certificado.',
    );
  }
  return impressao;
}

function normalizarExpiraEm(cru: string | undefined): Date {
  const data = new Date(cru ?? '');
  if (Number.isNaN(data.getTime())) {
    throw ErroPipe.requisicao('validade_invalida', 'Informe uma data de validade válida.');
  }
  return data;
}

/** A lista da tela, mais nova primeiro — como a origem devolve `response.items`. */
export async function listarCertificados(
  tx: TransacaoPipe,
  tenantId: string,
): Promise<CertificadoMtls[]> {
  const { rows: certificados } = await tx.execute<{
    id: string;
    descricao: string;
    expira_em: string;
    impressao_digital: string;
    criado_em: string;
  }>(sql`
    select id, descricao, expira_em, impressao_digital, criado_em
      from certificado_mtls
     where tenant_id = ${tenantId}::uuid
     order by criado_em desc
  `);
  if (certificados.length === 0) return [];

  // `sql` com um array em JS não vira array literal do Postgres (o driver manda
  // como registro, e `any(uuid[])` recusa) — por isso o literal `{a,b,c}` à mão,
  // como um único parâmetro de texto que o `::uuid[]` casa.
  const idsLiteral = `{${certificados.map((c) => c.id).join(',')}}`;
  const { rows: hosts } = await tx.execute<{ id: string; certificado_id: string; host: string }>(sql`
    select id, certificado_id, host
      from certificado_mtls_host
     where certificado_id = any(${idsLiteral}::uuid[])
     order by criado_em asc
  `);
  const hostsPorCertificado = new Map<string, HostDoCertificado[]>();
  for (const h of hosts) {
    const lista = hostsPorCertificado.get(h.certificado_id) ?? [];
    lista.push({ id: h.id, host: h.host });
    hostsPorCertificado.set(h.certificado_id, lista);
  }

  return certificados.map((c) => ({
    id: c.id,
    descricao: c.descricao,
    expiraEm: new Date(c.expira_em).toISOString(),
    impressaoDigital: c.impressao_digital,
    hosts: hostsPorCertificado.get(c.id) ?? [],
    criadoEm: new Date(c.criado_em).toISOString(),
  }));
}

/** Cadastra o certificado e os hosts dele, na mesma transação. */
export async function criarCertificado(
  tx: TransacaoPipe,
  tenantId: string,
  ator: Ator,
  pedido: PedidoDeCertificado,
): Promise<CertificadoMtls> {
  const descricao = normalizarDescricao(pedido.descricao);
  const expiraEm = normalizarExpiraEm(pedido.expiraEm);
  const impressaoDigital = normalizarImpressaoDigital(pedido.impressaoDigital);
  const hosts = normalizarHosts(pedido.hosts);

  const { rows } = await tx.execute<{ id: string; criado_em: string }>(sql`
    insert into certificado_mtls (tenant_id, descricao, expira_em, impressao_digital, criado_por)
    values (${tenantId}::uuid, ${descricao}, ${expiraEm.toISOString().slice(0, 10)}::date,
            ${impressaoDigital}, ${ator.id ?? null})
    returning id, criado_em
  `);
  const novo = rows[0]!;

  const hostsGravados: HostDoCertificado[] = [];
  for (const host of hosts) {
    const { rows: hostRows } = await tx.execute<{ id: string }>(sql`
      insert into certificado_mtls_host (tenant_id, certificado_id, host)
      values (${tenantId}::uuid, ${novo.id}::uuid, ${host})
      returning id
    `);
    hostsGravados.push({ id: hostRows[0]!.id, host });
  }

  await registrarAuditoria(tx, tenantId, {
    ator,
    acao: 'criou',
    objetoTipo: 'certificado_mtls',
    objetoId: novo.id,
    depois: { descricao, expiraEm: expiraEm.toISOString(), hosts },
  });

  return {
    id: novo.id,
    descricao,
    expiraEm: expiraEm.toISOString(),
    impressaoDigital,
    hosts: hostsGravados,
    criadoEm: new Date(novo.criado_em).toISOString(),
  };
}

/** Exclui o certificado inteiro (e os hosts junto, por `ON DELETE CASCADE`). */
export async function excluirCertificado(
  tx: TransacaoPipe,
  tenantId: string,
  ator: Ator,
  certificadoId: string,
): Promise<Gravacao> {
  const { rows } = await tx.execute<{ id: string; descricao: string }>(sql`
    select id, descricao from certificado_mtls
     where id = ${certificadoId}::uuid and tenant_id = ${tenantId}::uuid
     limit 1
  `);
  const alvo = rows[0];
  if (!alvo) return { ok: false, erro: 'Este certificado não existe neste contrato.' };

  await tx.execute(
    sql`delete from certificado_mtls where id = ${certificadoId}::uuid and tenant_id = ${tenantId}::uuid`,
  );

  await registrarAuditoria(tx, tenantId, {
    ator,
    acao: 'excluiu',
    objetoTipo: 'certificado_mtls',
    objetoId: certificadoId,
    antes: { descricao: alvo.descricao },
  });
  return OK;
}

/**
 * Exclui um host do certificado. Se era o último, o certificado inteiro sai
 * junto — como na origem: "Se o certificado fica sem host, o modal de hosts
 * fecha e a lista recarrega" (`blip-certificados-mtls.md`), porque um
 * certificado sem host nenhum não autentica nada.
 */
export async function excluirHostDoCertificado(
  tx: TransacaoPipe,
  tenantId: string,
  ator: Ator,
  certificadoId: string,
  hostId: string,
): Promise<Gravacao> {
  const { rows } = await tx.execute<{ id: string; host: string }>(sql`
    select h.id, h.host
      from certificado_mtls_host h
      join certificado_mtls c on c.id = h.certificado_id
     where h.id = ${hostId}::uuid and h.certificado_id = ${certificadoId}::uuid
       and c.tenant_id = ${tenantId}::uuid
     limit 1
  `);
  const alvo = rows[0];
  if (!alvo) return { ok: false, erro: 'Este host não existe neste certificado.' };

  await tx.execute(sql`delete from certificado_mtls_host where id = ${hostId}::uuid`);

  const { rows: restantes } = await tx.execute<{ n: string }>(sql`
    select count(*)::text as n from certificado_mtls_host where certificado_id = ${certificadoId}::uuid
  `);
  const semHostRestante = restantes[0]?.n === '0';
  if (semHostRestante) {
    await tx.execute(
      sql`delete from certificado_mtls where id = ${certificadoId}::uuid and tenant_id = ${tenantId}::uuid`,
    );
  }

  await registrarAuditoria(tx, tenantId, {
    ator,
    acao: 'excluiu',
    objetoTipo: 'certificado_mtls_host',
    objetoId: hostId,
    antes: { host: alvo.host, certificadoExcluidoJunto: semHostRestante },
  });
  return OK;
}
