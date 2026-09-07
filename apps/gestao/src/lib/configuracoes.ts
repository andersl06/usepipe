import { and, asc, count, desc, eq, inArray, isNull, notInArray } from 'drizzle-orm';
import { diferenca, registrarAuditoria } from '@pipe/db';
import {
  canal,
  conversa,
  conversaEtiqueta,
  etiqueta,
  fila,
  inbox,
  motivoPausa,
  pesquisa,
  regraSla,
  statusAtendente,
  tenant,
  usuario,
} from '@pipe/db/schema';
import { atorDaGestao, consultar, tenantId } from './banco';

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
  nome: string;
  alvo: string;
  prazoSeg: number;
  alertaSeg: number | null;
  escopoTipo: string;
  escopoNome: string | null;
  ativa: boolean;
}

export interface FilaConfigurada {
  id: string;
  nome: string;
  capacidadePadrao: number;
  ordem: number;
  temHorario: boolean;
  ativa: boolean;
}

/** Rótulos do banco em português corrente. O alvo é enum, não texto livre. */
export const ROTULO_ALVO: Record<string, string> = {
  primeira_resposta: 'Primeira resposta',
  resposta: 'Tempo de resposta',
  resolucao: 'Encerramento',
  espera_fila: 'Espera na fila',
};

export const ROTULO_ESCOPO: Record<string, string> = {
  tenant: 'Toda a operação',
  fila: 'Fila',
};

export async function carregarRegras(): Promise<{
  filas: FilaConfigurada[];
  regras: RegraSlaConfigurada[];
}> {
  return consultar(async (tx) => {
    const filas = await tx
      .select({
        id: fila.id,
        nome: fila.nome,
        capacidadePadrao: fila.capacidadePadrao,
        ordem: fila.ordem,
        horarioId: fila.horarioId,
        ativa: fila.ativa,
      })
      .from(fila)
      .orderBy(asc(fila.ordem), asc(fila.nome));

    const nomeDaFila = new Map(filas.map((f) => [f.id, f.nome]));

    const regras = await tx
      .select({
        id: regraSla.id,
        nome: regraSla.nome,
        alvo: regraSla.alvo,
        prazoSeg: regraSla.prazoSeg,
        alertaSeg: regraSla.alertaSeg,
        escopoTipo: regraSla.escopoTipo,
        escopoId: regraSla.escopoId,
        ativa: regraSla.ativa,
      })
      .from(regraSla)
      .orderBy(asc(regraSla.nome));

    return {
      filas: filas.map(({ horarioId, ...resto }) => ({ ...resto, temHorario: horarioId !== null })),
      regras: regras.map(({ escopoId, ...resto }) => ({
        ...resto,
        escopoNome: escopoId ? (nomeDaFila.get(escopoId) ?? 'fila removida') : null,
      })),
    };
  });
}

export interface MotivoConfigurado {
  id: string;
  nome: string;
  duracaoSugeridaMin: number | null;
  contaComoProdutivo: boolean;
  ativo: boolean;
}

export interface AtendenteConfigurado {
  id: string;
  nome: string;
  email: string;
  estado: string | null;
  ativo: boolean;
}

export async function carregarOperacao(): Promise<{
  motivos: MotivoConfigurado[];
  atendentes: AtendenteConfigurado[];
}> {
  return consultar(async (tx) => {
    const motivos = await tx
      .select({
        id: motivoPausa.id,
        nome: motivoPausa.nome,
        duracaoSugeridaMin: motivoPausa.duracaoSugeridaMin,
        contaComoProdutivo: motivoPausa.contaComoProdutivo,
        ativo: motivoPausa.ativo,
      })
      .from(motivoPausa)
      .orderBy(asc(motivoPausa.nome));

    const atendentes = await tx
      .select({
        id: usuario.id,
        nome: usuario.nome,
        email: usuario.email,
        estado: statusAtendente.estado,
        ativo: usuario.ativo,
      })
      .from(usuario)
      .leftJoin(statusAtendente, eq(statusAtendente.usuarioId, usuario.id))
      .orderBy(asc(usuario.nome));

    return { motivos, atendentes };
  });
}

export interface EtiquetaConfigurada {
  id: string;
  nome: string;
  escopo: string;
  obrigatoriaNoEncerramento: boolean;
  usos: number;
}

export interface CanalConfigurado {
  id: string;
  nome: string;
  tipo: string;
  ativo: boolean;
}

export async function carregarDados(): Promise<{
  etiquetas: EtiquetaConfigurada[];
  canais: CanalConfigurado[];
}> {
  return consultar(async (tx) => {
    const etiquetas = await tx
      .select({
        id: etiqueta.id,
        nome: etiqueta.nome,
        escopo: etiqueta.escopo,
        obrigatoriaNoEncerramento: etiqueta.obrigatoriaNoEncerramento,
        usos: count(conversaEtiqueta.conversaId),
      })
      .from(etiqueta)
      .leftJoin(conversaEtiqueta, eq(conversaEtiqueta.etiquetaId, etiqueta.id))
      .groupBy(etiqueta.id, etiqueta.nome, etiqueta.escopo, etiqueta.obrigatoriaNoEncerramento)
      .orderBy(asc(etiqueta.nome));

    const canais = await tx
      .select({ id: canal.id, nome: canal.nome, tipo: canal.tipo, ativo: canal.ativo })
      .from(canal)
      .orderBy(asc(canal.nome));

    return { etiquetas, canais };
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
export interface CaixaDoCanal {
  id: string;
  nome: string;
  filaPadrao: string | null;
  abertas: number;
}

export interface CanalDetalhado extends CanalConfigurado {
  criadoEm: Date;
  caixas: CaixaDoCanal[];
}

export async function carregarCanais(): Promise<CanalDetalhado[]> {
  return consultar(async (tx) => {
    const canais = await tx
      .select({
        id: canal.id,
        nome: canal.nome,
        tipo: canal.tipo,
        ativo: canal.ativo,
        criadoEm: canal.criadoEm,
      })
      .from(canal)
      .orderBy(asc(canal.nome));

    /* Uma consulta para todas as caixas, agrupada em memória depois. Não é
       Promise.all dentro da transação de propósito: consulta paralela na mesma
       conexão perde a variável de sessão do RLS. */
    const caixas = await tx
      .select({
        canalId: inbox.canalId,
        id: inbox.id,
        nome: inbox.nome,
        filaPadrao: fila.nome,
        abertas: count(conversa.id),
      })
      .from(inbox)
      .leftJoin(fila, eq(fila.id, inbox.filaPadraoId))
      .leftJoin(conversa, and(eq(conversa.inboxId, inbox.id), isNull(conversa.encerradaEm)))
      .groupBy(inbox.canalId, inbox.id, inbox.nome, fila.nome)
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

export interface IdentidadeDoTenant {
  nome: string;
  fuso: string;
  idioma: string;
  plano: string;
}

export interface PesquisaConfigurada {
  id: string;
  tipo: string;
  escalaMin: number;
  escalaMax: number;
  pergunta: string;
  disparo: string;
  ativa: boolean;
}

export interface EtiquetaDeEncerramento {
  id: string;
  nome: string;
  obrigatoria: boolean;
  usos: number;
}

export interface ConfiguracoesGerais {
  identidade: IdentidadeDoTenant;
  /** A pesquisa ativa do tenant, ou `null` quando ninguém configurou nenhuma. */
  pesquisa: PesquisaConfigurada | null;
  /** Quantas pesquisas existem além dessa — a §6 exige uma escala por pesquisa. */
  outrasPesquisas: number;
  etiquetas: EtiquetaDeEncerramento[];
}

export async function carregarGerais(): Promise<ConfiguracoesGerais> {
  return consultar(async (tx) => {
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
        obrigatoria: etiqueta.obrigatoriaNoEncerramento,
        usos: count(conversaEtiqueta.conversaId),
      })
      .from(etiqueta)
      .leftJoin(conversaEtiqueta, eq(conversaEtiqueta.etiquetaId, etiqueta.id))
      .groupBy(etiqueta.id, etiqueta.nome, etiqueta.obrigatoriaNoEncerramento)
      .orderBy(asc(etiqueta.nome));

    const primeira = pesquisas[0];

    return {
      identidade: {
        nome: dono?.nome ?? '',
        fuso: dono?.fuso ?? 'America/Sao_Paulo',
        idioma: dono?.idioma ?? 'pt-BR',
        plano: dono?.plano ?? 'essencial',
      },
      pesquisa: primeira
        ? {
            id: primeira.id,
            tipo: primeira.tipo,
            escalaMin: primeira.escalaMin,
            escalaMax: primeira.escalaMax,
            pergunta: primeira.pergunta,
            disparo: primeira.disparo,
            ativa: primeira.ativa,
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

export type Gravacao = { ok: true } | { ok: false; erro: string };

/* `type` e não `interface`: só o alias ganha índice implícito, e é isso que
   deixa `diferenca` — que recebe `Record<string, unknown>` — aceitar o objeto. */
export type IdentidadeParaGravar = {
  nome: string;
  fuso: string;
  idioma: string;
};

export async function gravarIdentidade(entrada: IdentidadeParaGravar): Promise<Gravacao> {
  const tid = await tenantId();

  return consultar(async (tx) => {
    const [antes] = await tx
      .select({ nome: tenant.nome, fuso: tenant.fuso, idioma: tenant.idioma })
      .from(tenant)
      .where(eq(tenant.id, tid))
      .limit(1);
    if (!antes) return { ok: false, erro: 'Tenant não encontrado.' };

    await tx.update(tenant).set(entrada).where(eq(tenant.id, tid));

    const mudou = diferenca(antes, entrada);
    await registrarAuditoria(tx, tid, {
      ator: await atorDaGestao(),
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
  tipo: string;
  escalaMin: number;
  escalaMax: number;
  pergunta: string;
  disparo: string;
  ativa: boolean;
}

export async function gravarPesquisa(entrada: PesquisaParaGravar): Promise<Gravacao> {
  const { id, ...valores } = entrada;
  const tid = await tenantId();

  return consultar(async (tx) => {
    if (!id) {
      const [criada] = await tx
        .insert(pesquisa)
        .values({ tenantId: tid, ...valores })
        .returning({ id: pesquisa.id });
      if (!criada) return { ok: false, erro: 'Não consegui gravar a pesquisa.' };

      await registrarAuditoria(tx, tid, {
        ator: await atorDaGestao(),
        acao: 'criou',
        objetoTipo: 'pesquisa',
        objetoId: criada.id,
        depois: valores,
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

    await tx.update(pesquisa).set(valores).where(eq(pesquisa.id, id));

    const mudou = diferenca(antes, valores);
    await registrarAuditoria(tx, tid, {
      ator: await atorDaGestao(),
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
export async function gravarEtiquetasDeEncerramento(
  escolhidas: readonly string[],
): Promise<Gravacao> {
  const tid = await tenantId();

  return consultar(async (tx) => {
    const antes = await tx
      .select({ nome: etiqueta.nome })
      .from(etiqueta)
      .where(and(eq(etiqueta.tenantId, tid), eq(etiqueta.obrigatoriaNoEncerramento, true)));

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
        .set({ obrigatoriaNoEncerramento: true })
        .where(and(eq(etiqueta.tenantId, tid), inArray(etiqueta.id, [...escolhidas])));

      await tx
        .update(etiqueta)
        .set({ obrigatoriaNoEncerramento: false })
        .where(and(eq(etiqueta.tenantId, tid), notInArray(etiqueta.id, [...escolhidas])));
    } else {
      await tx
        .update(etiqueta)
        .set({ obrigatoriaNoEncerramento: false })
        .where(eq(etiqueta.tenantId, tid));
    }

    const depois = await tx
      .select({ nome: etiqueta.nome })
      .from(etiqueta)
      .where(and(eq(etiqueta.tenantId, tid), eq(etiqueta.obrigatoriaNoEncerramento, true)));

    await registrarAuditoria(tx, tid, {
      ator: await atorDaGestao(),
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
