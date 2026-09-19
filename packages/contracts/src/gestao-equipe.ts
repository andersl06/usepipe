/**
 * A aba "Equipe" do contato (`/fluxo/:id/equipe`): quem acessa ESTE fluxo e com
 * que permissão — o que `/v1/gestao/fluxos/:id/equipe` responde.
 *
 * Os nomes são os da origem, sem tradução livre: os níveis por recurso são os três
 * rádios do `PermissionsList.html` (`none` 0, `read` 1, `readWrite` 3) e o papel é
 * uma das quatro paradas do `rzslider` (`visualize`, `custom`, `edit`, `admin`).
 * A regra inteira está em `apps/api/src/dominio/gestao/equipe-do-fluxo.ts` e na
 * migration 0035.
 */

/** Os três rádios de cada linha: `none` (0), `read` (1), `readWrite` (3). */
export type NivelNoFluxo = 'nenhum' | 'ler' | 'escrever';

/** As quatro paradas do traço "Permissão". */
export type PapelNoFluxo = 'visualizar' | 'personalizado' | 'editar' | 'admin';

/** Recurso da origem → rádio marcado. Chave ausente é `nenhum`. */
export type PermissoesNoFluxo = Partial<Record<string, NivelNoFluxo>>;

/** Uma linha do `PermissionsList.html`: a chave da origem e o título pt-BR dela. */
export interface RecursoDoFluxo {
  chave: string;
  titulo: string;
}

/** Um cartão da lista de Equipe. */
export interface MembroDoFluxo {
  usuarioId: string;
  nome: string;
  email: string;
  papelNoFluxo: PapelNoFluxo;
  permissoes: PermissoesNoFluxo;
  criadoEm: string;
}

/** `GET /v1/gestao/fluxos/:id/equipe`. */
export interface EquipeDoFluxo {
  membros: MembroDoFluxo[];
  /** As linhas do modal de editar, na ordem da origem. */
  recursos: RecursoDoFluxo[];
  /** Quem está olhando pode adicionar, editar e remover? */
  podeGerir: boolean;
}

/** `GET /v1/gestao/fluxos/:id/equipe/eu` — o que o menu do contato peneira. */
export interface MinhasPermissoesNoFluxo {
  /** `null` quando a pessoa não é membro deste fluxo (o acesso vem da conta). */
  papelNoFluxo: PapelNoFluxo | null;
  permissoes: PermissoesNoFluxo;
  /** A permissão de conta que hoje edita fluxo — quem a tem enxerga tudo. */
  editaPelaConta: boolean;
}

/** Corpo do `POST` e do `PATCH` da equipe. */
export interface PedidoDeMembroDoFluxo {
  /** Só no `POST`: o e-mail de alguém que já está no contrato. */
  email?: string;
  papelNoFluxo?: PapelNoFluxo;
  /** Só é lido quando o papel é `personalizado`; nos outros o nível manda. */
  permissoes?: PermissoesNoFluxo;
}
