/**
 * A lista de permissões granulares do "Editar membro" — o `PermissionsList.html`
 * da rota `/team/team/edit` da origem (bundle em
 * `docs/capturas/blip/equipe/zip18/.../portal.js`): uma linha por RECURSO
 * (Canais, Usuários do bot, Growth, Configurações, Recursos, Log de mensagens,
 * Builder, Análise…) e, em cada linha, três rádios — `none` (0), `read` (1) e
 * `readWrite` (3), rotulados "Sem permissão" / "Visualizar" / "Ver e editar".
 * Acima da lista fica o seletor de nível, e é ele quem marca os rádios:
 * "Visualizar" põe tudo em `read`, "Ver e editar" e "Admin" põem tudo em
 * `readWrite`, e "Personalizado" libera cada linha para a mão
 * (`selectAllPermissions()` / `checkStatus()`).
 *
 * **O que o nosso modelo alcança e o que não alcança.** O RBAC da conta
 * (migrações 0019 e 0021) tem exatamente TRÊS papéis de sistema —
 * `guest`/`member`/`admin` — e cada um carrega um conjunto FIXO de permissões
 * `<recurso>.<verbo>`. Não existe papel "Personalizado": trocar um rádio à mão
 * exigiria criar um papel novo por pessoa, e isso não é o que o produto tem.
 * Por isso a lista aqui é ESPELHO do nível escolhido (muda com o traço, como na
 * origem), mas os rádios não se mexem sozinhos — a estrutura de linhas e
 * colunas é a deles, pronta para o dia em que houver papel por pessoa.
 *
 * A matriz abaixo é a de `0021_papel_da_conta.sql` (a "matriz deles": `admin`
 * tudo; `member` = resumo read + workspace read/write + editar fluxos; `guest`
 * = só leitura). Mora aqui porque `GET /v1/gestao/contrato/membros` devolve os
 * papéis sem as permissões — quando a API passar a mandar `papel.permissoes`,
 * `nivelDoRecurso` troca esta constante pelo dado e o resto não muda.
 */

/** Os três rádios da origem: `none` (0), `read` (1), `readWrite` (3). */
export type NivelDoRecurso = 'nenhum' | 'ler' | 'escrever';

export interface RecursoDaConta {
  /** A chave da matriz sem o verbo — `conta.membros`, como em `catalogo.ts`. */
  chave: string;
  /** O `{{recurso.title}}` da linha. */
  titulo: string;
  /**
   * `false` quando o recurso não tem verbo de escrita NO CATÁLOGO (0019):
   * faturamento só existe em leitura porque, na matriz deles, ninguém tem
   * `write` em `tenant-billing` — nem o `admin`. A linha ainda aparece, mas o
   * rádio "Ver e editar" não é uma opção que exista.
   */
  temEscrita: boolean;
}

/** A ordem é a das linhas da 0019, que é a ordem dos cartões do Painel. */
export const RECURSOS_DA_CONTA: readonly RecursoDaConta[] = [
  { chave: 'conta.resumo', titulo: 'Resumo do contrato', temEscrita: true },
  { chave: 'conta.membros', titulo: 'Membros', temEscrita: true },
  { chave: 'conta.workspace', titulo: 'Espaço de trabalho', temEscrita: true },
  { chave: 'conta.painel', titulo: 'Painel do contrato', temEscrita: true },
  { chave: 'conta.faturamento', titulo: 'Faturamento', temEscrita: false },
  { chave: 'conta.grupos_acesso', titulo: 'Grupos de acesso', temEscrita: true },
  /* `automacao.fluxo.editar` é um verbo só ("Cria e edita chatbots"): quem o
     tem, vê e edita; quem não tem, não entra. Não há `automacao.fluxo.ler`
     separado no catálogo, então a coluna do meio nunca acende nesta linha. */
  { chave: 'automacao.fluxo', titulo: 'Fluxos e roteadores', temEscrita: true },
];

/**
 * As permissões de cada papel de conta, por `roleId` — cópia fiel do `VALUES`
 * da migração 0021. `automacao.fluxo.editar` entra aqui com o verbo trocado
 * para `escrever` só para a conta bater com as outras linhas.
 */
const MATRIZ_DA_CONTA: Readonly<Record<string, readonly string[]>> = {
  admin: [
    'conta.resumo.ler',
    'conta.resumo.escrever',
    'conta.membros.ler',
    'conta.membros.escrever',
    'conta.workspace.ler',
    'conta.workspace.escrever',
    'conta.painel.ler',
    'conta.painel.escrever',
    'conta.faturamento.ler',
    'conta.grupos_acesso.ler',
    'conta.grupos_acesso.escrever',
    'automacao.fluxo.escrever',
  ],
  member: [
    'conta.resumo.ler',
    'conta.workspace.ler',
    'conta.workspace.escrever',
    'automacao.fluxo.escrever',
  ],
  guest: ['conta.resumo.ler', 'conta.workspace.ler'],
};

/** Qual rádio da linha `recurso` fica marcado para o papel `roleId`. */
export function nivelDoRecurso(roleId: string, recurso: RecursoDaConta): NivelDoRecurso {
  const permissoes = MATRIZ_DA_CONTA[roleId] ?? [];
  if (permissoes.includes(`${recurso.chave}.escrever`)) return 'escrever';
  if (permissoes.includes(`${recurso.chave}.ler`)) return 'ler';
  return 'nenhum';
}

/** As três colunas, na ordem da origem, com o tooltip de cada uma. */
export const COLUNAS_DE_NIVEL: readonly { nivel: NivelDoRecurso; rotulo: string; dica: string }[] =
  [
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
