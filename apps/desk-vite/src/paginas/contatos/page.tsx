import { useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import type { ConversaDoHistorico, TicketDoDesk } from '@pipe/contracts';
import { useLeitura } from '../../lib/consulta';
import { IconeDesk } from '../../componentes/icones-desk';
import { Avatar } from '../../componentes/avatar';
import { canalDe, numeroDoTicket } from '../../lib/canal';
import { dataAbreviada } from '../../lib/formato';
import { nomeDeExibicao } from '../../lib/ordem';
import { agruparContatos, type ContatoDaLista, type OrdemDeContatos } from '../../lib/contatos';
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
export function PaginaContatos() {
  const { id } = useParams();
  const [parametros, setParametros] = useSearchParams();
  const navegar = useNavigate();
  const [busca, setBusca] = useState('');
  const [ordem, setOrdem] = useState<OrdemDeContatos>('alfabetica');
  const [menuOrdem, setMenuOrdem] = useState(false);
  const [aba, setAba] = useState<'historico' | 'contato'>('historico');
  const ticketId = parametros.get('ticket');

  const lista = useLeitura<{ contatos: ContatoDaLista[] }>(
    `/v1/desk/contatos${busca.trim().length >= 2 ? `?busca=${encodeURIComponent(busca.trim())}` : ''}`,
  );
  const contato = useLeitura<{ contato: FichaDoContato; historico: ConversaDoHistorico[] }>(
    id ? `/v1/desk/contatos/${id}` : null,
  );
  const ticket = useLeitura<TicketDoDesk>(ticketId ? `/v1/desk/tickets/${ticketId}` : null);
  const grupos = useMemo(
    () => agruparContatos(lista.data?.contatos ?? [], ordem),
    [lista.data, ordem],
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
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
              />
            </label>
            <div className="dk-ficha-menu">
              <button
                type="button"
                className="dk-botao-icone"
                title="Ordenar contatos"
                aria-label="Ordenar contatos"
                aria-expanded={menuOrdem}
                onClick={() => setMenuOrdem((v) => !v)}
              >
                <IconeDesk nome="ordenar" />
              </button>
              {menuOrdem ? (
                <div
                  className="dk-menu dk-contatos-ordem"
                  role="menu"
                  onMouseLeave={() => setMenuOrdem(false)}
                >
                  <div className="dk-contatos-ordem-titulo">Ordenar contatos</div>
                  {(
                    [
                      ['alfabetica', 'Ordem alfabética', 'lista'],
                      ['ultima-interacao', 'Última interação', 'relogio'],
                    ] as const
                  ).map(([valor, rotulo, icone]) => (
                    <button
                      key={valor}
                      type="button"
                      role="menuitemradio"
                      aria-checked={ordem === valor}
                      className="dk-contatos-ordem-item"
                      onClick={() => {
                        setOrdem(valor);
                        setMenuOrdem(false);
                      }}
                    >
                      <IconeDesk nome={icone} />
                      <span>{rotulo}</span>
                      {ordem === valor ? <IconeDesk nome="check" /> : null}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        </div>
        <div className="dk-contatos-rolagem">
          {lista.isPending ? <div className="dk-girando dk-girando-pequeno" /> : null}
          {grupos.map((g) => (
            <div key={g.rotulo}>
              <div className="dk-contatos-grupo">{g.rotulo}</div>
              <ul className="dk-contatos-itens">
                {g.contatos.map((c) => (
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
                          {nomeDeExibicao({
                            contatoNome: c.nome,
                            contatoTelefone: c.telefone,
                            contatoEmail: c.email,
                            contatoId: c.id,
                          })}
                        </b>
                        <small>
                          Última interação :{' '}
                          {c.ultimaInteracaoEm ? dataCurta(new Date(c.ultimaInteracaoEm)) : '—'}
                        </small>
                      </span>
                      <IconeDesk nome="seta-direita" tamanho={20} />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
          {lista.data && grupos.length === 0 ? (
            <div className="dk-lista-vazia">Nenhum contato encontrado</div>
          ) : null}
        </div>
      </div>

      <div className="dk-contatos-meio">
        {ticketId && ticket.data ? (
          <Thread
            conversaId={ticket.data.ticket.id}
            itens={ticket.data.itens}
            agora={new Date()}
            somenteLeitura
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
        {id && contato.data ? (
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
              ).map(([valor, rotulo]) => (
                <button
                  key={valor}
                  type="button"
                  role="tab"
                  className="dk-aba"
                  aria-selected={aba === valor}
                  onClick={() => setAba(valor)}
                >
                  {rotulo}
                </button>
              ))}
            </div>
            <div className="dk-painel-corpo" role="tabpanel">
              {!contato.data ? (
                <div className="dk-girando dk-girando-pequeno" />
              ) : aba === 'historico' ? (
                <section className="dk-papel" style={{ flexBasis: '100%' }}>
                  {contato.data.historico.length === 0 ? (
                    <div className="dk-comentarios-vazio" style={{ minHeight: 120 }}>
                      Não há mensagens nos últimos 90 dias.
                    </div>
                  ) : (
                    contato.data.historico.map((h) => (
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
                          {situacao(h)}
                          {h.encerradaEm ? ` · ${dataAbreviada(new Date(h.encerradaEm))}` : ''}
                        </small>
                      </button>
                    ))
                  )}
                </section>
              ) : (
                <section className="dk-papel" style={{ flexBasis: '100%' }}>
                  <h3 className="dk-papel-titulo">Contato</h3>
                  <CampoDoContato
                    rotulo="Nome"
                    valor={contato.data.contato.nome}
                    vazio="Nenhum nome cadastrado"
                  />
                  <CampoDoContato
                    rotulo="Telefone"
                    valor={contato.data.contato.telefone}
                    vazio="Nenhum telefone cadastrado"
                  />
                  <CampoDoContato
                    rotulo="E-mail"
                    valor={contato.data.contato.email}
                    vazio="Nenhum e-mail cadastrado"
                  />
                  <CampoDoContato rotulo="ID do usuário" valor={contato.data.contato.id} vazio="" />
                  <CampoDoContato
                    rotulo="Documento"
                    valor={contato.data.contato.documento}
                    vazio="Nenhum documento cadastrado"
                  />
                  {ticket.data ? (
                    <CampoDoContato
                      rotulo="Canal"
                      valor={canalDe(ticket.data.ticket.canalTipo).nome}
                      vazio=""
                    />
                  ) : null}
                  {Object.keys(contato.data.contato.atributos).length > 0 ? (
                    <>
                      <h3 className="dk-papel-titulo">Dados Extras</h3>
                      {Object.entries(contato.data.contato.atributos).map(([k, v]) => (
                        <CampoDoContato
                          key={k}
                          rotulo={k}
                          valor={v === null || v === undefined ? '' : String(v)}
                          vazio=""
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

interface FichaDoContato {
  id: string;
  nome: string | null;
  telefone: string | null;
  email: string | null;
  documento: string | null;
  atributos: Record<string, unknown>;
}

/** Quando falta valor a tela escreve a falta, como lá ("Nenhum telefone cadastrado"). */
function CampoDoContato({
  rotulo,
  valor,
  vazio,
}: {
  rotulo: string;
  valor: string | null;
  vazio: string;
}) {
  return (
    <p className="dk-campo-perfil">
      <b>{rotulo}:</b>
      <span>{valor || vazio}</span>
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
function situacao(h: ConversaDoHistorico): string {
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
