/**
 * Queue names and connection live together. A queue transports work; the durable record is in `outbox_mensagem`, `entrega_webhook`, or `execucao_workflow` (data model §9). Losing a job delays processing but does not lose a message.
 */

// O BullMQ recusa `:` no nome da fila — ele usa o caractere como separador de chave
// in Redis; hence the hyphen.
export const QUEUE_INBOUND = 'pipe-inbound';
export const QUEUE_DELIVERY = 'pipe-delivery';
export const QUEUE_AGGREGATION = 'pipe-aggregation';
export const QUEUE_MIRROR_CRM = 'pipe-crm-mirror';
export const QUEUE_MEDIA = 'pipe-media';
export const QUEUE_SLA = 'pipe-sla';
export const QUEUE_PROCESS_HTTP = 'pipe-process-http';

export interface JobDelivery {
  /** Only a nudge: the worker sweeps the outbox regardless. */
  messageId?: string;
  /** Valores posicionais do template — ver `parametros_perdidos` em `entrega.ts`. */
  parametros?: Record<string, string>;
}

export interface JobInbound {
  channelId: string;
  payload: unknown;
}

/**
 * Download received attachment media (`chave_storage = 'meta:<media_id>'` or Instagram CDN URL) into our storage. `api`, not workers, consumes this job because it already decrypts the channel token for Meta downloads (`dominio/midia.ts`), as with CRM mirroring. The job carries identifiers only; the consumer rereads attachment and channel inside that tenant's `comTenant`.
 */
export interface JobMedia {
  tenantId: string;
  attachmentId: string;
}

/**
 * Check conversation SLA (`apps/api/src/dominio/gestao/sla-motor.ts`). As with media downloads, `api` consumes this job because SLA rules and the priority/notification action live there. The job carries two IDs; the consumer rereads conversation and tenant rules inside its `noTenant`.
 */
export interface JobSla {
  tenantId: string;
  conversationId: string;
}

export interface JobProcessHttp {
  tenantId: string;
  processoId: string;
}

/**
 * Mirror a contact into the client CRM. `api`, not the workers, consumes this queue, as with `pipe-entrada`: the API talks to CRM and owns the domain rule. The API consumer also runs the sweep that requeues missed work. The job carries identifiers only. The consumer rereads the contact inside that tenant's `comTenant`; a `contatoId` from another client cannot write to the wrong CRM because the query returns no row without the correct tenant.
 */
export interface JobMirrorCrm {
  tenantId: string;
  contactId: string;
}

/**
 * Synchronize a tenant's data dictionary from its CRM metadata. As with mirroring, `api` consumes the job because it talks to CRM. The job carries only `tenantId`; synchronization rereads configuration inside that tenant's `comTenant`.
 */
export const QUEUE_DICTIONARY_CRM = 'pipe-crm-dictionary';

export interface JobDictionaryCrm {
  tenantId: string;
}

export function conexaoRedis(): { url: string } {
  return { url: process.env['REDIS_URL'] ?? 'redis://localhost:6380' };
}

/**
 * Import contacts from CSV (`importacao-de-contatos.ts`). Workers consume this long database-only job. The file stays in `importacao_arquivo`, not in the job; the job carries two IDs and processing rereads data inside the tenant's `comTenant`.
 */
export const QUEUE_IMPORT = 'pipe-import';

export interface JobImport {
  tenantId: string;
  importId: string;
}
