import 'dotenv/config';
import { createHash } from 'node:crypto';
import { and, eq, inArray, isNotNull, sql } from 'drizzle-orm';
import { calcularScore, type Expressao, type FaixaScore, type RegraScore } from '@pipe/core';
import { createDatabase, closeDatabase, type DatabasePipe } from '@pipe/db';
import {
  activity,
  classificationConversation,
  account,
  contact,
  contactLabel,
  conversation,
  etiqueta,
  faixaScore,
  queue,
  formulario,
  formularioPergunta,
  formularioVersao,
  lead,
  opportunity,
  regraScore,
  respostaFormulario,
  scoreLead,
  tenant,
  user,
} from '@pipe/db/schema';

/**
 * Pipe CRM seed.
 *
 * **Appends, never sweeps.** Other agents seed the same `demo` tenant, and deleting what
 * isn't yours has already broken someone else's work in this project once. That's why each
 * row created here has an identifier **derived from a name** (sha1 of a CRM
 * namespace), and the initial cleanup deletes exactly those identifiers and nothing else:
 * running it twice doesn't duplicate, and it never touches anyone else's contact, conversation, or queue.
 *
 * It builds on what already exists — contacts and conversations from the Gestão seed, queues and
 * users from the base seed — because that's how the product's promise shows up on
 * screen: the lead's timeline brings in attendance that really happened.
 *
 * Usage: `pnpm --filter @pipe/crm seed:crm`
 */

const NAMESPACE = 'pipe-crm:2026-09-05';

/** Deterministic UUID from a name. Same name, same id, always. */
function idDe(nome: string): string {
  const h = createHash('sha1').update(`${NAMESPACE}:${nome}`).digest();
  const b = Buffer.from(h.subarray(0, 16));
  b[6] = ((b[6] as number) & 0x0f) | 0x50;
  b[8] = ((b[8] as number) & 0x3f) | 0x80;
  const s = b.toString('hex');
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20, 32)}`;
}

/** Deterministic generator: running it twice gives exactly the same base data. */
function aleatorio(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rnd = aleatorio(20260905);
const entre = (min: number, max: number) => min + rnd() * (max - min);
const entire = (min: number, max: number) => Math.floor(entre(min, max + 1));
const escolher = <T,>(lista: readonly T[]): T => lista[Math.floor(rnd() * lista.length)] as T;
const sorteio = (p: number) => rnd() < p;
const dias = (n: number) => n * 86_400_000;

/* ------------------------------------------------------------------ catalogs */

const VERSAO_REGRA = 4;

const ORIGENS = [
  'Anúncio Meta',
  'Anúncio Google',
  'Indicação',
  'Site orgânico',
  'Webinar 08/26',
  'Importado RD',
] as const;

const CAMPANHAS: Record<string, string | null> = {
  'Anúncio Meta': 'Meta · Investidor 2026',
  'Anúncio Google': 'Search · consultoria financeira',
  Indicação: null,
  'Site orgânico': null,
  'Webinar 08/26': 'Webinar agosto 2026',
  'Importado RD': 'Base RD Station',
};

/**
 * Accounts. The Gestão seed creates contact and conversation, and this CRM's base seed
 * creates lead and opportunity — nobody was creating `conta`, which is why the lead's
 * `conta_id` column came back null on every row. The Accounts screen was born empty, which
 * is the worst way to find out a table was never populated.
 *
 * Fictitious names on purpose: this is a demo tenant, and nobody's real customer data
 * goes into a seed that ships to the repository.
 */
const ACCOUNTS = [
  { nome: 'Almeida Participações', dominio: 'almeidapar.com.br' },
  { nome: 'Barreto Engenharia', dominio: 'barretoeng.com.br' },
  { nome: 'Clínica Vida Plena', dominio: 'vidaplena.med.br' },
  { nome: 'Coelho Transportes', dominio: 'coelhotransportes.com.br' },
  { nome: 'Cordeiro Alimentos', dominio: 'cordeiroalimentos.com.br' },
  { nome: 'Faria Contabilidade', dominio: 'fariacontabil.com.br' },
  { nome: 'Matos Comércio de Peças', dominio: 'matospecas.com.br' },
  { nome: 'Moura Agro', dominio: 'mouraagro.com.br' },
  { nome: 'Muniz Consultoria', dominio: 'munizconsult.com.br' },
  { nome: 'Nunes Tecnologia', dominio: 'nunestec.com.br' },
  { nome: 'Prates Imóveis', dominio: 'pratesimoveis.com.br' },
  { nome: 'Rezende Educação', dominio: 'rezendeeducacao.com.br' },
  { nome: 'Ribeiro Logística', dominio: 'ribeirolog.com.br' },
  { nome: 'Salgado Indústria', dominio: 'salgadoind.com.br' },
] as const;

/** Fake, deterministic CNPJ. Fourteen digits, no real check digit. */
function cnpjDe(indice: number): string {
  const base = String(10_000_000 + indice * 137_911).padStart(8, '0');
  return `${base}0001${String(10 + indice).slice(0, 2)}`;
}

const FASES = ['Novo', 'Qualificado', 'Reunião', 'Proposta', 'Fechamento'] as const;
const PROBABILITY: Record<string, number> = {
  Novo: 10,
  Qualificado: 25,
  Reunião: 45,
  Proposta: 65,
  Fechamento: 85,
};

/**
 * Version 4 rules. The weights come from the approved mockup, and the cutoff at 60 is the
 * business rule that already runs in today's webhook.
 */
const REGRAS: { nome: string; pontos: number; condition: Expressao }[] = [
  {
    nome: 'Patrimônio acima de R$ 500 mil',
    pontos: 30,
    condition: { campo: 'patrimonio', operador: 'maior_igual', valor: 500_000 },
  },
  {
    nome: 'Patrimônio entre R$ 250 e 500 mil',
    pontos: 22,
    condition: {
      combinador: 'e',
      condicoes: [
        { campo: 'patrimonio', operador: 'maior_igual', valor: 250_000 },
        { campo: 'patrimonio', operador: 'menor', valor: 500_000 },
      ],
    },
  },
  {
    nome: 'Diagnóstico respondido inteiro',
    pontos: 18,
    condition: { campo: 'diagnostico_completo', operador: 'igual', valor: true },
  },
  {
    nome: 'Indicação de cliente',
    pontos: 14,
    condition: { campo: 'origem', operador: 'igual', valor: 'Indicação' },
  },
  {
    nome: 'Interesse declarado em plano anual',
    pontos: 12,
    condition: { campo: 'interesse_plano', operador: 'igual', valor: 'anual' },
  },
  {
    nome: 'Origem: anúncio pago',
    pontos: 10,
    condition: {
      campo: 'origem',
      operador: 'em',
      valor: ['Anúncio Meta', 'Anúncio Google'],
    },
  },
  {
    nome: 'Faixa etária 35–50',
    pontos: 8,
    condition: {
      combinador: 'e',
      condicoes: [
        { campo: 'idade', operador: 'maior_igual', valor: 35 },
        { campo: 'idade', operador: 'menor_igual', valor: 50 },
      ],
    },
  },
  {
    nome: 'WhatsApp confirmado',
    pontos: 5,
    condition: { campo: 'whatsapp_confirmado', operador: 'igual', valor: true },
  },
  {
    nome: 'Sem resposta na campanha de julho',
    pontos: -6,
    condition: { campo: 'respondeu_campanha_julho', operador: 'igual', valor: false },
  },
  {
    nome: 'Importado sem origem definida',
    pontos: -4,
    condition: { campo: 'origem', operador: 'igual', valor: 'Importado RD' },
  },
];

const FAIXAS: { nome: string; minimo: number; maximo: number; queue: string | null; estrategia: string }[] =
  [
    { nome: 'Nutrição', minimo: 0, maximo: 39, queue: null, estrategia: 'nenhuma' },
    { nome: 'Comercial', minimo: 40, maximo: 59, queue: 'Comercial', estrategia: 'rodizio' },
    { nome: 'Closer', minimo: 60, maximo: 100, queue: 'Closer', estrategia: 'menor_carga' },
  ];

/** Bands in the engine's format: the top band's `maximo` is open-ended. */
const FAIXAS_MOTOR: FaixaScore[] = FAIXAS.map((f, i) => ({
  nome: f.nome,
  minimo: f.minimo,
  maximo: i === FAIXAS.length - 1 ? null : f.maximo,
}));

const PERGUNTAS_DIAGNOSTICO = [
  {
    codigo: 'patrimonio_faixa',
    rotulo: 'Patrimônio aproximado',
    tipo: 'selecao_unica',
    options: ['Até R$ 100 mil', 'R$ 100 a 250 mil', 'R$ 250 a 500 mil', 'Acima de R$ 500 mil'],
    obrigatoria: true,
  },
  {
    codigo: 'objetivo',
    rotulo: 'Principal objetivo',
    tipo: 'selecao_unica',
    options: ['Aposentadoria', 'Renda passiva', 'Reserva de emergência', 'Crescer patrimônio'],
    obrigatoria: true,
  },
  {
    codigo: 'ja_investe',
    rotulo: 'Já investe hoje?',
    tipo: 'booleano',
    options: [],
    obrigatoria: true,
  },
  {
    codigo: 'renda_mensal',
    rotulo: 'Renda mensal',
    tipo: 'numero',
    options: [],
    obrigatoria: false,
  },
  {
    codigo: 'horizonte',
    rotulo: 'Horizonte de investimento',
    tipo: 'selecao_unica',
    options: ['Menos de 2 anos', '2 a 5 anos', 'Mais de 5 anos'],
    obrigatoria: false,
  },
] as const;

/** Version 2 adds two more questions — and version 1's history stays readable. */
const PERGUNTAS_DIAGNOSTICO_V2 = [
  ...PERGUNTAS_DIAGNOSTICO,
  {
    codigo: 'perfil_risco',
    rotulo: 'Perfil de risco',
    tipo: 'selecao_unica',
    options: ['Conservador', 'Moderado', 'Arrojado'],
    obrigatoria: true,
  },
  {
    codigo: 'aporte_mensal',
    rotulo: 'Aporte mensal pretendido',
    tipo: 'numero',
    options: [],
    obrigatoria: false,
  },
] as const;

const PERGUNTAS_PLANO = [
  {
    codigo: 'plano',
    rotulo: 'Plano de interesse',
    tipo: 'selecao_unica',
    options: ['Mensal', 'Anual', 'Ainda não sei'],
    obrigatoria: true,
  },
  {
    codigo: 'inicio_previsto',
    rotulo: 'Início previsto',
    tipo: 'data',
    options: [],
    obrigatoria: false,
  },
  {
    codigo: 'observacao',
    rotulo: 'O que você espera do acompanhamento?',
    tipo: 'texto_longo',
    options: [],
    obrigatoria: false,
  },
] as const;

const ETIQUETAS_CRM = [
  { nome: 'Perfil investidor', cor: '#4A5D23' },
  { nome: 'Alto ticket', cor: '#9A7420' },
  { nome: 'Recompra', cor: '#2E4A5D' },
  { nome: 'Frio', cor: '#7A7970' },
] as const;

const NOTAS = [
  'Pediu para retomar depois do fechamento do mês.',
  'Quer entender a diferença entre o plano mensal e o anual antes de decidir.',
  'Já tem assessor no banco e está insatisfeito com a rentabilidade.',
  'Preferiu conversar por WhatsApp, não atende ligação em horário comercial.',
  'Achou o valor alto na primeira conversa; vale mostrar o caso do plano anual.',
  'Vai receber a rescisão em outubro e quer planejar o aporte.',
  'Sócio da empresa entra na decisão; pediu proposta por e-mail.',
] as const;

const SUMMARIES_ATTENDANCE = [
  'Cliente perguntou sobre taxa de administração e prazo de resgate. Atendente explicou as duas coisas e enviou a lâmina. Ficou de responder até sexta.',
  'Pedido de simulação para aporte de R$ 30 mil. Atendente registrou o pedido e prometeu retorno em 24h.',
  'Reclamação sobre demora no cadastro. Atendente checou com o back-office e informou o novo prazo. Cliente aceitou.',
  'Cliente queria cancelar; ao entender a carência, decidiu manter e pediu revisão da carteira.',
  'Dúvida sobre a portabilidade de previdência. Atendente enviou o passo a passo e agendou uma call.',
] as const;

const CATEGORIAS = ['Dúvida de produto', 'Cadastro', 'Financeiro', 'Retenção', 'Suporte'] as const;

/* ------------------------------------------------------------------- semente */

async function seedCrm(db: DatabasePipe) {
  const [tenantLinha] = await db.select({ id: tenant.id }).from(tenant).where(eq(tenant.slug, 'demo'));
  if (!tenantLinha) throw new Error('tenant "demo" não existe: rode `pnpm banco:semear` antes.');
  const tenantId = tenantLinha.id;

  const users = await db
    .select({ id: user.id, nome: user.nome })
    .from(user)
    .where(and(eq(user.tenantId, tenantId), eq(user.ativo, true)))
    .orderBy(user.nome);
  if (users.length === 0) throw new Error('nenhum usuário no tenant demo.');

  const queues = await db
    .select({ id: queue.id, nome: queue.nome })
    .from(queue)
    .where(eq(queue.tenantId, tenantId));
  const queueByName = new Map(queues.map((f) => [f.nome, f.id]));

  /**
   * Contacts who have already talked come first: that's what makes the lead's timeline
   * show real attendance instead of a list of made-up notes.
   */
  const withConversation = await db
    .selectDistinct({ id: contact.id, nome: contact.nome })
    .from(contact)
    .innerJoin(conversation, eq(conversation.contatoId, contact.id))
    .where(and(eq(contact.tenantId, tenantId), isNotNull(contact.nome)))
    .orderBy(contact.nome)
    .limit(60);

  if (withConversation.length < 10) {
    throw new Error(
      'poucos contatos com conversa no tenant demo: rode `pnpm --filter @pipe/management-vite seed:gestao` antes.',
    );
  }

  const agora = new Date();

  /* ---------------------------------------------------- cleanup of what's mine */

  const idsLead = withConversation.map((c) => idDe(`lead:${c.id}`));
  const idsOpportunity = withConversation.flatMap((c) => [
    idDe(`oportunidade:${c.id}:1`),
    idDe(`oportunidade:${c.id}:2`),
  ]);
  const idsFormulario = [idDe('formulario:diagnostico'), idDe('formulario:plano')];
  const idsRegra = REGRAS.map((r) => idDe(`regra:${VERSAO_REGRA}:${r.nome}`));
  const idsFaixa = FAIXAS.map((f) => idDe(`faixa:${VERSAO_REGRA}:${f.nome}`));
  const idsEtiqueta = ETIQUETAS_CRM.map((e) => idDe(`etiqueta:${e.nome}`));
  const idsAccount = ACCOUNTS.map((c) => idDe(`conta:${c.nome}`));
  const idsClassification = withConversation.map((c) => idDe(`classificacao:${c.id}`));

  // Order: opportunity and lead before the form, otherwise the response holds up the version.
  await db.delete(opportunity).where(inArray(opportunity.id, idsOpportunity));
  await db.delete(lead).where(inArray(lead.id, idsLead));
  await db.delete(formulario).where(inArray(formulario.id, idsFormulario));
  await db.delete(regraScore).where(inArray(regraScore.id, idsRegra));
  await db.delete(faixaScore).where(inArray(faixaScore.id, idsFaixa));
  await db.delete(etiqueta).where(inArray(etiqueta.id, idsEtiqueta));
  await db.delete(classificationConversation).where(inArray(classificationConversation.id, idsClassification));

  /*
   * The contact belongs to another seed: only the link to the account is mine, and that's the
   * only thing cleanup undoes. I release the link before deleting the account, otherwise the
   * foreign key holds onto the row.
   */
  await db
    .update(contact)
    .set({ accountId: null })
    .where(and(eq(contact.tenantId, tenantId), inArray(contact.accountId, idsAccount)));
  await db.delete(account).where(inArray(account.id, idsAccount));

  /* ------------------------------------------------------------------ contas */

  await db.insert(account).values(
    ACCOUNTS.map((c, i) => ({
      id: idsAccount[i] as string,
      tenantId,
      name: c.nome,
      document: cnpjDe(i),
      domain: c.dominio,
      proprietarioId: (users[i % users.length] as { id: string }).id,
    })),
  );

  /* ------------------------------------------------- regras, faixas, etiquetas */

  await db.insert(regraScore).values(
    REGRAS.map((r) => ({
      id: idDe(`regra:${VERSAO_REGRA}:${r.nome}`),
      tenantId,
      version: VERSAO_REGRA,
      name: r.nome,
      condition: r.condition,
      pontos: r.pontos,
      active: true,
    })),
  );

  await db.insert(faixaScore).values(
    FAIXAS.map((f) => ({
      id: idDe(`faixa:${VERSAO_REGRA}:${f.nome}`),
      tenantId,
      version: VERSAO_REGRA,
      name: f.nome,
      minimo: f.minimo,
      maximo: f.maximo,
      queueId: f.queue ? (queueByName.get(f.queue) ?? null) : null,
      estrategiaProprietario: f.estrategia,
    })),
  );

  await db
    .insert(etiqueta)
    .values(
      ETIQUETAS_CRM.map((e) => ({
        id: idDe(`etiqueta:${e.nome}`),
        tenantId,
        nome: e.nome,
        cor: e.cor,
        escopo: 'contato',
      })),
    )
    .onConflictDoNothing();

  /* --------------------------------------------------------------- forms */

  const idDiagnostico = idDe('formulario:diagnostico');
  const idPlano = idDe('formulario:plano');

  await db.insert(formulario).values([
    {
      id: idDiagnostico,
      tenantId,
      name: 'Diagnóstico de investidor',
      slug: 'diagnostico-investidor',
      active: true,
    },
    { id: idPlano, tenantId, name: 'Interesse em plano', slug: 'interesse-plano', active: true },
  ]);

  const versions = [
    { id: idDe('versao:diagnostico:1'), formularioId: idDiagnostico, versao: 1, dias: 120 },
    { id: idDe('versao:diagnostico:2'), formularioId: idDiagnostico, versao: 2, dias: 30 },
    { id: idDe('versao:plano:1'), formularioId: idPlano, versao: 1, dias: 90 },
  ];

  await db.insert(formularioVersao).values(
    versions.map((v) => ({
      id: v.id,
      tenantId,
      formId: v.formularioId,
      version: v.versao,
      publicadaEm: new Date(agora.getTime() - dias(v.dias)),
    })),
  );

  const questionsByVersion = new Map<string, { id: string; codigo: string; tipo: string }[]>();
  const linhasPergunta: (typeof formularioPergunta.$inferInsert)[] = [];

  function registrarPerguntas(
    versaoId: string,
    key: string,
    lista: readonly { codigo: string; rotulo: string; tipo: string; options: readonly string[]; obrigatoria: boolean }[],
  ) {
    const registradas: { id: string; codigo: string; tipo: string }[] = [];
    lista.forEach((p, i) => {
      const id = idDe(`pergunta:${key}:${p.codigo}`);
      linhasPergunta.push({
        id,
        tenantId,
        versaoId,
        code: p.codigo,
        rotulo: p.rotulo,
        type: p.tipo,
        options: [...p.options],
        order: i + 1,
        required: p.obrigatoria,
      });
      registradas.push({ id, codigo: p.codigo, tipo: p.tipo });
    });
    questionsByVersion.set(versaoId, registradas);
  }

  registrarPerguntas(versions[0]!.id, 'diag1', PERGUNTAS_DIAGNOSTICO);
  registrarPerguntas(versions[1]!.id, 'diag2', PERGUNTAS_DIAGNOSTICO_V2);
  registrarPerguntas(versions[2]!.id, 'plano1', PERGUNTAS_PLANO);

  await db.insert(formularioPergunta).values(linhasPergunta);

  /* --------------------------------------------------------------------- leads */

  const regrasMotor: RegraScore[] = REGRAS.map((r) => ({
    id: idDe(`regra:${VERSAO_REGRA}:${r.nome}`),
    nome: r.nome,
    versao: VERSAO_REGRA,
    pontos: r.pontos,
    condition: r.condition,
    active: true,
  }));

  const linhasLead: (typeof lead.$inferInsert)[] = [];
  const linhasResposta: (typeof respostaFormulario.$inferInsert)[] = [];
  const linhasScore: (typeof scoreLead.$inferInsert)[] = [];
  const rowsActivity: (typeof activity.$inferInsert)[] = [];
  const rowsOpportunity: (typeof opportunity.$inferInsert)[] = [];
  const rowsContactTag: (typeof contactLabel.$inferInsert)[] = [];
  const rowsClassification: (typeof classificationConversation.$inferInsert)[] = [];

  const tierByContact = new Map<string, string | null>();
  /** Account → its contacts. Turns into one `update` per account, not sixty. */
  const contactsByAccount = new Map<string, string[]>();

  for (const [indice, c] of withConversation.entries()) {
    const leadId = idDe(`lead:${c.id}`);
    // Rotating through accounts: each one gets three or four contacts, which is
    // enough for the account record to have more than one row in each block.
    const accountId = idsAccount[indice % idsAccount.length] as string;
    const accountContacts = contactsByAccount.get(accountId);
    if (accountContacts) accountContacts.push(c.id);
    else contactsByAccount.set(accountId, [c.id]);
    // Half arrived in the last few days and half in previous months: without this the dashboard
    // compares a full month against a five-day month and the variation turns into noise.
    const criadoEm = new Date(
      agora.getTime() - (sorteio(0.45) ? dias(entre(0, 4.5)) : dias(entre(5, 62))),
    );
    const origem = escolher(ORIGENS);

    // The profile is the single source: it feeds the score and the form answers.
    const patrimonio = escolher([120_000, 260_000, 320_000, 480_000, 640_000, 1_200_000]);
    const diagnosticoCompleto = sorteio(0.72);
    const interessePlano = sorteio(0.65) ? (sorteio(0.7) ? 'anual' : 'mensal') : null;
    const age = entire(30, 58);
    const respondeuCampanhaJulho = sorteio(0.7);
    const whatsappConfirmado = sorteio(0.8);

    const data = {
      origem,
      patrimonio,
      diagnostico_completo: diagnosticoCompleto,
      interesse_plano: interessePlano,
      age,
      respondeu_campanha_julho: respondeuCampanhaJulho,
      whatsapp_confirmado: whatsappConfirmado,
    };

    // Not every lead is scored: one that answered nothing has no score, and the record
    // says so instead of showing zero — zero is a number, absence of a calculation isn't.
    const pontuado = diagnosticoCompleto || interessePlano !== null || sorteio(0.5);
    const resultado = pontuado
      ? calcularScore(regrasMotor, data, {
          faixas: FAIXAS_MOTOR,
          limites: { minimo: 0, maximo: 100 },
          versaoRegra: VERSAO_REGRA,
        })
      : null;

    // Never before the lead's creation nor in the future: "days in stage" is a count, and
    // a negative count is the cheapest way to lose trust in the column.
    const faseDesde = new Date(
      Math.max(criadoEm.getTime(), agora.getTime() - dias(entre(0, 16))),
    );
    const acimaDoCorte = (resultado?.value ?? 0) >= 60;

    const status = !pontuado
      ? 'novo'
      : sorteio(0.08)
        ? 'desqualificado'
        : acimaDoCorte
          ? sorteio(0.65)
            ? 'qualificado'
            : 'em_contato'
          : sorteio(0.3)
            ? 'em_contato'
            : 'novo';

    const fase =
      status === 'desqualificado'
        ? 'Novo'
        : acimaDoCorte
          ? escolher(FASES)
          : escolher(['Novo', 'Qualificado'] as const);

    // A lead in the nurture band has no owner: that's exactly the "unassigned" tab.
    const proprietario =
      resultado && resultado.faixa !== 'Nutrição' && sorteio(0.82) ? escolher(users) : null;

    tierByContact.set(c.id, resultado?.faixa ?? null);

    linhasLead.push({
      id: leadId,
      tenantId,
      contactId: c.id,
      contaId: accountId,
      origin: origem,
      campanha: CAMPANHAS[origem] ?? null,
      utm:
        CAMPANHAS[origem] === null
          ? {}
          : {
              source: origem.startsWith('Anúncio') ? origem.split(' ')[1]?.toLowerCase() : 'site',
              medium: origem.startsWith('Anúncio') ? 'cpc' : 'organic',
              campaign: CAMPANHAS[origem],
            },
      status,
      fase,
      faseDesde,
      proprietarioId: proprietario?.id ?? null,
      scoreAtual: resultado?.value ?? null,
      faixaAtual: resultado?.faixa ?? null,
      desqualificadoEm: status === 'desqualificado' ? new Date(agora.getTime() - dias(entre(1, 20))) : null,
      customizados: {
        faixa_patrimonio:
          patrimonio >= 500_000
            ? 'Acima de R$ 500 mil'
            : patrimonio >= 250_000
              ? 'R$ 250 a 500 mil'
              : patrimonio >= 100_000
                ? 'R$ 100 a 250 mil'
                : 'Até R$ 100 mil',
        age,
        whatsapp_confirmado: whatsappConfirmado ? 'sim' : 'não',
        respondeu_campanha_julho: respondeuCampanhaJulho ? 'sim' : 'não',
      },
      criadoEm,
    });

    if (resultado) {
      linhasScore.push({
        id: idDe(`score:${c.id}`),
        tenantId,
        leadId,
        versaoRegra: resultado.versaoRegra,
        value: resultado.value,
        faixa: resultado.faixa,
        explanation: resultado.explanation,
        calculadoEm: new Date(criadoEm.getTime() + 1000 * entire(60, 3600)),
      });
    }

    /* ------------------------------------------------ form responses */

    // An old lead answered diagnostic version 1; a recent lead, version 2.
    const usaV2 = criadoEm.getTime() > agora.getTime() - dias(30);
    const versaoDiag = usaV2 ? versions[1]! : versions[0]!;
    const perguntasDiag = questionsByVersion.get(versaoDiag.id) ?? [];

    const respondidoEm = new Date(criadoEm.getTime() + 1000 * entire(30, 900));
    // An incomplete diagnostic only answers the first two — and the 18-point rule
    // doesn't match. That's what makes the score's explanation tell a true story.
    const quantas = diagnosticoCompleto ? perguntasDiag.length : 2;

    for (const p of perguntasDiag.slice(0, quantas)) {
      const value = respostaDiagnostico(p.codigo, { patrimonio, age });
      if (value === null) continue;
      linhasResposta.push({
        id: idDe(`resposta:${c.id}:${versaoDiag.id}:${p.codigo}`),
        tenantId,
        leadId,
        versaoId: versaoDiag.id,
        perguntaId: p.id,
        ...value,
        criadoEm: respondidoEm,
      });
    }

    if (interessePlano) {
      const versaoPlano = versions[2]!;
      const perguntasPlano = questionsByVersion.get(versaoPlano.id) ?? [];
      const emPlano = new Date(respondidoEm.getTime() + 1000 * entire(600, 86_400));
      for (const p of perguntasPlano) {
        const value =
          p.codigo === 'plano'
            ? { valorTexto: interessePlano === 'anual' ? 'Anual' : 'Mensal' }
            : p.codigo === 'inicio_previsto'
              ? { valorData: new Date(agora.getTime() + dias(entire(7, 90))) }
              : { valorTexto: escolher(NOTAS) };
        linhasResposta.push({
          id: idDe(`resposta:${c.id}:${versaoPlano.id}:${p.codigo}`),
          tenantId,
          leadId,
          versaoId: versaoPlano.id,
          perguntaId: p.id,
          ...value,
          criadoEm: emPlano,
        });
      }
    }

    /* ---------------------------------------------------------- etiquetas */

    if (patrimonio >= 500_000) {
      rowsContactTag.push({
        tenantId,
        contatoId: c.id,
        etiquetaId: idDe('etiqueta:Alto ticket'),
        em: criadoEm,
      });
    }
    if (diagnosticoCompleto) {
      rowsContactTag.push({
        tenantId,
        contatoId: c.id,
        etiquetaId: idDe('etiqueta:Perfil investidor'),
        em: criadoEm,
      });
    }
    if (!pontuado) {
      rowsContactTag.push({
        tenantId,
        contatoId: c.id,
        etiquetaId: idDe('etiqueta:Frio'),
        em: criadoEm,
      });
    }

    /* --------------------------------------------------------- atividades */

    rowsActivity.push({
      id: idDe(`atividade:${c.id}:formulario`),
      tenantId,
      type: 'nota',
      leadId,
      summary: `Formulário respondido · Diagnóstico de investidor v${versaoDiag.versao}`,
      body: diagnosticoCompleto
        ? 'Respondeu o diagnóstico inteiro.'
        : 'Abandonou o diagnóstico na terceira pergunta.',
      ocorridaEm: respondidoEm,
      criadoEm: respondidoEm,
    });

    const howManyActivities = entire(1, 4);
    for (let i = 0; i < howManyActivities; i += 1) {
      const tipo = escolher(['ligacao', 'email', 'reuniao', 'nota', 'tarefa'] as const);
      const em = new Date(criadoEm.getTime() + dias(entre(0.2, 20)));
      if (em.getTime() > agora.getTime()) continue;
      rowsActivity.push({
        id: idDe(`atividade:${c.id}:${i}`),
        tenantId,
        type: tipo,
        leadId,
        userId: proprietario?.id ?? escolher(users).id,
        summary:
          tipo === 'ligacao'
            ? 'Ligação de qualificação'
            : tipo === 'email'
              ? 'E-mail com a apresentação do plano'
              : tipo === 'reuniao'
                ? 'Reunião de diagnóstico'
                : tipo === 'tarefa'
                  ? 'Retornar contato'
                  : 'Nota do vendedor',
        body: escolher(NOTAS),
        ocorridaEm: em,
        criadoEm: em,
      });
    }

    rowsActivity.push({
      id: idDe(`atividade:${c.id}:fase`),
      tenantId,
      type: 'mudanca_fase',
      leadId,
      userId: proprietario?.id ?? null,
      summary: `Fase alterada para ${fase}`,
      body: null,
      ocorridaEm: faseDesde,
      criadoEm: faseDesde,
    });

    /* ------------------------------------------------------ oportunidades */

    // Only a lead above the cutoff becomes an opportunity, which is today's funnel rule.
    // Vira oportunidade quem o comercial de fato trabalha: da faixa Comercial para
    // top. Below that is nurture, and nurture doesn't occupy a funnel column.
    if ((resultado?.value ?? 0) >= 45 && status !== 'desqualificado') {
      const value = escolher([4788, 7200, 9600, 12_400, 18_000, 24_000, 36_000, 48_000]);
      const abertaEm = new Date(criadoEm.getTime() + dias(entre(1, 6)));
      rowsOpportunity.push({
        id: idDe(`oportunidade:${c.id}:1`),
        tenantId,
        leadId,
        accountId,
        name: c.nome ?? `Oportunidade ${indice + 1}`,
        value: value.toFixed(2),
        moeda: 'BRL',
        fase,
        probability: PROBABILITY[fase] ?? 10,
        closingExpected: dataIso(new Date(agora.getTime() + dias(entire(5, 75)))),
        proprietarioId: proprietario?.id ?? escolher(users).id,
        criadoEm: new Date(Math.min(abertaEm.getTime(), agora.getTime())),
      });

      // A handful have already closed this month: without them the "closed this month" card would sit
      // at zero and the dashboard would have nothing to compare against.
      if (sorteio(0.28)) {
        const ganha = sorteio(0.7);
        const fechadaEm = new Date(agora.getTime() - dias(entre(0, 24)));
        rowsOpportunity.push({
          id: idDe(`oportunidade:${c.id}:2`),
          tenantId,
          leadId,
          accountId,
          name: `${c.nome ?? 'Cliente'} · renovação`,
          value: (value * 0.8).toFixed(2),
          moeda: 'BRL',
          fase: ganha ? 'Fechamento' : 'Proposta',
          probability: ganha ? 100 : 0,
          fechadaEm,
          ganha,
          motivoPerda: ganha ? null : escolher(['Preço', 'Sem retorno', 'Escolheu concorrente']),
          proprietarioId: proprietario?.id ?? escolher(users).id,
          criadoEm: new Date(fechadaEm.getTime() - dias(entre(10, 40))),
        });
      }
    }
  }

  // One `update` per account, not one per contact: fourteen queries instead of sixty.
  for (const [accountId, ids] of contactsByAccount) {
    await db
      .update(contact)
      .set({ accountId })
      .where(and(eq(contact.tenantId, tenantId), inArray(contact.id, ids)));
  }

  await db.insert(lead).values(linhasLead);
  if (linhasScore.length > 0) await db.insert(scoreLead).values(linhasScore);
  if (linhasResposta.length > 0) await db.insert(respostaFormulario).values(linhasResposta);
  if (rowsActivity.length > 0) await db.insert(activity).values(rowsActivity);
  if (rowsOpportunity.length > 0) await db.insert(opportunity).values(rowsOpportunity);
  if (rowsContactTag.length > 0) {
    await db.insert(contactLabel).values(rowsContactTag).onConflictDoNothing();
  }

  /* ------------------------------------- resumo do atendimento na linha do tempo */

  /**
   * The product's promise is that the CRM feeds off conversations. Without classification,
   * the timeline just shows "there was an attendance" and nothing else. These rows are
   * created with their own id and `onConflictDoNothing`: if the AI worker already classified
   * the conversation, its version wins.
   */
  const conversationsForSummarize = await db
    .select({ id: conversation.id, contatoId: conversation.contatoId, encerradaEm: conversation.encerradaEm })
    .from(conversation)
    .where(
      and(
        eq(conversation.tenantId, tenantId),
        inArray(
          conversation.contatoId,
          withConversation.map((c) => c.id),
        ),
        isNotNull(conversation.encerradaEm),
      ),
    )
    .orderBy(sql`${conversation.encerradaEm} desc`)
    .limit(60);

  const vistos = new Set<string>();
  for (const cv of conversationsForSummarize) {
    // One summarized conversation per contact: the goal is the record, not the AI's dataset.
    if (vistos.has(cv.contatoId)) continue;
    vistos.add(cv.contatoId);
    rowsClassification.push({
      id: idDe(`classificacao:${cv.contatoId}`),
      tenantId,
      conversaId: cv.id,
      categoria: escolher(CATEGORIAS),
      resumo: escolher(SUMMARIES_ATTENDANCE),
      sentiment: escolher(['positivo', 'neutro', 'negativo'] as const),
      confianca: '0.8600',
      template: 'semente',
      criadaEm: cv.encerradaEm ?? agora,
    });
  }
  if (rowsClassification.length > 0) {
    await db.insert(classificationConversation).values(rowsClassification).onConflictDoNothing();
  }

  return {
    leads: linhasLead.length,
    comScore: linhasScore.length,
    respostas: linhasResposta.length,
    oportunidades: rowsOpportunity.length,
    atividades: rowsActivity.length,
    regras: REGRAS.length,
    contas: ACCOUNTS.length,
    resumos: rowsClassification.length,
  };
}

/** `YYYY-MM-DD` for the `date` column `fechamento_previsto`. */
function dataIso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

type ValueResponse = {
  valueText?: string;
  valueNum?: string;
  valueBool?: boolean;
  valueData?: Date;
};

function respostaDiagnostico(
  codigo: string,
  perfil: { patrimonio: number; age: number },
): ValueResponse | null {
  switch (codigo) {
    case 'patrimonio_faixa':
      return {
        valueText:
          perfil.patrimonio >= 500_000
            ? 'Acima de R$ 500 mil'
            : perfil.patrimonio >= 250_000
              ? 'R$ 250 a 500 mil'
              : perfil.patrimonio >= 100_000
                ? 'R$ 100 a 250 mil'
                : 'Até R$ 100 mil',
      };
    case 'objetivo':
      return {
        valueText: escolher([
          'Aposentadoria',
          'Renda passiva',
          'Reserva de emergência',
          'Crescer patrimônio',
        ]),
      };
    case 'ja_investe':
      return { valueBool: perfil.patrimonio >= 100_000 };
    case 'renda_mensal':
      return { valueNum: (Math.round(perfil.patrimonio / 40 / 500) * 500).toFixed(6) };
    case 'horizonte':
      return {
        valueText: escolher(['Menos de 2 anos', '2 a 5 anos', 'Mais de 5 anos']),
      };
    case 'perfil_risco':
      return { valueText: escolher(['Conservador', 'Moderado', 'Arrojado']) };
    case 'aporte_mensal':
      return { valueNum: (entire(2, 40) * 500).toFixed(6) };
    default:
      return null;
  }
}

const db = createDatabase({ maxConnections: 4 });
seedCrm(db)
  .then((r) => {
    process.stdout.write(
      `semente do CRM: ${r.leads} leads (${r.comScore} com score explicado), ` +
        `${r.respostas} respostas de formulário, ${r.oportunidades} oportunidades, ` +
        `${r.atividades} atividades, ${r.contas} contas, ${r.regras} regras de score, ${r.resumos} resumos de atendimento\n`,
    );
  })
  .catch((error: unknown) => {
    process.stderr.write(`falha ao semear o CRM: ${String(error)}\n`);
    process.exitCode = 1;
  })
  .finally(() => closeDatabase(db));
