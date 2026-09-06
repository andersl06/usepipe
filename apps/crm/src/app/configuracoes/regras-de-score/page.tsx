import { Etiqueta, Tabela, type Coluna } from '@pipe/ui';
import { condicaoEmTexto, listarRegras, type LinhaRegra } from '../../../lib/regras';
import { numero, pontos } from '../../../lib/formato';

export const dynamic = 'force-dynamic';

/**
 * As colunas da tabela de regras.
 *
 * Duas coisas que saíram daqui: a condição não é mais monoespaçada (ela é
 * texto em português, não número, e a mono só serve coluna que precisa
 * alinhar) e o peso negativo não é mais vermelho (uma regra que tira ponto não
 * é uma falha — o sinal já diz o que ela faz).
 *
 * "Ativa" também deixou de ser verde: dez regras ativas pintavam dez etiquetas
 * verdes, e o verde deixava de querer dizer alguma coisa. As duas são neutras,
 * e a palavra basta.
 */
const COLUNAS: readonly Coluna<LinhaRegra>[] = [
  { chave: 'nome', rotulo: 'Regra', celula: (r) => <span className="forte">{r.nome}</span> },
  { chave: 'condicao', rotulo: 'Condição', celula: (r) => <span className="condicao">{condicaoEmTexto(r.condicao)}</span> },
  { chave: 'pontos', rotulo: 'Peso', numerica: true, celula: (r) => pontos(r.pontos) },
  { chave: 'versao', rotulo: 'Versão', numerica: true, celula: (r) => `v${r.versao}` },
  {
    chave: 'ativa',
    rotulo: 'Ativa',
    celula: (r) => <Etiqueta>{r.ativa ? 'Ativa' : 'Inativa'}</Etiqueta>,
  },
  {
    chave: 'afetados',
    rotulo: 'Leads afetados',
    numerica: true,
    celula: (r) => numero(r.leadsAfetados),
  },
];

export default async function PaginaRegras() {
  const regras = await listarRegras();
  const versoes = [...new Set(regras.map((r) => r.versao))].sort((a, b) => b - a);

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
              <header>
                <h3>Versão {versao}</h3>
                <span className="lbl">
                  teto {pontos(somaPositiva)} · piso {pontos(somaNegativa)} ·{' '}
                  {numero(daVersao.filter((r) => r.ativa).length)} regras ativas
                </span>
              </header>
              <Tabela colunas={COLUNAS} linhas={daVersao} chaveDaLinha={(r) => r.id} />
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
