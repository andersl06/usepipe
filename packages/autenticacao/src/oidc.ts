import { createHash } from 'node:crypto';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import type { PROVEDORES_SSO } from '@pipe/db/schema';
import { LoginErro } from './google.js';
import type { DesafioDeLogin, PessoaExterna } from './google.js';

/**
 * OIDC genérico: o mesmo fluxo do `google.ts`, mas com o provedor vindo do banco.
 *
 * O Google é um emissor constante e por isso não precisa de descoberta. Aqui o
 * emissor é o do cliente — Microsoft Entra ID, Google Workspace, Okta — e tudo
 * que muda entre eles cabe em três coisas: os endpoints (descobertos por
 * `.well-known`), como se lê o sujeito e como se lê "este e-mail é verificado".
 *
 * O que NÃO muda, e é o que segura o resto de pé:
 *
 * - **assinatura conferida contra o JWKS do emissor**, com `iss` e `aud` exatos;
 * - **`state`, `nonce` e PKCE por tentativa**, gerados por `criarDesafio`;
 * - **a chave da conta é `(emissor, sujeito)`**, nunca o e-mail.
 *
 * As armadilhas de `docs/pesquisa/sso-multi-tenant.md` §8 estão marcadas uma a
 * uma no código abaixo. Nenhuma delas dá erro quando está errada: dá login
 * concedido.
 */

/**
 * Quem é o IdP. Não é enfeite: o Entra lê sujeito e e-mail verificado de um jeito
 * diferente de todo mundo, e tratar os dois iguais é exatamente o buraco da §8.
 *
 * A lista vem do schema, que é onde o `check` do banco a repete. Duas listas para
 * a mesma coisa é como nasce um provedor que o código aceita e o banco recusa.
 */
export type ProvedorSso = (typeof PROVEDORES_SSO)[number];

export interface ConfigOidc {
  provedor: ProvedorSso;
  /** O `issuer`, sem `/.well-known/...`. É ele que a descoberta tem de confirmar. */
  emissor: string;
  clienteId: string;
  clienteSegredo: string;
  /** Precisa bater EXATAMENTE com o cadastrado no IdP. */
  urlDeRetorno: string;
  /**
   * Os `tid` aceitos, para app multi-tenant no Entra.
   *
   * Sem isto, **qualquer diretório da Microsoft entra**: o `iss` de um app
   * multi-tenant é o do diretório de quem está entrando, e a validação de `iss`
   * sozinha passa para todos eles. É a armadilha "emissor não fixado" da §8.
   */
  tenantsEntra?: readonly string[] | undefined;
}

export interface DescobertaOidc {
  emissor: string;
  autorizacao: string;
  token: string;
  jwks: string;
}

interface DocumentoDeDescoberta {
  issuer?: unknown;
  authorization_endpoint?: unknown;
  token_endpoint?: unknown;
  jwks_uri?: unknown;
}

/**
 * Lê o `.well-known/openid-configuration` do emissor.
 *
 * Duas travas, e as duas são de segurança:
 *
 * 1. **HTTPS obrigatório.** Descoberta em texto claro é o documento inteiro —
 *    inclusive o `jwks_uri` — escolhido por quem estiver no caminho.
 * 2. **O `issuer` do documento tem de ser IGUAL ao que pedimos.** É o que impede
 *    um emissor de se declarar outro e roubar a validação de `iss` (RFC 8414 §3.3,
 *    e a raiz da família de ataques de mix-up de IdP).
 */
export async function descobrir(
  emissor: string,
  buscar: typeof fetch = fetch,
): Promise<DescobertaOidc> {
  const base = emissor.replace(/\/$/, '');
  if (!base.startsWith('https://')) {
    throw new LoginErro('emissor_inseguro', 'O emissor precisa ser https.');
  }

  let documento: DocumentoDeDescoberta;
  try {
    const resposta = await buscar(`${base}/.well-known/openid-configuration`);
    if (!resposta.ok) {
      throw new LoginErro('descoberta_falhou', `A descoberta falhou (${resposta.status}).`);
    }
    documento = (await resposta.json()) as DocumentoDeDescoberta;
  } catch (erro) {
    if (erro instanceof LoginErro) throw erro;
    throw new LoginErro('descoberta_falhou', `Não consegui ler a configuração de ${base}.`);
  }

  const { issuer, authorization_endpoint, token_endpoint, jwks_uri } = documento;
  if (
    typeof issuer !== 'string' ||
    typeof authorization_endpoint !== 'string' ||
    typeof token_endpoint !== 'string' ||
    typeof jwks_uri !== 'string'
  ) {
    throw new LoginErro('descoberta_incompleta', 'A configuração veio sem os endpoints do OIDC.');
  }

  if (issuer.replace(/\/$/, '') !== base) {
    throw new LoginErro(
      'emissor_divergente',
      `A configuração de ${base} se declara emissora de "${issuer}".`,
    );
  }

  return { emissor: issuer, autorizacao: authorization_endpoint, token: token_endpoint, jwks: jwks_uri };
}

/**
 * A ida ao IdP. Mesmo desafio do Google — `criarDesafio` serve aos dois, e é de
 * propósito: `state`, `nonce` e o verificador PKCE não têm nada de específico.
 */
export function urlDeAutorizacaoOidc(
  config: ConfigOidc,
  descoberta: DescobertaOidc,
  desafio: DesafioDeLogin,
): string {
  const desafioPkce = createHash('sha256').update(desafio.verificadorPkce).digest('base64url');
  const parametros = new URLSearchParams({
    client_id: config.clienteId,
    redirect_uri: config.urlDeRetorno,
    response_type: 'code',
    scope: 'openid email profile',
    state: desafio.state,
    nonce: desafio.nonce,
    code_challenge: desafioPkce,
    code_challenge_method: 'S256',
  });
  return `${descoberta.autorizacao}?${parametros.toString()}`;
}

/**
 * O JWKS por emissor, guardado. `createRemoteJWKSet` já traz cache e rotação de
 * chave por dentro — criar um por login refaria a busca a cada entrada e faria a
 * rotação de certificado do cliente virar um pico de requisições no IdP dele.
 */
const jwksPorEmissor = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

function chavesDe(descoberta: DescobertaOidc): ReturnType<typeof createRemoteJWKSet> {
  let chaves = jwksPorEmissor.get(descoberta.jwks);
  if (!chaves) {
    chaves = createRemoteJWKSet(new URL(descoberta.jwks));
    jwksPorEmissor.set(descoberta.jwks, chaves);
  }
  return chaves;
}

/** Troca o código pelo `id_token` e o verifica. `buscar` e `chaves` são injetáveis para o teste. */
export async function trocarCodigoOidc(
  config: ConfigOidc,
  descoberta: DescobertaOidc,
  desafio: DesafioDeLogin,
  parametros: { code?: string; state?: string; error?: string },
  buscar: typeof fetch = fetch,
  chaves?: Parameters<typeof jwtVerify>[1],
): Promise<PessoaExterna> {
  if (parametros.error) {
    throw new LoginErro('provedor_recusou', `O provedor recusou: ${parametros.error}`);
  }
  if (!parametros.code) throw new LoginErro('sem_codigo', 'A volta do provedor veio sem código.');
  if (!parametros.state || parametros.state !== desafio.state) {
    throw new LoginErro('state_invalido', 'O `state` não confere: tentativa de login forjada.');
  }

  const resposta = await buscar(descoberta.token, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code: parametros.code,
      client_id: config.clienteId,
      client_secret: config.clienteSegredo,
      redirect_uri: config.urlDeRetorno,
      grant_type: 'authorization_code',
      code_verifier: desafio.verificadorPkce,
    }),
  });

  if (!resposta.ok) {
    throw new LoginErro('troca_falhou', `A troca do código falhou (${resposta.status}).`);
  }
  const corpo = (await resposta.json()) as { id_token?: string };
  if (!corpo.id_token) throw new LoginErro('sem_id_token', 'A resposta veio sem `id_token`.');

  return verificarIdTokenOidc(corpo.id_token, config, descoberta, desafio.nonce, chaves);
}

export async function verificarIdTokenOidc(
  idToken: string,
  config: ConfigOidc,
  descoberta: DescobertaOidc,
  nonce: string,
  chaves: Parameters<typeof jwtVerify>[1] = chavesDe(descoberta),
): Promise<PessoaExterna> {
  // `issuer` e `audience` exatos. Sem `audience`, uma asserção emitida para outro
  // aplicativo é aceita aqui — e no Entra basta o atacante ter o próprio app.
  const { payload } = await jwtVerify(idToken, chaves, {
    issuer: emissoresAceitos(config, descoberta),
    audience: config.clienteId,
  });

  if (payload['nonce'] !== nonce) {
    throw new LoginErro('nonce_invalido', 'O `nonce` não confere: token reaproveitado.');
  }

  // Com `aud` de vários valores, quem manda é o `azp`: sem esta conferência, um
  // token emitido para outro cliente que nos liste junto passaria.
  if (Array.isArray(payload.aud) && payload['azp'] !== config.clienteId) {
    throw new LoginErro('azp_invalido', 'O token foi emitido para outro aplicativo.');
  }

  if (config.provedor === 'entra') conferirTenantDoEntra(config, payload);

  const sujeito = sujeitoDoToken(config.provedor, payload);
  const email = typeof payload['email'] === 'string' ? payload['email'].toLowerCase() : '';
  if (!sujeito || !email) {
    throw new LoginErro('token_incompleto', 'O `id_token` veio sem sujeito ou sem `email`.');
  }

  return {
    emissor: descoberta.emissor,
    sujeito,
    email,
    emailVerificado: emailVerificado(config.provedor, payload),
    nome: typeof payload['name'] === 'string' ? payload['name'] : undefined,
    avatarUrl: typeof payload['picture'] === 'string' ? payload['picture'] : undefined,
  };
}

/**
 * No Entra multi-tenant o `iss` é `https://login.microsoftonline.com/{tid}/v2.0`,
 * e o emissor descoberto vem com o `{tenantid}` como marcador. Aceitamos os
 * emissores dos `tid` declarados, e nada além deles.
 */
function emissoresAceitos(config: ConfigOidc, descoberta: DescobertaOidc): string[] {
  const tids = config.tenantsEntra ?? [];
  if (config.provedor !== 'entra' || tids.length === 0) return [descoberta.emissor];
  return tids.map((tid) => descoberta.emissor.replace('{tenantid}', tid));
}

function conferirTenantDoEntra(config: ConfigOidc, payload: Record<string, unknown>): void {
  const tids = config.tenantsEntra ?? [];
  if (tids.length === 0) return;
  const tid = payload['tid'];
  if (typeof tid !== 'string' || !tids.includes(tid)) {
    throw new LoginErro(
      'tenant_do_idp_invalido',
      'O token veio de outro diretório da Microsoft, não do diretório desta conta.',
    );
  }
}

/**
 * O sujeito estável da conta.
 *
 * **No Entra é `{tid}:{oid}`, nunca o `sub`.** O `sub` é *pairwise* por registro
 * de aplicativo: recriar o app troca o `sub` de todo mundo e órfã todas as contas
 * de uma vez. O `oid` é o id do usuário no diretório e não muda; o `tid` na
 * frente evita colisão entre diretórios diferentes.
 */
export function sujeitoDoToken(provedor: ProvedorSso, payload: Record<string, unknown>): string {
  if (provedor === 'entra') {
    const tid = payload['tid'];
    const oid = payload['oid'];
    if (typeof tid !== 'string' || typeof oid !== 'string') return '';
    return `${tid}:${oid}`;
  }
  return typeof payload['sub'] === 'string' ? payload['sub'] : '';
}

/**
 * Este e-mail foi verificado pelo dono do domínio?
 *
 * **O Entra não emite `email_verified`.** Quem trata a ausência como falso quebra
 * o Entra inteiro; quem trata como verdadeiro abre o buraco da §8. O equivalente
 * da Microsoft é o claim opcional `xms_edov`, que a empresa precisa habilitar no
 * registro do aplicativo — e sem ele a resposta é "não sei", que aqui vale
 * "não". Contas federadas por SAML/WS-Fed não têm domínio verificado e vêm com
 * `xms_edov` falso, o que é a resposta certa.
 */
export function emailVerificado(provedor: ProvedorSso, payload: Record<string, unknown>): boolean {
  if (provedor === 'entra') return payload['xms_edov'] === true;
  return payload['email_verified'] === true;
}
