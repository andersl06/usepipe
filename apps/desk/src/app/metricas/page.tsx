import Link from 'next/link';
import { noTenant, sessaoAtual } from '../../servidor/banco';
import { carregarStatus } from '../../servidor/consultas';
import { carregarMetricas } from '../../servidor/metricas';
import { dia as formatarDia, duracaoRelogio } from '../../servidor/formato';
import {
  comoCampoDeData,
  ehPeriodo,
  intervaloDe,
  intervaloPersonalizado,
  PERIODOS,
  TETO_DIAS,
} from '../../lib/periodo';
import type { ChaveDePeriodo } from '../../lib/periodo';
import { TrilhoDesk } from '../../componentes/trilho-desk';

/**
 * "Minhas métricas" — a tela de métricas do atendente, na anatomia da tela de
 * referência (`docs/pesquisa/blip-desk-medidas.md`, §10).
 *
 * **É do próprio atendente, e só dele.** Não há filtro por colega, não há
 * seletor de fila e não há exportação — exatamente como lá. Quem quer a visão
 * da operação vai ao Pipe Gestão, com permissão de supervisor; o trilho
 * continua tendo o caminho. As duas coisas convivem, e é assim que a
 * referência resolve.
 *
 * O recorte vive na URL (`?periodo=`, ou `?de=&ate=`), como tudo o mais no
 * Desk: recarregar não perde o período, o botão de voltar funciona, e a página
 * inteira continua saindo do servidor.
 *
 * Sem gráfico de biblioteca: a série diária é desenhada com duas barras por dia
 * em CSS. Duas séries num período de no máximo 90 pontos não justificam trazer
 * um empacotado de gráfico para dentro do Desk, e barra em CSS funciona sem
 * JavaScript, imprime, e acompanha o tema sozinha.
 */
export const dynamic = 'force-dynamic';

interface Parametros {
  periodo?: string;
  de?: string;
  ate?: string;
}

/** Os seis cartões de situação, na ordem da referência. */
const SITUACOES = [
  { chave: 'abertos', rotulo: 'Abertos' },
  { chave: 'transferidos', rotulo: 'Transferidos' },
  { chave: 'fechados', rotulo: 'Fechados' },
  { chave: 'abandonados', rotulo: 'Abandonados' },
  { chave: 'finalizados', rotulo: 'Finalizados' },
  { chave: 'perdidos', rotulo: 'Perdidos' },
] as const;

/**
 * O que cada rótulo quer dizer. Os nomes são os da referência e ficam como
 * estão — é o vocabulário que o mercado já conhece —, mas dois deles escondem
 * a definição, e sem esta linha o atendente lê "Abandonados" como "eu abandonei".
 */
const EXPLICA: Record<string, string> = {
  abertos: 'Atendimentos que caíram no seu colo no período.',
  transferidos: 'Atendimentos que mudaram de atendente.',
  fechados: 'Atendimentos seus que terminaram no período, por qualquer motivo.',
  abandonados: 'Terminaram sem um atendente encerrar — cliente saiu ou o prazo venceu.',
  finalizados: 'Você encerrou.',
  perdidos: 'Atendimentos perdidos antes de começar.',
};

export default async function PaginaMetricas({
  searchParams,
}: {
  searchParams: Promise<Parametros>;
}) {
  const parametros = await searchParams;
  const agora = new Date();
  const sessao = await sessaoAtual();

  // O personalizado só vale se as duas datas vierem e forem legíveis; qualquer
  // outra coisa cai no padrão, que é "Hoje".
  const custom =
    parametros.de && parametros.ate
      ? intervaloPersonalizado(parametros.de, parametros.ate, agora)
      : null;
  const periodo: ChaveDePeriodo = ehPeriodo(parametros.periodo) ? parametros.periodo : 'hoje';
  const intervalo = custom ?? intervaloDe(periodo, agora);

  const { metricas, status } = await noTenant(async (tx) => ({
    metricas: await carregarMetricas(
      tx,
      sessao.atendenteId,
      intervalo.inicio,
      intervalo.fim,
    ),
    status: await carregarStatus(tx, sessao.atendenteId),
  }));

  const { situacoes, tempos, serie } = metricas;
  const teto = Math.max(1, ...serie.map((d) => Math.max(d.abertos, d.fechados)));
  const desde = serie[0]?.dia;

  return (
    <div className="desk-app">
      <TrilhoDesk
        iniciais={sessao.iniciais}
        nome={sessao.nome}
        email={sessao.email}
        tenantNome={sessao.tenantNome}
        estado={status.estado}
        atual="metricas"
      />

      <main className="metricas">
        <header className="metricas-topo">
          <div>
            <h1>Minhas métricas: {sessao.nome}</h1>
            <p className="sub">Confira todas as suas métricas de atendimento neste painel.</p>
          </div>
          {/* Não há "Exportar": a referência não tem, e o relatório da operação
              inteira, que é onde exportar faz sentido, é do Pipe Gestão. */}
          <Link className="btn" href={caminho(periodo, custom ? parametros : undefined)}>
            Atualizar
          </Link>
        </header>

        {/* Cinco atalhos mais o intervalo à mão, na ordem da referência. São
            links, e não botões: o recorte mora na URL. */}
        <nav className="periodos" aria-label="Período">
          {PERIODOS.map((opcao) => (
            <Link
              key={opcao.chave}
              className="etiqueta"
              href={caminho(opcao.chave)}
              aria-current={!custom && opcao.chave === periodo ? 'true' : undefined}
            >
              {opcao.rotulo}
            </Link>
          ))}
          <form className="periodo-livre" action="/metricas">
            <label className="sr" htmlFor="de">
              Início
            </label>
            <input
              id="de"
              type="date"
              name="de"
              defaultValue={comoCampoDeData(intervalo.inicio)}
              min={comoCampoDeData(new Date(agora.getTime() - TETO_DIAS * 86400000))}
              max={comoCampoDeData(agora)}
            />
            <label className="sr" htmlFor="ate">
              Fim
            </label>
            <input
              id="ate"
              type="date"
              name="ate"
              defaultValue={comoCampoDeData(intervalo.fim)}
              min={comoCampoDeData(new Date(agora.getTime() - TETO_DIAS * 86400000))}
              max={comoCampoDeData(agora)}
            />
            <button type="submit" className="btn">
              Personalizado
            </button>
          </form>
        </nav>

        <section className="bloco">
          <h2>Visão Geral de Tickets</h2>
          <div className="cartoes">
            {SITUACOES.map((s) => {
              const valor = situacoes[s.chave];
              return (
                <div className="cartao-num" key={s.chave}>
                  <span className="n">{valor === null ? '—' : valor}</span>
                  <span className="rot">{s.rotulo}</span>
                  <span className="exp">
                    {valor === null
                      ? `${EXPLICA[s.chave]} O Pipe ainda não guarda este dado.`
                      : EXPLICA[s.chave]}
                  </span>
                </div>
              );
            })}
          </div>
        </section>

        <section className="bloco">
          <h2>
            Total de tickets de atendimento
            {desde ? <span className="etiqueta">Desde {formatarDia(new Date(desde))}</span> : null}
          </h2>
          <div className="serie" role="img" aria-label="Abertos e fechados por dia">
            {serie.map((d) => (
              <div className="serie-dia" key={d.dia} title={`${d.dia}: ${d.abertos} abertos, ${d.fechados} fechados`}>
                <span className="b abertos" style={{ height: `${(d.abertos / teto) * 100}%` }} />
                <span className="b fechados" style={{ height: `${(d.fechados / teto) * 100}%` }} />
              </div>
            ))}
          </div>
          <div className="legenda">
            <span className="chave abertos">Abertos</span>
            <span className="chave fechados">Fechados</span>
          </div>
        </section>

        <section className="bloco">
          <h2>Médias de métricas de atendimento</h2>
          <div className="cartoes">
            <div className="cartao-num">
              <span className="n">{duracaoRelogio(tempos.primeiraRespostaSeg)}</span>
              <span className="rot">Primeira Resposta</span>
              <span className="exp">Da chegada até a sua primeira palavra.</span>
            </div>
            <div className="cartao-num">
              <span className="n">{duracaoRelogio(tempos.esperaNaFilaSeg)}</span>
              <span className="rot">Espera na fila</span>
              <span className="exp">Da abertura até o atendimento cair em alguém.</span>
            </div>
            <div className="cartao-num">
              <span className="n">{duracaoRelogio(tempos.esperaTotalSeg)}</span>
              <span className="rot">Espera total</span>
              <span className="exp">Fila mais o tempo que o atendimento passou em espera.</span>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

function caminho(periodo: ChaveDePeriodo, livre?: Parametros): string {
  if (livre?.de && livre.ate) {
    return `/metricas?${new URLSearchParams({ de: livre.de, ate: livre.ate }).toString()}`;
  }
  return periodo === 'hoje' ? '/metricas' : `/metricas?periodo=${periodo}`;
}
