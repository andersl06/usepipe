import { useEffect, useState } from 'react';
import { api } from '../../../lib/api';
import { useRead } from '../../../lib/query';
import { filterStorageKey, loadFilters, saveFilters } from '../../../lib/filter-memory';
import { useEu } from '../../../context/session';
import { ModuloShell, useContact } from '../contact';
import { TelaDoLog, type LogFilterValues } from './tela';
import '../integrations/header-of-page.css';
import './log.css';

/** Shape guard for the stored filter (D-30): any string field missing drops the whole value. */
function validateLogFilters(value: unknown): LogFilterValues | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  const fields = ['busca', 'de', 'ate', 'direcao', 'tipo'] as const;
  if (fields.some((f) => typeof v[f] !== 'string')) return null;
  return {
    busca: v.busca as string,
    de: v.de as string,
    ate: v.ate as string,
    direcao: v.direcao as string,
    tipo: v.tipo as string,
  };
}

const FILTROS_VAZIOS: LogFilterValues = { busca: '', de: '', ate: '', direcao: '', tipo: '' };

/**
 * Growth › Log — the source's `auth.application.detail.growth.messages.log` (module 4842 template in portal.js, `MessagesController` controller).
 *
 * The source only had text search (`MessageService.getMessages(application, { take: 30, contentFilter: search })`). This screen closes what the task asked for beyond that: filter by period, direction and type, and cursor pagination instead of "the last 30" — `GET /v1/gestao/fluxos/:id/analise/log` (`controladores/gestao-analise.ts`, same page format as `GET /v1/conversas/:id/mensagens`).
 */
interface LinhaDoLog {
  id: string;
  criadaEm: string;
  direction: string;
  tipo: string;
  conteudo: string | null;
  metadata: unknown;
  de: string | null;
  para: string | null;
}

interface LogPage {
  data: LinhaDoLog[];
  page_info: { has_next_page: boolean; end_cursor: string | null };
}

export function PageLog() {
  const { contact } = useContact();
  const eu = useEu();
  const filtrosKey = filterStorageKey('management', 'log', eu.tenant.id, eu.user.id);
  const [filtros, setFiltros] = useState<LogFilterValues>(
    () => loadFilters(filtrosKey, validateLogFilters) ?? FILTROS_VAZIOS,
  );
  useEffect(() => {
    saveFilters(filtrosKey, filtros);
  }, [filtrosKey, filtros]);

  const search = filtros.busca;
  const de = filtros.de;
  const ate = filtros.ate;
  const direction = filtros.direcao;
  const tipo = filtros.tipo;

  const queryBase = new URLSearchParams();
  if (search) queryBase.set('busca', search);
  if (de) queryBase.set('de', de);
  if (ate) queryBase.set('ate', ate);
  if (direction) queryBase.set('direcao', direction);
  if (tipo) queryBase.set('tipo', tipo);
  const filterKey = queryBase.toString();

  const firstPage = useRead<LogPage>(
    `/v1/management/flows/${contact.id}/analytics/log?${filterKey}`,
    { staleTime: 0 },
  );

  // The first page comes from the read cache (react-query); the rest are
  // fetched by hand and only stack on top of it — changing the filter resets it.
  const [extras, setExtras] = useState<LinhaDoLog[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [temMais, setTemMais] = useState(false);
  const [carregandoMais, setCarregandoMais] = useState(false);

  useEffect(() => {
    setExtras([]);
  }, [filterKey]);

  useEffect(() => {
    if (!firstPage.data) return;
    setCursor(firstPage.data.page_info.end_cursor);
    setTemMais(firstPage.data.page_info.has_next_page);
  }, [firstPage.data]);

  async function carregarMais() {
    if (!cursor || carregandoMais) return;
    setCarregandoMais(true);
    try {
      const q = new URLSearchParams(queryBase);
      q.set('cursor', cursor);
      const page = await api.get<LogPage>(
        `/v1/management/flows/${contact.id}/analytics/log?${q.toString()}`,
      );
      setExtras((current) => [...current, ...page.data]);
      setCursor(page.page_info.end_cursor);
      setTemMais(page.page_info.has_next_page);
    } finally {
      setCarregandoMais(false);
    }
  }

  const logs = [...(firstPage.data?.data ?? []), ...extras];

  return (
    <ModuloShell ativo="Log">
      <TelaDoLog
        search={search}
        de={de}
        ate={ate}
        direction={direction}
        tipo={tipo}
        temMais={temMais}
        carregandoMais={carregandoMais}
        aoCarregarMais={carregarMais}
        aoAplicarFiltro={setFiltros}
        messages={logs.map((log) => ({
          id: log.id,
          /* `{{message.storageDate | date: 'yyyy-MM-dd HH:mm:ss'}}` */
          data: new Date(log.criadaEm).toLocaleString('sv-SE'),
          de: log.de ?? '',
          para: log.para ?? '',
          tipo: log.tipo,
          conteudo: log.conteudo ?? '',
          /* `formatMessages`: `JSON.stringify(e.metadata, void 0, 2)` */
          metadata: log.metadata ? JSON.stringify(log.metadata, undefined, 2) : null,
        }))}
      />
    </ModuloShell>
  );
}
