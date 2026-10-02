import { describe, expect, it } from 'vitest';
import {
  asAccount,
  asDocument,
  asDocuments,
  comoTicket,
  identity,
} from '../src/translation.js';
import type { ConversationRow, MessageRow } from '../src/translation.js';

/**
 * Bridge translation can fail silently: a wrong field name does not crash, but can show incorrect client data. Test every mapping for that reason.
 */

function conversation(sobre: Partial<ConversationRow> = {}): ConversationRow {
  return {
    id: '3f2504e0-4f89-41d3-9a0c-0305e82c3301',
    state: 'Waiting',
    sequentialNumber: 42,
    parentSequentialNumber: null,
    emEsperaDesde: null,
    priority: 'sem_prioridade',
    criada_em: '2026-09-12T10:00:00.000Z',
    atribuida_em: null,
    encerrada_em: null,
    lastMessageIn: '2026-09-12T10:05:00.000Z',
    lastMessageOf: 'contato',
    queueId: 'f1',
    queueName: 'Suporte',
    agentId: null,
    agentName: null,
    agentEmail: null,
    contactId: 'c1',
    contactName: 'Maria Souza',
    contactPhone: '+5531999998888',
    channelType: 'whatsapp_cloud',
    lastMessageText: 'oi, preciso de ajuda',
    ...sobre,
  };
}

describe('conversation -> ticket', () => {
  it('o status sai igual ao valor gravado', () => {
    expect(comoTicket(conversation()).status).toBe('Waiting');
    expect(comoTicket(conversation()).isNew).toBe(true);
    const fechado = comoTicket(conversation({ state: 'ClosedClientInactivity' }));
    expect(fechado.status).toBe('ClosedClientInactivity');
    expect(fechado.isNew).toBe(false);
  });

  it('sequencial, pai e início do standby vêm do banco', () => {
    const t = comoTicket(conversation());
    expect(t.sequentialId).toBe(42);
    expect(t.parentSequentialId).toBeNull();
    expect(t.standbyModeStart).toBeNull();
    const filho = comoTicket(conversation({ state: 'Transferred', parentSequentialNumber: 41 }));
    expect(filho.parentSequentialId).toBe(41);
    const espera = comoTicket(conversation({ state: 'Open', emEsperaDesde: '2026-09-12T10:10:00.000Z' }));
    expect(espera.standbyModeStart).toBe('2026-09-12T10:10:00.000Z');
  });

  it('carries name, phone and queue the way the screen reads them', () => {
    const t = comoTicket(conversation());
    expect(t['customerName']).toBe('Maria Souza');
    expect(t['customerPhoneNumber']).toBe('+5531999998888');
    expect(t['team']).toBe('Suporte');
  });

  it('the contact\'s last message is `received`; ours is `sent`', () => {
    const doCliente = comoTicket(conversation()) as { lastMessage: { direction: string } };
    expect(doCliente.lastMessage.direction).toBe('received');
    const nossa = comoTicket(conversation({ lastMessageOf: 'atendente' })) as {
      lastMessage: { direction: string };
    };
    expect(nossa.lastMessage.direction).toBe('sent');
  });

  it('without an agent, `agentIdentity` is null — not a made-up identity', () => {
    expect(comoTicket(conversation())['agentIdentity']).toBeNull();
    const withAgent = comoTicket(
      conversation({ agentEmail: 'ana@demo.pipe.app', agentName: 'Ana' }),
    );
    expect(withAgent['agentIdentity']).toBe('ana%40demo.pipe.app@pipe.local');
  });

  it('Pipe\'s priority travels as-is, without an approximate translation', () => {
    const t = comoTicket(conversation({ priority: 'maxima' })) as {
      customerAccount: { extras: Record<string, string> };
    };
    expect(t.customerAccount.extras['prioridadePipe']).toBe('maxima');
  });
});

describe('message -> document', () => {
  const base: MessageRow = {
    id: 'm1',
    criada_em: '2026-09-12T10:05:00.000Z',
    direction: 'entrada',
    autor_tipo: 'contato',
    tipo: 'texto',
    conteudo: 'oi',
  };

  it('inbound becomes received and outbound becomes sent', () => {
    expect(asDocument(base)!['direction']).toBe('received');
    expect(asDocument({ ...base, direction: 'saida', autor_tipo: 'atendente' })!['direction']).toBe(
      'sent',
    );
  });

  it('an internal note never enters the customer\'s conversation', () => {
    expect(asDocument({ ...base, direction: 'interna', autor_tipo: 'atendente' })).toBeNull();
    const lista = asDocuments([base, { ...base, id: 'm2', direction: 'interna' }]);
    expect(lista).toHaveLength(1);
  });

  it('o tipo do Pipe vira o content type que a bolha da tela entende', () => {
    expect(asDocument(base)!['type']).toBe('text/plain');
    expect(asDocument({ ...base, tipo: 'imagem' })!['type']).toBe('image/jpeg');
    expect(asDocument({ ...base, tipo: 'inexistente' })!['type']).toBe('text/plain');
  });

  it('quem saiu tem emissor; o que o cliente mandou, não', () => {
    const ofAgent = { ...base, direction: 'saida', autor_tipo: 'atendente' };
    const doBot = { ...base, direction: 'saida', autor_tipo: 'bot' };
    expect(asDocument(ofAgent)!['messageEmitter']).toBe('Human');
    expect(asDocument(doBot)!['messageEmitter']).toBe('Bot');
    // An inbound message has no emitter; including one made the screen label the client as a bot.
    expect(asDocument(base)!['messageEmitter']).toBeUndefined();
  });
});

describe('agent account', () => {
  it('translates state and never returns an empty status', () => {
    const account = asAccount(
      { id: 'u1', nome: 'Ana Ribeiro', email: 'ana@demo.pipe.app', state: 'Online' },
      ['Suporte'],
    );
    expect(account['status']).toBe('Online');
    // Without an admin role, the sidebar hides management items.
    expect(account['isOwner']).toBe(false);
    const admin = asAccount(
      { id: 'u1', nome: 'Ana', email: 'ana@demo.pipe.app', state: 'Online', ehAdministrador: true },
      [],
    );
    expect(admin['isOwner']).toBe(true);
    expect(account['identity']).toBe('ana%40demo.pipe.app@pipe.local');
    expect(account['teams']).toEqual(['Suporte']);

    const withoutState = asAccount({ id: 'u1', nome: null, email: 'ana@demo.pipe.app' }, []);
    expect(withoutState['status']).toBe('Offline');
    expect(withoutState['fullName']).toBe('ana@demo.pipe.app');
  });

  it('pausa e invisível têm nome próprio na tela', () => {
    const pausa = asAccount({ id: 'u', nome: 'X', email: 'x@y.z', state: 'Pause' }, []);
    const invisivel = asAccount({ id: 'u', nome: 'X', email: 'x@y.z', state: 'Invisible' }, []);
    expect(pausa['status']).toBe('Pause');
    expect(invisivel['status']).toBe('Invisible');
  });
});

describe('identity', () => {
  it('escapa o arroba do e-mail, como a Blip faz', () => {
    expect(identity('ana.ribeiro@demo.pipe.app')).toBe('ana.ribeiro%40demo.pipe.app@pipe.local');
    expect(identity(null)).toBe('desconhecido@pipe.local');
  });
});
