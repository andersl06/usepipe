import { and, asc, count, desc, eq, gte, ilike, isNotNull, isNull, ne, sql } from 'drizzle-orm';
import {
  canal,
  classificacaoConversa,
  contato,
  contatoIdentidade,
  conversa,
  fila,
  fluxo,
  inbox,
  mensagem,
  templateMensagem,
  tenant,
  usuario,
} from '@pipe/db/schema';
import type { TransacaoPipe } from '@pipe/db';
import type { GradeDoPortal } from '@pipe/contracts';

/**
 * As leituras das telas DO CONTATO (`/fluxo/:id/**` na Gestão), movidas de
 * `apps/gestao/src/lib/*` para cá, como o README previu ("virar endpoint na
 * `api` é mover o arquivo"): a consulta é a mesma, só que agora recebe a
 * transação já com o tenant fixado — o controlador é quem sabe de sessão.
 *
 * Nada aqui sabe de HTTP nem de tela. O que sai é o que a tela desenha, e o
 * tipo é derivado da consulta (`Awaited<ReturnType<…>>`), não copiado à mão.
 */

/** O contato (o `fluxo`) e o canal dele. Uma consulta, um `leftJoin`. */
export async function carregarContato(tx: TransacaoPipe, tid: string, id: string) {
  const [linha] = await tx
    .select({
      id: fluxo.id,
      nome: fluxo.nome,
      estado: fluxo.estado,
      tipo: fluxo.tipo,
      imagemUrl: fluxo.imagemUrl,
      shortName: fluxo.shortName,
      descricao: fluxo.descricao,
      criadoEm: fluxo.criadoEm,
      canalNome: canal.nome,
      canalTipo: canal.tipo,
      canalAtivo: canal.ativo,
    })
    .from(fluxo)
    .leftJoin(canal, eq(canal.id, fluxo.canalId))
    .where(and(eq(fluxo.tenantId, tid), eq(fluxo.id, id)))
    .limit(1);
  return linha ?? null;
}

export type ContatoDoFluxo = NonNullable<Awaited<ReturnType<typeof carregarContato>>>;

/** O fuso do tenant, para o "hoje" e o "criado em" não serem o fuso do servidor. */
export async function fusoDoTenant(tx: TransacaoPipe): Promise<string> {
  const [linha] = await tx.select({ fuso: tenant.fuso }).from(tenant).limit(1);
  return linha?.fuso ?? 'America/Sao_Paulo';
}

/* ------------------------------------------------------------- Contatos */

export async function listarContatosDoFluxo(tx: TransacaoPipe, tid: string, fluxoId: string) {
  const [bot] = await tx
    .select({ canalId: fluxo.canalId, canalNome: canal.nome, canalTipo: canal.tipo })
    .from(fluxo)
    .leftJoin(canal, eq(canal.id, fluxo.canalId))
    .where(and(eq(fluxo.id, fluxoId), eq(fluxo.tenantId, tid)))
    .limit(1);
  if (!bot?.canalId) return [];

  return tx
    .select({
      id: contato.id,
      nome: contato.nome,
      email: contato.email,
      telefone: contato.telefoneE164,
      avatarUrl: contato.avatarUrl,
      canalNome: canal.nome,
      canalTipo: canal.tipo,
      conversas: sql<number>`count(distinct ${conversa.id})::int`,
      ultimaConversa: sql<Date | null>`max(coalesce(${conversa.ultimaMensagemEm}, ${conversa.criadaEm}))`,
    })
    .from(contato)
    .innerJoin(conversa, eq(conversa.contatoId, contato.id))
    .innerJoin(inbox, eq(inbox.id, conversa.inboxId))
    .innerJoin(canal, eq(canal.id, inbox.canalId))
    .where(
      and(eq(contato.tenantId, tid), eq(inbox.canalId, bot.canalId), isNull(contato.excluidoEm)),
    )
    .groupBy(contato.id, canal.id)
    .orderBy(asc(contato.nome))
    .limit(500);
}

export type ContatoListado = Awaited<ReturnType<typeof listarContatosDoFluxo>>[number];

export async function carregarDetalheContatoDoFluxo(
  tx: TransacaoPipe,
  tid: string,
  fluxoId: string,
  contatoId: string,
  ticketId?: string,
) {
  const [bot] = await tx
    .select({ canalId: fluxo.canalId, canalNome: canal.nome, canalTipo: canal.tipo })
    .from(fluxo)
    .leftJoin(canal, eq(canal.id, fluxo.canalId))
    .where(and(eq(fluxo.id, fluxoId), eq(fluxo.tenantId, tid)))
    .limit(1);
  if (!bot) return null;

  const [pessoa] = await tx
    .select({
      id: contato.id,
      nome: contato.nome,
      email: contato.email,
      telefone: contato.telefoneE164,
      documento: contato.documento,
      avatarUrl: contato.avatarUrl,
      atributos: contato.atributos,
      criadoEm: contato.criadoEm,
    })
    .from(contato)
    .where(and(eq(contato.id, contatoId), eq(contato.tenantId, tid), isNull(contato.excluidoEm)))
    .limit(1);
  if (!pessoa) return null;

  const [identidade] = bot.canalTipo
    ? await tx
        .select({ valor: contatoIdentidade.identificador })
        .from(contatoIdentidade)
        .where(
          and(
            eq(contatoIdentidade.tenantId, tid),
            eq(contatoIdentidade.contatoId, contatoId),
            eq(contatoIdentidade.canalTipo, bot.canalTipo),
          ),
        )
        .limit(1)
    : [];

  const conversas = bot.canalId
    ? await tx
        .select({
          id: conversa.id,
          estado: conversa.estado,
          criadaEm: conversa.criadaEm,
          encerradaEm: conversa.encerradaEm,
          inbox: inbox.nome,
          fila: fila.nome,
          atendente: usuario.nome,
          atendenteEmail: usuario.email,
          resumo: classificacaoConversa.resumo,
        })
        .from(conversa)
        .innerJoin(inbox, eq(inbox.id, conversa.inboxId))
        .leftJoin(fila, eq(fila.id, conversa.filaId))
        .leftJoin(usuario, eq(usuario.id, conversa.atendenteId))
        .leftJoin(classificacaoConversa, eq(classificacaoConversa.conversaId, conversa.id))
        .where(
          and(
            eq(conversa.tenantId, tid),
            eq(conversa.contatoId, contatoId),
            eq(inbox.canalId, bot.canalId),
          ),
        )
        .orderBy(desc(conversa.criadaEm))
        .limit(50)
    : [];

  const selecionada = conversas.find((item) => item.id === ticketId) ?? conversas[0];
  const historico = selecionada
    ? await tx
        .select({
          id: mensagem.id,
          texto: mensagem.conteudo,
          tipo: mensagem.tipo,
          direcao: mensagem.direcao,
          autor: mensagem.autorTipo,
          estado: mensagem.estadoEntrega,
          criadaEm: mensagem.criadaEm,
        })
        .from(mensagem)
        .where(and(eq(mensagem.tenantId, tid), eq(mensagem.conversaId, selecionada.id)))
        .orderBy(asc(mensagem.criadaEm))
        .limit(200)
    : [];

  return {
    pessoa,
    identidade: identidade?.valor ?? null,
    canal: bot.canalNome,
    conversas,
    selecionada: selecionada ?? null,
    historico,
  };
}

export type DetalheDoContato = NonNullable<
  Awaited<ReturnType<typeof carregarDetalheContatoDoFluxo>>
>;

/* ------------------------------------------------------------------ Log */

export async function carregarLogsDoFluxo(
  tx: TransacaoPipe,
  tid: string,
  fluxoId: string,
  busca = '',
) {
  const [bot] = await tx
    .select({ canalId: fluxo.canalId, nome: canal.nome })
    .from(fluxo)
    .leftJoin(canal, eq(canal.id, fluxo.canalId))
    .where(and(eq(fluxo.id, fluxoId), eq(fluxo.tenantId, tid)))
    .limit(1);
  if (!bot?.canalId) return [];
  const filtroBusca = busca.trim() ? ilike(mensagem.conteudo, `%${busca.trim()}%`) : undefined;
  const linhas = await tx
    .select({
      id: mensagem.id,
      criadaEm: mensagem.criadaEm,
      direcao: mensagem.direcao,
      tipo: mensagem.tipo,
      conteudo: mensagem.conteudo,
      metadata: mensagem.dados,
      contato: contato.telefoneE164,
      canal: canal.nome,
    })
    .from(mensagem)
    .innerJoin(conversa, eq(conversa.id, mensagem.conversaId))
    .innerJoin(contato, eq(contato.id, conversa.contatoId))
    .innerJoin(inbox, eq(inbox.id, conversa.inboxId))
    .innerJoin(canal, eq(canal.id, inbox.canalId))
    .where(and(eq(mensagem.tenantId, tid), eq(inbox.canalId, bot.canalId), filtroBusca))
    .orderBy(desc(mensagem.criadaEm))
    .limit(20);
  return linhas.map((linha) => ({
    ...linha,
    de: linha.direcao === 'entrada' ? linha.contato : linha.canal,
    para: linha.direcao === 'entrada' ? linha.canal : linha.contato,
  }));
}

export type LogDoFluxo = Awaited<ReturnType<typeof carregarLogsDoFluxo>>[number];

/* --------------------------------------------------------------- Growth */

export interface EnvioGrowth {
  id: string;
  disparoId: string | null;
  contatoNome: string | null;
  templateNome: string | null;
  canalNome: string;
  estado: string | null;
  erroCodigo: string | null;
  criadaEm: string;
  custoCentavos: number | null;
}

export interface ModeloGrowth {
  id: string;
  nome: string;
  idioma: string;
  categoria: string;
  statusMeta: string;
  corpo: string;
  variaveis: string[];
  canalId: string;
  canalNome: string;
}

export interface ContatoGrowth {
  id: string;
  nome: string | null;
  telefone: string;
}

export interface DadosDeGrowth {
  canais: { id: string; nome: string }[];
  modelos: ModeloGrowth[];
  contatos: ContatoGrowth[];
  envios: EnvioGrowth[];
}

/**
 * A origem lista campanhas; o Pipe ainda não persiste campanha nem audiência.
 * A leitura usa mensagens de template reais das últimas 72h, janela do painel da
 * API e do rastro da tela de origem. ponytail: cada linha é uma mensagem, não uma
 * campanha; quando houver entidade campanha, agrupar por disparo_id sem inferir
 * campanhas a partir de horário ou modelo.
 */
export async function carregarGrowth(tx: TransacaoPipe, tid: string): Promise<DadosDeGrowth> {
  const desde = new Date(Date.now() - 72 * 60 * 60 * 1000);
  /* As consultas vão em série: em paralelo o driver disputa a mesma conexão
     e o `set_config` do tenant se perde. */
  const canais = await tx
    .select({ id: canal.id, nome: canal.nome })
    .from(canal)
    .where(and(eq(canal.tenantId, tid), eq(canal.tipo, 'whatsapp_cloud'), eq(canal.ativo, true)))
    .orderBy(asc(canal.nome));
  const modelos = await tx
    .select({
      id: templateMensagem.id,
      nome: templateMensagem.nome,
      idioma: templateMensagem.idioma,
      categoria: templateMensagem.categoria,
      statusMeta: templateMensagem.statusMeta,
      corpo: templateMensagem.corpo,
      variaveis: templateMensagem.variaveis,
      canalId: canal.id,
      canalNome: canal.nome,
    })
    .from(templateMensagem)
    .innerJoin(canal, eq(canal.id, templateMensagem.canalId))
    .where(and(eq(templateMensagem.tenantId, tid), eq(canal.tipo, 'whatsapp_cloud')))
    .orderBy(asc(templateMensagem.nome));
  const contatos = await tx
    .select({ id: contato.id, nome: contato.nome, telefone: contato.telefoneE164 })
    .from(contato)
    .where(
      and(
        eq(contato.tenantId, tid),
        eq(contato.bloqueado, false),
        isNull(contato.excluidoEm),
        isNotNull(contato.telefoneE164),
      ),
    )
    .orderBy(asc(contato.nome))
    .limit(1000);
  const envios = await tx
    .select({
      id: mensagem.id,
      disparoId: mensagem.disparoId,
      contatoNome: contato.nome,
      templateNome: templateMensagem.nome,
      canalNome: canal.nome,
      estado: mensagem.estadoEntrega,
      erroCodigo: mensagem.erroCodigo,
      criadaEm: mensagem.criadaEm,
      custoCentavos: mensagem.custoCentavos,
    })
    .from(mensagem)
    .innerJoin(conversa, eq(conversa.id, mensagem.conversaId))
    .innerJoin(contato, eq(contato.id, conversa.contatoId))
    .innerJoin(inbox, eq(inbox.id, conversa.inboxId))
    .innerJoin(canal, eq(canal.id, inbox.canalId))
    .leftJoin(templateMensagem, eq(templateMensagem.id, mensagem.templateId))
    .where(
      and(
        eq(mensagem.tenantId, tid),
        eq(mensagem.direcao, 'saida'),
        isNotNull(mensagem.templateId),
        gte(mensagem.criadaEm, desde),
      ),
    )
    .orderBy(desc(mensagem.criadaEm))
    .limit(500);

  return {
    canais,
    contatos: contatos.flatMap((pessoa) =>
      pessoa.telefone ? [{ ...pessoa, telefone: pessoa.telefone }] : [],
    ),
    modelos: modelos.map((modelo) => ({
      ...modelo,
      variaveis: lerVariaveis(modelo.variaveis),
    })),
    envios: envios.map((envio) => ({
      ...envio,
      criadaEm: envio.criadaEm.toISOString(),
    })),
  };
}

/* ------------------------------------------------------------ Conteúdos */

export interface ModeloListado {
  id: string;
  canalId: string;
  corpo: string;
  nome: string;
  idioma: string;
  categoria: string;
  statusMeta: string;
  cabecalhoTipo: string;
  variaveis: string[];
  canalNome: string;
}

/** `variaveis` é `jsonb` sem `check`: uma linha corrompida não pode derrubar a lista inteira. */
function lerVariaveis(valor: unknown): string[] {
  return Array.isArray(valor) ? valor.filter((v): v is string => typeof v === 'string') : [];
}

export async function carregarModelos(
  tx: TransacaoPipe,
  canalId?: string,
): Promise<ModeloListado[]> {
  const linhas = await tx
    .select({
      id: templateMensagem.id,
      canalId: templateMensagem.canalId,
      corpo: templateMensagem.corpo,
      nome: templateMensagem.nome,
      idioma: templateMensagem.idioma,
      categoria: templateMensagem.categoria,
      statusMeta: templateMensagem.statusMeta,
      cabecalhoTipo: templateMensagem.cabecalhoTipo,
      variaveis: templateMensagem.variaveis,
      canalNome: canal.nome,
    })
    .from(templateMensagem)
    .innerJoin(canal, eq(canal.id, templateMensagem.canalId))
    .where(canalId ? eq(templateMensagem.canalId, canalId) : undefined)
    .orderBy(asc(templateMensagem.nome));

  return linhas.map((l) => ({ ...l, variaveis: lerVariaveis(l.variaveis) }));
}

export async function carregarCanalDoFluxo(
  tx: TransacaoPipe,
  tid: string,
  fluxoId: string,
): Promise<string | null> {
  const [bot] = await tx
    .select({ canalId: fluxo.canalId })
    .from(fluxo)
    .where(and(eq(fluxo.id, fluxoId), eq(fluxo.tenantId, tid)))
    .limit(1);
  return bot?.canalId ?? null;
}

/* --------------------------------------------------------------- Portal */

/**
 * A grade do portal, PAGINADA no banco (a origem conta com centenas de bots por
 * conta). `arquivado` fica fora: arquivar é tirar de circulação sem apagar.
 * Do mais novo para o mais antigo, que é a ordem da origem.
 */
export async function carregarGradeDoPortal(
  tx: TransacaoPipe,
  pedido: { busca: string; pagina: number; porPagina: number },
): Promise<GradeDoPortal> {
  const busca = pedido.busca.trim();
  const emUso = ne(fluxo.estado, 'arquivado');
  const filtro = busca ? and(emUso, ilike(fluxo.nome, `%${busca}%`)) : emUso;
  /* UMA de cada vez: a transação vive numa conexão só. */
  const total = (await tx.select({ n: count() }).from(fluxo).where(emUso))[0]?.n ?? 0;
  const encontrados = busca
    ? ((await tx.select({ n: count() }).from(fluxo).where(filtro))[0]?.n ?? 0)
    : total;
  const fluxos = await tx
    .select({
      id: fluxo.id,
      nome: fluxo.nome,
      estado: fluxo.estado,
      tipo: fluxo.tipo,
      imagemUrl: fluxo.imagemUrl,
    })
    .from(fluxo)
    .where(filtro)
    .orderBy(desc(fluxo.criadoEm))
    .limit(pedido.porPagina)
    .offset((pedido.pagina - 1) * pedido.porPagina);
  return { fluxos, total, encontrados };
}
