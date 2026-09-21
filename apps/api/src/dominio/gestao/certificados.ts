import { sql } from 'drizzle-orm';
import { cifrar, registrarAuditoria } from '@pipe/db';
import type { TransacaoPipe, Ator } from '@pipe/db';
import { chaveiro } from '../../banco.js';
import { ErroPipe } from '../../erros.js';
import { esquecerCertificadosMtls } from '../mtls.js';
import { lerPfx } from './pfx.js';

/**
 * Certificados de autenticação (mTLS) do contrato — o que a tela
 * `/contrato/certificados` lê e grava.
 *
 * Na origem tudo é comando LIME para `postmaster@mtls.blip.ai`: a tela sobe o
 * `.pfx` com a senha (`multipart` com `password` e `file`), o serviço deles lê
 * o arquivo e devolve `status` e `expiration_date`, e o certificado fica
 * associado a `hosts` (`docs/pesquisa/blip-certificados-mtls.md`). Quando a
 * plataforma chama um desses hosts, apresenta o certificado.
 *
 * Aqui é igual, desde a migration 0044: o `.pfx` e a senha ficam **cifrados**
 * (`packages/db/src/segredo.ts`) em `arquivo_cifrado`/`senha_cifrada`; a
 * validade, a impressão digital, o emissor e o sujeito saem do próprio arquivo
 * (`pfx.ts`, com `node:tls`/`node:crypto`); e `dominio/mtls.ts` usa o par para
 * apresentar o certificado nos webhooks de saída. O status é calculado —
 * `valido`/`expirado` pela validade, `sem_arquivo` para o que foi cadastrado à
 * mão antes da 0044 (a origem tem `valid`/`invalid`/`underValidation`; o
 * "em validação" deles é o upload assíncrono, que aqui é síncrono).
 *
 * **O que nunca sai daqui**: o arquivo e a senha. Não vão na listagem, não
 * vão na resposta do cadastro, não vão no log de auditoria — só
 * `dominio/mtls.ts` os lê, decifra e entrega ao `https.Agent`.
 *
 * Raw SQL, como `rastreador-de-cliques.ts` (migration 0038): as tabelas
 * (`certificado_mtls`, `certificado_mtls_host`, migrations 0039 e 0044) não
 * entram no schema Drizzle para não competir com quem mexe em
 * `identidade`/`automacao` ao mesmo tempo.
 */

export interface HostDoCertificado {
  id: string;
  host: string;
}

/** `valid`/`invalid` da origem, com nome pelo motivo — a tela escolhe o chip por aqui. */
export type StatusDoCertificado = 'valido' | 'expirado' | 'sem_arquivo';

export interface CertificadoMtls {
  id: string;
  descricao: string;
  /** ISO 8601, só a data (`date` no banco). Lida do `.pfx`. */
  expiraEm: string;
  /** SHA-256 `AB:CD:…`, lida do `.pfx`. */
  impressaoDigital: string;
  emissor: string | null;
  sujeito: string | null;
  status: StatusDoCertificado;
  hosts: HostDoCertificado[];
  criadoEm: string;
}

export interface PedidoDeCertificado {
  descricao: string;
  hosts: string[];
  /** A senha do `.pfx`. Cifrada no banco, nunca devolvida. */
  senha: string;
  /** O `.pfx` em base64 — puro ou como data URL (`data:…;base64,…`), que é o que o `FileReader` da tela dá. */
  arquivo: string;
}

export type Gravacao = { ok: true } | { ok: false; erro: string };

const OK: Gravacao = { ok: true };

/** "O arquivo deve ter no máximo 10MB" — o teto do `yt` da origem, conferido de novo aqui. */
export const MAX_BYTES_DO_PFX = 10 * 1048576;

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

function normalizarSenha(crua: unknown): string {
  const senha = typeof crua === 'string' ? crua : '';
  if (!senha) throw ErroPipe.requisicao('senha_obrigatoria', 'Informe a senha do certificado.');
  return senha;
}

/** Base64 puro ou data URL → bytes. Vazio, ilegível ou maior que o teto: 400. */
function normalizarArquivo(cru: unknown): Buffer {
  const texto = typeof cru === 'string' ? cru.trim() : '';
  const base64 = texto.startsWith('data:') ? texto.slice(texto.indexOf(',') + 1) : texto;
  if (!base64 || !/^[A-Za-z0-9+/=\s]+$/.test(base64)) {
    throw ErroPipe.requisicao('arquivo_obrigatorio', 'Mande o arquivo .pfx em base64.');
  }
  const bytes = Buffer.from(base64, 'base64');
  if (bytes.byteLength === 0) {
    throw ErroPipe.requisicao('arquivo_obrigatorio', 'Mande o arquivo .pfx em base64.');
  }
  if (bytes.byteLength > MAX_BYTES_DO_PFX) {
    throw ErroPipe.requisicao('arquivo_grande', 'O arquivo deve ter no máximo 10MB.');
  }
  return bytes;
}

type LinhaDeCertificado = {
  id: string;
  descricao: string;
  expira_em: string;
  impressao_digital: string;
  emissor: string | null;
  sujeito: string | null;
  tem_arquivo: boolean;
  expirado: boolean;
  criado_em: string;
};

function statusDe(linha: { tem_arquivo: boolean; expirado: boolean }): StatusDoCertificado {
  if (!linha.tem_arquivo) return 'sem_arquivo';
  return linha.expirado ? 'expirado' : 'valido';
}

/**
 * A lista da tela, mais nova primeiro — como a origem devolve `response.items`.
 * `arquivo_cifrado` e `senha_cifrada` não entram no `select`: nem cifrados
 * saem daqui. O `expirado` é decidido pelo Postgres (`current_date`), para
 * não depender do fuso do processo ao comparar um `date`.
 */
export async function listarCertificados(
  tx: TransacaoPipe,
  tenantId: string,
): Promise<CertificadoMtls[]> {
  // `expira_em` sai como texto `YYYY-MM-DD`: o driver devolveria um `date`
  // como `Date` à meia-noite LOCAL, e `toISOString()` num fuso negativo
  // voltaria um dia.
  const { rows: certificados } = await tx.execute<LinhaDeCertificado>(sql`
    select id, descricao, to_char(expira_em, 'YYYY-MM-DD') as expira_em,
           impressao_digital, emissor, sujeito,
           (arquivo_cifrado is not null and senha_cifrada is not null) as tem_arquivo,
           (expira_em < current_date) as expirado,
           criado_em
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
    emissor: c.emissor,
    sujeito: c.sujeito,
    status: statusDe(c),
    hosts: hostsPorCertificado.get(c.id) ?? [],
    criadoEm: new Date(c.criado_em).toISOString(),
  }));
}

/**
 * Cadastra o certificado e os hosts dele, na mesma transação.
 *
 * O `.pfx` é lido ANTES de qualquer gravação (`lerPfx`): senha errada ou
 * arquivo que não serve é 400, e nada entra no banco. O que entra, entra
 * cifrado com a chave atual do chaveiro.
 */
export async function criarCertificado(
  tx: TransacaoPipe,
  tenantId: string,
  ator: Ator,
  pedido: PedidoDeCertificado,
): Promise<CertificadoMtls> {
  const descricao = normalizarDescricao(pedido.descricao);
  const hosts = normalizarHosts(pedido.hosts);
  const senha = normalizarSenha(pedido.senha);
  const arquivo = normalizarArquivo(pedido.arquivo);
  const leitura = lerPfx(arquivo, senha);

  const chaves = chaveiro();
  const arquivoCifrado = cifrar(arquivo.toString('base64'), chaves);
  const senhaCifrada = cifrar(senha, chaves);
  const expiraEm = leitura.expiraEm.toISOString().slice(0, 10);

  const { rows } = await tx.execute<{ id: string; criado_em: string; expirado: boolean }>(sql`
    insert into certificado_mtls
      (tenant_id, descricao, expira_em, impressao_digital, emissor, sujeito,
       arquivo_cifrado, senha_cifrada, criado_por)
    values (${tenantId}::uuid, ${descricao}, ${expiraEm}::date, ${leitura.impressaoDigital},
            ${leitura.emissor}, ${leitura.sujeito}, ${arquivoCifrado}, ${senhaCifrada},
            ${ator.id ?? null})
    returning id, criado_em, (expira_em < current_date) as expirado
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

  // Só o que é público do certificado: nada do arquivo, nada da senha.
  await registrarAuditoria(tx, tenantId, {
    ator,
    acao: 'criou',
    objetoTipo: 'certificado_mtls',
    objetoId: novo.id,
    depois: {
      descricao,
      expiraEm: leitura.expiraEm.toISOString(),
      impressaoDigital: leitura.impressaoDigital,
      sujeito: leitura.sujeito,
      emissor: leitura.emissor,
      hosts,
    },
  });

  // O índice de hosts deste tenant em `mtls.ts` ficou velho. (Chamado dentro
  // da transação: entre aqui e o commit uma entrega pode reler o estado antigo,
  // e o TTL curto do índice cobre essa janela.)
  esquecerCertificadosMtls(tenantId);

  return {
    id: novo.id,
    descricao,
    // A mesma forma da listagem: a data, à meia-noite UTC.
    expiraEm: new Date(expiraEm).toISOString(),
    impressaoDigital: leitura.impressaoDigital,
    emissor: leitura.emissor,
    sujeito: leitura.sujeito,
    status: novo.expirado ? 'expirado' : 'valido',
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
  esquecerCertificadosMtls(tenantId, certificadoId);
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
  esquecerCertificadosMtls(tenantId, certificadoId);
  return OK;
}
