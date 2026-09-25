import { and, asc, count, desc, eq, inArray, isNull, notInArray } from 'drizzle-orm';
import { diferenca, registrarAuditoria } from '@pipe/db';
import {
  channel,
  conversation,
  conversationLabel,
  etiqueta,
  queue,
  inbox,
  pesquisa,
  regraSla,
  tenant,
} from '@pipe/db/schema';
import type { TransactionPipe, Ator } from '@pipe/db';
import { exigirPermission } from '../../session.js';

/** A transação já vem com o tenant fixado; `consultar` só nomeia o bloco, como na Gestão. */
const consultar = <T>(tx: TransactionPipe, fn: (tx: TransactionPipe) => Promise<T>): Promise<T> =>
  fn(tx);

/**
 * Reaproveitada do catálogo — "Configurar marca, fuso e plano". As três
 * escritas de Configurações gerais (identidade, pesquisa, etiqueta de
 * encerramento) são exatamente isso: nenhuma tinha permissão nenhuma antes
 * da tarefa de cadastros do Atendimento (item 7).
 */
export const SETTINGS_GENERAL_MANAGE = 'tenant.configurar';

/**
 * O que está configurado no tenant: o retrato, e o que o muda.
 *
 * A leitura era somente leitura porque a edição exige log de auditoria com
 * autor, valor anterior e horário, e configurar sem rastro é passivo. O log
 * chegou (`registrarAuditoria` do `@pipe/db`), então a segunda metade deste
 * arquivo escreve — sempre na MESMA transação da mudança, que é o que impede o
 * log de mentir quando a alteração falha ou é desfeita.
 *
 * Nada aqui sabe que o Next existe: sem `revalidatePath`, sem JSX. Recebe
 * parâmetro, devolve dado. É o que faz virar endpoint da `apps/api` por
 * movimentação e não por reescrita (README, "Quem fala com o banco").
 */

export interface RegraSlaConfigurada {
  id: string;
  name: string;
  target: string;
  deadlineSeg: number;
  alertSeg: number | null;
  scopeType: string;
  scopeName: string | null;
  ativa: boolean;
}

export interface QueueConfigured {
  id: string;
  name: string;
  capacityDefault: number;
  order: number;
  temHorario: boolean;
  ativa: boolean;
}

/** Rótulos do banco em português corrente. O alvo é enum, não texto livre. */
export const ROTULO_ALVO: Record<string, string> = {
  firstResponse: 'Primeira resposta',
  resposta: 'Tempo de resposta',
  resolution: 'Encerramento',
  waitQueue: 'Espera na fila',
};

export const LABEL_SCOPE: Record<string, string> = {
  tenant: 'Toda a operação',
  queue: 'Fila',
};

export async function carregarRegras(tx: TransactionPipe): Promise<{
  queues: QueueConfigured[];
  regras: RegraSlaConfigurada[];
}> {
  return consultar(tx, async (tx) => {
    const queues = await tx
      .select({
        id: queue.id,
        nome: queue.nome,
        capacidadePadrao: queue.capacityDefault,
        ordem: queue.order,
        horarioId: queue.horarioId,
        ativa: queue.ativa,
      })
      .from(queue)
      .orderBy(asc(queue.order), asc(queue.nome));

    const nameOfQueue = new Map(queues.map((f) => [f.id, f.nome]));

    const regras = await tx
      .select({
        id: regraSla.id,
        nome: regraSla.nome,
        alvo: regraSla.alvo,
        prazoSeg: regraSla.prazoSeg,
        alertaSeg: regraSla.alertaSeg,
        escopoTipo: regraSla.escopoTipo,
        scopeId: regraSla.escopoId,
        ativa: regraSla.ativa,
      })
      .from(regraSla)
      .orderBy(asc(regraSla.nome));

    return {
      filas: queues.map(({ horarioId, ...resto }) => ({ ...resto, temHorario: horarioId !== null })),
      regras: regras.map(({ scopeId, ...resto }) => ({
        ...resto,
        escopoNome: scopeId ? (nameOfQueue.get(scopeId) ?? 'fila removida') : null,
      })),
    };
  });
}

/*
 * `carregarOperacao` foi embora com a tela `/configuracoes/operacao`. Ela lia
 * duas coisas: o quadro de atendentes, que virou `carregarAtendentes` em
 * `cadastros.ts` com as colunas de fila e de teto que faltavam; e uma cópia
 * só-leitura dos motivos de pausa, que já têm tela com formulário em
 * `/atendentes/pausas`.
 */

export interface EtiquetaConfigurada {
  id: string;
  name: string;
  scope: string;
  requiredInClosure: boolean;
  usos: number;
}

export interface ChannelConfigured {
  id: string;
  name: string;
  type: string;
  active: boolean;
}

export async function loadData(tx: TransactionPipe): Promise<{
  etiquetas: EtiquetaConfigurada[];
  channels: ChannelConfigured[];
}> {
  return consultar(tx, async (tx) => {
    const etiquetas = await tx
      .select({
        id: etiqueta.id,
        nome: etiqueta.nome,
        escopo: etiqueta.escopo,
        obrigatoriaNoEncerramento: etiqueta.requiredInClosure,
        usos: count(conversationLabel.conversaId),
      })
      .from(etiqueta)
      .leftJoin(conversationLabel, eq(conversationLabel.etiquetaId, etiqueta.id))
      .groupBy(etiqueta.id, etiqueta.nome, etiqueta.escopo, etiqueta.requiredInClosure)
      .orderBy(asc(etiqueta.nome));

    const channels = await tx
      .select({ id: channel.id, nome: channel.nome, tipo: channel.tipo, ativo: channel.ativo })
      .from(channel)
      .orderBy(asc(channel.nome));

    return { etiquetas, channels };
  });
}

/**
 * O módulo Canais, que na barra deles é módulo e aqui estava diluído em
 * Preferências ├ Dados.
 *
 * A caixa de entrada aparece junto porque é ela, e não o canal, que carrega a
 * fila padrão: canal é a conexão com a operadora, caixa é para onde a conversa
 * daquela conexão cai. Confundir os dois é o que faz alguém procurar a fila
 * padrão na tela do WhatsApp e não achar.
 *
 * A contagem é de conversas ABERTAS, não do total histórico: o que interessa
 * ao olhar um canal é se ele está entregando agora.
 */
export interface CaixaOfChannel {
  id: string;
  name: string;
  queueDefault: string | null;
  abertas: number;
}

export interface ChannelDetailed extends ChannelConfigured {
  criadoEm: Date;
  caixas: CaixaOfChannel[];
}

export async function loadChannels(tx: TransactionPipe): Promise<ChannelDetailed[]> {
  return consultar(tx, async (tx) => {
    const canais = await tx
      .select({
        id: channel.id,
        nome: channel.nome,
        tipo: channel.tipo,
        ativo: channel.ativo,
        criadoEm: channel.criadoEm,
      })
      .from(channel)
      .orderBy(asc(channel.nome));

    /* Uma consulta para todas as caixas, agrupada em memória depois. Não é
       Promise.all dentro da transação de propósito: consulta paralela na mesma
       conexão perde a variável de sessão do RLS. */
    const caixas = await tx
      .select({
        canalId: inbox.channelId,
        id: inbox.id,
        nome: inbox.nome,
        filaPadrao: queue.nome,
        abertas: count(conversation.id),
      })
      .from(inbox)
      .leftJoin(queue, eq(queue.id, inbox.queueDefaultId))
      .leftJoin(conversation, and(eq(conversation.inboxId, inbox.id), isNull(conversation.encerradaEm)))
      .groupBy(inbox.channelId, inbox.id, inbox.nome, queue.nome)
      .orderBy(asc(inbox.nome));

    return canais.map((c) => ({
      ...c,
      caixas: caixas.filter((cx) => cx.canalId === c.id).map(({ canalId: _, ...cx }) => cx),
    }));
  });
}

/* ============================================ Preferências ├ Configurações gerais
   A segunda lacuna que `estrutura-gestao.tsx` registrava. Diferente de tudo
   acima, aqui a leitura alimenta um formulário que ESCREVE. O que não tem
   cartão de configuração continua somente leitura.

   Um cartão por configuração, e cada um salva sozinho
   (`blip-telas-cadastro.md` §3): "em Configurações gerais não há um botão
   Salvar da tela". */

export interface IdentityOfTenant {
  name: string;
  fuso: string;
  idioma: string;
  plan: string;
}

export interface PesquisaConfigurada {
  id: string;
  type: string;
  escalaMin: number;
  escalaMax: number;
  pergunta: string;
  trigger: string;
  active: boolean;
}

export interface LabelOfClosure {
  id: string;
  name: string;
  obrigatoria: boolean;
  usos: number;
}

export interface SettingsGeneral {
  identity: IdentityOfTenant;
  /** A pesquisa ativa do tenant, ou `null` quando ninguém configurou nenhuma. */
  pesquisa: PesquisaConfigurada | null;
  /** Quantas pesquisas existem além dessa — a §6 exige uma escala por pesquisa. */
  outrasPesquisas: number;
  etiquetas: LabelOfClosure[];
}

export async function loadGeneral(tx: TransactionPipe): Promise<SettingsGeneral> {
  return consultar(tx, async (tx) => {
    const [dono] = await tx
      .select({
        nome: tenant.nome,
        fuso: tenant.fuso,
        idioma: tenant.idioma,
        plano: tenant.plano,
      })
      .from(tenant)
      .limit(1);

    /* A mais recente primeiro: quando há mais de uma, é a última configurada
       que a tela edita, e a contagem das outras aparece no cartão. Esconder que
       existem duas é como duas escalas acabam somadas no mesmo gráfico. */
    const pesquisas = await tx
      .select({
        id: pesquisa.id,
        tipo: pesquisa.tipo,
        escalaMin: pesquisa.escalaMin,
        escalaMax: pesquisa.escalaMax,
        pergunta: pesquisa.pergunta,
        disparo: pesquisa.disparo,
        ativa: pesquisa.ativa,
        criadoEm: pesquisa.criadoEm,
      })
      .from(pesquisa)
      .orderBy(desc(pesquisa.criadoEm));

    const etiquetas = await tx
      .select({
        id: etiqueta.id,
        nome: etiqueta.nome,
        obrigatoria: etiqueta.requiredInClosure,
        usos: count(conversationLabel.conversaId),
      })
      .from(etiqueta)
      .leftJoin(conversationLabel, eq(conversationLabel.etiquetaId, etiqueta.id))
      .groupBy(etiqueta.id, etiqueta.nome, etiqueta.requiredInClosure)
      .orderBy(asc(etiqueta.nome));

    const first = pesquisas[0];

    return {
      identidade: {
        nome: dono?.nome ?? '',
        fuso: dono?.fuso ?? 'America/Sao_Paulo',
        idioma: dono?.idioma ?? 'pt-BR',
        plano: dono?.plano ?? 'essencial',
      },
      pesquisa: first
        ? {
            id: first.id,
            tipo: first.tipo,
            escalaMin: first.escalaMin,
            escalaMax: first.escalaMax,
            pergunta: first.pergunta,
            disparo: first.disparo,
            ativa: first.ativa,
          }
        : null,
      outrasPesquisas: Math.max(0, pesquisas.length - 1),
      etiquetas,
    };
  });
}

/* ------------------------------------------------- escrita das configurações
   O que muda o tenant mora aqui, e não na Server Action: front é front, banco é
   da `api` (README, "Quem fala com o banco"). Cada função recebe parâmetro,
   devolve dado, e grava a auditoria na MESMA transação — `registrarAuditoria`
   do `@pipe/db` recebe a `tx` justamente para que log e dado nunca discordem.

   `diferenca` guarda só o que mudou: quem lê o log quer saber que o fuso foi de
   São Paulo para Manaus, não reler as colunas que continuaram iguais. */

export type Recording = { ok: true } | { ok: false; error: string };

/* `type` e não `interface`: só o alias ganha índice implícito, e é isso que
   deixa `diferenca` — que recebe `Record<string, unknown>` — aceitar o objeto. */
export type IdentityForWrite = {
  name: string;
  fuso: string;
  idioma: string;
};

export async function writeIdentity(
  tx: TransactionPipe,
  tid: string,
  ator: Ator,
  inbound: IdentityForWrite,
): Promise<Recording> {
  if (ator.type === 'usuario' && ator.id) {
    await exigirPermission(tx, ator.id, SETTINGS_GENERAL_MANAGE);
  }
  return consultar(tx, async (tx) => {
    const [antes] = await tx
      .select({ nome: tenant.nome, fuso: tenant.fuso, idioma: tenant.idioma })
      .from(tenant)
      .where(eq(tenant.id, tid))
      .limit(1);
    if (!antes) return { ok: false, erro: 'Tenant não encontrado.' };

    await tx.update(tenant).set(inbound).where(eq(tenant.id, tid));

    const mudou = diferenca(antes, inbound);
    await registrarAuditoria(tx, tid, {
      ator: ator,
      acao: 'alterou',
      objetoTipo: 'tenant',
      objetoId: tid,
      antes: mudou.antes,
      depois: mudou.depois,
    });

    return { ok: true };
  });
}

export interface PesquisaParaGravar {
  /** Vazio cria; preenchido altera a pesquisa existente. */
  id: string;
  type: string;
  escalaMin: number;
  escalaMax: number;
  pergunta: string;
  trigger: string;
  ativa: boolean;
}

export async function gravarPesquisa(
  tx: TransactionPipe,
  tid: string,
  ator: Ator,
  entrada: PesquisaParaGravar,
): Promise<Recording> {
  if (ator.type === 'usuario' && ator.id) {
    await exigirPermission(tx, ator.id, SETTINGS_GENERAL_MANAGE);
  }
  const { id, ...values } = entrada;

  return consultar(tx, async (tx) => {
    if (!id) {
      const [criada] = await tx
        .insert(pesquisa)
        .values({ tenantId: tid, ...values })
        .returning({ id: pesquisa.id });
      if (!criada) return { ok: false, erro: 'Não consegui gravar a pesquisa.' };

      await registrarAuditoria(tx, tid, {
        ator: ator,
        acao: 'criou',
        objetoTipo: 'pesquisa',
        objetoId: criada.id,
        depois: values,
      });
      return { ok: true };
    }

    const [antes] = await tx
      .select({
        tipo: pesquisa.tipo,
        escalaMin: pesquisa.escalaMin,
        escalaMax: pesquisa.escalaMax,
        pergunta: pesquisa.pergunta,
        disparo: pesquisa.disparo,
        ativa: pesquisa.ativa,
      })
      .from(pesquisa)
      .where(and(eq(pesquisa.tenantId, tid), eq(pesquisa.id, id)))
      .limit(1);
    if (!antes) return { ok: false, erro: 'Pesquisa não encontrada.' };

    await tx.update(pesquisa).set(values).where(eq(pesquisa.id, id));

    const mudou = diferenca(antes, values);
    await registrarAuditoria(tx, tid, {
      ator: ator,
      acao: 'alterou',
      objetoTipo: 'pesquisa',
      objetoId: id,
      antes: mudou.antes,
      depois: mudou.depois,
    });

    return { ok: true };
  });
}

/**
 * Quais etiquetas o atendente é obrigado a escolher ao encerrar.
 *
 * Lista fechada: o que veio marcado passa a ser obrigatório, e o que não veio
 * deixa de ser. Mandar só as marcadas e nunca desmarcar nada faria a exigência
 * crescer para sempre — e ninguém consegue desfazer pela tela.
 */
export async function writeLabelsOfClosure(
  tx: TransactionPipe,
  tid: string,
  ator: Ator,
  escolhidas: readonly string[],
): Promise<Recording> {
  if (ator.type === 'usuario' && ator.id) {
    await exigirPermission(tx, ator.id, SETTINGS_GENERAL_MANAGE);
  }
  return consultar(tx, async (tx) => {
    const antes = await tx
      .select({ nome: etiqueta.nome })
      .from(etiqueta)
      .where(and(eq(etiqueta.tenantId, tid), eq(etiqueta.requiredInClosure, true)));

    if (escolhidas.length > 0) {
      const validas = await tx
        .select({ id: etiqueta.id })
        .from(etiqueta)
        .where(and(eq(etiqueta.tenantId, tid), inArray(etiqueta.id, [...escolhidas])));
      if (validas.length !== escolhidas.length) {
        return { ok: false, erro: 'Etiqueta desconhecida na seleção.' };
      }

      await tx
        .update(etiqueta)
        .set({ requiredInClosure: true })
        .where(and(eq(etiqueta.tenantId, tid), inArray(etiqueta.id, [...escolhidas])));

      await tx
        .update(etiqueta)
        .set({ requiredInClosure: false })
        .where(and(eq(etiqueta.tenantId, tid), notInArray(etiqueta.id, [...escolhidas])));
    } else {
      await tx
        .update(etiqueta)
        .set({ requiredInClosure: false })
        .where(eq(etiqueta.tenantId, tid));
    }

    const depois = await tx
      .select({ nome: etiqueta.nome })
      .from(etiqueta)
      .where(and(eq(etiqueta.tenantId, tid), eq(etiqueta.requiredInClosure, true)));

    await registrarAuditoria(tx, tid, {
      ator: ator,
      acao: 'alterou',
      objetoTipo: 'etiqueta',
      /* Não é uma etiqueta: é a política de encerramento do tenant inteiro. O
         objeto é o tenant, e o `antes`/`depois` diz quais nomes entraram e
         saíram da lista. */
      objetoId: tid,
      antes: { obrigatoriasNoEncerramento: antes.map((e) => e.nome) },
      depois: { obrigatoriasNoEncerramento: depois.map((e) => e.nome) },
    });

    return { ok: true };
  });
}
