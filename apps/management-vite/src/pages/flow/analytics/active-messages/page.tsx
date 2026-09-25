import { useSearchParams } from 'react-router-dom';
import {
  PERIODOS_DE_CALENDARIO,
  PERIODOS_FIXOS,
  ROTULO_OF_PERIOD,
  type ActiveMessagesData,
  type Intervalo,
  type Period,
} from '@pipe/core/analytics';
import { IconePortal } from '../../../../components/icones-portal';
import { useRead } from '../../../../lib/query';
import { useContact } from '../../contact';
import { Filter } from './filter';
import { ActiveMessagesMiolo } from './miolo';
import './active-messages.css';

/**
 * Análise › Mensagens ativas — o `<analytics-mfe page="activeMessages">` da
 * origem, que o `portal-fragment-analytics` resolve para o `Lx`
 * (analytics-main.js 56300) quando `is-displaying-analytics-active-messages-tab`
 * está ligada (está, para o roteador da captura).
 *
 * Lá o `Lx` guarda período e template em estado e pede quatro comandos
 * (`/active-messages/status`, `reply-hour`, `failed-count` e `template-names`)
 * a cada "Aplicar"/"Atualizar". Aqui o estado mora na URL (`?periodo`, `?de`,
 * `?ate`, `?template`) e a `api` resolve o período no fuso da conta.
 */
interface ActiveMessagesResposta {
  period: Period;
  intervalo: Intervalo;
  hoje: string;
  /** O `startDateLimit` do `bds-datepicker`: 186 dias atrás. */
  limite: string;
  template: string | null;
  data: ActiveMessagesData;
}

export function ActiveMessagesPage() {
  const { contact } = useContact();
  const [search] = useSearchParams();
  const q = new URLSearchParams();
  for (const key of ['periodo', 'de', 'ate', 'template']) {
    const v = search.get(key);
    if (v) q.set(key, v);
  }
  const read = useRead<ActiveMessagesResposta>(
    `/v1/management/flows/${contact.id}/analytics/messages-active?${q.toString()}`,
  );
  if (!read.data) return null;
  const { period, intervalo, hoje, limite, template, data } = read.data;

  return (
    <div className="ma-tela">
      <div className="ma-topo">
        {/* `Ix` › `jx` › `Ax` (título) e `Zx` (o "Atualizar" secundário com
            `refresh`). Atualizar reenvia o filtro como está — é o `te()` → `K()`. */}
        <div className="ma-cabeca">
          <h1 className="ma-titulo">Mensagens ativas</h1>
          <div className="ma-acoes">
            <button type="submit" form="ma-filtro" className="ma-botao ma-botao-secundario">
              <IconePortal nome="atualizar" tamanho={24} />
              Atualizar
            </button>
          </div>
        </div>
        <div className="ma-filtro-faixa">
          <Filter
            fileiras={[PERIODOS_FIXOS, PERIODOS_DE_CALENDARIO].map((f) =>
              f.map((key) => ({ key, rotulo: ROTULO_OF_PERIOD[key] })),
            )}
            period={period}
            de={period === 'custom' ? intervalo.inicio : ''}
            ate={period === 'custom' ? intervalo.fim : ''}
            template={template ?? ''}
            templates={data.templates}
            hoje={hoje}
            limite={limite}
          />
        </div>
      </div>
      <ActiveMessagesMiolo data={data} intervalo={intervalo} />
    </div>
  );
}
