import { describe, expect, it } from 'vitest';
import { channelIdentity, contactIdFromIdentity, tunnelIdentity } from './identity.js';

const known = { contactId: 'c-1', phone: '+5511999990000' };

describe('contact identities', () => {
  it('formats channel and tunnel identities', () => {
    expect(channelIdentity(known)).toBe('5511999990000@wa.gw.msging.net');
    expect(channelIdentity({ contactId: 'c-1' })).toBe('c-1@wa.gw.msging.net');
    expect(tunnelIdentity('c-1')).toBe('c-1@tunnel.msging.net');
  });

  it('recognises only the known contact', () => {
    for (const id of ['c-1', 'c-1@tunnel.msging.net', '5511999990000@wa.gw.msging.net', '5511999990000']) {
      expect(contactIdFromIdentity(id, known)).toBe('c-1');
    }
    for (const id of ['c-2', 'c-2@tunnel.msging.net', '5511000000000@wa.gw.msging.net']) {
      expect(contactIdFromIdentity(id, known)).toBeNull();
    }
  });
});
