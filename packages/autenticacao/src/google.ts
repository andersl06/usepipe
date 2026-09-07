import { createHash, randomBytes } from 'node:crypto';
import { createRemoteJWKSet, jwtVerify } from 'jose';

/**
 * Login com Google, pelo OpenID Connect.
 *
 * O fluxo é o de código de autorização com PKCE. Três coisas aqui não são
 * escolha de estilo, e cada uma fecha um ataque conhecido:
 *
 * 1. **O `id_token` é verificado contra o JWKS do Google**, com emissor e
 *    audiência conferidos. Aceitar o token sem verificar assinatura é aceitar
 *    qualquer um que saiba montar um JSON.
 * 2. **`state` e `nonce` são gerados por tentativa e conferidos na volta.** O
 *    `state` fecha CSRF de login (a vítima entrando na conta do atacante); o
 *    `nonce` fecha replay de um `id_token` capturado.
 * 3. **PKCE**, mesmo com segredo de cliente. Custa três linhas e protege se o
 *    código de autorização vazar no caminho.
 *
 * E a que mais derruba implementação: **a chave da conta é `(emissor, sujeito)`,
 * nunca o e-mail.** E-mail muda de dono dentro de uma empresa, e quem herda o
 * endereço de quem saiu herdaria a conta. Além disso só aceitamos e-mail com
 * `email_verified`: sem isso, quem cria conta no Google com o endereço de outra
 * pessoa entra como ela.
 */

/** Descoberta do Google. Constante, e por isso não vale buscar o documento. */
export const GOOGLE = {
  emissor: 'https://accounts.google.com',
  autorizacao: 'https://accounts.google.com/o/oauth2/v2/auth',
  token: 'https://oauth2.googleapis.com/token',
  jwks: 'https://www.googleapis.com/oauth2/v3/certs',
} as const;

export class LoginErro extends Error {
  constructor(
    readonly codigo: string,
    mensagem: string,
  ) {
    super(mensagem);
    this.name = 'LoginErro';
  }
}

export interface ConfigDoGoogle {
  clienteId: string;
  clienteSegredo: string;
  /** Precisa bater EXATAMENTE com o cadastrado no Google Cloud Console. */
  urlDeRetorno: string;
}

export function configDoAmbiente(env: NodeJS.ProcessEnv = process.env): ConfigDoGoogle {
  const clienteId = env['GOOGLE_CLIENTE_ID'];
  const clienteSegredo = env['GOOGLE_CLIENTE_SEGREDO'];
  const urlDeRetorno = env['GOOGLE_URL_RETORNO'];
  if (!clienteId || !clienteSegredo || !urlDeRetorno) {
    throw new LoginErro(
      'google_sem_config',
      'Faltam GOOGLE_CLIENTE_ID, GOOGLE_CLIENTE_SEGREDO ou GOOGLE_URL_RETORNO.',
    );
  }
  return { clienteId, clienteSegredo, urlDeRetorno };
}

/** O que precisa sobreviver entre a ida e a volta, guardado em cookie assinado. */
export interface DesafioDeLogin {
  state: string;
  nonce: string;
  verificadorPkce: string;
  /** Para onde voltar depois de entrar. Caminho interno, nunca URL absoluta. */
  destino: string;
}

export function criarDesafio(destino = '/'): DesafioDeLogin {
  return {
    state: randomBytes(24).toString('base64url'),
    nonce: randomBytes(24).toString('base64url'),
    verificadorPkce: randomBytes(32).toString('base64url'),
    // Só caminho interno: destino absoluto vira redirecionamento aberto, que é
    // como se monta phishing usando o nosso domínio como trampolim.
    destino: destino.startsWith('/') && !destino.startsWith('//') ? destino : '/',
  };
}

export function urlDeAutorizacao(config: ConfigDoGoogle, desafio: DesafioDeLogin): string {
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
    // Sem `prompt=select_account` quem tem várias contas entra sempre na última.
    prompt: 'select_account',
  });
  return `${GOOGLE.autorizacao}?${parametros.toString()}`;
}

export interface PessoaDoGoogle {
  emissor: string;
  /** O `sub`. É ele que identifica a conta, e ele nunca muda. */
  sujeito: string;
  email: string;
  nome: string | undefined;
  avatarUrl: string | undefined;
}

const jwks = createRemoteJWKSet(new URL(GOOGLE.jwks));

/**
 * Troca o código pelo `id_token` e o verifica.
 *
 * `buscar` é injetável para o teste não sair para a rede — e para que a troca de
 * código, que é a parte que fala com o Google, possa ser exercitada sem segredo
 * de verdade.
 */
export async function trocarCodigo(
  config: ConfigDoGoogle,
  desafio: DesafioDeLogin,
  parametros: { code?: string; state?: string; error?: string },
  buscar: typeof fetch = fetch,
  chaves: Parameters<typeof jwtVerify>[1] = jwks,
): Promise<PessoaDoGoogle> {
  if (parametros.error) {
    throw new LoginErro('google_recusou', `O Google recusou: ${parametros.error}`);
  }
  if (!parametros.code) throw new LoginErro('sem_codigo', 'A volta do Google veio sem código.');

  // Comparação simples serve: `state` é nosso, gerado agora, e não é segredo de
  // longa duração — o que importa é que o valor volte igual ao que mandamos.
  if (!parametros.state || parametros.state !== desafio.state) {
    throw new LoginErro('state_invalido', 'O `state` não confere: tentativa de login forjada.');
  }

  const resposta = await buscar(GOOGLE.token, {
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

  return verificarIdToken(corpo.id_token, config, desafio.nonce, chaves);
}

export async function verificarIdToken(
  idToken: string,
  config: ConfigDoGoogle,
  nonce: string,
  chaves: Parameters<typeof jwtVerify>[1] = jwks,
): Promise<PessoaDoGoogle> {
  const { payload } = await jwtVerify(idToken, chaves, {
    issuer: [GOOGLE.emissor, 'accounts.google.com'],
    audience: config.clienteId,
  });

  if (payload['nonce'] !== nonce) {
    throw new LoginErro('nonce_invalido', 'O `nonce` não confere: token reaproveitado.');
  }

  const sujeito = typeof payload.sub === 'string' ? payload.sub : '';
  const email = typeof payload['email'] === 'string' ? payload['email'].toLowerCase() : '';
  if (!sujeito || !email) {
    throw new LoginErro('token_incompleto', 'O `id_token` veio sem `sub` ou sem `email`.');
  }

  // Sem isto, quem cria conta no Google com o endereço de outra pessoa entra
  // como ela. O Google marca `email_verified` para conta de Workspace e para
  // Gmail; ausência é motivo de recusa, não de tolerância.
  if (payload['email_verified'] !== true) {
    throw new LoginErro('email_nao_verificado', 'O Google não confirmou este e-mail.');
  }

  return {
    emissor: GOOGLE.emissor,
    sujeito,
    email,
    nome: typeof payload['name'] === 'string' ? payload['name'] : undefined,
    avatarUrl: typeof payload['picture'] === 'string' ? payload['picture'] : undefined,
  };
}

/** O domínio do e-mail, para descobrir a que tenant a pessoa pertence. */
export function dominioDoEmail(email: string): string {
  return email.slice(email.lastIndexOf('@') + 1).toLowerCase();
}

/**
 * Domínios de e-mail pessoal, que nunca identificam uma empresa.
 *
 * Quem entra com um destes não é descoberto por domínio: entra por convite ou
 * pelo link direto do cliente. Sem esta lista, o primeiro a cadastrar
 * `gmail.com` levaria todo mundo para o tenant dele.
 */
export const DOMINIOS_PUBLICOS = new Set([
  'gmail.com',
  'googlemail.com',
  'hotmail.com',
  'outlook.com',
  'live.com',
  'yahoo.com',
  'yahoo.com.br',
  'icloud.com',
  'me.com',
  'bol.com.br',
  'uol.com.br',
  'terra.com.br',
  'proton.me',
  'protonmail.com',
]);

export function ehDominioPublico(email: string): boolean {
  return DOMINIOS_PUBLICOS.has(dominioDoEmail(email));
}
