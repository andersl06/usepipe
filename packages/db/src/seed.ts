import 'dotenv/config';
import { and, eq, sql } from 'drizzle-orm';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createDatabase, closeDatabase } from './cliente.js';
import type { DatabasePipe } from './cliente.js';
import { queue } from './schema/conversations.js';
import { role, rolePermission, permission, tenant } from './schema/identity.js';

/**
 * Minimal seed: one tenant, five initial roles, the permission catalog, and sample queues. It uses the table-owner role before users exist, so it does not use `comTenant`. Running it twice deliberately creates no duplicates.
 */

/** A permission is a named capability, not a boolean flag scattered through code. */
export const CATALOG_PERMISSIONS = [
  ['conversa.ver', 'conversa', 'Ver conversas das filas em que participa'],
  ['conversa.ver_todas', 'conversa', 'Ver conversas de todas as filas'],
  ['conversa.responder', 'conversa', 'Responder conversa'],
  ['conversa.transferir', 'conversa', 'Transferir conversa para outra fila ou atendente'],
  ['conversa.encerrar', 'conversa', 'Encerrar conversa'],
  ['conversa.reabrir', 'conversa', 'Reabrir conversa encerrada'],
  ['conversa.etiquetar', 'conversa', 'Aplicar e remover etiqueta'],
  ['conversa.nota_interna', 'conversa', 'Escrever nota interna'],
  ['contato.ver', 'contato', 'Ver contato'],
  ['contato.editar', 'contato', 'Editar contato'],
  ['contato.exportar', 'contato', 'Exportar contatos'],
  ['contato.excluir', 'contato', 'Excluir contato a pedido do titular'],
  ['crm.lead.ver', 'crm', 'Ver lead'],
  ['crm.lead.editar', 'crm', 'Criar e editar lead'],
  ['crm.oportunidade.ver', 'crm', 'Ver oportunidade'],
  ['crm.oportunidade.editar', 'crm', 'Criar e editar oportunidade'],
  ['crm.importar', 'crm', 'Importar base de outro CRM'],
  ['crm.score.configurar', 'crm', 'Configurar regras e faixas de score'],
  ['monitoramento.tempo_real.ver', 'gestao', 'Ver o monitoramento em tempo real'],
  ['relatorio.ver', 'gestao', 'Ver relatórios de atendimento'],
  ['relatorio.esforco.ver', 'gestao', 'Ver o relatório de esforço por atendente'],
  ['relatorio.exportar', 'gestao', 'Exportar relatório'],
  ['fila.gerenciar', 'gestao', 'Criar, editar e desativar fila'],
  ['regra.gerenciar', 'gestao', 'Gerenciar regras de fila, prioridade e SLA'],
  ['horario.gerenciar', 'gestao', 'Gerenciar horário de atendimento e feriado'],
  /* Migration 0030: no permission covered pause reasons or canned replies. */
  ['pausa.gerenciar', 'gestao', 'Criar, editar e desativar motivo de pausa'],
  ['resposta_pronta.gerenciar', 'gestao', 'Criar, editar e excluir resposta pronta da empresa'],
  ['monitoria.avaliacao.ver', 'monitoria', 'Ver avaliação'],
  ['monitoria.avaliacao.criar', 'monitoria', 'Avaliar atendimento'],
  ['monitoria.avaliacao.revisar', 'monitoria', 'Revisar e homologar nota sugerida pela IA'],
  ['monitoria.contestacao.abrir', 'monitoria', 'Contestar a própria avaliação'],
  ['monitoria.contestacao.decidir', 'monitoria', 'Decidir contestação'],
  ['monitoria.calibracao.gerenciar', 'monitoria', 'Rodar e analisar calibração'],
  ['monitoria.formulario.gerenciar', 'monitoria', 'Gerenciar formulário de avaliação'],
  ['monitoria.coach.gerenciar', 'monitoria', 'Criar e acompanhar plano de coach'],
  ['automacao.fluxo.editar', 'automacao', 'Editar fluxo de conversa'],
  ['automacao.fluxo.publicar', 'automacao', 'Publicar versão de fluxo'],
  /*
   * "Somente um admin pode deletar o chatbot" (`deleteChatbotPermissionDenied` in the source): deletion has a separate permission absent from `member`. Migration 0023.
   */
  ['automacao.fluxo.excluir', 'automacao', 'Excluir fluxo de conversa'],
  ['automacao.workflow.gerenciar', 'automacao', 'Criar e ativar workflow'],
  /*
   * Migration 0032: neither "Informações de conexão" nor "Webhook" had its own permission; `chave_api.gerenciar` covers key issuance only.
   */
  ['automacao.integracao.gerenciar', 'automacao', 'Gerenciar webhook de saída e conexão HTTP do fluxo'],
  ['consulta.executar', 'automacao', 'Executar consulta'],
  ['consulta.salvar', 'automacao', 'Salvar consulta'],
  ['consulta.agendar', 'automacao', 'Agendar consulta e exportação'],
  /*
   * ACCOUNT permissions read by the contract application.
   *
   * These bring the source matrix (`referencias-blip/pesquisa/blip-painel-do-contrato.md`, section "A matriz de papéis") into RBAC. It has six keys (`tenant-summary`, `tenant-members`, `tenant-workspace`, `tenant-dashboard`, `tenant-billing`, `tenant-permissions-group`) with `read` and `write` verbs hard-coded in the frontend for three fixed roles. Here each key/verb pair becomes ONE catalog permission assigned by a database role, preserving the matrix while allowing edits without rebuilding the screen.
   *
   * `conta.painel.*` mirrors `tenant-dashboard` even though no card uses it: the matrix is a contract, and an unexplained gap would confuse future reviews.
   *
   * Billing is READ ONLY deliberately. Source `tenant-billing` gives `admin` read access and no one write access; inventing `conta.faturamento.escrever` would add an unsupported capability no screen uses.
   */
  ['conta.resumo.ler', 'conta', 'Ver o resumo do contrato'],
  ['conta.resumo.escrever', 'conta', 'Editar o nome e a foto do contrato'],
  ['conta.membros.ler', 'conta', 'Ver quem tem acesso ao contrato'],
  ['conta.membros.escrever', 'conta', 'Convidar, trocar o papel e remover membro do contrato'],
  ['conta.workspace.ler', 'conta', 'Ver as configurações do espaço de trabalho'],
  ['conta.workspace.escrever', 'conta', 'Editar as configurações do espaço de trabalho'],
  ['conta.painel.ler', 'conta', 'Ver o painel do contrato'],
  ['conta.painel.escrever', 'conta', 'Editar o painel do contrato'],
  ['conta.faturamento.ler', 'conta', 'Ver o plano, o consumo e o faturamento do contrato'],
  ['conta.grupos_acesso.ler', 'conta', 'Ver os grupos de acesso ao contrato'],
  ['conta.grupos_acesso.escrever', 'conta', 'Criar, editar e remover grupo de acesso'],
  ['usuario.gerenciar', 'administracao', 'Criar, editar e desativar usuário'],
  ['papel.gerenciar', 'administracao', 'Criar papel e atribuir permissão'],
  ['equipe.gerenciar', 'administracao', 'Gerenciar equipe'],
  ['canal.gerenciar', 'administracao', 'Conectar e configurar canal'],
  ['chave_api.gerenciar', 'administracao', 'Emitir e revogar chave de API e MCP'],
  ['auditoria.ver', 'administracao', 'Ler o log de auditoria'],
  ['tenant.configurar', 'administracao', 'Configurar marca, fuso e plano'],
] as const satisfies readonly (readonly [string, string, string])[];

/**
 * All permissions except ACCOUNT permissions, which come only from the account role (`PAPEIS_DA_CONTA`) since migration 0021.
 */
const TODAS = CATALOG_PERMISSIONS.map(([codigo]) => codigo).filter(
  (codigo) => !codigo.startsWith('conta.'),
);

/** The source `guest` role: "Apenas visualiza informações do contrato". */
const OF_ACCOUNT_IN_READ = ['conta.resumo.ler', 'conta.workspace.ler'];

const OF_AGENT = [
  'conversa.ver',
  'conversa.responder',
  'conversa.transferir',
  'conversa.encerrar',
  'conversa.etiquetar',
  'conversa.nota_interna',
  'contato.ver',
  'contato.editar',
  'monitoria.avaliacao.ver',
  'monitoria.contestacao.abrir',
];

const DO_AVALIADOR = [
  'conversa.ver',
  'conversa.ver_todas',
  'contato.ver',
  'relatorio.ver',
  'monitoria.avaliacao.ver',
  'monitoria.avaliacao.criar',
  'monitoria.avaliacao.revisar',
  'monitoria.contestacao.decidir',
  'monitoria.calibracao.gerenciar',
  'monitoria.formulario.gerenciar',
];

const DO_SUPERVISOR = [
  ...OF_AGENT,
  'conversa.ver_todas',
  'conversa.reabrir',
  'monitoramento.tempo_real.ver',
  'relatorio.ver',
  'relatorio.esforco.ver',
  'relatorio.exportar',
  'monitoria.avaliacao.criar',
  'monitoria.avaliacao.revisar',
  'monitoria.coach.gerenciar',
  'crm.lead.ver',
  'crm.oportunidade.ver',
];

/**
 * A manager can view and configure business operations; identity changes remain with the administrator, as does deleting flows, which only an admin can do in the source.
 */
const DO_GESTOR = TODAS.filter(
  (codigo) =>
    ![
      'papel.gerenciar',
      'chave_api.gerenciar',
      'tenant.configurar',
      'contato.excluir',
      'automacao.fluxo.excluir',
    ].includes(codigo),
);

/**
 * Three ACCOUNT roles named after source `roleId` values, following `referencias-blip/pesquisa/blip-painel-do-contrato.md`. UI labels ("Admin", "Pode editar", "Pode visualizar") live in Management, not here.
 *
 * Each person has exactly one, enforced by a partial index on `usuario_papel`. The source "Cria e edita chatbots" maps to `automacao.fluxo.editar`, the permission checked by the portal on creation.
 */
export const ROLES_OF_ACCOUNT = [
  {
    nome: 'admin',
    descricao: 'Edita todos os dados do contrato, gerencia membros, cria e edita chatbots.',
    permissoes: [
      ...CATALOG_PERMISSIONS.map(([codigo]) => codigo).filter((c) => c.startsWith('conta.')),
      'automacao.fluxo.editar',
      /*
       * Whoever edits the bot may publish it: the source Builder does not separate those actions. Migration 0034.
       */
      'automacao.fluxo.publicar',
      'automacao.fluxo.excluir',
      'automacao.integracao.gerenciar',
    ],
  },
  {
    nome: 'member',
    descricao: 'Cria e edita chatbots, mas não gerencia os membros do contrato.',
    permissoes: [
      ...OF_ACCOUNT_IN_READ,
      'conta.workspace.escrever',
      'automacao.fluxo.editar',
      'automacao.fluxo.publicar',
      'automacao.integracao.gerenciar',
    ],
  },
  {
    nome: 'guest',
    descricao: 'Apenas visualiza informações do contrato.',
    permissoes: OF_ACCOUNT_IN_READ,
  },
] as const;

/** ATTENDANCE roles. None carries a `conta.*` permission. */
export const PAPEIS_DIA_1 = [
  {
    nome: 'administrador',
    descricao: 'Acesso total, inclusive identidade e cobrança',
    permissoes: TODAS,
  },
  {
    nome: 'gestor',
    descricao: 'Configura o atendimento e lê todo relatório',
    permissoes: DO_GESTOR,
  },
  {
    nome: 'supervisor',
    descricao: 'Acompanha fila, atendente e qualidade',
    permissoes: DO_SUPERVISOR,
  },
  { nome: 'atendente', descricao: 'Atende conversa no Desk', permissoes: OF_AGENT },
  {
    nome: 'avaliador',
    descricao: 'Avalia atendimento e decide contestação',
    permissoes: DO_AVALIADOR,
  },
] as const;


/*
 * Store a chart-palette TOKEN NAME for color, never a hex literal. A hex value in a data column bypasses the `@pipe/ui` color rule when rendered; that is how tags acquired nine unchosen hues. The Queues screen reads these same names.
 */
export const QUEUES_EXAMPLE = [
  { nome: 'Comercial', cor: 'grafico-1', ordem: 1, capacidadePadrao: 8 },
  { nome: 'Closer', cor: 'grafico-5', ordem: 2, capacidadePadrao: 5 },
  { nome: 'Suporte', cor: 'grafico-2', ordem: 3, capacidadePadrao: 10 },
  { nome: 'Financeiro', cor: 'grafico-3', ordem: 4, capacidadePadrao: 6 },
] as const;

/**
 * Todo usuário do tenant SEM papel de conta ganha um — a regra "toda pessoa tem
 * exatamente um" da migração 0021, aplicada a quem nasceu depois dela.
 *
 * O backfill da 0021 só cobriu quem já existia; as sementes de operação
 * (`semente-demo.ts`, `apps/management-vite/semente/semente-gestao.ts`) criam
 * usuários só com papel de atendimento, e a tela de Membros do contrato — que
 * lista pelo papel de CONTA — ficava vazia. A regra de qual papel é a MESMA da
 * 0021, para o resultado não depender de quem rodou primeiro: `administrador` ou
 * quem tem `conta.membros.escrever` → `admin`; quem edita fluxo ou o workspace →
 * `member`; o resto → `guest`.
 *
 * Idempotente: o índice único parcial `usuario_papel_um_da_conta_uk` garante um
 * por pessoa, e o `where not exists` não toca em quem já tem. Rodar duas vezes
 * não duplica nem troca papel dado à mão.
 */
export async function ensureRoleOfAccount(db: DatabasePipe, tenantId: string): Promise<number> {
  const resultado = await db.execute(sql`
    insert into usuario_papel (tenant_id, usuario_id, papel_id, escopo)
    select u.tenant_id, u.id, c.id, 'conta'
      from usuario u
     cross join lateral (
       select case
                when bool_or(p.nome = 'administrador' and p.de_sistema)
                  or bool_or(pp.permissao_codigo = 'conta.membros.escrever') then 'admin'
                when bool_or(pp.permissao_codigo in ('automacao.fluxo.editar', 'conta.workspace.escrever'))
                  then 'member'
                else 'guest'
              end as alvo
         from usuario_papel up
         join papel p on p.id = up.papel_id
         left join papel_permissao pp on pp.papel_id = p.id
        where up.usuario_id = u.id
     ) f
      join papel c on c.tenant_id = u.tenant_id and c.escopo = 'conta' and c.nome = f.alvo
     where u.tenant_id = ${tenantId}::uuid
       and not exists (
         select 1 from usuario_papel up
          where up.usuario_id = u.id and up.escopo = 'conta'
       )
    on conflict do nothing
  `);
  return resultado.rowCount ?? 0;
}

export interface ResultSeed {
  tenantId: string;
  papeis: number;
  permissions: number;
  queues: number;

  rolesOfAccountData: number;
}

export async function seed(
  db: DatabasePipe,
  data: { name?: string; slug?: string } = {},
): Promise<ResultSeed> {
  const nome = data.name ?? 'Pipe — tenant de demonstração';
  const slug = data.slug ?? 'demo';

  await db
    .insert(permission)
    .values(CATALOG_PERMISSIONS.map(([codigo, grupo, description]) => ({ codigo, grupo, descricao: description })))
    .onConflictDoNothing();

  await db.insert(tenant).values({ nome, slug }).onConflictDoNothing();
  const [registro] = await db.select().from(tenant).where(eq(tenant.slug, slug)).limit(1);
  if (!registro) {
    throw new Error(`tenant "${slug}" não foi criado`);
  }
  const tenantId = registro.id;

  const todosOsPapeis = [
    ...ROLES_OF_ACCOUNT.map((p) => ({ ...p, escopo: 'conta' as const })),
    ...PAPEIS_DIA_1.map((p) => ({ ...p, escopo: 'atendimento' as const })),
  ];
  for (const definition of todosOsPapeis) {
    await db
      .insert(role)
      .values({
        tenantId,
        nome: definition.nome,
        description: definition.descricao,
        deSistema: true,
        scope: definition.escopo,
      })
      .onConflictDoNothing();
    const [gravado] = await db
      .select()
      .from(role)
      .where(and(eq(role.tenantId, tenantId), eq(role.nome, definition.nome)))
      .limit(1);
    if (!gravado) continue;
    await db
      .insert(rolePermission)
      .values(
        definition.permissoes.map((codigo) => ({
          tenantId,
          roleId: gravado.id,
          permissionCode: codigo,
        })),
      )
      .onConflictDoNothing();
  }

  await db
    .insert(queue)
    .values(QUEUES_EXAMPLE.map((f) => ({ tenantId, ...f })))
    .onConflictDoNothing();

  // Finally, after account roles exist, assign one to users seeded by another routine before this run or already present after migration 0021.
  // outra rotina antes desta rodada (ou pela 0021 ter passado) ganha o dele.
  const rolesOfAccountData = await ensureRoleOfAccount(db, tenantId);

  return {
    tenantId,
    papeis: todosOsPapeis.length,
    permissions: CATALOG_PERMISSIONS.length,
    queues: QUEUES_EXAMPLE.length,
    rolesOfAccountData,
  };
}

const executadoDiretamente = process.argv[1]
  ? path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))
  : false;

if (executadoDiretamente) {
  const db = createDatabase({ maxConnections: 1 });
  seed(db)
    .then((resultado) => {
      process.stdout.write(
        `semente aplicada: tenant ${resultado.tenantId}, ${resultado.papeis} papéis, ` +
          `${resultado.permissions} permissões, ${resultado.queues} filas, ` +
          `${resultado.rolesOfAccountData} papéis de conta dados a quem não tinha\n`,
      );
    })
    .catch((error: unknown) => {
      process.stderr.write(`falha ao semear: ${String(error)}\n`);
      process.exitCode = 1;
    })
    .finally(() => closeDatabase(db));
}
