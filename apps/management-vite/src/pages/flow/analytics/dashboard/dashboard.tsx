import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useRead } from '../../../../lib/query';
import { filterStorageKey, loadFilters, saveFilters } from '../../../../lib/filter-memory';
import { useEu } from '../../../../context/session';
import { contactPath, useContact } from '../../contact';
import type { RespostaDoDashboard } from './resposta';
import { TelaDoDashboard } from './tela';
import './dashboard.css';

/**
 * A aba Dashboard da Análise do contato — `/application/detail/{shortName}/analytics/dashboard`
 * na origem, onde o portal monta `<analytics-mfe page="dashboard">`.
 *
 * O período (D-30, `std/nav-contract.md` §Gestão) mora em React state,
 * lembrado por conta/usuário em `localStorage` — não é mais `?periodo=`.
 * `contatos=` (a barra lateral) continua na query: fora do D-30, NEEDS
 * VALIDATION na tabela por tela. Período inválido cai em "Hoje", que é o
 * inicial de lá.
 */
interface DashboardPeriodFilter {
  periodo: string;
  de: string;
  ate: string;
}

const PERIODO_PADRAO: DashboardPeriodFilter = { periodo: '', de: '', ate: '' };

function validateDashboardPeriod(value: unknown): DashboardPeriodFilter | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  if (typeof v.periodo !== 'string' || typeof v.de !== 'string' || typeof v.ate !== 'string') {
    return null;
  }
  return { periodo: v.periodo, de: v.de, ate: v.ate };
}

export function DashboardPage() {
  const { contact } = useContact();
  const [search] = useSearchParams();
  const eu = useEu();
  const filtrosKey = filterStorageKey('management', 'analytics-dashboard', eu.tenant.id, eu.user.id);
  const [periodo, setPeriodo] = useState<DashboardPeriodFilter>(
    () => loadFilters(filtrosKey, validateDashboardPeriod) ?? PERIODO_PADRAO,
  );
  useEffect(() => {
    saveFilters(filtrosKey, periodo);
  }, [filtrosKey, periodo]);

  const q = new URLSearchParams();
  if (periodo.periodo) q.set('periodo', periodo.periodo);
  if (periodo.de) q.set('from', periodo.de);
  if (periodo.ate) q.set('to', periodo.ate);
  const contatos = search.get('contatos');
  if (contatos) q.set('contatos', contatos);
  const read = useRead<RespostaDoDashboard>(
    `/v1/management/flows/${contact.id}/analytics/dashboard?${q.toString()}`,
  );
  if (!read.data) return null;
  const { period, intervalo, hoje, data, lista } = read.data;
  return (
    <TelaDoDashboard
      id={contact.id}
      base={contactPath(contact)}
      period={period}
      intervalo={intervalo}
      hoje={hoje}
      data={data}
      lista={lista}
      aoMudarPeriodo={(novoPeriodo, custom) =>
        setPeriodo({ periodo: novoPeriodo, de: custom?.de ?? '', ate: custom?.ate ?? '' })
      }
    />
  );
}
