import { createHash } from 'node:crypto';
import { SignJWT, exportJWK, generateKeyPair, importJWK } from 'jose';
import { describe, expect, it } from 'vitest';
import { createChallenge } from '../src/google.js';
import {
  descobrir,
  emailVerificado,
  sujeitoDoToken,
  exchangeCodeOidc,
  urlOfAuthorizationOidc,
  verificarIdTokenOidc,
} from '../src/oidc.js';
import type { ConfigOidc, DescobertaOidc } from '../src/oidc.js';

/**
 * One test per trap in `referencias-blip/pesquisa/sso-multi-tenant.md` section 8.
 *
 * When these checks are wrong, they do not raise errors: they silently grant the wrong person login. Each therefore needs its own test rather than one broad happy-path test.
 */

const EMISSOR = 'https://acme.okta.example';
const EMISSOR_ENTRA = 'https://login.microsoftonline.com/aaaa1111-2222-3333-4444-555566667777/v2.0';

const descoberta: DescobertaOidc = {
  emissor: EMISSOR,
  authorization: `${EMISSOR}/oauth2/v1/authorize`,
  token: `${EMISSOR}/oauth2/v1/token`,
  jwks: `${EMISSOR}/oauth2/v1/keys`,
};

const config: ConfigOidc = {
  provedor: 'okta',
  emissor: EMISSOR,
  clienteId: 'cliente-do-pipe',
  customerSecret: 'segredo-do-pipe',
  urlOfCallback: 'https://api.pipe.test/v1/auth/sso/callback',
};

async function keysOfTest() {
  const { publicKey, privateKey } = await generateKeyPair('RS256');
  const jwk = await exportJWK(publicKey);
  return { privateKey, publica: await importJWK({ ...jwk, alg: 'RS256' }, 'RS256') };
}

async function assinar(
  privateKey: Parameters<SignJWT['sign']>[0],
  claims: Record<string, unknown>,
): Promise<string> {
  return new SignJWT(claims)
    .setProtectedHeader({ alg: 'RS256' })
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(privateKey);
}


function buscarDescoberta(document: unknown, ok = true): typeof fetch {
  return (async () => ({ ok, status: ok ? 200 : 404, json: async () => document }) as Response) as
    unknown as typeof fetch;
}

describe('Discover identity provider endpoints through `.well-known`', () => {
  it('Read authorization and token endpoints from discovery metadata', async () => {
    const achado = await descobrir(
      EMISSOR,
      buscarDescoberta({
        issuer: EMISSOR,
        authorization_endpoint: descoberta.authorization,
        token_endpoint: descoberta.token,
        jwks_uri: descoberta.jwks,
      }),
    );
    expect(achado).toEqual(descoberta);
  });

  it('recusa emissor sem https', async () => {
    // Plaintext discovery lets an intermediary choose the entire document, including `jwks_uri`.
    // escolhido por quem estiver no caminho.
    await expect(descobrir('http://acme.example')).rejects.toThrow(/https/);
  });

  it('Reject discovery metadata that names a different issuer', async () => {
    // The root of IdP mix-up attacks: an issuer claiming to be another and taking over
    // our subsequent `iss` validation.
    await expect(
      descobrir(
        EMISSOR,
        buscarDescoberta({
          issuer: 'https://login.microsoftonline.com/outra/v2.0',
          authorization_endpoint: descoberta.authorization,
          token_endpoint: descoberta.token,
          jwks_uri: descoberta.jwks,
        }),
      ),
    ).rejects.toThrow(/emissora/);
  });

  it('Reject discovery metadata without required endpoints', async () => {
    await expect(descobrir(EMISSOR, buscarDescoberta({ issuer: EMISSOR }))).rejects.toThrow(
      /endpoints/,
    );
  });
});

describe('ida ao IdP', () => {
  it('leva state, nonce e o desafio PKCE derivado, nunca o verificador', () => {
    const desafio = createChallenge('/relatorios');
    const url = new URL(urlOfAuthorizationOidc(config, descoberta, desafio));

    expect(url.origin + url.pathname).toBe(descoberta.authorization);
    expect(url.searchParams.get('state')).toBe(desafio.state);
    expect(url.searchParams.get('nonce')).toBe(desafio.nonce);
    expect(url.searchParams.get('code_challenge')).toBe(
      createHash('sha256').update(desafio.verificadorPkce).digest('base64url'),
    );
    expect(url.search).not.toContain(desafio.verificadorPkce);
  });
});

describe('Verify ID tokens (`id_token`)', () => {
  it('aceita o token bem formado e devolve emissor, sujeito e e-mail', async () => {
    const { privateKey, publica } = await keysOfTest();
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
    // Without `audience`, an assertion for another app could enter here; in
    // Entra, the attacker only needs their own app registration.
    const { privateKey, publica } = await keysOfTest();
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

  it('Require `azp` to match our client when `aud` contains multiple audiences', async () => {
    const { privateKey, publica } = await keysOfTest();
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
    const { privateKey, publica } = await keysOfTest();
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

  it('Reject a token signed with an untrusted key', async () => {
    const { privateKey } = await keysOfTest();
    const { publica: outra } = await keysOfTest();
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
    // The response passes through the browser and is easy to capture. A per-attempt
    // `nonce` prevents replay, and the challenge cookie must expire on return.
    // na volta.
    const { privateKey, publica } = await keysOfTest();
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
    authorization: `${EMISSOR_ENTRA}/authorize`,
    token: `${EMISSOR_ENTRA}/token`,
    jwks: `${EMISSOR_ENTRA}/keys`,
  };
  const tid = 'aaaa1111-2222-3333-4444-555566667777';
  const configEntra: ConfigOidc = {
    provedor: 'entra',
    emissor: EMISSOR_ENTRA,
    clienteId: 'cliente-do-pipe',
    customerSecret: 'segredo',
    urlOfCallback: config.urlOfCallback,
    tenantsEntra: [tid],
  };

  it('Use `{tid}:{oid}` as the account key instead of `sub`', () => {
    // `sub` is pairwise per app registration: recreating the app changes
    // everyone's `sub` and orphans ALL linked accounts. `oid` stays stable.
    expect(sujeitoDoToken('entra', { sub: 'pairwise-xyz', tid, oid: 'oid-1' })).toBe(
      `${tid}:oid-1`,
    );
    expect(sujeitoDoToken('generico', { sub: 'pairwise-xyz', oid: 'oid-1' })).toBe('pairwise-xyz');
    // Without `oid`, there is no Entra subject; reject rather than falling back to `sub`.
    expect(sujeitoDoToken('entra', { sub: 'pairwise-xyz', tid })).toBe('');
  });

  it('e-mail verificado no Entra é xms_edov, não email_verified', () => {
    // Entra does not emit `email_verified`. Treating its absence as true
    // abre o buraco; quem exige `email_verified` quebra o Entra inteiro.
    expect(emailVerificado('entra', { xms_edov: true })).toBe(true);
    expect(emailVerificado('entra', {})).toBe(false);
    expect(emailVerificado('entra', { email_verified: true })).toBe(false);
    expect(emailVerificado('generico', { email_verified: true })).toBe(true);
  });

  it('aceita o token do diretório declarado e monta o sujeito estável', async () => {
    const { privateKey, publica } = await keysOfTest();
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
    // In a multitenant app, checking only the shape of `iss` admits any
    // directory. Checking `tid` against the tenant's allowlist closes that gap.
    const { privateKey, publica } = await keysOfTest();
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
    // Rejection happens when matching this identity to an existing user, not here
    // (`entrada.ts`). This lets the connection test SHOW the administrator
    // that the claim must be enabled instead of merely failing.
    const { privateKey, publica } = await keysOfTest();
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
  it('Send the PKCE verifier and client secret only during code exchange', async () => {
    const { privateKey, publica } = await keysOfTest();
    const desafio = createChallenge();
    const idToken = await assinar(privateKey, {
      iss: EMISSOR,
      aud: config.clienteId,
      sub: '42',
      email: 'ana@acme.com.br',
      email_verified: true,
      nonce: desafio.nonce,
    });

    let corpoEnviado = '';
    const buscar = (async (_url: string, options?: RequestInit) => {
      corpoEnviado = String(options?.body ?? '');
      return { ok: true, status: 200, json: async () => ({ id_token: idToken }) } as Response;
    }) as unknown as typeof fetch;

    const pessoa = await exchangeCodeOidc(
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
    // `state` prevents login CSRF: a victim signing into the attacker's account.
    const desafio = createChallenge();
    await expect(
      exchangeCodeOidc(config, descoberta, desafio, { code: 'abc', state: 'outro' }),
    ).rejects.toThrow(/state/);
  });

  it('Reject an identity provider callback containing an error', async () => {
    const desafio = createChallenge();
    await expect(
      exchangeCodeOidc(config, descoberta, desafio, {
        error: 'access_denied',
        state: desafio.state,
      }),
    ).rejects.toThrow(/recusou/);
  });
});
