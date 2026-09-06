import Link from 'next/link';
import { Campo, Etiqueta, EstadoVazio, Tabela, type Coluna } from '@pipe/ui';
import { listarContas, LIMITE_LISTA, type LinhaConta } from '../../lib/contas';
import { dinheiroCurto, documento, numero } from '../../lib/formato';

export const dynamic = 'force-dynamic';

/**
 * Lista de contas, no mesmo padrão da lista de leads: uma caixa, uma busca, e
 * a tabela do pacote.
 *
 * Nenhuma cor. Uma conta não tem estado que exija ação — o que exige ação está
 * dentro dela, nas oportunidades e nos leads, e é para lá que a linha leva.
 */
const COLUNAS: readonly Coluna<LinhaConta>[] = [
  {
    chave: 'nome',
    rotulo: 'Conta',
    celula: (c) => <Link href={`/contas/${c.id}`}>{c.nome}</Link>,
  },
  { chave: 'documento', rotulo: 'CNPJ', numerica: true, celula: (c) => documento(c.documento) },
  {
    chave: 'dominio',
    rotulo: 'Domínio',
    celula: (c) => (c.dominio ? <Etiqueta>{c.dominio}</Etiqueta> : '—'),
  },
  { chave: 'proprietario', rotulo: 'Proprietário', celula: (c) => c.proprietario ?? '—' },
  { chave: 'contatos', rotulo: 'Contatos', numerica: true, celula: (c) => numero(c.contatos) },
  { chave: 'leads', rotulo: 'Leads', numerica: true, celula: (c) => numero(c.leads) },
  {
    chave: 'oportunidades',
    rotulo: 'Oportunidades',
    numerica: true,
    celula: (c) => numero(c.oportunidades),
  },
  {
    chave: 'valor',
    rotulo: 'Em negociação',
    numerica: true,
    celula: (c) => (c.oportunidades === 0 ? '—' : dinheiroCurto(c.valorAberto)),
  },
];

export default async function PaginaContas({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const busca = q ?? '';
  const contas = await listarContas(busca);

  return (
    <>
      <div className="p-cabecalho">
        <h2>Contas</h2>
        <span className="sub">
          A empresa do outro lado. Abrir uma mostra com quem falar e quanto está em jogo.
        </span>
      </div>

      <div className="tblwrap">
        <form className="tblhead" method="get" action="/contas">
          <Campo
            type="search"
            name="q"
            defaultValue={busca}
            placeholder="Buscar por nome, CNPJ ou domínio"
            aria-label="Buscar conta"
          />
          <button type="submit" className="btn">
            Aplicar
          </button>
          <span className="sub" style={{ marginLeft: 'auto' }}>
            {numero(contas.length)} contas
            {contas.length === LIMITE_LISTA ? ` · teto de ${LIMITE_LISTA}` : ''}
          </span>
        </form>

        {contas.length === 0 ? (
          <EstadoVazio
            titulo={busca ? 'Nenhuma conta com esse termo.' : 'Nenhuma conta cadastrada.'}
            ilustracao={busca ? 'busca' : 'vazio'}
          >
            {busca ? null : (
              <span>
                Rode <code>pnpm --filter @pipe/crm seed:crm</code> para semear o tenant demo.
              </span>
            )}
          </EstadoVazio>
        ) : (
          <Tabela colunas={COLUNAS} linhas={contas} chaveDaLinha={(c) => c.id} />
        )}
      </div>
    </>
  );
}
