import { describe, expect, it } from 'vitest';
import { cifrarConfig, keyringOfAmbiente } from '@pipe/db';
import { credentialsOf } from '../src/delivery.js';

/**
 * The channel stores an ENCRYPTED token (`cifrarConfig`). The worker must decrypt it before building `Bearer`; the WhatsApp double does not detect an encrypted token, so real delivery would otherwise fail silently.
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
