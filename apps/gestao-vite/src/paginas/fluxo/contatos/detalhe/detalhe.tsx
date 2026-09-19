import Link from '../../../../componentes/link';
import { useParams, useSearchParams } from 'react-router-dom';
import { IconePortal } from '../../../../componentes/icones-portal';
import { ErroDaApi } from '../../../../lib/api';
import { useLeitura } from '../../../../lib/consulta';
import type { DetalheDoContato } from '@pipe/contracts';
import { NaoEncontrado } from '../../../nao-encontrado';
import { baseDoContato, useContato } from '../../contato';
import {
  carimboDaMensagem,
  diaEHora,
  ladoDaMensagem,
  rotuloDoStatus,
  ticketAtivo,
} from '../regras';
import { InformacoesContato } from './editar';

/* Estrutura do template `details-container` da origem (portal.js, estado
   `auth.application.detail.users.user`): `.history-header` (voltar, avatar 56,
   nome fs-24, recarregar, `.separator`), `.tickets-list-view` com o cartão
   `.user-info-card` (40%) e `.tickets-history` (60%, `expandable-list`), e o
   painel fixo `#user-detail-sidebar` (445px) com `.thread-header` e `.messages`. */
export function DetalheContatoDoBot() {
  const { contato: bot } = useContato();
  const id = bot.id;
  const base = baseDoContato(bot.tipo, id);
  const { contatoId = '' } = useParams();
  const [parametros] = useSearchParams();
  const ticketId = parametros.get('ticketId') ?? undefined;
  const leitura = useLeitura<DetalheDoContato>(
    `/v1/gestao/fluxos/${id}/contatos/${contatoId}${ticketId ? `?ticketId=${encodeURIComponent(ticketId)}` : ''}`,
  );
  if (leitura.error instanceof ErroDaApi && leitura.error.status === 404) return <NaoEncontrado />;
  if (!leitura.data) return null;
  const dados = leitura.data;
  const nome = dados.pessoa.nome ?? '-';
  const ativo = ticketAtivo(dados.conversas, ticketId);
  const historico = [...dados.historico].reverse();
  return (
    <div className="ct-detalhes">
      <div className="ct-detalhes-conteudo">
        <header className="ct-historico-cabeca">
          <div className="ct-nome-container">
            <Link className="ct-voltar" href={`${base}/contatos`} aria-label="Voltar">
              <IconePortal nome="esquerda" tamanho={32} />
            </Link>
            <span className="ct-avatar ct-avatar-detalhe">
              {dados.pessoa.avatarUrl ? (
                <img src={dados.pessoa.avatarUrl} alt="" width={56} height={56} />
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
          <InformacoesContato
            contatoId={dados.pessoa.id}
            nome={dados.pessoa.nome}
            email={dados.pessoa.email}
            telefone={dados.pessoa.telefone}
            documento={dados.pessoa.documento}
            identidade={dados.identidade}
            atributos={(dados.pessoa.atributos ?? {}) as Record<string, unknown>}
          />
          <section className="ct-tickets">
            <span className="ct-tickets-titulo">Tickets</span>
            {dados.conversas.length > 0 ? (
              <div className="ct-expansivel">
                {dados.conversas.map((ticket, indice) => {
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
                              href={`${base}/contatos/${contatoId}?ticketId=${ticket.id}`}
                              title="Ver conversa"
                              aria-label="Ver conversa"
                            >
                              <IconePortal nome="conversa" tamanho={24} />
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
                          <span>{ticket.atendente ?? '-'}</span>
                        </li>
                        <li>
                          <span>Email do atendente</span>
                          <span>{ticket.atendenteEmail ?? '-'}</span>
                        </li>
                        <li>
                          <span>Fila</span>
                          <span>{ticket.fila ?? '-'}</span>
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
                              ({carimboDaMensagem(new Date(ticket.encerradaEm ?? ticket.criadaEm))})
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
          {historico.map((mensagem) => {
            const lado = ladoDaMensagem(mensagem.direcao);
            return (
              <div
                className={`ct-mensagem ct-mensagem--${lado}`}
                key={`${mensagem.id}-${mensagem.criadaEm}`}
              >
                {lado === 'esquerda' ? (
                  <span className="ct-mensagem-foto">
                    <IconePortal nome="robo" tamanho={16} />
                  </span>
                ) : null}
                <div className="ct-mensagem-container">
                  <div className="ct-balao">{mensagem.texto ?? `[${mensagem.tipo}]`}</div>
                  <div className="ct-notificacao">
                    {carimboDaMensagem(new Date(mensagem.criadaEm))}
                  </div>
                </div>
              </div>
            );
          })}
          {historico.length === 0 ? (
            <div className="ct-sem-mensagens">Ainda não há histórico de conversa ):</div>
          ) : null}
        </div>
      </aside>
    </div>
  );
}
