import { useRead } from '../../lib/query';
import type { Horarios } from '../../lib/registrations';
import { dataHora, durationLong, DIAS_DA_SEMANA, numero } from '../../lib/format';
import { ListaRegras, type RulesSection } from '../../components/lista-regras';
import { FormulariosDeHorario } from './regras-horarios-formulario';

/**
 * Business hours. It's the missing reference for SLA. `@pipe/core`'s `avaliarSla` receives the queue's business hours and, without it, counts all 24 hours of the day: a two-hour deadline opened at 5:50pm on a Friday breaches Saturday morning, without anyone having actually taken long at all. The comment at the top of `lib/sla.ts` records exactly this — the clock runs with no business hours because none had been registered. The screen's numbers come from the same core functions the SLA uses (`dentroDoExpediente`, `proximaAbertura`, `intervalosUteis`): what the screen shows is what the calculation sees, including holidays and daylight saving time.
 */
export function PageHours() {
  const read = useRead<Horarios & { fuso: string }>('/v1/management/rules/schedules');
  if (!read.data) return null;
  const { fuso, horarios, queuesWithoutHour, agora } = read.data;

  const withoutQueue = horarios.filter((h) => h.queues.length === 0);
  const semFaixa = horarios.filter((h) => h.faixas.length === 0);

  const sections: RulesSection[] = [
    {
      titulo: 'Horários',
      empty:
        'Nenhum horário cadastrado. Todo SLA conta as 24 horas do dia, e conversa que chega de madrugada já nasce atrasada.',
      cards: horarios.map((h) => ({
        id: h.id,
        campos: [
          { rotulo: 'Horário', value: h.nome },
          { rotulo: 'Fuso', value: h.fuso },
          {
            rotulo: 'Agora',
            value: h.abertoAgora
              ? 'Aberto'
              : h.proximaAberturaEm
                ? `Fechado · abre ${dataHora(h.proximaAberturaEm, h.fuso)}`
                : 'Fechado · sem abertura prevista',
          },
          { rotulo: 'Próximos 7 dias', value: durationLong(h.seteDiasSeg), classe: 'num' },
          { rotulo: 'Faixas', value: numero(h.faixas.length), classe: 'num' },
          { rotulo: 'Exceções', value: numero(h.exceptions.length), classe: 'num' },
          {
            rotulo: 'Filas que usam',
            value: h.queues.length > 0 ? h.queues.join(', ') : 'Nenhuma',
          },
        ],
        // The card's status is USAGE, not a toggle: a schedule with no queue at
        // all isn't a data error, it's unfinished work — registered and
        // never turned on. It shows as an alert tag, which is already what the list knows
        // fazer com `active: false`.
        situation:
          h.queues.length > 0
            ? `Em uso por ${numero(h.queues.length)} fila(s)`
            : 'Nenhuma fila usa este horário',
        active: h.queues.length > 0,
        rodape: [
          ...h.faixas.map(
            (f) => `${DIAS_DA_SEMANA[f.diaSemana] ?? String(f.diaSemana)} ${f.inicio}–${f.fim}`,
          ),
          ...h.exceptions.map(
            (e) =>
              `${e.data} · ${e.fechado ? 'fechado' : `${e.inicio}–${e.fim}`}${e.motivo ? ` · ${e.motivo}` : ''}`,
          ),
        ],
        procura: `${h.nome} ${h.fuso} ${h.queues.join(' ')}`.toLowerCase(),
      })),
    },
  ];

  return (
    <>
      <div className="board-head">
        <h2>Horários de atendimento</h2>
        <span className="sub">
          {numero(horarios.length)} horários. “Aberto agora” foi medido em {dataHora(agora, fuso)},
          no fuso do tenant.
        </span>
      </div>

      <section className="card">
        <h3>Sem horário, o SLA não tem contra o que contar</h3>
        <p className="sub">
          O prazo de SLA corre em tempo <b>útil</b>: o relógio só anda dentro do expediente da fila
          e para quando a operação fecha. É o horário cadastrado aqui que diz quando é dentro. Sem
          ele, o cálculo conta as 24 horas do dia — uma conversa que chega às 17h50 de sexta com
          prazo de duas horas estoura no sábado de manhã sem ninguém ter demorado nada, e o
          relatório do mês registra um atraso que não houve.
        </p>
        <p className="sub">
          O horário se liga à fila, não à regra de SLA: cada fila aponta para um horário em{' '}
          <b>Filas de atendimento</b>. Um horário que nenhuma fila usa está cadastrado e desligado —
          por isso a lista abaixo marca esse caso em vez de deixá-lo passar.
        </p>
        <p className="note">
          “Próximos 7 dias” é o expediente que o <code>@pipe/core</code> enxerga a partir de agora,
          com feriado descontado e virada de horário de verão incluída. Se o número vier menor do
          que o esperado, é porque há exceção no caminho — ou porque falta faixa.
        </p>
      </section>

      <FormulariosDeHorario horarios={horarios.map((h) => ({ id: h.id, nome: h.nome }))} />

      {semFaixa.length > 0 ? (
        <div className="note">
          Sem nenhuma faixa, e por isso fechado o tempo todo:{' '}
          {semFaixa.map((h) => h.nome).join(', ')}. A fila que usar um destes nunca vai ter o
          relógio de SLA correndo.
        </div>
      ) : null}

      {withoutQueue.length > 0 ? (
        <div className="note">
          Cadastrados e sem fila nenhuma apontando para eles:{' '}
          {withoutQueue.map((h) => h.nome).join(', ')}. Ligue-os em Filas de atendimento, ou eles não
          mudam o SLA de conversa nenhuma.
        </div>
      ) : null}

      {queuesWithoutHour.length > 0 ? (
        <div className="note">
          Filas ativas sem horário, com o relógio de SLA correndo 24×7: {queuesWithoutHour.join(', ')}
          .
        </div>
      ) : null}

      <ListaRegras sections={sections} placeholder="Buscar por horário, fuso ou fila" />
    </>
  );
}
