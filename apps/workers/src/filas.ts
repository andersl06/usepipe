/**
 * Nomes de fila e conexão, num lugar só.
 *
 * A fila é o transporte, não a verdade (modelo de dados §9): o que precisa
 * sobreviver a reinício tem linha em `outbox_mensagem`, `entrega_webhook` ou
 * `execucao_workflow`. Perder um job atrasa; não perde mensagem.
 */

// O BullMQ recusa `:` no nome da fila — ele usa o caractere como separador de chave
// no Redis. Daí o hífen.
export const FILA_ENTRADA = 'pipe-entrada';
export const FILA_ENTREGA = 'pipe-entrega';
export const FILA_AGREGACAO = 'pipe-agregacao';
export const FILA_ESPELHO_CRM = 'pipe-espelho-crm';

export interface JobEntrega {
  /** Só um empurrão: o worker varre o outbox de qualquer jeito. */
  mensagemId?: string;
  /** Valores posicionais do template — ver `parametros_perdidos` em `entrega.ts`. */
  parametros?: Record<string, string>;
}

export interface JobEntrada {
  canalId: string;
  payload: unknown;
}

/**
 * Espelhar um contato no CRM do cliente.
 *
 * Quem CONSOME esta fila é a `api`, não os workers — mesma razão da `pipe-entrada`:
 * quem fala com o CRM é a `api`, e a regra de domínio mora lá. Os workers só rodam a
 * varredura que reenfileira o que ficou para trás.
 *
 * O job carrega só os identificadores. O worker relê o contato dentro do `comTenant`
 * daquele tenant, e é isso que impede um `contatoId` de outro cliente de virar
 * escrita no CRM errado — sem tenant em vigor, a consulta não retorna linha.
 */
export interface JobEspelhoCrm {
  tenantId: string;
  contatoId: string;
}

export function conexaoRedis(): { url: string } {
  return { url: process.env['REDIS_URL'] ?? 'redis://localhost:6380' };
}

/**
 * Importar contatos de um CSV (`importacao-de-contatos.ts`).
 *
 * Quem consome são os workers: é trabalho só de banco, longo, e não fala com
 * serviço externo. O arquivo não viaja no job — mora em `importacao_arquivo` —,
 * e o job leva só os dois ids; o processamento relê tudo no `comTenant` do tenant.
 */
export const FILA_IMPORTACAO = 'pipe-importacao';

export interface JobImportacao {
  tenantId: string;
  importacaoId: string;
}
