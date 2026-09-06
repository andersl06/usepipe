import { PESO_AGUARDANDO_ATENDENTE, PESO_AGUARDANDO_CLIENTE } from '@pipe/core';
import { carregarFilas } from '../../../lib/cadastros';
import { numero } from '../../../lib/formato';
import { ListaRegras, type SecaoDeRegras } from '../../../componentes/lista-regras';
import { FormularioFila } from './formulario';
import { corDaFila, rotuloDaCor } from './cores';

export const dynamic = 'force-dynamic';

/**
 * Filas de atendimento.
 *
 * A tela existe porque `capacidade_padrao` era um número mágico: aparecia na
 * tela de Regras sem dizer o que decide. Ele é o `limiteSimultaneo` de
 * `packages/core/src/distribuicao/carga.ts` — o teto que faz `motivoInelegivel`
 * devolver `sem_vaga` e a conversa ficar na fila. Por isso o cartão de cima
 * explica o campo em vez de só pedi-lo.
 *
 * Os dois pesos vêm do core, não de texto escrito à mão aqui: se a régua de
 * carga mudar lá, a frase desta tela muda junto.
 */
export default async function PaginaFilas() {
  const { filas, horarios } = await carregarFilas();

  const secoes: SecaoDeRegras[] = [
    {
      titulo: 'Filas',
      vazio: 'Nenhuma fila cadastrada. Toda conversa que chega fica sem fila e sem distribuição.',
      cartoes: filas.map((f) => {
        const teto = f.atendentes.reduce((total, a) => total + a.capacidade, 0);
        return {
          id: f.id,
          cor: corDaFila(f.cor),
          campos: [
            { rotulo: 'Fila', valor: f.nome },
            { rotulo: 'Cor', valor: rotuloDaCor(f.cor) },
            { rotulo: 'Capacidade padrão', valor: numero(f.capacidadePadrao), classe: 'num' },
            { rotulo: 'Ordem', valor: numero(f.ordem), classe: 'num' },
            {
              rotulo: 'Horário',
              valor: f.horarioNome ?? 'Sem horário, o relógio corre sempre',
            },
            { rotulo: 'Atendentes', valor: numero(f.atendentes.length), classe: 'num' },
            { rotulo: 'Teto simultâneo', valor: numero(teto), classe: 'num' },
          ],
          situacao: f.ativa ? 'Ativa' : 'Desativada',
          ativa: f.ativa,
          rodape:
            f.atendentes.length > 0
              ? f.atendentes.map(
                  (a) => `${a.nome} · ${a.capacidade}${a.temOverride ? ' próprio' : ''}`,
                )
              : ['Nenhum atendente habilitado — a distribuição não tem a quem entregar'],
          procura:
            `${f.nome} ${f.horarioNome ?? ''} ${f.atendentes.map((a) => a.nome).join(' ')}`.toLowerCase(),
        };
      }),
    },
  ];

  const semAtendente = filas.filter((f) => f.ativa && f.atendentes.length === 0).length;

  return (
    <>
      <div className="board-head">
        <h2>Filas de atendimento</h2>
        <span className="sub">
          {numero(filas.length)} filas. A capacidade de cada uma é o teto que a distribuição
          respeita antes de deixar a conversa esperando.
        </span>
      </div>

      <section className="card">
        <h3>O que a capacidade decide</h3>
        <p className="sub">
          A <b>capacidade padrão</b> é quantas conversas simultâneas um atendente desta fila
          aguenta. A distribuição só entrega conversa a quem está na fila, está <b>online</b> e
          ainda tem vaga — vaga é <b>capacidade menos conversas abertas</b>. Zerou a vaga, ele para
          de receber e a conversa fica na fila até alguém encerrar uma. Capacidade alta demais não
          faz o atendente render mais: faz a conversa ir para ele e ficar parada.
        </p>
        <p className="sub">
          Entre os que têm vaga, quem recebe é o de menor carga ponderada: conversa que aguarda o
          atendente pesa {numero(PESO_AGUARDANDO_ATENDENTE)} e conversa que aguarda o cliente pesa{' '}
          {numero(PESO_AGUARDANDO_CLIENTE)}. É a mesma conta da barra “Carga por atendente” do
          Monitoramento.
        </p>
        <p className="note">
          O <b>teto simultâneo</b> da lista abaixo é a soma da capacidade dos atendentes da fila —
          quantas conversas ela consegue ter em atendimento ao mesmo tempo, com todo mundo online.
          Quem tem limite próprio (definido em Operação) entra com o dele, marcado como “próprio”.
        </p>
      </section>

      <FormularioFila horarios={horarios} />

      {semAtendente > 0 ? (
        <div className="note">
          {numero(semAtendente)} fila(s) ativa(s) sem nenhum atendente habilitado. Conversa que cair
          nelas não é distribuída para ninguém.
        </div>
      ) : null}

      <ListaRegras secoes={secoes} placeholder="Buscar por fila, horário ou atendente" />
    </>
  );
}
