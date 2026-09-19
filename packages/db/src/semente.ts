import 'dotenv/config';
import { and, eq } from 'drizzle-orm';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { criarBanco, fecharBanco } from './cliente.js';
import type { BancoPipe } from './cliente.js';
import { fila } from './schema/conversas.js';
import { papel, papelPermissao, permissao, tenant } from './schema/identidade.js';

/**
 * Semente mínima: um tenant, os cinco papéis do dia 1, o catálogo de permissões e as
 * filas de exemplo. Roda com o papel dono das tabelas, antes de existir usuário — por
 * isso não passa pelo `comTenant`.
 *
 * Idempotente de propósito: rodar duas vezes não duplica nada.
 */

/** Permissão é capacidade nomeada, nunca flag booleana espalhada pelo código. */
export const CATALOGO_PERMISSOES = [
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
  /* Migração 0030: nenhuma permissão cobria motivo de pausa nem resposta pronta. */
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
  /* "Somente um admin pode deletar o chatbot" (`deleteChatbotPermissionDenied`
     da origem): excluir é permissão à parte, que o `member` não tem. Migração 0023. */
  ['automacao.fluxo.excluir', 'automacao', 'Excluir fluxo de conversa'],
  ['automacao.workflow.gerenciar', 'automacao', 'Criar e ativar workflow'],
  /* Migração 0032: nem "Informações de conexão" nem "Webhook" tinham permissão
     própria — `chave_api.gerenciar` cobre só a emissão de chave. */
  ['automacao.integracao.gerenciar', 'automacao', 'Gerenciar webhook de saída e conexão HTTP do fluxo'],
  ['consulta.executar', 'automacao', 'Executar consulta'],
  ['consulta.salvar', 'automacao', 'Salvar consulta'],
  ['consulta.agendar', 'automacao', 'Agendar consulta e exportação'],
  /*
   * As permissões da CONTA — o que o Painel do contrato lê.
   *
   * São a matriz do painel deles (`docs/pesquisa/blip-painel-do-contrato.md`,
   * §"A matriz de papéis") trazida para o nosso RBAC: lá são seis chaves
   * (`tenant-summary`, `tenant-members`, `tenant-workspace`, `tenant-dashboard`,
   * `tenant-billing`, `tenant-permissions-group`) com dois verbos (`read`,
   * `write`) chumbadas no front por três papéis fixos; aqui cada par
   * chave+verbo vira UMA permissão do catálogo, e quem distribui é o papel do
   * banco. É a mesma matriz — só que editável sem recompilar a tela.
   *
   * `conta.painel.*` espelha `tenant-dashboard`, que está na matriz deles e
   * **nenhum cartão usa**. Fica aqui pela mesma razão que fica lá: a matriz é
   * o contrato, e buraco no meio dela vira pergunta na próxima leitura.
   *
   * Faturamento tem só LEITURA de propósito: na matriz deles `tenant-billing`
   * é read para `admin` e nada para o resto — ninguém tem write. Inventar
   * `conta.faturamento.escrever` seria inventar capacidade que a origem não
   * tem e que nenhuma tela nossa exerce.
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
 * Tudo, menos as permissões da CONTA: essas vêm só do papel de conta
 * (`PAPEIS_DA_CONTA`), desde a migração 0021.
 */
const TODAS = CATALOGO_PERMISSOES.map(([codigo]) => codigo).filter(
  (codigo) => !codigo.startsWith('conta.'),
);

/** O `guest` deles — "Apenas visualiza informações do contrato". */
const DA_CONTA_EM_LEITURA = ['conta.resumo.ler', 'conta.workspace.ler'];

const DO_ATENDENTE = [
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
  ...DO_ATENDENTE,
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
 * Gestor vê e configura tudo do negócio; o que mexe em identidade fica no
 * administrador — e excluir fluxo também, que na origem é só do admin.
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
 * Os três papéis da CONTA, com o `roleId` da origem como nome — a matriz de
 * `docs/pesquisa/blip-painel-do-contrato.md`. O rótulo da tela ("Admin", "Pode
 * editar", "Pode visualizar") mora no gestão, não aqui.
 *
 * Toda pessoa tem exatamente um (índice parcial em `usuario_papel`). "Cria e edita
 * chatbots" é `automacao.fluxo.editar`, a permissão que o portal confere para criar.
 */
export const PAPEIS_DA_CONTA = [
  {
    nome: 'admin',
    descricao: 'Edita todos os dados do contrato, gerencia membros, cria e edita chatbots.',
    permissoes: [
      ...CATALOGO_PERMISSOES.map(([codigo]) => codigo).filter((c) => c.startsWith('conta.')),
      'automacao.fluxo.editar',
      /* Quem edita o bot publica o bot: o Builder da origem não separa os dois
         gestos. Migração 0034. */
      'automacao.fluxo.publicar',
      'automacao.fluxo.excluir',
      'automacao.integracao.gerenciar',
    ],
  },
  {
    nome: 'member',
    descricao: 'Cria e edita chatbots, mas não gerencia os membros do contrato.',
    permissoes: [
      ...DA_CONTA_EM_LEITURA,
      'conta.workspace.escrever',
      'automacao.fluxo.editar',
      'automacao.fluxo.publicar',
      'automacao.integracao.gerenciar',
    ],
  },
  {
    nome: 'guest',
    descricao: 'Apenas visualiza informações do contrato.',
    permissoes: DA_CONTA_EM_LEITURA,
  },
] as const;

/** Os papéis de ATENDIMENTO. Nenhum carrega permissão `conta.*`. */
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
  { nome: 'atendente', descricao: 'Atende conversa no Desk', permissoes: DO_ATENDENTE },
  {
    nome: 'avaliador',
    descricao: 'Avalia atendimento e decide contestação',
    permissoes: DO_AVALIADOR,
  },
] as const;

/**
 * As duas primeiras replicam o roteamento por faixa de score do §4.2: 60 ou mais vai
 * para closer, abaixo disso para o Comercial.
 */
/*
 * A cor guarda NOME DE TOKEN da paleta de gráfico, nunca hex. Hex em coluna de
 * dado volta a virar cor fora do sistema na hora de pintar, que é o que a régua
 * do @pipe/ui proíbe — e foi assim que a etiqueta acabou com nove matizes que
 * ninguém escolheu. A tela de Filas lê estes mesmos nomes.
 */
export const FILAS_EXEMPLO = [
  { nome: 'Comercial', cor: 'grafico-1', ordem: 1, capacidadePadrao: 8 },
  { nome: 'Closer', cor: 'grafico-5', ordem: 2, capacidadePadrao: 5 },
  { nome: 'Suporte', cor: 'grafico-2', ordem: 3, capacidadePadrao: 10 },
  { nome: 'Financeiro', cor: 'grafico-3', ordem: 4, capacidadePadrao: 6 },
] as const;

export interface ResultadoSemente {
  tenantId: string;
  papeis: number;
  permissoes: number;
  filas: number;
}

export async function semear(
  db: BancoPipe,
  dados: { nome?: string; slug?: string } = {},
): Promise<ResultadoSemente> {
  const nome = dados.nome ?? 'Pipe — tenant de demonstração';
  const slug = dados.slug ?? 'demo';

  await db
    .insert(permissao)
    .values(CATALOGO_PERMISSOES.map(([codigo, grupo, descricao]) => ({ codigo, grupo, descricao })))
    .onConflictDoNothing();

  await db.insert(tenant).values({ nome, slug }).onConflictDoNothing();
  const [registro] = await db.select().from(tenant).where(eq(tenant.slug, slug)).limit(1);
  if (!registro) {
    throw new Error(`tenant "${slug}" não foi criado`);
  }
  const tenantId = registro.id;

  const todosOsPapeis = [
    ...PAPEIS_DA_CONTA.map((p) => ({ ...p, escopo: 'conta' as const })),
    ...PAPEIS_DIA_1.map((p) => ({ ...p, escopo: 'atendimento' as const })),
  ];
  for (const definicao of todosOsPapeis) {
    await db
      .insert(papel)
      .values({
        tenantId,
        nome: definicao.nome,
        descricao: definicao.descricao,
        deSistema: true,
        escopo: definicao.escopo,
      })
      .onConflictDoNothing();
    const [gravado] = await db
      .select()
      .from(papel)
      .where(and(eq(papel.tenantId, tenantId), eq(papel.nome, definicao.nome)))
      .limit(1);
    if (!gravado) continue;
    await db
      .insert(papelPermissao)
      .values(
        definicao.permissoes.map((codigo) => ({
          tenantId,
          papelId: gravado.id,
          permissaoCodigo: codigo,
        })),
      )
      .onConflictDoNothing();
  }

  await db
    .insert(fila)
    .values(FILAS_EXEMPLO.map((f) => ({ tenantId, ...f })))
    .onConflictDoNothing();

  return {
    tenantId,
    papeis: todosOsPapeis.length,
    permissoes: CATALOGO_PERMISSOES.length,
    filas: FILAS_EXEMPLO.length,
  };
}

const executadoDiretamente = process.argv[1]
  ? path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))
  : false;

if (executadoDiretamente) {
  const db = criarBanco({ maxConexoes: 1 });
  semear(db)
    .then((resultado) => {
      process.stdout.write(
        `semente aplicada: tenant ${resultado.tenantId}, ${resultado.papeis} papéis, ` +
          `${resultado.permissoes} permissões, ${resultado.filas} filas\n`,
      );
    })
    .catch((erro: unknown) => {
      process.stderr.write(`falha ao semear: ${String(erro)}\n`);
      process.exitCode = 1;
    })
    .finally(() => fecharBanco(db));
}
