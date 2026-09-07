import { createHash } from 'node:crypto';
import { SignJWT, generateKeyPair, exportJWK, importJWK } from 'jose';
import { describe, expect, it } from 'vitest';
import {
  GOOGLE,
  LoginErro,
  criarDesafio,
  dominioDoEmail,
  ehDominioPublico,
  trocarCodigo,
  urlDeAutorizacao,
  verificarIdToken,
} from '../src/google.js';
import type { ConfigDoGoogle } from '../src/google.js';

const config: ConfigDoGoogle = {
  clienteId: 'cliente-de-teste.apps.googleusercontent.com',
  clienteSegredo: 'segredo-de-teste',
  urlDeRetorno: 'https://gestao.pipe.com.br/entrar/google',
};

/** Um par de chaves nosso, para assinar `id_token` sem sair para a rede. */
async function chavesDeTeste() {
  const { publicKey, privateKey } = await generateKeyPair('RS256');
  const jwk = await exportJWK(publicKey);
  return { privateKey, publica: await importJWK({ ...jwk, alg: 'RS256' }, 'RS256') };
}

async function assinar(
  privateKey: CryptoKey | Uint8Array,
  reivindicacoes: Record<string, unknown>,
): Promise<string> {
  return new SignJWT(reivindicacoes)
    .setProtectedHeader({ alg: 'RS256' })
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(privateKey as Parameters<SignJWT['sign']>[0]);
}

describe('login com Google', () => {
  it('a URL de autorização leva state, nonce e o desafio PKCE derivado', () => {
    const desafio = criarDesafio('/relatorios');
    const url = new URL(urlDeAutorizacao(config, desafio));

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

  it('destino externo vira raiz, para não virar trampolim de phishing', () => {
    expect(criarDesafio('https://malicioso.example/x').destino).toBe('/');
    expect(criarDesafio('//malicioso.example').destino).toBe('/');
    expect(criarDesafio('/historico').destino).toBe('/historico');
  });

  it('recusa a volta com state diferente do que foi enviado', async () => {
    const desafio = criarDesafio();
    await expect(
      trocarCodigo(config, desafio, { code: 'abc', state: 'outro' }),
    ).rejects.toThrow(/state/);
  });

  it('recusa a volta quando o Google devolve erro', async () => {
    const desafio = criarDesafio();
    await expect(
      trocarCodigo(config, desafio, { error: 'access_denied', state: desafio.state }),
    ).rejects.toThrow(/recusou/);
  });

  it('aceita o id_token bem formado e devolve emissor, sujeito e e-mail', async () => {
    const { privateKey, publica } = await chavesDeTeste();
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
    const { privateKey, publica } = await chavesDeTeste();
    const token = await assinar(privateKey, {
      iss: GOOGLE.emissor,
      aud: config.clienteId,
      sub: '1',
      email: 'chefe@empresa.com.br',
      email_verified: false,
      nonce: 'n-1',
    });
    await expect(verificarIdToken(token, config, 'n-1', publica)).rejects.toThrow(LoginErro);
  });

  it('recusa token com nonce de outra tentativa', async () => {
    const { privateKey, publica } = await chavesDeTeste();
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
    const { privateKey, publica } = await chavesDeTeste();
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

  it('recusa token assinado por outra chave', async () => {
    const { privateKey } = await chavesDeTeste();
    const { publica: outraPublica } = await chavesDeTeste();
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

  it('a troca do código manda o verificador PKCE e o segredo', async () => {
    const { privateKey, publica } = await chavesDeTeste();
    const desafio = criarDesafio();
    const idToken = await assinar(privateKey, {
      iss: GOOGLE.emissor,
      aud: config.clienteId,
      sub: '42',
      email: 'ana@empresa.com.br',
      email_verified: true,
      nonce: desafio.nonce,
    });

    let corpoEnviado = '';
    const buscar = (async (_url: string, opcoes?: RequestInit) => {
      corpoEnviado = String(opcoes?.body ?? '');
      return {
        ok: true,
        status: 200,
        json: async () => ({ id_token: idToken }),
      } as Response;
    }) as unknown as typeof fetch;

    const pessoa = await trocarCodigo(
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

  it('a troca falha alto quando o Google devolve erro HTTP', async () => {
    const desafio = criarDesafio();
    const buscar = (async () => ({ ok: false, status: 400 }) as Response) as unknown as typeof fetch;
    await expect(
      trocarCodigo(config, desafio, { code: 'c', state: desafio.state }, buscar),
    ).rejects.toThrow(/400/);
  });

  it('separa domínio de empresa de domínio pessoal', () => {
    expect(dominioDoEmail('ana@empresa.com.br')).toBe('empresa.com.br');
    expect(ehDominioPublico('ana@gmail.com')).toBe(true);
    expect(ehDominioPublico('ana@empresa.com.br')).toBe(false);
    // Se `gmail.com` fosse cadastrável, o primeiro a registrá-lo levaria todo
    // mundo que usa Gmail para o tenant dele.
    expect(ehDominioPublico('ana@outlook.com')).toBe(true);
  });
});
