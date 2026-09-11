import { asc, getTableColumns, sql } from 'drizzle-orm';
import { schema } from '@pipe/db';
import type { TransacaoPipe } from '@pipe/db';
import { bancoDono, noTenant } from '../banco.js';
import { TwentyErro, chamar, configDoTenant } from './twenty.js';
import type { ConfigTwenty } from './twenty.js';

/**
 * O dicionário de dados de cada tenant, espelhado dos metadados do CRM (Twenty) dele.
 *
 * O builder de fluxo e a IA leem daqui o que existe no CRM **daquele** cliente — cada
 * cliente tem instância própria e cria objetos e campos próprios. Sem isto, a IA chuta
 * nome de campo.
 *
 * Diretriz do dono: nada inventado, tudo copiado. O formato é o do `objectMetadata` e do
 * `fieldMetadata` que a Metadata API devolve — mesmos nomes de propriedade, `type`
 * literal, `options`/`defaultValue`/`settings`/`relation` no JSON que veio. Ver a
 * migration 0015. **Nenhum código do Twenty** foi copiado: ele é AGPL; só consumimos a
 * API e o formato dela.
 *
 * O desenho de fila, varredura e isolamento é o de `espelho-crm.ts`:
 * 1. `configDoTenant` roda dentro do `comTenant` — sem RLS não há URL nem chave;
 * 2. a chamada de rede acontece FORA da transação, para não prender conexão do pool;
 * 3. a escrita volta para o `comTenant` do tenant do job, e a RLS impede a linha de cair
 *    em outro tenant.
 */

const { dicionarioObjeto, dicionarioCampo } = schema;

/** Tenant sem CRM configurado. Não é erro: é ausência, e a sincronização é pulada. */
export const SEM_CRM = 'sem_crm' as const;

/**
 * Critério do `agregavel`: só tipo que É número. `NUMBER` e `NUMERIC` somam direto;
 * `CURRENCY` soma `amountMicros` dentro da mesma `currencyCode`. Texto não soma, e
 * `RATING` também não — é ordinal guardado como texto (`RATING_1`…`RATING_5`).
 */
export const TIPOS_AGREGAVEIS: readonly string[] = ['NUMBER', 'NUMERIC', 'CURRENCY'];

/** `TS_VECTOR` é o índice de busca textual do Twenty, não dado de ninguém. */
export const TIPOS_NAO_CONSULTAVEIS: readonly string[] = ['TS_VECTOR'];

/*
 * O que pedimos à Metadata API. Só vai na query o que o schema DAQUELA instância tem —
 * é assim que a mesma chamada serve à 2.39 (que tem `applicationId`) e às anteriores à
 * 2.12 (que tinham `isCustom`), sem tabela de versão.
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

/** A relação no formato da API: `type` é a cardinalidade (`MANY_TO_ONE`/`ONE_TO_MANY`). */
const RELACAO =
  'type targetObjectMetadata { id nameSingular } targetFieldMetadata { id name }';

const PAGINA = 50;

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
  /** `workspaceCustomApplicationId`: a aplicação dona do que o cliente criou (2.12+). */
  customApplicationId: string | null;
  objetos: ObjetoTwenty[];
}

type NoObjeto = Omit<ObjetoTwenty, 'fields'> & {
  fieldsList?: CampoTwenty[];
  fields?: { edges: { node: CampoTwenty }[] };
};

/**
 * Lê objetos e campos da instância. Três passos, em série:
 * 1. introspecção de `Object` e `Field`, para saber o que pedir;
 * 2. `currentWorkspace.workspaceCustomApplicationId`, se a instância é 2.12+;
 * 3. `objects`, página a página, com os campos de cada um.
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
    throw new TwentyErro(`CRM em ${config.url} não expõe a Metadata API esperada`, true);
  }

  const camposPedidos = [
    ...PROPS_CAMPO.filter((p) => temCampo.has(p)),
    ...(temCampo.has('relation') ? [`relation { ${RELACAO} }`] : []),
    ...(temCampo.has('morphRelations') ? [`morphRelations { ${RELACAO} }`] : []),
  ].join(' ');
  // `fieldsList` é a lista inteira de uma vez; sem ele, a conexão paginada antiga.
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
         objects(paging: { first: ${PAGINA}, after: $depois }) {
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
 * Do cliente ou de fábrica? Antes da 2.12 o Twenty dizia direto (`isCustom`); depois,
 * é do cliente o que pertence à aplicação `workspaceCustomApplicationId`.
 */
export function ehDoCliente(
  no: { isCustom?: boolean; applicationId?: string | null },
  customApplicationId: string | null,
): boolean {
  if (typeof no.isCustom === 'boolean') return no.isCustom;
  return customApplicationId !== null && no.applicationId === customApplicationId;
}

export type ResultadoDicionario =
  | {
      estado: 'sincronizado';
      objetos: number;
      campos: number;
      doCliente: { objetos: number; campos: number };
      removidos: { objetos: number; campos: number };
    }
  | { estado: typeof SEM_CRM };

export async function sincronizarDicionario(
  tenantId: string,
  buscar: typeof fetch = fetch,
): Promise<ResultadoDicionario> {
  const config = await noTenant(tenantId, (tx) => configDoTenant(tx, tenantId));
  if (!config) return { estado: SEM_CRM };

  // Fora da transação, de propósito — ver o cabeçalho.
  const meta = await lerMetadados(config, buscar);
  // Todo workspace tem os objetos de fábrica. Lista vazia é permissão faltando ou
  // instância quebrada, e gravá-la marcaria o dicionário inteiro como removido.
  if (meta.objetos.length === 0) {
    throw new TwentyErro(`CRM em ${config.url} devolveu zero objetos; nada foi gravado`);
  }

  return noTenant(tenantId, (tx) => gravar(tx, tenantId, meta));
}

/** Upsert por `name` e marca de removido — em série, dentro do `comTenant`. */
async function gravar(
  tx: TransacaoPipe,
  tenantId: string,
  meta: MetadadosTwenty,
): Promise<ResultadoDicionario> {
  const agora = new Date();

  const objetos = meta.objetos.map((o) => ({
    tenantId,
    codigo: o.nameSingular,
    rotulo: o.labelSingular,
    descricao: o.description ?? null,
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
      .insert(dicionarioObjeto)
      .values(lote)
      .onConflictDoUpdate({
        target: [dicionarioObjeto.tenantId, dicionarioObjeto.codigo],
        set: doExcluded(dicionarioObjeto, Object.keys(lote[0]!), ['tenantId', 'codigo']),
      });
  }
  for (const lote of emLotes(campos)) {
    await tx
      .insert(dicionarioCampo)
      .values(lote)
      .onConflictDoUpdate({
        target: [dicionarioCampo.tenantId, dicionarioCampo.objetoCodigo, dicionarioCampo.codigo],
        set: doExcluded(dicionarioCampo, Object.keys(lote[0]!), [
          'tenantId',
          'objetoCodigo',
          'codigo',
        ]),
      });
  }

  // O que sumiu do Twenty: inativo e com `excluido_em`, nunca apagado. Só linha que
  // veio do Twenty (`twenty_id`) — o que o CRM caseiro declarou à mão não é daqui.
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
    estado: 'sincronizado',
    objetos: objetos.length,
    campos: campos.length,
    doCliente: {
      objetos: objetos.filter((o) => o.isCustom).length,
      campos: campos.filter((c) => c.isCustom).length,
    },
    removidos: { objetos: removidosObj.rowCount ?? 0, campos: removidosCampo.rowCount ?? 0 },
  };
}

/** `excluded.<coluna>` para cada coluna da linha, menos a chave do conflito. */
function doExcluded(
  tabela: typeof dicionarioObjeto | typeof dicionarioCampo,
  chavesDaLinha: string[],
  chaveDoConflito: string[],
) {
  const colunas = getTableColumns(tabela) as Record<string, { name: string }>;
  return Object.fromEntries(
    chavesDaLinha
      .filter((k) => !chaveDoConflito.includes(k))
      .map((k) => [k, sql.raw(`excluded."${colunas[k]!.name}"`)]),
  );
}

/** 500 linhas por comando: ~25 colunas cada, bem abaixo do teto de 65 535 parâmetros. */
function emLotes<T>(linhas: T[], tamanho = 500): T[][] {
  const lotes: T[][] = [];
  for (let i = 0; i < linhas.length; i += tamanho) lotes.push(linhas.slice(i, i + tamanho));
  return lotes;
}

export type CampoDoDicionario = Omit<
  typeof dicionarioCampo.$inferSelect,
  'id' | 'tenantId' | 'objetoCodigo'
>;
export type ObjetoDoDicionario = Omit<typeof dicionarioObjeto.$inferSelect, 'id' | 'tenantId'> & {
  campos: CampoDoDicionario[];
};

/**
 * O dicionário do tenant em vigor, objeto a objeto com os seus campos. É o que o builder
 * e a IA consomem.
 *
 * Devolve TUDO, inclusive o que está inativo ou removido: quem consome filtra por
 * `isActive`/`excluidoEm`, e um bloco que aponta para campo removido precisa achar a
 * linha para dizer "campo removido" em vez de "campo desconhecido".
 *
 * Roda dentro do `noTenant` de quem chama; as duas leituras vão em série.
 */
export async function lerDicionario(tx: TransacaoPipe): Promise<ObjetoDoDicionario[]> {
  const objetos = await tx.select().from(dicionarioObjeto).orderBy(asc(dicionarioObjeto.codigo));
  const campos = await tx
    .select()
    .from(dicionarioCampo)
    .orderBy(asc(dicionarioCampo.objetoCodigo), asc(dicionarioCampo.codigo));

  const porObjeto = new Map<string, CampoDoDicionario[]>();
  for (const linha of campos) {
    const { objetoCodigo, ...campo } = semIds(linha);
    const lista = porObjeto.get(objetoCodigo) ?? [];
    lista.push(campo);
    porObjeto.set(objetoCodigo, lista);
  }
  return objetos.map((linha) => ({
    ...semIds(linha),
    campos: porObjeto.get(linha.codigo) ?? [],
  }));
}

/** Id interno e tenant não saem: quem consome casa por `codigo`, e o tenant é a sessão. */
function semIds<T extends { id: string; tenantId: string }>(linha: T): Omit<T, 'id' | 'tenantId'> {
  const copia: Partial<T> = { ...linha };
  delete copia.id;
  delete copia.tenantId;
  return copia as Omit<T, 'id' | 'tenantId'>;
}

/**
 * Quem a varredura periódica sincroniza, e quantos ficam de fora por não ter CRM.
 *
 * Papel dono pelo mesmo motivo de `contatosSemEspelho`: varre todos os tenants, antes
 * de haver tenant em vigor. **Só este `select` roda assim**; a sincronização de cada um
 * volta para o `comTenant`.
 */
export async function tenantsDoDicionario(): Promise<{ comCrm: string[]; semCrm: number }> {
  const { rows } = await bancoDono().execute<{ id: string; tem_crm: boolean }>(sql`
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
