import { useSearchParams } from 'react-router-dom';
import { useLeitura } from '../../../lib/consulta';
import { CascaDoModulo, useContato } from '../contato';
import { TelaDoLog } from './tela';
import '../integracoes/cabecalho-de-pagina.css';
import './log.css';

/**
 * Growth › Log — `auth.application.detail.growth.messages.log` da origem
 * (template do módulo 4842 em portal.js, controlador `MessagesController`).
 * A consulta é `MessageService.getMessages(application, { take: 30,
 * contentFilter: search })`; aqui é `carregarLogsDoFluxo(id, busca)`. As datas
 * saem já formatadas porque a tela é um componente de cliente.
 */
interface LogLido {
  id: string;
  criadaEm: string;
  tipo: string;
  conteudo: string | null;
  metadata: unknown;
  de: string | null;
  para: string | null;
}

export function PaginaLog() {
  const { contato } = useContato();
  const [parametros] = useSearchParams();
  const busca = parametros.get('busca') ?? '';
  const leitura = useLeitura<LogLido[]>(
    `/v1/gestao/fluxos/${contato.id}/logs?busca=${encodeURIComponent(busca)}`,
    { staleTime: 0 },
  );
  const logs = leitura.data ?? [];
  return (
    <CascaDoModulo ativo="Log">
      <TelaDoLog
        busca={busca}
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
