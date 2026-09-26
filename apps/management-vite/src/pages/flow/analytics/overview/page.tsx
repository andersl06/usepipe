import { useEffect, useState } from 'react';
import type { VisaoGeral as DadosDaVisaoGeral } from '@pipe/core/analytics';
import { useRead } from '../../../../lib/query';
import { filterStorageKey, loadFilters, saveFilters } from '../../../../lib/filter-memory';
import { useEu } from '../../../../context/session';
import { useContact } from '../../contact';
import { VisaoGeral } from './visao-geral';
import './visao-geral.css';

/**
 * `auth.application.detail.analytics.overview` — o painel `#overviewContent`.
 *
 * Período padrão: `getDate()` com a flag de um dia desligada chama
 * `U4(7)`, que é `moment().subtract(7, 'days')` até `moment()`. A conta é da
 * `api`, no fuso da conta.
 *
 * De/Até (D-30, `std/nav-contract.md` §Gestão): React state, lembrado por
 * conta/usuário em `localStorage`; sem valor guardado, a API decide o
 * padrão (não manda `de`/`ate`).
 */
interface RespostaDaVisaoGeral {
  data: DadosDaVisaoGeral;
  de: string;
  ate: string;
}

interface OverviewPeriod {
  de: string;
  ate: string;
}

const DIA = /^\d{4}-\d{2}-\d{2}$/;
const PERIODO_PADRAO: OverviewPeriod = { de: '', ate: '' };

function validateOverviewPeriod(value: unknown): OverviewPeriod | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  if (typeof v.de !== 'string' || typeof v.ate !== 'string') return null;
  if (v.de === '' && v.ate === '') return PERIODO_PADRAO;
  if (DIA.test(v.de) && DIA.test(v.ate) && v.de <= v.ate) return { de: v.de, ate: v.ate };
  return null;
}

export function OverviewPage() {
  const { contact } = useContact();
  const eu = useEu();
  const filtrosKey = filterStorageKey('management', 'analytics-overview', eu.tenant.id, eu.user.id);
  const [periodo, setPeriodo] = useState<OverviewPeriod>(
    () => loadFilters(filtrosKey, validateOverviewPeriod) ?? PERIODO_PADRAO,
  );
  useEffect(() => {
    saveFilters(filtrosKey, periodo);
  }, [filtrosKey, periodo]);

  const q = new URLSearchParams();
  if (periodo.de) q.set('de', periodo.de);
  if (periodo.ate) q.set('ate', periodo.ate);
  const read = useRead<RespostaDaVisaoGeral>(
    `/v1/management/flows/${contact.id}/analytics/view-overview?${q.toString()}`,
  );
  if (!read.data) return null;
  const { data, de, ate } = read.data;
  return (
    <VisaoGeral data={data} de={de} ate={ate} aoAplicarPeriodo={(de, ate) => setPeriodo({ de, ate })} />
  );
}
