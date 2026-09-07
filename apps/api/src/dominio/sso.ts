import { sql } from 'drizzle-orm';
import { cifrarConfig, decifrarConfig, registrarAuditoria } from '@pipe/db';
import { DOMINIOS_PUBLICOS, descobrir, dominioDoEmail } from '@pipe/autenticacao';
import type { ConfigOidc, DescobertaOidc, ProvedorSso } from '@pipe/autenticacao';
import { bancoDono, chaveiro, noTenant } from '../banco.js';
import { ErroPipe } from '../erros.js';

/**
 * A conexão de SSO do cliente: o que ele preenche, em que estado ela está, e
 * quando ela passa a valer.
 *
 * Duas regras moldam este arquivo, e as duas vêm de
 * `docs/pesquisa/sso-multi-tenant.md`:
 *
 * 1. **Salvar não liga nada.** A conexão nasce `rascunho`, vira `testada` quando
 *    um teste real passa, e só então pode ir a `ativa`. É o que permite ligar o
 *    SSO sem quebrar o login de quem já está dentro.
 * 2. **Ligar o SSO e exigir o SSO são dois campos.** `estado` diz se a conexão
 *    funciona; `politica` diz se a senha ainda vale. Todo incidente de "o cliente
 *    inteiro ficou de fora" nasce de serem o mesmo botão.
 *
 * O `clientSecret` nunca é gravado em claro nem devolvido: entra por
 * `cifrarConfig` (`packages/db/src/segredo.ts`, que já trata `clientSecret` como
 * campo secreto) e só sai decifrado no caminho que fala com o IdP.
 */

/** Um teste vale 30 dias. Conexão testada no ano passado não prova nada hoje. */
export const DIAS_DE_TESTE_VALIDO = 30;

export const ESTADOS = ['rascunho', 'testada', 'ativa'] as const;
export const POLITICAS = ['desligado', 'opcional', 'obrigatorio'] as const;
export const PROVEDORES = ['generico', 'entra', 'google_workspace', 'okta'] as const;

export type EstadoConexao = (typeof ESTADOS)[number];
export type PoliticaSso = (typeof POLITICAS)[number];

/** O que a tela vê. Sem segredo, e é por isso que existe um tipo só para isto. */
export interface ConexaoSsoVisivel {
  id: string;
  provedor: ProvedorSso;
  emissor: string;
  clienteId: string;
  estado: EstadoConexao;
  politica: PoliticaSso;
  testadaEm: Date | null;
  ativadaEm: Date | null;
  /** O que o cliente cola no IdP dele. */
  urlDeRetorno: string;
}

interface LinhaConexao {
  /** O `execute` do drizzle exige forma indexável; as colunas acima continuam tipadas. */
  [coluna: string]: unknown;
  id: string;
  tenant_id: string;
  provedor: string;
  emissor: string;
  cliente_id: string;
  config: Record<string, unknown> | null;
  estado: string;
  politica: string;
  testada_em: string | null;
  ativada_em: string | null;
}

/** A URL de retorno é UMA, para todos os clientes: o tenant vem do `state`, não da URL. */
export function urlDeRetornoSso(): string {
  const base = (process.env['PIPE_URL_API'] ?? 'http://localhost:3100').replace(/\/$/, '');
  return `${base}/v1/auth/sso/retorno`;
}

function visivel(linha: LinhaConexao): ConexaoSsoVisivel {
  return {
    id: linha.id,
    provedor: linha.provedor as ProvedorSso,
    emissor: linha.emissor,
    clienteId: linha.cliente_id,
    estado: linha.estado as EstadoConexao,
    politica: linha.politica as PoliticaSso,
    testadaEm: linha.testada_em ? new Date(linha.testada_em) : null,
    ativadaEm: linha.ativada_em ? new Date(linha.ativada_em) : null,
    urlDeRetorno: urlDeRetornoSso(),
  };
}

export interface CorpoDeConexao {
  provedor?: string;
  emissor?: string;
  clienteId?: string;
  clienteSegredo?: string;
}

/**
 * Salva a conexão. **Sempre volta para `rascunho`.**
 *
 * Mudar o emissor de uma conexão `ativa` sem rebaixar o estado seria trocar o
 * diretório inteiro de quem entra sem que ninguém testasse o novo — e o sintoma
 * apareceria como "todo mundo entrou no cliente errado", não como erro.
 */
export async function salvarConexao(
  tenantId: string,
  usuarioId: string,
  corpo: CorpoDeConexao,
): Promise<ConexaoSsoVisivel> {
  const provedor = (corpo.provedor ?? 'generico').trim();
  if (!PROVEDORES.includes(provedor as ProvedorSso)) {
    throw ErroPipe.requisicao('provedor_invalido', `"${provedor}" não é um provedor conhecido.`);
  }

  const emissor = (corpo.emissor ?? '').trim().replace(/\/$/, '');
  if (!emissor.startsWith('https://')) {
    throw ErroPipe.requisicao(
      'emissor_invalido',
      'O emissor precisa ser a URL https do provedor — a mesma de onde sai o `.well-known`.',
    );
  }
  const clienteId = (corpo.clienteId ?? '').trim();
  const clienteSegredo = (corpo.clienteSegredo ?? '').trim();
  if (!clienteId || !clienteSegredo) {
    throw ErroPipe.requisicao('config_incompleta', 'Faltam `clienteId` ou `clienteSegredo`.');
  }

  const config = cifrarConfig({ clientSecret: clienteSegredo }, chaveiro());

  return noTenant(tenantId, async (tx) => {
    const { rows: antes } = await tx.execute<LinhaConexao>(
      sql`select * from conexao_sso where tenant_id = ${tenantId}::uuid limit 1`,
    );

    // A política NÃO é tocada aqui, de propósito: reconfigurar o IdP não pode
    // reabrir a senha de um tenant que exige SSO, nem fechá-la sem um botão.
    const { rows } = await tx.execute<LinhaConexao>(sql`
      insert into conexao_sso (tenant_id, tipo, provedor, emissor, cliente_id, config)
      values (${tenantId}::uuid, 'oidc', ${provedor}, ${emissor}, ${clienteId},
              ${JSON.stringify(config)}::jsonb)
      on conflict (tenant_id) do update
         set provedor = excluded.provedor,
             emissor = excluded.emissor,
             cliente_id = excluded.cliente_id,
             config = excluded.config,
             estado = 'rascunho',
             testada_em = null,
             atualizado_em = now()
      returning *
    `);

    const linha = rows[0]!;
    await registrarAuditoria(tx, tenantId, {
      ator: { tipo: 'usuario', id: usuarioId },
      acao: antes[0] ? 'alterou' : 'criou',
      objetoTipo: 'conexao_sso',
      objetoId: linha.id,
      // `registrarAuditoria` descarta `config` sozinha — `config` está na lista
      // de campos que nunca entram no log. Passar a linha inteira é seguro.
      ...(antes[0] ? { antes: antes[0] } : {}),
      depois: linha,
    });
    return visivel(linha);
  });
}

export async function lerConexao(tenantId: string): Promise<ConexaoSsoVisivel | null> {
  const linha = await linhaDoTenant(tenantId);
  return linha ? visivel(linha) : null;
}

async function linhaDoTenant(tenantId: string): Promise<LinhaConexao | null> {
  return noTenant(tenantId, async (tx) => {
    const { rows } = await tx.execute<LinhaConexao>(
      sql`select * from conexao_sso where tenant_id = ${tenantId}::uuid limit 1`,
    );
    return rows[0] ?? null;
  });
}

export interface MudancaDeEstado {
  estado?: string;
  politica?: string;
}

/**
 * Move a conexão de estado e/ou muda a política. **Duas travas, e cada uma já
 * derrubou o login de alguém:**
 *
 * - `ativa` exige teste verde nos últimos 30 dias. Sem isso, "salvei e liguei"
 *   manda todo o cliente para um IdP que nunca respondeu.
 * - `obrigatorio` exige a conexão `ativa`. Exigir SSO com o SSO desligado tranca
 *   o cliente inteiro do lado de fora, e é o incidente mais comum do assunto.
 */
export async function definirEstado(
  tenantId: string,
  usuarioId: string,
  mudanca: MudancaDeEstado,
): Promise<ConexaoSsoVisivel> {
  const atual = await linhaDoTenant(tenantId);
  if (!atual) throw ErroPipe.naoEncontrado('Conexão de SSO');

  const estado = (mudanca.estado ?? atual.estado) as EstadoConexao;
  const politica = (mudanca.politica ?? atual.politica) as PoliticaSso;
  if (!ESTADOS.includes(estado)) {
    throw ErroPipe.requisicao('estado_invalido', `"${estado}" não é um estado de conexão.`);
  }
  if (!POLITICAS.includes(politica)) {
    throw ErroPipe.requisicao('politica_invalida', `"${politica}" não é uma política de SSO.`);
  }

  if (estado === 'ativa' && !testeValido(atual.testada_em)) {
    throw ErroPipe.requisicao(
      'sem_teste_valido',
      `Teste a conexão antes de ativá-la — o teste vale ${DIAS_DE_TESTE_VALIDO} dias.`,
    );
  }
  if (politica !== 'desligado' && estado !== 'ativa') {
    throw ErroPipe.requisicao(
      'conexao_inativa',
      'Exigir SSO com a conexão desligada tranca todo mundo do lado de fora. Ative primeiro.',
    );
  }

  return noTenant(tenantId, async (tx) => {
    const { rows } = await tx.execute<LinhaConexao>(sql`
      update conexao_sso
         set estado = ${estado},
             politica = ${politica},
             ativada_em = case when ${estado} = 'ativa' and ativada_em is null
                               then now() else ativada_em end,
             atualizado_em = now()
       where tenant_id = ${tenantId}::uuid
      returning *
    `);
    const linha = rows[0]!;
    await registrarAuditoria(tx, tenantId, {
      ator: { tipo: 'usuario', id: usuarioId },
      acao: estado === 'ativa' ? 'ativou' : 'alterou',
      objetoTipo: 'conexao_sso',
      objetoId: linha.id,
      antes: { estado: atual.estado, politica: atual.politica },
      depois: { estado, politica },
    });
    return visivel(linha);
  });
}

export function testeValido(testadaEm: string | Date | null, agora = new Date()): boolean {
  if (!testadaEm) return false;
  const quando = testadaEm instanceof Date ? testadaEm : new Date(testadaEm);
  return agora.getTime() - quando.getTime() <= DIAS_DE_TESTE_VALIDO * 24 * 60 * 60 * 1000;
}

/** Marca o teste verde. Só o retorno do fluxo de teste chama isto. */
export async function marcarTestada(tenantId: string): Promise<void> {
  await noTenant(tenantId, async (tx) => {
    await tx.execute(sql`
      update conexao_sso
         set testada_em = now(),
             estado = case when estado = 'rascunho' then 'testada' else estado end,
             atualizado_em = now()
       where tenant_id = ${tenantId}::uuid
    `);
  });
}

export interface ConexaoParaFluxo {
  tenantId: string;
  config: ConfigOidc;
  descoberta: DescobertaOidc;
}

/**
 * A conexão pronta para falar com o IdP, com o segredo decifrado e a descoberta
 * já lida. `buscar` é injetável para o teste não sair para a rede.
 *
 * `exigirAtiva` separa os dois usos: o login de verdade só anda com a conexão
 * ligada; o teste anda com ela em rascunho — é justamente para isso que ele existe.
 */
export async function conexaoParaFluxo(
  tenantId: string,
  opcoes: { exigirAtiva: boolean },
  buscar: typeof fetch = fetch,
): Promise<ConexaoParaFluxo> {
  const linha = await linhaDoTenant(tenantId);
  if (!linha) throw ErroPipe.naoEncontrado('Conexão de SSO');
  if (opcoes.exigirAtiva && linha.estado !== 'ativa') {
    throw ErroPipe.requisicao('sso_inativo', 'O SSO desta conta ainda não foi ativado.');
  }

  const config = decifrarConfig(linha.config ?? {}, chaveiro());
  const clienteSegredo = typeof config['clientSecret'] === 'string' ? config['clientSecret'] : '';
  if (!clienteSegredo) {
    throw ErroPipe.requisicao('config_incompleta', 'A conexão está sem o segredo do cliente.');
  }

  return {
    tenantId,
    config: {
      provedor: linha.provedor as ProvedorSso,
      emissor: linha.emissor,
      clienteId: linha.cliente_id,
      clienteSegredo,
      urlDeRetorno: urlDeRetornoSso(),
      ...(linha.provedor === 'entra' ? { tenantsEntra: tenantsDoEntra(linha.emissor) } : {}),
    },
    descoberta: await descobrir(linha.emissor, buscar),
  };
}

/**
 * O `tid` aceito, tirado do próprio emissor cadastrado.
 *
 * `https://login.microsoftonline.com/<tid>/v2.0` fixa o diretório. Se o cliente
 * cadastrar o emissor `common` ou `organizations`, a lista sai vazia — e aí o
 * `iss` do token seria de qualquer diretório da Microsoft. Recusamos: emissor de
 * app multi-tenant sem `tid` é a armadilha "emissor não fixado" da §8.
 */
function tenantsDoEntra(emissor: string): readonly string[] {
  const casado = /login\.microsoftonline\.com\/([^/]+)/.exec(emissor);
  const tid = casado?.[1];
  if (!tid || tid === 'common' || tid === 'organizations' || tid === 'consumers') {
    throw ErroPipe.requisicao(
      'emissor_multi_tenant',
      'Use o emissor do diretório da empresa (com o id do tenant), não `common`: com `common` qualquer diretório da Microsoft entraria.',
    );
  }
  return [tid];
}

export interface RespostaDaDescoberta {
  /** `sso` manda para o IdP; `senha` mostra o campo de senha. Nunca conta qual tenant. */
  metodo: 'sso' | 'senha';
  irPara?: string;
}

/**
 * A descoberta do login: um campo de e-mail, e um "Continuar".
 *
 * **A resposta é a mesma para e-mail conhecido e desconhecido**, exceto quando o
 * domínio é verificado e tem SSO ativo — que é público de qualquer jeito, porque
 * o cliente escolheu ligar. Sem isso, o endpoint vira catálogo de "quais empresas
 * usam Pipe".
 *
 * Por isso não há atalho para domínio público: a consulta roda igual nos dois
 * casos e o descarte vem depois. Tempo de resposta também conta.
 */
export async function descobrirEntrada(emailCru: string | undefined): Promise<RespostaDaDescoberta> {
  const email = (emailCru ?? '').trim().toLowerCase();
  if (!email.includes('@')) {
    throw ErroPipe.requisicao('email_invalido', 'Informe um e-mail.');
  }
  const dominio = dominioDoEmail(email);

  const { rows } = await bancoDono().execute<{ slug: string }>(sql`
    select t.slug
      from dominio_tenant d
      join tenant t on t.id = d.tenant_id
      join conexao_sso c on c.tenant_id = d.tenant_id
     where d.dominio = ${dominio}
       and d.verificado_em is not null
       and c.estado = 'ativa'
       and c.politica <> 'desligado'
       and t.ativo
     limit 1
  `);

  // O descarte vem DEPOIS da consulta, e é o que garante que `gmail.com` custe o
  // mesmo tempo que um domínio de empresa. Domínio público nunca roteia: quem
  // mapeasse `gmail.com` capturaria o login de meio Brasil.
  const slug = DOMINIOS_PUBLICOS.has(dominio) ? undefined : rows[0]?.slug;
  if (!slug) return { metodo: 'senha' };
  return { metodo: 'sso', irPara: `/v1/auth/sso/${encodeURIComponent(slug)}` };
}

/**
 * O link direto `/e/<slug>`: a mesma descoberta, feita pela URL.
 *
 * Existe para quem tem e-mail pessoal e por isso nunca é descoberto pelo domínio
 * — o dono da agência com `@gmail.com`, o terceirizado, o consultor.
 */
export async function tenantPorSlug(slug: string): Promise<string> {
  const { rows } = await bancoDono().execute<{ id: string }>(
    sql`select id from tenant where slug = ${slug} and ativo limit 1`,
  );
  const id = rows[0]?.id;
  if (!id) throw ErroPipe.naoEncontrado('Empresa');
  return id;
}
