import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { criarBanco, fecharBanco, garantirParticoes, type BancoPipe } from '@pipe/db';
import {
  anexo,
  canal,
  contato,
  conversa,
  conversaEtiqueta,
  etiqueta,
  eventoAtendimento,
  fila,
  filaAtendente,
  inbox,
  mensagem,
  motivoPausa,
  pausa,
  papel,
  regraSla,
  respostaPronta,
  statusAtendente,
  templateMensagem,
  tenant,
  usuario,
  usuarioPapel,
} from '@pipe/db/schema';

/**
 * Semente do Pipe Gestão — volume suficiente para os números do monitoramento
 * ficarem realistas.
 *
 * **Não toca na semente de `packages/db`**: aquela cria tenant, papéis, permissões
 * e filas, e outro agente está mexendo nela. Esta roda depois e só acrescenta
 * operação: canal, atendentes, contatos, conversas, mensagens e eventos.
 *
 * Roda com o papel dono (`DATABASE_URL`), como toda semente, e é destrutiva do que
 * ela mesma cria: apaga a operação anterior do tenant antes de gerar de novo, para
 * rodar duas vezes não dobrar o volume.
 *
 * Uso: `pnpm --filter @pipe/gestao-vite seed:gestao`
 */

const DIAS_DE_HISTORICO = 7;
const NOME_DO_SLA = 'Primeira resposta em 5 minutos';
const CONVERSAS_POR_DIA = [95, 145] as const;
const ABERTAS_AGORA = 22;

/** Gerador determinístico: rodar duas vezes dá o mesmo painel. */
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
const sorteio = (probabilidade: number) => rnd() < probabilidade;

const ATENDENTES = [
  'Ana Ribeiro',
  'Caio Bastos',
  'Lívia Moura',
  'Rafael Nunes',
  'Bruna Vasques',
  'Otávio Prates',
  'Marina Cordeiro',
  'Thiago Sampaio',
] as const;

const NOMES = [
  'Marcelo Tavares',
  'Juliana Prado',
  'Renata Alencar',
  'Diego Matos',
  'Cássia Bernardes',
  'Paulo Sérgio Lima',
  'Fernanda Coelho',
  'Rodrigo Antunes',
  'Beatriz Salgado',
  'Henrique Vilela',
  'Priscila Nogueira',
  'Anderson Faria',
  'Camila Rezende',
  'Vinícius Braga',
  'Tatiane Muniz',
  'Eduardo Peixoto',
  'Larissa Fontes',
  'Gustavo Andrade',
  'Simone Barreto',
  'Leandro Quirino',
] as const;

const ETIQUETAS = [
  { nome: 'Segunda via', cor: '#4A5D23' },
  { nome: 'Reclamação', cor: '#C4442E' },
  { nome: 'Dúvida de produto', cor: '#2E4A5D' },
  { nome: 'Cancelamento', cor: '#9A7420' },
  { nome: 'Elogio', cor: '#8A9A5B' },
] as const;

const MOTIVOS_PAUSA = [
  { nome: 'Almoço', duracaoSugeridaMin: 60 },
  { nome: 'Café', duracaoSugeridaMin: 15 },
  { nome: 'Reunião', duracaoSugeridaMin: 45 },
  { nome: 'Banheiro', duracaoSugeridaMin: 10 },
] as const;

const FRASES_CLIENTE = [
  'Oi, bom dia. Não consegui gerar o boleto deste mês pelo aplicativo, dá um erro na hora de confirmar.',
  'Boa tarde! Queria entender por que a cobrança veio diferente do combinado na contratação.',
  'Olá, preciso da segunda via da fatura de agosto para pagar hoje ainda, consegue me mandar?',
  'Fiz o pedido semana passada e até agora não recebi o código de rastreio, podem verificar?',
  'Estou tentando trocar o titular da conta e o site não deixa concluir, o que eu faço?',
  'Preciso cancelar o serviço a partir do mês que vem, qual é o procedimento e tem multa?',
] as const;

const FRASES_ATENDENTE = [
  'Bom dia! Sou a equipe de atendimento, já estou verificando aqui o seu cadastro, um instante por favor.',
  'Entendi a situação. Localizei o seu contrato e vou emitir a segunda via agora mesmo para você.',
  'Obrigado por aguardar. O erro acontecia por causa do vencimento antigo, já corrigi e liberei a emissão.',
  'Consegui identificar o pedido aqui. Ele saiu do centro de distribuição ontem e chega até quinta-feira.',
  'Vou registrar a solicitação e te retorno ainda hoje com a confirmação por aqui mesmo, pode ser?',
] as const;

const RESPOSTAS_PRONTAS = [
  {
    atalho: '/ola',
    titulo: 'Saudação',
    corpo: 'Olá! Meu nome é {{atendente}} e vou te ajudar com o seu atendimento hoje.',
  },
  {
    atalho: '/aguarde',
    titulo: 'Pedido de espera',
    corpo: 'Só um instante, por favor, estou verificando essa informação no sistema para você.',
  },
  {
    atalho: '/protocolo',
    titulo: 'Protocolo',
    corpo: 'Registrei o seu atendimento sob o protocolo {{protocolo}}. Guarde esse número, por favor.',
  },
  {
    atalho: '/encerrar',
    titulo: 'Encerramento',
    corpo: 'Posso ajudar em mais alguma coisa? Se não, agradeço o contato e finalizo por aqui. Bom dia!',
  },
] as const;

type Linha = Record<string, unknown>;

/** Insere em lotes: um `insert` com dez mil linhas estoura o limite de parâmetros. */
async function inserirEmLotes(
  db: BancoPipe,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tabela: any,
  linhas: readonly Linha[],
  tamanho = 400,
): Promise<void> {
  for (let i = 0; i < linhas.length; i += tamanho) {
    await db.insert(tabela).values(linhas.slice(i, i + tamanho));
  }
}

function diaBase(referencia: Date, diasAtras: number): Date {
  const d = new Date(referencia);
  d.setDate(d.getDate() - diasAtras);
  d.setHours(0, 0, 0, 0);
  return d;
}

function horaDoDia(dia: Date, horaDecimal: number): Date {
  return new Date(dia.getTime() + horaDecimal * 3600 * 1000);
}

const mais = (instante: Date, segundos: number) => new Date(instante.getTime() + segundos * 1000);

interface Semeado {
  conversas: number;
  mensagens: number;
  eventos: number;
  contatos: number;
  atendentes: number;
}

export async function semearGestao(db: BancoPipe, slug = 'demo'): Promise<Semeado> {
  const [registro] = await db.select().from(tenant).where(eq(tenant.slug, slug)).limit(1);
  if (!registro) {
    throw new Error(`tenant "${slug}" não existe. Rode antes: pnpm banco:semear`);
  }
  const tenantId = registro.id;

  const agora = new Date();
  // Partições dos meses que a semente vai tocar (o histórico atravessa a virada do mês).
  await garantirParticoes(db, 2, diaBase(agora, DIAS_DE_HISTORICO));

  // ---- limpeza do que esta semente cria ---------------------------------
  // SÓ o que ela cria, reconhecido pela marca de cada coisa. Antes apagava o tenant
  // inteiro — inclusive TODOS os usuários, o que derrubava a sessão de quem estava
  // logado, e os canais e fluxos de verdade. Nada fora destas marcas é tocado.
  const DA_SEMENTE = '%@demo.pipe.app';
  // O canal fictício: com a marca, ou, de rodadas antigas sem ela, sem número nenhum.
  const canaisDaSemente = sql`
    select id from canal where tenant_id = ${tenantId}::uuid
       and (config->>'semente' = 'gestao'
            or (nome = 'WhatsApp oficial' and numero_id is null and waba_id is null))`;
  const conversasDaSemente = sql`
    select c.id from conversa c join inbox ib on ib.id = c.inbox_id
     where ib.canal_id in (${canaisDaSemente})`;
  await db.execute(sql`delete from evento_atendimento where conversa_id in (${conversasDaSemente})`);
  await db.execute(sql`delete from mensagem where conversa_id in (${conversasDaSemente})`);
  await db.execute(sql`delete from conversa where id in (${conversasDaSemente})`);
  // Modelos e caixas saem em cascata com o canal.
  await db.execute(sql`delete from canal where id in (${canaisDaSemente})`);
  await db.execute(
    sql`delete from contato where tenant_id = ${tenantId}::uuid and email like 'contato%@exemplo.com.br'`,
  );
  const usuariosDaSemente = sql`
    select id from usuario where tenant_id = ${tenantId}::uuid and email like ${DA_SEMENTE}`;
  await db.execute(sql`delete from pausa where usuario_id in (${usuariosDaSemente})`);
  await db.execute(sql`delete from status_atendente where usuario_id in (${usuariosDaSemente})`);
  await db.execute(sql`delete from fila_atendente where usuario_id in (${usuariosDaSemente})`);
  // Os usuários NÃO saem: são reaproveitados pelo e-mail mais abaixo.
  await db.delete(motivoPausa).where(
    and(eq(motivoPausa.tenantId, tenantId), inArray(motivoPausa.nome, MOTIVOS_PAUSA.map((m) => m.nome))),
  );
  await db.delete(etiqueta).where(
    and(eq(etiqueta.tenantId, tenantId), inArray(etiqueta.nome, ETIQUETAS.map((e) => e.nome))),
  );
  await db.delete(respostaPronta).where(
    and(eq(respostaPronta.tenantId, tenantId), inArray(respostaPronta.atalho, RESPOSTAS_PRONTAS.map((r) => r.atalho))),
  );
  await db.delete(regraSla).where(and(eq(regraSla.tenantId, tenantId), eq(regraSla.nome, NOME_DO_SLA)));
  await db.execute(
    sql`delete from anexo where tenant_id = ${tenantId}::uuid and chave_storage like 'demo/%'`,
  );

  // ---- canal, inbox e filas ---------------------------------------------
  const filas = await db.select().from(fila).where(eq(fila.tenantId, tenantId));
  if (filas.length === 0) throw new Error('nenhuma fila: rode antes `pnpm banco:semear`');

  const canalId = randomUUID();
  await db.insert(canal).values({
    id: canalId,
    tenantId,
    tipo: 'whatsapp_cloud',
    nome: 'WhatsApp oficial',
    config: { semente: 'gestao' },
  });
  const inboxId = randomUUID();
  await db.insert(inbox).values({
    id: inboxId,
    tenantId,
    canalId,
    nome: 'Atendimento WhatsApp',
    filaPadraoId: filas[0]?.id ?? null,
  });

  // ---- atendentes --------------------------------------------------------
  const [papelAtendente] = await db
    .select()
    .from(papel)
    .where(and(eq(papel.tenantId, tenantId), eq(papel.nome, 'atendente')))
    .limit(1);

  // Quem já existe fica com o MESMO id: a entrada de desenvolvimento (`/v1/auth/dev`)
  // loga como ana.ribeiro@demo.pipe.app, e recriar o usuário derrubava a sessão dela
  // e os papéis que alguém tivesse dado.
  const existentes = new Map(
    (
      await db
        .select({ id: usuario.id, email: usuario.email })
        .from(usuario)
        .where(and(eq(usuario.tenantId, tenantId), sql`${usuario.email} like ${DA_SEMENTE}`))
    ).map((u) => [u.email, u.id]),
  );
  const atendentes = ATENDENTES.map((nome, i) => {
    const email = `${nome.toLowerCase().normalize('NFD').replace(/[^a-z ]/g, '').trim().replace(/ +/g, '.')}@demo.pipe.app`;
    return {
      id: existentes.get(email) ?? randomUUID(),
      novo: !existentes.has(email),
      nome,
      email,
      // Os dois últimos ficam offline: fila sem gente é informação, não erro.
      estado: i < 5 ? 'online' : i < 7 ? 'pausa' : 'invisivel',
    };
  });

  const novos = atendentes.filter((a) => a.novo);
  if (novos.length > 0) {
    await db
      .insert(usuario)
      .values(novos.map((a) => ({ id: a.id, tenantId, nome: a.nome, email: a.email, ativo: true })));
  }
  if (papelAtendente) {
    await db
      .insert(usuarioPapel)
      .values(atendentes.map((a) => ({ tenantId, usuarioId: a.id, papelId: papelAtendente.id })))
      .onConflictDoNothing();
  }
  await db.insert(statusAtendente).values(
    atendentes.map((a) => ({
      usuarioId: a.id,
      tenantId,
      estado: a.estado,
      desde: mais(agora, -inteiro(600, 20000)),
      conectadoEm: mais(agora, -inteiro(600, 30000)),
    })),
  );
  await db.insert(filaAtendente).values(
    atendentes.flatMap((a, i) =>
      // Cada atendente cobre duas filas; a rotação garante que toda fila tenha gente.
      [filas[i % filas.length], filas[(i + 1) % filas.length]]
        .filter((f): f is (typeof filas)[number] => !!f)
        .map((f) => ({ tenantId, filaId: f.id, usuarioId: a.id, capacidadeOverride: null })),
    ),
  );

  // ---- motivos de pausa e pausas abertas ---------------------------------
  const motivos = MOTIVOS_PAUSA.map((m) => ({ id: randomUUID(), tenantId, ...m }));
  await db.insert(motivoPausa).values(motivos);

  const emPausa = atendentes.filter((a) => a.estado === 'pausa');
  await db.insert(pausa).values(
    emPausa.map((a, i) => {
      const motivo = motivos[i % motivos.length];
      // O primeiro estoura a duração sugerida de propósito: é o que o cartão conta.
      const minutos = i === 0 ? (motivo?.duracaoSugeridaMin ?? 15) + 22 : 7;
      return {
        tenantId,
        usuarioId: a.id,
        motivoId: motivo?.id ?? null,
        iniciadaEm: mais(agora, -minutos * 60),
        encerradaEm: null,
      };
    }),
  );

  // ---- etiquetas, respostas prontas, templates e anexos -------------------
  const etiquetas = ETIQUETAS.map((e) => ({ id: randomUUID(), tenantId, ...e }));
  await db.insert(etiqueta).values(etiquetas);

  const prontas = RESPOSTAS_PRONTAS.map((r) => ({ id: randomUUID(), tenantId, ...r }));
  await db.insert(respostaPronta).values(prontas);

  const templates = [
    { nome: 'retorno_atendimento', categoria: 'utilidade' as const },
    { nome: 'pesquisa_satisfacao', categoria: 'utilidade' as const },
  ].map((t) => ({
    id: randomUUID(),
    tenantId,
    canalId,
    nome: t.nome,
    categoria: t.categoria,
    statusMeta: 'aprovado',
    corpo: 'Olá {{1}}, aqui é da central de atendimento. Podemos continuar o seu atendimento?',
  }));
  await db.insert(templateMensagem).values(templates);

  // Áudios de referência: dão à régua de esforço o que ouvir e o que falar.
  const audios = [12, 31, 47, 68, 95].map((segundos) => ({
    id: randomUUID(),
    tenantId,
    chaveStorage: `demo/audio-${segundos}s.ogg`,
    mime: 'audio/ogg',
    bytes: segundos * 2000,
    duracaoSeg: segundos,
  }));
  await db.insert(anexo).values(audios);

  // ---- regra de SLA ------------------------------------------------------
  await db.insert(regraSla).values({
    tenantId,
    nome: NOME_DO_SLA,
    alvo: 'primeira_resposta',
    prazoSeg: 300,
    alertaSeg: 180,
    escopoTipo: 'tenant',
    acaoAlerta: { tipo: 'notificar_supervisor' },
    acaoEstouro: { tipo: 'elevar_prioridade' },
  });

  // ---- contatos ----------------------------------------------------------
  const contatos = Array.from({ length: 260 }, (_, i) => ({
    id: randomUUID(),
    tenantId,
    nome: `${escolher(NOMES).split(' ')[0]} ${escolher(NOMES).split(' ').slice(-1)[0]}`,
    telefoneE164: `+5511${String(900000000 + i).slice(0, 9)}`,
    email: `contato${i}@exemplo.com.br`,
  }));
  await inserirEmLotes(db, contato, contatos);

  // ---- conversas, eventos e mensagens ------------------------------------
  const linhasConversa: Linha[] = [];
  const linhasEvento: Linha[] = [];
  const linhasMensagem: Linha[] = [];
  const linhasEtiqueta: Linha[] = [];

  const online = atendentes.filter((a) => a.estado !== 'invisivel');

  function evento(
    conversaId: string,
    tipo: string,
    em: Date,
    extra: { usuarioId?: string | null; filaId?: string | null; dados?: Linha } = {},
  ) {
    linhasEvento.push({
      tenantId,
      conversaId,
      tipo,
      em,
      usuarioId: extra.usuarioId ?? null,
      filaId: extra.filaId ?? null,
      dados: extra.dados ?? {},
    });
  }

  function mensagemDe(
    conversaId: string,
    em: Date,
    quem: 'contato' | 'atendente',
    usuarioId: string | null,
    opcoes: { audio?: boolean; pronta?: string; template?: string } = {},
  ) {
    const audioId = opcoes.audio ? escolher(audios).id : null;
    const base = {
      tenantId,
      conversaId,
      direcao: quem === 'contato' ? 'entrada' : 'saida',
      autorTipo: quem,
      autorId: usuarioId,
      criadaEm: em,
      anexoId: audioId,
    };
    if (audioId) {
      linhasMensagem.push({ ...base, tipo: 'audio', conteudo: null });
      return;
    }
    if (opcoes.template) {
      linhasMensagem.push({
        ...base,
        tipo: 'template',
        templateId: opcoes.template,
        conteudo: templates[0]?.corpo ?? 'mensagem de template',
      });
      return;
    }
    linhasMensagem.push({
      ...base,
      tipo: 'texto',
      conteudo: quem === 'contato' ? escolher(FRASES_CLIENTE) : escolher(FRASES_ATENDENTE),
      respostaProntaId: opcoes.pronta ?? null,
    });
  }

  /**
   * Uma conversa completa: linha da `conversa`, seus eventos e suas mensagens.
   * `aberta` deixa a conversa sem `encerrada_em` — é a população dos cartões de
   * tempo real.
   */
  function gerarConversa(criadaEm: Date, aberta: boolean) {
    const conversaId = randomUUID();
    const filaEscolhida = escolher(filas);
    const contatoEscolhido = escolher(contatos);
    // Conversa aberta agora só cai em quem está online: é a regra de elegibilidade.
    const atendente = escolher(aberta ? online.filter((a) => a.estado === 'online') : online);
    // Nenhum marco pode cair no futuro: evento que ainda não aconteceu vira tempo
    // negativo na tela e conversa "encerrada" depois de agora no histórico.
    const passou = (instante: Date) => instante.getTime() <= agora.getTime();

    evento(conversaId, 'criada', criadaEm, { filaId: filaEscolhida.id });
    evento(conversaId, 'enfileirada', criadaEm, { filaId: filaEscolhida.id });
    mensagemDe(conversaId, criadaEm, 'contato', null);
    evento(conversaId, 'mensagem_entrada', criadaEm);

    // 8% nunca chega a ser atribuída — é a população das "perdidas".
    const seraAtribuida = !sorteio(0.08);
    const esperaFila = entre(15, seraAtribuida ? 900 : 1800);
    const candidataAtribuicao = seraAtribuida ? mais(criadaEm, esperaFila) : null;
    const atribuidaEm =
      candidataAtribuicao && passou(candidataAtribuicao) ? candidataAtribuicao : null;

    if (atribuidaEm) {
      evento(conversaId, 'atribuida', atribuidaEm, {
        usuarioId: atendente.id,
        filaId: filaEscolhida.id,
      });
    }

    // 9% das atribuídas nunca recebem resposta — é o denominador que a spec exige exibir.
    const seraRespondida = !!atribuidaEm && !sorteio(0.09);
    const candidataResposta = seraRespondida ? mais(atribuidaEm as Date, entre(20, 620)) : null;
    const primeiraRespostaEm =
      candidataResposta && passou(candidataResposta) ? candidataResposta : null;

    let ultimo = primeiraRespostaEm ?? atribuidaEm ?? criadaEm;
    // Quem falou por último decide de quem é a bola — e a bola é o peso da carga.
    let ultimoAutor: 'contato' | 'atendente' = primeiraRespostaEm ? 'atendente' : 'contato';
    if (primeiraRespostaEm) {
      evento(conversaId, 'primeira_resposta', primeiraRespostaEm, { usuarioId: atendente.id });
      mensagemDe(conversaId, primeiraRespostaEm, 'atendente', atendente.id, {
        pronta: sorteio(0.35) ? escolher(prontas).id : undefined,
      });

      // Trocas completas: é o que sustenta o "tempo de resposta".
      for (let t = 0; t < inteiro(3, 9); t += 1) {
        const doCliente = mais(ultimo, entre(30, 400));
        if (!passou(doCliente)) break;
        mensagemDe(conversaId, doCliente, 'contato', null, { audio: sorteio(0.12) });
        evento(conversaId, 'mensagem_entrada', doCliente);

        const doAtendente = mais(doCliente, entre(25, 420));
        if (!passou(doAtendente)) {
          ultimo = doCliente;
          ultimoAutor = 'contato';
          break;
        }
        mensagemDe(conversaId, doAtendente, 'atendente', atendente.id, {
          audio: sorteio(0.08),
          pronta: sorteio(0.2) ? escolher(prontas).id : undefined,
          template: sorteio(0.05) ? templates[0]?.id : undefined,
        });
        evento(conversaId, 'mensagem_saida', doAtendente, { usuarioId: atendente.id });
        ultimo = doAtendente;
        ultimoAutor = 'atendente';
      }
    }

    if (aberta) {
      linhasConversa.push({
        id: conversaId,
        tenantId,
        inboxId,
        contatoId: contatoEscolhido.id,
        filaId: filaEscolhida.id,
        atendenteId: atribuidaEm ? atendente.id : null,
        estado: atribuidaEm ? (primeiraRespostaEm ? 'em_atendimento' : 'atribuida') : 'na_fila',
        /* A maioria nasce SEM prioridade, que é o padrão da coluna; só uma minoria
           recebe um degrau, e é isso que faz a fila de espera ter o que ordenar. */
        prioridade: sorteio(0.05)
          ? 'maxima'
          : sorteio(0.15)
            ? 'alta'
            : sorteio(0.2)
              ? 'media'
              : sorteio(0.2)
                ? 'baixa'
                : 'sem_prioridade',
        criadaEm,
        atribuidaEm,
        primeiraRespostaEm,
        ultimaMensagemEm: ultimo,
        ultimaMensagemDe: ultimoAutor,
      });
    } else {
      const encerradaEm = new Date(
        Math.min(mais(ultimo, entre(60, 1500)).getTime(), agora.getTime()),
      );
      // Perdida x abandonada x finalizada — §4 da spec de métricas.
      const encerradaPor = !atribuidaEm
        ? 'cliente'
        : !primeiraRespostaEm
          ? escolher(['cliente', 'inatividade'] as const)
          : sorteio(0.06)
            ? 'inatividade'
            : 'atendente';
      evento(conversaId, 'encerrada', encerradaEm, {
        usuarioId: encerradaPor === 'atendente' ? atendente.id : null,
        dados: { encerrada_por: encerradaPor },
      });
      linhasConversa.push({
        id: conversaId,
        tenantId,
        inboxId,
        contatoId: contatoEscolhido.id,
        filaId: filaEscolhida.id,
        atendenteId: atribuidaEm ? atendente.id : null,
        estado: 'encerrada',
        prioridade: 'sem_prioridade',
        criadaEm,
        atribuidaEm,
        primeiraRespostaEm,
        encerradaEm,
        encerradaPor: encerradaPor === 'atendente' ? atendente.id : null,
        motivoEncerramento: encerradaPor,
        ultimaMensagemEm: ultimo,
        ultimaMensagemDe: encerradaPor === 'atendente' ? 'atendente' : 'contato',
      });
    }

    if (sorteio(0.55)) {
      linhasEtiqueta.push({
        tenantId,
        conversaId,
        etiquetaId: escolher(etiquetas).id,
      });
    }
  }

  for (let d = DIAS_DE_HISTORICO - 1; d >= 0; d -= 1) {
    const dia = diaBase(agora, d);
    const quantidade = inteiro(CONVERSAS_POR_DIA[0], CONVERSAS_POR_DIA[1]);
    for (let i = 0; i < quantidade; i += 1) {
      // Expediente de 8h às 19h, com a manhã mais cheia — é onde a fila estoura.
      const hora = sorteio(0.6) ? entre(8, 13) : entre(13, 19);
      const criadaEm = horaDoDia(dia, hora);
      // Conversa encerrada precisa de vida inteira no passado: as que começariam
      // agora ainda estariam abertas, e essas são geradas logo abaixo.
      if (criadaEm.getTime() > agora.getTime() - 45 * 60 * 1000) continue;
      gerarConversa(criadaEm, false);
    }
  }

  // As abertas de agora: chegaram nas últimas duas horas e ainda não encerraram.
  for (let i = 0; i < ABERTAS_AGORA; i += 1) {
    gerarConversa(mais(agora, -entre(60, 7200)), true);
  }

  await inserirEmLotes(db, conversa, linhasConversa, 200);
  await inserirEmLotes(db, eventoAtendimento, linhasEvento, 400);
  await inserirEmLotes(db, mensagem, linhasMensagem, 300);
  // Uma conversa pode sortear a mesma etiqueta duas vezes; a chave primária reclama.
  await inserirEmLotes(db, conversaEtiqueta, linhasEtiqueta, 400);

  return {
    conversas: linhasConversa.length,
    mensagens: linhasMensagem.length,
    eventos: linhasEvento.length,
    contatos: contatos.length,
    atendentes: atendentes.length,
  };
}

const db = criarBanco({ maxConexoes: 4 });
semearGestao(db)
  .then((r) => {
    process.stdout.write(
      `semente do gestão: ${r.conversas} conversas, ${r.eventos} eventos, ` +
        `${r.mensagens} mensagens, ${r.contatos} contatos, ${r.atendentes} atendentes\n`,
    );
  })
  .catch((erro: unknown) => {
    process.stderr.write(`falha ao semear o gestão: ${String(erro)}\n`);
    process.exitCode = 1;
  })
  .finally(() => fecharBanco(db));
