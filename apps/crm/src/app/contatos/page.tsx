import Link from 'next/link';
import { Campo, Etiqueta, EmptyState, Tabela, type Column } from '@pipe/ui';
import { fusoDoTenant } from '../../lib/banco';
import { listContacts, LIMITE_LISTA, type LinhaContact } from '../../lib/contatos';
import { desde, numero } from '../../lib/formato';

export const dynamic = 'force-dynamic';

/**
 * Lista de contatos, no mesmo padrão da de leads e da de contas.
 *
 * Contato é pessoa; lead é a intenção dela de comprar. A lista mostra a pessoa
 * e diz se existe um lead ligado a ela — é o que a lista de leads não pode
 * mostrar, porque lá cada linha é uma intenção.
 *
 * Sem cor: um contato não tem estado que exija ação.
 */
function colunas(fuso: string, agora: Date): readonly Column<LinhaContact>[] {
  return [
    {
      key: 'nome',
      rotulo: 'Contato',
      celula: (c) => <Link href={`/contacts/${c.id}`}>{c.nome}</Link>,
    },
    {
      key: 'conta',
      rotulo: 'Conta',
      celula: (c) =>
        c.accountId ? <Link href={`/accounts/${c.accountId}`}>{c.accountName}</Link> : '—',
    },
    { key: 'email', rotulo: 'E-mail', celula: (c) => c.email ?? '—' },
    { key: 'telefone', rotulo: 'Telefone', numerica: true, celula: (c) => c.telefone ?? '—' },
    {
      key: 'lead',
      rotulo: 'Lead',
      celula: (c) =>
        c.leadId ? (
          <Link href={`/leads/${c.leadId}`}>
            <Etiqueta>{c.faixa ?? 'sem faixa'}</Etiqueta>
          </Link>
        ) : (
          '—'
        ),
    },
    {
      key: 'conversas',
      rotulo: 'Conversas',
      numerica: true,
      celula: (c) => numero(c.conversations),
    },
    {
      key: 'ultima',
      rotulo: 'Última conversa',
      celula: (c) => (c.ultimaConversation ? desde(c.ultimaConversation, fuso, agora) : '—'),
    },
  ];
}

export default async function PageContacts({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const search = q ?? '';
  const fuso = await fusoDoTenant();
  const contacts = await listContacts(search);
  const agora = new Date();

  return (
    <>
      <div className="p-cabecalho">
        <h2>Contatos</h2>
        <span className="sub">
          A pessoa, não a intenção de compra. Abrir um mostra as conversas dela e o lead dela.
        </span>
      </div>

      <div className="tblwrap">
        <form className="tblhead" method="get" action="/contatos">
          <Campo
            type="search"
            name="q"
            defaultValue={search}
            placeholder="Buscar por nome, CPF, telefone ou e-mail"
            aria-label="Buscar contato"
          />
          <button type="submit" className="btn">
            Aplicar
          </button>
          <span className="sub" style={{ marginLeft: 'auto' }}>
            {numero(contacts.length)} contatos
            {contacts.length === LIMITE_LISTA ? ` · teto de ${LIMITE_LISTA}` : ''}
          </span>
        </form>

        {contacts.length === 0 ? (
          <EmptyState
            titulo={search ? 'Nenhum contato com esse termo.' : 'Nenhum contato cadastrado.'}
            illustration={search ? 'busca' : 'vazio'}
          />
        ) : (
          <Tabela colunas={colunas(fuso, agora)} linhas={contacts} linhaKey={(c) => c.id} />
        )}
      </div>
    </>
  );
}
