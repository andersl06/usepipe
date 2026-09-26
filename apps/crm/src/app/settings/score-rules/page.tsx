import { Etiqueta, Tabela, type Column } from '@pipe/ui';
import { conditionInText, listarRegras, type LinhaRegra } from '../../../lib/regras';
import { numero, pontos } from '../../../lib/format';

export const dynamic = 'force-dynamic';

/**
 * The scoring rules table's columns.
 *
 * Two things were dropped here: the condition is no longer monospaced (it's Portuguese
 * text, not a number, and monospace only serves columns that need to align) and a
 * negative weight is no longer red (a rule that subtracts points isn't a failure — the
 * sign already says what it does).
 *
 * "Active" also stopped being green: ten active rules painted ten green badges, and
 * green stopped meaning anything. Both are neutral now, and the word is enough.
 */
const COLUNAS: readonly Column<LinhaRegra>[] = [
  { key: 'nome', rotulo: 'Regra', celula: (r) => <span className="forte">{r.nome}</span> },
  { key: 'condicao', rotulo: 'Condição', celula: (r) => <span className="condicao">{conditionInText(r.condition)}</span> },
  { key: 'pontos', rotulo: 'Peso', numerica: true, celula: (r) => pontos(r.pontos) },
  { key: 'versao', rotulo: 'Versão', numerica: true, celula: (r) => `v${r.versao}` },
  {
    key: 'ativa',
    rotulo: 'Ativa',
    celula: (r) => <Etiqueta>{r.active ? 'Ativa' : 'Inativa'}</Etiqueta>,
  },
  {
    key: 'afetados',
    rotulo: 'Leads afetados',
    numerica: true,
    celula: (r) => numero(r.leadsAfetados),
  },
];

export default async function PageRules() {
  const regras = await listarRegras();
  const versions = [...new Set(regras.map((r) => r.versao))].sort((a, b) => b - a);

  return (
    <>
      <div className="p-cabecalho">
        <h2>Regras de score</h2>
        <span className="sub">
          A regra tem versão, e o cálculo antigo continua apontando para a versão que o produziu.
          Edição entra na fase seguinte; a leitura é o que tira o número do mistério.
        </span>
      </div>

      {regras.length === 0 ? (
        <div className="tblwrap">
          <div className="vazio">
            Nenhuma regra cadastrada. Rode <code>pnpm --filter @pipe/crm seed:crm</code>.
          </div>
        </div>
      ) : (
        versions.map((versao) => {
          const daVersao = regras.filter((r) => r.versao === versao);
          const somaPositiva = daVersao
            .filter((r) => r.active && r.pontos > 0)
            .reduce((s, r) => s + r.pontos, 0);
          const somaNegativa = daVersao
            .filter((r) => r.active && r.pontos < 0)
            .reduce((s, r) => s + r.pontos, 0);

          return (
            <div className="tblwrap" key={versao}>
              <header>
                <h3>Versão {versao}</h3>
                <span className="lbl">
                  teto {pontos(somaPositiva)} · piso {pontos(somaNegativa)} ·{' '}
                  {numero(daVersao.filter((r) => r.active).length)} regras ativas
                </span>
              </header>
              <Tabela colunas={COLUNAS} linhas={daVersao} linhaKey={(r) => r.id} />
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
