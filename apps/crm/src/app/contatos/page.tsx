import Link from 'next/link';
import { Campo, Etiqueta, EstadoVazio, Tabela, type Coluna } from '@pipe/ui';
import { fusoDoTenant } from '../../lib/banco';
import { listarContatos, LIMITE_LISTA, type LinhaContato } from '../../lib/contatos';
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
function colunas(fuso: string, agora: Date): readonly Coluna<LinhaContato>[] {
  return [
    {
      chave: 'nome',
      rotulo: 'Contato',
      celula: (c) => <Link href={`/contatos/${c.id}`}>{c.nome}</Link>,
    },
    {
      chave: 'conta',
      rotulo: 'Conta',
      celula: (c) =>
        c.contaId ? <Link href={`/contas/${c.contaId}`}>{c.contaNome}</Link> : '—',
    },
    { chave: 'email', rotulo: 'E-mail', celula: (c) => c.email ?? '—' },
    { chave: 'telefone', rotulo: 'Telefone', numerica: true, celula: (c) => c.telefone ?? '—' },
    {
      chave: 'lead',
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
      chave: 'conversas',
      rotulo: 'Conversas',
      numerica: true,
      celula: (c) => numero(c.conversas),
    },
    {
      chave: 'ultima',
      rotulo: 'Última conversa',
      celula: (c) => (c.ultimaConversa ? desde(c.ultimaConversa, fuso, agora) : '—'),
    },
  ];
}

export default async function PaginaContatos({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const busca = q ?? '';
  const fuso = await fusoDoTenant();
  const contatos = await listarContatos(busca);
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
            defaultValue={busca}
            placeholder="Buscar por nome, CPF, telefone ou e-mail"
            aria-label="Buscar contato"
          />
          <button type="submit" className="btn">
            Aplicar
          </button>
          <span className="sub" style={{ marginLeft: 'auto' }}>
            {numero(contatos.length)} contatos
            {contatos.length === LIMITE_LISTA ? ` · teto de ${LIMITE_LISTA}` : ''}
          </span>
        </form>

        {contatos.length === 0 ? (
          <EstadoVazio
            titulo={busca ? 'Nenhum contato com esse termo.' : 'Nenhum contato cadastrado.'}
            ilustracao={busca ? 'busca' : 'vazio'}
          />
        ) : (
          <Tabela colunas={colunas(fuso, agora)} linhas={contatos} chaveDaLinha={(c) => c.id} />
        )}
      </div>
    </>
  );
}
