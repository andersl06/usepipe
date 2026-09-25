import { useSearchParams } from 'react-router-dom';
import type { ArestaDaJornada } from '@pipe/core/analise';
import { useRead } from '../../../../lib/consulta';
import { useContact } from '../../contato';
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
 */
interface RespostaDaJornada {
  arestas: ArestaDaJornada[];
  de: string;
  ate: string;
  min: string;
  max: string;
  router: boolean;
}

export function JourneyPage() {
  const { contact } = useContact();
  const [search] = useSearchParams();
  const q = new URLSearchParams();
  for (const key of ['de', 'ate']) {
    const v = search.get(key);
    if (v) q.set(key, v);
  }
  const read = useRead<RespostaDaJornada>(
    `/v1/gestao/fluxos/${contact.id}/analise/jornada?${q.toString()}`,
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
    />
  );
}
