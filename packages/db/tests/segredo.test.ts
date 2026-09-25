import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  FIELDS_SECRETOS_OF_CHANNEL,
  SecretError,
  keyringOfAmbiente,
  cifrar,
  cifrarConfig,
  decifrar,
  decifrarConfig,
  estaCifrado,
} from '../src/segredo.js';

const keyA = randomBytes(32).toString('base64');
const keyB = randomBytes(32).toString('base64');

function keyring(atual = 'k1'): ReturnType<typeof keyringOfAmbiente> {
  return keyringOfAmbiente({
    PIPE_CHAVES_SEGREDO: `k1:${keyA},k2:${keyB}`,
    PIPE_CHAVE_SEGREDO_ATUAL: atual,
  } as NodeJS.ProcessEnv);
}

/**
 * O que estes testes protegem é a credencial do cliente: com o token da Meta
 * qualquer um manda mensagem pelo número dele. O risco não é a aplicação vazar
 * — é o dump do banco.
 */
describe('Encrypt and decrypt channel secrets', () => {
  it('vai e volta', () => {
    const k = keyring();
    const pacote = cifrar('EAAG-token-da-meta', k);
    expect(pacote).not.toContain('EAAG');
    expect(decifrar(pacote, k)).toBe('EAAG-token-da-meta');
  });

  it('dois pacotes do mesmo texto são diferentes', () => {
    // IV aleatório por gravação. Sem isso, valores iguais viram pacotes iguais e
    // o banco passa a dizer quais clientes compartilham segredo.
    const k = keyring();
    expect(cifrar('mesmo', k)).not.toBe(cifrar('mesmo', k));
  });

  it('recusa pacote adulterado em vez de devolver lixo', () => {
    const k = keyring();
    const pacote = cifrar('token', k);
    const partes = pacote.split('.');
    // Vira um bit do texto cifrado.
    const dado = Buffer.from(partes[4]!, 'base64url');
    dado[0] = (dado[0] ?? 0) ^ 0x01;
    partes[4] = dado.toString('base64url');

    expect(() => decifrar(partes.join('.'), k)).toThrow(SecretError);
  });

  it('Identify the encryption key in the envelope and keep old keys usable for decryption', () => {
    const antigo = cifrar('segredo velho', keyring('k1'));
    // Rotacionou: agora grava com k2, mas k1 continua no chaveiro.
    const depois = keyring('k2');
    expect(decifrar(antigo, depois)).toBe('segredo velho');
    expect(cifrar('segredo novo', depois)).toContain('pipev1.k2.');
  });

  it('Name the missing key when decrypting with an incomplete keyring', () => {
    const pacote = cifrar('x', keyring('k1'));
    const soK2 = keyringOfAmbiente({
      PIPE_CHAVES_SEGREDO: `k2:${keyB}`,
      PIPE_CHAVE_SEGREDO_ATUAL: 'k2',
    } as NodeJS.ProcessEnv);
    expect(() => decifrar(pacote, soK2)).toThrow(/k1/);
  });

  it('recusa decifrar texto claro, para não esconder dado não migrado', () => {
    expect(() => decifrar('token-em-texto-claro', keyring())).toThrow(SecretError);
  });

  it('Encrypting a channel configuration twice does not wrap its secrets twice', () => {
    const k = keyring();
    const uma = cifrarConfig({ tokenAcesso: 'abc', phoneNumberId: '123' }, k);
    const duas = cifrarConfig(uma, k);
    expect(duas['tokenAcesso']).toBe(uma['tokenAcesso']);
  });

  it('só os campos secretos são cifrados — o resto continua legível', () => {
    const k = keyring();
    const config: Record<string, unknown> = {
      phoneNumberId: '5531999999999',
      apiVersao: 'v21.0',
      tokenAcesso: 'EAAG-secreto',
    };
    const cifrada = cifrarConfig(config, k);

    expect(cifrada['phoneNumberId']).toBe('5531999999999');
    expect(cifrada['apiVersao']).toBe('v21.0');
    expect(estaCifrado(String(cifrada['tokenAcesso']))).toBe(true);
    expect(decifrarConfig(cifrada, k)['tokenAcesso']).toBe('EAAG-secreto');
  });

  it('Read legacy plaintext secrets but encrypt them on write', () => {
    const k = keyring();
    const legado = { tokenAcesso: 'gravado-antes-da-cifra' };
    expect(decifrarConfig(legado, k)['tokenAcesso']).toBe('gravado-antes-da-cifra');
    expect(estaCifrado(String(cifrarConfig(legado, k)['tokenAcesso']))).toBe(true);
  });

  it('Cover all four channel credentials in the secret field list', () => {
    // Se alguém adicionar um segredo novo ao canal e esquecer desta lista, ele
    // nasce em texto claro. O teste é o lembrete.
    expect([...FIELDS_SECRETOS_OF_CHANNEL]).toEqual(
      expect.arrayContaining(['tokenAcesso', 'appSecret', 'verifyToken', 'senhaSmtp']),
    );
  });

  it('Reject an incorrectly sized key while loading the environment', () => {
    expect(() =>
      keyringOfAmbiente({
        PIPE_CHAVES_SEGREDO: `curta:${Buffer.alloc(16).toString('base64')}`,
      } as NodeJS.ProcessEnv),
    ).toThrow(/32 bytes/);
  });

  it('Reject missing encryption keys before storing plaintext', () => {
    expect(() => keyringOfAmbiente({} as NodeJS.ProcessEnv)).toThrow(/PIPE_CHAVES_SEGREDO/);
  });
});
