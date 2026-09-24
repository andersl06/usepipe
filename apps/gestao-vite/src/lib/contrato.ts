/**
 * O que o Painel do contrato (`/contrato`) lê e grava.
 *
 * Nada aqui sabe que o Next existe — sem `revalidatePath`, sem JSX —, como em
 * `lib/configuracoes.ts`: recebe parâmetro, devolve dado. É o que faz virar
 * endpoint da `apps/api` por movimentação e não por reescrita (README, "Quem
 * fala com o banco").
 *
 * A régua da tela é `referencias-blip/pesquisa/blip-painel-do-contrato.md`.
 */

export interface ResumoDoContrato {
  id: string;
  nome: string;
  slug: string;
  logoUrl: string | null;
  /** ISO 8601: atravessa o JSON como texto. */
  criadoEm: string | null;
  /** O fuso da conta: é nele que a data de criação é escrita, não no do servidor. */
  fuso: string;
  /** Os "Chatbots" do cartão deles. Aqui é fluxo e roteador, fora os arquivados. */
  fluxos: number;
  /** Os "Membros". Só conta quem ainda tem acesso. */
  membros: number;
}

/**
 * Um dos três papéis de CONTA (`papel.escopo = 'conta'`, migração 0021). O
 * `nome` é o `roleId` da origem — `admin`, `member`, `guest` — e é por ele que a
 * tela acha o rótulo, a descrição e o ícone (`PAPEIS_DA_ORIGEM`).
 */
export interface PapelDaConta {
  id: string;
  nome: string;
}

export interface MembroDoContrato {
  id: string;
  /**
   * De qual tabela veio a linha. Na origem há uma só (`tenant-user`), e o
   * `userStatus` distingue `Accepted` de `PendingUser`; aqui quem já entrou é
   * `usuario` e quem foi chamado e ainda não veio é `convite` — é a mesma
   * distinção, com o dado guardado em dois lugares.
   */
  tipo: 'usuario' | 'convite';
  nome: string;
  email: string;
  avatarUrl: string | null;
  papelId: string | null;
  papelNome: string | null;
}

export type Gravacao = { ok: true } | { ok: false; erro: string };
