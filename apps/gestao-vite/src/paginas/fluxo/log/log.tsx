import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../../../lib/api';
import { useLeitura } from '../../../lib/consulta';
import { CascaDoModulo, useContato } from '../contato';
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
  direcao: string;
  tipo: string;
  conteudo: string | null;
  metadata: unknown;
  de: string | null;
  para: string | null;
}

interface PaginaDoLog {
  data: LinhaDoLog[];
  page_info: { has_next_page: boolean; end_cursor: string | null };
}

export function PaginaLog() {
  const { contato } = useContato();
  const [parametros] = useSearchParams();
  const busca = parametros.get('busca') ?? '';
  const de = parametros.get('de') ?? '';
  const ate = parametros.get('ate') ?? '';
  const direcao = parametros.get('direcao') ?? '';
  const tipo = parametros.get('tipo') ?? '';

  const consultaBase = new URLSearchParams();
  if (busca) consultaBase.set('busca', busca);
  if (de) consultaBase.set('de', de);
  if (ate) consultaBase.set('ate', ate);
  if (direcao) consultaBase.set('direcao', direcao);
  if (tipo) consultaBase.set('tipo', tipo);
  const chaveDoFiltro = consultaBase.toString();

  const primeiraPagina = useLeitura<PaginaDoLog>(
    `/v1/gestao/fluxos/${contato.id}/analise/log?${chaveDoFiltro}`,
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
  }, [chaveDoFiltro]);

  useEffect(() => {
    if (!primeiraPagina.data) return;
    setCursor(primeiraPagina.data.page_info.end_cursor);
    setTemMais(primeiraPagina.data.page_info.has_next_page);
  }, [primeiraPagina.data]);

  async function carregarMais() {
    if (!cursor || carregandoMais) return;
    setCarregandoMais(true);
    try {
      const q = new URLSearchParams(consultaBase);
      q.set('cursor', cursor);
      const pagina = await api.get<PaginaDoLog>(
        `/v1/gestao/fluxos/${contato.id}/analise/log?${q.toString()}`,
      );
      setExtras((atuais) => [...atuais, ...pagina.data]);
      setCursor(pagina.page_info.end_cursor);
      setTemMais(pagina.page_info.has_next_page);
    } finally {
      setCarregandoMais(false);
    }
  }

  const logs = [...(primeiraPagina.data?.data ?? []), ...extras];

  return (
    <CascaDoModulo ativo="Log">
      <TelaDoLog
        busca={busca}
        de={de}
        ate={ate}
        direcao={direcao}
        tipo={tipo}
        temMais={temMais}
        carregandoMais={carregandoMais}
        aoCarregarMais={carregarMais}
        mensagens={logs.map((log) => ({
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
    </CascaDoModulo>
  );
}
