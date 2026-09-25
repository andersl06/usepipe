import Link from 'next/link';
import { Campo, Etiqueta, EmptyState, Tabela, type Column } from '@pipe/ui';
import { listAccounts, LIMITE_LISTA, type LinhaAccount } from '../../lib/accounts';
import { moneyCurto, document, numero } from '../../lib/format';

export const dynamic = 'force-dynamic';

/**
 * Lista de contas, no mesmo padrão da lista de leads: uma caixa, uma busca, e
 * a tabela do pacote.
 *
 * Nenhuma cor. Uma conta não tem estado que exija ação — o que exige ação está
 * dentro dela, nas oportunidades e nos leads, e é para lá que a linha leva.
 */
const COLUNAS: readonly Column<LinhaAccount>[] = [
  {
    key: 'nome',
    rotulo: 'Conta',
    celula: (c) => <Link href={`/accounts/${c.id}`}>{c.nome}</Link>,
  },
  { key: 'documento', rotulo: 'CNPJ', numerica: true, celula: (c) => document(c.document) },
  {
    key: 'dominio',
    rotulo: 'Domínio',
    celula: (c) => (c.domain ? <Etiqueta>{c.domain}</Etiqueta> : '—'),
  },
  { key: 'proprietario', rotulo: 'Proprietário', celula: (c) => c.proprietario ?? '—' },
  { key: 'contatos', rotulo: 'Contatos', numerica: true, celula: (c) => numero(c.contacts) },
  { key: 'leads', rotulo: 'Leads', numerica: true, celula: (c) => numero(c.leads) },
  {
    key: 'oportunidades',
    rotulo: 'Oportunidades',
    numerica: true,
    celula: (c) => numero(c.opportunities),
  },
  {
    key: 'valor',
    rotulo: 'Em negociação',
    numerica: true,
    celula: (c) => (c.opportunities === 0 ? '—' : moneyCurto(c.valueAberto)),
  },
];

export default async function PageAccounts({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const search = q ?? '';
  const accounts = await listAccounts(search);

  return (
    <>
      <div className="p-cabecalho">
        <h2>Contas</h2>
        <span className="sub">
          A empresa do outro lado. Abrir uma mostra com quem falar e quanto está em jogo.
        </span>
      </div>

      <div className="tblwrap">
        <form className="tblhead" method="get" action="/accounts">
          <Campo
            type="search"
            name="q"
            defaultValue={search}
            placeholder="Buscar por nome, CNPJ ou domínio"
            aria-label="Buscar conta"
          />
          <button type="submit" className="btn">
            Aplicar
          </button>
          <span className="sub" style={{ marginLeft: 'auto' }}>
            {numero(accounts.length)} contas
            {accounts.length === LIMITE_LISTA ? ` · teto de ${LIMITE_LISTA}` : ''}
          </span>
        </form>

        {accounts.length === 0 ? (
          <EmptyState
            titulo={search ? 'Nenhuma conta com esse termo.' : 'Nenhuma conta cadastrada.'}
            illustration={search ? 'busca' : 'vazio'}
          >
            {search ? null : (
              <span>
                Rode <code>pnpm --filter @pipe/crm seed:crm</code> para semear o tenant demo.
              </span>
            )}
          </EmptyState>
        ) : (
          <Tabela colunas={COLUNAS} linhas={accounts} linhaKey={(c) => c.id} />
        )}
      </div>
    </>
  );
}
