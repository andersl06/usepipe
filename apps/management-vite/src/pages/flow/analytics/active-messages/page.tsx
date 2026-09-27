import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  PERIODOS_DE_CALENDARIO,
  PERIODOS_FIXOS,
  LABEL_OF_PERIOD,
  type ActiveMessagesData,
  type Intervalo,
  type Period,
} from '@pipe/core/analytics';
import { IconePortal } from '../../../../components/icones-portal';
import { useRead } from '../../../../lib/query';
import { filterStorageKey, loadFilters, saveFilters } from '../../../../lib/filter-memory';
import { useEu } from '../../../../context/session';
import { useContact } from '../../contact';
import { Filter } from './filter';
import { ActiveMessagesCore } from './miolo';
import './active-messages.css';

/**
 * Análise › Mensagens ativas — o `<analytics-mfe page="activeMessages">` da
 * origem, que o `portal-fragment-analytics` resolve para o `Lx`
 * (analytics-main.js 56300) quando `is-displaying-analytics-active-messages-tab`
 * está ligada (está, para o roteador da captura).
 *
 * Lá o `Lx` guarda período e template em estado e pede quatro comandos
 * (`/active-messages/status`, `reply-hour`, `failed-count` e `template-names`)
 * a cada "Aplicar"/"Atualizar". Período (D-30, `std/nav-contract.md`
 * §Gestão) mora em React state, lembrado por conta/usuário em
 * `localStorage`; `template` continua na URL (NEEDS VALIDATION, fora do
 * D-30) e a `api` resolve o período no fuso da conta.
 */
interface ActiveMessagesResponse {
  period: Period;
  intervalo: Intervalo;
  hoje: string;
  /** O `startDateLimit` do `bds-datepicker`: 186 dias atrás. */
  limite: string;
  template: string | null;
  data: ActiveMessagesData;
}

interface ActiveMessagesPeriodFilter {
  periodo: string;
  de: string;
  ate: string;
}

const PERIODO_PADRAO: ActiveMessagesPeriodFilter = { periodo: '', de: '', ate: '' };

function validateActiveMessagesPeriod(value: unknown): ActiveMessagesPeriodFilter | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  if (typeof v.periodo !== 'string' || typeof v.de !== 'string' || typeof v.ate !== 'string') {
    return null;
  }
  return { periodo: v.periodo, de: v.de, ate: v.ate };
}

export function ActiveMessagesPage() {
  const { contact } = useContact();
  const [search, setSearch] = useSearchParams();
  const eu = useEu();
  const filtrosKey = filterStorageKey(
    'management',
    'analytics-active-messages',
    eu.tenant.id,
    eu.user.id,
  );
  const [periodo, setPeriodo] = useState<ActiveMessagesPeriodFilter>(
    () => loadFilters(filtrosKey, validateActiveMessagesPeriod) ?? PERIODO_PADRAO,
  );
  useEffect(() => {
    saveFilters(filtrosKey, periodo);
  }, [filtrosKey, periodo]);

  const q = new URLSearchParams();
  if (periodo.periodo) q.set('periodo', periodo.periodo);
  if (periodo.de) q.set('from', periodo.de);
  if (periodo.ate) q.set('to', periodo.ate);
  const templateFiltro = search.get('template');
  if (templateFiltro) q.set('template', templateFiltro);
  const read = useRead<ActiveMessagesResponse>(
    `/v1/management/flows/${contact.id}/analytics/messages-active?${q.toString()}`,
  );
  if (!read.data) return null;
  const { period, intervalo, hoje, limite, template, data } = read.data;

  return (
    <div className="ma-tela">
      <div className="ma-topo">
        {/*
 * `Ix` › `jx` › `Ax` (title) and `Zx` (the secondary "Atualizar" button with `refresh`). Atualizar resubmits the filter as-is — that's `te()` → `K()`.
 */}
        <div className="ma-cabeca">
          <h1 className="ma-titulo">Mensagens ativas</h1>
          <div className="ma-actions">
            <button type="submit" form="ma-filtro" className="ma-botao ma-botao-secundario">
              <IconePortal nome="atualizar" tamanho={24} />
              Atualizar
            </button>
          </div>
        </div>
        <div className="ma-filter-strip">
          <Filter
            fileiras={[PERIODOS_FIXOS, PERIODOS_DE_CALENDARIO].map((f) =>
              f.map((key) => ({ key, rotulo: LABEL_OF_PERIOD[key] })),
            )}
            period={period}
            de={period === 'custom' ? intervalo.inicio : ''}
            ate={period === 'custom' ? intervalo.fim : ''}
            template={template ?? ''}
            templates={data.templates}
            hoje={hoje}
            limite={limite}
            aoAplicar={(filtros) => {
              setPeriodo({ periodo: filtros.periodo, de: filtros.de, ate: filtros.ate });
              const proximos = new URLSearchParams(search);
              if (filtros.template) proximos.set('template', filtros.template);
              else proximos.delete('template');
              setSearch(proximos);
            }}
          />
        </div>
      </div>
      <ActiveMessagesCore data={data} intervalo={intervalo} />
    </div>
  );
}
