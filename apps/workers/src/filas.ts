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
export const FILA_MIDIA = 'pipe-midia';
export const FILA_SLA = 'pipe-sla';
export const FILA_PROCESS_HTTP = 'pipe-process-http';

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
 * Baixar a mídia de um anexo recebido (`chave_storage = 'meta:<media_id>'` ou a URL
 * do CDN do Instagram) para o nosso storage.
 *
 * Quem CONSOME é a `api`, não os workers — mesma razão do espelho no CRM: quem fala
 * com a Meta para baixar mídia de um canal é quem já decifra o token dele
 * (`dominio/midia.ts`). O job carrega só os identificadores; o worker relê o anexo
 * (e o canal dele) dentro do `comTenant` daquele tenant.
 */
export interface JobMidia {
  tenantId: string;
  anexoId: string;
}

/**
 * Checar o SLA de uma conversa (`apps/api/src/dominio/gestao/sla-motor.ts`).
 *
 * Mesmo desenho do download de mídia: quem CONSOME é a `api` (é lá que mora a regra
 * de SLA e a ação de elevar prioridade/notificar), e o job leva só os dois ids — o
 * worker relê a conversa e as regras do tenant dentro do `noTenant` dela.
 */
export interface JobSla {
  tenantId: string;
  conversaId: string;
}

export interface JobProcessHttp {
  tenantId: string;
  processoId: string;
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

/**
 * Sincronizar o dicionário de dados de um tenant com os metadados do CRM dele.
 *
 * Mesmo desenho do espelho: quem CONSOME é a `api` (quem fala com o CRM), o job leva só
 * o `tenantId`, e a sincronização relê a configuração dentro do `comTenant` dele.
 */
export const FILA_DICIONARIO_CRM = 'pipe-dicionario-crm';

export interface JobDicionarioCrm {
  tenantId: string;
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
