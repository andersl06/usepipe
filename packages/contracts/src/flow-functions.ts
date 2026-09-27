export interface FlowFunctionInput {
  name: string;
  description?: string | null;
  parameters: string[];
  code: string;
  flowId?: string | null;
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
  flowId: string | null;
  name: string;
  description: string | null;
  parameters: string[];
  code: string;
  version: number;
  scope: 'tenant' | 'flow';
  createdAt: string;
  updatedAt: string;
  /** Reserved for the captured lifecycle contract (C-27); current API returns only the active version. */
  versions?: FlowFunctionVersion[];
}
