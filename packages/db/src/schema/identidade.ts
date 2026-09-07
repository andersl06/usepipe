import { sql } from 'drizzle-orm';
import {
  boolean,
  index,
  jsonb,
  pgTable,
  primaryKey,
  text,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { carimbos, id, listaCheck, momento } from './comum.js';

/**
 * Módulo 1 — Identidade e tenancy. Base de tudo; não depende de nenhum outro módulo.
 * O `tenant` carrega a personalização (nome, logo, cor, fuso, idioma): white-label é
 * configuração, nunca build separado.
 */

/**
 * Onde o tenant está hospedado.
 *
 * `compartilhada` é o banco de todo mundo, com RLS — é o padrão e serve à
 * esmagadora maioria. `dedicada` é o cliente que saiu para instância própria,
 * por contrato ou por peso. Ver `docs/pesquisa/arquitetura-multi-tenant.md`.
 *
 * O campo nasce agora, com todo mundo em `compartilhada`, porque criar coluna
 * em tabela pequena é barato hoje e caro na véspera da primeira migração — que
 * é exatamente quando ele vai fazer falta, para o código saber a quem
 * perguntar sem consultar planilha.
 */
export const IMPLANTACOES = ['compartilhada', 'dedicada'] as const;

/**
 * Os três planos, com os limites que a cobrança usa.
 *
 * Decididos em `docs/specs/2026-09-07-preco.md`. Ficam aqui, e não em
 * configuração, porque plano é regra: o teto de conversa analisada por IA
 * precisa estar no mesmo lugar que o código que corta, e preço em variável de
 * ambiente vira divergência entre o que a tela mostra e o que a fatura cobra.
 *
 * `conversasIaPorAtendente` é a franquia, e é o número que segura a margem: a IA
 * é o único custo que escala com uso, e sem teto um cliente de volume alto come
 * a margem inteira sem ninguém perceber até a fatura chegar.
 */
export const PLANOS = ['essencial', 'operacao', 'escala'] as const;
export type Plano = (typeof PLANOS)[number];

export interface LimitesDoPlano {
  precoPorAtendenteCentavos: number;
  minimoDeAtendentes: number;
  conversasIaPorAtendente: number;
  /** Fração das conversas que a monitoria avalia. 1 é todas. */
  amostragemDeMonitoria: number;
  excedenteCentavosPorConversa: number;
  sso: boolean;
}

export const LIMITES_DO_PLANO: Readonly<Record<Plano, LimitesDoPlano>> = {
  essencial: {
    precoPorAtendenteCentavos: 9_700,
    minimoDeAtendentes: 3,
    conversasIaPorAtendente: 300,
    amostragemDeMonitoria: 0.2,
    excedenteCentavosPorConversa: 25,
    sso: false,
  },
  operacao: {
    precoPorAtendenteCentavos: 17_900,
    minimoDeAtendentes: 5,
    conversasIaPorAtendente: 1_000,
    amostragemDeMonitoria: 1,
    excedenteCentavosPorConversa: 18,
    sso: false,
  },
  /* Sob contrato: preço e franquia entram no registro do tenant, não na tabela. */
  escala: {
    precoPorAtendenteCentavos: 0,
    minimoDeAtendentes: 20,
    conversasIaPorAtendente: 0,
    amostragemDeMonitoria: 1,
    excedenteCentavosPorConversa: 0,
    sso: true,
  },
};

export const tenant = pgTable(
  'tenant',
  {
    id: id(),
    nome: text('nome').notNull(),
    slug: text('slug').notNull().unique(),
    fuso: text('fuso').notNull().default('America/Sao_Paulo'),
    idioma: text('idioma').notNull().default('pt-BR'),
    logoUrl: text('logo_url'),
    corPrimaria: text('cor_primaria'),
    plano: text('plano').notNull().default('essencial'),
    implantacao: text('implantacao').notNull().default('compartilhada'),
    ativo: boolean('ativo').notNull().default(true),
    /**
     * A instância do Twenty deste cliente, e a chave para falar com ela.
     *
     * Uma instância POR CLIENTE, decidido em `docs/specs/2026-09-07-integracao-twenty.md`
     * §5: o isolamento do CRM é físico, e não há instância padrão. Vazio significa
     * "este cliente não tem CRM", e a integração inteira não acontece — nunca um
     * fallback, porque fallback silencioso é como o dado de um cliente vai parar no
     * CRM de outro.
     *
     * `twentyChave` é a chave de API, CIFRADA em repouso pelo mesmo chaveiro do token
     * da Meta (`PIPE_CHAVES_SEGREDO`). Diferente do token da Meta, esta também LÊ: quem
     * a tiver tem a base de clientes daquele tenant inteira.
     */
    twentyUrl: text('twenty_url'),
    twentyChave: text('twenty_chave'),
    ...carimbos(),
  },
  (t) => [
    listaCheck('tenant_implantacao_ck', t.implantacao, IMPLANTACOES),
    listaCheck('tenant_plano_ck', t.plano, PLANOS),
  ],
);

/**
 * Toda tabela de negócio referencia o tenant por aqui. Fica em identidade e não em
 * `comum` para não criar ciclo de import com a própria tabela `tenant`.
 */
export const refTenant = () =>
  uuid('tenant_id')
    .notNull()
    .references(() => tenant.id, { onDelete: 'cascade' });

export const usuario = pgTable(
  'usuario',
  {
    id: id(),
    tenantId: refTenant(),
    nome: text('nome').notNull(),
    email: text('email').notNull(),
    senhaHash: text('senha_hash'),
    avatarUrl: text('avatar_url'),
    ativo: boolean('ativo').notNull().default(true),
    ultimoAcessoEm: momento('ultimo_acesso_em'),
    ...carimbos(),
  },
  (t) => [uniqueIndex('usuario_tenant_email_uk').on(t.tenantId, t.email)],
);

export const papel = pgTable(
  'papel',
  {
    id: id(),
    tenantId: refTenant(),
    nome: text('nome').notNull(),
    descricao: text('descricao'),
    /** Papel do dia 1 não é editável pelo cliente. */
    deSistema: boolean('de_sistema').notNull().default(false),
    ...carimbos(),
  },
  (t) => [uniqueIndex('papel_tenant_nome_uk').on(t.tenantId, t.nome)],
);

/**
 * Catálogo global de capacidades nomeadas (`conversa.transferir`,
 * `relatorio.esforco.ver`). Não tem tenant de propósito: é vocabulário do produto,
 * igual para todo mundo, e por isso é a única tabela sem RLS junto de `tenant`.
 */
export const permissao = pgTable('permissao', {
  codigo: text('codigo').primaryKey(),
  descricao: text('descricao').notNull(),
  grupo: text('grupo').notNull(),
});

export const papelPermissao = pgTable(
  'papel_permissao',
  {
    tenantId: refTenant(),
    papelId: uuid('papel_id')
      .notNull()
      .references(() => papel.id, { onDelete: 'cascade' }),
    permissaoCodigo: text('permissao_codigo')
      .notNull()
      .references(() => permissao.codigo, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.papelId, t.permissaoCodigo] })],
);

export const usuarioPapel = pgTable(
  'usuario_papel',
  {
    tenantId: refTenant(),
    usuarioId: uuid('usuario_id')
      .notNull()
      .references(() => usuario.id, { onDelete: 'cascade' }),
    papelId: uuid('papel_id')
      .notNull()
      .references(() => papel.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.usuarioId, t.papelId] })],
);

export const equipe = pgTable('equipe', {
  id: id(),
  tenantId: refTenant(),
  nome: text('nome').notNull(),
  descricao: text('descricao'),
  ...carimbos(),
});

export const FUNCOES_EQUIPE = ['membro', 'lider'] as const;

export const membroEquipe = pgTable(
  'membro_equipe',
  {
    tenantId: refTenant(),
    equipeId: uuid('equipe_id')
      .notNull()
      .references(() => equipe.id, { onDelete: 'cascade' }),
    usuarioId: uuid('usuario_id')
      .notNull()
      .references(() => usuario.id, { onDelete: 'cascade' }),
    funcao: text('funcao').notNull().default('membro'),
  },
  (t) => [
    primaryKey({ columns: [t.equipeId, t.usuarioId] }),
    listaCheck('membro_equipe_funcao_ck', t.funcao, FUNCOES_EQUIPE),
  ],
);

export const sessao = pgTable(
  'sessao',
  {
    id: id(),
    tenantId: refTenant(),
    usuarioId: uuid('usuario_id')
      .notNull()
      .references(() => usuario.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull(),
    expiraEm: momento('expira_em').notNull(),
    ip: text('ip'),
    agente: text('agente'),
    /** Por onde a pessoa entrou. Auditoria pede, e a revogação por IdP depende. */
    origem: text('origem').notNull().default('senha'),
    criadoEm: momento('criado_em').notNull().defaultNow(),
    encerradaEm: momento('encerrada_em'),
  },
  (t) => [
    uniqueIndex('sessao_token_hash_uk').on(t.tokenHash),
    index('sessao_usuario_idx').on(t.tenantId, t.usuarioId, t.expiraEm),
    listaCheck('sessao_origem_ck', t.origem, ORIGENS_DE_SESSAO),
  ],
);

export const ORIGENS_DE_SESSAO = ['senha', 'google', 'sso'] as const;

/**
 * A conta da pessoa no provedor externo.
 *
 * **A chave NUNCA é o e-mail.** É o par `(emissor, sujeito)` — no Google,
 * `https://accounts.google.com` e o `sub` do `id_token`. E-mail muda de dono
 * dentro de uma empresa: quem herda o endereço de quem saiu herdaria a conta
 * junto. O `sub` é estável e é do Google, não do endereço.
 *
 * `emailNoProvedor` fica só para exibição e diagnóstico; nunca para casar conta.
 *
 * Único e GLOBAL em `(emissor, sujeito)`: uma conta do Google pertence a um
 * usuário, e usuário pertence a um tenant. Deixar duas linhas para o mesmo par
 * seria a mesma pessoa entrando em dois clientes com o mesmo login — e a decisão
 * de qual vale ficaria com quem consultasse primeiro.
 */
export const identidadeExterna = pgTable(
  'identidade_externa',
  {
    id: id(),
    tenantId: refTenant(),
    usuarioId: uuid('usuario_id')
      .notNull()
      .references(() => usuario.id, { onDelete: 'cascade' }),
    emissor: text('emissor').notNull(),
    sujeito: text('sujeito').notNull(),
    emailNoProvedor: text('email_no_provedor'),
    ultimoAcessoEm: momento('ultimo_acesso_em'),
    ...carimbos(),
  },
  (t) => [
    uniqueIndex('identidade_externa_emissor_sujeito_uk').on(t.emissor, t.sujeito),
    index('identidade_externa_usuario_idx').on(t.tenantId, t.usuarioId),
  ],
);

/**
 * Domínio de e-mail que pertence a um tenant.
 *
 * É o que permite descobrir o cliente a partir do login, já que o tenant não vem
 * do subdomínio (`infraestrutura.md` §3). Só entra depois de VERIFICADO por
 * registro TXT no DNS: sem isso, quem criasse conta com `@banco.com.br` entraria
 * no tenant do banco.
 *
 * Domínio público — gmail, hotmail, outlook — nunca é cadastrável, e a lista
 * dessas exceções vive no código, não aqui.
 */
export const dominioTenant = pgTable(
  'dominio_tenant',
  {
    id: id(),
    tenantId: refTenant(),
    dominio: text('dominio').notNull(),
    verificadoEm: momento('verificado_em'),
    tokenVerificacao: text('token_verificacao'),
    ...carimbos(),
  },
  (t) => [uniqueIndex('dominio_tenant_dominio_uk').on(t.dominio)],
);

/**
 * A conexão de SSO do tenant — o espelho fino da configuração do IdP dele.
 *
 * **Uma por tenant**, e por isso o único em `tenant_id`: a empresa entra por um
 * diretório, não por três, e permitir vários transformaria a descoberta por
 * domínio numa escolha ambígua justo no momento em que ninguém está logado para
 * desempatar.
 *
 * **Estado e política são dois campos, não um.** `estado` diz se a conexão
 * funciona (`rascunho` → `testada` → `ativa`); `politica` diz se a senha ainda
 * vale (`desligado` → `opcional` → `obrigatorio`). Todo incidente de "o cliente
 * inteiro ficou de fora" nasce de serem o mesmo botão — ver
 * `docs/pesquisa/sso-multi-tenant.md` §3 e §6.
 *
 * **Segredo não mora aqui em claro.** O `clientSecret` vive dentro de `config`,
 * cifrado por `cifrarConfig` (`packages/db/src/segredo.ts`), que já trata
 * `clientSecret` como campo secreto justamente para isto. O que um `pg_dump`
 * entrega é envelope, não credencial.
 */
export const TIPOS_CONEXAO_SSO = ['oidc'] as const;
export const ESTADOS_CONEXAO_SSO = ['rascunho', 'testada', 'ativa'] as const;
export const POLITICAS_SSO = ['desligado', 'opcional', 'obrigatorio'] as const;
export const PROVEDORES_SSO = ['generico', 'entra', 'google_workspace', 'okta'] as const;

export const conexaoSso = pgTable(
  'conexao_sso',
  {
    id: id(),
    tenantId: refTenant(),
    tipo: text('tipo').notNull().default('oidc'),
    /** Qual IdP. Muda a leitura dos claims — no Entra o sujeito é `{tid}:{oid}`. */
    provedor: text('provedor').notNull().default('generico'),
    /** O emissor OIDC, de onde sai `.well-known/openid-configuration`. */
    emissor: text('emissor').notNull(),
    clienteId: text('cliente_id').notNull(),
    /** `{ clientSecret }` cifrado. Nunca texto claro. */
    config: jsonb('config').notNull().default(sql`'{}'::jsonb`),
    estado: text('estado').notNull().default('rascunho'),
    politica: text('politica').notNull().default('desligado'),
    /** Quando o teste passou. Vale 30 dias: conexão testada em 2024 não prova nada hoje. */
    testadaEm: momento('testada_em'),
    ativadaEm: momento('ativada_em'),
    ...carimbos(),
  },
  (t) => [
    uniqueIndex('conexao_sso_tenant_uk').on(t.tenantId),
    listaCheck('conexao_sso_tipo_ck', t.tipo, TIPOS_CONEXAO_SSO),
    listaCheck('conexao_sso_provedor_ck', t.provedor, PROVEDORES_SSO),
    listaCheck('conexao_sso_estado_ck', t.estado, ESTADOS_CONEXAO_SSO),
    listaCheck('conexao_sso_politica_ck', t.politica, POLITICAS_SSO),
  ],
);

/**
 * Chave de API e de MCP. O segredo nunca é guardado em claro: fica o `hash` e um
 * `prefixo` visível, que é o que a tela mostra para o cliente reconhecer a chave.
 * Escopo de escrita é separado de escopo de leitura (§4.6 da spec).
 */
export const chaveApi = pgTable(
  'chave_api',
  {
    id: id(),
    tenantId: refTenant(),
    nome: text('nome').notNull(),
    prefixo: text('prefixo').notNull(),
    hash: text('hash').notNull(),
    escopos: text('escopos').array().notNull().default(sql`'{}'::text[]`),
    expiraEm: momento('expira_em'),
    ultimoUsoEm: momento('ultimo_uso_em'),
    criadaPor: uuid('criada_por').references(() => usuario.id, { onDelete: 'set null' }),
    revogadaEm: momento('revogada_em'),
    ...carimbos(),
  },
  (t) => [uniqueIndex('chave_api_prefixo_uk').on(t.prefixo)],
);

export const TIPOS_ATOR = ['usuario', 'chave', 'sistema'] as const;

export const logAuditoria = pgTable(
  'log_auditoria',
  {
    id: id(),
    tenantId: refTenant(),
    atorTipo: text('ator_tipo').notNull(),
    atorId: uuid('ator_id'),
    acao: text('acao').notNull(),
    objetoTipo: text('objeto_tipo').notNull(),
    objetoId: uuid('objeto_id'),
    antes: jsonb('antes'),
    depois: jsonb('depois'),
    ip: text('ip'),
    em: momento('em').notNull().defaultNow(),
  },
  (t) => [
    listaCheck('log_auditoria_ator_tipo_ck', t.atorTipo, TIPOS_ATOR),
    index('log_auditoria_objeto_idx').on(t.tenantId, t.objetoTipo, t.objetoId, t.em),
    index('log_auditoria_em_idx').on(t.tenantId, t.em),
  ],
);


/**
 * Convite para entrar num tenant.
 *
 * É a **única** porta para quem não tem domínio verificado — e é de propósito. A
 * quarta pergunta de `packages/autenticacao/src/entrada.ts` recusa quem não foi
 * convidado, porque criar usuário do nada transforma "descobri um domínio" em
 * "entrei no cliente".
 *
 * Como a sessão e a chave de API, **o banco guarda o hash, nunca o token**: quem
 * lê a tabela não consegue aceitar convite de ninguém. Prazo curto (7 dias) e uso
 * único, marcado por `aceito_em` — reaproveitar link é o defeito clássico, e é o
 * que a leitura `for update` na hora de aceitar fecha.
 */
export const convite = pgTable(
  'convite',
  {
    id: id(),
    tenantId: refTenant(),
    email: text('email').notNull(),
    papelId: uuid('papel_id')
      .notNull()
      .references(() => papel.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull(),
    expiraEm: momento('expira_em').notNull(),
    criadoPor: uuid('criado_por').references(() => usuario.id, { onDelete: 'set null' }),
    aceitoEm: momento('aceito_em'),
    /** Quem nasceu do convite. Fica para auditoria: o convite não some ao ser usado. */
    usuarioId: uuid('usuario_id').references(() => usuario.id, { onDelete: 'set null' }),
    ...carimbos(),
  },
  (t) => [
    uniqueIndex('convite_token_hash_uk').on(t.tokenHash),
    index('convite_tenant_email_idx').on(t.tenantId, t.email, t.expiraEm),
  ],
);
