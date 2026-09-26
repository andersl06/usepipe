import { LoadingNotice, EsqueletoDeTabela } from '../components/esqueleto';

/**
 * The CRM's default loading state. It applies to every route that doesn't
 * declare its own — dashboard, accounts, contacts, opportunities, and settings.
 *
 * No title: each screen's title is different, and writing the wrong one here is
 * worse than writing none. The routes where the screen's shape really matters
 * (the leads list and the record) have their own.
 */
export default function Carregando() {
  return (
    <div className="tblwrap">
      <LoadingNotice>Carregando.</LoadingNotice>
      <EsqueletoDeTabela colunas={6} linhas={8} />
    </div>
  );
}
