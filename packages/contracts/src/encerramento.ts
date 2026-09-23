/**
 * `POST /v1/conversas/:id/encerrar` e a ação correspondente do monitoramento.
 * A Blip aceita a lista de tags removíveis de `blip-tags`; o campo singular
 * continua existindo para clientes antigos da Pipe durante a migração.
 */
export interface EncerrarConversaInput {
  etiqueta_ids?: string[];
  /** @deprecated Envie `etiqueta_ids`, que permite várias tags ou lista vazia. */
  etiqueta_id?: string;
}
