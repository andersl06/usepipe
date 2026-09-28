/**
 * The contact bar menu — the source's `subheader-menu`.
 *
 * Pure by design: it's the ONLY rule on this screen that decides anything, and it's the rule that separates roteador from fluxo. The `tests/fluxo-detalhe.test.ts` test locks down what comes out of here.
 *
 * ═══ HOW THE SOURCE BUILDS THIS ROW ═══
 *
 * Three sieves in sequence, and only the third looks at the contact type:
 *
 *  1. `SubheaderDetailController.getTemplateSetupItem()` — if the contact is from a
 *     template, it PREPENDS an item. For `master` the item is
 *     `{ title: 'master.services', sref: 'auth.application.detail.master' }`,
 *     which in pt-BR is **"Serviços"**. For `builder` there is no item at all: the
 *     `switch` has no case for it.
 *  2. `getUpdatedMenus()` — filters the catalog by the PERSON's permissions
 *     (`applicationUserPermissionModel`) and preserves their order in the bundle. The
 *     `ai` item was removed from the Pipe catalog per the requested visual scope.
 *  3. `subheaderMenu.checkPermissions()` — filters by TEMPLATE, using the claims
 *     map (bundle module 62673), where each claim carries `hideInTemplate`.
 *     For `master` only two entries are hidden: `desk` (claim 106, and its twenty-odd
 *     `desk-*` children) and `builder` (claim 114). Everything else stays.
 *
 * It's the SAME rule already documented in `criar/roteador/acoes.ts`, seen from the
 * other side: `activateApplicationFeatures` only turns on builder and attendance
 * `if (template === Builder || Pipeline)` — the roteador turns on neither of the
 * two, and that's why its bar doesn't show either of them either.
 *
 * The cutoff of 5 visible + "…" is `createVisibleMenu()`, and it's by COUNT, not
 * by width — the same as `estrutura-gestao.tsx` already recorded for the module
 * bar.
 */

import type { MyPermissionsInFlow } from '@pipe/contracts';
import type { NomeDeIconePortal } from '../../components/icones-portal';

/** `flow` and `router` are the source's `builder` and `master`. */
export type ContactType = 'fluxo' | 'roteador';

export interface ItemDoMenu {
  /** The source's exact label, in pt-BR. */
  rotulo: string;
  /** Where it goes — null when the screen doesn't exist here yet. */
  href: string | null;
}

/** `createVisibleMenu()`: cinco na barra, o resto no "…". */
export const LIMITE_VISIVEL = 5;

/*
 * The catalog, in the source's key order, with the pt-BR labels from the translation package (`modules.application.detail.*`) and the destination WE have.
 *
 * `href: null` isn't a hidden gap: it becomes a grayed-out block with the "coming soon" badge on screen, which is the agreed treatment for what the source shows and we don't have yet.
 */
/*
 * THE ORDER IS THE SOURCE'S, measured in `roteador-team__pagina.html` (master) and `application-detail-pipeprincipal-configurations-basic.html` (builder): visible is Builder · Atendimento · Análise · Growth · Canais (fluxo) and Serviços · Análise · Growth · Canais · Contatos (roteador, with Builder and Atendimento hidden by `HIDDEN_IN_ROUTER`). Canais and Análise used to come before Growth here — which made the bar show Contatos as a disguised sixth item posing as fifth, and Growth ended up stuck in the "...".
 */
const CATALOGO = [
  /* The catalog's own `href` is a placeholder: the map below always overrides it with `${base}/templates/builder` (D-54). */
  { key: 'builder', rotulo: 'Builder', href: '/templates/builder' },
  { key: 'desk', rotulo: 'Atendimento', href: '/monitoring' },
  /* Análise belongs to the contact: the destination depends on `id` and comes from `itensDoMenu`. */
  { key: 'analysis', rotulo: 'Análise', href: null },
  { key: 'growth', rotulo: 'Growth', href: null },
  { key: 'channels', rotulo: 'Canais', href: null },
  { key: 'users', rotulo: 'Contatos', href: null },
  { key: 'contents', rotulo: 'Conteúdos', href: null },
  /*
   * Blip's OWN "Conteúdos" menu item (`portal.js:214788`: `'resources' === a && (n.title =
   * 'contents.title')`) is this generic key/value resource screen (`{{resource.<name>}}`), not
   * message templates. Pipe's "Conteúdos" above already means something else here — WhatsApp
   * templates, with no Blip counterpart at that address — so Recursos gets its own item instead of
   * replacing it; both stay reachable, gated by the same `resources` permission Blip itself uses.
   */
  { key: 'resources', rotulo: 'Recursos', href: null },
  { key: 'logMessages', rotulo: 'Log', href: null },
  { key: 'payments', rotulo: 'Pagamentos', href: null },
] as const satisfies readonly { key: string; rotulo: string; href: string | null }[];

/** O `hideInTemplate: [… 'master' …]` do mapa de claims, do lado que nos cabe. */
const HIDDEN_IN_ROUTER: readonly string[] = ['builder', 'desk'];

/**
 * The CATALOG key → the resource in `PermissionsList.html`, where the source's two lists disagree on naming. They share almost every key (`builder`, `desk`, `analysis`, `growth`, `channels`, `users`, `logMessages`, `payments`): only "Conteúdos" is `contents` in the menu and `resources` in the permissions list.
 */
const RECURSO_DO_ITEM: Readonly<Record<string, string>> = { contents: 'resources' };

/**
 * The whole row, in the source's order. Whoever renders it slices at `LIMITE_VISIVEL`.
 *
 * `permissions` is the source's step 2 (`getUpdatedMenus()`): the catalog sieved by the PERSON's permissions on that bot (`applicationUserPermissionModel`), BEFORE the template filter (step 3, `HIDDEN_IN_ROUTER`) — in that order, as there. An item with `nenhum` disappears from the bar: "The user doesn't see this menu or access its content" is the zero-permission radio's own text.
 *
 * Without the argument (or with `editaPelaConta`), nothing is sieved: whoever has `automacao.fluxo.editar` on the account keeps seeing everything, which is how Pipe worked before 0035 and is the other side of `exigirPermissaoNoFluxo`'s double gate. Whoever isn't a member and doesn't have the account permission also never reaches this point — the contact shell already refused.
 */
/**
 * `base` is the contact's own path (`flowPath(shortName)`, D-52) — this function only appends
 * the module segment, using the Blip names decided in D-54 where the screen has one
 * (`route-inventory.md` §2): `builder` → `templates/builder`, `contacts` → `users`, the router's
 * template item → `templates/pipeline`. `attendance/monitoring` keeps its name; both segments are
 * already the same as Blip's.
 */
export function itensDoMenu(
  tipo: ContactType,
  base: string,
  permissions?: MyPermissionsInFlow | undefined,
): ItemDoMenu[] {
  const sieve = permissions && !permissions.editsByAccount ? permissions.permissoes : null;
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
          ? `${base}/templates/builder`
          : item.key === 'desk'
            ? `${base}/attendance/monitoring`
            : item.key === 'analysis'
              ? `${base}/analytics`
              : item.key === 'channels'
                ? `${base}/channels`
                : item.key === 'users'
                  ? `${base}/users`
                  : item.key === 'growth'
                    ? `${base}/growth/active-messages`
                    : item.key === 'contents'
                      ? `${base}/contents`
                      : item.key === 'resources'
                        ? `${base}/resources`
                        : item.key === 'logMessages'
                          ? `${base}/log`
                          : item.href,
    }));

  /*
   * `getTemplateSetupItem()`: the template item goes at the FRONT of everything. Only the roteador has one among the two types that exist here.
   */
  if (tipo === 'roteador') itens.unshift({ rotulo: 'Serviços', href: `${base}/templates/pipeline` });

  return itens;
}

/**
 * The right-edge icons — the source's `menuIcons`, catalog `V`, followed by the `<li class="item-lab">` from the `subheaderIcons` template, which always shows.
 *
 * They do NOT go through the template filter: `checkPermissions()` only runs on `subheaderMenu`, and the roteador shows the same four icons as fluxo. None of them has a screen here yet — "Configurações" belongs to the CONTACT, not the account settings that already exists at `/configuracoes`.
 */
export const ICONS_OF_CONTACT: readonly (ItemDoMenu & { icone: NomeDeIconePortal })[] = [
  /* `getIcons(sref)`: `icon-integration`, `icon-config`, `icon-team-1`. */
  { rotulo: 'Integrações', href: '/integrations', icone: 'integracoes' },
  /* `settings` → `configurations` (D-54). */
  { rotulo: 'Configurações', href: '/configurations/basic', icone: 'configuracoes' },
  { rotulo: 'Equipe', href: '/team', icone: 'equipe' },
  /* `modules.application.detail.test` — o `icon-lab` que abre o teste. */
  { rotulo: 'Testar', href: null, icone: 'testar' },
];

/* ------------------------------------------------ home card data */

/** Um membro da equipe do contato, como `loadTeamMembers()` o monta. */
export interface Member {
  nome: string;
  fotoUrl: string | null;
}

/** The metrics card's three counts, since the contact was created. */
export interface Metrics {
  users: number;
  recebidas: number;
  enviadas: number;
}

/** A recommended extension — an item from the source's `store/recommendations`. */
export interface Extensao {
  id: string;
  nome: string;
  resumo: string;
  iconeUrl: string;
  paga: boolean;
}

/**
 * The team avatar stack — `HomeController.loadTeamMembers()`'s cutoff: with more than 7 people, the first 7 stay and an eighth photo-less "avatar" enters with the name `+ N`, and N caps at 9. `letter-avatar` takes its initials and draws "+N".
 */
export function pilhaDaEquipe(members: readonly Member[]): Member[] {
  if (members.length <= 7) return [...members];
  const resto = Math.min(members.length - 7, 9);
  return [...members.slice(0, 7), { nome: `+ ${resto}`, fotoUrl: null }];
}

/**
 * The source's `HomeController.processNumber()`, with the same round-down and the same `split('0')[0]` — which turns 10.5 million into "+1M". It's the number the source shows, so it's ours.
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
