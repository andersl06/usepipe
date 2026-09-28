/**
 * Blip "Recursos" (menu `contents`, permission key `resources`): a per-flow key/value store the
 * builder's `{{resource.<name>}}` and `resource.<name>@<property>` read, backed by
 * `recurso_do_fluxo`.
 */
export interface FlowResourceInput {
  name: string;
  /** MIME type, e.g. `text/plain` or `application/json`; a `json`-suffixed type requires `value` to parse. */
  type: string;
  value: string;
}

export interface FlowResource {
  id: string;
  flowId: string;
  name: string;
  type: string;
  value: string;
  createdAt: string;
  updatedAt: string | null;
}
