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

import type { MyPermissionsInFlow } from '@pipe/contracts';
import type { NomeDeIconePortal } from '../../components/icones-portal';

/** `fluxo` e `roteador` são o `builder` e o `master` da origem. */
export type ContactTipo = 'fluxo' | 'roteador';

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
  { key: 'builder', rotulo: 'Builder', href: '/builder' },
  { key: 'desk', rotulo: 'Atendimento', href: '/monitoramento' },
  /* A Análise é DO contato: o destino depende do `id` e sai de `itensDoMenu`. */
  { key: 'analysis', rotulo: 'Análise', href: null },
  { key: 'growth', rotulo: 'Growth', href: null },
  { key: 'channels', rotulo: 'Canais', href: null },
  { key: 'users', rotulo: 'Contatos', href: null },
  { key: 'contents', rotulo: 'Conteúdos', href: null },
  { key: 'logMessages', rotulo: 'Log', href: null },
  { key: 'payments', rotulo: 'Pagamentos', href: null },
] as const satisfies readonly { key: string; rotulo: string; href: string | null }[];

/** O `hideInTemplate: [… 'master' …]` do mapa de claims, do lado que nos cabe. */
const HIDDEN_IN_ROUTER: readonly string[] = ['builder', 'desk'];

/**
 * A chave do CATÁLOGO → o recurso do `PermissionsList.html`, onde as duas
 * listas da origem discordam de nome. São as mesmas chaves em quase tudo
 * (`builder`, `desk`, `analysis`, `growth`, `channels`, `users`,
 * `logMessages`, `payments`): só "Conteúdos" é `contents` no menu e
 * `resources` na lista de permissões.
 */
const RECURSO_DO_ITEM: Readonly<Record<string, string>> = { contents: 'resources' };

/**
 * A fileira inteira, na ordem da origem. Quem desenha fatia em `LIMITE_VISIVEL`.
 *
 * `permissoes` é o passo 2 da origem (`getUpdatedMenus()`): o catálogo peneirado
 * pelas permissões DA PESSOA naquele bot (`applicationUserPermissionModel`),
 * ANTES do filtro por template (passo 3, `ESCONDIDOS_NO_ROTEADOR`) — nessa
 * ordem, como lá. Um item com `nenhum` some da barra: "O usuário não vê este
 * menu nem acessa seu conteúdo" é o texto do próprio rádio zero.
 *
 * Sem o argumento (ou com `editaPelaConta`), nada é peneirado: quem tem
 * `automacao.fluxo.editar` na conta continua enxergando tudo, que é como o
 * Pipe funcionava antes da 0035 e é o outro lado do duplo portão de
 * `exigirPermissaoNoFluxo`. Quem não é membro e não tem a permissão de conta
 * também não chega até aqui — a casca do contato já recusou.
 */
export function itensDoMenu(
  tipo: ContactTipo,
  id: string,
  permissions?: MyPermissionsInFlow | undefined,
): ItemDoMenu[] {
  const base = `/${tipo}/${id}`;
  const sieve = permissions && !permissions.editaByAccount ? permissions.permissoes : null;
  const itens: ItemDoMenu[] = CATALOGO.filter(
    (item) => tipo === 'fluxo' || !HIDDEN_IN_ROUTER.includes(item.key),
  )
    .filter((item) => {
      if (!sieve) return true;
      const nivel = sieve[RECURSO_DO_ITEM[item.key] ?? item.key];
      return nivel === 'ler' || nivel === 'escrever';
    })
    .map((item) => ({
      rotulo: item.rotulo,
      href:
        item.key === 'builder'
          ? `${base}/builder`
          : item.key === 'desk'
            ? `${base}/atendimento/monitoramento`
            : item.key === 'analysis'
              ? `${base}/analise`
              : item.key === 'channels'
                ? `${base}/canais`
                : item.key === 'users'
                  ? `${base}/contatos`
                  : item.key === 'growth'
                    ? `${base}/growth/mensagens-ativas`
                    : item.key === 'contents'
                      ? `${base}/conteudos`
                      : item.key === 'logMessages'
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
export const ICONES_OF_CONTACT: readonly (ItemDoMenu & { icone: NomeDeIconePortal })[] = [
  /* `getIcons(sref)`: `icon-integration`, `icon-config`, `icon-team-1`. */
  { rotulo: 'Integrações', href: '/integracoes', icone: 'integracoes' },
  { rotulo: 'Configurações', href: '/configuracoes/basicas', icone: 'configuracoes' },
  { rotulo: 'Equipe', href: '/equipe', icone: 'equipe' },
  /* `modules.application.detail.test` — o `icon-lab` que abre o teste. */
  { rotulo: 'Testar', href: null, icone: 'testar' },
];

/* ------------------------------------------------ os dados dos cartões da home */

/** Um membro da equipe do contato, como `loadTeamMembers()` o monta. */
export interface Member {
  nome: string;
  fotoUrl: string | null;
}

/** As três contagens do cartão de métricas, desde a criação do contato. */
export interface Metrics {
  users: number;
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
export function pilhaDaEquipe(members: readonly Member[]): Member[] {
  if (members.length <= 7) return [...members];
  const resto = Math.min(members.length - 7, 9);
  return [...members.slice(0, 7), { nome: `+ ${resto}`, fotoUrl: null }];
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
