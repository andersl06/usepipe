import { notFound } from 'next/navigation';
import { carregarLogsDoFluxo } from '../../../../lib/logs-do-fluxo';
import { UUID } from '../barra-do-contato';
import { CascaDoModulo } from '../casca-do-modulo';
import { TelaDoLog } from './tela';
import '../integracoes/cabecalho-de-pagina.css';
import './log.css';

export const dynamic = 'force-dynamic';

/**
 * Growth › Log — `auth.application.detail.growth.messages.log` da origem
 * (template do módulo 4842 em portal.js, controlador `MessagesController`).
 * A consulta é `MessageService.getMessages(application, { take: 30,
 * contentFilter: search })`; aqui é `carregarLogsDoFluxo(id, busca)`. As datas
 * saem já formatadas porque a tela é um componente de cliente.
 */
export default async function PaginaLog({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ busca?: string }>;
}) {
  const [{ id }, { busca = '' }] = await Promise.all([params, searchParams]);
  if (!UUID.test(id)) notFound();
  const logs = await carregarLogsDoFluxo(id, busca);
  return (
    <CascaDoModulo id={id} ativo="Log">
      <TelaDoLog
        busca={busca}
        mensagens={logs.map((log) => ({
          id: log.id,
          /* `{{message.storageDate | date: 'yyyy-MM-dd HH:mm:ss'}}` */
          data: log.criadaEm.toLocaleString('sv-SE'),
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
