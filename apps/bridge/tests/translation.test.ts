import { describe, expect, it } from 'vitest';
import {
  asAccount,
  asDocument,
  asDocuments,
  comoTicket,
  identity,
  numeroVisivel,
} from '../src/translation.js';
import type { LinhaConversation, LinhaMessage } from '../src/translation.js';

/**
 * Bridge translation can fail silently: a wrong field name does not crash, but can show incorrect client data. Test every mapping for that reason.
 */

function conversation(sobre: Partial<LinhaConversation> = {}): LinhaConversation {
  return {
    id: '3f2504e0-4f89-41d3-9a0c-0305e82c3301',
    state: 'na_fila',
    priority: 'sem_prioridade',
    criada_em: '2026-09-12T10:00:00.000Z',
    atribuida_em: null,
    encerrada_em: null,
    ultimaMessageIn: '2026-09-12T10:05:00.000Z',
    ultimaMessageOf: 'contato',
    queueId: 'f1',
    queueName: 'Suporte',
    agentId: null,
    agentName: null,
    agentEmail: null,
    contactId: 'c1',
    contactName: 'Maria Souza',
    contactTelefone: '+5531999998888',
    channelTipo: 'whatsapp_cloud',
    lastMessageText: 'oi, preciso de ajuda',
    ...sobre,
  };
}

describe('conversation -> ticket', () => {
  it('queued becomes Waiting; in attendance becomes Open; closed becomes Closed', () => {
    expect(comoTicket(conversation()).status).toBe('Waiting');
    expect(comoTicket(conversation({ state: 'em_atendimento' })).status).toBe('Open');
    expect(comoTicket(conversation({ state: 'atribuida' })).status).toBe('Open');
    expect(comoTicket(conversation({ state: 'em_espera' })).status).toBe('Open');
    expect(comoTicket(conversation({ state: 'encerrada' })).status).toBe('Closed');
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
    const nossa = comoTicket(conversation({ ultimaMessageOf: 'atendente' })) as {
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

  it('o número visível é estável para o mesmo id', () => {
    const a = numeroVisivel('3f2504e0-4f89-41d3-9a0c-0305e82c3301');
    const b = numeroVisivel('3f2504e0-4f89-41d3-9a0c-0305e82c3301');
    expect(a).toBe(b);
    expect(a).toBeGreaterThanOrEqual(0);
    expect(numeroVisivel('00000000-0000-0000-0000-000000000000')).toBe(0);
  });
});

describe('message -> document', () => {
  const base: LinhaMessage = {
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
    const ofAgent = { ...base, direcao: 'saida', autor_tipo: 'atendente' };
    const doBot = { ...base, direcao: 'saida', autor_tipo: 'bot' };
    expect(asDocument(ofAgent)!['messageEmitter']).toBe('Human');
    expect(asDocument(doBot)!['messageEmitter']).toBe('Bot');
    // An inbound message has no emitter; including one made the screen label the client as a bot.
    expect(asDocument(base)!['messageEmitter']).toBeUndefined();
  });
});

describe('agent account', () => {
  it('translates state and never returns an empty status', () => {
    const account = asAccount(
      { id: 'u1', nome: 'Ana Ribeiro', email: 'ana@demo.pipe.app', state: 'online' },
      ['Suporte'],
    );
    expect(account['status']).toBe('Online');
    // Without an admin role, the sidebar hides management items.
    expect(account['isOwner']).toBe(false);
    const admin = asAccount(
      { id: 'u1', nome: 'Ana', email: 'ana@demo.pipe.app', state: 'online', ehAdministrador: true },
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
    const pausa = asAccount({ id: 'u', nome: 'X', email: 'x@y.z', state: 'pausa' }, []);
    const invisivel = asAccount({ id: 'u', nome: 'X', email: 'x@y.z', state: 'invisivel' }, []);
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
