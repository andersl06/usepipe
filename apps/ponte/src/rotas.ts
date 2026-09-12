import { sql } from 'drizzle-orm';
import { noTenant } from './banco.js';
import { ausente, colecao, ok, partirUri, TIPO_DOCUMENTO, TIPO_TICKET } from './lime.js';
import type { ComandoLime, RespostaLime } from './lime.js';
import { comoConta, comoDocumentos, comoTicket, comoTime } from './traducao.js';
import type { LinhaConversa, LinhaMensagem } from './traducao.js';
import { carregarGlobais, carregarRascunho, gravarFluxo } from './builder.js';

/**
 * O roteador de comandos LIME.
 *
 * Desenho central: **rota que ainda não existe aqui devolve `null`**, e o laboratório
 * cai de volta no mock. É o que permite migrar a cópia comando a comando sem nunca
 * deixar a tela quebrada no meio do caminho. Enquanto `/tickets` já vem do banco,
 * `/copilot/*` continua vindo do mock, e ninguém percebe a costura.
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

/* As três rotas do Builder usam `new RegExp` de propósito: barra escapada dentro de
   literal de expressão regular não sobrevive às ferramentas que editam este arquivo
   por script. Classe de caractere resolve, e lê igual. */
const ROTA_FLUXO_RASCUNHO = new RegExp('^[/]buckets[/]blip_portal:builder_working_flow$');
const ROTA_ACOES_GLOBAIS = new RegExp('^[/]buckets[/]blip_portal:builder_working_global_actions$');
const ROTA_FLUXO_PUBLICADO = new RegExp('^[/]buckets[/]blip_portal:builder_published_flow$');

const rotas: Rota[] = [
  /* ---- vida e relógio: a tela pergunta o tempo todo ---- */
  [/^\/ping$/, async () => ok({})],
  [/^\/now$/, async () => ok({ now: new Date().toISOString() })],
  [/^\/receipt$/, async () => ok({})],

  /* ---- quem está logado ---- */
  [
    /^\/account$/,
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
        /* A tela usa `isOwner` para liberar os itens de administração da barra
           lateral. No Pipe isso é o papel de administrador — e mandar `false`
           para quem é admin some com metade da navbar. */
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
    /^\/agents\/info$/,
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

  /* ---- as filas do tenant ---- */
  [
    /^\/attendance-teams/,
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

  /* ---- a lista de atendimentos ---- */
  [
    /^\/tickets$/,
    async ({ sessao }) => {
      const linhas = await conversasAbertas(sessao);
      return colecao(
        linhas.map((l) => comoTicket(l)),
        TIPO_TICKET,
      );
    },
  ],
  [
    /^\/tickets\/active$/,
    async ({ sessao }) => {
      const linhas = await conversasAbertas(sessao);
      const minhas = linhas.filter((l) => l.atendente_id === sessao.usuarioId);
      return colecao(
        minhas.map((l) => comoTicket(l)),
        TIPO_TICKET,
      );
    },
  ],

  /* ---- a conversa aberta ----
     O Desk pede `/tickets//messages` (com id vazio) num instante da abertura; o
     original responde coleção vazia em vez de erro, e a tela segue. */
  [
    /^\/tickets\/[^/]*\/messages$/,
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
  [
    /^\/tickets\/[^/]+$/,
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

  /* ---- Builder: o cliente desenhando o próprio fluxo ----
     Estes três baldes são o Builder inteiro. Ler devolve o que está no banco;
     gravar passa pelo mesmo importador que já grava fluxo, versão, blocos e
     transições. Publicar é o mesmo caminho com `publicar` ligado. */
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
         rodar, e quem clicou em publicar precisa saber disso. */
      if (r.erroDeValidacao) return ok({ publicado: false, erro: r.erroDeValidacao });
      return ok({ publicado: r.publicado, versao: r.versao });
    },
    ['get', 'set'],
  ],
];

/**
 * Devolve `null` quando a ponte ainda não sabe responder — e aí o laboratório usa o
 * mock. Nunca devolve dado inventado no lugar: tela com número falso é pior do que
 * tela com o número do mock, que todo mundo sabe que é de mentira.
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
