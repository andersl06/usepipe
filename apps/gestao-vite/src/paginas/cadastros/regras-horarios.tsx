import { useLeitura } from '../../lib/consulta';
import type { Horarios } from '../../lib/cadastros';
import { dataHora, duracaoLonga, DIAS_DA_SEMANA, numero } from '../../lib/formato';
import { ListaRegras, type SecaoDeRegras } from '../../componentes/lista-regras';
import { FormulariosDeHorario } from './regras-horarios-formulario';

/**
 * Horários de atendimento.
 *
 * É a referência que falta para o SLA. `avaliarSla` do `@pipe/core` recebe o
 * expediente da fila e, sem ele, conta as 24 horas do dia: um prazo de duas
 * horas aberto às 17h50 de sexta estoura no sábado de manhã, sem ninguém ter
 * demorado nada. O comentário no topo de `lib/sla.ts` registra exatamente isso
 * — o relógio roda sem expediente porque não havia horário cadastrado.
 *
 * Os números da tela saem das mesmas funções do core que o SLA usa
 * (`dentroDoExpediente`, `proximaAbertura`, `intervalosUteis`): o que a tela
 * mostra é o que o cálculo enxerga, incluindo feriado e horário de verão.
 */
export function PaginaHorarios() {
  const leitura = useLeitura<Horarios & { fuso: string }>('/v1/gestao/regras/horarios');
  if (!leitura.data) return null;
  const { fuso, horarios, filasSemHorario, agora } = leitura.data;

  const semFila = horarios.filter((h) => h.filas.length === 0);
  const semFaixa = horarios.filter((h) => h.faixas.length === 0);

  const secoes: SecaoDeRegras[] = [
    {
      titulo: 'Horários',
      vazio:
        'Nenhum horário cadastrado. Todo SLA conta as 24 horas do dia, e conversa que chega de madrugada já nasce atrasada.',
      cartoes: horarios.map((h) => ({
        id: h.id,
        campos: [
          { rotulo: 'Horário', valor: h.nome },
          { rotulo: 'Fuso', valor: h.fuso },
          {
            rotulo: 'Agora',
            valor: h.abertoAgora
              ? 'Aberto'
              : h.proximaAberturaEm
                ? `Fechado · abre ${dataHora(h.proximaAberturaEm, h.fuso)}`
                : 'Fechado · sem abertura prevista',
          },
          { rotulo: 'Próximos 7 dias', valor: duracaoLonga(h.seteDiasSeg), classe: 'num' },
          { rotulo: 'Faixas', valor: numero(h.faixas.length), classe: 'num' },
          { rotulo: 'Exceções', valor: numero(h.excecoes.length), classe: 'num' },
          {
            rotulo: 'Filas que usam',
            valor: h.filas.length > 0 ? h.filas.join(', ') : 'Nenhuma',
          },
        ],
        // A situação do cartão é o USO, não um interruptor: horário sem fila
        // nenhuma não é erro de dado, é trabalho pela metade — cadastrado e
        // nunca ligado. Sai em etiqueta de alerta, que é o que a lista já sabe
        // fazer com `ativa: false`.
        situacao:
          h.filas.length > 0
            ? `Em uso por ${numero(h.filas.length)} fila(s)`
            : 'Nenhuma fila usa este horário',
        ativa: h.filas.length > 0,
        rodape: [
          ...h.faixas.map(
            (f) => `${DIAS_DA_SEMANA[f.diaSemana] ?? String(f.diaSemana)} ${f.inicio}–${f.fim}`,
          ),
          ...h.excecoes.map(
            (e) =>
              `${e.data} · ${e.fechado ? 'fechado' : `${e.inicio}–${e.fim}`}${e.motivo ? ` · ${e.motivo}` : ''}`,
          ),
        ],
        procura: `${h.nome} ${h.fuso} ${h.filas.join(' ')}`.toLowerCase(),
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

      {semFila.length > 0 ? (
        <div className="note">
          Cadastrados e sem fila nenhuma apontando para eles:{' '}
          {semFila.map((h) => h.nome).join(', ')}. Ligue-os em Filas de atendimento, ou eles não
          mudam o SLA de conversa nenhuma.
        </div>
      ) : null}

      {filasSemHorario.length > 0 ? (
        <div className="note">
          Filas ativas sem horário, com o relógio de SLA correndo 24×7: {filasSemHorario.join(', ')}
          .
        </div>
      ) : null}

      <ListaRegras secoes={secoes} placeholder="Buscar por horário, fuso ou fila" />
    </>
  );
}
