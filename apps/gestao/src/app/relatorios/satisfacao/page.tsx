import { fusoDoTenant, janelaDeDatas, janelaDeHoje } from '../../../lib/banco';
import {
  carregarSatisfacao,
  LIMITE_COMENTARIOS,
  type GrupoSatisfacao,
} from '../../../lib/satisfacao';
import { dataHora, dataIso, numero, percentual } from '../../../lib/formato';

export const dynamic = 'force-dynamic';

interface Busca {
  de?: string;
  ate?: string;
}

const NOME_DO_TIPO: Record<string, string> = { csat: 'CSAT', nps: 'NPS' };

/**
 * A barra da classe usa os três estados do design system, e nada além deles:
 * o bom é a cor da marca, o meio é alerta e o ruim é erro. Classe que o banco
 * gravou fora desse vocabulário sai neutra, e não inventa uma quarta cor.
 */
const FILL_DA_CLASSE: Record<string, string> = {
  promotor: 'fill',
  satisfeito: 'fill',
  neutro: 'fill warn',
  insatisfeito: 'fill bad',
  detrator: 'fill bad',
};

function rotuloDoTipo(tipo: string): string {
  return NOME_DO_TIPO[tipo] ?? tipo.toUpperCase();
}

/**
 * Um bloco por tipo E escala.
 *
 * O título carrega a escala porque a nota sozinha não se explica: 4 numa escala
 * de 1 a 5 é quase o teto, 4 numa de 0 a 10 é detrator. Dois blocos nunca se
 * somam nem se comparam — é a §6 da spec, e é o motivo de `resposta_pesquisa`
 * guardar a escala junto da nota.
 */
function Bloco({ grupo, encerradas }: { grupo: GrupoSatisfacao; encerradas: number }) {
  const escala = `escala ${numero(grupo.escalaMin)} a ${numero(grupo.escalaMax)}`;
  return (
    <section className="bloco-rel">
      <h3>
        {rotuloDoTipo(grupo.tipo)} <span className="sub">{escala}</span>
      </h3>

      <div className="bloco-rel-grade" style={{ '--rel-colunas': 3 } as React.CSSProperties}>
        <div className="cartao-rel">
          <span className="r">Nota média</span>
          <span className="v">{numero(grupo.media, 2)}</span>
          {/* A taxa de resposta é obrigatória AQUI, no mesmo cartão da média:
              4,85 com 22% de resposta não é a mesma coisa que 4,85 com 90%. */}
          <span className="den">
            {percentual(grupo.taxa)} de taxa de resposta · {numero(grupo.respostas)} notas em{' '}
            {escala}
          </span>
        </div>
        <div className="cartao-rel">
          <span className="r">Taxa de resposta</span>
          <span className="v">{percentual(grupo.taxa)}</span>
          <span className="den">
            {numero(grupo.respostas)} respostas ÷ {numero(encerradas)} conversas encerradas
          </span>
        </div>
        <div className="cartao-rel">
          <span className="r">Respostas</span>
          <span className="v">{numero(grupo.respostas)}</span>
          <span className="den">
            de {numero(grupo.enviadas)} pesquisas enviadas ·{' '}
            {numero(grupo.enviadas - grupo.respostas)} sem nota
          </span>
        </div>
      </div>

      {grupo.classes.length === 0 ? null : (
        <div className="cartao-rel tabela scroll">
          <table>
            <thead>
              <tr>
                <th>Classe</th>
                <th>Respostas</th>
                <th>Participação</th>
                <th>Distribuição</th>
              </tr>
            </thead>
            <tbody>
              {grupo.classes.map((c) => (
                <tr key={c.nome}>
                  <td className="who">{c.nome}</td>
                  <td className="num">{numero(c.quantidade)}</td>
                  <td className="num">{percentual(c.fracao)}</td>
                  <td>
                    <span className="trilho">
                      <span
                        className={FILL_DA_CLASSE[c.nome] ?? 'fill'}
                        style={{ width: `${c.fracao * 100}%` }}
                      />
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="note">
        As classes são as que a pesquisa gravou junto da resposta. A tela não reclassifica nota: as
        faixas são do modelo escolhido no cadastro da pesquisa, e recalculá-las aqui criaria uma
        segunda definição, diferente da que gerou o dado.
      </p>
    </section>
  );
}

/**
 * Relatório de satisfação — §6 da spec de métricas.
 *
 * Mesma estrutura de bloco do relatório de atendimento e do de esforço: bloco
 * com recuo 20 e raio 16, título 16/700, grade de 20, métrica 14/600 com o
 * valor 20/700 embaixo.
 */
export default async function PaginaSatisfacao({ searchParams }: { searchParams: Promise<Busca> }) {
  const params = await searchParams;
  const fuso = await fusoDoTenant();
  const hoje = await janelaDeHoje(fuso);

  const ate = params.ate || dataIso(hoje.inicio, fuso);
  const de = params.de || dataIso(new Date(hoje.inicio.getTime() - 29 * 86400e3), fuso);
  const janela = await janelaDeDatas(fuso, de, ate);

  const relatorio = await carregarSatisfacao(janela);

  return (
    <>
      <div className="board-head">
        <h2>Relatório de satisfação</h2>
        <span className="sub">
          Respostas de pesquisa das conversas encerradas no período. Cada escala tem bloco próprio.
        </span>
        <span className="sub filters">{numero(relatorio.encerradas)} conversas encerradas</span>
      </div>

      <form className="quickfilters" method="get" action="/relatorios/satisfacao">
        <span className="lbl">Período</span>
        <input type="date" name="de" defaultValue={de} className="btn" aria-label="De" />
        <input type="date" name="ate" defaultValue={ate} className="btn" aria-label="Até" />
        <div className="faixa-fim">
          <a href="/relatorios/satisfacao" className="btn">
            Limpar
          </a>
          <button type="submit" className="btn primary">
            Aplicar
          </button>
        </div>
      </form>

      {relatorio.grupos.length === 0 ? (
        <section className="bloco-rel">
          <h3>
            Satisfação <span className="sub">{`${de} → ${ate}`}</span>
          </h3>
          <div className="cartao-rel">
            <div className="vazio">
              <b>Nenhuma pesquisa respondida neste período.</b>
              As {numero(relatorio.encerradas)} conversas encerradas continuam sem nota — o que já é
              um dado, e é por isso que a taxa de resposta anda ao lado da média.
            </div>
          </div>
        </section>
      ) : (
        relatorio.grupos.map((g) => (
          <Bloco
            key={`${g.tipo}-${g.escalaMin}-${g.escalaMax}`}
            grupo={g}
            encerradas={relatorio.encerradas}
          />
        ))
      )}

      <section className="bloco-rel">
        <h3>
          Comentários recentes{' '}
          <span className="sub">os {numero(LIMITE_COMENTARIOS)} mais recentes do período</span>
        </h3>
        {relatorio.comentarios.length === 0 ? (
          <div className="cartao-rel">
            <div className="vazio">Nenhuma resposta veio com comentário neste período.</div>
          </div>
        ) : (
          <div className="cartao-rel tabela scroll">
            <table>
              <thead>
                <tr>
                  <th>Quando</th>
                  <th>Pesquisa</th>
                  <th>Nota</th>
                  <th>Classe</th>
                  <th>Comentário</th>
                </tr>
              </thead>
              <tbody>
                {relatorio.comentarios.map((c) => (
                  <tr key={c.id}>
                    <td className="num">{dataHora(c.em, fuso)}</td>
                    <td className="who">{rotuloDoTipo(c.tipo)}</td>
                    {/* A nota anda com a escala mesmo na linha da tabela: um 4
                        solto não diz se é quase o teto ou um detrator. */}
                    <td className="num">
                      {numero(c.nota)}
                      <span className="den">
                        de {numero(c.escalaMin)} a {numero(c.escalaMax)}
                      </span>
                    </td>
                    <td>{c.classe ?? '—'}</td>
                    <td className="comentario">{c.texto}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
