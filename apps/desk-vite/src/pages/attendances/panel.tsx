import { useEffect, useState, type FormEvent } from 'react';
import type { ConversationOfDesk, LabelOfConversation, EtiquetaDoDesk } from '@pipe/contracts';
import { IconeDesk } from '../../components/icones-desk';
import { useDeskSelection } from '../../context/desk-selection';
import { api } from '../../lib/api';
import { useRead } from '../../lib/query';
import { executar, atualizarLeituras } from '../../lib/actions';
import { channelOf, numeroDoTicket } from '../../lib/channel';
import { dataAbreviada } from '../../lib/format';
import { displayName } from '../../lib/order';

/**
 * Reference contact `.drawer` (`~/desk-clone/capturas/parciais/drawer.html`) has `Dados do Contato` and `Informações`, `Histórico`, `Comentários` tabs with `bds-paper` stacks. Source `Falar com gestor` is manager chat, absent in Pipe. Information includes name, ID, email, phone, document, raw key/value extras, and copy buttons. `Comentários` shows an empty state or entry field; these are internal conversation notes (`itens` of kind `nota`) saved through `salvarNotaInterna`.
 */
type Aba = 'informacoes' | 'historico' | 'comentarios';

export function Panel({ aberta, agora }: { aberta: ConversationOfDesk | null; agora: Date }) {
  const [aba, setAba] = useState<Aba>('informacoes');
  const [editandoContact, setEditandoContact] = useState(false);
  const { openContact } = useDeskSelection();
  const conversationId = aberta?.conversation.id ?? null;

  // Leave edit mode when switching tickets, so one contact's form cannot remain open over another contact's data.
  // aberto por cima dos dados de outro.
  useEffect(() => setEditandoContact(false), [conversationId]);

  if (!aberta) {
    return (
      <div className="dk-panel">
        <div className="dk-panel-skeleton" aria-hidden="true">
          <div className="dk-esqueleto-barra" style={{ width: '45%' }} />
          <div style={{ display: 'flex', gap: 24, margin: '24px 0 16px' }}>
            <div className="dk-esqueleto-barra" style={{ width: 60, margin: 0 }} />
            <div className="dk-esqueleto-barra" style={{ width: 60, margin: 0 }} />
          </div>
          <div className="dk-skeleton-paper">
            <div className="dk-esqueleto-barra" style={{ width: '35%' }} />
            <div className="dk-esqueleto-barra" style={{ width: '20%' }} />
            <div className="dk-esqueleto-barra" style={{ width: '20%' }} />
            <div className="dk-esqueleto-barra" style={{ width: '20%' }} />
          </div>
          <div className="dk-skeleton-paper" style={{ minHeight: 140 }}>
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
    <div className="dk-panel">
      <div className="dk-panel-top">
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
          <div className="dk-panel-body" role="tabpanel">
            <section className="dk-paper">
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
                  <h3 className="dk-paper-title">
                    Informações
                    <button
                      type="button"
                      className="dk-botao dk-botao-secundario dk-botao-curto"
                      onClick={() => setEditandoContact(true)}
                    >
                      Editar
                    </button>
                  </h3>
                  <Campo rotulo="Nome:" value={displayName({ ...conversation, contactTelefone: conversation.contactPhone })} />
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
              {!editandoContact && Object.keys(conversation.contactAttributes).length > 0 ? (
                <>
                  <h3 className="dk-paper-title">Extras</h3>
                  {Object.entries(conversation.contactAttributes).map(([key, value]) => (
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
            <section className="dk-paper">
              <ContactTags contactId={conversation.contactId} aplicadas={contactTags} />
            </section>
            <section className="dk-paper">
              <Comentarios conversationId={conversation.id} notas={notas} agora={agora} />
            </section>
          </div>
        ) : null}
        {aba === 'historico' ? (
          <div className="dk-panel-body" role="tabpanel">
            <section className="dk-paper">
              <h3 className="dk-paper-title">Histórico</h3>
              {history.length === 0 ? (
                <div className="dk-comments-empty" style={{ minHeight: 120 }}>
                  Não há mensagens nos últimos 90 dias.
                </div>
              ) : (
                history.map((h) => (
                  <button
                    key={h.id}
                    type="button"
                    onClick={() => openContact(conversation.contactId, h.id)}
                    className="dk-history-item dk-history-button"
                  >
                    <b>Ticket {numeroDoTicket(h.id)}</b>
                    <span>{h.filaNome ?? 'Transferência direta'}</span>
                    <small>
                      {h.encerradaEm ? dataAbreviada(new Date(h.encerradaEm)) : 'Aberto'}
                    </small>
                  </button>
                ))
              )}
            </section>
          </div>
        ) : null}
        {aba === 'comentarios' ? (
          <div className="dk-panel-body" role="tabpanel">
            <section className="dk-paper" style={{ flexBasis: '100%' }}>
              <Comentarios conversationId={conversation.id} notas={notas} agora={agora} />
            </section>
          </div>
        ) : null}
      </div>
    </div>
  );
}


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
 * Contact-panel `Editar` calls `PATCH /v1/contatos/:id` (`controladores/catalogo.ts`), already tested and guarded by `contato.editar`. Send only changed fields; an empty field sends an empty string, which the API stores as given. The API distinguishes clearing a field from leaving it untouched.
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
      await api.patch(`/v1/contacts/${conversation.contactId}`, {
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
      <h3 className="dk-paper-title">Editar contato</h3>
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
      {error ? <p className="dk-error">{error}</p> : null}
      <div className="dk-modal-actions">
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
 * Contact tags live in `contato_etiqueta`, previously without a route or screen. Fetch the catalog from `GET /v1/etiquetas?escopo=contato` (scopes `contato` and `ambos`); apply/remove via `POST`/`DELETE /v1/contatos/:id/etiquetas` under contact-edit permission `contato.editar`. A contact tag is contact data.
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
      await api.post(`/v1/contacts/${contactId}/labels`, { etiqueta_id: etiquetaId });
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
      await api.delete(`/v1/contacts/${contactId}/labels/${etiqueta.id}`);
      atualizarLeituras();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível remover a etiqueta.');
    } finally {
      setOcupado(false);
    }
  }

  return (
    <>
      <h3 className="dk-paper-title">Etiquetas do contato</h3>
      <div className="dk-contact-tags" id="contact-tags">
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
      {error ? <p className="dk-error">{error}</p> : null}
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
      <h3 className="dk-paper-title">Comentários</h3>
      <div className="dk-comentarios-lista">
        {notas.length === 0 ? (
          <div className="dk-comments-empty">
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
        {error ? <p className="dk-error">{error}</p> : null}
      </form>
    </div>
  );
}
