import { and, asc, eq, gte, inArray, isNull, isNotNull, lt, sql } from 'drizzle-orm';
import {
  cargaPonderada,
  pesoPrioridade,
  derivarMarcos,
  segundosEntre,
  type AtendenteDisponivel,
  type ContagemEncerramento,
  type ConversaEventos,
  type EncerradaPor,
  type EstadoAtendente,
  type EventoAtendimento,
  type Marcos,
  type ResultadoMetrica,
  type ResultadoTempoDeResposta,
  type TipoEvento,
} from '@pipe/core';
import {
  contato,
  conversa,
  conversaEtiqueta,
  etiqueta,
  eventoAtendimento,
  fila,
  filaAtendente,
  motivoPausa,
  pausa,
  statusAtendente,
  usuario,
} from '@pipe/db/schema';
import { registrarAuditoria, type TransacaoPipe } from '@pipe/db';
import { exigirPermissao } from '../../sessao.js';
import { ErroPipe } from '../../erros.js';
import {
  avaliarSlaDaConversa,
  carregarRegrasSla,
  type PillSla,
  type RegraSlaCarregada,
} from './sla.js';
import { carregarAtendimento, type LinhaDeQuebra } from './atendimento.js';

/** A transação já vem com o tenant fixado; `consultar` só nomeia o bloco, como na Gestão. */
const consultar = <T>(tx: TransacaoPipe, fn: (tx: TransacaoPipe) => Promise<T>): Promise<T> =>
  fn(tx);

/**
 * Consultas do monitoramento.
 *
 * Regra que atravessa o arquivo inteiro: **nenhuma conta é feita aqui**. O banco
 * entrega eventos, o `@pipe/core` calcula, esta camada só junta os dois e devolve
 * pronto para a tela. Toda métrica que vira número em tela vem de
 * `2026-09-05-metricas-atendimento.md`.
 *
 * ponytail: agregação por fila/atendente/etiqueta é feita em memória sobre o
 * conjunto do dia. Vira `group by` no Postgres (ou `metrica_diaria`) quando o
 * tenant passar de alguns milhares de conversas por dia.
 */

/** Só volta às partições que interessam: evento de conversa aberta não é antigo. */
const HORIZONTE_ABERTAS_DIAS = 30;

function inicioDoHorizonte(agora: Date): Date {
  return new Date(agora.getTime() - HORIZONTE_ABERTAS_DIAS * 24 * 3600 * 1000);
}

export interface LinhaConversaAberta {
  id: string;
  ticket: string;
  contatoNome: string;
  filaId: string | null;
  filaNome: string | null;
  atendenteId: string | null;
  atendenteNome: string | null;
  estado: string;
  prioridade: string;
  marcos: Marcos;
  /** Segundos na fila: fechado quando já foi atribuída, correndo quando não. */
  naFilaSeg: number | null;
  filaCorrendo: boolean;
  primeiraRespostaSeg: number | null;
  primeiraRespostaCorrendo: boolean;
  atendimentoSeg: number | null;
  emEspera: boolean;
  /** A bola está com o atendente: o cliente falou por último, ou ninguém respondeu ainda. */
  aguardandoAtendente: boolean;
  sla: PillSla;
  etiquetas: string[];
}

export interface CartoesTempoReal {
  naFila: number;
  maiorEsperaNaFilaSeg: number | null;
  /**
   * De quantas conversas o máximo acima saiu. Máximo sem população é a mesma
   * armadilha da média sem denominador (§2 da spec de métricas): "40 minutos"
   * entre duas conversas e entre duzentas pedem reações opostas.
   */
  aguardandoPrimeiraResposta: number;
  maiorEsperaPrimeiraRespostaSeg: number | null;
  emAtendimento: number;
  atendentesOnline: number;
  mediaPorAtendente: number | null;
}

export interface CartaoAtendentes {
  online: number;
  pausa: number;
  invisivel: number;
  offline: number;
  pausasEstouradas: number;
}

export interface CartoesDeHoje {
  esperaDoCliente: ResultadoMetrica;
  atePrimeiraResposta: ResultadoMetrica;
  tempoDeAtendimento: ResultadoMetrica;
  tempoDeResposta: ResultadoTempoDeResposta;
  encerramentos: ContagemEncerramento;
}

export interface CargaAtendente {
  id: string;
  nome: string;
  estado: EstadoAtendente;
  ativas: number;
  aguardandoAtendente: number;
  limite: number;
  carga: number;
  /** Carga máxima possível: o limite todo ocupado por conversa aguardando o atendente. */
  cargaMaxima: number;
  tempoMedioRespostaSeg: number | null;
  tempoMedioAtendimentoSeg: number | null;
}

export interface ResumoFila {
  id: string;
  nome: string;
  naFila: number;
  emAtendimento: number;
  maiorEsperaSeg: number | null;
  atendentesOnline: number;
  tempoMedioNaFilaSeg: number | null;
  tempoMedioRespostaSeg: number | null;
  tempoMedioAtendimentoSeg: number | null;
}

export interface ResumoEtiqueta {
  id: string;
  nome: string;
  cor: string | null;
  abertas: number;
  finalizadas: number;
  tempoMedioAtendimentoSeg: number | null;
}

export interface Monitoramento {
  agora: Date;
  fuso: string;
  tempoReal: CartoesTempoReal;
  atendentes: CartaoAtendentes;
  hoje: CartoesDeHoje;
  abertas: LinhaConversaAberta[];
  carga: CargaAtendente[];
  filas: ResumoFila[];
  etiquetas: ResumoEtiqueta[];
  ticketsAbertosPorHora: number[];
  /** Catálogo para os filtros rápidos. */
  listaAtendentes: { id: string; nome: string }[];
}

export interface PreviaDaConversaNoMonitoramento {
  id: string;
  ticket: string;
  contatoNome: string;
  filaNome: string | null;
  atendenteNome: string | null;
  itens: { id: string; em: Date | string; tipo: 'mensagem' | 'nota'; direcao?: string; texto: string; autor?: string | null }[];
}

/** A Gestão lê qualquer ticket do tenant; o Desk só lê o que está atribuído ao próprio atendente. */
export async function carregarPreviaDaConversa(
  tx: TransacaoPipe,
  usuarioId: string,
  conversaId: string,
): Promise<PreviaDaConversaNoMonitoramento | null> {
  await exigirPermissao(tx, usuarioId, 'monitoramento.tempo_real.ver');
  const { rows } = await tx.execute<{
    id: string; contato_nome: string | null; fila_nome: string | null; atendente_nome: string | null;
  }>(sql`
    select c.id, ct.nome as contato_nome, f.nome as fila_nome, u.nome as atendente_nome
      from conversa c
      join contato ct on ct.id = c.contato_id
      left join fila f on f.id = c.fila_id
      left join usuario u on u.id = c.atendente_id
     where c.id = ${conversaId}::uuid
     limit 1
  `);
  const conversaAberta = rows[0];
  if (!conversaAberta) return null;
  const itens = await tx.execute<{
    id: string; em: Date | string; tipo: 'mensagem' | 'nota'; direcao: string | null; texto: string; autor: string | null;
  }>(sql`
    select m.id, m.criada_em as em, 'mensagem'::text as tipo, m.direcao,
           coalesce(m.conteudo, '') as texto, u.nome as autor
      from mensagem m left join usuario u on u.id = m.autor_id
     where m.conversa_id = ${conversaId}::uuid
    union all
    select n.id, n.em, 'nota'::text as tipo, null, n.corpo, u.nome
      from nota_interna n left join usuario u on u.id = n.usuario_id
     where n.conversa_id = ${conversaId}::uuid
     order by em
  `);
  return {
    id: conversaAberta.id,
    ticket: ticketDe(conversaAberta.id),
    contatoNome: conversaAberta.contato_nome ?? 'Contato sem nome',
    filaNome: conversaAberta.fila_nome,
    atendenteNome: conversaAberta.atendente_nome,
    itens: itens.rows.map(({ direcao, ...item }) => ({ ...item, ...(direcao ? { direcao } : {}) })),
  };
}

/** Nota interna é a conversa supervisor-atendente que a origem abre pelo balão; não sai ao cliente. */
export async function falarComAtendenteNoMonitoramento(
  tx: TransacaoPipe,
  tenantId: string,
  usuarioId: string,
  conversaId: string,
  texto: string,
): Promise<void> {
  await exigirPermissao(tx, usuarioId, 'conversa.nota_interna');
  const corpo = texto.trim();
  if (!corpo) throw ErroPipe.requisicao('nota_vazia', 'Escreva uma mensagem antes de enviar.');
  const { rows } = await tx.execute<{ id: string }>(sql`
    select id from conversa where id = ${conversaId}::uuid limit 1
  `);
  if (!rows[0]) throw ErroPipe.naoEncontrado('Conversa');
  await tx.execute(sql`
    insert into nota_interna (tenant_id, conversa_id, usuario_id, corpo)
    values (${tenantId}, ${conversaId}::uuid, ${usuarioId}::uuid, ${corpo})
  `);
  await registrarAuditoria(tx, tenantId, {
    ator: { tipo: 'usuario', id: usuarioId },
    acao: 'alterou',
    objetoTipo: 'conversa',
    objetoId: conversaId,
    depois: { acao: 'falar_com_atendente' },
  });
}

export function metricasPorChave(linhas: readonly LinhaDeQuebra[]) {
  return new Map(
    linhas.map((linha) => [
      linha.chave,
      {
        conversasFinalizadas: linha.conversas,
        tempoMedioNaFilaSeg: linha.naFila.valor,
        tempoMedioPrimeiraRespostaSeg: linha.primeiraResposta.valor,
        tempoMedioAtendimentoSeg: linha.atendimento.valor,
      },
    ]),
  );
}

export function normalizarTicketsPorHora(linhas: readonly { hora: number; total: number }[]): number[] {
  const horas = Array<number>(24).fill(0);
  for (const linha of linhas) {
    if (Number.isInteger(linha.hora) && linha.hora >= 0 && linha.hora < 24) {
      horas[linha.hora] = linha.total;
    }
  }
  return horas;
}

/** Número de ticket legível a partir do uuid — o modelo não tem sequência própria. */
export function ticketDe(id: string): string {
  return `#${id.replace(/-/g, '').slice(-6).toUpperCase()}`;
}

type LinhaEvento = {
  conversaId: string;
  tipo: string;
  em: Date;
  usuarioId: string | null;
  filaId: string | null;
  dados: unknown;
};

/** Converte as linhas de `evento_atendimento` no formato que o `@pipe/core` consome. */
function agruparEventos(linhas: readonly LinhaEvento[]): Map<string, ConversaEventos> {
  const mapa = new Map<string, ConversaEventos & { eventos: EventoAtendimento[] }>();
  for (const linha of linhas) {
    const dados = (linha.dados ?? {}) as { encerrada_por?: string };
    const evento: EventoAtendimento = {
      conversaId: linha.conversaId,
      tipo: linha.tipo as TipoEvento,
      em: linha.em,
      usuarioId: linha.usuarioId,
      filaId: linha.filaId,
      encerradaPor: (dados.encerrada_por ?? null) as EncerradaPor | null,
    };
    const atual = mapa.get(linha.conversaId);
    if (atual) atual.eventos.push(evento);
    else mapa.set(linha.conversaId, { conversaId: linha.conversaId, eventos: [evento] });
  }
  return mapa;
}

function marcosVazios(conversaId: string): Marcos {
  return {
    conversaId,
    criadaEm: null,
    atribuidaEm: null,
    primeiraRespostaEm: null,
    encerradaEm: null,
    encerradaPor: null,
    atribuicoes: 0,
  };
}

/** Diferença em segundos, ou `null` quando falta uma das pontas. */
function entre(inicio: Date | null, fim: Date | null): number | null {
  if (!inicio || !fim) return null;
  const s = segundosEntre(inicio, fim);
  return s < 0 ? null : s;
}

function maiorDe(valores: readonly (number | null)[]): number | null {
  const validos = valores.filter((v): v is number => v !== null);
  return validos.length > 0 ? Math.max(...validos) : null;
}

/**
 * Tudo o que a tela de monitoramento precisa, em uma transação só.
 *
 * `agora` entra por parâmetro: as métricas de "tempo real" têm cronômetro
 * correndo e o instante precisa ser o mesmo em todos os cartões, senão a soma
 * dos cartões não fecha com a tabela.
 */
export interface FiltroMonitoramento {
  filaId?: string | undefined;
  atendenteId?: string | undefined;
  filaIds?: string[];
  atendenteIds?: string[];
}

/**
 * A ordem da FILA DE ESPERA: prioridade primeiro, e empate desempata pela mais
 * antiga.
 *
 * É a regra deles, e ela só existe porque a prioridade tem um degrau de
 * AUSÊNCIA: um ticket `baixa` fura a frente de um `sem_prioridade`. Enquanto a
 * coluna nascia em `media`, ordenar por prioridade era ordenar por um dado que
 * ninguém tinha escolhido, e por isso a lista saía só por data de criação.
 *
 * O desempate por antiguidade é o que impede a fila de virar pilha, com o
 * último a chegar sendo o primeiro a sair. A aba "Atribuído/Em andamento"
 * continua em ordem de criação: lá o ticket já tem dono, e prioridade não muda
 * mais quem atende.
 */
export function ordenarFilaDeEspera<
  T extends { prioridade: string; marcos: { criadaEm: Date | null } },
>(linhas: readonly T[]): T[] {
  return [...linhas].sort((a, b) => {
    const diferenca = pesoPrioridade(a.prioridade) - pesoPrioridade(b.prioridade);
    if (diferenca !== 0) return diferenca;
    /* Sem marco de criação vai para o fim: ela não é "a mais antiga", é a que
       não sabemos quando começou. Mesma regra do `null` na ordem do Desk. */
    const ta = a.marcos.criadaEm?.getTime() ?? Infinity;
    const tb = b.marcos.criadaEm?.getTime() ?? Infinity;
    return ta - tb;
  });
}

export async function carregarMonitoramento(
  tx: TransacaoPipe,
  janela: { inicio: Date; fim: Date },
  fuso: string,
  filtro: FiltroMonitoramento = {},
  agora = new Date(),
): Promise<Monitoramento> {
  return consultar(tx, async (tx) => {
    const desde = inicioDoHorizonte(agora);
    // Filtro rápido: entra no `where` das duas populações (abertas e encerradas),
    // para os cartões e a tabela nunca discordarem sobre o que está sendo olhado.
    const recorte = [
      filtro.filaIds?.length ? inArray(conversa.filaId, filtro.filaIds) : filtro.filaId ? eq(conversa.filaId, filtro.filaId) : undefined,
      filtro.atendenteIds?.length ? inArray(conversa.atendenteId, filtro.atendenteIds) : filtro.atendenteId ? eq(conversa.atendenteId, filtro.atendenteId) : undefined,
    ].filter((c) => c !== undefined);

    // ---- 1. conversas ainda abertas -------------------------------------
    const abertasCru = await tx
      .select({
        id: conversa.id,
        estado: conversa.estado,
        prioridade: conversa.prioridade,
        filaId: conversa.filaId,
        filaNome: fila.nome,
        atendenteId: conversa.atendenteId,
        atendenteNome: usuario.nome,
        contatoNome: contato.nome,
        emEsperaDesde: conversa.emEsperaDesde,
        ultimaMensagemDe: conversa.ultimaMensagemDe,
      })
      .from(conversa)
      .leftJoin(fila, eq(fila.id, conversa.filaId))
      .leftJoin(usuario, eq(usuario.id, conversa.atendenteId))
      .leftJoin(contato, eq(contato.id, conversa.contatoId))
      .where(and(isNull(conversa.encerradaEm), ...recorte))
      .orderBy(asc(conversa.criadaEm));

    const idsAbertas = abertasCru.map((c) => c.id);

    const eventosAbertas =
      idsAbertas.length === 0
        ? new Map<string, ConversaEventos>()
        : agruparEventos(
            await tx
              .select({
                conversaId: eventoAtendimento.conversaId,
                tipo: eventoAtendimento.tipo,
                em: eventoAtendimento.em,
                usuarioId: eventoAtendimento.usuarioId,
                filaId: eventoAtendimento.filaId,
                dados: eventoAtendimento.dados,
              })
              .from(eventoAtendimento)
              .where(
                and(
                  inArray(eventoAtendimento.conversaId, idsAbertas),
                  gte(eventoAtendimento.em, desde),
                ),
              ),
          );

    const etiquetasPorConversa = new Map<string, string[]>();
    if (idsAbertas.length > 0) {
      const linhas = await tx
        .select({ conversaId: conversaEtiqueta.conversaId, nome: etiqueta.nome })
        .from(conversaEtiqueta)
        .innerJoin(etiqueta, eq(etiqueta.id, conversaEtiqueta.etiquetaId))
        .where(inArray(conversaEtiqueta.conversaId, idsAbertas));
      for (const l of linhas) {
        const atual = etiquetasPorConversa.get(l.conversaId);
        if (atual) atual.push(l.nome);
        else etiquetasPorConversa.set(l.conversaId, [l.nome]);
      }
    }

    const regras: RegraSlaCarregada[] = await carregarRegrasSla(tx);

    const abertas: LinhaConversaAberta[] = abertasCru.map((c) => {
      const eventos = eventosAbertas.get(c.id);
      const marcos = eventos ? derivarMarcos(eventos) : marcosVazios(c.id);
      const naFilaSeg = marcos.atribuidaEm
        ? entre(marcos.criadaEm, marcos.atribuidaEm)
        : entre(marcos.criadaEm, agora);
      const primeiraRespostaSeg = marcos.primeiraRespostaEm
        ? entre(marcos.atribuidaEm, marcos.primeiraRespostaEm)
        : entre(marcos.atribuidaEm, agora);
      return {
        id: c.id,
        ticket: ticketDe(c.id),
        contatoNome: c.contatoNome ?? 'Contato sem nome',
        filaId: c.filaId,
        filaNome: c.filaNome,
        atendenteId: c.atendenteId,
        atendenteNome: c.atendenteNome,
        estado: c.estado,
        prioridade: c.prioridade,
        marcos,
        naFilaSeg,
        filaCorrendo: marcos.atribuidaEm === null,
        primeiraRespostaSeg,
        primeiraRespostaCorrendo: marcos.primeiraRespostaEm === null && marcos.atribuidaEm !== null,
        atendimentoSeg: entre(marcos.primeiraRespostaEm, agora),
        emEspera: c.emEsperaDesde !== null,
        aguardandoAtendente: c.ultimaMensagemDe === 'contato' || marcos.primeiraRespostaEm === null,
        sla: avaliarSlaDaConversa(regras, marcos, c.filaId, agora),
        etiquetas: etiquetasPorConversa.get(c.id) ?? [],
      };
    });

    // ---- 2. status dos atendentes ---------------------------------------
    const status = await tx
      .select({
        usuarioId: statusAtendente.usuarioId,
        estado: statusAtendente.estado,
        nome: usuario.nome,
      })
      .from(statusAtendente)
      .innerJoin(usuario, eq(usuario.id, statusAtendente.usuarioId))
      .where(eq(usuario.ativo, true));

    const cartaoAtendentes: CartaoAtendentes = {
      online: 0,
      pausa: 0,
      invisivel: 0,
      offline: 0,
      pausasEstouradas: 0,
    };
    for (const s of status) {
      if (s.estado === 'online') cartaoAtendentes.online += 1;
      else if (s.estado === 'pausa') cartaoAtendentes.pausa += 1;
      else if (s.estado === 'invisivel') cartaoAtendentes.invisivel += 1;
      else cartaoAtendentes.offline += 1;
    }

    // Pausa aberta que já passou da duração sugerida pelo motivo.
    const pausasAbertas = await tx
      .select({ iniciadaEm: pausa.iniciadaEm, sugeridaMin: motivoPausa.duracaoSugeridaMin })
      .from(pausa)
      .leftJoin(motivoPausa, eq(motivoPausa.id, pausa.motivoId))
      .where(isNull(pausa.encerradaEm));
    for (const p of pausasAbertas) {
      const limite = p.sugeridaMin;
      if (typeof limite !== 'number') continue;
      if (segundosEntre(p.iniciadaEm, agora) > limite * 60) cartaoAtendentes.pausasEstouradas += 1;
    }

    // ---- 3. cartões de tempo real ---------------------------------------
    const naFila = abertas.filter((c) => c.marcos.atribuidaEm === null);
    const semResposta = abertas.filter(
      (c) => c.marcos.atribuidaEm !== null && c.marcos.primeiraRespostaEm === null,
    );
    const emAtendimento = abertas.filter((c) => c.atendenteId !== null);

    const tempoReal: CartoesTempoReal = {
      naFila: naFila.length,
      maiorEsperaNaFilaSeg: maiorDe(naFila.map((c) => c.naFilaSeg)),
      aguardandoPrimeiraResposta: semResposta.length,
      maiorEsperaPrimeiraRespostaSeg: maiorDe(semResposta.map((c) => c.primeiraRespostaSeg)),
      emAtendimento: emAtendimento.length,
      atendentesOnline: cartaoAtendentes.online,
      mediaPorAtendente:
        cartaoAtendentes.online > 0 ? emAtendimento.length / cartaoAtendentes.online : null,
    };

    // ---- 4. conversas encerradas dentro do período ("hoje") -------------
    const relatorio = await carregarAtendimento(tx, janela, filtro);
    const hoje: CartoesDeHoje = {
      esperaDoCliente: relatorio.geral.esperaTotal,
      atePrimeiraResposta: relatorio.geral.primeiraResposta,
      tempoDeAtendimento: relatorio.geral.atendimento,
      tempoDeResposta: relatorio.geral.resposta,
      encerramentos: relatorio.geral.encerramentos,
    };
    const porAtendente = metricasPorChave(relatorio.porAtendente);
    const porFila = metricasPorChave(relatorio.porFila);
    const porEtiqueta = metricasPorChave(relatorio.porEtiqueta);

    // ---- 5. carga por atendente -----------------------------------------
    const capacidades = await tx
      .select({
        usuarioId: filaAtendente.usuarioId,
        filaId: filaAtendente.filaId,
        override: filaAtendente.capacidadeOverride,
        padrao: fila.capacidadePadrao,
      })
      .from(filaAtendente)
      .innerJoin(fila, eq(fila.id, filaAtendente.filaId));

    const limitePorAtendente = new Map<string, number>();
    const filasPorAtendente = new Map<string, string[]>();
    for (const c of capacidades) {
      const limite = c.override ?? c.padrao;
      limitePorAtendente.set(
        c.usuarioId,
        Math.max(limitePorAtendente.get(c.usuarioId) ?? 0, limite),
      );
      const filas = filasPorAtendente.get(c.usuarioId);
      if (filas) filas.push(c.filaId);
      else filasPorAtendente.set(c.usuarioId, [c.filaId]);
    }

    const carga: CargaAtendente[] = status
      .filter((s) => s.estado !== 'offline')
      .map((s) => {
        const minhas = abertas.filter((c) => c.atendenteId === s.usuarioId);
        const aguardando = minhas.filter((c) => c.aguardandoAtendente).length;
        const limite = limitePorAtendente.get(s.usuarioId) ?? 5;
        const medias = porAtendente.get(s.nome);
        const disponivel: AtendenteDisponivel = {
          id: s.usuarioId,
          estado: s.estado as EstadoAtendente,
          filas: filasPorAtendente.get(s.usuarioId) ?? [],
          limiteSimultaneo: limite,
          ativas: minhas.length,
          aguardandoAtendente: aguardando,
          semPrimeiraResposta: minhas.filter((c) => c.marcos.primeiraRespostaEm === null).length,
          ultimaAtribuicaoEm: null,
        };
        return {
          id: s.usuarioId,
          nome: s.nome,
          estado: disponivel.estado,
          ativas: minhas.length,
          aguardandoAtendente: aguardando,
          limite,
          carga: cargaPonderada(disponivel),
          // O teto da barra: o limite todo ocupado por conversa que aguarda o atendente.
          cargaMaxima: cargaPonderada({
            ...disponivel,
            ativas: limite,
            aguardandoAtendente: limite,
          }),
          tempoMedioRespostaSeg: medias?.tempoMedioPrimeiraRespostaSeg ?? null,
          tempoMedioAtendimentoSeg: medias?.tempoMedioAtendimentoSeg ?? null,
        };
      })
      .sort((a, b) => b.carga - a.carga || a.nome.localeCompare(b.nome, 'pt-BR'));

    // ---- 6. resumos por fila e por etiqueta ------------------------------
    const todasFilas = await tx
      .select({ id: fila.id, nome: fila.nome })
      .from(fila)
      .where(eq(fila.ativa, true))
      .orderBy(asc(fila.ordem));

    const onlinePorFila = new Map<string, number>();
    const idsOnline = new Set(status.filter((s) => s.estado === 'online').map((s) => s.usuarioId));
    for (const c of capacidades) {
      if (!idsOnline.has(c.usuarioId)) continue;
      onlinePorFila.set(c.filaId, (onlinePorFila.get(c.filaId) ?? 0) + 1);
    }

    const filas: ResumoFila[] = todasFilas.map((f) => {
      const daFila = abertas.filter((c) => c.filaId === f.id);
      const medias = porFila.get(f.nome);
      return {
        id: f.id,
        nome: f.nome,
        naFila: daFila.filter((c) => c.marcos.atribuidaEm === null).length,
        emAtendimento: daFila.filter((c) => c.atendenteId !== null).length,
        maiorEsperaSeg: maiorDe(
          daFila.filter((c) => c.marcos.atribuidaEm === null).map((c) => c.naFilaSeg),
        ),
        atendentesOnline: onlinePorFila.get(f.id) ?? 0,
        tempoMedioNaFilaSeg: medias?.tempoMedioNaFilaSeg ?? null,
        tempoMedioRespostaSeg: medias?.tempoMedioPrimeiraRespostaSeg ?? null,
        tempoMedioAtendimentoSeg: medias?.tempoMedioAtendimentoSeg ?? null,
      };
    });

    const todasEtiquetas = await tx
      .select({ id: etiqueta.id, nome: etiqueta.nome, cor: etiqueta.cor })
      .from(etiqueta)
      .orderBy(asc(etiqueta.nome));

    const contagemEtiqueta = new Map<string, number>();
    for (const c of abertas) {
      for (const nome of c.etiquetas) {
        contagemEtiqueta.set(nome, (contagemEtiqueta.get(nome) ?? 0) + 1);
      }
    }
    const etiquetas: ResumoEtiqueta[] = todasEtiquetas.map((e) => {
      const medias = porEtiqueta.get(e.nome);
      return {
        id: e.id,
        nome: e.nome,
        cor: e.cor,
        abertas: contagemEtiqueta.get(e.nome) ?? 0,
        finalizadas: medias?.conversasFinalizadas ?? 0,
        tempoMedioAtendimentoSeg: medias?.tempoMedioAtendimentoSeg ?? null,
      };
    });

    const horaLocal = sql<number>`extract(hour from ${conversa.criadaEm} at time zone ${fuso})::int`;
    const porHoraCru = await tx
      .select({ hora: horaLocal, total: sql<number>`count(*)::int` })
      .from(conversa)
      .where(and(gte(conversa.criadaEm, janela.inicio), lt(conversa.criadaEm, janela.fim), ...recorte))
      // A expressão usa um parâmetro para o fuso; referenciá-la pela posição
      // mantém SELECT, GROUP BY e ORDER BY idênticos para o PostgreSQL.
      .groupBy(sql.raw('1'))
      .orderBy(sql.raw('1'));
    const ticketsAbertosPorHora = normalizarTicketsPorHora(porHoraCru);

    const listaAtendentes = status
      .map((s) => ({ id: s.usuarioId, nome: s.nome }))
      .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));

    return {
      agora,
      fuso,
      tempoReal,
      atendentes: cartaoAtendentes,
      hoje,
      abertas,
      carga,
      filas,
      etiquetas,
      ticketsAbertosPorHora,
      listaAtendentes,
    };
  });
}

/** Contagem de conversas encerradas no período — usada pelo cabeçalho do histórico. */
export async function contarEncerradasNoPeriodo(
  tx: TransacaoPipe,
  janela: { inicio: Date; fim: Date },
): Promise<number> {
  return consultar(tx, async (tx) => {
    const r = await tx
      .select({ total: sql<number>`count(*)::int` })
      .from(conversa)
      .where(
        and(
          isNotNull(conversa.encerradaEm),
          gte(conversa.encerradaEm, janela.inicio),
          lt(conversa.encerradaEm, janela.fim),
        ),
      );
    return r[0]?.total ?? 0;
  });
}
