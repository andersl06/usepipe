import { useEffect, useState, type FormEvent } from 'react';
import type { ConversationOfDesk, LabelOfConversation, EtiquetaDoDesk } from '@pipe/contracts';
import { IconeDesk } from '../../componentes/icones-desk';
import { Link } from '../../componentes/link';
import { api } from '../../lib/api';
import { useRead } from '../../lib/consulta';
import { executar, atualizarLeituras } from '../../lib/acoes';
import { channelOf, numeroDoTicket } from '../../lib/canal';
import { dataAbreviada } from '../../lib/formato';
import { displayName } from '../../lib/ordem';

/**
 * O painel do contato — `.drawer` da referência
 * (`~/desk-clone/capturas/parciais/drawer.html`): cabeçalho "Dados do
 * Contato", as abas Informações / Histórico / Comentários (a "Falar com
 * gestor" de lá é o chat interno com o gestor, que não existe no Pipe), e em
 * cada aba uma pilha de `bds-paper` sobre o fundo recuado.
 *
 * Informações: cartão "Informações" com Nome, Id, E-mail, Telefone, Documento
 * e "Extras" (os atributos crus, chave → valor, como lá), cada campo com o
 * botão de copiar; e o cartão "Comentários" com o estado vazio "Não há
 * comentários sobre este usuário" e o campo "Escreva um comentário...".
 * Os comentários são as notas internas da conversa
 * (`itens` de gênero `nota`), gravadas por `salvarNotaInterna`.
 */
type Aba = 'informacoes' | 'historico' | 'comentarios';

export function Panel({ aberta, agora }: { aberta: ConversationOfDesk | null; agora: Date }) {
  const [aba, setAba] = useState<Aba>('informacoes');
  const [editandoContact, setEditandoContact] = useState(false);
  const conversationId = aberta?.conversation.id ?? null;

  // Trocar de ticket sai do modo de edição: senão o formulário de um contato fica
  // aberto por cima dos dados de outro.
  useEffect(() => setEditandoContact(false), [conversationId]);

  if (!aberta) {
    return (
      <div className="dk-painel">
        <div className="dk-painel-esqueleto" aria-hidden="true">
          <div className="dk-esqueleto-barra" style={{ width: '45%' }} />
          <div style={{ display: 'flex', gap: 24, margin: '24px 0 16px' }}>
            <div className="dk-esqueleto-barra" style={{ width: 60, margin: 0 }} />
            <div className="dk-esqueleto-barra" style={{ width: 60, margin: 0 }} />
          </div>
          <div className="dk-esqueleto-papel">
            <div className="dk-esqueleto-barra" style={{ width: '35%' }} />
            <div className="dk-esqueleto-barra" style={{ width: '20%' }} />
            <div className="dk-esqueleto-barra" style={{ width: '20%' }} />
            <div className="dk-esqueleto-barra" style={{ width: '20%' }} />
          </div>
          <div className="dk-esqueleto-papel" style={{ minHeight: 140 }}>
            <div className="dk-esqueleto-barra" style={{ width: '25%', marginLeft: 'auto' }} />
            <div className="dk-esqueleto-barra" style={{ width: '90%', marginTop: 48 }} />
          </div>
        </div>
      </div>
    );
  }

  const { conversation, itens, history, contactTags } = aberta;
  const notas = itens.filter((i) => i.genero === 'nota');
  const abas: { id: Aba; rotulo: string }[] = [
    { id: 'informacoes', rotulo: 'Informações' },
    { id: 'historico', rotulo: 'Histórico' },
    { id: 'comentarios', rotulo: 'Comentários' },
  ];

  return (
    <div className="dk-painel">
      <div className="dk-painel-topo">
        <h2 id="customer-name-drawer">Dados do Contato</h2>
      </div>
      <div className="dk-abas" id="drawer-tabs">
        <div className="dk-abas-lista" role="tablist">
          {abas.map((a) => (
            <button
              key={a.id}
              type="button"
              role="tab"
              id={a.id}
              className="dk-aba"
              aria-selected={aba === a.id}
              onClick={() => setAba(a.id)}
            >
              {a.rotulo}
            </button>
          ))}
        </div>
        {aba === 'informacoes' ? (
          <div className="dk-painel-corpo" role="tabpanel">
            <section className="dk-papel">
              {editandoContact ? (
                <ContactEdit
                  conversation={conversation}
                  aoFechar={() => setEditandoContact(false)}
                  aoSalvar={() => {
                    setEditandoContact(false);
                    atualizarLeituras();
                  }}
                />
              ) : (
                <>
                  <h3 className="dk-papel-titulo">
                    Informações
                    <button
                      type="button"
                      className="dk-botao dk-botao-secundario dk-botao-curto"
                      onClick={() => setEditandoContact(true)}
                    >
                      Editar
                    </button>
                  </h3>
                  <Campo rotulo="Nome:" value={displayName(conversation)} />
                  <Campo rotulo="Id:" value={conversation.contactId} />
                  <Campo
                    rotulo="E-mail:"
                    value={conversation.contactEmail}
                    link={conversation.contactEmail ? `mailto:${conversation.contactEmail}` : undefined}
                  />
                  <Campo rotulo="Telefone:" value={conversation.contactPhone} />
                  <Campo rotulo="Documento:" value={conversation.contactDocument} />
                </>
              )}
              {!editandoContact && Object.keys(conversation.contactAtributos).length > 0 ? (
                <>
                  <h3 className="dk-papel-titulo">Extras</h3>
                  {Object.entries(conversation.contactAtributos).map(([key, value]) => (
                    <Campo
                      key={key}
                      rotulo={`${key}:`}
                      value={value === null || value === undefined ? '' : String(value)}
                    />
                  ))}
                </>
              ) : null}
              <Campo rotulo="Canal:" value={channelOf(conversation.channelType).nome} />
              <Campo rotulo="fila:" value={conversation.queueName} />
            </section>
            <section className="dk-papel">
              <ContactTags contactId={conversation.contactId} aplicadas={contactTags} />
            </section>
            <section className="dk-papel">
              <Comentarios conversationId={conversation.id} notas={notas} agora={agora} />
            </section>
          </div>
        ) : null}
        {aba === 'historico' ? (
          <div className="dk-painel-corpo" role="tabpanel">
            <section className="dk-papel">
              <h3 className="dk-papel-titulo">Histórico</h3>
              {history.length === 0 ? (
                <div className="dk-comentarios-vazio" style={{ minHeight: 120 }}>
                  Não há mensagens nos últimos 90 dias.
                </div>
              ) : (
                history.map((h) => (
                  <Link
                    key={h.id}
                    href={`/contacts/${conversation.contactId}?ticket=${h.id}`}
                    className="dk-historico-item"
                  >
                    <b>Ticket {numeroDoTicket(h.id)}</b>
                    <span>{h.filaNome ?? 'Transferência direta'}</span>
                    <small>
                      {h.encerradaEm ? dataAbreviada(new Date(h.encerradaEm)) : 'Aberto'}
                    </small>
                  </Link>
                ))
              )}
            </section>
          </div>
        ) : null}
        {aba === 'comentarios' ? (
          <div className="dk-painel-corpo" role="tabpanel">
            <section className="dk-papel" style={{ flexBasis: '100%' }}>
              <Comentarios conversationId={conversation.id} notas={notas} agora={agora} />
            </section>
          </div>
        ) : null}
      </div>
    </div>
  );
}

/** `.profile-info-item`: rótulo em cima, valor embaixo e o botão de copiar. */
function Campo({ rotulo, value, link }: { rotulo: string; value: string | null; link?: string }) {
  const [copiado, setCopiado] = useState(false);
  const texto = value ?? '';
  return (
    <p className="dk-campo-perfil">
      <b>{rotulo}</b>
      {link && texto ? (
        <a href={link} target="_blank" rel="noreferrer">
          {texto}
        </a>
      ) : (
        <span>{texto}</span>
      )}
      {texto ? (
        <button
          type="button"
          className="dk-copiar"
          title={copiado ? 'Copiado' : 'Copiar'}
          aria-label={`Copiar ${rotulo}`}
          onClick={() => {
            void navigator.clipboard?.writeText(texto);
            setCopiado(true);
            setTimeout(() => setCopiado(false), 1500);
          }}
        >
          <IconeDesk nome="copiar" />
        </button>
      ) : null}
    </p>
  );
}

/**
 * O "Editar" do painel — `PATCH /v1/contatos/:id` (`controladores/catalogo.ts`),
 * já testado e com permissão própria (`contato.editar`). A tela só manda o que
 * mudou; campo vazio manda string vazia, que a API grava como está (ela é quem
 * decide o que é "apagar" vs. "não mexeu").
 */
function ContactEdit({
  conversation,
  aoFechar,
  aoSalvar,
}: {
  conversation: ConversationOfDesk['conversation'];
  aoFechar: () => void;
  aoSalvar: () => void;
}) {
  const [nome, setNome] = useState(conversation.contactName ?? '');
  const [telefone, setTelefone] = useState(conversation.contactPhone ?? '');
  const [email, setEmail] = useState(conversation.contactEmail ?? '');
  const [document, setDocument] = useState(conversation.contactDocument ?? '');
  const [error, setError] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  async function salvar(e: FormEvent) {
    e.preventDefault();
    setSalvando(true);
    setError(null);
    try {
      await api.patch(`/v1/contatos/${conversation.contactId}`, {
        nome: nome.trim() || null,
        telefone_e164: telefone.trim() || null,
        email: email.trim() || null,
        documento: document.trim() || null,
      });
      aoSalvar();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível salvar o contato.');
    } finally {
      setSalvando(false);
    }
  }

  return (
    <form onSubmit={(e) => void salvar(e)}>
      <h3 className="dk-papel-titulo">Editar contato</h3>
      <label className="dk-campo-flutuante">
        <span>Nome</span>
        <input type="text" value={nome} onChange={(e) => setNome(e.target.value)} />
      </label>
      <label className="dk-campo-flutuante">
        <span>Telefone</span>
        <input type="tel" value={telefone} onChange={(e) => setTelefone(e.target.value)} />
      </label>
      <label className="dk-campo-flutuante">
        <span>E-mail</span>
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      </label>
      <label className="dk-campo-flutuante">
        <span>Documento</span>
        <input type="text" value={document} onChange={(e) => setDocument(e.target.value)} />
      </label>
      {error ? <p className="dk-erro">{error}</p> : null}
      <div className="dk-modal-acoes">
        <button
          type="button"
          className="dk-botao dk-botao-secundario dk-botao-curto"
          onClick={aoFechar}
          disabled={salvando}
        >
          Cancelar
        </button>
        <button type="submit" className="dk-botao dk-botao-curto" disabled={salvando}>
          Salvar
        </button>
      </div>
    </form>
  );
}

/**
 * As etiquetas do CONTATO — `contato_etiqueta`, que até aqui não tinha rota nem
 * tela. O catálogo vem de `GET /v1/etiquetas?escopo=contato` (as de escopo
 * `contato` e `ambos`); aplicar e remover vão por `POST`/`DELETE
 * /v1/contatos/:id/etiquetas`, com a mesma permissão de editar a ficha
 * (`contato.editar`) — a etiqueta do contato é dado do contato.
 */
function ContactTags({
  contactId,
  aplicadas,
}: {
  contactId: string;
  aplicadas: LabelOfConversation[];
}) {
  const catalogo = useRead<{ etiquetas: EtiquetaDoDesk[] }>('/v1/etiquetas?escopo=contato');
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const jaTem = new Set(aplicadas.map((e) => e.id));
  const disponiveis = (catalogo.data?.etiquetas ?? []).filter((e) => !jaTem.has(e.id));

  async function aplicar(etiquetaId: string) {
    if (!etiquetaId || ocupado) return;
    setOcupado(true);
    setError(null);
    try {
      await api.post(`/v1/contatos/${contactId}/etiquetas`, { etiqueta_id: etiquetaId });
      atualizarLeituras();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível etiquetar o contato.');
    } finally {
      setOcupado(false);
    }
  }

  async function remover(etiqueta: LabelOfConversation) {
    if (ocupado) return;
    setOcupado(true);
    setError(null);
    try {
      await api.delete(`/v1/contatos/${contactId}/etiquetas/${etiqueta.id}`);
      atualizarLeituras();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível remover a etiqueta.');
    } finally {
      setOcupado(false);
    }
  }

  return (
    <>
      <h3 className="dk-papel-titulo">Etiquetas do contato</h3>
      <div className="dk-etiquetas-do-contato" id="contact-tags">
        {aplicadas.length === 0 ? (
          <span style={{ color: 'var(--p-conteudo-desabilitado)', fontSize: 14 }}>
            Nenhuma etiqueta neste contato.
          </span>
        ) : null}
        {aplicadas.map((e) => (
          <span key={e.id} className="dk-chip dk-chip-contorno">
            {e.nome}
            <button
              type="button"
              className="dk-chip-remover"
              title={`Remover a etiqueta ${e.nome}`}
              aria-label={`Remover a etiqueta ${e.nome}`}
              disabled={ocupado}
              onClick={() => void remover(e)}
            >
              <IconeDesk nome="fechar" tamanho={16} />
            </button>
          </span>
        ))}
      </div>
      <label className="dk-campo-flutuante">
        <span>Adicionar etiqueta</span>
        <select
          id="contact-tag-select"
          value=""
          disabled={ocupado || disponiveis.length === 0}
          onChange={(e) => void aplicar(e.target.value)}
        >
          <option value="">
            {disponiveis.length === 0 ? 'Nenhuma etiqueta disponível' : 'Escolher etiqueta'}
          </option>
          {disponiveis.map((e) => (
            <option key={e.id} value={e.id}>
              {e.nome}
            </option>
          ))}
        </select>
      </label>
      {error ? <p className="dk-erro">{error}</p> : null}
    </>
  );
}

function Comentarios({
  conversationId,
  notas,
  agora,
}: {
  conversationId: string;
  notas: Extract<ConversationOfDesk['itens'][number], { genero: 'nota' }>[];
  agora: Date;
}) {
  const [texto, setTexto] = useState('');
  const [error, setError] = useState<string | null>(null);
  void agora;

  async function enviar(e: FormEvent) {
    e.preventDefault();
    const corpo = texto.trim();
    if (!corpo) return;
    const r = await executar('salvarNotaInterna', { conversationId, texto: corpo });
    if (!r.ok) setError(r.error ?? 'Não foi possível salvar o comentário.');
    else {
      setTexto('');
      setError(null);
    }
  }

  return (
    <div className="dk-comentarios">
      <h3 className="dk-papel-titulo">Comentários</h3>
      <div className="dk-comentarios-lista">
        {notas.length === 0 ? (
          <div className="dk-comentarios-vazio">
            <IconeDesk nome="comentario" />
            <span>Não há comentários sobre este usuário</span>
          </div>
        ) : (
          notas.map((n) => (
            <div key={n.id} className="dk-comentario">
              {n.corpo}
              <small>
                {n.autor ?? ''} · {dataAbreviada(new Date(n.criadaEm))}
              </small>
            </div>
          ))
        )}
      </div>
      <form className="dk-comentarios-campo" onSubmit={(e) => void enviar(e)}>
        <label className="dk-campo-texto">
          <textarea
            id="comment-input"
            rows={2}
            placeholder="Escreva um comentário..."
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void enviar(e);
              }
            }}
          />
        </label>
        {error ? <p className="dk-erro">{error}</p> : null}
      </form>
    </div>
  );
}
