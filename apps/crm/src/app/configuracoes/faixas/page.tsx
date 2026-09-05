import { listarFaixas } from '../../../lib/regras';
import { numero } from '../../../lib/formato';

export const dynamic = 'force-dynamic';

const ROTULO_ESTRATEGIA: Record<string, string> = {
  rodizio: 'rodízio',
  menor_carga: 'menor carga',
  fixo: 'fixo',
  nenhuma: 'nenhuma',
};

export default async function PaginaFaixas() {
  const faixas = await listarFaixas();

  return (
    <>
      <div className="board-head">
        <h2>Faixas e roteamento</h2>
        <span className="sub">
          A faixa é a saída do motor de score, e é ela que decide fila e proprietário — o corte em
          60 do webhook de hoje, agora visível e versionado.
        </span>
      </div>

      <div className="tblwrap">
        <div className="tblhead">
          <h3>Faixas</h3>
        </div>
        {faixas.length === 0 ? (
          <div className="vazio">
            Nenhuma faixa cadastrada. Rode{' '}
            <span className="mono">pnpm --filter @pipe/crm seed:crm</span>.
          </div>
        ) : (
          <div className="scroll">
            <table>
              <thead>
                <tr>
                  <th>Faixa</th>
                  <th>Versão</th>
                  <th>De</th>
                  <th>Até</th>
                  <th>Fila</th>
                  <th>Proprietário</th>
                  <th>Leads na faixa</th>
                </tr>
              </thead>
              <tbody>
                {faixas.map((f) => (
                  <tr key={`${f.versao}-${f.nome}`}>
                    <td className="who">{f.nome}</td>
                    <td className="num">v{f.versao}</td>
                    <td className="num">{numero(f.minimo)}</td>
                    <td className="num">{numero(f.maximo)}</td>
                    <td>{f.fila ?? '—'}</td>
                    <td>{ROTULO_ESTRATEGIA[f.estrategiaProprietario] ?? f.estrategiaProprietario}</td>
                    <td className="num">{numero(f.leads)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
