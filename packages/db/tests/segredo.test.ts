import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  CAMPOS_SECRETOS_DE_CANAL,
  SegredoErro,
  chaveiroDoAmbiente,
  cifrar,
  cifrarConfig,
  decifrar,
  decifrarConfig,
  estaCifrado,
} from '../src/segredo.js';

const chaveA = randomBytes(32).toString('base64');
const chaveB = randomBytes(32).toString('base64');

function chaveiro(atual = 'k1'): ReturnType<typeof chaveiroDoAmbiente> {
  return chaveiroDoAmbiente({
    PIPE_CHAVES_SEGREDO: `k1:${chaveA},k2:${chaveB}`,
    PIPE_CHAVE_SEGREDO_ATUAL: atual,
  } as NodeJS.ProcessEnv);
}

/**
 * O que estes testes protegem é a credencial do cliente: com o token da Meta
 * qualquer um manda mensagem pelo número dele. O risco não é a aplicação vazar
 * — é o dump do banco.
 */
describe('cifra de segredo de canal', () => {
  it('vai e volta', () => {
    const k = chaveiro();
    const pacote = cifrar('EAAG-token-da-meta', k);
    expect(pacote).not.toContain('EAAG');
    expect(decifrar(pacote, k)).toBe('EAAG-token-da-meta');
  });

  it('dois pacotes do mesmo texto são diferentes', () => {
    // IV aleatório por gravação. Sem isso, valores iguais viram pacotes iguais e
    // o banco passa a dizer quais clientes compartilham segredo.
    const k = chaveiro();
    expect(cifrar('mesmo', k)).not.toBe(cifrar('mesmo', k));
  });

  it('recusa pacote adulterado em vez de devolver lixo', () => {
    const k = chaveiro();
    const pacote = cifrar('token', k);
    const partes = pacote.split('.');
    // Vira um bit do texto cifrado.
    const dado = Buffer.from(partes[4]!, 'base64url');
    dado[0] = (dado[0] ?? 0) ^ 0x01;
    partes[4] = dado.toString('base64url');

    expect(() => decifrar(partes.join('.'), k)).toThrow(SegredoErro);
  });

  it('o envelope diz qual chave cifrou, e a antiga continua abrindo', () => {
    const antigo = cifrar('segredo velho', chaveiro('k1'));
    // Rotacionou: agora grava com k2, mas k1 continua no chaveiro.
    const depois = chaveiro('k2');
    expect(decifrar(antigo, depois)).toBe('segredo velho');
    expect(cifrar('segredo novo', depois)).toContain('pipev1.k2.');
  });

  it('chave que sumiu do chaveiro falha com nome, não em silêncio', () => {
    const pacote = cifrar('x', chaveiro('k1'));
    const soK2 = chaveiroDoAmbiente({
      PIPE_CHAVES_SEGREDO: `k2:${chaveB}`,
      PIPE_CHAVE_SEGREDO_ATUAL: 'k2',
    } as NodeJS.ProcessEnv);
    expect(() => decifrar(pacote, soK2)).toThrow(/k1/);
  });

  it('recusa decifrar texto claro, para não esconder dado não migrado', () => {
    expect(() => decifrar('token-em-texto-claro', chaveiro())).toThrow(SegredoErro);
  });

  it('cifrar a configuração duas vezes não empilha envelope', () => {
    const k = chaveiro();
    const uma = cifrarConfig({ tokenAcesso: 'abc', phoneNumberId: '123' }, k);
    const duas = cifrarConfig(uma, k);
    expect(duas['tokenAcesso']).toBe(uma['tokenAcesso']);
  });

  it('só os campos secretos são cifrados — o resto continua legível', () => {
    const k = chaveiro();
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

  it('a leitura tolera texto claro do que ainda não migrou; a escrita não', () => {
    const k = chaveiro();
    const legado = { tokenAcesso: 'gravado-antes-da-cifra' };
    expect(decifrarConfig(legado, k)['tokenAcesso']).toBe('gravado-antes-da-cifra');
    expect(estaCifrado(String(cifrarConfig(legado, k)['tokenAcesso']))).toBe(true);
  });

  it('a lista de campos secretos cobre os quatro que dão acesso ao número', () => {
    // Se alguém adicionar um segredo novo ao canal e esquecer desta lista, ele
    // nasce em texto claro. O teste é o lembrete.
    expect([...CAMPOS_SECRETOS_DE_CANAL]).toEqual(
      expect.arrayContaining(['tokenAcesso', 'appSecret', 'verifyToken', 'senhaSmtp']),
    );
  });

  it('chave de tamanho errado falha na leitura do ambiente, não no primeiro uso', () => {
    expect(() =>
      chaveiroDoAmbiente({
        PIPE_CHAVES_SEGREDO: `curta:${Buffer.alloc(16).toString('base64')}`,
      } as NodeJS.ProcessEnv),
    ).toThrow(/32 bytes/);
  });

  it('ambiente sem chave falha alto em vez de gravar em texto claro', () => {
    expect(() => chaveiroDoAmbiente({} as NodeJS.ProcessEnv)).toThrow(/PIPE_CHAVES_SEGREDO/);
  });
});
