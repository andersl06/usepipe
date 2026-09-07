import { createHash } from 'node:crypto';
import { SignJWT, exportJWK, generateKeyPair, importJWK } from 'jose';
import { describe, expect, it } from 'vitest';
import { criarDesafio } from '../src/google.js';
import {
  descobrir,
  emailVerificado,
  sujeitoDoToken,
  trocarCodigoOidc,
  urlDeAutorizacaoOidc,
  verificarIdTokenOidc,
} from '../src/oidc.js';
import type { ConfigOidc, DescobertaOidc } from '../src/oidc.js';

/**
 * Um teste por armadilha de `docs/pesquisa/sso-multi-tenant.md` §8.
 *
 * O que une todas elas: **nenhuma dá erro quando está errada.** Todas dão login
 * concedido, para a pessoa errada, sem nada no log. É por isso que cada uma tem
 * teste próprio em vez de um "o fluxo funciona" só.
 */

const EMISSOR = 'https://acme.okta.example';
const EMISSOR_ENTRA = 'https://login.microsoftonline.com/aaaa1111-2222-3333-4444-555566667777/v2.0';

const descoberta: DescobertaOidc = {
  emissor: EMISSOR,
  autorizacao: `${EMISSOR}/oauth2/v1/authorize`,
  token: `${EMISSOR}/oauth2/v1/token`,
  jwks: `${EMISSOR}/oauth2/v1/keys`,
};

const config: ConfigOidc = {
  provedor: 'okta',
  emissor: EMISSOR,
  clienteId: 'cliente-do-pipe',
  clienteSegredo: 'segredo-do-pipe',
  urlDeRetorno: 'https://api.usepipe.com.br/v1/auth/sso/retorno',
};

async function chavesDeTeste() {
  const { publicKey, privateKey } = await generateKeyPair('RS256');
  const jwk = await exportJWK(publicKey);
  return { privateKey, publica: await importJWK({ ...jwk, alg: 'RS256' }, 'RS256') };
}

async function assinar(
  privateKey: Parameters<SignJWT['sign']>[0],
  reivindicacoes: Record<string, unknown>,
): Promise<string> {
  return new SignJWT(reivindicacoes)
    .setProtectedHeader({ alg: 'RS256' })
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(privateKey);
}

/** Um `fetch` que devolve o documento de descoberta pedido, sem sair para a rede. */
function buscarDescoberta(documento: unknown, ok = true): typeof fetch {
  return (async () => ({ ok, status: ok ? 200 : 404, json: async () => documento }) as Response) as
    unknown as typeof fetch;
}

describe('descoberta por .well-known', () => {
  it('lê os endpoints do documento', async () => {
    const achado = await descobrir(
      EMISSOR,
      buscarDescoberta({
        issuer: EMISSOR,
        authorization_endpoint: descoberta.autorizacao,
        token_endpoint: descoberta.token,
        jwks_uri: descoberta.jwks,
      }),
    );
    expect(achado).toEqual(descoberta);
  });

  it('recusa emissor sem https', async () => {
    // Descoberta em texto claro é o documento inteiro — inclusive o `jwks_uri` —
    // escolhido por quem estiver no caminho.
    await expect(descobrir('http://acme.example')).rejects.toThrow(/https/);
  });

  it('recusa documento que se declara emissor de outro', async () => {
    // A raiz da família de ataques de mix-up: um emissor se dizer outro e roubar
    // a validação de `iss` que faríamos depois.
    await expect(
      descobrir(
        EMISSOR,
        buscarDescoberta({
          issuer: 'https://login.microsoftonline.com/outra/v2.0',
          authorization_endpoint: descoberta.autorizacao,
          token_endpoint: descoberta.token,
          jwks_uri: descoberta.jwks,
        }),
      ),
    ).rejects.toThrow(/emissora/);
  });

  it('recusa documento sem os endpoints', async () => {
    await expect(descobrir(EMISSOR, buscarDescoberta({ issuer: EMISSOR }))).rejects.toThrow(
      /endpoints/,
    );
  });
});

describe('ida ao IdP', () => {
  it('leva state, nonce e o desafio PKCE derivado, nunca o verificador', () => {
    const desafio = criarDesafio('/relatorios');
    const url = new URL(urlDeAutorizacaoOidc(config, descoberta, desafio));

    expect(url.origin + url.pathname).toBe(descoberta.autorizacao);
    expect(url.searchParams.get('state')).toBe(desafio.state);
    expect(url.searchParams.get('nonce')).toBe(desafio.nonce);
    expect(url.searchParams.get('code_challenge')).toBe(
      createHash('sha256').update(desafio.verificadorPkce).digest('base64url'),
    );
    expect(url.search).not.toContain(desafio.verificadorPkce);
  });
});

describe('verificação do id_token', () => {
  it('aceita o token bem formado e devolve emissor, sujeito e e-mail', async () => {
    const { privateKey, publica } = await chavesDeTeste();
    const token = await assinar(privateKey, {
      iss: EMISSOR,
      aud: config.clienteId,
      sub: 'okta-00u123',
      email: 'Ana@Acme.com.br',
      email_verified: true,
      nonce: 'n-1',
    });

    const pessoa = await verificarIdTokenOidc(token, config, descoberta, 'n-1', publica);
    expect(pessoa.sujeito).toBe('okta-00u123');
    expect(pessoa.email).toBe('ana@acme.com.br');
    expect(pessoa.emissor).toBe(EMISSOR);
    expect(pessoa.emailVerificado).toBe(true);
  });

  it('recusa token emitido para outro aplicativo', async () => {
    // Sem `audience`, uma asserção feita para o app de outro entra aqui — e no
    // Entra basta o atacante ter o próprio registro de aplicativo.
    const { privateKey, publica } = await chavesDeTeste();
    const token = await assinar(privateKey, {
      iss: EMISSOR,
      aud: 'app-de-outra-empresa',
      sub: '1',
      email: 'ana@acme.com.br',
      email_verified: true,
      nonce: 'n-1',
    });
    await expect(verificarIdTokenOidc(token, config, descoberta, 'n-1', publica)).rejects.toThrow();
  });

  it('com aud de vários valores, exige azp igual ao nosso cliente', async () => {
    const { privateKey, publica } = await chavesDeTeste();
    const token = await assinar(privateKey, {
      iss: EMISSOR,
      aud: [config.clienteId, 'outro-app'],
      azp: 'outro-app',
      sub: '1',
      email: 'ana@acme.com.br',
      email_verified: true,
      nonce: 'n-1',
    });
    await expect(
      verificarIdTokenOidc(token, config, descoberta, 'n-1', publica),
    ).rejects.toThrow(/outro aplicativo/);
  });

  it('recusa token de outro emissor', async () => {
    const { privateKey, publica } = await chavesDeTeste();
    const token = await assinar(privateKey, {
      iss: 'https://idp-do-atacante.example',
      aud: config.clienteId,
      sub: '1',
      email: 'ana@acme.com.br',
      email_verified: true,
      nonce: 'n-1',
    });
    await expect(verificarIdTokenOidc(token, config, descoberta, 'n-1', publica)).rejects.toThrow();
  });

  it('recusa token assinado por outra chave', async () => {
    const { privateKey } = await chavesDeTeste();
    const { publica: outra } = await chavesDeTeste();
    const token = await assinar(privateKey, {
      iss: EMISSOR,
      aud: config.clienteId,
      sub: '1',
      email: 'ana@acme.com.br',
      email_verified: true,
      nonce: 'n-1',
    });
    await expect(verificarIdTokenOidc(token, config, descoberta, 'n-1', outra)).rejects.toThrow();
  });

  it('recusa token de outra tentativa — é o replay que o nonce fecha', async () => {
    // A resposta passa pelo navegador e é trivial de capturar. O que impede o
    // reenvio é o `nonce` ser de uma tentativa só, e o cookie do desafio morrer
    // na volta.
    const { privateKey, publica } = await chavesDeTeste();
    const token = await assinar(privateKey, {
      iss: EMISSOR,
      aud: config.clienteId,
      sub: '1',
      email: 'ana@acme.com.br',
      email_verified: true,
      nonce: 'de-outra-sessao',
    });
    await expect(
      verificarIdTokenOidc(token, config, descoberta, 'n-1', publica),
    ).rejects.toThrow(/nonce/);
  });
});

describe('Microsoft Entra ID', () => {
  const descobertaEntra: DescobertaOidc = {
    emissor: EMISSOR_ENTRA,
    autorizacao: `${EMISSOR_ENTRA}/authorize`,
    token: `${EMISSOR_ENTRA}/token`,
    jwks: `${EMISSOR_ENTRA}/keys`,
  };
  const tid = 'aaaa1111-2222-3333-4444-555566667777';
  const configEntra: ConfigOidc = {
    provedor: 'entra',
    emissor: EMISSOR_ENTRA,
    clienteId: 'cliente-do-pipe',
    clienteSegredo: 'segredo',
    urlDeRetorno: config.urlDeRetorno,
    tenantsEntra: [tid],
  };

  it('a chave da conta é {tid}:{oid}, nunca o sub', () => {
    // O `sub` é *pairwise* por registro de aplicativo: recriar o app troca o
    // `sub` de todo mundo e órfã TODAS as contas de uma vez. O `oid` não muda.
    expect(sujeitoDoToken('entra', { sub: 'pairwise-xyz', tid, oid: 'oid-1' })).toBe(
      `${tid}:oid-1`,
    );
    expect(sujeitoDoToken('generico', { sub: 'pairwise-xyz', oid: 'oid-1' })).toBe('pairwise-xyz');
    // Sem `oid` não há sujeito: melhor recusar do que cair no `sub`.
    expect(sujeitoDoToken('entra', { sub: 'pairwise-xyz', tid })).toBe('');
  });

  it('e-mail verificado no Entra é xms_edov, não email_verified', () => {
    // O Entra não emite `email_verified`. Quem trata a ausência como verdadeira
    // abre o buraco; quem exige `email_verified` quebra o Entra inteiro.
    expect(emailVerificado('entra', { xms_edov: true })).toBe(true);
    expect(emailVerificado('entra', {})).toBe(false);
    expect(emailVerificado('entra', { email_verified: true })).toBe(false);
    expect(emailVerificado('generico', { email_verified: true })).toBe(true);
  });

  it('aceita o token do diretório declarado e monta o sujeito estável', async () => {
    const { privateKey, publica } = await chavesDeTeste();
    const token = await assinar(privateKey, {
      iss: EMISSOR_ENTRA,
      aud: configEntra.clienteId,
      sub: 'pairwise-que-nao-usamos',
      tid,
      oid: 'oid-da-ana',
      email: 'ana@acme.com.br',
      xms_edov: true,
      nonce: 'n-1',
    });

    const pessoa = await verificarIdTokenOidc(token, configEntra, descobertaEntra, 'n-1', publica);
    expect(pessoa.sujeito).toBe(`${tid}:oid-da-ana`);
    expect(pessoa.emailVerificado).toBe(true);
  });

  it('recusa token de OUTRO diretório da Microsoft', async () => {
    // Em app multi-tenant, validar só a forma do `iss` deixa entrar qualquer
    // diretório. É o `tid` conferido contra a lista do cliente que fecha.
    const { privateKey, publica } = await chavesDeTeste();
    const token = await assinar(privateKey, {
      iss: EMISSOR_ENTRA,
      aud: configEntra.clienteId,
      sub: 'x',
      tid: 'bbbb2222-0000-0000-0000-000000000000',
      oid: 'oid-do-atacante',
      email: 'chefe@acme.com.br',
      xms_edov: true,
      nonce: 'n-1',
    });
    await expect(
      verificarIdTokenOidc(token, configEntra, descobertaEntra, 'n-1', publica),
    ).rejects.toThrow(/diretório/);
  });

  it('sem xms_edov o token passa, mas marcado como não verificado', async () => {
    // A recusa não é aqui: é na hora de casar a identidade com um usuário que já
    // existe (`entrada.ts`). Assim o teste da conexão consegue MOSTRAR ao admin
    // que falta habilitar o claim, em vez de só falhar.
    const { privateKey, publica } = await chavesDeTeste();
    const token = await assinar(privateKey, {
      iss: EMISSOR_ENTRA,
      aud: configEntra.clienteId,
      sub: 'x',
      tid,
      oid: 'oid-1',
      email: 'ana@acme.com.br',
      nonce: 'n-1',
    });
    const pessoa = await verificarIdTokenOidc(token, configEntra, descobertaEntra, 'n-1', publica);
    expect(pessoa.emailVerificado).toBe(false);
  });
});

describe('troca do código', () => {
  it('manda o verificador PKCE e o segredo, e só na troca', async () => {
    const { privateKey, publica } = await chavesDeTeste();
    const desafio = criarDesafio();
    const idToken = await assinar(privateKey, {
      iss: EMISSOR,
      aud: config.clienteId,
      sub: '42',
      email: 'ana@acme.com.br',
      email_verified: true,
      nonce: desafio.nonce,
    });

    let corpoEnviado = '';
    const buscar = (async (_url: string, opcoes?: RequestInit) => {
      corpoEnviado = String(opcoes?.body ?? '');
      return { ok: true, status: 200, json: async () => ({ id_token: idToken }) } as Response;
    }) as unknown as typeof fetch;

    const pessoa = await trocarCodigoOidc(
      config,
      descoberta,
      desafio,
      { code: 'codigo-do-idp', state: desafio.state },
      buscar,
      publica,
    );

    expect(pessoa.sujeito).toBe('42');
    expect(corpoEnviado).toContain(`code_verifier=${encodeURIComponent(desafio.verificadorPkce)}`);
    expect(corpoEnviado).toContain('grant_type=authorization_code');
  });

  it('recusa a volta com state diferente do que foi enviado', async () => {
    // O `state` fecha o CSRF de login: a vítima entrando na conta do atacante.
    const desafio = criarDesafio();
    await expect(
      trocarCodigoOidc(config, descoberta, desafio, { code: 'abc', state: 'outro' }),
    ).rejects.toThrow(/state/);
  });

  it('recusa a volta quando o IdP devolve erro', async () => {
    const desafio = criarDesafio();
    await expect(
      trocarCodigoOidc(config, descoberta, desafio, {
        error: 'access_denied',
        state: desafio.state,
      }),
    ).rejects.toThrow(/recusou/);
  });
});
