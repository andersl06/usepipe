import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../../../lib/api';
import { useRead } from '../../../lib/consulta';
import { ModuloShell, useContact } from '../contato';
import { TelaDoLog } from './tela';
import '../integracoes/cabecalho-de-pagina.css';
import './log.css';

/**
 * Growth › Log — `auth.application.detail.growth.messages.log` da origem
 * (template do módulo 4842 em portal.js, controlador `MessagesController`).
 *
 * A origem só tinha busca por texto (`MessageService.getMessages(application,
 * { take: 30, contentFilter: search })`). Esta tela fecha o que a tarefa pediu
 * a mais: filtro por período, direção e tipo, e paginação por cursor no lugar
 * do "as últimas 30" — `GET /v1/gestao/fluxos/:id/analise/log`
 * (`controladores/gestao-analise.ts`, mesmo formato de página de
 * `GET /v1/conversas/:id/mensagens`).
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
  const [parametros] = useSearchParams();
  const search = parametros.get('busca') ?? '';
  const de = parametros.get('de') ?? '';
  const ate = parametros.get('ate') ?? '';
  const direction = parametros.get('direcao') ?? '';
  const tipo = parametros.get('tipo') ?? '';

  const queryBase = new URLSearchParams();
  if (search) queryBase.set('busca', search);
  if (de) queryBase.set('de', de);
  if (ate) queryBase.set('ate', ate);
  if (direction) queryBase.set('direcao', direction);
  if (tipo) queryBase.set('tipo', tipo);
  const filterKey = queryBase.toString();

  const firstPage = useRead<LogPage>(
    `/v1/gestao/fluxos/${contact.id}/analise/log?${filterKey}`,
    { staleTime: 0 },
  );

  // A primeira página vem do cache de leitura (react-query); as demais são
  // pedidas à mão e só se acumulam por cima dela — trocar o filtro reseta.
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
        `/v1/gestao/fluxos/${contact.id}/analise/log?${q.toString()}`,
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
