import 'dotenv/config';
import { createHash } from 'node:crypto';
import { and, eq, inArray, isNotNull, sql } from 'drizzle-orm';
import { calcularScore, type Expressao, type FaixaScore, type RegraScore } from '@pipe/core';
import { criarBanco, fecharBanco, type BancoPipe } from '@pipe/db';
import {
  atividade,
  classificacaoConversa,
  contato,
  contatoEtiqueta,
  conversa,
  etiqueta,
  faixaScore,
  fila,
  formulario,
  formularioPergunta,
  formularioVersao,
  lead,
  oportunidade,
  regraScore,
  respostaFormulario,
  scoreLead,
  tenant,
  usuario,
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
function aleatorio(semente: number): () => number {
  let estado = semente >>> 0;
  return () => {
    estado = (estado + 0x6d2b79f5) >>> 0;
    let t = estado;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rnd = aleatorio(20260905);
const entre = (min: number, max: number) => min + rnd() * (max - min);
const inteiro = (min: number, max: number) => Math.floor(entre(min, max + 1));
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

const FASES = ['Novo', 'Qualificado', 'Reunião', 'Proposta', 'Fechamento'] as const;
const PROBABILIDADE: Record<string, number> = {
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
const REGRAS: { nome: string; pontos: number; condicao: Expressao }[] = [
  {
    nome: 'Patrimônio acima de R$ 500 mil',
    pontos: 30,
    condicao: { campo: 'patrimonio', operador: 'maior_igual', valor: 500_000 },
  },
  {
    nome: 'Patrimônio entre R$ 250 e 500 mil',
    pontos: 22,
    condicao: {
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
    condicao: { campo: 'diagnostico_completo', operador: 'igual', valor: true },
  },
  {
    nome: 'Indicação de cliente',
    pontos: 14,
    condicao: { campo: 'origem', operador: 'igual', valor: 'Indicação' },
  },
  {
    nome: 'Interesse declarado em plano anual',
    pontos: 12,
    condicao: { campo: 'interesse_plano', operador: 'igual', valor: 'anual' },
  },
  {
    nome: 'Origem: anúncio pago',
    pontos: 10,
    condicao: {
      campo: 'origem',
      operador: 'em',
      valor: ['Anúncio Meta', 'Anúncio Google'],
    },
  },
  {
    nome: 'Faixa etária 35–50',
    pontos: 8,
    condicao: {
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
    condicao: { campo: 'whatsapp_confirmado', operador: 'igual', valor: true },
  },
  {
    nome: 'Sem resposta na campanha de julho',
    pontos: -6,
    condicao: { campo: 'respondeu_campanha_julho', operador: 'igual', valor: false },
  },
  {
    nome: 'Importado sem origem definida',
    pontos: -4,
    condicao: { campo: 'origem', operador: 'igual', valor: 'Importado RD' },
  },
];

const FAIXAS: { nome: string; minimo: number; maximo: number; fila: string | null; estrategia: string }[] =
  [
    { nome: 'Nutrição', minimo: 0, maximo: 39, fila: null, estrategia: 'nenhuma' },
    { nome: 'Comercial', minimo: 40, maximo: 59, fila: 'Comercial', estrategia: 'rodizio' },
    { nome: 'Closer', minimo: 60, maximo: 100, fila: 'Closer', estrategia: 'menor_carga' },
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

const RESUMOS_ATENDIMENTO = [
  'Cliente perguntou sobre taxa de administração e prazo de resgate. Atendente explicou as duas coisas e enviou a lâmina. Ficou de responder até sexta.',
  'Pedido de simulação para aporte de R$ 30 mil. Atendente registrou o pedido e prometeu retorno em 24h.',
  'Reclamação sobre demora no cadastro. Atendente checou com o back-office e informou o novo prazo. Cliente aceitou.',
  'Cliente queria cancelar; ao entender a carência, decidiu manter e pediu revisão da carteira.',
  'Dúvida sobre a portabilidade de previdência. Atendente enviou o passo a passo e agendou uma call.',
] as const;

const CATEGORIAS = ['Dúvida de produto', 'Cadastro', 'Financeiro', 'Retenção', 'Suporte'] as const;

/* ------------------------------------------------------------------- semente */

async function semearCrm(db: BancoPipe) {
  const [tenantLinha] = await db.select({ id: tenant.id }).from(tenant).where(eq(tenant.slug, 'demo'));
  if (!tenantLinha) throw new Error('tenant "demo" não existe: rode `pnpm banco:semear` antes.');
  const tenantId = tenantLinha.id;

  const usuarios = await db
    .select({ id: usuario.id, nome: usuario.nome })
    .from(usuario)
    .where(and(eq(usuario.tenantId, tenantId), eq(usuario.ativo, true)))
    .orderBy(usuario.nome);
  if (usuarios.length === 0) throw new Error('nenhum usuário no tenant demo.');

  const filas = await db
    .select({ id: fila.id, nome: fila.nome })
    .from(fila)
    .where(eq(fila.tenantId, tenantId));
  const filaPorNome = new Map(filas.map((f) => [f.nome, f.id]));

  /**
   * Contatos que já conversaram vêm primeiro: é o que faz a linha do tempo do lead
   * mostrar atendimento de verdade em vez de uma lista de notas inventadas.
   */
  const comConversa = await db
    .selectDistinct({ id: contato.id, nome: contato.nome })
    .from(contato)
    .innerJoin(conversa, eq(conversa.contatoId, contato.id))
    .where(and(eq(contato.tenantId, tenantId), isNotNull(contato.nome)))
    .orderBy(contato.nome)
    .limit(60);

  if (comConversa.length < 10) {
    throw new Error(
      'poucos contatos com conversa no tenant demo: rode `pnpm --filter @pipe/gestao seed:gestao` antes.',
    );
  }

  const agora = new Date();

  /* ---------------------------------------------------- limpeza do que é meu */

  const idsLead = comConversa.map((c) => idDe(`lead:${c.id}`));
  const idsOportunidade = comConversa.flatMap((c) => [
    idDe(`oportunidade:${c.id}:1`),
    idDe(`oportunidade:${c.id}:2`),
  ]);
  const idsFormulario = [idDe('formulario:diagnostico'), idDe('formulario:plano')];
  const idsRegra = REGRAS.map((r) => idDe(`regra:${VERSAO_REGRA}:${r.nome}`));
  const idsFaixa = FAIXAS.map((f) => idDe(`faixa:${VERSAO_REGRA}:${f.nome}`));
  const idsEtiqueta = ETIQUETAS_CRM.map((e) => idDe(`etiqueta:${e.nome}`));
  const idsClassificacao = comConversa.map((c) => idDe(`classificacao:${c.id}`));

  // Ordem: oportunidade e lead antes do formulário, senão a resposta segura a versão.
  await db.delete(oportunidade).where(inArray(oportunidade.id, idsOportunidade));
  await db.delete(lead).where(inArray(lead.id, idsLead));
  await db.delete(formulario).where(inArray(formulario.id, idsFormulario));
  await db.delete(regraScore).where(inArray(regraScore.id, idsRegra));
  await db.delete(faixaScore).where(inArray(faixaScore.id, idsFaixa));
  await db.delete(etiqueta).where(inArray(etiqueta.id, idsEtiqueta));
  await db.delete(classificacaoConversa).where(inArray(classificacaoConversa.id, idsClassificacao));

  /* ------------------------------------------------- regras, faixas, etiquetas */

  await db.insert(regraScore).values(
    REGRAS.map((r) => ({
      id: idDe(`regra:${VERSAO_REGRA}:${r.nome}`),
      tenantId,
      versao: VERSAO_REGRA,
      nome: r.nome,
      condicao: r.condicao,
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
      filaId: f.fila ? (filaPorNome.get(f.fila) ?? null) : null,
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

  const versoes = [
    { id: idDe('versao:diagnostico:1'), formularioId: idDiagnostico, versao: 1, dias: 120 },
    { id: idDe('versao:diagnostico:2'), formularioId: idDiagnostico, versao: 2, dias: 30 },
    { id: idDe('versao:plano:1'), formularioId: idPlano, versao: 1, dias: 90 },
  ];

  await db.insert(formularioVersao).values(
    versoes.map((v) => ({
      id: v.id,
      tenantId,
      formularioId: v.formularioId,
      versao: v.versao,
      publicadaEm: new Date(agora.getTime() - dias(v.dias)),
    })),
  );

  const perguntasPorVersao = new Map<string, { id: string; codigo: string; tipo: string }[]>();
  const linhasPergunta: (typeof formularioPergunta.$inferInsert)[] = [];

  function registrarPerguntas(
    versaoId: string,
    chave: string,
    lista: readonly { codigo: string; rotulo: string; tipo: string; opcoes: readonly string[]; obrigatoria: boolean }[],
  ) {
    const registradas: { id: string; codigo: string; tipo: string }[] = [];
    lista.forEach((p, i) => {
      const id = idDe(`pergunta:${chave}:${p.codigo}`);
      linhasPergunta.push({
        id,
        tenantId,
        versaoId,
        codigo: p.codigo,
        rotulo: p.rotulo,
        tipo: p.tipo,
        opcoes: [...p.opcoes],
        ordem: i + 1,
        obrigatoria: p.obrigatoria,
      });
      registradas.push({ id, codigo: p.codigo, tipo: p.tipo });
    });
    perguntasPorVersao.set(versaoId, registradas);
  }

  registrarPerguntas(versoes[0]!.id, 'diag1', PERGUNTAS_DIAGNOSTICO);
  registrarPerguntas(versoes[1]!.id, 'diag2', PERGUNTAS_DIAGNOSTICO_V2);
  registrarPerguntas(versoes[2]!.id, 'plano1', PERGUNTAS_PLANO);

  await db.insert(formularioPergunta).values(linhasPergunta);

  /* --------------------------------------------------------------------- leads */

  const regrasMotor: RegraScore[] = REGRAS.map((r) => ({
    id: idDe(`regra:${VERSAO_REGRA}:${r.nome}`),
    nome: r.nome,
    versao: VERSAO_REGRA,
    pontos: r.pontos,
    condicao: r.condicao,
    ativa: true,
  }));

  const linhasLead: (typeof lead.$inferInsert)[] = [];
  const linhasResposta: (typeof respostaFormulario.$inferInsert)[] = [];
  const linhasScore: (typeof scoreLead.$inferInsert)[] = [];
  const linhasAtividade: (typeof atividade.$inferInsert)[] = [];
  const linhasOportunidade: (typeof oportunidade.$inferInsert)[] = [];
  const linhasContatoEtiqueta: (typeof contatoEtiqueta.$inferInsert)[] = [];
  const linhasClassificacao: (typeof classificacaoConversa.$inferInsert)[] = [];

  const faixaPorContato = new Map<string, string | null>();

  for (const [indice, c] of comConversa.entries()) {
    const leadId = idDe(`lead:${c.id}`);
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
    const idade = inteiro(30, 58);
    const respondeuCampanhaJulho = sorteio(0.7);
    const whatsappConfirmado = sorteio(0.8);

    const dados = {
      origem,
      patrimonio,
      diagnostico_completo: diagnosticoCompleto,
      interesse_plano: interessePlano,
      idade,
      respondeu_campanha_julho: respondeuCampanhaJulho,
      whatsapp_confirmado: whatsappConfirmado,
    };

    // Nem todo lead é pontuado: o que não respondeu nada fica sem score, e a ficha
    // diz isso em vez de exibir zero — zero é um número, ausência de cálculo não é.
    const pontuado = diagnosticoCompleto || interessePlano !== null || sorteio(0.5);
    const resultado = pontuado
      ? calcularScore(regrasMotor, dados, {
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
    const acimaDoCorte = (resultado?.valor ?? 0) >= 60;

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
      resultado && resultado.faixa !== 'Nutrição' && sorteio(0.82) ? escolher(usuarios) : null;

    faixaPorContato.set(c.id, resultado?.faixa ?? null);

    linhasLead.push({
      id: leadId,
      tenantId,
      contatoId: c.id,
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
      scoreAtual: resultado?.valor ?? null,
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
        idade,
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
        valor: resultado.valor,
        faixa: resultado.faixa,
        explicacao: resultado.explicacao,
        calculadoEm: new Date(criadoEm.getTime() + 1000 * inteiro(60, 3600)),
      });
    }

    /* ------------------------------------------------ respostas de formulário */

    // Lead antigo respondeu a versão 1 do diagnóstico; lead recente, a versão 2.
    const usaV2 = criadoEm.getTime() > agora.getTime() - dias(30);
    const versaoDiag = usaV2 ? versoes[1]! : versoes[0]!;
    const perguntasDiag = perguntasPorVersao.get(versaoDiag.id) ?? [];

    const respondidoEm = new Date(criadoEm.getTime() + 1000 * inteiro(30, 900));
    // Diagnóstico incompleto responde só as duas primeiras — e a regra dos 18 pontos
    // não casa. É o que faz a explicação do score contar uma história verdadeira.
    const quantas = diagnosticoCompleto ? perguntasDiag.length : 2;

    for (const p of perguntasDiag.slice(0, quantas)) {
      const valor = respostaDiagnostico(p.codigo, { patrimonio, idade });
      if (valor === null) continue;
      linhasResposta.push({
        id: idDe(`resposta:${c.id}:${versaoDiag.id}:${p.codigo}`),
        tenantId,
        leadId,
        versaoId: versaoDiag.id,
        perguntaId: p.id,
        ...valor,
        criadoEm: respondidoEm,
      });
    }

    if (interessePlano) {
      const versaoPlano = versoes[2]!;
      const perguntasPlano = perguntasPorVersao.get(versaoPlano.id) ?? [];
      const emPlano = new Date(respondidoEm.getTime() + 1000 * inteiro(600, 86_400));
      for (const p of perguntasPlano) {
        const valor =
          p.codigo === 'plano'
            ? { valorTexto: interessePlano === 'anual' ? 'Anual' : 'Mensal' }
            : p.codigo === 'inicio_previsto'
              ? { valorData: new Date(agora.getTime() + dias(inteiro(7, 90))) }
              : { valorTexto: escolher(NOTAS) };
        linhasResposta.push({
          id: idDe(`resposta:${c.id}:${versaoPlano.id}:${p.codigo}`),
          tenantId,
          leadId,
          versaoId: versaoPlano.id,
          perguntaId: p.id,
          ...valor,
          criadoEm: emPlano,
        });
      }
    }

    /* ---------------------------------------------------------- etiquetas */

    if (patrimonio >= 500_000) {
      linhasContatoEtiqueta.push({
        tenantId,
        contatoId: c.id,
        etiquetaId: idDe('etiqueta:Alto ticket'),
        em: criadoEm,
      });
    }
    if (diagnosticoCompleto) {
      linhasContatoEtiqueta.push({
        tenantId,
        contatoId: c.id,
        etiquetaId: idDe('etiqueta:Perfil investidor'),
        em: criadoEm,
      });
    }
    if (!pontuado) {
      linhasContatoEtiqueta.push({
        tenantId,
        contatoId: c.id,
        etiquetaId: idDe('etiqueta:Frio'),
        em: criadoEm,
      });
    }

    /* --------------------------------------------------------- atividades */

    linhasAtividade.push({
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

    const quantasAtividades = inteiro(1, 4);
    for (let i = 0; i < quantasAtividades; i += 1) {
      const tipo = escolher(['ligacao', 'email', 'reuniao', 'nota', 'tarefa'] as const);
      const em = new Date(criadoEm.getTime() + dias(entre(0.2, 20)));
      if (em.getTime() > agora.getTime()) continue;
      linhasAtividade.push({
        id: idDe(`atividade:${c.id}:${i}`),
        tenantId,
        tipo,
        leadId,
        usuarioId: proprietario?.id ?? escolher(usuarios).id,
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

    linhasAtividade.push({
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
    if ((resultado?.valor ?? 0) >= 45 && status !== 'desqualificado') {
      const valor = escolher([4788, 7200, 9600, 12_400, 18_000, 24_000, 36_000, 48_000]);
      const abertaEm = new Date(criadoEm.getTime() + dias(entre(1, 6)));
      linhasOportunidade.push({
        id: idDe(`oportunidade:${c.id}:1`),
        tenantId,
        leadId,
        nome: c.nome ?? `Oportunidade ${indice + 1}`,
        valor: valor.toFixed(2),
        moeda: 'BRL',
        fase,
        probabilidade: PROBABILIDADE[fase] ?? 10,
        fechamentoPrevisto: dataIso(new Date(agora.getTime() + dias(inteiro(5, 75)))),
        proprietarioId: proprietario?.id ?? escolher(usuarios).id,
        criadoEm: new Date(Math.min(abertaEm.getTime(), agora.getTime())),
      });

      // Um punhado já fechou neste mês: sem elas o cartão "fechado no mês" fica em
      // zero e o painel não tem o que comparar.
      if (sorteio(0.28)) {
        const ganha = sorteio(0.7);
        const fechadaEm = new Date(agora.getTime() - dias(entre(0, 24)));
        linhasOportunidade.push({
          id: idDe(`oportunidade:${c.id}:2`),
          tenantId,
          leadId,
          nome: `${c.nome ?? 'Cliente'} · renovação`,
          valor: (valor * 0.8).toFixed(2),
          moeda: 'BRL',
          fase: ganha ? 'Fechamento' : 'Proposta',
          probabilidade: ganha ? 100 : 0,
          fechadaEm,
          ganha,
          motivoPerda: ganha ? null : escolher(['Preço', 'Sem retorno', 'Escolheu concorrente']),
          proprietarioId: proprietario?.id ?? escolher(usuarios).id,
          criadoEm: new Date(fechadaEm.getTime() - dias(entre(10, 40))),
        });
      }
    }
  }

  await db.insert(lead).values(linhasLead);
  if (linhasScore.length > 0) await db.insert(scoreLead).values(linhasScore);
  if (linhasResposta.length > 0) await db.insert(respostaFormulario).values(linhasResposta);
  if (linhasAtividade.length > 0) await db.insert(atividade).values(linhasAtividade);
  if (linhasOportunidade.length > 0) await db.insert(oportunidade).values(linhasOportunidade);
  if (linhasContatoEtiqueta.length > 0) {
    await db.insert(contatoEtiqueta).values(linhasContatoEtiqueta).onConflictDoNothing();
  }

  /* ------------------------------------- resumo do atendimento na linha do tempo */

  /**
   * A promessa do produto é que o CRM se alimenta das conversas. Sem classificação,
   * a linha do tempo mostra "houve um atendimento" e nada mais. Estas linhas são
   * criadas com id próprio e `onConflictDoNothing`: se o worker de IA já classificou
   * a conversa, a dele fica.
   */
  const conversasParaResumir = await db
    .select({ id: conversa.id, contatoId: conversa.contatoId, encerradaEm: conversa.encerradaEm })
    .from(conversa)
    .where(
      and(
        eq(conversa.tenantId, tenantId),
        inArray(
          conversa.contatoId,
          comConversa.map((c) => c.id),
        ),
        isNotNull(conversa.encerradaEm),
      ),
    )
    .orderBy(sql`${conversa.encerradaEm} desc`)
    .limit(60);

  const vistos = new Set<string>();
  for (const cv of conversasParaResumir) {
    // Uma conversa resumida por contato: o objetivo é a ficha, não o dataset da IA.
    if (vistos.has(cv.contatoId)) continue;
    vistos.add(cv.contatoId);
    linhasClassificacao.push({
      id: idDe(`classificacao:${cv.contatoId}`),
      tenantId,
      conversaId: cv.id,
      categoria: escolher(CATEGORIAS),
      resumo: escolher(RESUMOS_ATENDIMENTO),
      sentimento: escolher(['positivo', 'neutro', 'negativo'] as const),
      confianca: '0.8600',
      modelo: 'semente',
      criadaEm: cv.encerradaEm ?? agora,
    });
  }
  if (linhasClassificacao.length > 0) {
    await db.insert(classificacaoConversa).values(linhasClassificacao).onConflictDoNothing();
  }

  return {
    leads: linhasLead.length,
    comScore: linhasScore.length,
    respostas: linhasResposta.length,
    oportunidades: linhasOportunidade.length,
    atividades: linhasAtividade.length,
    regras: REGRAS.length,
    resumos: linhasClassificacao.length,
  };
}

/** `AAAA-MM-DD` para a coluna `date` de `fechamento_previsto`. */
function dataIso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

type ValorResposta = {
  valorTexto?: string;
  valorNum?: string;
  valorBool?: boolean;
  valorData?: Date;
};

function respostaDiagnostico(
  codigo: string,
  perfil: { patrimonio: number; idade: number },
): ValorResposta | null {
  switch (codigo) {
    case 'patrimonio_faixa':
      return {
        valorTexto:
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
        valorTexto: escolher([
          'Aposentadoria',
          'Renda passiva',
          'Reserva de emergência',
          'Crescer patrimônio',
        ]),
      };
    case 'ja_investe':
      return { valorBool: perfil.patrimonio >= 100_000 };
    case 'renda_mensal':
      return { valorNum: (Math.round(perfil.patrimonio / 40 / 500) * 500).toFixed(6) };
    case 'horizonte':
      return {
        valorTexto: escolher(['Menos de 2 anos', '2 a 5 anos', 'Mais de 5 anos']),
      };
    case 'perfil_risco':
      return { valorTexto: escolher(['Conservador', 'Moderado', 'Arrojado']) };
    case 'aporte_mensal':
      return { valorNum: (inteiro(2, 40) * 500).toFixed(6) };
    default:
      return null;
  }
}

const db = criarBanco({ maxConexoes: 4 });
semearCrm(db)
  .then((r) => {
    process.stdout.write(
      `semente do CRM: ${r.leads} leads (${r.comScore} com score explicado), ` +
        `${r.respostas} respostas de formulário, ${r.oportunidades} oportunidades, ` +
        `${r.atividades} atividades, ${r.regras} regras de score, ${r.resumos} resumos de atendimento\n`,
    );
  })
  .catch((erro: unknown) => {
    process.stderr.write(`falha ao semear o CRM: ${String(erro)}\n`);
    process.exitCode = 1;
  })
  .finally(() => fecharBanco(db));
