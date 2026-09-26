/**
 * `POST /v1/conversas/:id/encerrar` and the matching monitoring action. Blip accepts removable tag lists from `blip-tags`; the singular field remains for old Pipe clients during migration.
 */
export interface CloseConversationInput {
  etiqueta_ids?: string[];
  /** @deprecated Send `etiqueta_ids`, which accepts multiple tags or an empty list. */
  etiqueta_id?: string;
}
