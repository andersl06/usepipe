import Link from '../../../../components/link';
import { useParams, useSearchParams } from 'react-router-dom';
import { IconePortal } from '../../../../components/icones-portal';
import { ApiError } from '../../../../lib/api';
import { useRead } from '../../../../lib/query';
import type { DetalheOfContact } from '@pipe/contracts';
import { NaoEncontrado } from '../../../nao-encontrado';
import { contactBase, useContact } from '../../contact';
import {
  messageCarimbo,
  diaEHora,
  messageLado,
  rotuloDoStatus,
  ticketAtivo,
} from '../regras';
import { InformationContact } from './editar';

/* Estrutura do template `details-container` da origem (portal.js, estado
   `auth.application.detail.users.user`): `.history-header` (voltar, avatar 56,
   nome fs-24, recarregar, `.separator`), `.tickets-list-view` com o cartão
   `.user-info-card` (40%) e `.tickets-history` (60%, `expandable-list`), e o
   painel fixo `#user-detail-sidebar` (445px) com `.thread-header` e `.messages`. */
export function BotDetalheContact() {
  const { contact: bot } = useContact();
  const id = bot.id;
  const base = contactBase(bot.tipo, id);
  const { contactId = '' } = useParams();
  const [parametros] = useSearchParams();
  const ticketId = parametros.get('ticketId') ?? undefined;
  const read = useRead<DetalheOfContact>(
    `/v1/management/flows/${id}/contacts/${contactId}${ticketId ? `?ticketId=${encodeURIComponent(ticketId)}` : ''}`,
  );
  if (read.error instanceof ApiError && read.error.status === 404) return <NaoEncontrado />;
  if (!read.data) return null;
  const data = read.data;
  const nome = data.pessoa.nome ?? '-';
  const ativo = ticketAtivo(data.conversations, ticketId);
  const history = [...data.history].reverse();
  return (
    <div className="ct-detalhes">
      <div className="ct-detalhes-conteudo">
        <header className="ct-historico-cabeca">
          <div className="ct-nome-container">
            <Link className="ct-voltar" href={`${base}/contatos`} aria-label="Voltar">
              <IconePortal nome="esquerda" tamanho={32} />
            </Link>
            <span className="ct-avatar ct-avatar-detalhe">
              {data.pessoa.avatarUrl ? (
                <img src={data.pessoa.avatarUrl} alt="" width={56} height={56} />
              ) : (
                <IconePortal nome="avatar" tamanho={32} />
              )}
            </span>
            <h1 className="ct-nome-usuario">{nome}</h1>
          </div>
          <form className="ct-botao-recarregar" method="get">
            <button
              className="ct-botao-icone"
              type="submit"
              title="Atualizar"
              aria-label="Atualizar"
            >
              <IconePortal nome="atualizar" tamanho={24} />
            </button>
          </form>
          <div className="ct-separador" />
        </header>
        <div className="ct-tickets-lista">
          <InformationContact
            contactId={data.pessoa.id}
            nome={data.pessoa.nome}
            email={data.pessoa.email}
            telefone={data.pessoa.telefone}
            document={data.pessoa.document}
            identity={data.identity}
            atributos={(data.pessoa.atributos ?? {}) as Record<string, unknown>}
          />
          <section className="ct-tickets">
            <span className="ct-tickets-titulo">Tickets</span>
            {data.conversations.length > 0 ? (
              <div className="ct-expansivel">
                {data.conversations.map((ticket, indice) => {
                  const { dia, hora } = diaEHora(new Date(ticket.criadaEm));
                  return (
                    <details
                      className={`ct-ticket${indice % 2 !== 0 ? ' ct-ticket--par' : ''}${ticket.id === ativo?.id ? ' ct-ticket--ativo' : ''}`}
                      key={ticket.id}
                      open={ticket.id === ativo?.id}
                    >
                      <summary className="ct-ticket-cabeca">
                        <span className="ct-ticket-seta">
                          <IconePortal nome="direita" tamanho={12} />
                        </span>
                        <span className="ct-ticket-linha">
                          <span className="ct-ticket-dados">
                            <span>{dia}</span>
                            <span>{hora}</span>
                            <span>#{ticket.id.slice(0, 8)}</span>
                          </span>
                          <span className="ct-ticket-acoes">
                            <Link
                              className="ct-botao-icone ct-botao-icone--curto"
                              href={`${base}/contatos/${contactId}?ticketId=${ticket.id}`}
                              title="Ver conversa"
                              aria-label="Ver conversa"
                            >
                              <IconePortal nome="conversation" tamanho={24} />
                            </Link>
                            {/* ponytail: exportação do histórico do ticket ainda não tem backend. */}
                            <span
                              className="ct-botao-icone ct-botao-icone--curto"
                              title="Baixar histórico"
                            >
                              <IconePortal nome="baixar" tamanho={24} />
                            </span>
                          </span>
                        </span>
                      </summary>
                      <ul className="ct-ticket-corpo">
                        <li>
                          <span>Atendente</span>
                          <span>{ticket.agent ?? '-'}</span>
                        </li>
                        <li>
                          <span>Email do atendente</span>
                          <span>{ticket.agentEmail ?? '-'}</span>
                        </li>
                        <li>
                          <span>Fila</span>
                          <span>{ticket.queue ?? '-'}</span>
                        </li>
                        <li>
                          <span>Tags</span>
                          <span>-</span>
                        </li>
                        <li>
                          <span>Tempo médio de resposta</span>
                          <span>-</span>
                        </li>
                        <li>
                          <span>Status</span>
                          <span>
                            {rotuloDoStatus(ticket.estado)}
                            <small>
                              ({messageCarimbo(new Date(ticket.encerradaEm ?? ticket.criadaEm))})
                            </small>
                          </span>
                        </li>
                      </ul>
                    </details>
                  );
                })}
              </div>
            ) : (
              <div className="ct-sem-tickets">Não há tickets abertos para este usuário</div>
            )}
          </section>
        </div>
      </div>
      <aside className="ct-historico">
        <span className="ct-historico-titulo">Histórico de Conversa</span>
        <div className="ct-mensagens">
          {history.map((message) => {
            const lado = messageLado(message.direction);
            return (
              <div
                className={`ct-mensagem ct-mensagem--${lado}`}
                key={`${message.id}-${message.criadaEm}`}
              >
                {lado === 'esquerda' ? (
                  <span className="ct-mensagem-foto">
                    <IconePortal nome="robo" tamanho={16} />
                  </span>
                ) : null}
                <div className="ct-mensagem-container">
                  <div className="ct-balao">{message.texto ?? `[${message.tipo}]`}</div>
                  <div className="ct-notificacao">
                    {messageCarimbo(new Date(message.criadaEm))}
                  </div>
                </div>
              </div>
            );
          })}
          {history.length === 0 ? (
            <div className="ct-sem-mensagens">Ainda não há histórico de conversa ):</div>
          ) : null}
        </div>
      </aside>
    </div>
  );
}
