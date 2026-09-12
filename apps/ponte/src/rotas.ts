import { sql } from 'drizzle-orm';
import { noTenant } from './banco.js';
import { ausente, colecao, falha, ok, partirUri, TIPO_DOCUMENTO, TIPO_TICKET } from './lime.js';
import type { ComandoLime, RespostaLime } from './lime.js';
import { comoConta, comoDocumentos, comoTicket, comoTime } from './traducao.js';
import type { LinhaConversa, LinhaMensagem } from './traducao.js';
import { carregarGlobais, carregarRascunho, gravarFluxo } from './builder.js';
import { assumirProximo, encerrar, responder, transferirParaFila } from './acoes.js';

/**
 * O roteador de comandos LIME.
 *
 * Desenho central: **rota que ainda não existe aqui devolve `null`**, e o laboratório
 * cai de volta no mock. É o que permite migrar a cópia comando a comando sem nunca
 * deixar a tela quebrada no meio do caminho.
 */

export interface Sessao {
  tenantId: string;
  usuarioId: string;
  email: string;
  nome: string | null;
}

interface Contexto {
  sessao: Sessao;
  caminho: string;
  query: URLSearchParams;
  cmd: ComandoLime;
}

type Manipulador = (ctx: Contexto) => Promise<RespostaLime>;

/** Uma rota declara os métodos que aceita. O padrão é só leitura. */
type Rota = [RegExp, Manipulador, string[]?];

const COLUNAS = `
  c.id, c.estado, c.prioridade, c.criada_em, c.atribuida_em, c.encerrada_em,
  c.ultima_mensagem_em, c.ultima_mensagem_de, c.fila_id, f.nome as fila_nome,
  c.atendente_id, u.nome as atendente_nome, u.email as atendente_email,
  ct.id as contato_id, ct.nome as contato_nome, ct.telefone_e164 as contato_telefone,
  ca.tipo as canal_tipo,
  (select m.conteudo from mensagem m
    where m.conversa_id = c.id order by m.criada_em desc limit 1) as ultima_mensagem_texto,
  (select count(*)::int from mensagem m
    where m.conversa_id = c.id and m.direcao = 'entrada' and m.lida_em is null) as nao_lidas
`;

const DE = `
  from conversa c
  join contato ct on ct.id = c.contato_id
  join inbox ib on ib.id = c.inbox_id
  join canal ca on ca.id = ib.canal_id
  left join fila f on f.id = c.fila_id
  left join usuario u on u.id = c.atendente_id
`;

/** Fila e atendimento em curso: é o que o Desk mostra na lista da esquerda. */
const ABERTAS = `c.estado in ('na_fila','atribuida','em_atendimento','em_espera')`;

async function conversasAbertas(sessao: Sessao, limite = 100): Promise<LinhaConversa[]> {
  return noTenant(sessao.tenantId, async (tx) => {
    const { rows } = await tx.execute<LinhaConversa>(sql`
      select ${sql.raw(COLUNAS)} ${sql.raw(DE)}
       where ${sql.raw(ABERTAS)}
       order by c.ultima_mensagem_em desc nulls last, c.criada_em desc
       limit ${limite}
    `);
    return rows;
  });
}

/* Todas as rotas com barra usam `new RegExp` com classe de caractere, e não literal
   de expressão regular. Motivo prático: barra escapada não sobrevive às ferramentas
   que editam este arquivo por script, e o arquivo já quebrou três vezes por isso. */
const ROTA_PING = new RegExp('^[/]ping');
const ROTA_AGORA = new RegExp('^[/]now');
const ROTA_RECIBO = new RegExp('^[/]receipt');
/* Ancorada: sem isto ela casaria também com `/accounts/{email}`, que é outra coisa. */
const ROTA_CONTA = new RegExp('^[/]account(\\?|$)');
const ROTA_INFO_AGENTE = new RegExp('^[/]agents[/]info');
const ROTA_FILAS = new RegExp('^[/]attendance-teams');
const ROTA_TICKETS = new RegExp('^[/]tickets(\\?|$)');
const ROTA_TICKETS_ATIVOS = new RegExp('^[/]tickets[/]active');
const ROTA_MENSAGENS = new RegExp('^[/]tickets[/][^/]*[/]messages');
const ROTA_TICKET = new RegExp('^[/]tickets[/][^/]+');

const ROTA_FLUXO_RASCUNHO = new RegExp('^[/]buckets[/]blip_portal:builder_working_flow');
const ROTA_ACOES_GLOBAIS = new RegExp('^[/]buckets[/]blip_portal:builder_working_global_actions');
const ROTA_FLUXO_PUBLICADO = new RegExp('^[/]buckets[/]blip_portal:builder_published_flow');

/* Ações do atendente. As URIs são as que a tela dispara, levantadas do bundle e
   registradas em `docs/pesquisa/blip-desk-regras-tecnicas.md`. */
const ROTA_ASSUMIR = new RegExp('^[/]tickets[/]claim');
const ROTA_CONFIRMA = new RegExp('^[/]tickets[/][^/]+[/]confirm-received');
const ROTA_ENCERRAR = new RegExp('^[/]tickets[/][^/]+[/]close');
const ROTA_MUDAR_STATUS = new RegExp('^[/]tickets[/]change-status');
const ROTA_TRANSFERIR = new RegExp('^[/]tickets[/][^/]+[/]transfer');
/* Responder NÃO é comando: a tela usa `sendMessage` no cliente, e o laboratório
   converte aquela chamada nesta URI, que é nossa. */
const ROTA_RESPONDER = new RegExp('^[/]pipe[/]responder');

const rotas: Rota[] = [
  /* ---- vida e relógio: a tela pergunta o tempo todo ---- */
  [ROTA_PING, async () => ok({})],
  [ROTA_AGORA, async () => ok({ now: new Date().toISOString() })],
  [ROTA_RECIBO, async () => ok({})],

  /* ---- ações do atendente, antes das rotas de leitura de ticket ----
     A ordem importa: `/tickets/{id}/close` também casa com o padrão de
     `/tickets/{id}`, e quem chega primeiro responde. */
  [
    ROTA_ASSUMIR,
    async ({ sessao }) => {
      const id = await assumirProximo(sessao);
      // Sem ninguém na fila, a tela espera coleção vazia, não erro.
      return id ? ok({ id }, TIPO_TICKET) : colecao([], TIPO_TICKET);
    },
    ['get', 'set'],
  ],
  [ROTA_CONFIRMA, async () => ok({}), ['set']],
  [
    ROTA_ENCERRAR,
    async ({ sessao, caminho, cmd }) => {
      const id = caminho.split('/')[2] ?? '';
      const r = (cmd.resource ?? {}) as { tags?: string[] };
      await encerrar(sessao, id, r.tags ?? []);
      return ok({});
    },
    ['set'],
  ],
  [
    ROTA_MUDAR_STATUS,
    async ({ sessao, cmd }) => {
      const r = (cmd.resource ?? {}) as { id?: string; status?: string; tags?: string[] };
      /* A tela usa este comando para encerrar (status começando em `Closed`) e para
         outras mudanças que ainda não traduzimos. O que não for encerramento
         responde vazio, em vez de virar operação errada no banco. */
      if (!r.id || !String(r.status ?? '').startsWith('Closed')) return ok({});
      await encerrar(sessao, r.id, r.tags ?? []);
      return ok({});
    },
    ['set'],
  ],
  [
    ROTA_TRANSFERIR,
    async ({ sessao, caminho, cmd }) => {
      const id = caminho.split('/')[2] ?? '';
      const r = (cmd.resource ?? {}) as { team?: string; agentIdentity?: string };
      // Transferir para pessoa específica ainda não: só para fila.
      if (!r.team || r.team === 'DIRECT_TRANSFER') {
        return falha(4, 'transferência para atendente específico ainda não');
      }
      await transferirParaFila(sessao, id, r.team);
      return ok({});
    },
    ['set'],
  ],
  [
    ROTA_RESPONDER,
    async ({ sessao, cmd }) => {
      const r = (cmd.resource ?? {}) as { conversaId?: string; texto?: string };
      if (!r.conversaId || !r.texto) return falha(5, 'faltou a conversa ou o texto');
      return ok(await responder(sessao, r.conversaId, r.texto));
    },
    ['set'],
  ],

  /* ---- quem está logado ---- */
  [
    ROTA_CONTA,
    async ({ sessao }) => {
      const dados = await noTenant(sessao.tenantId, async (tx) => {
        const { rows: estado } = await tx.execute<{ estado: string }>(sql`
          select estado from status_atendente where usuario_id = ${sessao.usuarioId}::uuid limit 1
        `);
        const { rows: filas } = await tx.execute<{ nome: string }>(sql`
          select f.nome from fila f
            join fila_atendente fa on fa.fila_id = f.id
           where fa.usuario_id = ${sessao.usuarioId}::uuid
           order by f.nome
        `);
        /* A tela usa `isOwner` para liberar os itens de administração da barra.
           Mandar `false` para quem é administrador some com metade da navbar. */
        const { rows: admin } = await tx.execute<{ existe: number }>(sql`
          select 1 as existe from usuario_papel up
            join papel p on p.id = up.papel_id
           where up.usuario_id = ${sessao.usuarioId}::uuid and p.nome = 'administrador'
           limit 1
        `);
        return {
          estado: estado[0]?.estado ?? 'offline',
          filas: filas.map((f) => f.nome),
          ehAdministrador: admin.length > 0,
        };
      });
      return ok(
        comoConta(
          {
            id: sessao.usuarioId,
            nome: sessao.nome,
            email: sessao.email,
            estado: dados.estado,
            ehAdministrador: dados.ehAdministrador,
          },
          dados.filas,
        ),
      );
    },
  ],

  /* ---- o contador do topo da lista ---- */
  [
    ROTA_INFO_AGENTE,
    async ({ sessao }) => {
      const linhas = await conversasAbertas(sessao, 500);
      const naFila = linhas.filter((l) => l.estado === 'na_fila').length;
      const minhas = linhas.filter((l) => l.atendente_id === sessao.usuarioId);
      return ok(
        {
          status: 'Online',
          waitingTicketsCount: naFila,
          waitingClaimableTicketsCount: naFila,
          readingTime: '00:00:00',
          openedTicketsIdsList: minhas.map((l) => l.id),
        },
        'application/vnd.iris.desk.attendant-tickets-info+json',
      );
    },
  ],

  /* ---- as filas do cliente ---- */
  [
    ROTA_FILAS,
    async ({ sessao }) => {
      const filas = await noTenant(sessao.tenantId, async (tx) => {
        const { rows } = await tx.execute<{ id: string; nome: string }>(
          sql`select id, nome from fila order by nome`,
        );
        return rows;
      });
      return colecao(filas.map(comoTime));
    },
  ],

  /* ---- a conversa aberta ----
     O Desk pede `/tickets//messages` (com id vazio) num instante da abertura; o
     original responde coleção vazia em vez de erro, e a tela segue. */
  [
    ROTA_MENSAGENS,
    async ({ sessao, caminho }) => {
      const id = caminho.split('/')[2];
      if (!id) return colecao([], TIPO_DOCUMENTO);
      const linhas = await noTenant(sessao.tenantId, async (tx) => {
        const { rows } = await tx.execute<LinhaMensagem>(sql`
          select id, criada_em, direcao, autor_tipo, tipo, conteudo
            from mensagem
           where conversa_id = ${id}::uuid
           order by criada_em
           limit 200
        `);
        return rows;
      });
      return colecao(comoDocumentos(linhas), TIPO_DOCUMENTO);
    },
  ],

  /* ---- as listas ---- */
  [
    ROTA_TICKETS_ATIVOS,
    async ({ sessao }) => {
      const linhas = await conversasAbertas(sessao);
      const minhas = linhas.filter((l) => l.atendente_id === sessao.usuarioId);
      return colecao(
        minhas.map((l) => comoTicket(l)),
        TIPO_TICKET,
      );
    },
  ],
  [
    ROTA_TICKETS,
    async ({ sessao }) => {
      const linhas = await conversasAbertas(sessao);
      return colecao(
        linhas.map((l) => comoTicket(l)),
        TIPO_TICKET,
      );
    },
  ],
  [
    ROTA_TICKET,
    async ({ sessao, caminho }) => {
      const id = caminho.split('/')[2] ?? '';
      const linha = await noTenant(sessao.tenantId, async (tx) => {
        const { rows } = await tx.execute<LinhaConversa>(sql`
          select ${sql.raw(COLUNAS)} ${sql.raw(DE)} where c.id = ${id}::uuid limit 1
        `);
        return rows[0] ?? null;
      });
      return ok(linha ? comoTicket(linha) : {}, TIPO_TICKET);
    },
  ],

  /* ---- Builder: o cliente desenhando o próprio fluxo ---- */
  [
    ROTA_FLUXO_RASCUNHO,
    async ({ sessao, cmd }) => {
      if (cmd.method === 'get') {
        const mapa = await carregarRascunho(sessao);
        return mapa ? ok(mapa) : ausente();
      }
      const globais = await carregarGlobais(sessao);
      const r = await gravarFluxo(sessao, cmd.resource as Record<string, unknown>, globais, false);
      return ok({
        versao: r.versao,
        naoSuportado: r.naoSuportado,
        erroDeValidacao: r.erroDeValidacao,
      });
    },
    ['get', 'set'],
  ],
  [
    ROTA_ACOES_GLOBAIS,
    async ({ sessao, cmd }) => {
      if (cmd.method === 'get') {
        const globais = await carregarGlobais(sessao);
        return globais ? ok(globais) : ausente();
      }
      const mapa = await carregarRascunho(sessao);
      if (!mapa) return ok({});
      await gravarFluxo(sessao, mapa, cmd.resource as Record<string, unknown>, false);
      return ok({});
    },
    ['get', 'set'],
  ],
  [
    ROTA_FLUXO_PUBLICADO,
    async ({ sessao, cmd }) => {
      if (cmd.method === 'get') {
        const mapa = await carregarRascunho(sessao);
        return mapa ? ok(mapa) : ausente();
      }
      const globais = await carregarGlobais(sessao);
      const r = await gravarFluxo(sessao, cmd.resource as Record<string, unknown>, globais, true);
      /* Publicar fluxo inválido não pode passar em silêncio: o motor recusaria
         rodar, e quem clicou em publicar precisa saber. */
      if (r.erroDeValidacao) return ok({ publicado: false, erro: r.erroDeValidacao });
      return ok({ publicado: r.publicado, versao: r.versao });
    },
    ['get', 'set'],
  ],
];

/**
 * Devolve `null` quando a ponte ainda não sabe responder — e aí o laboratório usa o
 * mock. Nunca devolve dado inventado no lugar.
 */
export async function despachar(cmd: ComandoLime, sessao: Sessao): Promise<RespostaLime | null> {
  const { caminho, query } = partirUri(cmd.uri);
  for (const [padrao, manipulador, metodos] of rotas) {
    if (!padrao.test(caminho)) continue;
    if (!(metodos ?? ['get']).includes(cmd.method)) return null;
    return manipulador({ sessao, caminho, query, cmd });
  }
  return null;
}

export const CAMINHOS_ATENDIDOS = rotas.map(([p]) => p.source);
