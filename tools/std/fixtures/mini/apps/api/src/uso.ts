import { ErroPipe } from '@mini/core';
import type { ConstrutorErro } from '@mini/core';
import { metrica } from '@mini/core/metricas';
export const tipo: ConstrutorErro = ErroPipe;
export const curto = { ErroPipe };
export { metrica };
export type TipoMetrica = typeof import('@mini/core/metricas').metrica;
