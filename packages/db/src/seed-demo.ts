import 'dotenv/config';
import { and, eq, inArray } from 'drizzle-orm';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { createDatabase, closeDatabase } from './cliente.js';
import type { DatabasePipe } from './cliente.js';
import {
  channel,
  contact,
  contactLabel,
  conversation,
  conversationLabel,
  etiqueta,
  queue,
  queueAgent,
  inbox,
  message,
  motivoPausa,
  notaInterna,
  respostaPronta,
  statusAgent,
  templateMessage,
} from './schema/conversations.js';
import { classificationConversation } from './schema/quality-review.js';
import { role, tenant, user, userRole } from './schema/identity.js';
import { ensureRoleOfAccount } from './seed.js';

/**
 * Pipe Desk **demo** seed, separate from base `semente.ts`. The base seed gives every new tenant roles, permissions, and sample queues; this file adds fictional users and conversations only for the demo tenant.
 *
 * It deletes and recreates records matching its known email and name lists, so rerunning `pnpm seed:demo` resets the demo. The cleanup queries do not include `tenantId`, so matching data in another tenant could also be affected; confirm this at slice time.
 *
 * Messages stay in the current month because `message` is monthly partitioned and migrations create partitions from their migration month.
 */

const SLUG_DEMO = 'demo';


export const EMAIL_AGENT_DEMO = 'ana.ribeiro@demo.pipe.app';

const MIN = 60_000;
const HORA = 60 * MIN;

/**
 * Lists of records this seed treats as its own. Cleanup uses them, so adding a person here also requires adding that email to the list.
 */
const EMAILS_CONTACT = [
  'marcelo.tavares@exemplo.com.br',
  'juliana.prado@exemplo.com.br',
  'financeiro@alencarcontabil.com.br',
  'diego.matos@exemplo.com',
  'cassia.bernardes@exemplo.com.br',
  'psmuniz@exemplo.com.br',
];

const NAMES_CHANNEL = ['WhatsApp Oficial', 'E-mail de atendimento', 'Chat do site'];

const ATALHOS_RESPOSTA = [
  'saudacao',
  'proposta-anual',
  'desconto-avista',
  'horario',
  'comprovante',
  'agendar-call',
  'obrigado',
];

const NOMES_ETIQUETA = [
  'proposta-enviada',
  'desconto',
  'anual',
  'primeiro-contato',
  'cliente-antigo',
  'resolvido',
  'nao-resolvido',
  'sem-resposta-do-cliente',
  'fora-de-escopo',
];

const NOMES_MOTIVO_PAUSA = [
  'Almoço',
  'Banheiro',
  'Reunião',
  'Treinamento',
  'Feedback com supervisor',
];

export interface ResultSeedDemo {
  tenantId: string;
  agentId: string;
  conversations: number;
  messages: number;
}

export async function seedDemo(db: DatabasePipe): Promise<ResultSeedDemo> {
  const [registro] = await db.select().from(tenant).where(eq(tenant.slug, SLUG_DEMO)).limit(1);
  if (!registro) {
    throw new Error(`tenant "${SLUG_DEMO}" não existe: rode "pnpm banco:semear" antes.`);
  }
  const tenantId = registro.id;
  const agora = new Date();
  const atras = (ms: number) => new Date(agora.getTime() - ms);

  //
  // Cleanup matches known names and email addresses rather than deleting the whole tenant. These queries do not filter by `tenantId`; matching records in a shared development database can therefore be removed across tenants.
  // The development database is shared with Pipe Management, so deleting the entire demo tenant
  // would erase work done in the other application.
  const contactsOld = await db
    .select({ id: contact.id })
    .from(contact)
    .where(inArray(contact.email, EMAILS_CONTACT));
  const idsContact = contactsOld.map((c) => c.id);
  if (idsContact.length > 0) {
    const conversationsOld = await db
      .select({ id: conversation.id })
      .from(conversation)
      .where(inArray(conversation.contatoId, idsContact));
    const idsConversation = conversationsOld.map((c) => c.id);
    if (idsConversation.length > 0) {
      await db.delete(message).where(inArray(message.conversationId, idsConversation));
      await db.delete(notaInterna).where(inArray(notaInterna.conversaId, idsConversation));
      await db.delete(conversationLabel).where(inArray(conversationLabel.conversaId, idsConversation));
      await db
        .delete(classificationConversation)
        .where(inArray(classificationConversation.conversaId, idsConversation));
      await db.delete(conversation).where(inArray(conversation.id, idsConversation));
    }
    await db.delete(contactLabel).where(inArray(contactLabel.contatoId, idsContact));
    await db.delete(contact).where(inArray(contact.id, idsContact));
  }

  const channelsOld = await db
    .select({ id: channel.id })
    .from(channel)
    .where(inArray(channel.nome, NAMES_CHANNEL));
  const idsChannel = channelsOld.map((c) => c.id);
  if (idsChannel.length > 0) {
    await db.delete(inbox).where(inArray(inbox.channelId, idsChannel));
    await db.delete(templateMessage).where(inArray(templateMessage.canalId, idsChannel));
    await db.delete(channel).where(inArray(channel.id, idsChannel));
  }

  await db.delete(respostaPronta).where(inArray(respostaPronta.atalho, ATALHOS_RESPOSTA));
  await db.delete(etiqueta).where(inArray(etiqueta.nome, NOMES_ETIQUETA));
  await db.delete(motivoPausa).where(inArray(motivoPausa.nome, NOMES_MOTIVO_PAUSA));

  // --- gente ---
  //
  // Reuse an existing user by email rather than recreating one: deleting an agent would clear
  // `atendente_id` from every existing conversation assigned to that agent, and in a shared
  // development database that would erase someone else's work.
  const ensureUser = async (nome: string, email: string): Promise<string> => {
    const [existente] = await db
      .select({ id: user.id })
      .from(user)
      .where(eq(user.email, email))
      .limit(1);
    if (existente) return existente.id;
    const id = randomUUID();
    await db.insert(user).values({ id, tenantId, nome, email });
    return id;
  };

  const anaId = await ensureUser('Ana Ribeiro', EMAIL_AGENT_DEMO);
  const brunoId = await ensureUser('Bruno Faria', 'bruno.faria@demo.pipe.app');
  const carlaId = await ensureUser('Carla Nunes', 'carla.nunes@demo.pipe.app');

  // Assign an ATTENDANCE role to all three, which Desk checks in `exigirPermissao`,
  // then an ACCOUNT role listed by the Members screen. Existing roles
  // stay unchanged (`on conflict` / `garantirPapelDeConta`).
  const [roleAgent] = await db
    .select({ id: role.id })
    .from(role)
    .where(and(eq(role.tenantId, tenantId), eq(role.nome, 'atendente')))
    .limit(1);
  if (roleAgent) {
    await db
      .insert(userRole)
      .values(
        [anaId, brunoId, carlaId].map((userId) => ({
          tenantId,
          userId,
          papelId: roleAgent.id,
          escopo: 'atendimento' as const,
        })),
      )
      .onConflictDoNothing();
  }
  await ensureRoleOfAccount(db, tenantId);

  // New agents start Invisible so no one receives conversations before declaring readiness.
  await db
    .insert(statusAgent)
    .values({ usuarioId: anaId, tenantId, estado: 'Invisible' })
    .onConflictDoUpdate({
      target: statusAgent.usuarioId,
      set: { estado: 'Invisible', desde: agora },
    });

  await db.insert(motivoPausa).values([
    { tenantId, nome: 'Almoço', durationSuggestedMin: 60 },
    { tenantId, nome: 'Banheiro', durationSuggestedMin: 10 },
    { tenantId, nome: 'Reunião', durationSuggestedMin: 30, accountAsProductive: true },
    { tenantId, nome: 'Treinamento', durationSuggestedMin: 60, accountAsProductive: true },
    { tenantId, nome: 'Feedback com supervisor', durationSuggestedMin: 20, accountAsProductive: true },
  ]);

  const queues = await db.select().from(queue).where(eq(queue.tenantId, tenantId));
  const queueBy = (nome: string) => {
    const achada = queues.find((f) => f.nome === nome);
    if (!achada) throw new Error(`fila "${nome}" não existe: rode "pnpm db:seed" antes.`);
    return achada.id;
  };
  const comercialId = queueBy('Comercial');
  const closerId = queueBy('Closer');
  const suporteId = queueBy('Suporte');
  const financialId = queueBy('Financeiro');

  await db.insert(queueAgent).values(
    [comercialId, closerId, suporteId, financialId].map((queueId) => ({
      tenantId,
      queueId,
      userId: anaId,
    })),
  ).onConflictDoNothing();

  // --- canais e inboxes ---
  const channelWhatsId = randomUUID();
  const channelEmailId = randomUUID();
  const channelSiteId = randomUUID();
  await db.insert(channel).values([
    { id: channelWhatsId, tenantId, tipo: 'whatsapp_cloud', nome: 'WhatsApp Oficial' },
    { id: channelEmailId, tenantId, tipo: 'email', nome: 'E-mail de atendimento' },
    { id: channelSiteId, tenantId, tipo: 'widget', nome: 'Chat do site' },
  ]);

  const inboxWhatsId = randomUUID();
  const inboxEmailId = randomUUID();
  const inboxSiteId = randomUUID();
  await db.insert(inbox).values([
    {
      id: inboxWhatsId,
      tenantId,
      channelId: channelWhatsId,
      nome: 'WhatsApp — Atendimento',
      queueDefaultId: comercialId,
    },
    {
      id: inboxEmailId,
      tenantId,
      channelId: channelEmailId,
      nome: 'E-mail — Financeiro',
      queueDefaultId: financialId,
    },
    {
      id: inboxSiteId,
      tenantId,
      channelId: channelSiteId,
      nome: 'Site — Chat',
      queueDefaultId: comercialId,
    },
  ]);

  // Approved Meta templates: what remains available after the service window closes.
  await db.insert(templateMessage).values([
    {
      tenantId,
      canalId: channelWhatsId,
      nome: 'retomada_atendimento',
      categoria: 'utilidade',
      statusMeta: 'aprovado',
      corpo:
        'Olá {{1}}, aqui é {{2}} da Pipe. Passando para retomar nosso atendimento. ' +
        'Posso seguir por aqui?',
      variables: ['contato.nome', 'atendente.primeiro_nome'],
    },
    {
      tenantId,
      canalId: channelWhatsId,
      nome: 'confirmacao_agendamento',
      categoria: 'utilidade',
      statusMeta: 'aprovado',
      corpo: 'Olá {{1}}, confirmando nossa conversa para {{2}}. Qualquer coisa, é só responder.',
      variables: ['contato.nome', 'data'],
    },
    {
      tenantId,
      canalId: channelWhatsId,
      nome: 'promocao_setembro',
      categoria: 'marketing',
      statusMeta: 'aprovado',
      corpo: 'Oi {{1}}! O plano anual está com 10% até o fim do mês. Quer que eu te mande?',
      variables: ['contato.nome'],
    },
  ]);

  // Canned replies from the company and Ana's personal collection.
  const respostas = await db
    .insert(respostaPronta)
    .values([
      {
        tenantId,
        scope: 'empresa',
        categoria: 'Saudação',
        atalho: 'saudacao',
        titulo: 'Saudação de abertura',
        corpo:
          'Olá {{contato.nome}}, tudo bem? Aqui é {{atendente.primeiro_nome}}, da Pipe. ' +
          'Em que posso ajudar hoje?',
      },
      {
        tenantId,
        scope: 'empresa',
        categoria: 'Comercial',
        atalho: 'proposta-anual',
        titulo: 'Valor do plano anual',
        corpo:
          'O plano anual sai por R$ 4.788, o que dá R$ 399 por mês, com todos os módulos ' +
          'liberados e suporte incluso.',
      },
      {
        tenantId,
        scope: 'empresa',
        categoria: 'Comercial',
        atalho: 'desconto-avista',
        titulo: 'Desconto à vista',
        corpo: 'Pagando à vista temos 10% de desconto: fica R$ 4.309 pelo ano inteiro.',
      },
      {
        tenantId,
        scope: 'empresa',
        categoria: 'Suporte',
        atalho: 'horario',
        titulo: 'Horário de atendimento',
        corpo:
          'Nosso atendimento é de segunda a sexta, das 9h às 18h. Fora desse horário eu ' +
          'respondo assim que abrirmos.',
      },
      {
        tenantId,
        scope: 'empresa',
        categoria: 'Financeiro',
        atalho: 'comprovante',
        titulo: 'Confirmação de comprovante',
        corpo:
          'Recebi o comprovante, {{contato.nome}}. A baixa costuma cair em até 1 dia útil e ' +
          'eu te aviso por aqui assim que compensar.',
      },
      {
        tenantId,
        scope: 'pessoal',
        usuarioId: anaId,
        categoria: 'Minhas',
        atalho: 'agendar-call',
        titulo: 'Sugerir call',
        corpo:
          'Consigo te mostrar tudo em 20 minutos de call. Amanhã às 10h ou às 16h fica bom ' +
          'pra você?',
      },
      {
        tenantId,
        scope: 'pessoal',
        usuarioId: anaId,
        categoria: 'Minhas',
        atalho: 'obrigado',
        titulo: 'Agradecimento de fechamento',
        corpo:
          'Obrigada pela conversa, {{contato.nome}}! Qualquer dúvida é só chamar aqui mesmo.',
      },
    ])
    .returning({ id: respostaPronta.id, atalho: respostaPronta.atalho });
  const responseBy = (atalho: string) => respostas.find((r) => r.atalho === atalho)?.id ?? null;

  // Work tags and closing tags required to finish a ticket.
  const etiquetas = await db
    .insert(etiqueta)
    .values([
      { tenantId, nome: 'proposta-enviada', cor: '#4A5D23' },
      { tenantId, nome: 'desconto', cor: '#9A7420' },
      { tenantId, nome: 'anual', cor: '#2E4A5D' },
      { tenantId, nome: 'primeiro-contato', cor: '#8A9A5B' },
      { tenantId, nome: 'cliente-antigo', cor: '#2E4A5D', escopo: 'contato' },
      { tenantId, nome: 'resolvido', cor: '#4A5D23', requiredInClosure: true },
      { tenantId, nome: 'nao-resolvido', cor: '#C4442E', requiredInClosure: true },
      { tenantId, nome: 'sem-resposta-do-cliente', cor: '#9A7420', requiredInClosure: true },
      { tenantId, nome: 'fora-de-escopo', cor: '#55544D', requiredInClosure: true },
    ])
    .returning({ id: etiqueta.id, nome: etiqueta.nome });
  const labelBy = (nome: string) => {
    const achada = etiquetas.find((e) => e.nome === nome);
    if (!achada) throw new Error(`etiqueta "${nome}" não foi criada`);
    return achada.id;
  };

  // --- contatos ---
  interface Pessoa {
    id: string;
    name: string;
    phone: string | null;
    email: string | null;
    atributos: Record<string, string>;
  }
  const pessoa = (
    nome: string,
    telefone: string | null,
    email: string | null,
    atributos: Record<string, string>,
  ): Pessoa => ({ id: randomUUID(), name: nome, phone: telefone, email, atributos });

  const marcelo = pessoa('Marcelo Tavares', '+5531994714471', 'marcelo.tavares@exemplo.com.br', {
    Origem: 'Anúncio Meta',
    Campanha: 'Anual-Set',
    Patrimônio: 'R$ 250–500 mil',
    Cidade: 'Belo Horizonte',
  });
  const juliana = pessoa('Juliana Prado', '+5511987223104', 'juliana.prado@exemplo.com.br', {
    Origem: 'Site',
    Plano: 'Essencial',
    'Cliente desde': '03/2024',
  });
  const renata = pessoa('Renata Alencar', '+5521996650182', 'financeiro@alencarcontabil.com.br', {
    Empresa: 'Alencar Contábil',
    Origem: 'Indicação',
    'Forma de pagamento': 'Boleto',
  });
  const diego = pessoa('Diego Matos', null, 'diego.matos@exemplo.com', {
    Origem: 'Chat do site',
    'Página de entrada': '/precos',
  });
  const cassia = pessoa('Cássia Bernardes', '+5548988310277', 'cassia.bernardes@exemplo.com.br', {
    Origem: 'WhatsApp',
    Plano: 'Profissional',
    'Cliente desde': '11/2022',
  });
  const paulo = pessoa('Paulo Sérgio Muniz', '+5561991204488', 'psmuniz@exemplo.com.br', {
    Origem: 'Indicação',
    Campanha: 'Closer-Set',
    Patrimônio: 'R$ 1–3 milhões',
  });
  const pessoas = [marcelo, juliana, renata, diego, cassia, paulo];

  await db.insert(contact).values(
    pessoas.map((p) => ({
      id: p.id,
      tenantId,
      nome: p.name,
      telefoneE164: p.phone,
      email: p.email,
      atributos: p.atributos,
    })),
  );
  await db.insert(contactLabel).values([
    { tenantId, contatoId: cassia.id, etiquetaId: labelBy('cliente-antigo') },
    { tenantId, contatoId: juliana.id, etiquetaId: labelBy('cliente-antigo') },
  ]);

  // --- conversas ---
  interface NewConversation {
    id: string;
    contactId: string;
    inboxId: string;
    queueId: string;
    state: 'Assigned' | 'Open' | 'ClosedAttendant';
    priority: 'baixa' | 'media' | 'alta';
    /** When the contact last spoke; determines the 24-hour service window. */
    lastOfContactAgo: number | null;
    lastMessageAgo: number;
    lastMessageOf: 'contato' | 'atendente';
    criadaAtras: number;
    encerradaAtras?: number;
    inWaitSince?: number;
  }

  const conversations: NewConversation[] = [
    {
      id: randomUUID(),
      contactId: marcelo.id,
      inboxId: inboxWhatsId,
      queueId: comercialId,
      state: 'Open',
      priority: 'alta',
      lastOfContactAgo: 2 * HORA + 12 * MIN,
      lastMessageAgo: 2 * HORA + 5 * MIN,
      lastMessageOf: 'atendente',
      criadaAtras: 3 * HORA,
    },
    {
      id: randomUUID(),
      contactId: juliana.id,
      inboxId: inboxWhatsId,
      queueId: suporteId,
      state: 'Open',
      priority: 'media',
      // Janela perto de expirar: faltam ~38 minutos.
      lastOfContactAgo: 23 * HORA + 22 * MIN,
      lastMessageAgo: 23 * HORA + 20 * MIN,
      lastMessageOf: 'atendente',
      criadaAtras: 26 * HORA,
    },
    {
      id: randomUUID(),
      contactId: renata.id,
      inboxId: inboxEmailId,
      queueId: financialId,
      state: 'Assigned',
      priority: 'media',
      // Email has no 24-hour window; that rule is channel-specific.
      lastOfContactAgo: null,
      lastMessageAgo: 40 * MIN,
      lastMessageOf: 'contato',
      criadaAtras: 45 * MIN,
    },
    {
      id: randomUUID(),
      contactId: diego.id,
      inboxId: inboxSiteId,
      queueId: comercialId,
      state: 'Assigned',
      priority: 'baixa',
      lastOfContactAgo: null,
      lastMessageAgo: 12 * MIN,
      lastMessageOf: 'contato',
      criadaAtras: 14 * MIN,
    },
    {
      id: randomUUID(),
      contactId: cassia.id,
      inboxId: inboxWhatsId,
      queueId: suporteId,
      state: 'Open',
      priority: 'media',
      // The window has closed: more than 24 hours since her last message.
      lastOfContactAgo: 30 * HORA,
      lastMessageAgo: 29 * HORA,
      lastMessageOf: 'atendente',
      criadaAtras: 32 * HORA,
      inWaitSince: 28 * HORA,
    },
    {
      id: randomUUID(),
      contactId: paulo.id,
      inboxId: inboxWhatsId,
      queueId: closerId,
      state: 'Open',
      priority: 'alta',
      lastOfContactAgo: 18 * HORA,
      lastMessageAgo: 17 * HORA + 50 * MIN,
      lastMessageOf: 'atendente',
      criadaAtras: 19 * HORA,
    },
    // Marcelo's older conversation for the contact-panel history.
    {
      id: randomUUID(),
      contactId: marcelo.id,
      inboxId: inboxWhatsId,
      queueId: suporteId,
      state: 'ClosedAttendant',
      priority: 'baixa',
      lastOfContactAgo: null,
      lastMessageAgo: 3 * 24 * HORA,
      lastMessageOf: 'atendente',
      criadaAtras: 3 * 24 * HORA + 30 * MIN,
      encerradaAtras: 3 * 24 * HORA,
    },
  ];

  await db.insert(conversation).values(
    conversations.map((c) => ({
      id: c.id,
      tenantId,
      inboxId: c.inboxId,
      contatoId: c.contactId,
      filaId: c.queueId,
      atendenteId: anaId,
      estado: c.state,
      prioridade: c.priority,
      criadaEm: atras(c.criadaAtras),
      atribuidaEm: atras(c.criadaAtras - MIN),
      primeiraRespostaEm: atras(c.criadaAtras - 2 * MIN),
      ultimaMensagemEm: atras(c.lastMessageAgo),
      ultimaMensagemDe: c.lastMessageOf,
      janelaExpiraEm:
        c.lastOfContactAgo === null ? null : atras(c.lastOfContactAgo - 24 * HORA),
      ...(c.inWaitSince ? { emEsperaDesde: atras(c.inWaitSince) } : {}),
      ...(c.encerradaAtras
        ? { encerradaEm: atras(c.encerradaAtras), encerradaPor: anaId, motivoEncerramento: 'resolvido' }
        : {}),
    })),
  );

  const [
    convMarcelo,
    convJuliana,
    convRenata,
    convDiego,
    convCassia,
    convPaulo,
    convMarceloAntiga,
  ] = conversations.map((c) => c.id) as [string, string, string, string, string, string, string];

  // --- mensagens ---
  type Fala = {
    conversationId: string;
    de: 'contato' | 'atendente';
    texto: string;
    atras: number;
    type?: 'texto' | 'audio' | 'documento';
    state?: 'enviada' | 'entregue' | 'lida' | 'falhou';
    errorCode?: string;
    errorText?: string;
    responseReadyId?: string | null;
    insideOfWindow?: boolean;
  };

  const falas: Fala[] = [
    // Marcelo: sales conversation negotiating a discount; the audio failed.
    {
      conversationId: convMarcelo,
      de: 'contato',
      texto: 'Boa tarde! Vi o anúncio de vocês e queria entender o plano anual.',
      atras: 3 * HORA,
    },
    {
      conversationId: convMarcelo,
      de: 'atendente',
      texto:
        'Boa tarde, Marcelo! Sou a Ana, do comercial. O plano anual sai por R$ 4.788, ' +
        'o que dá R$ 399 por mês.',
      atras: 2 * HORA + 55 * MIN,
      state: 'lida',
      responseReadyId: responseBy('proposta-anual'),
    },
    {
      conversationId: convMarcelo,
      de: 'contato',
      texto: 'E tem desconto se eu pagar à vista?',
      atras: 2 * HORA + 12 * MIN,
    },
    {
      conversationId: convMarcelo,
      de: 'atendente',
      texto: 'Áudio de 0:34 — explicação do desconto à vista',
      atras: 2 * HORA + 9 * MIN,
      type: 'audio',
      state: 'falhou',
      errorCode: 'meta_131053',
      errorText:
        'A Meta recusou o áudio: formato ogg/opus fora do aceito. Converter para mp3 e enviar?',
    },
    {
      conversationId: convMarcelo,
      de: 'atendente',
      texto: 'Tem sim — 10% à vista, fica R$ 4.309. Posso te mandar a proposta agora?',
      atras: 2 * HORA + 5 * MIN,
      state: 'lida',
      responseReadyId: responseBy('desconto-avista'),
    },
    // Juliana — suporte, janela quase estourando.
    {
      conversationId: convJuliana,
      de: 'contato',
      texto: 'não consigo acessar minha conta desde ontem à noite',
      atras: 26 * HORA,
    },
    {
      conversationId: convJuliana,
      de: 'atendente',
      texto: 'Oi, Juliana! Vou verificar aqui. Aparece alguma mensagem de erro na tela?',
      atras: 25 * HORA + 40 * MIN,
      state: 'lida',
    },
    {
      conversationId: convJuliana,
      de: 'contato',
      texto: 'aparece "credenciais inválidas", mas a senha é a mesma de sempre',
      atras: 23 * HORA + 22 * MIN,
    },
    {
      conversationId: convJuliana,
      de: 'atendente',
      texto:
        'Entendi. Acabei de destravar o acesso e mandei um link de redefinição para o seu ' +
        'e-mail. Consegue testar?',
      atras: 23 * HORA + 20 * MIN,
      state: 'entregue',
    },
    // Renata — e-mail, financeiro.
    {
      conversationId: convRenata,
      de: 'contato',
      texto:
        'Bom dia. Segue em anexo o comprovante da transferência da mensalidade de setembro. ' +
        'Podem dar baixa, por favor?',
      atras: 40 * MIN,
      type: 'documento',
    },
    // Diego — widget do site.
    {
      conversationId: convDiego,
      de: 'contato',
      texto: 'vim pelo anúncio, queria falar com alguém sobre preço',
      atras: 12 * MIN,
    },
    // Cássia: the service window has closed.
    {
      conversationId: convCassia,
      de: 'contato',
      texto: 'oi, ainda estou esperando o retorno sobre a nota fiscal de agosto',
      atras: 30 * HORA,
    },
    {
      conversationId: convCassia,
      de: 'atendente',
      texto:
        'Oi, Cássia! Já pedi para o financeiro reemitir. Coloquei a conversa em espera e te ' +
        'aviso assim que sair.',
      atras: 29 * HORA,
      state: 'lida',
    },
    // Paulo — closer.
    {
      conversationId: convPaulo,
      de: 'contato',
      texto: 'Ana, conversei com meu sócio e a gente quer fechar. Como faço o pagamento?',
      atras: 18 * HORA,
    },
    {
      conversationId: convPaulo,
      de: 'atendente',
      texto:
        'Que ótima notícia, Paulo! Mando o link de pagamento e o contrato ainda hoje. ' +
        'Prefere boleto ou cartão?',
      atras: 17 * HORA + 50 * MIN,
      state: 'entregue',
    },
    // Conversa antiga do Marcelo.
    {
      conversationId: convMarceloAntiga,
      de: 'contato',
      texto: 'consegui resolver, obrigado!',
      atras: 3 * 24 * HORA + 10 * MIN,
    },
    {
      conversationId: convMarceloAntiga,
      de: 'atendente',
      texto: 'Que bom! Qualquer coisa é só chamar.',
      atras: 3 * 24 * HORA,
      state: 'lida',
    },
  ];

  await db.insert(message).values(
    falas.map((f) => ({
      tenantId,
      conversationId: f.conversationId,
      direction: f.de === 'contato' ? ('entrada' as const) : ('saida' as const),
      autorTipo: f.de,
      autorId: f.de === 'atendente' ? anaId : null,
      tipo: f.type ?? 'texto',
      conteudo: f.texto,
      stateDelivery: f.de === 'atendente' ? (f.state ?? 'enviada') : null,
      errorCode: f.errorCode ?? null,
      errorText: f.errorText ?? null,
      respostaProntaId: f.responseReadyId ?? null,
      criadaEm: atras(f.atras),
      entregueEm:
        f.de === 'atendente' && f.state !== 'falhou' ? atras(f.atras - 20_000) : null,
      lidaEm: f.state === 'lida' ? atras(f.atras - 60_000) : null,
      insideOfWindow: f.de === 'atendente' ? (f.insideOfWindow ?? true) : null,
      categoriaCobranca: f.de === 'atendente' ? ('livre' as const) : null,
    })),
  );

  // A contact's `autor_id` does not reference a user; leave it null rather than assigning a false user.
  await db.insert(notaInterna).values([
    {
      tenantId,
      conversaId: convMarcelo,
      usuarioId: anaId,
      corpo: '@Bruno Faria consegue aprovar 12% se ele fechar hoje? Ele comparou com concorrente.',
      em: atras(2 * HORA + 3 * MIN),
    },
  ]);

  await db.insert(conversationLabel).values([
    { tenantId, conversaId: convMarcelo, etiquetaId: labelBy('proposta-enviada') },
    { tenantId, conversaId: convMarcelo, etiquetaId: labelBy('desconto') },
    { tenantId, conversaId: convMarcelo, etiquetaId: labelBy('anual') },
    { tenantId, conversaId: convDiego, etiquetaId: labelBy('primeiro-contato') },
    { tenantId, conversaId: convPaulo, etiquetaId: labelBy('proposta-enviada') },
  ]);

  // The summary is already stored. At this stage the screen reads the database without calling AI.
  await db.insert(classificationConversation).values([
    {
      tenantId,
      conversaId: convMarcelo,
      categoria: 'Comercial',
      subcategoria: 'Negociação de preço',
      resumo:
        'Veio do anúncio, quer o plano anual e está negociando desconto à vista. Objeção ' +
        'principal é preço; já recebeu o valor com 10% de desconto. O áudio com a explicação ' +
        'do desconto falhou e não chegou até ele.',
      intent: 'comprar',
      sentiment: 'neutro',
      template: 'semente-demo',
      criadaEm: atras(2 * HORA),
    },
    {
      tenantId,
      conversaId: convJuliana,
      categoria: 'Suporte',
      subcategoria: 'Acesso',
      resumo:
        'Cliente sem acesso desde ontem, erro de credenciais inválidas. Acesso já destravado ' +
        'e link de redefinição enviado; falta a confirmação dela.',
      intent: 'resolver_problema',
      sentiment: 'negativo',
      template: 'semente-demo',
      criadaEm: atras(23 * HORA),
    },
    {
      tenantId,
      conversaId: convCassia,
      categoria: 'Financeiro',
      subcategoria: 'Nota fiscal',
      resumo:
        'Aguarda reemissão da nota fiscal de agosto. Conversa em espera com o financeiro; ' +
        'a janela de 24h fechou, então o retorno precisa sair por template aprovado.',
      intent: 'cobrar_retorno',
      sentiment: 'negativo',
      template: 'semente-demo',
      criadaEm: atras(28 * HORA),
    },
  ]);

  return {
    tenantId,
    agentId: anaId,
    conversations: conversations.length,
    messages: falas.length,
  };
}

const executadoDiretamente = process.argv[1]
  ? path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))
  : false;

if (executadoDiretamente) {
  const db = createDatabase({ maxConnections: 1 });
  seedDemo(db)
    .then((resultado) => {
      process.stdout.write(
        `semente de demonstração aplicada: tenant ${resultado.tenantId}, atendente ` +
          `${resultado.agentId}, ${resultado.conversations} conversas, ` +
          `${resultado.messages} mensagens\n`,
      );
    })
    .catch((error: unknown) => {
      process.stderr.write(`falha ao semear a demonstração: ${String(error)}\n`);
      process.exitCode = 1;
    })
    .finally(() => closeDatabase(db));
}
