import Link from 'next/link';
import { Icone } from '@pipe/ui';
import {
  FILTRAVEIS,
  rotuloDoFiltro,
  SEM_VALOR,
  type ChaveDeFiltro,
  type Filtros,
} from '../lib/leads-visao';

/**
 * O filtro por coluna da listagem.
 *
 * A forma é a do Twenty (`object-filter-dropdown`): um botão que abre a lista
 * de CAMPOS, e o campo escolhido abre a lista de VALORES. Dois passos, e não um
 * formulário com quatro seletores — porque quase sempre se filtra por uma
 * coluna só, e um formulário cobraria a atenção das outras três a cada uso.
 *
 * O filtro escolhido vira **chip**, ao lado do botão, e o chip é o botão de
 * remover. É deles também, e é o que faz um filtro ativo ser visível de longe:
 * lista filtrada sem sinal na tela é a origem de "o lead sumiu do CRM".
 *
 * **Sem JavaScript nenhum.** `<details>` nativo abre o menu, e cada valor é um
 * link para a mesma listagem com um parâmetro a mais. A consequência é a que
 * interessa: o filtro está na URL, então a **visão salva o guarda de graça** —
 * salvar uma visão continua sendo dar nome a uma consulta que já existe.
 *
 * O que não copiamos: os operadores deles (contém, começa com, está vazio, é
 * um de). Aqui é igualdade, mais "em branco". Texto livre já é a busca do lado
 * de cá, e um menu de operadores para quatro colunas categóricas seria três
 * cliques para responder o que um resolve.
 */
export function Filtro({
  filtros,
  opcoes,
  href,
}: {
  filtros: Filtros;
  opcoes: Record<ChaveDeFiltro, string[]>;
  /** O endereço desta mesma listagem com outro conjunto de filtros. */
  href: (proximos: Filtros) => string;
}) {
  const ativos = FILTRAVEIS.filter((f) => filtros[f.chave] !== undefined);

  return (
    <div className="filtros">
      <details className="menu-filtro">
        <summary className="btn">
          <Icone nome="filtro" tamanho={16} />
          Filtrar
        </summary>
        <div className="menu-painel">
          {FILTRAVEIS.map((f) => {
            // "Em branco" entra sempre, mesmo que nenhuma linha esteja em
            // branco agora: é a pergunta "quem ficou sem dono?", e ela não pode
            // depender de já haver alguém sem dono para poder ser feita.
            const valores = [...opcoes[f.chave], SEM_VALOR];
            return (
              <details key={f.chave}>
                <summary>
                  {f.rotulo}
                  <span className="qt">{opcoes[f.chave].length}</span>
                </summary>
                <ul>
                  {valores.map((v) => (
                    <li key={v}>
                      <Link
                        href={href({ ...filtros, [f.chave]: v })}
                        aria-current={filtros[f.chave] === v ? 'true' : undefined}
                      >
                        {v === SEM_VALOR ? 'em branco' : v}
                      </Link>
                    </li>
                  ))}
                </ul>
              </details>
            );
          })}
        </div>
      </details>

      {ativos.map((f) => {
        const valor = filtros[f.chave] ?? '';
        const semEste = { ...filtros };
        delete semEste[f.chave];
        return (
          <Link
            key={f.chave}
            className="filtro-chip"
            href={href(semEste)}
            title={`Tirar o filtro ${rotuloDoFiltro(f.chave, valor)}`}
          >
            {rotuloDoFiltro(f.chave, valor)}
            <span aria-hidden="true">×</span>
          </Link>
        );
      })}
    </div>
  );
}
