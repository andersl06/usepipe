import { Etiqueta, Tabela, type Coluna } from '@pipe/ui';
import { listarFaixas, type LinhaFaixa } from '../../../lib/regras';
import { numero } from '../../../lib/formato';

export const dynamic = 'force-dynamic';

const ROTULO_ESTRATEGIA: Record<string, string> = {
  rodizio: 'rodízio',
  menor_carga: 'menor carga',
  fixo: 'fixo',
  nenhuma: 'nenhuma',
};

const COLUNAS: readonly Coluna<LinhaFaixa>[] = [
  { chave: 'nome', rotulo: 'Faixa', celula: (f) => <Etiqueta>{f.nome}</Etiqueta> },
  { chave: 'versao', rotulo: 'Versão', numerica: true, celula: (f) => `v${f.versao}` },
  { chave: 'minimo', rotulo: 'De', numerica: true, celula: (f) => numero(f.minimo) },
  { chave: 'maximo', rotulo: 'Até', numerica: true, celula: (f) => numero(f.maximo) },
  { chave: 'fila', rotulo: 'Fila', celula: (f) => (f.fila ? <Etiqueta>{f.fila}</Etiqueta> : '—') },
  {
    chave: 'estrategia',
    rotulo: 'Proprietário',
    celula: (f) => ROTULO_ESTRATEGIA[f.estrategiaProprietario] ?? f.estrategiaProprietario,
  },
  { chave: 'leads', rotulo: 'Leads na faixa', numerica: true, celula: (f) => numero(f.leads) },
];

export default async function PaginaFaixas() {
  const faixas = await listarFaixas();

  return (
    <>
      <div className="p-cabecalho">
        <h2>Faixas e roteamento</h2>
        <span className="sub">
          A faixa é a saída do motor de score, e é ela que decide fila e proprietário — o corte em
          60 do webhook de hoje, agora visível e versionado.
        </span>
      </div>

      <div className="tblwrap">
        <header>
          <h3>Faixas</h3>
        </header>
        <Tabela
          colunas={COLUNAS}
          linhas={faixas}
          chaveDaLinha={(f) => `${f.versao}-${f.nome}`}
          vazio={
            <>
              Nenhuma faixa cadastrada. Rode <code>pnpm --filter @pipe/crm seed:crm</code>.
            </>
          }
        />
      </div>
    </>
  );
}
