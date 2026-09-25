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
 * Semente do Pipe CRM.
 *
 * **Acrescenta, nunca varre.** Outros agentes semeiam o mesmo tenant `demo`, e apagar
 * o que não é seu já quebrou trabalho alheio neste projeto uma vez. Por isso cada
 * linha criada aqui tem identificador **derivado do nome** (sha1 de um namespace do
 * CRM), e a limpeza do começo apaga exatamente esses identificadores e mais nenhum:
 * rodar duas vezes não duplica, e não encosta em contato, conversa ou fila de
 * ninguém.
 *
 * Ela se apoia no que já existe — contatos e conversas da semente da Gestão, filas e
 * usuários da semente base — porque é assim que a promessa do produto aparece na
 * tela: a linha do tempo do lead traz o atendimento que já aconteceu.
 *
 * Uso: `pnpm --filter @pipe/crm seed:crm`
 */

const NAMESPACE = 'pipe-crm:2026-09-05';

/** UUID determinístico a partir de um nome. Mesmo nome, mesmo id, sempre. */
function idDe(nome: string): string {
  const h = createHash('sha1').update(`${NAMESPACE}:${nome}`).digest();
  const b = Buffer.from(h.subarray(0, 16));
  b[6] = ((b[6] as number) & 0x0f) | 0x50;
  b[8] = ((b[8] as number) & 0x3f) | 0x80;
  const s = b.toString('hex');
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20, 32)}`;
}

/** Gerador determinístico: rodar duas vezes dá exatamente a mesma base. */
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

/* ------------------------------------------------------------------ catálogos */

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
 * Contas. A semente da Gestão cria contato e conversa, e a base deste CRM cria
 * lead e oportunidade — ninguém criava `conta`, e por isso a coluna `conta_id`
 * do lead vinha nula em toda linha. A tela de Contas nascia vazia, o que é a
 * pior maneira de descobrir que a tabela nunca foi preenchida.
 *
 * Nomes fictícios de propósito: é tenant de demonstração, e cliente real de
 * ninguém entra em semente que vai para o repositório.
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

/** CNPJ fictício e determinístico. Catorze dígitos, sem dígito verificador real. */
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
 * As regras da versão 4. Os pesos são os do mockup aprovado, e o corte em 60 é a
 * regra de negócio que já roda no webhook de hoje.
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

/** As faixas no formato do motor: `maximo` do topo é aberto. */
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
    opcoes: ['Até R$ 100 mil', 'R$ 100 a 250 mil', 'R$ 250 a 500 mil', 'Acima de R$ 500 mil'],
    obrigatoria: true,
  },
  {
    codigo: 'objetivo',
    rotulo: 'Principal objetivo',
    tipo: 'selecao_unica',
    opcoes: ['Aposentadoria', 'Renda passiva', 'Reserva de emergência', 'Crescer patrimônio'],
    obrigatoria: true,
  },
  {
    codigo: 'ja_investe',
    rotulo: 'Já investe hoje?',
    tipo: 'booleano',
    opcoes: [],
    obrigatoria: true,
  },
  {
    codigo: 'renda_mensal',
    rotulo: 'Renda mensal',
    tipo: 'numero',
    opcoes: [],
    obrigatoria: false,
  },
  {
    codigo: 'horizonte',
    rotulo: 'Horizonte de investimento',
    tipo: 'selecao_unica',
    opcoes: ['Menos de 2 anos', '2 a 5 anos', 'Mais de 5 anos'],
    obrigatoria: false,
  },
] as const;

/** A versão 2 acrescenta duas perguntas — e o histórico da versão 1 continua legível. */
const PERGUNTAS_DIAGNOSTICO_V2 = [
  ...PERGUNTAS_DIAGNOSTICO,
  {
    codigo: 'perfil_risco',
    rotulo: 'Perfil de risco',
    tipo: 'selecao_unica',
    opcoes: ['Conservador', 'Moderado', 'Arrojado'],
    obrigatoria: true,
  },
  {
    codigo: 'aporte_mensal',
    rotulo: 'Aporte mensal pretendido',
    tipo: 'numero',
    opcoes: [],
    obrigatoria: false,
  },
] as const;

const PERGUNTAS_PLANO = [
  {
    codigo: 'plano',
    rotulo: 'Plano de interesse',
    tipo: 'selecao_unica',
    opcoes: ['Mensal', 'Anual', 'Ainda não sei'],
    obrigatoria: true,
  },
  {
    codigo: 'inicio_previsto',
    rotulo: 'Início previsto',
    tipo: 'data',
    opcoes: [],
    obrigatoria: false,
  },
  {
    codigo: 'observacao',
    rotulo: 'O que você espera do acompanhamento?',
    tipo: 'texto_longo',
    opcoes: [],
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
   * Contatos que já conversaram vêm primeiro: é o que faz a linha do tempo do lead
   * mostrar atendimento de verdade em vez de uma lista de notas inventadas.
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
      'poucos contatos com conversa no tenant demo: rode `pnpm --filter @pipe/gestao-vite seed:gestao` antes.',
    );
  }

  const agora = new Date();

  /* ---------------------------------------------------- limpeza do que é meu */

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

  // Ordem: oportunidade e lead antes do formulário, senão a resposta segura a versão.
  await db.delete(opportunity).where(inArray(opportunity.id, idsOpportunity));
  await db.delete(lead).where(inArray(lead.id, idsLead));
  await db.delete(formulario).where(inArray(formulario.id, idsFormulario));
  await db.delete(regraScore).where(inArray(regraScore.id, idsRegra));
  await db.delete(faixaScore).where(inArray(faixaScore.id, idsFaixa));
  await db.delete(etiqueta).where(inArray(etiqueta.id, idsEtiqueta));
  await db.delete(classificationConversation).where(inArray(classificationConversation.id, idsClassification));

  /*
   * O contato é de outra semente: só o vínculo com a conta é meu, e é só ele
   * que a limpeza desfaz. Solto o vínculo antes de apagar a conta, senão a
   * chave estrangeira segura a linha.
   */
  await db
    .update(contact)
    .set({ contaId: null })
    .where(and(eq(contact.tenantId, tenantId), inArray(contact.accountId, idsAccount)));
  await db.delete(account).where(inArray(account.id, idsAccount));

  /* ------------------------------------------------------------------ contas */

  await db.insert(account).values(
    ACCOUNTS.map((c, i) => ({
      id: idsAccount[i] as string,
      tenantId,
      nome: c.nome,
      documento: cnpjDe(i),
      dominio: c.dominio,
      proprietarioId: (users[i % users.length] as { id: string }).id,
    })),
  );

  /* ------------------------------------------------- regras, faixas, etiquetas */

  await db.insert(regraScore).values(
    REGRAS.map((r) => ({
      id: idDe(`regra:${VERSAO_REGRA}:${r.nome}`),
      tenantId,
      versao: VERSAO_REGRA,
      nome: r.nome,
      condicao: r.condition,
      pontos: r.pontos,
      ativa: true,
    })),
  );

  await db.insert(faixaScore).values(
    FAIXAS.map((f) => ({
      id: idDe(`faixa:${VERSAO_REGRA}:${f.nome}`),
      tenantId,
      versao: VERSAO_REGRA,
      nome: f.nome,
      minimo: f.minimo,
      maximo: f.maximo,
      filaId: f.queue ? (queueByName.get(f.queue) ?? null) : null,
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

  /* --------------------------------------------------------------- formulários */

  const idDiagnostico = idDe('formulario:diagnostico');
  const idPlano = idDe('formulario:plano');

  await db.insert(formulario).values([
    {
      id: idDiagnostico,
      tenantId,
      nome: 'Diagnóstico de investidor',
      slug: 'diagnostico-investidor',
      ativo: true,
    },
    { id: idPlano, tenantId, nome: 'Interesse em plano', slug: 'interesse-plano', ativo: true },
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
      formularioId: v.formularioId,
      versao: v.versao,
      publicadaEm: new Date(agora.getTime() - dias(v.dias)),
    })),
  );

  const perguntasByVersion = new Map<string, { id: string; codigo: string; tipo: string }[]>();
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
        codigo: p.codigo,
        rotulo: p.rotulo,
        tipo: p.tipo,
        opcoes: [...p.options],
        ordem: i + 1,
        obrigatoria: p.obrigatoria,
      });
      registradas.push({ id, codigo: p.codigo, tipo: p.tipo });
    });
    perguntasByVersion.set(versaoId, registradas);
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
    condicao: r.condition,
    ativa: true,
  }));

  const linhasLead: (typeof lead.$inferInsert)[] = [];
  const linhasResposta: (typeof respostaFormulario.$inferInsert)[] = [];
  const linhasScore: (typeof scoreLead.$inferInsert)[] = [];
  const linhasActivity: (typeof activity.$inferInsert)[] = [];
  const linhasOpportunity: (typeof opportunity.$inferInsert)[] = [];
  const linhasContactTag: (typeof contactLabel.$inferInsert)[] = [];
  const linhasClassification: (typeof classificationConversation.$inferInsert)[] = [];

  const tierByContact = new Map<string, string | null>();
  /** Conta → contatos dela. Vira um `update` por conta, não sessenta. */
  const contactsByAccount = new Map<string, string[]>();

  for (const [indice, c] of withConversation.entries()) {
    const leadId = idDe(`lead:${c.id}`);
    // Rodízio pelas contas: cada uma fica com três ou quatro contatos, que é o
    // bastante para a ficha da conta ter mais de uma linha em cada bloco.
    const accountId = idsAccount[indice % idsAccount.length] as string;
    const accountContacts = contactsByAccount.get(accountId);
    if (accountContacts) accountContacts.push(c.id);
    else contactsByAccount.set(accountId, [c.id]);
    // Metade entrou nos últimos dias e metade nos meses anteriores: sem isso o painel
    // compara um mês cheio com um mês de cinco dias e a variação vira ruído.
    const criadoEm = new Date(
      agora.getTime() - (sorteio(0.45) ? dias(entre(0, 4.5)) : dias(entre(5, 62))),
    );
    const origem = escolher(ORIGENS);

    // O perfil é a fonte única: alimenta o score e as respostas do formulário.
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

    // Nem todo lead é pontuado: o que não respondeu nada fica sem score, e a ficha
    // diz isso em vez de exibir zero — zero é um número, ausência de cálculo não é.
    const pontuado = diagnosticoCompleto || interessePlano !== null || sorteio(0.5);
    const resultado = pontuado
      ? calcularScore(regrasMotor, data, {
          faixas: FAIXAS_MOTOR,
          limites: { minimo: 0, maximo: 100 },
          versaoRegra: VERSAO_REGRA,
        })
      : null;

    // Nunca antes da criação do lead nem no futuro: "dias na fase" é uma contagem, e
    // contagem negativa é a maneira mais barata de perder a confiança na coluna.
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

    // Lead da faixa de nutrição não tem dono: é exatamente a aba "sem proprietário".
    const proprietario =
      resultado && resultado.faixa !== 'Nutrição' && sorteio(0.82) ? escolher(users) : null;

    tierByContact.set(c.id, resultado?.faixa ?? null);

    linhasLead.push({
      id: leadId,
      tenantId,
      contatoId: c.id,
      accountId,
      origem,
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
        valor: resultado.value,
        faixa: resultado.faixa,
        explicacao: resultado.explanation,
        calculadoEm: new Date(criadoEm.getTime() + 1000 * entire(60, 3600)),
      });
    }

    /* ------------------------------------------------ respostas de formulário */

    // Lead antigo respondeu a versão 1 do diagnóstico; lead recente, a versão 2.
    const usaV2 = criadoEm.getTime() > agora.getTime() - dias(30);
    const versaoDiag = usaV2 ? versions[1]! : versions[0]!;
    const perguntasDiag = perguntasByVersion.get(versaoDiag.id) ?? [];

    const respondidoEm = new Date(criadoEm.getTime() + 1000 * entire(30, 900));
    // Diagnóstico incompleto responde só as duas primeiras — e a regra dos 18 pontos
    // não casa. É o que faz a explicação do score contar uma história verdadeira.
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
      const perguntasPlano = perguntasByVersion.get(versaoPlano.id) ?? [];
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
      linhasContactTag.push({
        tenantId,
        contatoId: c.id,
        etiquetaId: idDe('etiqueta:Alto ticket'),
        em: criadoEm,
      });
    }
    if (diagnosticoCompleto) {
      linhasContactTag.push({
        tenantId,
        contatoId: c.id,
        etiquetaId: idDe('etiqueta:Perfil investidor'),
        em: criadoEm,
      });
    }
    if (!pontuado) {
      linhasContactTag.push({
        tenantId,
        contatoId: c.id,
        etiquetaId: idDe('etiqueta:Frio'),
        em: criadoEm,
      });
    }

    /* --------------------------------------------------------- atividades */

    linhasActivity.push({
      id: idDe(`atividade:${c.id}:formulario`),
      tenantId,
      tipo: 'nota',
      leadId,
      resumo: `Formulário respondido · Diagnóstico de investidor v${versaoDiag.versao}`,
      corpo: diagnosticoCompleto
        ? 'Respondeu o diagnóstico inteiro.'
        : 'Abandonou o diagnóstico na terceira pergunta.',
      ocorridaEm: respondidoEm,
      criadoEm: respondidoEm,
    });

    const quantasActivities = entire(1, 4);
    for (let i = 0; i < quantasActivities; i += 1) {
      const tipo = escolher(['ligacao', 'email', 'reuniao', 'nota', 'tarefa'] as const);
      const em = new Date(criadoEm.getTime() + dias(entre(0.2, 20)));
      if (em.getTime() > agora.getTime()) continue;
      linhasActivity.push({
        id: idDe(`atividade:${c.id}:${i}`),
        tenantId,
        tipo,
        leadId,
        usuarioId: proprietario?.id ?? escolher(users).id,
        resumo:
          tipo === 'ligacao'
            ? 'Ligação de qualificação'
            : tipo === 'email'
              ? 'E-mail com a apresentação do plano'
              : tipo === 'reuniao'
                ? 'Reunião de diagnóstico'
                : tipo === 'tarefa'
                  ? 'Retornar contato'
                  : 'Nota do vendedor',
        corpo: escolher(NOTAS),
        ocorridaEm: em,
        criadoEm: em,
      });
    }

    linhasActivity.push({
      id: idDe(`atividade:${c.id}:fase`),
      tenantId,
      tipo: 'mudanca_fase',
      leadId,
      usuarioId: proprietario?.id ?? null,
      resumo: `Fase alterada para ${fase}`,
      corpo: null,
      ocorridaEm: faseDesde,
      criadoEm: faseDesde,
    });

    /* ------------------------------------------------------ oportunidades */

    // Só lead acima do corte vira oportunidade, que é a regra do funil de hoje.
    // Vira oportunidade quem o comercial de fato trabalha: da faixa Comercial para
    // cima. Abaixo disso é nutrição, e nutrição não ocupa coluna do funil.
    if ((resultado?.value ?? 0) >= 45 && status !== 'desqualificado') {
      const value = escolher([4788, 7200, 9600, 12_400, 18_000, 24_000, 36_000, 48_000]);
      const abertaEm = new Date(criadoEm.getTime() + dias(entre(1, 6)));
      linhasOpportunity.push({
        id: idDe(`oportunidade:${c.id}:1`),
        tenantId,
        leadId,
        accountId,
        nome: c.nome ?? `Oportunidade ${indice + 1}`,
        valor: value.toFixed(2),
        moeda: 'BRL',
        fase,
        probabilidade: PROBABILITY[fase] ?? 10,
        fechamentoPrevisto: dataIso(new Date(agora.getTime() + dias(entire(5, 75)))),
        proprietarioId: proprietario?.id ?? escolher(users).id,
        criadoEm: new Date(Math.min(abertaEm.getTime(), agora.getTime())),
      });

      // Um punhado já fechou neste mês: sem elas o cartão "fechado no mês" fica em
      // zero e o painel não tem o que comparar.
      if (sorteio(0.28)) {
        const ganha = sorteio(0.7);
        const fechadaEm = new Date(agora.getTime() - dias(entre(0, 24)));
        linhasOpportunity.push({
          id: idDe(`oportunidade:${c.id}:2`),
          tenantId,
          leadId,
          accountId,
          nome: `${c.nome ?? 'Cliente'} · renovação`,
          valor: (value * 0.8).toFixed(2),
          moeda: 'BRL',
          fase: ganha ? 'Fechamento' : 'Proposta',
          probabilidade: ganha ? 100 : 0,
          fechadaEm,
          ganha,
          motivoPerda: ganha ? null : escolher(['Preço', 'Sem retorno', 'Escolheu concorrente']),
          proprietarioId: proprietario?.id ?? escolher(users).id,
          criadoEm: new Date(fechadaEm.getTime() - dias(entre(10, 40))),
        });
      }
    }
  }

  // Um `update` por conta, não um por contato: catorze consultas em vez de sessenta.
  for (const [accountId, ids] of contactsByAccount) {
    await db
      .update(contact)
      .set({ accountId })
      .where(and(eq(contact.tenantId, tenantId), inArray(contact.id, ids)));
  }

  await db.insert(lead).values(linhasLead);
  if (linhasScore.length > 0) await db.insert(scoreLead).values(linhasScore);
  if (linhasResposta.length > 0) await db.insert(respostaFormulario).values(linhasResposta);
  if (linhasActivity.length > 0) await db.insert(activity).values(linhasActivity);
  if (linhasOpportunity.length > 0) await db.insert(opportunity).values(linhasOpportunity);
  if (linhasContactTag.length > 0) {
    await db.insert(contactLabel).values(linhasContactTag).onConflictDoNothing();
  }

  /* ------------------------------------- resumo do atendimento na linha do tempo */

  /**
   * A promessa do produto é que o CRM se alimenta das conversas. Sem classificação,
   * a linha do tempo mostra "houve um atendimento" e nada mais. Estas linhas são
   * criadas com id próprio e `onConflictDoNothing`: se o worker de IA já classificou
   * a conversa, a dele fica.
   */
  const conversationsForResumir = await db
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
  for (const cv of conversationsForResumir) {
    // Uma conversa resumida por contato: o objetivo é a ficha, não o dataset da IA.
    if (vistos.has(cv.contatoId)) continue;
    vistos.add(cv.contatoId);
    linhasClassification.push({
      id: idDe(`classificacao:${cv.contatoId}`),
      tenantId,
      conversaId: cv.id,
      categoria: escolher(CATEGORIAS),
      resumo: escolher(SUMMARIES_ATTENDANCE),
      sentimento: escolher(['positivo', 'neutro', 'negativo'] as const),
      confianca: '0.8600',
      modelo: 'semente',
      criadaEm: cv.encerradaEm ?? agora,
    });
  }
  if (linhasClassification.length > 0) {
    await db.insert(classificationConversation).values(linhasClassification).onConflictDoNothing();
  }

  return {
    leads: linhasLead.length,
    comScore: linhasScore.length,
    respostas: linhasResposta.length,
    oportunidades: linhasOpportunity.length,
    atividades: linhasActivity.length,
    regras: REGRAS.length,
    contas: ACCOUNTS.length,
    resumos: linhasClassification.length,
  };
}

/** `AAAA-MM-DD` para a coluna `date` de `fechamento_previsto`. */
function dataIso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

type ValueResposta = {
  valueText?: string;
  valueNum?: string;
  valueBool?: boolean;
  valueData?: Date;
};

function respostaDiagnostico(
  codigo: string,
  perfil: { patrimonio: number; age: number },
): ValueResposta | null {
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
