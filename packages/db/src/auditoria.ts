import { logAuditoria } from './schema/identidade.js';
import type { TransacaoPipe } from './tenant.js';

/**
 * O registro de quem mudou o quê.
 *
 * A tabela `log_auditoria` existe desde a fundação e **ninguém escrevia nela**.
 * A consequência apareceu na auditoria de usabilidade: nenhuma tela de cadastro
 * do Pipe tem editar nem excluir — só criar. O motivo estava escrito nas specs
 * como "aguardando log de auditoria", e o log nunca veio.
 *
 * Isso inverteu a ordem das coisas: a falta do registro virou desculpa para o
 * produto não deixar corrigir um nome digitado errado. Este arquivo paga a
 * dívida para que a edição possa existir.
 *
 * **A regra que faz o registro valer alguma coisa**: grava-se o ANTES e o
 * DEPOIS, na mesma transação da mudança. Log em transação separada some quando
 * a mudança falha, ou sobra quando ela é desfeita — e nos dois casos ele passa
 * a mentir. Log que mente é pior que log nenhum, porque alguém confia nele.
 */

/** O que o ator é. Pessoa, chave de API, ou o próprio sistema. */
export const TIPOS_DE_ATOR = ['usuario', 'chave', 'sistema'] as const;
export type TipoDeAtor = (typeof TIPOS_DE_ATOR)[number];

/**
 * As ações registradas.
 *
 * Lista fechada de propósito: string livre vira `update`, `atualizar`,
 * `atualizou` e `edit` na mesma tabela, e aí o log não se consulta mais.
 */
export const ACOES = ['criou', 'alterou', 'excluiu', 'ativou', 'desativou'] as const;
export type Acao = (typeof ACOES)[number];

export interface Ator {
  tipo: TipoDeAtor;
  /** Nulo para `sistema`: o cron não tem id. */
  id?: string | null;
  ip?: string | null;
}

export interface EventoDeAuditoria {
  ator: Ator;
  acao: Acao;
  /** Nome da tabela em snake_case: `fila`, `resposta_pronta`, `usuario`. */
  objetoTipo: string;
  objetoId: string;
  /** O estado anterior. Ausente em `criou`. */
  antes?: Record<string, unknown> | null;
  /** O estado novo. Ausente em `excluiu`. */
  depois?: Record<string, unknown> | null;
}

/**
 * Campos que NUNCA entram no log, mesmo que venham no objeto.
 *
 * O log é lido por gente do suporte e exportado em auditoria de contrato.
 * Gravar segredo ali seria desfazer, num lugar mais visível, a cifra que
 * `segredo.ts` aplica no banco.
 */
const NUNCA_REGISTRAR = new Set([
  'senhaHash',
  'senha_hash',
  'tokenHash',
  'token_hash',
  'tokenAcesso',
  'appSecret',
  'verifyToken',
  'senhaSmtp',
  'clientSecret',
  'config',
]);

function limpar(
  objeto: Record<string, unknown> | null | undefined,
): Record<string, unknown> | null {
  if (!objeto) return null;
  const saida: Record<string, unknown> = {};
  for (const [chave, valor] of Object.entries(objeto)) {
    if (NUNCA_REGISTRAR.has(chave)) continue;
    saida[chave] = valor instanceof Date ? valor.toISOString() : valor;
  }
  return saida;
}

/**
 * Registra o evento **na mesma transação** da mudança.
 *
 * Recebe a `tx`, e não o banco, por isso: se a mudança for desfeita, o registro
 * dela é desfeito junto. É a única forma de o log e o dado nunca discordarem.
 *
 * O `tenant_id` sai da sessão da transação — não é parâmetro. Aceitar tenant de
 * quem chama seria deixar registrar evento no nome do vizinho.
 */
export async function registrarAuditoria(
  tx: TransacaoPipe,
  tenantId: string,
  evento: EventoDeAuditoria,
): Promise<void> {
  await tx.insert(logAuditoria).values({
    tenantId,
    atorTipo: evento.ator.tipo,
    atorId: evento.ator.id ?? null,
    acao: evento.acao,
    objetoTipo: evento.objetoTipo,
    objetoId: evento.objetoId,
    antes: limpar(evento.antes),
    depois: limpar(evento.depois),
    ip: evento.ator.ip ?? null,
  });
}

/**
 * O que mudou entre dois estados, só com os campos diferentes.
 *
 * Guardar o objeto inteiro dos dois lados incha a tabela e esconde a mudança:
 * quem lê o log quer saber que a capacidade foi de 5 para 8, não reler as
 * quinze colunas que continuaram iguais.
 */
export function diferenca(
  antes: Record<string, unknown>,
  depois: Record<string, unknown>,
): { antes: Record<string, unknown>; depois: Record<string, unknown> } {
  const a: Record<string, unknown> = {};
  const d: Record<string, unknown> = {};
  for (const chave of new Set([...Object.keys(antes), ...Object.keys(depois)])) {
    const va = antes[chave];
    const vd = depois[chave];
    if (mesmoValor(va, vd)) continue;
    a[chave] = va;
    d[chave] = vd;
  }
  return { antes: a, depois: d };
}

function mesmoValor(a: unknown, b: unknown): boolean {
  if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime();
  if (a === b) return true;
  // `null` e `undefined` são a mesma ausência para efeito de log: o driver
  // devolve `null` e o formulário manda `undefined`, e isso não é mudança.
  if (a == null && b == null) return true;
  return false;
}
