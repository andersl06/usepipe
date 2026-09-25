import { createHash } from 'node:crypto';
import { SignJWT, generateKeyPair, exportJWK, importJWK } from 'jose';
import { describe, expect, it } from 'vitest';
import {
  GOOGLE,
  LoginError,
  createChallenge,
  domainOfEmail,
  ehDomainPublic,
  exchangeCode,
  urlOfAuthorization,
  verificarIdToken,
} from '../src/google.js';
import type { ConfigDoGoogle } from '../src/google.js';

const config: ConfigDoGoogle = {
  clienteId: 'cliente-de-teste.apps.googleusercontent.com',
  customerSecret: 'segredo-de-teste',
  urlOfCallback: 'https://gestao.pipe.com.br/entrar/google',
};

/** Um par de chaves nosso, para assinar `id_token` sem sair para a rede. */
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

describe('login com Google', () => {
  it('Include `state`, `nonce`, and the derived PKCE challenge in the authorization URL', () => {
    const desafio = createChallenge('/relatorios');
    const url = new URL(urlOfAuthorization(config, desafio));

    expect(url.origin + url.pathname).toBe(GOOGLE.autorizacao);
    expect(url.searchParams.get('state')).toBe(desafio.state);
    expect(url.searchParams.get('nonce')).toBe(desafio.nonce);
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('code_challenge')).toBe(
      createHash('sha256').update(desafio.verificadorPkce).digest('base64url'),
    );
    // O verificador em si NUNCA vai na ida — é isso que faz o PKCE valer.
    expect(url.search).not.toContain(desafio.verificadorPkce);
  });

  it('Replace external redirect destinations with the root path', () => {
    expect(createChallenge('https://malicioso.example/x').destination).toBe('/');
    expect(createChallenge('//malicioso.example').destination).toBe('/');
    expect(createChallenge('/historico').destination).toBe('/historico');
  });

  it('recusa a volta com state diferente do que foi enviado', async () => {
    const desafio = createChallenge();
    await expect(
      exchangeCode(config, desafio, { code: 'abc', state: 'outro' }),
    ).rejects.toThrow(/state/);
  });

  it('Reject a Google callback containing an error', async () => {
    const desafio = createChallenge();
    await expect(
      exchangeCode(config, desafio, { error: 'access_denied', state: desafio.state }),
    ).rejects.toThrow(/recusou/);
  });

  it('aceita o id_token bem formado e devolve emissor, sujeito e e-mail', async () => {
    const { privateKey, publica } = await keysOfTest();
    const token = await assinar(privateKey, {
      iss: GOOGLE.emissor,
      aud: config.clienteId,
      sub: '110123456789',
      email: 'Ana@Empresa.com.br',
      email_verified: true,
      name: 'Ana Ribeiro',
      nonce: 'n-1',
    });

    const pessoa = await verificarIdToken(token, config, 'n-1', publica);
    expect(pessoa.sujeito).toBe('110123456789');
    // Normalizado: e-mail é caixa-insensível e comparar cru cria conta duplicada.
    expect(pessoa.email).toBe('ana@empresa.com.br');
    expect(pessoa.emissor).toBe(GOOGLE.emissor);
  });

  it('recusa e-mail que o Google não confirmou', async () => {
    // Sem isto, quem cria conta no Google com o endereço de outra pessoa entra
    // como ela — é o caminho de escalada mais barato que existe em OIDC.
    const { privateKey, publica } = await keysOfTest();
    const token = await assinar(privateKey, {
      iss: GOOGLE.emissor,
      aud: config.clienteId,
      sub: '1',
      email: 'chefe@empresa.com.br',
      email_verified: false,
      nonce: 'n-1',
    });
    await expect(verificarIdToken(token, config, 'n-1', publica)).rejects.toThrow(LoginError);
  });

  it('recusa token com nonce de outra tentativa', async () => {
    const { privateKey, publica } = await keysOfTest();
    const token = await assinar(privateKey, {
      iss: GOOGLE.emissor,
      aud: config.clienteId,
      sub: '1',
      email: 'ana@empresa.com.br',
      email_verified: true,
      nonce: 'de-outra-sessao',
    });
    await expect(verificarIdToken(token, config, 'n-1', publica)).rejects.toThrow(/nonce/);
  });

  it('recusa token emitido para outro cliente', async () => {
    const { privateKey, publica } = await keysOfTest();
    const token = await assinar(privateKey, {
      iss: GOOGLE.emissor,
      aud: 'app-de-outra-empresa.apps.googleusercontent.com',
      sub: '1',
      email: 'ana@empresa.com.br',
      email_verified: true,
      nonce: 'n-1',
    });
    await expect(verificarIdToken(token, config, 'n-1', publica)).rejects.toThrow();
  });

  it('Reject a token signed with an untrusted key', async () => {
    const { privateKey } = await keysOfTest();
    const { publica: outraPublica } = await keysOfTest();
    const token = await assinar(privateKey, {
      iss: GOOGLE.emissor,
      aud: config.clienteId,
      sub: '1',
      email: 'ana@empresa.com.br',
      email_verified: true,
      nonce: 'n-1',
    });
    await expect(verificarIdToken(token, config, 'n-1', outraPublica)).rejects.toThrow();
  });

  it('Send the PKCE verifier and client secret during Google code exchange', async () => {
    const { privateKey, publica } = await keysOfTest();
    const desafio = createChallenge();
    const idToken = await assinar(privateKey, {
      iss: GOOGLE.emissor,
      aud: config.clienteId,
      sub: '42',
      email: 'ana@empresa.com.br',
      email_verified: true,
      nonce: desafio.nonce,
    });

    let corpoEnviado = '';
    const buscar = (async (_url: string, options?: RequestInit) => {
      corpoEnviado = String(options?.body ?? '');
      return {
        ok: true,
        status: 200,
        json: async () => ({ id_token: idToken }),
      } as Response;
    }) as unknown as typeof fetch;

    const pessoa = await exchangeCode(
      config,
      desafio,
      { code: 'codigo-do-google', state: desafio.state },
      buscar,
      publica,
    );

    expect(pessoa.sujeito).toBe('42');
    // O verificador só aparece AQUI, na troca — nunca na ida ao Google.
    expect(corpoEnviado).toContain(`code_verifier=${encodeURIComponent(desafio.verificadorPkce)}`);
    expect(corpoEnviado).toContain('grant_type=authorization_code');
  });

  it('Fail when Google returns an HTTP error during code exchange', async () => {
    const desafio = createChallenge();
    const buscar = (async () => ({ ok: false, status: 400 }) as Response) as unknown as typeof fetch;
    await expect(
      exchangeCode(config, desafio, { code: 'c', state: desafio.state }, buscar),
    ).rejects.toThrow(/400/);
  });

  it('Distinguish company email domains from public email providers', () => {
    expect(domainOfEmail('ana@empresa.com.br')).toBe('empresa.com.br');
    expect(ehDomainPublic('ana@gmail.com')).toBe(true);
    expect(ehDomainPublic('ana@empresa.com.br')).toBe(false);
    // Se `gmail.com` fosse cadastrável, o primeiro a registrá-lo levaria todo
    // mundo que usa Gmail para o tenant dele.
    expect(ehDomainPublic('ana@outlook.com')).toBe(true);
  });
});
