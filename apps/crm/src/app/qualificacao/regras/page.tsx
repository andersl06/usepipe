import { condicaoEmTexto, listarRegras } from '../../../lib/regras';
import { numero, pontos } from '../../../lib/formato';

export const dynamic = 'force-dynamic';

export default async function PaginaRegras() {
  const regras = await listarRegras();
  const versoes = [...new Set(regras.map((r) => r.versao))].sort((a, b) => b - a);

  return (
    <>
      <div className="board-head">
        <h2>Regras de score</h2>
        <span className="sub">
          A regra tem versão, e o cálculo antigo continua apontando para a versão que o produziu.
          Edição entra na fase seguinte; a leitura é o que tira o número do mistério.
        </span>
      </div>

      {regras.length === 0 ? (
        <div className="tblwrap">
          <div className="vazio">
            Nenhuma regra cadastrada. Rode{' '}
            <span className="mono">pnpm --filter @pipe/crm seed:crm</span>.
          </div>
        </div>
      ) : (
        versoes.map((versao) => {
          const daVersao = regras.filter((r) => r.versao === versao);
          const somaPositiva = daVersao
            .filter((r) => r.ativa && r.pontos > 0)
            .reduce((s, r) => s + r.pontos, 0);
          const somaNegativa = daVersao
            .filter((r) => r.ativa && r.pontos < 0)
            .reduce((s, r) => s + r.pontos, 0);

          return (
            <div className="tblwrap" key={versao}>
              <div className="tblhead">
                <h3>Versão {versao}</h3>
                <span className="lbl" style={{ marginLeft: 'auto' }}>
                  teto {pontos(somaPositiva)} · piso {pontos(somaNegativa)} ·{' '}
                  {numero(daVersao.filter((r) => r.ativa).length)} regras ativas
                </span>
              </div>
              <div className="scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Regra</th>
                      <th>Condição</th>
                      <th>Peso</th>
                      <th>Versão</th>
                      <th>Ativa</th>
                      <th>Leads afetados</th>
                    </tr>
                  </thead>
                  <tbody>
                    {daVersao.map((r) => (
                      <tr key={r.id}>
                        <td className="who">{r.nome}</td>
                        <td
                          className="mono"
                          style={{ whiteSpace: 'normal', maxWidth: '460px', fontSize: '11px' }}
                        >
                          {condicaoEmTexto(r.condicao)}
                        </td>
                        <td className="num" style={{ color: r.pontos >= 0 ? undefined : 'var(--terracotta)' }}>
                          {pontos(r.pontos)}
                        </td>
                        <td className="num">v{r.versao}</td>
                        <td>
                          {r.ativa ? (
                            <span className="pill ok">ATIVA</span>
                          ) : (
                            <span className="pill q">INATIVA</span>
                          )}
                        </td>
                        <td className="num">{numero(r.leadsAfetados)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mensagem">
                &quot;Leads afetados&quot; conta o cálculo vigente de cada lead, não todos os
                cálculos: lead recalculado três vezes conta uma.
              </div>
            </div>
          );
        })
      )}
    </>
  );
}
