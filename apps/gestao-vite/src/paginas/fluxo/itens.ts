/**
 * O menu da barra do contato — o `subheader-menu` da origem.
 *
 * Puro de propósito: é a ÚNICA regra desta tela que decide alguma coisa, e é a
 * regra que separa roteador de fluxo. O teste `tests/fluxo-detalhe.test.ts`
 * trava o que sai daqui.
 *
 * ═══ COMO A ORIGEM MONTA ESTA FILEIRA ═══
 *
 * São três peneiras em sequência, e só a terceira olha o tipo do contato:
 *
 *  1. `SubheaderDetailController.getTemplateSetupItem()` — se o contato é de um
 *     template, ele PREPENDE um item. Para `master` o item é
 *     `{ title: 'master.services', sref: 'auth.application.detail.master' }`,
 *     que em pt-BR é **"Serviços"**. Para `builder` não há item nenhum: o
 *     `switch` não tem caso para ele.
 *  2. `getUpdatedMenus()` — filtra o catálogo pelas permissões DA PESSOA
 *     (`applicationUserPermissionModel`) e preserva sua ordem no bundle. O item
 *     `ai` foi removido do catálogo Pipe conforme o escopo visual solicitado.
 *  3. `subheaderMenu.checkPermissions()` — filtra pelo TEMPLATE, usando o mapa
 *     de claims (módulo 62673 do bundle), onde cada claim traz `hideInTemplate`.
 *     Para `master` só duas entradas escondem: `desk` (claim 106, e os vinte e
 *     tantos `desk-*` filhos) e `builder` (claim 114). Tudo o mais fica.
 *
 * É a MESMA regra que já está comentada em `criar/roteador/acoes.ts`, vista do
 * outro lado: `activateApplicationFeatures` só liga construtor e atendimento
 * `if (template === Builder || Pipeline)` — o roteador não liga nenhum dos
 * dois, e por isso a barra dele também não mostra nenhum dos dois.
 *
 * O corte de 5 visíveis + "…" é `createVisibleMenu()`, e é por CONTAGEM, não
 * por largura — o mesmo que `estrutura-gestao.tsx` já registrou para a barra de
 * módulos.
 */

import type { NomeDeIconePortal } from '../../componentes/icones-portal';

/** `fluxo` e `roteador` são o `builder` e o `master` da origem. */
export type TipoDeContato = 'fluxo' | 'roteador';

export interface ItemDoMenu {
  /** O rótulo exato da origem, em pt-BR. */
  rotulo: string;
  /** Para onde vai — nulo quando a tela ainda não existe aqui. */
  href: string | null;
}

/** `createVisibleMenu()`: cinco na barra, o resto no "…". */
export const LIMITE_VISIVEL = 5;

/*
 * O catálogo, na ordem das chaves da origem, com os rótulos pt-BR do pacote de
 * tradução (`modules.application.detail.*`) e o destino que NÓS temos.
 *
 * `href: null` não é lacuna escondida: vira bloco apagado com o selo "em breve"
 * na tela, que é o combinado para o que a origem mostra e nós ainda não temos.
 */
/*
 * A ORDEM É A DA ORIGEM, medida em `roteador-team__pagina.html` (master) e
 * `application-detail-pipeprincipal-configurations-basic.html` (builder):
 * visível é Builder · Atendimento · Análise · Growth · Canais (fluxo) e
 * Serviços · Análise · Growth · Canais · Contatos (roteador, com Builder e
 * Atendimento escondidos por `ESCONDIDOS_NO_ROTEADOR`). Canais e Análise
 * vinham antes de Growth aqui — por isso a barra mostrava Contatos como
 * sexto item disfarçado de quinto, e Growth ficava só no "...".
 */
const CATALOGO = [
  { chave: 'builder', rotulo: 'Builder', href: '/builder' },
  { chave: 'desk', rotulo: 'Atendimento', href: '/monitoramento' },
  /* A Análise é DO contato: o destino depende do `id` e sai de `itensDoMenu`. */
  { chave: 'analysis', rotulo: 'Análise', href: null },
  { chave: 'growth', rotulo: 'Growth', href: null },
  { chave: 'channels', rotulo: 'Canais', href: null },
  { chave: 'users', rotulo: 'Contatos', href: null },
  { chave: 'contents', rotulo: 'Conteúdos', href: null },
  { chave: 'logMessages', rotulo: 'Log', href: null },
  { chave: 'payments', rotulo: 'Pagamentos', href: null },
] as const satisfies readonly { chave: string; rotulo: string; href: string | null }[];

/** O `hideInTemplate: [… 'master' …]` do mapa de claims, do lado que nos cabe. */
const ESCONDIDOS_NO_ROTEADOR: readonly string[] = ['builder', 'desk'];

/**
 * A fileira inteira, na ordem da origem. Quem desenha fatia em `LIMITE_VISIVEL`.
 *
 * Não recebe permissão: o RBAC Pipe existente é por conta, enquanto a origem
 * filtra por claim do bot. ponytail: catálogo fixo até existir RBAC por fluxo;
 * então aplicar claims por bot antes do filtro de tipo.
 */
export function itensDoMenu(tipo: TipoDeContato, id: string): ItemDoMenu[] {
  const base = `/${tipo}/${id}`;
  const itens: ItemDoMenu[] = CATALOGO.filter(
    (item) => tipo === 'fluxo' || !ESCONDIDOS_NO_ROTEADOR.includes(item.chave),
  ).map((item) => ({
    rotulo: item.rotulo,
    href:
      item.chave === 'desk'
        ? `${base}/atendimento/monitoramento`
        : item.chave === 'analysis'
          ? `${base}/analise`
        : item.chave === 'channels'
          ? `${base}/canais`
          : item.chave === 'users'
            ? `${base}/contatos`
            : item.chave === 'growth'
              ? `${base}/growth/mensagens-ativas`
              : item.chave === 'contents'
                ? `${base}/conteudos`
                : item.chave === 'logMessages'
                  ? `${base}/log`
                  : item.href,
  }));

  /* `getTemplateSetupItem()`: o item do template vem na FRENTE de tudo. Só o
     roteador tem um entre os dois tipos que existem aqui. */
  if (tipo === 'roteador') itens.unshift({ rotulo: 'Serviços', href: `${base}/servicos` });

  return itens;
}

/**
 * Os ícones da ponta direita — o `menuIcons` da origem, catálogo `V`, e depois
 * o `<li class="item-lab">` do template `subheaderIcons`, que vem sempre.
 *
 * Eles NÃO passam pelo filtro de template: `checkPermissions()` só roda no
 * `subheaderMenu`, e o roteador mostra os quatro iguaizinhos ao fluxo. Nenhum
 * tem tela aqui ainda — "Configurações" é do CONTATO, e não a da conta que já
 * existe em `/configuracoes`.
 */
export const ICONES_DO_CONTATO: readonly (ItemDoMenu & { icone: NomeDeIconePortal })[] = [
  /* `getIcons(sref)`: `icon-integration`, `icon-config`, `icon-team-1`. */
  { rotulo: 'Integrações', href: '/integracoes', icone: 'integracoes' },
  { rotulo: 'Configurações', href: '/configuracoes/basicas', icone: 'configuracoes' },
  { rotulo: 'Equipe', href: '/equipe', icone: 'equipe' },
  /* `modules.application.detail.test` — o `icon-lab` que abre o teste. */
  { rotulo: 'Testar', href: null, icone: 'testar' },
];

/* ------------------------------------------------ os dados dos cartões da home */

/** Um membro da equipe do contato, como `loadTeamMembers()` o monta. */
export interface Membro {
  nome: string;
  fotoUrl: string | null;
}

/** As três contagens do cartão de métricas, desde a criação do contato. */
export interface Metricas {
  usuarios: number;
  recebidas: number;
  enviadas: number;
}

/** Uma extensão recomendada — um item do `store/recommendations` da origem. */
export interface Extensao {
  id: string;
  nome: string;
  resumo: string;
  iconeUrl: string;
  paga: boolean;
}

/**
 * A pilha de avatares da equipe — o corte de `HomeController.loadTeamMembers()`:
 * com mais de 7 pessoas, ficam as 7 primeiras e entra um oitavo "avatar" sem
 * foto com o nome `+ N`, e o N para em 9. O `letter-avatar` tira as iniciais
 * dele e desenha "+N".
 */
export function pilhaDaEquipe(membros: readonly Membro[]): Membro[] {
  if (membros.length <= 7) return [...membros];
  const resto = Math.min(membros.length - 7, 9);
  return [...membros.slice(0, 7), { nome: `+ ${resto}`, fotoUrl: null }];
}

/**
 * O `HomeController.processNumber()` da origem, com o mesmo arredondamento para
 * baixo e o mesmo `split('0')[0]` — que transforma 10,5 milhões em "+1M". É o
 * número que a origem mostra, então é o nosso.
 */
export function numeroDaHome(n: number): string {
  const faixas: [number, string][] = [
    [1e6, 'M'],
    [1e5, '00K'],
    [1e4, '0K'],
    [1e3, 'K'],
  ];
  for (const [base, sufixo] of faixas) {
    if (n > base) return '+' + String(base * Math.floor(n / base)).split('0')[0] + sufixo;
  }
  if (n > 100) return '+' + String(100 * Math.floor(n / 100));
  if (n > 10) return '+' + String(10 * Math.floor(n / 10));
  return String(n);
}
