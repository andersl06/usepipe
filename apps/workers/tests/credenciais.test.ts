import { describe, expect, it } from 'vitest';
import { cifrarConfig, chaveiroDoAmbiente } from '@pipe/db';
import { credenciaisDo } from '../src/entrega.js';

/**
 * O canal grava o token CIFRADO (`cifrarConfig`). O worker tem de decifrar antes
 * de montar o `Bearer` — o dublê do WhatsApp não percebe token cifrado, e sem este
 * teste o envio real quebraria em silêncio.
 */
describe('credenciaisDo', () => {
  it('decifra o token do canal antes de mandar para a Meta', () => {
    process.env['PIPE_CHAVES_SEGREDO'] = `teste:${Buffer.alloc(32, 9).toString('base64')}`;
    process.env['PIPE_CHAVE_SEGREDO_ATUAL'] = 'teste';
    const config = cifrarConfig({ phoneNumberId: '123', tokenAcesso: 'token-de-verdade' }, chaveiroDoAmbiente());
    expect(config['tokenAcesso']).not.toBe('token-de-verdade');
    expect(credenciaisDo(config)).toMatchObject({ phoneNumberId: '123', tokenAcesso: 'token-de-verdade' });
  });

  it('config sem nada cifrado não exige chaveiro', () => {
    delete process.env['PIPE_CHAVES_SEGREDO'];
    expect(credenciaisDo({ phoneNumberId: '1', tokenAcesso: 'claro' })).toMatchObject({ tokenAcesso: 'claro' });
  });
});
