import type { LevelInFlow, RoleInFlow, PermissionsInFlow } from '@pipe/contracts';

/**
 * The Team vocabulary — the add-member modal's bar and the edit page's matrix —, now backed by real data.
 *
 * Until migration 0035 this screen MIRRORED the ACCOUNT role: Pipe had no per-flow RBAC, so the radios came from migration 0021's matrix and were born disabled. Now `fluxo_membro` exists, and the list is what it stores — the row/column layout stays the same, it just stopped being decorative.
 *
 * Two things come from the origin and aren't invented here:
 *
 *   levels    the three radios from `PermissionsList.html`: `none` (0), `read` (1), and `readWrite` (3), labeled "Sem permissão" / "Visualizar" / "Ver e editar", each with its own `info`;
 *   stops     the four from the `rzslider` (`team.addUserModal.slider`): "Visualizar · Customizado · Visualizar e editar · Admin". The edit page uses a different control, a `custom-select` with five options.
 *
 * The RESOURCES (the rows) don't live here: they come from `GET .../equipe`, in the origin template's order, because the server decides the catalog (`dominio/gestao/equipe-do-fluxo.ts`) — the screen only renders it.
 */

/** The three columns, in the origin's order, each with its own tooltip. */
export const COLUNAS_DE_NIVEL: readonly { nivel: LevelInFlow; rotulo: string; dica: string }[] = [
  {
    nivel: 'nenhum',
    rotulo: 'Sem permissão',
    dica: 'O usuário não vê este menu nem acessa seu conteúdo.',
  },
  {
    nivel: 'ler',
    rotulo: 'Visualizar',
    dica: 'O usuário consegue visualizar as informações, mas não pode fazer alterações.',
  },
  {
    nivel: 'escrever',
    rotulo: 'Ver e editar',
    dica: 'O usuário pode visualizar e também alterar as informações desta página.',
  },
];

/** As quatro paradas da barra do modal de adicionar. */
export const ROLES_OF_FLOW: readonly {
  role: RoleInFlow;
  adicionar: string;
}[] = [
  { role: 'visualizar', adicionar: 'Visualizar' },
  { role: 'personalizado', adicionar: 'Customizado' },
  { role: 'editar', adicionar: 'Visualizar e editar' },
  { role: 'admin', adicionar: 'Admin' },
];

/** Blip swaps the CTA when preparing the handoff from the short signup form to `/team/edit`. */
export const acaoDeAdicionar = (role: RoleInFlow) =>
  role === 'personalizado' ? 'Continuar' : 'Salvar';

/** The edit PAGE's selector has one more option than the add-member bar. */
export type EditLevel = 'nenhum' | RoleInFlow;

export const LEVELS_OF_EDIT: readonly { value: EditLevel; rotulo: string }[] = [
  { value: 'nenhum', rotulo: 'Sem permissão' },
  { value: 'personalizado', rotulo: 'Customizado' },
  { value: 'visualizar', rotulo: 'Visualizar' },
  { value: 'editar', rotulo: 'Ver e editar' },
  { value: 'admin', rotulo: 'Admin' },
];

/**
 * The origin's `selectAllPermissions()`, on the screen side: moving the slider MARKS the radios. It's the same rule as `rolePermissions` in the `api` — here so the list follows the slider before saving, there so the database never contradicts what the person saw.
 */
export function rolePermissions(
  role: RoleInFlow,
  recursos: readonly { key: string }[],
  personalizadas: PermissionsInFlow = {},
): PermissionsInFlow {
  const mapa: PermissionsInFlow = {};
  for (const recurso of recursos) {
    mapa[recurso.key] =
      role === 'personalizado'
        ? (personalizadas[recurso.key] ?? 'nenhum')
        : role === 'visualizar'
          ? 'ler'
          : 'escrever';
  }
  return mapa;
}

/**
 * Blip's `/team/edit` `permissionSelect` is derived from the matrix: all 0 = none, all 1 = read, all 3 = readWrite; mixed = custom.
 */
export function editLevel(
  role: RoleInFlow,
  recursos: readonly { key: string }[],
  permissions: PermissionsInFlow,
): EditLevel {
  if (role === 'admin') return 'admin';
  const niveis = recursos.map((recurso) => permissions[recurso.key] ?? 'nenhum');
  if (niveis.every((nivel) => nivel === 'nenhum')) return 'nenhum';
  if (niveis.every((nivel) => nivel === 'ler')) return 'visualizar';
  if (niveis.every((nivel) => nivel === 'escrever')) return 'editar';
  return 'personalizado';
}

/** `none` cabe no papel personalizado do Pipe com todas as linhas zeradas. */
export function permissionsOfLevelOfEdit(
  nivel: EditLevel,
  recursos: readonly { key: string }[],
  current: PermissionsInFlow,
): PermissionsInFlow {
  if (nivel === 'nenhum') {
    return Object.fromEntries(recursos.map((recurso) => [recurso.key, 'nenhum']));
  }
  return rolePermissions(nivel, recursos, current);
}
