import type { NivelNoFluxo, PapelNoFluxo, PermissoesNoFluxo } from '@pipe/contracts';

/**
 * O vocabulário dos dois modais da Equipe — o traço "Permissão" e a lista por
 * recurso —, agora com dado de verdade atrás.
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
 *   paradas   as quatro do `rzslider` (`team.addUserModal.slider`), que os DOIS
 *             modais escrevem com palavras diferentes: adicionar usa
 *             "Visualizar · Customizado · Visualizar e editar · Admin" (DOM
 *             capturado) e editar usa "Visualizar · Personalizado · Ver e
 *             editar · Admin" (`FICHA-equipe-editar.md` §4).
 *
 * Os RECURSOS (as linhas) não moram aqui: vêm de `GET .../equipe`, na ordem do
 * template da origem, porque quem decide o catálogo é o servidor
 * (`dominio/gestao/equipe-do-fluxo.ts`) — a tela só desenha.
 */

/** As três colunas, na ordem da origem, com o tooltip de cada uma. */
export const COLUNAS_DE_NIVEL: readonly { nivel: NivelNoFluxo; rotulo: string; dica: string }[] = [
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

/** As quatro paradas do traço, com a legenda de cada modal. */
export const PAPEIS_DO_FLUXO: readonly {
  papel: PapelNoFluxo;
  adicionar: string;
  editar: string;
}[] = [
  { papel: 'visualizar', adicionar: 'Visualizar', editar: 'Visualizar' },
  { papel: 'personalizado', adicionar: 'Customizado', editar: 'Personalizado' },
  { papel: 'editar', adicionar: 'Visualizar e editar', editar: 'Ver e editar' },
  { papel: 'admin', adicionar: 'Admin', editar: 'Admin' },
];

/**
 * `selectAllPermissions()` da origem, do lado da tela: mover o traço MARCA os
 * rádios. É a mesma regra de `permissoesDoPapel` na `api` — aqui para a lista
 * acompanhar o traço antes de salvar, lá para o banco nunca contradizer o que
 * a pessoa viu.
 */
export function permissoesDoPapel(
  papel: PapelNoFluxo,
  recursos: readonly { chave: string }[],
  personalizadas: PermissoesNoFluxo = {},
): PermissoesNoFluxo {
  const mapa: PermissoesNoFluxo = {};
  for (const recurso of recursos) {
    mapa[recurso.chave] =
      papel === 'personalizado'
        ? (personalizadas[recurso.chave] ?? 'nenhum')
        : papel === 'visualizar'
          ? 'ler'
          : 'escrever';
  }
  return mapa;
}

/** O selo do cartão: a palavra do modal de EDITAR, que é a da lista. */
export function rotuloDoPapel(papel: PapelNoFluxo): string {
  return PAPEIS_DO_FLUXO.find((p) => p.papel === papel)?.editar ?? papel;
}
