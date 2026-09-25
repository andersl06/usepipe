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
import { garantirRoleOfAccount } from './seed.js';

/**
 * Semente de **demonstração** do Pipe Desk. Separada da semente base de propósito:
 * `semente.ts` é o que todo tenant novo recebe (papéis, permissões, filas); isto aqui
 * é gente inventada com conversa inventada, e nenhum tenant de verdade deve receber.
 *
 * Idempotente pela raça: apaga o que ela mesma criou no tenant de demonstração e
 * recria do zero. Rodar duas vezes dá o mesmo resultado, e o segundo `pnpm seed:demo`
 * é a forma de voltar a demo ao estado inicial depois de mexer na tela.
 *
 * Todas as mensagens ficam dentro do mês corrente porque `mensagem` é particionada
 * por mês e só existem partições a partir do mês da migration.
 */

const SLUG_DEMO = 'demo';

/** O atendente que a tela assume enquanto não existe login (fase seguinte). */
export const EMAIL_AGENT_DEMO = 'ana.ribeiro@demo.pipe.app';

const MIN = 60_000;
const HORA = 60 * MIN;

/**
 * O que esta semente considera "dela". É por estas listas que a limpeza acontece — e é
 * por isso que acrescentar gente nova aqui exige acrescentar o e-mail na lista também.
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

  // --- limpeza escopada ao que esta semente cria, na ordem das chaves estrangeiras ---
  //
  // Apaga por nome e por e-mail, e não por tenant: o banco de desenvolvimento é
  // compartilhado com o Pipe Gestão, e uma semente de demonstração que limpa o tenant
  // inteiro apaga o trabalho de quem está do lado.
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
  // Usuário é reaproveitado pelo e-mail, nunca recriado: apagar um atendente solta o
  // `atendente_id` de toda conversa que ele já tinha, e num banco de desenvolvimento
  // compartilhado isso é apagar o trabalho alheio.
  const garantirUser = async (nome: string, email: string): Promise<string> => {
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

  const anaId = await garantirUser('Ana Ribeiro', EMAIL_AGENT_DEMO);
  const brunoId = await garantirUser('Bruno Faria', 'bruno.faria@demo.pipe.app');
  const carlaId = await garantirUser('Carla Nunes', 'carla.nunes@demo.pipe.app');

  // Papel de ATENDIMENTO para os três (é o que o Desk confere em `exigirPermissao`)
  // e, logo abaixo, o papel de CONTA que a tela de Membros lista. Quem já tinha
  // qualquer um dos dois fica como está (`on conflict` / `garantirPapelDeConta`).
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
  await garantirRoleOfAccount(db, tenantId);

  // O padrão ao entrar é Invisível: ninguém recebe conversa sem afirmar que está pronto.
  await db
    .insert(statusAgent)
    .values({ usuarioId: anaId, tenantId, estado: 'invisivel' })
    .onConflictDoUpdate({
      target: statusAgent.usuarioId,
      set: { estado: 'invisivel', desde: agora },
    });

  await db.insert(motivoPausa).values([
    { tenantId, nome: 'Almoço', duracaoSugeridaMin: 60 },
    { tenantId, nome: 'Banheiro', duracaoSugeridaMin: 10 },
    { tenantId, nome: 'Reunião', duracaoSugeridaMin: 30, contaComoProdutivo: true },
    { tenantId, nome: 'Treinamento', duracaoSugeridaMin: 60, contaComoProdutivo: true },
    { tenantId, nome: 'Feedback com supervisor', duracaoSugeridaMin: 20, contaComoProdutivo: true },
  ]);

  const queues = await db.select().from(queue).where(eq(queue.tenantId, tenantId));
  const queueBy = (nome: string) => {
    const achada = queues.find((f) => f.nome === nome);
    if (!achada) throw new Error(`fila "${nome}" não existe: rode "pnpm banco:semear" antes.`);
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
      usuarioId: anaId,
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
      canalId: channelWhatsId,
      nome: 'WhatsApp — Atendimento',
      filaPadraoId: comercialId,
    },
    {
      id: inboxEmailId,
      tenantId,
      canalId: channelEmailId,
      nome: 'E-mail — Financeiro',
      filaPadraoId: financialId,
    },
    {
      id: inboxSiteId,
      tenantId,
      canalId: channelSiteId,
      nome: 'Site — Chat',
      filaPadraoId: comercialId,
    },
  ]);

  // --- templates aprovados pela Meta, o que sobra quando a janela fecha ---
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
      variaveis: ['contato.nome', 'atendente.primeiro_nome'],
    },
    {
      tenantId,
      canalId: channelWhatsId,
      nome: 'confirmacao_agendamento',
      categoria: 'utilidade',
      statusMeta: 'aprovado',
      corpo: 'Olá {{1}}, confirmando nossa conversa para {{2}}. Qualquer coisa, é só responder.',
      variaveis: ['contato.nome', 'data'],
    },
    {
      tenantId,
      canalId: channelWhatsId,
      nome: 'promocao_setembro',
      categoria: 'marketing',
      statusMeta: 'aprovado',
      corpo: 'Oi {{1}}! O plano anual está com 10% até o fim do mês. Quer que eu te mande?',
      variaveis: ['contato.nome'],
    },
  ]);

  // --- respostas prontas: as da empresa e as da própria Ana ---
  const respostas = await db
    .insert(respostaPronta)
    .values([
      {
        tenantId,
        escopo: 'empresa',
        categoria: 'Saudação',
        atalho: 'saudacao',
        titulo: 'Saudação de abertura',
        corpo:
          'Olá {{contato.nome}}, tudo bem? Aqui é {{atendente.primeiro_nome}}, da Pipe. ' +
          'Em que posso ajudar hoje?',
      },
      {
        tenantId,
        escopo: 'empresa',
        categoria: 'Comercial',
        atalho: 'proposta-anual',
        titulo: 'Valor do plano anual',
        corpo:
          'O plano anual sai por R$ 4.788, o que dá R$ 399 por mês, com todos os módulos ' +
          'liberados e suporte incluso.',
      },
      {
        tenantId,
        escopo: 'empresa',
        categoria: 'Comercial',
        atalho: 'desconto-avista',
        titulo: 'Desconto à vista',
        corpo: 'Pagando à vista temos 10% de desconto: fica R$ 4.309 pelo ano inteiro.',
      },
      {
        tenantId,
        escopo: 'empresa',
        categoria: 'Suporte',
        atalho: 'horario',
        titulo: 'Horário de atendimento',
        corpo:
          'Nosso atendimento é de segunda a sexta, das 9h às 18h. Fora desse horário eu ' +
          'respondo assim que abrirmos.',
      },
      {
        tenantId,
        escopo: 'empresa',
        categoria: 'Financeiro',
        atalho: 'comprovante',
        titulo: 'Confirmação de comprovante',
        corpo:
          'Recebi o comprovante, {{contato.nome}}. A baixa costuma cair em até 1 dia útil e ' +
          'eu te aviso por aqui assim que compensar.',
      },
      {
        tenantId,
        escopo: 'pessoal',
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
        escopo: 'pessoal',
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

  // --- etiquetas: as de trabalho e as de encerramento (obrigatórias para fechar) ---
  const etiquetas = await db
    .insert(etiqueta)
    .values([
      { tenantId, nome: 'proposta-enviada', cor: '#4A5D23' },
      { tenantId, nome: 'desconto', cor: '#9A7420' },
      { tenantId, nome: 'anual', cor: '#2E4A5D' },
      { tenantId, nome: 'primeiro-contato', cor: '#8A9A5B' },
      { tenantId, nome: 'cliente-antigo', cor: '#2E4A5D', escopo: 'contato' },
      { tenantId, nome: 'resolvido', cor: '#4A5D23', obrigatoriaNoEncerramento: true },
      { tenantId, nome: 'nao-resolvido', cor: '#C4442E', obrigatoriaNoEncerramento: true },
      { tenantId, nome: 'sem-resposta-do-cliente', cor: '#9A7420', obrigatoriaNoEncerramento: true },
      { tenantId, nome: 'fora-de-escopo', cor: '#55544D', obrigatoriaNoEncerramento: true },
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
  ): Pessoa => ({ id: randomUUID(), nome, telefone, email, atributos });

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
      nome: p.nome,
      telefoneE164: p.telefone,
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
    state: 'atribuida' | 'em_atendimento' | 'em_espera' | 'encerrada';
    priority: 'baixa' | 'media' | 'alta';
    /** Quando o contato falou pela última vez. Define a janela de 24h. */
    lastOfContactAtras: number | null;
    lastMessageAtras: number;
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
      state: 'em_atendimento',
      priority: 'alta',
      lastOfContactAtras: 2 * HORA + 12 * MIN,
      lastMessageAtras: 2 * HORA + 5 * MIN,
      lastMessageOf: 'agent',
      criadaAtras: 3 * HORA,
    },
    {
      id: randomUUID(),
      contactId: juliana.id,
      inboxId: inboxWhatsId,
      queueId: suporteId,
      state: 'em_atendimento',
      priority: 'media',
      // Janela perto de expirar: faltam ~38 minutos.
      lastOfContactAtras: 23 * HORA + 22 * MIN,
      lastMessageAtras: 23 * HORA + 20 * MIN,
      lastMessageOf: 'agent',
      criadaAtras: 26 * HORA,
    },
    {
      id: randomUUID(),
      contactId: renata.id,
      inboxId: inboxEmailId,
      queueId: financialId,
      state: 'atribuida',
      priority: 'media',
      // E-mail não tem janela de 24h: a regra é do canal.
      lastOfContactAtras: null,
      lastMessageAtras: 40 * MIN,
      lastMessageOf: 'contato',
      criadaAtras: 45 * MIN,
    },
    {
      id: randomUUID(),
      contactId: diego.id,
      inboxId: inboxSiteId,
      queueId: comercialId,
      state: 'atribuida',
      priority: 'baixa',
      lastOfContactAtras: null,
      lastMessageAtras: 12 * MIN,
      lastMessageOf: 'contato',
      criadaAtras: 14 * MIN,
    },
    {
      id: randomUUID(),
      contactId: cassia.id,
      inboxId: inboxWhatsId,
      queueId: suporteId,
      state: 'em_espera',
      priority: 'media',
      // Janela já fechada: passou de 24h desde a última mensagem dela.
      lastOfContactAtras: 30 * HORA,
      lastMessageAtras: 29 * HORA,
      lastMessageOf: 'agent',
      criadaAtras: 32 * HORA,
      emEsperaDesde: 28 * HORA,
    },
    {
      id: randomUUID(),
      contactId: paulo.id,
      inboxId: inboxWhatsId,
      queueId: closerId,
      state: 'em_atendimento',
      priority: 'alta',
      lastOfContactAtras: 18 * HORA,
      lastMessageAtras: 17 * HORA + 50 * MIN,
      lastMessageOf: 'agent',
      criadaAtras: 19 * HORA,
    },
    // Conversa antiga do Marcelo, para o histórico do painel do contato.
    {
      id: randomUUID(),
      contactId: marcelo.id,
      inboxId: inboxWhatsId,
      queueId: suporteId,
      state: 'encerrada',
      priority: 'baixa',
      lastOfContactAtras: null,
      lastMessageAtras: 3 * 24 * HORA,
      lastMessageOf: 'agent',
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
      ultimaMensagemEm: atras(c.lastMessageAtras),
      ultimaMensagemDe: c.lastMessageOf,
      janelaExpiraEm:
        c.lastOfContactAtras === null ? null : atras(c.lastOfContactAtras - 24 * HORA),
      ...(c.emEsperaDesde ? { emEsperaDesde: atras(c.emEsperaDesde) } : {}),
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
    // Marcelo — comercial, negociando desconto; o áudio falhou.
    {
      conversationId: convMarcelo,
      de: 'contato',
      texto: 'Boa tarde! Vi o anúncio de vocês e queria entender o plano anual.',
      atras: 3 * HORA,
    },
    {
      conversationId: convMarcelo,
      de: 'agent',
      texto:
        'Boa tarde, Marcelo! Sou a Ana, do comercial. O plano anual sai por R$ 4.788, ' +
        'o que dá R$ 399 por mês.',
      atras: 2 * HORA + 55 * MIN,
      estado: 'lida',
      respostaProntaId: responseBy('proposta-anual'),
    },
    {
      conversationId: convMarcelo,
      de: 'contato',
      texto: 'E tem desconto se eu pagar à vista?',
      atras: 2 * HORA + 12 * MIN,
    },
    {
      conversationId: convMarcelo,
      de: 'agent',
      texto: 'Áudio de 0:34 — explicação do desconto à vista',
      atras: 2 * HORA + 9 * MIN,
      tipo: 'audio',
      estado: 'falhou',
      errorCode: 'meta_131053',
      errorText:
        'A Meta recusou o áudio: formato ogg/opus fora do aceito. Converter para mp3 e enviar?',
    },
    {
      conversationId: convMarcelo,
      de: 'agent',
      texto: 'Tem sim — 10% à vista, fica R$ 4.309. Posso te mandar a proposta agora?',
      atras: 2 * HORA + 5 * MIN,
      estado: 'lida',
      respostaProntaId: responseBy('desconto-avista'),
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
      de: 'agent',
      texto: 'Oi, Juliana! Vou verificar aqui. Aparece alguma mensagem de erro na tela?',
      atras: 25 * HORA + 40 * MIN,
      estado: 'lida',
    },
    {
      conversationId: convJuliana,
      de: 'contato',
      texto: 'aparece "credenciais inválidas", mas a senha é a mesma de sempre',
      atras: 23 * HORA + 22 * MIN,
    },
    {
      conversationId: convJuliana,
      de: 'agent',
      texto:
        'Entendi. Acabei de destravar o acesso e mandei um link de redefinição para o seu ' +
        'e-mail. Consegue testar?',
      atras: 23 * HORA + 20 * MIN,
      estado: 'entregue',
    },
    // Renata — e-mail, financeiro.
    {
      conversationId: convRenata,
      de: 'contato',
      texto:
        'Bom dia. Segue em anexo o comprovante da transferência da mensalidade de setembro. ' +
        'Podem dar baixa, por favor?',
      atras: 40 * MIN,
      tipo: 'documento',
    },
    // Diego — widget do site.
    {
      conversationId: convDiego,
      de: 'contato',
      texto: 'vim pelo anúncio, queria falar com alguém sobre preço',
      atras: 12 * MIN,
    },
    // Cássia — janela fechada.
    {
      conversationId: convCassia,
      de: 'contato',
      texto: 'oi, ainda estou esperando o retorno sobre a nota fiscal de agosto',
      atras: 30 * HORA,
    },
    {
      conversationId: convCassia,
      de: 'agent',
      texto:
        'Oi, Cássia! Já pedi para o financeiro reemitir. Coloquei a conversa em espera e te ' +
        'aviso assim que sair.',
      atras: 29 * HORA,
      estado: 'lida',
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
      de: 'agent',
      texto:
        'Que ótima notícia, Paulo! Mando o link de pagamento e o contrato ainda hoje. ' +
        'Prefere boleto ou cartão?',
      atras: 17 * HORA + 50 * MIN,
      estado: 'entregue',
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
      de: 'agent',
      texto: 'Que bom! Qualquer coisa é só chamar.',
      atras: 3 * 24 * HORA,
      estado: 'lida',
    },
  ];

  await db.insert(message).values(
    falas.map((f) => ({
      tenantId,
      conversaId: f.conversationId,
      direcao: f.de === 'contato' ? ('entrada' as const) : ('saida' as const),
      autorTipo: f.de,
      autorId: f.de === 'agent' ? anaId : null,
      tipo: f.tipo ?? 'texto',
      conteudo: f.texto,
      estadoEntrega: f.de === 'agent' ? (f.estado ?? 'enviada') : null,
      erroCodigo: f.errorCode ?? null,
      erroTexto: f.errorText ?? null,
      respostaProntaId: f.respostaProntaId ?? null,
      criadaEm: atras(f.atras),
      entregueEm:
        f.de === 'agent' && f.estado !== 'falhou' ? atras(f.atras - 20_000) : null,
      lidaEm: f.estado === 'lida' ? atras(f.atras - 60_000) : null,
      dentroDaJanela: f.de === 'agent' ? (f.insideOfWindow ?? true) : null,
      categoriaCobranca: f.de === 'agent' ? ('livre' as const) : null,
    })),
  );

  // `autor_id` do contato não referencia usuário; deixa nulo em vez de mentir.
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

  // Resumo já gravado. Nesta etapa a tela lê o que está no banco; não chama IA.
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
      intencao: 'comprar',
      sentimento: 'neutro',
      modelo: 'semente-demo',
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
      intencao: 'resolver_problema',
      sentimento: 'negativo',
      modelo: 'semente-demo',
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
      intencao: 'cobrar_retorno',
      sentimento: 'negativo',
      modelo: 'semente-demo',
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
