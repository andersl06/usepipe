import type { NomeDeIconePortal } from '../../componentes/icones-portal';

/**
 * O catálogo de cartões do Painel do contrato — um registro por cartão, como na
 * origem.
 *
 * Lá cada cartão é um objeto com `group`, `option`, `icon`, `accessPermission`,
 * `featureToggle`, `metrics`, `path` e `additionalCheck`
 * (`docs/pesquisa/blip-painel-do-contrato.md` §"Os cartões, os três grupos"), e
 * a tela é o resultado de rodar o funil sobre essa lista. Aqui é a mesma ideia
 * com os campos que a NOSSA base sustenta: sem `featureToggle` e sem `metrics`,
 * porque não temos LaunchDarkly nem assinatura com métricas — e inventar os dois
 * para copiar um funil seria inventar produto.
 *
 * **A conferência é o par chave+verbo**, como a matriz deles: `accessPermission`
 * é a chave (`tenant-members`) e a conferência é o verbo (`read`/`write`). O
 * código de permissão que a pessoa precisa ter é a junção dos dois —
 * `conta.membros` + `ler` = `conta.membros.ler` —, e é assim que as onze
 * permissões criadas na migração `0019_permissoes_da_conta` se ligam à tela.
 *
 * ## O que ficou de fora, e por quê
 *
 * Nenhum cartão foi inventado e nenhum foi copiado por enfeite. Ficaram fora os
 * que, na origem, só existem quando há flag ou plano — coisas que não temos:
 *
 * - **Atendentes** (`/agent`): depende da métrica `Agent` da assinatura.
 * - **Base de conhecimento** (`/knowledge-base`): conferência `b` — write **e**
 *   plano de agente pago ou em trial. Sem plano de agente, `b` é sempre falso.
 * - **Pipeline** (`/pipeline`): conferência `c` — read **e** (flag
 *   `pipeline-enable` **ou** plano de agente). Sem flag e sem plano, sempre falso.
 * - **O grupo inteiro "Acompanhamento do plano"** (sete cartões de consumo):
 *   todos pedem `tenant-billing` MAIS uma flag `billing-*` MAIS uma métrica da
 *   assinatura, e a seção só é desenhada quando sobra mais de um cartão.
 *
 * Os que ficaram e têm `flagNaOrigem` são os que a origem esconde por flag mas
 * que já têm uma permissão de verdade guardando a porta: a flag some da regra
 * (não temos nenhuma), a permissão continua valendo, e o nome da flag fica
 * registrado no campo — é o que o modo demonstração mostra ao lado do cartão.
 */

/** Os grupos que sobraram, com o título e o tooltip da origem. */
export const GRUPOS = [
  {
    id: 'configuracoes',
    titulo: 'Configurações gerais',
    tooltip: 'Visualize e configure todas as informações relacionadas ao seu contrato.',
  },
  {
    id: 'funcionalidades',
    titulo: 'Gerenciamento de funcionalidades',
    tooltip: 'Gerencie as funcionalidades disponíveis para seus bots.',
  },
] as const;

export type IdDeGrupo = (typeof GRUPOS)[number]['id'];

/** Os dois verbos da matriz deles: `read` e `write`. */
export type Conferencia = 'ler' | 'escrever';

export interface CartaoDoContrato {
  id: string;
  grupo: IdDeGrupo;
  titulo: string;
  descricao: string;
  icone: NomeDeIconePortal;
  /** A chave da matriz, sem o verbo. O `accessPermission` deles. */
  chave: string;
  conferencia: Conferencia;
  rota: string;
  /**
   * `false` enquanto a rota não existe. O cartão continua na tela, apagado e
   * com o selo "em breve" — é o que o portal já faz com o que está em obra.
   */
  pronto: boolean;
  /** A flag que, na origem, esconderia este cartão. Só o modo demonstração mostra. */
  flagNaOrigem?: string;
}

export const CATALOGO: readonly CartaoDoContrato[] = [
  {
    id: 'membros',
    grupo: 'configuracoes',
    titulo: 'Membros',
    descricao: 'Adicione e exclua membros do contrato',
    /* `avatar-user`, como no `Oc` do `main.e8593b01.chunk.js`. */
    icone: 'avatar',
    chave: 'conta.membros',
    conferencia: 'ler',
    rota: '/contrato/membros',
    pronto: true,
  },
  {
    id: 'certificados',
    grupo: 'configuracoes',
    titulo: 'Certificados de autenticação',
    descricao: 'Gerencie seus certificados mTLS',
    /* `lock`, como no `Oc` do `main.e8593b01.chunk.js` do painel deles. */
    icone: 'cadeado',
    chave: 'conta.membros',
    conferencia: 'ler',
    rota: '/contrato/certificados',
    pronto: true,
    flagNaOrigem: 'enable-tenant-mtls-certificates',
  },
  {
    id: 'grupos-de-acesso',
    grupo: 'configuracoes',
    titulo: 'Grupos de acesso',
    descricao: 'Adicione, edite e remova grupos de acesso ao contrato',
    /* `team` na origem, e o nosso `comunidade` É o `team` deles. */
    icone: 'comunidade',
    chave: 'conta.grupos_acesso',
    conferencia: 'ler',
    rota: '/contrato/grupos-de-acesso',
    pronto: false,
    flagNaOrigem: 'portal-fragment-permission-groups-is-enabled',
  },
  {
    id: 'chamadas',
    grupo: 'funcionalidades',
    /* "Blip Calls" na origem. O nome da plataforma deles sai da nossa tela — a
       régua é copiar a disposição e a regra, nunca a marca. */
    titulo: 'Chamadas',
    descricao: 'Gerencie os bots que terão acesso ao recurso de ligações',
    /* `robot`, como no `yc` do `main.e8593b01.chunk.js` — e não o `blip-chat`
       (`bot`), que é o ícone do cartão de contato do portal. */
    icone: 'robo',
    chave: 'conta.membros',
    /* O único cartão que pede ESCRITA, como na origem (conferência `e`). */
    conferencia: 'escrever',
    rota: '/contrato/chamadas',
    pronto: false,
    flagNaOrigem: 'tenant-calls-settings',
  },
];

/** O código de permissão que o cartão exige: chave + verbo. */
export function permissaoExigida(cartao: CartaoDoContrato): string {
  return `${cartao.chave}.${cartao.conferencia}`;
}

export interface OpcoesDeFiltro {
  /**
   * Modo demonstração (`?demo=1`): devolve o catálogo INTEIRO, para quem ainda
   * não tem papel nem plano entender a tela antes de ela existir de verdade.
   *
   * **É SÓ VISUAL.** Nenhuma escrita passa por aqui: as Server Actions de
   * `acoes.ts` conferem a permissão de verdade em `Eu.permissoes`, sempre, e não
   * leem esta opção nem a URL. Ver o comentário no topo daquele arquivo.
   */
  demonstracao?: boolean;
}

/**
 * Os cartões que esta pessoa vê.
 *
 * Função pura de propósito — recebe a lista de permissões e devolve a lista de
 * cartões, sem tocar em sessão, banco nem URL. É o funil deles reduzido ao que
 * sobra sem flag e sem assinatura: um `hasPermission` por cartão.
 */
export function cartoesVisiveis(
  permissoes: readonly string[],
  opcoes: OpcoesDeFiltro = {},
): CartaoDoContrato[] {
  if (opcoes.demonstracao) return [...CATALOGO];
  return CATALOGO.filter((cartao) => permissoes.includes(permissaoExigida(cartao)));
}

/** Os `roleId` da origem, que no banco são o nome dos três papéis de conta (0021). */
export type PapelDeConta = 'guest' | 'member' | 'admin';

/**
 * Os três papéis da tela de membros deles, pelo `roleId`: rótulo, descrição
 * oficial em pt-BR (i18n `inviteMemberModal`), ícone e cor da opção no convite
 * (`roleOptions`: `eye-open`, `edit`, `avatar-user`). Ver
 * `blip-painel-do-contrato.md` §"A matriz de papéis" e
 * `blip-gestao-regras-tecnicas.md` §8.2.
 *
 * Desde a migração 0021 o papel de conta É a faixa — não há mais o que calcular
 * a partir de permissão. A ordem das chaves é a da origem (`TenantRole`: guest,
 * member, admin), e é a ordem das listas.
 */
export const PAPEIS_DA_ORIGEM: Readonly<
  Record<
    PapelDeConta,
    { rotulo: string; descricao: string; icone: NomeDeIconePortal; classe: string }
  >
> = {
  guest: {
    rotulo: 'Pode visualizar',
    descricao: 'Apenas visualiza informações do contrato.',
    icone: 'olho',
    classe: 'mb-faixa--ver',
  },
  member: {
    rotulo: 'Pode editar',
    descricao: 'Cria e edita chatbots, mas não gerencia os membros do contrato.',
    icone: 'editar',
    classe: 'mb-faixa--editar',
  },
  admin: {
    rotulo: 'Admin',
    descricao: 'Edita todos os dados do contrato, gerencia membros, cria e edita chatbots.',
    icone: 'avatar',
    classe: 'mb-faixa--admin',
  },
};

export function ehPapelDeConta(nome: string | null | undefined): nome is PapelDeConta {
  return nome != null && Object.hasOwn(PAPEIS_DA_ORIGEM, nome);
}

/**
 * Os cartões repartidos por grupo, na ordem dos grupos.
 *
 * Grupo sem nenhum cartão NÃO entra: na origem, seção vazia não rende cabeçalho
 * nem grade — o `guest` não vê um título de "Configurações gerais" sobre o nada.
 */
export function porGrupo(
  cartoes: readonly CartaoDoContrato[],
): { grupo: (typeof GRUPOS)[number]; cartoes: CartaoDoContrato[] }[] {
  return GRUPOS.map((grupo) => ({
    grupo,
    cartoes: cartoes.filter((c) => c.grupo === grupo.id),
  })).filter((secao) => secao.cartoes.length > 0);
}

/** Uma linha marcada na tela de Membros: de qual tabela veio e qual é o id. */
export interface AlvoDeMembro {
  tipo: 'usuario' | 'convite';
  id: string;
}

/**
 * Lê os alvos que a tabela de Membros manda no formulário.
 *
 * Cada linha marcada chega como `usuario:<id>` ou `convite:<id>` — o nosso
 * `userIdentity`, que na origem é uma chave só porque lá membro e convidado
 * moram na mesma tabela. **Vem do navegador**, então tudo o que não casa com os
 * dois prefixos conhecidos é descartado aqui, antes de virar consulta: o que
 * sobra é usado para escolher QUAL função de escrita chamar.
 */
export function lerAlvosDeMembro(valores: readonly string[]): AlvoDeMembro[] {
  const lidos: AlvoDeMembro[] = [];
  for (const cru of valores) {
    const corte = cru.indexOf(':');
    if (corte < 0) continue;
    const tipo = cru.slice(0, corte);
    const id = cru.slice(corte + 1).trim();
    if ((tipo === 'usuario' || tipo === 'convite') && id) lidos.push({ tipo, id });
  }
  return lidos;
}
