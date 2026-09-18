import { useSearchParams } from 'react-router-dom';
import type { ArestaDaJornada } from '@pipe/core/analise';
import { useLeitura } from '../../../../lib/consulta';
import { useContato } from '../../contato';
import { JornadaDosContatos } from './jornada';
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
  roteador: boolean;
}

export function PaginaDaJornada() {
  const { contato } = useContato();
  const [busca] = useSearchParams();
  const q = new URLSearchParams();
  for (const chave of ['de', 'ate']) {
    const v = busca.get(chave);
    if (v) q.set(chave, v);
  }
  const leitura = useLeitura<RespostaDaJornada>(
    `/v1/gestao/fluxos/${contato.id}/analise/jornada?${q.toString()}`,
  );
  if (!leitura.data) return null;
  const { arestas, de, ate, min, max, roteador } = leitura.data;
  return (
    <JornadaDosContatos
      arestas={arestas}
      de={de}
      ate={ate}
      min={min}
      max={max}
      roteador={roteador}
    />
  );
}
