import { Navigate, useLocation, useParams } from 'react-router-dom';
import { ApiError } from '../lib/api';
import { legacyTarget, flowPath, renameContactSubpath } from '../lib/application-paths';
import { useRead } from '../lib/query';
import { UUID } from './flow/barra-of-contact';
import { ReadFailure, type ContactLoaded } from './flow/contact';
import { NaoEncontrado } from './nao-encontrado';

/**
 * Redirects a known pre-D-52 address (`legacyTarget`'s table) to its replacement, preserving the
 * rest of the path, the query string, and the hash. Anything `legacyTarget` doesn't recognize is
 * a 404 — this component never mounts for `/flow/*` or `/router/*`, which need the API
 * (`LegacyContactRedirect`, below) to resolve the id into a `shortName`.
 */
export function LegacyRedirect() {
  const { pathname, search, hash } = useLocation();
  const target = legacyTarget(pathname, search, hash);
  if (!target) return <NaoEncontrado />;
  return <Navigate to={target} replace />;
}

/**
 * `/flow/:id/*` and `/router/:id/*` (pre-D-52): resolve `id` through the API, then redirect with
 * replace to the shortName tree, applying the D-54 segment renames to whatever came after the
 * id. An id outside uuid format, or with no contact in the tenant, is a 404 — the API's RLS is
 * what actually decides "no contact"; this never distinguishes "doesn't exist" from "exists in
 * another tenant" (T-01-44-02).
 */
export function LegacyContactRedirect() {
  const { id = '' } = useParams();
  const location = useLocation();
  const valid = UUID.test(id);
  const read = useRead<ContactLoaded>(valid ? `/v1/management/flows/${id}` : null);

  if (!valid || (read.error instanceof ApiError && read.error.status === 404)) {
    return <NaoEncontrado />;
  }
  if (read.error) return <ReadFailure error={read.error} />;
  if (!read.data) return null;

  const prefix = location.pathname.startsWith('/router/') ? '/router/' : '/flow/';
  const rest = location.pathname.slice((prefix + id).length).replace(/^\//, '');
  const renamed = rest ? renameContactSubpath(rest) : '';
  const target = flowPath(read.data.contact.shortName, renamed) + location.search + location.hash;
  return <Navigate to={target} replace />;
}
