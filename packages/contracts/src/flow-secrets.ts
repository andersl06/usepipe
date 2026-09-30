/**
 * Blip Builder "Variáveis sensíveis": per-flow secrets read as `{{secret.<name>}}`, and only inside
 * HTTP actions. Write-only: the API stores `value` encrypted and never returns it, so `FlowSecret`
 * carries no value at all (Blip: "Valores suprimidos").
 */
export interface FlowSecretInput {
  name: string;
  /** Required on create and on every update: renaming a secret means re-entering its value, as in Blip. */
  value: string;
}

export interface FlowSecret {
  id: string;
  flowId: string;
  name: string;
  createdAt: string;
  updatedAt: string | null;
}
