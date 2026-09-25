import { useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import type { ConversationOfHistory, TicketDoDesk } from '@pipe/contracts';
import { useRead } from '../../lib/consulta';
import { IconeDesk } from '../../componentes/icones-desk';
import { Avatar } from '../../componentes/avatar';
import { channelOf, numeroDoTicket } from '../../lib/canal';
import { dataAbreviada } from '../../lib/formato';
import { displayName } from '../../lib/ordem';
import { agruparContacts, type ListaContact, type ContactsOrder } from '../../lib/contatos';
import { Thread } from '../atendimentos/thread';

/**
 * A aba Contatos — o MFE `desk-contact-history` da referência, medido rodando
 * sobre o mock em `~/desk-clone/clone/mfe-teste.html` (fotos
 * `desk2/blip-contacts-1200.png` e `blip-contatos-aberto.png`): três colunas
 * de 300 / 600 / 300.
 *
 * Esquerda: bloco de 110px em superfície 1 ("Contatos" 20/700 num recuo de
 * 16, e a busca "Pesquisar contato" com o botão de ordenação ao lado, recuo 8),
 * e a lista agrupada por letra (ou por data) com cartões de 62px.
 * Meio: o estado vazio ("Explore conversas anteriores" / "Selecione um contato
 * na lista ao lado e escolha um ticket para acessar abrir seu histórico"), e,
 * com contato escolhido, o cartão "Inicie uma nova conversa com este contato
 * enviando uma mensagem ativa." + "Conversar novamente"; com ticket escolhido,
 * a transcrição.
 * Direita: as abas "Histórico" e "Contato" (cabeçalho de 56, centrado, gap 32).
 *
 * Os dados vêm de `GET /v1/desk/contatos?busca=`, `/contatos/:id` e
 * `/tickets/:id`. Tudo de leitura, como lá.
 */
export function PageContacts() {
  const { id } = useParams();
  const [parametros, setParametros] = useSearchParams();
  const navegar = useNavigate();
  const [search, setSearch] = useState('');
  const [order, setOrder] = useState<ContactsOrder>('alfabetica');
  const [menuOrder, setMenuOrder] = useState(false);
  const [aba, setAba] = useState<'historico' | 'contato'>('historico');
  const ticketId = parametros.get('ticket');

  const lista = useRead<{ contacts: ListaContact[] }>(
    `/v1/desk/contatos${search.trim().length >= 2 ? `?busca=${encodeURIComponent(search.trim())}` : ''}`,
  );
  const contact = useRead<{ contact: ContactFicha; history: ConversationOfHistory[] }>(
    id ? `/v1/desk/contatos/${id}` : null,
  );
  const ticket = useRead<TicketDoDesk>(ticketId ? `/v1/desk/tickets/${ticketId}` : null);
  const groups = useMemo(
    () => agruparContacts(lista.data?.contacts ?? [], order),
    [lista.data, order],
  );

  return (
    <div className="dk-contatos">
      <div className="dk-contatos-lista">
        <div className="dk-contatos-topo">
          <div className="dk-contatos-titulo">
            <h1>Contatos</h1>
          </div>
          <div className="dk-contatos-busca">
            <label className="dk-campo">
              <span className="dk-campo-icone">
                <IconeDesk nome="usuario" />
              </span>
              <input
                type="search"
                placeholder="Pesquisar contato"
                aria-label="Pesquisar contato"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </label>
            <div className="dk-ficha-menu">
              <button
                type="button"
                className="dk-botao-icone"
                title="Ordenar contatos"
                aria-label="Ordenar contatos"
                aria-expanded={menuOrder}
                onClick={() => setMenuOrder((v) => !v)}
              >
                <IconeDesk nome="ordenar" />
              </button>
              {menuOrder ? (
                <div
                  className="dk-menu dk-contatos-ordem"
                  role="menu"
                  onMouseLeave={() => setMenuOrder(false)}
                >
                  <div className="dk-contatos-ordem-titulo">Ordenar contatos</div>
                  {(
                    [
                      ['alfabetica', 'Ordem alfabética', 'lista'],
                      ['ultima-interacao', 'Última interação', 'relogio'],
                    ] as const
                  ).map(([value, rotulo, icone]) => (
                    <button
                      key={value}
                      type="button"
                      role="menuitemradio"
                      aria-checked={order === value}
                      className="dk-contatos-ordem-item"
                      onClick={() => {
                        setOrder(value);
                        setMenuOrder(false);
                      }}
                    >
                      <IconeDesk nome={icone} />
                      <span>{rotulo}</span>
                      {order === value ? <IconeDesk nome="check" /> : null}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        </div>
        <div className="dk-contatos-rolagem">
          {lista.isPending ? <div className="dk-girando dk-girando-pequeno" /> : null}
          {groups.map((g) => (
            <div key={g.rotulo}>
              <div className="dk-contatos-grupo">{g.rotulo}</div>
              <ul className="dk-contatos-itens">
                {g.contacts.map((c) => (
                  <li key={c.id}>
                    <button
                      type="button"
                      className="dk-contato"
                      aria-current={c.id === id ? 'true' : undefined}
                      onClick={() => navegar(`/contacts/${c.id}`)}
                    >
                      <span className="dk-contato-rosto">
                        <Avatar />
                      </span>
                      <span className="dk-contato-texto">
                        <b>
                          {displayName({
                            contactName: c.nome,
                            contactTelefone: c.telefone,
                            contactEmail: c.email,
                            contactId: c.id,
                          })}
                        </b>
                        <small>
                          Última interação :{' '}
                          {c.lastInteractionAt ? dataCurta(new Date(c.lastInteractionAt)) : '—'}
                        </small>
                      </span>
                      <IconeDesk nome="seta-direita" tamanho={20} />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
          {lista.data && groups.length === 0 ? (
            <div className="dk-lista-vazia">Nenhum contato encontrado</div>
          ) : null}
        </div>
      </div>

      <div className="dk-contatos-meio">
        {ticketId && ticket.data ? (
          <Thread
            conversationId={ticket.data.ticket.id}
            itens={ticket.data.itens}
            agora={new Date()}
            somenteRead
          />
        ) : (
          <div className="dk-contatos-vazio">
            <div className="dk-contatos-ilustracao" aria-hidden="true">
              <IconeDesk nome="atendimentos" />
            </div>
            <div className="dk-contatos-vazio-texto">
              <h2>Explore conversas anteriores</h2>
              <p>
                Selecione um contato na lista ao lado e escolha um ticket para acessar abrir seu
                histórico
              </p>
            </div>
          </div>
        )}
        {id && contact.data ? (
          <div className="dk-contatos-rodape">
            <div className="dk-contatos-rodape-papel">
              <p>Inicie uma nova conversa com este contato enviando uma mensagem ativa.</p>
              <button
                type="button"
                className="dk-botao"
                onClick={() => navegar(`/activeMessage/send?contato=${id}`)}
              >
                Conversar novamente
              </button>
            </div>
          </div>
        ) : null}
      </div>

      <div className="dk-contatos-direita">
        {id ? (
          <div className="dk-abas">
            <div className="dk-contatos-abas" role="tablist">
              {(
                [
                  ['historico', 'Histórico'],
                  ['contato', 'Contato'],
                ] as const
              ).map(([value, rotulo]) => (
                <button
                  key={value}
                  type="button"
                  role="tab"
                  className="dk-aba"
                  aria-selected={aba === value}
                  onClick={() => setAba(value)}
                >
                  {rotulo}
                </button>
              ))}
            </div>
            <div className="dk-painel-corpo" role="tabpanel">
              {!contact.data ? (
                <div className="dk-girando dk-girando-pequeno" />
              ) : aba === 'historico' ? (
                <section className="dk-papel" style={{ flexBasis: '100%' }}>
                  {contact.data.history.length === 0 ? (
                    <div className="dk-comentarios-vazio" style={{ minHeight: 120 }}>
                      Não há mensagens nos últimos 90 dias.
                    </div>
                  ) : (
                    contact.data.history.map((h) => (
                      <button
                        key={h.id}
                        type="button"
                        className="dk-historico-item dk-historico-botao"
                        aria-current={h.id === ticketId ? 'true' : undefined}
                        onClick={() => setParametros({ ticket: h.id })}
                      >
                        <b>Ticket {numeroDoTicket(h.id)}</b>
                        <span>{h.filaNome ?? 'Transferência direta'}</span>
                        <small>
                          {situation(h)}
                          {h.encerradaEm ? ` · ${dataAbreviada(new Date(h.encerradaEm))}` : ''}
                        </small>
                      </button>
                    ))
                  )}
                </section>
              ) : (
                <section className="dk-papel" style={{ flexBasis: '100%' }}>
                  <h3 className="dk-papel-titulo">Contato</h3>
                  <ContactField
                    rotulo="Nome"
                    value={contact.data.contact.nome}
                    empty="Nenhum nome cadastrado"
                  />
                  <ContactField
                    rotulo="Telefone"
                    value={contact.data.contact.telefone}
                    empty="Nenhum telefone cadastrado"
                  />
                  <ContactField
                    rotulo="E-mail"
                    value={contact.data.contact.email}
                    empty="Nenhum e-mail cadastrado"
                  />
                  <ContactField rotulo="ID do usuário" value={contact.data.contact.id} empty="" />
                  <ContactField
                    rotulo="Documento"
                    value={contact.data.contact.document}
                    empty="Nenhum documento cadastrado"
                  />
                  {ticket.data ? (
                    <ContactField
                      rotulo="Canal"
                      value={channelOf(ticket.data.ticket.canalTipo).nome}
                      empty=""
                    />
                  ) : null}
                  {Object.keys(contact.data.contact.atributos).length > 0 ? (
                    <>
                      <h3 className="dk-papel-titulo">Dados Extras</h3>
                      {Object.entries(contact.data.contact.atributos).map(([k, v]) => (
                        <ContactField
                          key={k}
                          rotulo={k}
                          value={v === null || v === undefined ? '' : String(v)}
                          empty=""
                        />
                      ))}
                    </>
                  ) : null}
                </section>
              )}
            </div>
          </div>
        ) : (
          <div className="dk-painel-esqueleto" aria-hidden="true">
            <div
              style={{ display: 'flex', gap: 36, justifyContent: 'center', margin: '16px 0 24px' }}
            >
              <div className="dk-esqueleto-barra" style={{ width: 65, margin: 0 }} />
              <div className="dk-esqueleto-barra" style={{ width: 65, margin: 0 }} />
            </div>
            <div className="dk-esqueleto-papel" style={{ minHeight: 46, padding: 12 }}>
              <div className="dk-esqueleto-barra" style={{ width: '55%', margin: 0 }} />
            </div>
            <div className="dk-esqueleto-papel">
              <div className="dk-esqueleto-barra" style={{ width: '50%' }} />
              <div className="dk-esqueleto-barra" style={{ width: '40%' }} />
              <div className="dk-esqueleto-barra" style={{ width: '25%' }} />
            </div>
            <div className="dk-esqueleto-papel">
              <div className="dk-esqueleto-barra" style={{ width: '50%' }} />
              <div className="dk-esqueleto-barra" style={{ width: '40%' }} />
              <div className="dk-esqueleto-barra" style={{ width: '25%' }} />
            </div>
            <div className="dk-esqueleto-papel" style={{ minHeight: 46, padding: 12 }}>
              <div className="dk-esqueleto-barra" style={{ width: '55%', margin: 0 }} />
            </div>
            <div className="dk-esqueleto-papel" style={{ minHeight: 46, padding: 12 }}>
              <div className="dk-esqueleto-barra" style={{ width: '55%', margin: 0 }} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

interface ContactFicha {
  id: string;
  nome: string | null;
  telefone: string | null;
  email: string | null;
  document: string | null;
  atributos: Record<string, unknown>;
}

/** Quando falta valor a tela escreve a falta, como lá ("Nenhum telefone cadastrado"). */
function ContactField({
  rotulo,
  value,
  empty,
}: {
  rotulo: string;
  value: string | null;
  empty: string;
}) {
  return (
    <p className="dk-campo-perfil">
      <b>{rotulo}:</b>
      <span>{value || empty}</span>
    </p>
  );
}

/** "dd/mm/aaaa, HH:mm" — o formato da linha "Última interação" do MFE. */
function dataCurta(d: Date): string {
  return d.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** As situações de encerramento por extenso, as que o domínio distingue. */
function situation(h: ConversationOfHistory): string {
  switch (h.estado) {
    case 'encerrada':
      return 'Finalizado pelo atendente';
    case 'na_fila':
      return 'Aguardando';
    case 'atribuida':
      return 'Atribuído';
    default:
      return 'Aberto';
  }
}
