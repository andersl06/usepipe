import { useRead } from '../../lib/query';
import {
  ROTULO_ALVO,
  LABEL_SCOPE,
  type QueueConfigured,
  type RegraSlaConfigurada,
} from '../../lib/settings';
import { duration, numero } from '../../lib/format';
import { ListaRegras, type RulesSection } from '../../components/lista-regras';

/**
 * Rules: what decides each queue's SLA and capacity. It's the answer to the question the monitoring screen's SLA column used to raise without answering: "breached what, against which deadline?". There used to be two tables. They became two card lists, which is what Blip does on the Rules, SLA and Hours screens — measured in `referencias-blip/pesquisa/blip-telas-atendimento.md` §5.3 through §5.5. The screen's order is theirs: title, search alone on its own line, list. Read-only for now — see the comment in `lib/configuracoes.ts` and the divergence logged in §6 of the research.
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
        const scope = `${LABEL_SCOPE[r.scopeType] ?? r.scopeType}${r.scopeName ? ` · ${r.scopeName}` : ''}`;
        return {
          id: r.id,
          campos: [
            { rotulo: 'Regra', value: r.name },
            { rotulo: 'Alvo', value: ROTULO_ALVO[r.target] ?? r.target },
            { rotulo: 'Prazo', value: duration(r.deadlineSeg), classe: 'num' },
            {
              rotulo: 'Alerta',
              value: r.alertSeg === null ? '—' : duration(r.alertSeg),
              classe: 'num',
            },
            { rotulo: 'Escopo', value: scope },
          ],
          situation: r.ativa ? 'Ativa' : 'Desativada',
          active: r.ativa,
          procura: `${r.name} ${ROTULO_ALVO[r.target] ?? r.target} ${scope}`.toLowerCase(),
        };
      }),
    },
    {
      titulo: 'Filas',
      empty: 'Nenhuma fila cadastrada.',
      cards: queues.map((f) => ({
        id: f.id,
        campos: [
          { rotulo: 'Fila', value: f.name },
          { rotulo: 'Capacidade padrão', value: numero(f.capacityDefault), classe: 'num' },
          { rotulo: 'Ordem', value: numero(f.order), classe: 'num' },
          {
            rotulo: 'Horário de atendimento',
            value: f.temHorario ? 'Definido' : 'Sem horário, o relógio corre sempre',
          },
        ],
        situation: f.ativa ? 'Ativa' : 'Desativada',
        active: f.ativa,
        procura: f.name.toLowerCase(),
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
