import { describe, expect, it } from 'vitest';
import { cifrarConfig, keyringOfAmbiente } from '@pipe/db';
import { credentialsOf } from '../src/entrega.js';

/**
 * O canal grava o token CIFRADO (`cifrarConfig`). O worker tem de decifrar antes
 * de montar o `Bearer` — o dublê do WhatsApp não percebe token cifrado, e sem este
 * teste o envio real quebraria em silêncio.
 */
describe('Resolve channel credentials from encrypted configuration', () => {
  it('Decrypt the channel token before sending a request to Meta', () => {
    process.env['PIPE_CHAVES_SEGREDO'] = `teste:${Buffer.alloc(32, 9).toString('base64')}`;
    process.env['PIPE_CHAVE_SEGREDO_ATUAL'] = 'teste';
    const config = cifrarConfig({ phoneNumberId: '123', tokenAcesso: 'token-de-verdade' }, keyringOfAmbiente());
    expect(config['tokenAcesso']).not.toBe('token-de-verdade');
    expect(credentialsOf(config)).toMatchObject({ phoneNumberId: '123', tokenAcesso: 'token-de-verdade' });
  });

  it('Allow plaintext channel configuration without a keyring', () => {
    delete process.env['PIPE_CHAVES_SEGREDO'];
    expect(credentialsOf({ phoneNumberId: '1', tokenAcesso: 'claro' })).toMatchObject({ tokenAcesso: 'claro' });
  });
});
