import { useEffect, useState, type FormEvent } from 'react';
import type { ConversaDoDesk, EtiquetaDaConversa, EtiquetaDoDesk } from '@pipe/contracts';
import { IconeDesk } from '../../componentes/icones-desk';
import { Link } from '../../componentes/link';
import { api } from '../../lib/api';
import { useLeitura } from '../../lib/consulta';
import { executar, atualizarLeituras } from '../../lib/acoes';
import { canalDe, numeroDoTicket } from '../../lib/canal';
import { dataAbreviada } from '../../lib/formato';
import { nomeDeExibicao } from '../../lib/ordem';

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

export function Painel({ aberta, agora }: { aberta: ConversaDoDesk | null; agora: Date }) {
  const [aba, setAba] = useState<Aba>('informacoes');
  const [editandoContato, setEditandoContato] = useState(false);
  const conversaId = aberta?.conversa.id ?? null;

  // Trocar de ticket sai do modo de edição: senão o formulário de um contato fica
  // aberto por cima dos dados de outro.
  useEffect(() => setEditandoContato(false), [conversaId]);

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

  const { conversa, itens, historico, etiquetasDoContato } = aberta;
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
              {editandoContato ? (
                <EdicaoDoContato
                  conversa={conversa}
                  aoFechar={() => setEditandoContato(false)}
                  aoSalvar={() => {
                    setEditandoContato(false);
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
                      onClick={() => setEditandoContato(true)}
                    >
                      Editar
                    </button>
                  </h3>
                  <Campo rotulo="Nome:" valor={nomeDeExibicao(conversa)} />
                  <Campo rotulo="Id:" valor={conversa.contatoId} />
                  <Campo
                    rotulo="E-mail:"
                    valor={conversa.contatoEmail}
                    link={conversa.contatoEmail ? `mailto:${conversa.contatoEmail}` : undefined}
                  />
                  <Campo rotulo="Telefone:" valor={conversa.contatoTelefone} />
                  <Campo rotulo="Documento:" valor={conversa.contatoDocumento} />
                </>
              )}
              {!editandoContato && Object.keys(conversa.contatoAtributos).length > 0 ? (
                <>
                  <h3 className="dk-papel-titulo">Extras</h3>
                  {Object.entries(conversa.contatoAtributos).map(([chave, valor]) => (
                    <Campo
                      key={chave}
                      rotulo={`${chave}:`}
                      valor={valor === null || valor === undefined ? '' : String(valor)}
                    />
                  ))}
                </>
              ) : null}
              <Campo rotulo="Canal:" valor={canalDe(conversa.canalTipo).nome} />
              <Campo rotulo="fila:" valor={conversa.filaNome} />
            </section>
            <section className="dk-papel">
              <EtiquetasDoContato contatoId={conversa.contatoId} aplicadas={etiquetasDoContato} />
            </section>
            <section className="dk-papel">
              <Comentarios conversaId={conversa.id} notas={notas} agora={agora} />
            </section>
          </div>
        ) : null}
        {aba === 'historico' ? (
          <div className="dk-painel-corpo" role="tabpanel">
            <section className="dk-papel">
              <h3 className="dk-papel-titulo">Histórico</h3>
              {historico.length === 0 ? (
                <div className="dk-comentarios-vazio" style={{ minHeight: 120 }}>
                  Não há mensagens nos últimos 90 dias.
                </div>
              ) : (
                historico.map((h) => (
                  <Link
                    key={h.id}
                    href={`/contacts/${conversa.contatoId}?ticket=${h.id}`}
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
              <Comentarios conversaId={conversa.id} notas={notas} agora={agora} />
            </section>
          </div>
        ) : null}
      </div>
    </div>
  );
}

/** `.profile-info-item`: rótulo em cima, valor embaixo e o botão de copiar. */
function Campo({ rotulo, valor, link }: { rotulo: string; valor: string | null; link?: string }) {
  const [copiado, setCopiado] = useState(false);
  const texto = valor ?? '';
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
function EdicaoDoContato({
  conversa,
  aoFechar,
  aoSalvar,
}: {
  conversa: ConversaDoDesk['conversa'];
  aoFechar: () => void;
  aoSalvar: () => void;
}) {
  const [nome, setNome] = useState(conversa.contatoNome ?? '');
  const [telefone, setTelefone] = useState(conversa.contatoTelefone ?? '');
  const [email, setEmail] = useState(conversa.contatoEmail ?? '');
  const [documento, setDocumento] = useState(conversa.contatoDocumento ?? '');
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  async function salvar(e: FormEvent) {
    e.preventDefault();
    setSalvando(true);
    setErro(null);
    try {
      await api.patch(`/v1/contatos/${conversa.contatoId}`, {
        nome: nome.trim() || null,
        telefone_e164: telefone.trim() || null,
        email: email.trim() || null,
        documento: documento.trim() || null,
      });
      aoSalvar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível salvar o contato.');
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
        <input type="text" value={documento} onChange={(e) => setDocumento(e.target.value)} />
      </label>
      {erro ? <p className="dk-erro">{erro}</p> : null}
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
function EtiquetasDoContato({
  contatoId,
  aplicadas,
}: {
  contatoId: string;
  aplicadas: EtiquetaDaConversa[];
}) {
  const catalogo = useLeitura<{ etiquetas: EtiquetaDoDesk[] }>('/v1/etiquetas?escopo=contato');
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const jaTem = new Set(aplicadas.map((e) => e.id));
  const disponiveis = (catalogo.data?.etiquetas ?? []).filter((e) => !jaTem.has(e.id));

  async function aplicar(etiquetaId: string) {
    if (!etiquetaId || ocupado) return;
    setOcupado(true);
    setErro(null);
    try {
      await api.post(`/v1/contatos/${contatoId}/etiquetas`, { etiqueta_id: etiquetaId });
      atualizarLeituras();
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível etiquetar o contato.');
    } finally {
      setOcupado(false);
    }
  }

  async function remover(etiqueta: EtiquetaDaConversa) {
    if (ocupado) return;
    setOcupado(true);
    setErro(null);
    try {
      await api.delete(`/v1/contatos/${contatoId}/etiquetas/${etiqueta.id}`);
      atualizarLeituras();
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível remover a etiqueta.');
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
      {erro ? <p className="dk-erro">{erro}</p> : null}
    </>
  );
}

function Comentarios({
  conversaId,
  notas,
  agora,
}: {
  conversaId: string;
  notas: Extract<ConversaDoDesk['itens'][number], { genero: 'nota' }>[];
  agora: Date;
}) {
  const [texto, setTexto] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  void agora;

  async function enviar(e: FormEvent) {
    e.preventDefault();
    const corpo = texto.trim();
    if (!corpo) return;
    const r = await executar('salvarNotaInterna', { conversaId, texto: corpo });
    if (!r.ok) setErro(r.erro ?? 'Não foi possível salvar o comentário.');
    else {
      setTexto('');
      setErro(null);
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
        {erro ? <p className="dk-erro">{erro}</p> : null}
      </form>
    </div>
  );
}
