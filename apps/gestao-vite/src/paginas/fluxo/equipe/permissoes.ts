import type { NivelNoFluxo, PapelNoFluxo, PermissoesNoFluxo } from '@pipe/contracts';

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

/** As quatro paradas da barra do modal de adicionar. */
export const PAPEIS_DO_FLUXO: readonly {
  papel: PapelNoFluxo;
  adicionar: string;
}[] = [
  { papel: 'visualizar', adicionar: 'Visualizar' },
  { papel: 'personalizado', adicionar: 'Customizado' },
  { papel: 'editar', adicionar: 'Visualizar e editar' },
  { papel: 'admin', adicionar: 'Admin' },
];

/** A Blip troca o CTA ao preparar a passagem do cadastro curto para `/team/edit`. */
export const acaoDeAdicionar = (papel: PapelNoFluxo) =>
  papel === 'personalizado' ? 'Continuar' : 'Salvar';

/** O seletor da PÁGINA de editar tem uma opção a mais que a barra de adicionar. */
export type NivelDaEdicao = 'nenhum' | PapelNoFluxo;

export const NIVEIS_DA_EDICAO: readonly { valor: NivelDaEdicao; rotulo: string }[] = [
  { valor: 'nenhum', rotulo: 'Sem permissão' },
  { valor: 'personalizado', rotulo: 'Customizado' },
  { valor: 'visualizar', rotulo: 'Visualizar' },
  { valor: 'editar', rotulo: 'Ver e editar' },
  { valor: 'admin', rotulo: 'Admin' },
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

/**
 * O `permissionSelect` de `/team/edit` na Blip é derivado da matriz:
 * tudo 0 = none, tudo 1 = read, tudo 3 = readWrite; mistura = custom.
 */
export function nivelDaEdicao(
  papel: PapelNoFluxo,
  recursos: readonly { chave: string }[],
  permissoes: PermissoesNoFluxo,
): NivelDaEdicao {
  if (papel === 'admin') return 'admin';
  const niveis = recursos.map((recurso) => permissoes[recurso.chave] ?? 'nenhum');
  if (niveis.every((nivel) => nivel === 'nenhum')) return 'nenhum';
  if (niveis.every((nivel) => nivel === 'ler')) return 'visualizar';
  if (niveis.every((nivel) => nivel === 'escrever')) return 'editar';
  return 'personalizado';
}

/** `none` cabe no papel personalizado do Pipe com todas as linhas zeradas. */
export function permissoesDoNivelDaEdicao(
  nivel: NivelDaEdicao,
  recursos: readonly { chave: string }[],
  atuais: PermissoesNoFluxo,
): PermissoesNoFluxo {
  if (nivel === 'nenhum') {
    return Object.fromEntries(recursos.map((recurso) => [recurso.chave, 'nenhum']));
  }
  return permissoesDoPapel(nivel, recursos, atuais);
}
