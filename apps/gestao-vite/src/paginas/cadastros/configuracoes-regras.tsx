import { useRead } from '../../lib/consulta';
import {
  ROTULO_ALVO,
  ROTULO_SCOPE,
  type QueueConfigured,
  type RegraSlaConfigurada,
} from '../../lib/configuracoes';
import { duration, numero } from '../../lib/formato';
import { ListaRegras, type RulesSection } from '../../componentes/lista-regras';

/**
 * Regras: o que decide o SLA e a capacidade de cada fila.
 *
 * É a resposta para a pergunta que a coluna SLA do monitoramento levantava e
 * não respondia: "estourou o quê, contra qual prazo?".
 *
 * Eram duas tabelas. Viraram duas listas de cartões, que é o que a Blip faz
 * nas telas de Regras, SLA e Horários — medido em
 * `referencias-blip/pesquisa/blip-telas-atendimento.md` §5.3 a §5.5. A ordem da tela é a
 * deles: título, busca sozinha na linha, lista.
 *
 * Somente leitura por enquanto — ver o comentário de `lib/configuracoes.ts` e a
 * divergência registrada no §6 da pesquisa.
 */
export function PageRules() {
  const read = useRead<{ queues: QueueConfigured[]; regras: RegraSlaConfigurada[] }>(
    '/v1/management/settings/rules',
  );
  if (!read.data) return null;
  const { queues, regras } = read.data;

  const sections: RulesSection[] = [
    {
      titulo: 'Regras de SLA',
      empty: 'Nenhuma regra de SLA cadastrada. Toda conversa aparece como “Sem regra”.',
      cards: regras.map((r) => {
        const scope = `${ROTULO_SCOPE[r.scopeType] ?? r.scopeType}${r.scopeName ? ` · ${r.scopeName}` : ''}`;
        return {
          id: r.id,
          campos: [
            { rotulo: 'Regra', valor: r.nome },
            { rotulo: 'Alvo', valor: ROTULO_ALVO[r.alvo] ?? r.alvo },
            { rotulo: 'Prazo', valor: duration(r.prazoSeg), classe: 'num' },
            {
              rotulo: 'Alerta',
              valor: r.alertaSeg === null ? '—' : duration(r.alertaSeg),
              classe: 'num',
            },
            { rotulo: 'Escopo', valor: scope },
          ],
          situacao: r.active ? 'Ativa' : 'Desativada',
          ativa: r.active,
          procura: `${r.nome} ${ROTULO_ALVO[r.alvo] ?? r.alvo} ${scope}`.toLowerCase(),
        };
      }),
    },
    {
      titulo: 'Filas',
      empty: 'Nenhuma fila cadastrada.',
      cards: queues.map((f) => ({
        id: f.id,
        campos: [
          { rotulo: 'Fila', valor: f.nome },
          { rotulo: 'Capacidade padrão', valor: numero(f.capacityDefault), classe: 'num' },
          { rotulo: 'Ordem', valor: numero(f.order), classe: 'num' },
          {
            rotulo: 'Horário de atendimento',
            valor: f.temHorario ? 'Definido' : 'Sem horário, o relógio corre sempre',
          },
        ],
        situacao: f.active ? 'Ativa' : 'Desativada',
        ativa: f.active,
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

      <ListaRegras sections={sections} />
    </>
  );
}
