/**
 * The contact's Team tab (`/fluxo/:id/equipe`) shows who can access this flow and at what permission, returned by `/v1/gestao/fluxos/:id/equipe`. Names mirror the source: per-resource levels are the three `PermissionsList.html` radio choices (`none` 0, `read` 1, `readWrite` 3), and role is one of four `rzslider` stops (`visualize`, `custom`, `edit`, `admin`). Full rules live in `apps/api/src/dominio/gestao/equipe-do-fluxo.ts` and migration 0035.
 */

/** Three radio choices per row: `none` (0), `read` (1), and `readWrite` (3). */
export type LevelInFlow = 'nenhum' | 'ler' | 'escrever';

/** Four stops of the Permission slider. */
export type RoleInFlow = 'visualizar' | 'personalizado' | 'editar' | 'admin';

/** Source resource to selected radio choice; absent key means `nenhum`. */
export type PermissionsInFlow = Partial<Record<string, LevelInFlow>>;

/** One `PermissionsList.html` row: source key and its pt-BR title. */
export interface RecursoOfFlow {
  key: string;
  titulo: string;
}


export interface MemberOfFlow {
  userId: string;
  nome: string;
  email: string;
  roleInFlow: RoleInFlow;
  permissions: PermissionsInFlow;
  criadoEm: string;
}

/** `GET /v1/gestao/fluxos/:id/equipe`. */
export interface TeamOfFlow {
  members: MemberOfFlow[];
  /** As linhas do modal de editar, na ordem da origem. */
  recursos: RecursoOfFlow[];
  /** Whether the current viewer can add, edit, and remove members. */
  podeGerir: boolean;
}

/** `GET /v1/gestao/fluxos/:id/equipe/eu` — o que o menu do contato peneira. */
export interface MyPermissionsInFlow {
  /** `null` when the person is not a member of this flow and access comes from the account. */
  papelNoFluxo: RoleInFlow | null;
  permissoes: PermissionsInFlow;
  /** Account permission that currently allows flow editing and grants full visibility. */
  editaByAccount: boolean;
}

/** Corpo do `POST` e do `PATCH` da equipe. */
export interface RequestOfMemberOfFlow {
  /** Only for `POST`: email of someone already on the contract. */
  email?: string;
  papelNoFluxo?: RoleInFlow;
  /** Read only when the role is `personalizado`; otherwise the level controls access. */
  permissoes?: PermissionsInFlow;
}
