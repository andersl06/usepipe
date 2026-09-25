import type { LevelInFlow, RoleInFlow, PermissionsInFlow } from '@pipe/contracts';

/**
 * O vocabulário da Equipe — a barra do modal de adicionar e a matriz da página
 * de editar —, agora com dado de verdade atrás.
 *
 * Até a migração 0035 esta tela era ESPELHO do papel de CONTA: o Pipe não tinha
 * RBAC por fluxo, então os rádios vinham da matriz da 0021 e nasciam
 * desabilitados. Agora existe `fluxo_membro`, e a lista é o que ela guarda —
 * a estrutura de linhas e colunas continua a mesma, só parou de ser enfeite.
 *
 * Duas coisas vêm da origem e não se inventam aqui:
 *
 *   níveis    os três rádios do `PermissionsList.html`: `none` (0), `read` (1)
 *             e `readWrite` (3), rotulados "Sem permissão" / "Visualizar" /
 *             "Ver e editar", cada um com o seu `info`;
 *   paradas   as quatro do `rzslider` (`team.addUserModal.slider`):
 *             "Visualizar · Customizado · Visualizar e editar · Admin". A
 *             edição usa outro controle, um `custom-select` com cinco opções.
 *
 * Os RECURSOS (as linhas) não moram aqui: vêm de `GET .../equipe`, na ordem do
 * template da origem, porque quem decide o catálogo é o servidor
 * (`dominio/gestao/equipe-do-fluxo.ts`) — a tela só desenha.
 */

/** As três colunas, na ordem da origem, com o tooltip de cada uma. */
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

/** A Blip troca o CTA ao preparar a passagem do cadastro curto para `/team/edit`. */
export const acaoDeAdicionar = (role: RoleInFlow) =>
  role === 'personalizado' ? 'Continuar' : 'Salvar';

/** O seletor da PÁGINA de editar tem uma opção a mais que a barra de adicionar. */
export type EditNivel = 'nenhum' | RoleInFlow;

export const NIVEIS_OF_EDIT: readonly { value: EditNivel; rotulo: string }[] = [
  { value: 'nenhum', rotulo: 'Sem permissão' },
  { value: 'personalizado', rotulo: 'Customizado' },
  { value: 'visualizar', rotulo: 'Visualizar' },
  { value: 'editar', rotulo: 'Ver e editar' },
  { value: 'admin', rotulo: 'Admin' },
];

/**
 * `selectAllPermissions()` da origem, do lado da tela: mover o traço MARCA os
 * rádios. É a mesma regra de `permissoesDoPapel` na `api` — aqui para a lista
 * acompanhar o traço antes de salvar, lá para o banco nunca contradizer o que
 * a pessoa viu.
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
 * O `permissionSelect` de `/team/edit` na Blip é derivado da matriz:
 * tudo 0 = none, tudo 1 = read, tudo 3 = readWrite; mistura = custom.
 */
export function editNivel(
  role: RoleInFlow,
  recursos: readonly { key: string }[],
  permissions: PermissionsInFlow,
): EditNivel {
  if (role === 'admin') return 'admin';
  const niveis = recursos.map((recurso) => permissions[recurso.key] ?? 'nenhum');
  if (niveis.every((nivel) => nivel === 'nenhum')) return 'nenhum';
  if (niveis.every((nivel) => nivel === 'ler')) return 'visualizar';
  if (niveis.every((nivel) => nivel === 'escrever')) return 'editar';
  return 'personalizado';
}

/** `none` cabe no papel personalizado do Pipe com todas as linhas zeradas. */
export function permissionsOfNivelOfEdit(
  nivel: EditNivel,
  recursos: readonly { key: string }[],
  current: PermissionsInFlow,
): PermissionsInFlow {
  if (nivel === 'nenhum') {
    return Object.fromEntries(recursos.map((recurso) => [recurso.key, 'nenhum']));
  }
  return rolePermissions(nivel, recursos, current);
}
