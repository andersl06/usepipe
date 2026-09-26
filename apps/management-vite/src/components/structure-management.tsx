/**
 * This file holds only `URL_DESK` after the old parallel Gestão shell lost its routes. Attendance moved under `/{tipo}/:id/atendimento/*` with `paginas/operacao/casca.tsx`; Builder moved to `/fluxo/:id/builder` using `paginas/builder.tsx` and `BarrasDoContato`; Growth moved to `/fluxo/:id/growth/*` and `paginas/fluxo/growth/casca.tsx`, while duplicate standalone `/growth` in `paginas/growth-portal.tsx` was removed and redirected to Portal. Account-level Implantação now renders `pt-app` and `BarraDoPortal` in `paginas/implantacao/page.tsx`, as Novidades and the contract panel do. With no route using `<EstruturaGestao/>`, only the active import of `URL_DESK` from `paginas/operacao/casca.tsx` keeps this file. Move both files together if cleaning it up.
 */

/** Desk app destination for the Attendance sidebar footer. */
export const URL_DESK =
  (import.meta.env['VITE_PIPE_DESK_URL'] as string | undefined) ?? 'http://localhost:3200';
