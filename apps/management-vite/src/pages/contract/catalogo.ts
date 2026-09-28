import type { NomeDeIconePortal } from '../../components/icones-portal';
import { tenantPath } from '../../lib/application-paths';

/**
 * The Contract Panel's card catalog — one record per card, like at the source. There each card is an object with `group`, `option`, `icon`, `accessPermission`, `featureToggle`, `metrics`, `path` and `additionalCheck` (`referencias-blip/pesquisa/blip-painel-do-contrato.md` §"Os cartões, os três grupos"), and the screen is the result of running the funnel over that list. Here it's the same idea with the fields OUR base supports: no `featureToggle` and no `metrics`, because we have no LaunchDarkly and no subscription with metrics — and inventing both just to copy a funnel would mean inventing a product. **The check is the key+verb pair**, like their matrix: `accessPermission` is the key (`tenant-members`) and the check is the verb (`read`/`write`). The permission code the person needs is the join of the two — `conta.membros` + `ler` = `conta.membros.ler` —, and that's how the eleven permissions created in migration `0019_permissoes_da_conta` connect to the screen. ## What was left out, and why No card was invented, and none was copied for decoration. Left out are the ones that, at the source, only exist behind a flag or a plan — things we don't have: - **Atendentes** (`/agent`): depends on the subscription's `Agent` metric. - **Base de conhecimento** (`/knowledge-base`): check `b` — write **and** a paid or trial agent plan. Without an agent plan, `b` is always false. - **Pipeline** (`/pipeline`): check `c` — read **and** (the `pipeline-enable` flag **or** an agent plan). Without the flag and without the plan, always false. - **The entire "Acompanhamento do plano" group** (seven consumption cards): all require `tenant-billing` PLUS a `billing-*` flag PLUS a subscription metric, and the section only renders when more than one card remains. The ones that stayed and carry `flagNaOrigem` are the ones the source hides behind a flag but that already have a real permission guarding the door: the flag disappears from the rule (we have none), the permission still applies, and the flag's name stays recorded in the field — that's what demo mode shows next to the card.
 */

/** The groups left over, with the source's title and tooltip. */
export const GROUPS = [
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

export type IdDeGrupo = (typeof GROUPS)[number]['id'];

/** Os dois verbos da matriz deles: `read` e `write`. */
export type Conferencia = 'ler' | 'escrever';

export interface ContractCard {
  id: string;
  grupo: IdDeGrupo;
  titulo: string;
  description: string;
  icone: NomeDeIconePortal;
  /** The matrix key, without the verb. Their `accessPermission`. */
  key: string;
  conferencia: Conferencia;
  rota: string;
  /**
   * `false` while the route doesn't exist yet. The card stays on screen, dimmed, with the "coming soon" badge — the same thing the portal already does with what's under construction.
   */
  pronto: boolean;
  /** The flag that, at the source, would hide this card. Only demo mode shows it. */
  flagNaOrigem?: string;
}

export const CATALOGO: readonly ContractCard[] = [
  {
    id: 'membros',
    grupo: 'configuracoes',
    titulo: 'Membros',
    description: 'Adicione e exclua membros do contrato',
    /* `avatar-user`, como no `Oc` do `main.e8593b01.chunk.js`. */
    icone: 'avatar',
    key: 'conta.membros',
    conferencia: 'ler',
    rota: tenantPath('tenant/members'),
    pronto: true,
  },
  {
    id: 'certificados',
    grupo: 'configuracoes',
    titulo: 'Certificados de autenticação',
    description: 'Gerencie seus certificados mTLS',
    /* `lock`, como no `Oc` do `main.e8593b01.chunk.js` do painel deles. */
    icone: 'cadeado',
    key: 'conta.membros',
    conferencia: 'ler',
    rota: tenantPath('tenant/mtls'),
    pronto: true,
    flagNaOrigem: 'enable-tenant-mtls-certificates',
  },
  {
    id: 'grupos-de-acesso',
    grupo: 'configuracoes',
    titulo: 'Grupos de acesso',
    description: 'Adicione, edite e remova grupos de acesso ao contrato',
    /* `team` at the source, and our `comunidade` IS their `team`. */
    icone: 'comunidade',
    key: 'conta.grupos_acesso',
    conferencia: 'ler',
    rota: tenantPath('tenant/permission-groups'),
    pronto: false,
    flagNaOrigem: 'portal-fragment-permission-groups-is-enabled',
  },
  {
    id: 'chamadas',
    grupo: 'funcionalidades',
    /*
     * "Blip Calls" at the source. Their platform's name doesn't appear on our screen — the rule is to copy the layout and the logic, never the brand.
     */
    titulo: 'Chamadas',
    description: 'Gerencie os bots que terão acesso ao recurso de ligações',
    /*
     * `robot`, like the `yc` in `main.e8593b01.chunk.js` — and not `blip-chat` (`bot`), which is the icon for the portal's contact card.
     */
    icone: 'robo',
    key: 'conta.membros',
    /* The only card that requires WRITE, like at the source (check `e`). */
    conferencia: 'escrever',
    rota: tenantPath('tenant/calls'),
    pronto: false,
    flagNaOrigem: 'tenant-calls-settings',
  },
];

/** The permission code the card requires: key + verb. */
export function permissionRequired(card: ContractCard): string {
  return `${card.key}.${card.conferencia}`;
}

export interface FilterOptions {
  /**
   * Demo mode (`?demo=1`): returns the ENTIRE catalog, so someone with no role or plan yet can understand the screen before it really exists for them. **DISPLAY ONLY.** No write goes through here: the Server Actions in `acoes.ts` always check the real permission in `Eu.permissoes`, and never read this flag or the URL. See the comment at the top of that file.
   */
  demo?: boolean;
}

/**
 * The cards this person sees. Deliberately a pure function — takes the permission list and returns the card list, without touching session, database or URL. It's their funnel reduced to what's left with no flag and no subscription: one `hasPermission` per card.
 */
export function cardsVisible(
  permissions: readonly string[],
  options: FilterOptions = {},
): ContractCard[] {
  if (options.demo) return [...CATALOGO];
  return CATALOGO.filter((card) => permissions.includes(permissionRequired(card)));
}

/** The source's `roleId` values, which in our database are the names of the three account roles (0021). */
export type AccountRole = 'guest' | 'member' | 'admin';

/**
 * The three roles on their Members screen, by `roleId`: label, official pt-BR description (i18n `inviteMemberModal`), icon and invite-option color (`roleOptions`: `eye-open`, `edit`, `avatar-user`). See `blip-painel-do-contrato.md` §"A matriz de papéis" and `blip-gestao-regras-tecnicas.md` §8.2. Since migration 0021 the account role IS the tier — there's nothing left to compute from permissions. The key order is the source's (`TenantRole`: guest, member, admin), and it's the order of the lists.
 */
export const PAPEIS_DA_ORIGEM: Readonly<
  Record<
    AccountRole,
    { rotulo: string; description: string; icone: NomeDeIconePortal; classe: string }
  >
> = {
  guest: {
    rotulo: 'Pode visualizar',
    description: 'Apenas visualiza informações do contrato.',
    icone: 'olho',
    classe: 'mb-faixa--ver',
  },
  member: {
    rotulo: 'Pode editar',
    description: 'Cria e edita chatbots, mas não gerencia os membros do contrato.',
    icone: 'editar',
    classe: 'mb-faixa--editar',
  },
  admin: {
    rotulo: 'Admin',
    description: 'Edita todos os dados do contrato, gerencia membros, cria e edita chatbots.',
    icone: 'avatar',
    classe: 'mb-faixa--admin',
  },
};

export function accountEhRole(nome: string | null | undefined): nome is AccountRole {
  return nome != null && Object.hasOwn(PAPEIS_DA_ORIGEM, nome);
}

/**
 * Cards split by group, in group order. A group with no cards at all is left out: at the source, an empty section renders no header and no grid — `guest` doesn't see a "Configurações gerais" title over nothing.
 */
export function byGroup(
  cards: readonly ContractCard[],
): { grupo: (typeof GROUPS)[number]; cards: ContractCard[] }[] {
  return GROUPS.map((grupo) => ({
    grupo,
    cards: cards.filter((c) => c.grupo === grupo.id),
  })).filter((section) => section.cards.length > 0);
}

/** A checked row on the Members screen: which table it came from and what its id is. */
export interface MemberTarget {
  tipo: 'usuario' | 'convite';
  id: string;
}

/**
 * Reads the targets the Members table sends in the form. Each checked row arrives as `usuario:<id>` or `convite:<id>` — our `userIdentity`, which at the source is a single key only because there member and invitee live in the same table. **Comes from the browser**, so anything that doesn't match the two known prefixes is discarded here, before it becomes a query: what's left is used to decide WHICH write function to call.
 */
export function readMemberTargets(values: readonly string[]): MemberTarget[] {
  const lidos: MemberTarget[] = [];
  for (const cru of values) {
    const corte = cru.indexOf(':');
    if (corte < 0) continue;
    const tipo = cru.slice(0, corte);
    const id = cru.slice(corte + 1).trim();
    if ((tipo === 'usuario' || tipo === 'convite') && id) lidos.push({ tipo, id });
  }
  return lidos;
}
