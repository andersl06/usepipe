import { asc, getTableColumns, sql } from 'drizzle-orm';
import { schema } from '@pipe/db';
import type { TransactionPipe } from '@pipe/db';
import { databaseOwner, noTenant } from '../database.js';
import { TwentyError, chamar, configDoTenant } from './twenty.js';
import type { ConfigTwenty } from './twenty.js';

/**
 * Mirror each tenant's data dictionary from its Twenty CRM metadata. The flow builder and AI read the fields in THAT client's own instance, avoiding guessed field names. Owner rule: copy facts, never invent them. Preserve the Metadata API's `objectMetadata`/`fieldMetadata` property names, literal `type`, and `options`/`defaultValue`/`settings`/`relation` JSON (migration 0015). Do not copy Twenty code: it is AGPL; consume only its API and data shape. Queue, sweep, and isolation follow `espelho-crm.ts`: read `configDoTenant` inside `comTenant` so RLS protects URL and key; call the network OUTSIDE the transaction to free the pool connection; write back inside the job tenant's `comTenant` so RLS prevents cross-tenant records.
 */

const { dictionaryObject, dictionaryField } = schema;

/** A tenant without CRM configuration is an absence, not an error; skip synchronization. */
export const SEM_CRM = 'sem_crm' as const;

/**
 * `agregavel` applies only to numeric types: `NUMBER` and `NUMERIC` sum directly; `CURRENCY` sums `amountMicros` within one `currencyCode`. Text cannot be summed, and `RATING` is ordinal text (`RATING_1`…`RATING_5`).
 */
export const TIPOS_AGREGAVEIS: readonly string[] = ['NUMBER', 'NUMERIC', 'CURRENCY'];

/** `TS_VECTOR` is Twenty's full-text search index, not customer data. */
export const TIPOS_NAO_CONSULTAVEIS: readonly string[] = ['TS_VECTOR'];

/*
 * Metadata API selection depends on the schema of THAT instance. Request only available fields, allowing the same call to support Twenty 2.39 with `applicationId` and pre-2.12 versions with `isCustom`, without a version table.
 */
const PROPS_OBJETO = [
  'id',
  'nameSingular',
  'namePlural',
  'labelSingular',
  'labelPlural',
  'description',
  'icon',
  'isCustom',
  'isActive',
  'isSystem',
  'isRemote',
  'applicationId',
] as const;

const PROPS_CAMPO = [
  'id',
  'name',
  'label',
  'type',
  'description',
  'icon',
  'isCustom',
  'isActive',
  'isSystem',
  'isNullable',
  'isUnique',
  'defaultValue',
  'options',
  'settings',
  'applicationId',
] as const;

/** API relation format: `type` expresses cardinality (`MANY_TO_ONE`/`ONE_TO_MANY`). */
const RELATION =
  'type targetObjectMetadata { id nameSingular } targetFieldMetadata { id name }';

const PAGE = 50;

export interface CampoTwenty {
  id: string;
  name: string;
  label: string;
  type: string;
  description?: string | null;
  icon?: string | null;
  isCustom?: boolean;
  isActive?: boolean;
  isSystem?: boolean;
  isNullable?: boolean | null;
  isUnique?: boolean | null;
  defaultValue?: unknown;
  options?: unknown;
  settings?: unknown;
  applicationId?: string | null;
  relation?: unknown;
  morphRelations?: unknown;
}

export interface ObjetoTwenty {
  id: string;
  nameSingular: string;
  namePlural?: string;
  labelSingular: string;
  labelPlural?: string;
  description?: string | null;
  icon?: string | null;
  isCustom?: boolean;
  isActive?: boolean;
  isSystem?: boolean;
  isRemote?: boolean;
  applicationId?: string | null;
  fields: CampoTwenty[];
}

export interface MetadadosTwenty {
  /** `workspaceCustomApplicationId` identifies the app owning customer-created objects (Twenty 2.12+). */
  customApplicationId: string | null;
  objetos: ObjetoTwenty[];
}

type NoObjeto = Omit<ObjetoTwenty, 'fields'> & {
  fieldsList?: CampoTwenty[];
  fields?: { edges: { node: CampoTwenty }[] };
};

/**
 * Read instance objects and fields in three serial steps: introspect `Object` and `Field` to discover available fields; read `currentWorkspace.workspaceCustomApplicationId` on 2.12+; then page through `objects` with each one's fields.
 */
export async function lerMetadados(
  config: ConfigTwenty,
  buscar: typeof fetch = fetch,
): Promise<MetadadosTwenty> {
  const tipos = await chamar<{
    o: { fields: { name: string }[] } | null;
    f: { fields: { name: string }[] } | null;
  }>(
    config,
    '/metadata',
    '{ o: __type(name: "Object") { fields { name } } f: __type(name: "Field") { fields { name } } }',
    {},
    buscar,
  );
  const temObjeto = new Set(tipos.o?.fields.map((c) => c.name));
  const temCampo = new Set(tipos.f?.fields.map((c) => c.name));
  if (!temObjeto.has('nameSingular') || !temCampo.has('name')) {
    throw new TwentyError(`CRM em ${config.url} não expõe a Metadata API esperada`, true);
  }

  const camposPedidos = [
    ...PROPS_CAMPO.filter((p) => temCampo.has(p)),
    ...(temCampo.has('relation') ? [`relation { ${RELATION} }`] : []),
    ...(temCampo.has('morphRelations') ? [`morphRelations { ${RELATION} }`] : []),
  ].join(' ');
  // `fieldsList` returns the whole field list; without it, use the older paginated connection.
  const listaDeCampos = temObjeto.has('fieldsList')
    ? `fieldsList { ${camposPedidos} }`
    : `fields(paging: { first: 1000 }) { edges { node { ${camposPedidos} } } }`;
  const objetoPedido = PROPS_OBJETO.filter((p) => temObjeto.has(p)).join(' ');

  let customApplicationId: string | null = null;
  if (!temObjeto.has('isCustom') && temObjeto.has('applicationId')) {
    const w = await chamar<{ currentWorkspace: { workspaceCustomApplicationId: string | null } }>(
      config,
      '/metadata',
      '{ currentWorkspace { workspaceCustomApplicationId } }',
      {},
      buscar,
    );
    customApplicationId = w.currentWorkspace.workspaceCustomApplicationId;
  }

  const objetos: ObjetoTwenty[] = [];
  let depois: string | null = null;
  do {
    const r: {
      objects: {
        pageInfo: { hasNextPage: boolean; endCursor: string | null };
        edges: { node: NoObjeto }[];
      };
    } = await chamar(
      config,
      '/metadata',
      `query($depois: ConnectionCursor) {
         objects(paging: { first: ${PAGE}, after: $depois }) {
           pageInfo { hasNextPage endCursor }
           edges { node { ${objetoPedido} ${listaDeCampos} } }
         }
       }`,
      { depois },
      buscar,
    );
    for (const { node } of r.objects.edges) {
      const { fieldsList, fields, ...objeto } = node;
      objetos.push({ ...objeto, fields: fieldsList ?? fields?.edges.map((e) => e.node) ?? [] });
    }
    depois = r.objects.pageInfo.hasNextPage ? r.objects.pageInfo.endCursor : null;
  } while (depois);

  return { customApplicationId, objetos };
}

/**
 * Determine customer ownership: before Twenty 2.12 use `isCustom`; later compare ownership with `workspaceCustomApplicationId`.
 */
export function ehDoCliente(
  no: { isCustom?: boolean; applicationId?: string | null },
  customApplicationId: string | null,
): boolean {
  if (typeof no.isCustom === 'boolean') return no.isCustom;
  return customApplicationId !== null && no.applicationId === customApplicationId;
}

export type ResultDictionary =
  | {
      state: 'sincronizado';
      objetos: number;
      campos: number;
      doCliente: { objetos: number; campos: number };
      removidos: { objetos: number; campos: number };
    }
  | { state: typeof SEM_CRM };

export async function syncDictionary(
  tenantId: string,
  buscar: typeof fetch = fetch,
): Promise<ResultDictionary> {
  const config = await noTenant(tenantId, (tx) => configDoTenant(tx, tenantId));
  if (!config) return { state: SEM_CRM };

  // Keep the network call outside the transaction; see the file header.
  const meta = await lerMetadados(config, buscar);
  // Every workspace has built-in objects. An empty list means missing permission or a broken instance;
  // writing it would mark the entire dictionary removed.
  if (meta.objetos.length === 0) {
    throw new TwentyError(`CRM em ${config.url} devolveu zero objetos; nada foi gravado`);
  }

  return noTenant(tenantId, (tx) => gravar(tx, tenantId, meta));
}

/** Upsert by `name` and mark missing records removed, serially inside `comTenant`. */
async function gravar(
  tx: TransactionPipe,
  tenantId: string,
  meta: MetadadosTwenty,
): Promise<ResultDictionary> {
  const agora = new Date();

  const objetos = meta.objetos.map((o) => ({
    tenantId,
    codigo: o.nameSingular,
    rotulo: o.labelSingular,
    description: o.description ?? null,
    twentyId: o.id,
    namePlural: o.namePlural ?? null,
    labelPlural: o.labelPlural ?? null,
    icon: o.icon ?? null,
    isCustom: ehDoCliente(o, meta.customApplicationId),
    isActive: o.isActive ?? true,
    isSystem: o.isSystem ?? false,
    isRemote: o.isRemote ?? false,
    applicationId: o.applicationId ?? null,
    excluidoEm: null,
    atualizadoEm: agora,
  }));

  const campos = meta.objetos.flatMap((o) =>
    o.fields.map((c) => ({
      tenantId,
      objetoCodigo: o.nameSingular,
      codigo: c.name,
      rotulo: c.label,
      tipo: c.type,
      descricao: c.description ?? null,
      consultavel: !TIPOS_NAO_CONSULTAVEIS.includes(c.type),
      agregavel: TIPOS_AGREGAVEIS.includes(c.type),
      twentyId: c.id,
      icon: c.icon ?? null,
      isCustom: ehDoCliente(c, meta.customApplicationId),
      isActive: c.isActive ?? true,
      isSystem: c.isSystem ?? false,
      isNullable: c.isNullable ?? null,
      isUnique: c.isUnique ?? null,
      defaultValue: c.defaultValue ?? null,
      options: c.options ?? null,
      settings: c.settings ?? null,
      relation: c.relation ?? null,
      morphRelations: c.morphRelations ?? null,
      applicationId: c.applicationId ?? null,
      atualizadoEm: agora,
      excluidoEm: null,
    })),
  );

  for (const lote of emLotes(objetos)) {
    await tx
      .insert(dictionaryObject)
      .values(lote)
      .onConflictDoUpdate({
        target: [dictionaryObject.tenantId, dictionaryObject.codigo],
        set: doExcluded(dictionaryObject, Object.keys(lote[0]!), ['tenantId', 'codigo']),
      });
  }
  for (const lote of emLotes(campos)) {
    await tx
      .insert(dictionaryField)
      .values(lote)
      .onConflictDoUpdate({
        target: [dictionaryField.tenantId, dictionaryField.objetoCodigo, dictionaryField.codigo],
        set: doExcluded(dictionaryField, Object.keys(lote[0]!), [
          'tenantId',
          'objetoCodigo',
          'codigo',
        ]),
      });
  }

  // What disappeared from Twenty becomes inactive with `excluido_em`, never deleted. Only rows
  // imported from Twenty (`twenty_id`) are ours to mark; leave handmade CRM declarations alone.
  const codigos = JSON.stringify(objetos.map((o) => o.codigo));
  const removidosObj = await tx.execute(sql`
    update dicionario_objeto
       set is_active = false, excluido_em = now(), atualizado_em = now()
     where twenty_id is not null and excluido_em is null
       and codigo not in (select jsonb_array_elements_text(${codigos}::jsonb))
  `);
  const chaves = JSON.stringify(campos.map((c) => `${c.objetoCodigo}.${c.codigo}`));
  const removidosCampo = await tx.execute(sql`
    update dicionario_campo
       set is_active = false, excluido_em = now(), atualizado_em = now()
     where twenty_id is not null and excluido_em is null
       and objeto_codigo || '.' || codigo not in (select jsonb_array_elements_text(${chaves}::jsonb))
  `);

  return {
    state: 'sincronizado',
    objetos: objetos.length,
    campos: campos.length,
    doCliente: {
      objetos: objetos.filter((o) => o.isCustom).length,
      campos: campos.filter((c) => c.isCustom).length,
    },
    removidos: { objetos: removidosObj.rowCount ?? 0, campos: removidosCampo.rowCount ?? 0 },
  };
}

/** Use `excluded.<coluna>` for each row column except the conflict key. */
function doExcluded(
  tabela: typeof dictionaryObject | typeof dictionaryField,
  chavesDaLinha: string[],
  keyOfConflict: string[],
) {
  const colunas = getTableColumns(tabela) as Record<string, { name: string }>;
  return Object.fromEntries(
    chavesDaLinha
      .filter((k) => !keyOfConflict.includes(k))
      .map((k) => [k, sql.raw(`excluded."${colunas[k]!.name}"`)]),
  );
}

/** Process 500 rows per statement, about 25 columns each, below Postgres's 65,535 parameter limit. */
function emLotes<T>(linhas: T[], tamanho = 500): T[][] {
  const lotes: T[][] = [];
  for (let i = 0; i < linhas.length; i += tamanho) lotes.push(linhas.slice(i, i + tamanho));
  return lotes;
}

export type FieldOfDictionary = Omit<
  typeof dictionaryField.$inferSelect,
  'id' | 'tenantId' | 'objetoCodigo'
>;
export type ObjectOfDictionary = Omit<typeof dictionaryObject.$inferSelect, 'id' | 'tenantId'> & {
  campos: FieldOfDictionary[];
};

/**
 * Return the current tenant's dictionary with each object and fields for the flow builder and AI. Include inactive and removed records: consumers filter `isActive`/`excluidoEm`, and a block pointing to a removed field must report "field removed" rather than "unknown field". Run both reads serially in the caller's `noTenant`.
 */
export async function readDictionary(tx: TransactionPipe): Promise<ObjectOfDictionary[]> {
  const objetos = await tx.select().from(dictionaryObject).orderBy(asc(dictionaryObject.codigo));
  const campos = await tx
    .select()
    .from(dictionaryField)
    .orderBy(asc(dictionaryField.objetoCodigo), asc(dictionaryField.codigo));

  const byObject = new Map<string, FieldOfDictionary[]>();
  for (const linha of campos) {
    const { objetoCodigo, ...campo } = semIds(linha);
    const lista = byObject.get(objetoCodigo) ?? [];
    lista.push(campo);
    byObject.set(objetoCodigo, lista);
  }
  return objetos.map((linha) => ({
    ...semIds(linha),
    campos: byObject.get(linha.codigo) ?? [],
  }));
}

/** Do not expose internal ID or tenant: consumers match by `codigo`, and tenant comes from the session. */
function semIds<T extends { id: string; tenantId: string }>(linha: T): Omit<T, 'id' | 'tenantId'> {
  const copia: Partial<T> = { ...linha };
  delete copia.id;
  delete copia.tenantId;
  return copia as Omit<T, 'id' | 'tenantId'>;
}

/**
 * Select tenants for periodic dictionary synchronization and count those without CRM. Use the owner role like `contatosSemEspelho` to scan before any tenant is established. ONLY this `select` uses it; synchronize each tenant under `comTenant`.
 */
export async function tenantsOfDictionary(): Promise<{ comCrm: string[]; semCrm: number }> {
  const { rows } = await databaseOwner().execute<{ id: string; tem_crm: boolean }>(sql`
    select id, (twenty_url is not null and twenty_chave is not null) as tem_crm
      from tenant
     where ativo
     order by criado_em
  `);
  return {
    comCrm: rows.filter((l) => l.tem_crm).map((l) => l.id),
    semCrm: rows.filter((l) => !l.tem_crm).length,
  };
}
