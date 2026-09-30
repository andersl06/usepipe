/**
 * The account's (tenant's) function library (D-22, P10/D-57): every flow of the tenant sees every
 * function, and `ExecuteBlipFunction` references one by `id` (Blip's `settings.source` UUID).
 */
export interface FlowFunctionInput {
  /**
   * Create only: keep a known UUID, so an imported Blip flow whose `ExecuteBlipFunction` points at
   * that UUID finds the function once it is recreated here. Omitted → a new UUID.
   */
  id?: string;
  name: string;
  description?: string | null;
  parameters: string[];
  code: string;
}

export interface FlowFunctionVersion {
  version: number;
  parameters: string[];
  code: string;
  createdAt: string;
}

export interface FlowFunction {
  id: string;
  tenantId: string;
  name: string;
  description: string | null;
  parameters: string[];
  code: string;
  version: number;
  createdAt: string;
  updatedAt: string;
  /** Reserved for the captured lifecycle contract (C-27); current API returns only the active version. */
  versions?: FlowFunctionVersion[];
}

/**
 * A flow (bot) of the tenant whose draft or published version uses a library function, either
 * through `ExecuteBlipFunction` (by id) or by calling it by name from a script. Powers the
 * Builder's "em uso em outros bots" warning.
 */
export interface FlowFunctionUsage {
  flowId: string;
  flowName: string;
  shortName: string;
}
