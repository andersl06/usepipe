import { carregarRegras, ROTULO_ALVO, ROTULO_ESCOPO } from '../../../lib/configuracoes';
import { duracao, numero } from '../../../lib/formato';
import { ListaRegras, type SecaoDeRegras } from '../../../componentes/lista-regras';

export const dynamic = 'force-dynamic';

/**
 * Regras: o que decide o SLA e a capacidade de cada fila.
 *
 * É a resposta para a pergunta que a coluna SLA do monitoramento levantava e
 * não respondia: "estourou o quê, contra qual prazo?".
 *
 * Eram duas tabelas. Viraram duas listas de cartões, que é o que a Blip faz
 * nas telas de Regras, SLA e Horários — medido em
 * `docs/pesquisa/blip-telas-atendimento.md` §5.3 a §5.5. A ordem da tela é a
 * deles: título, busca sozinha na linha, lista.
 *
 * Somente leitura por enquanto — ver o comentário de `lib/configuracoes.ts` e a
 * divergência registrada no §6 da pesquisa.
 */
export default async function PaginaRegras() {
  const { filas, regras } = await carregarRegras();

  const secoes: SecaoDeRegras[] = [
    {
      titulo: 'Regras de SLA',
      vazio: 'Nenhuma regra de SLA cadastrada. Toda conversa aparece como “Sem regra”.',
      cartoes: regras.map((r) => {
        const escopo = `${ROTULO_ESCOPO[r.escopoTipo] ?? r.escopoTipo}${r.escopoNome ? ` · ${r.escopoNome}` : ''}`;
        return {
          id: r.id,
          campos: [
            { rotulo: 'Regra', valor: r.nome },
            { rotulo: 'Alvo', valor: ROTULO_ALVO[r.alvo] ?? r.alvo },
            { rotulo: 'Prazo', valor: duracao(r.prazoSeg), classe: 'num' },
            {
              rotulo: 'Alerta',
              valor: r.alertaSeg === null ? '—' : duracao(r.alertaSeg),
              classe: 'num',
            },
            { rotulo: 'Escopo', valor: escopo },
          ],
          situacao: r.ativa ? 'Ativa' : 'Desativada',
          ativa: r.ativa,
          procura: `${r.nome} ${ROTULO_ALVO[r.alvo] ?? r.alvo} ${escopo}`.toLowerCase(),
        };
      }),
    },
    {
      titulo: 'Filas',
      vazio: 'Nenhuma fila cadastrada.',
      cartoes: filas.map((f) => ({
        id: f.id,
        campos: [
          { rotulo: 'Fila', valor: f.nome },
          { rotulo: 'Capacidade padrão', valor: numero(f.capacidadePadrao), classe: 'num' },
          { rotulo: 'Ordem', valor: numero(f.ordem), classe: 'num' },
          {
            rotulo: 'Horário de atendimento',
            valor: f.temHorario ? 'Definido' : 'Sem horário, o relógio corre sempre',
          },
        ],
        situacao: f.ativa ? 'Ativa' : 'Desativada',
        ativa: f.ativa,
        procura: f.nome.toLowerCase(),
      })),
    },
  ];

  return (
    <>
      <div className="board-head">
        <h2>Regras</h2>
        <span className="sub">
          O prazo que a coluna SLA do monitoramento compara, e a capacidade que a distribuição
          respeita. A regra de fila vence a da operação inteira.
        </span>
      </div>

      <ListaRegras secoes={secoes} />
    </>
  );
}
