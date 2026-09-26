import { useEffect, useState } from 'react';
import type { ArestaDaJornada } from '@pipe/core/analytics';
import { useRead } from '../../../../lib/query';
import { filterStorageKey, loadFilters, saveFilters } from '../../../../lib/filter-memory';
import { useEu } from '../../../../context/session';
import { useContact } from '../../contact';
import { ContactsJourney } from './jornada';
import './jornada.css';

/**
 * `auth.application.detail.analytics.contactsJourney` — o painel
 * `#contactsJourneyContent`.
 *
 * Período: `initAndApplyFilter()` passa ao `UT` `defaultStartFromToday: -1`,
 * `defaultEndFromToday: 0`, `validStartFromToday: -30`, `validEndFromToday: 1`
 * — de ontem a hoje, dentro dos últimos 30 dias. A conta é feita na `api`, no
 * fuso da conta; a resposta traz o período que valeu.
 *
 * De/Até (D-30, `std/nav-contract.md` §Gestão): React state, lembrado por
 * conta/usuário em `localStorage`; sem valor guardado, a API decide o
 * padrão (não manda `de`/`ate`).
 */
interface RespostaDaJornada {
  arestas: ArestaDaJornada[];
  de: string;
  ate: string;
  min: string;
  max: string;
  router: boolean;
}

interface JourneyPeriod {
  de: string;
  ate: string;
}

const DIA = /^\d{4}-\d{2}-\d{2}$/;
const PERIODO_PADRAO: JourneyPeriod = { de: '', ate: '' };

function validateJourneyPeriod(value: unknown): JourneyPeriod | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  if (typeof v.de !== 'string' || typeof v.ate !== 'string') return null;
  if (v.de === '' && v.ate === '') return PERIODO_PADRAO;
  if (DIA.test(v.de) && DIA.test(v.ate) && v.de <= v.ate) return { de: v.de, ate: v.ate };
  return null;
}

export function JourneyPage() {
  const { contact } = useContact();
  const eu = useEu();
  const filtrosKey = filterStorageKey('management', 'analytics-journey', eu.tenant.id, eu.user.id);
  const [periodo, setPeriodo] = useState<JourneyPeriod>(
    () => loadFilters(filtrosKey, validateJourneyPeriod) ?? PERIODO_PADRAO,
  );
  useEffect(() => {
    saveFilters(filtrosKey, periodo);
  }, [filtrosKey, periodo]);

  const q = new URLSearchParams();
  if (periodo.de) q.set('de', periodo.de);
  if (periodo.ate) q.set('ate', periodo.ate);
  const read = useRead<RespostaDaJornada>(
    `/v1/management/flows/${contact.id}/analytics/journey?${q.toString()}`,
  );
  if (!read.data) return null;
  const { arestas, de, ate, min, max, router } = read.data;
  return (
    <ContactsJourney
      arestas={arestas}
      de={de}
      ate={ate}
      min={min}
      max={max}
      router={router}
      aoAplicarPeriodo={(de, ate) => setPeriodo({ de, ate })}
    />
  );
}
