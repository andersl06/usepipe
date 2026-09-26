import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import type { ConversationOpen, RespostaProntaDoDesk, TemplateAprovado } from '@pipe/contracts';
import { IconeDesk } from '../../components/icones-desk';
import { api, chamarApi, motivoDaFalha } from '../../lib/api';
import { atualizarLeituras } from '../../lib/actions';
import { MAX_FILES_BY_ENVIO, recusaDoLote } from '../../lib/attachments';
import { windowAberta } from '../../lib/order';
import { numeroDoTicket } from '../../lib/channel';

/**
 * Reference composer `.pane-chat-message-input` (`~/desk-clone/capturas/parciais/composer.html`): `bds-paper` holds the message textarea above a reply, attachment, emoji, and audio/action row; audio is primary until text turns it into Send. When free text is unavailable, replace the composer with a centered message and button for `standbyInputLock`, `clientClosed`, `clientClosedInactivity`, `attendantClosed`, or closed 24-hour window (`failedMaxTimeChannelInterval`, which opens template sending here). Send text, attachment, or template through `POST /v1/conversas/:id/mensagens`. Internal notes use contact-panel `Comentário` instead.
 */
export function Composer({
  conversation,
  respostas,
  templates,
  agora,
  aoEnviar,
}: {
  conversation: ConversationOpen;
  respostas: RespostaProntaDoDesk[];
  templates: TemplateAprovado[];
  agora: Date;
  aoEnviar: () => void;
}) {
  const [texto, setTexto] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [panelRespostas, setPanelRespostas] = useState(false);
  const [templateAberto, setTemplateAberto] = useState(false);
  /** Track the selected quick reply for effort reporting; clear its ID if the text is edited. */
  const [respostaProntaId, setRespostaProntaId] = useState<string | null>(null);
  const campo = useRef<HTMLTextAreaElement>(null);
  const file = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setTexto('');
    setError(null);
    setPanelRespostas(false);
    setRespostaProntaId(null);
    campo.current?.focus();
  }, [conversation.id]);


  useEffect(() => {
    const el = campo.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.max(64, Math.min(184, el.scrollHeight))}px`;
  }, [texto]);

  if (conversation.state === 'em_espera') {
    return (
      <Fechado
        titulo="Retire o cliente do Modo de espera clicando no botão abaixo."
        botao="Remover do Modo de Espera"
        aoClicar={async () => {
          await api.post(`/v1/conversations/${conversation.id}/wait`);
          atualizarLeituras();
        }}
      />
    );
  }
  if (conversation.state === 'encerrada') {
    return (
      <Fechado
        titulo="Conversa encerrada pelo atendente."
        description="Envie uma nova mensagem para reabrir a conversa."
      />
    );
  }

  const aberta = windowAberta(conversation.windowExpiresAt, conversation.channelType, agora);

  async function enviar() {
    const corpo = texto.trim();
    if (!corpo || enviando) return;
    setEnviando(true);
    setError(null);
    try {
      await api.post(`/v1/conversations/${conversation.id}/messages`, {
        texto: corpo,
        tipo: 'texto',
        ...(respostaProntaId ? { resposta_pronta_id: respostaProntaId } : {}),
      });
      atualizarLeituras();
      setTexto('');
      setRespostaProntaId(null);
      aoEnviar();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ocorreu um erro ao enviar a mensagem.');
    } finally {
      setEnviando(false);
      campo.current?.focus();
    }
  }

  /**
   * Allow up to 10 files per send, one message per file in order, following source `SEND_MULT_FILE`/`mediaLinkDocuments` (`blip-desk-regras-tecnicas.md` §3.3). The batch is all-or-nothing: if count, size, or type validation fails in the screen or `POST /v1/anexos`, send no messages and name the failing file. Only after every upload succeeds does `POST /v1/conversas/:id/mensagens/anexos` create messages in order.
   */
  async function anexar(lista: FileList | null) {
    const arquivos = Array.from(lista ?? []);
    if (arquivos.length === 0) return;
    setEnviando(true);
    setError(null);
    try {
      const recusa = recusaDoLote(arquivos);
      if (recusa) throw new Error(recusa);

      const attachmentIds: string[] = [];
      for (const f of arquivos) {
        const resposta = await chamarApi(`/v1/attachments?nome=${encodeURIComponent(f.name)}`, {
          method: 'POST',
          headers: { 'content-type': f.type || 'application/octet-stream' },
          body: f,
        });
        if (!resposta.ok) {
          throw new Error(`"${f.name}": ${await motivoDaFalha(resposta)} Nenhum arquivo foi enviado.`);
        }
        const attachment = (await resposta.json()) as { id: string };
        attachmentIds.push(attachment.id);
      }
      await api.post(`/v1/conversations/${conversation.id}/messages/anexos`, { anexo_ids: attachmentIds });
      atualizarLeituras();
      aoEnviar();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível enviar os arquivos.');
    } finally {
      setEnviando(false);
      if (file.current) file.current.value = '';
    }
  }

  function aoTeclar(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey && !panelRespostas) {
      e.preventDefault();
      void enviar();
    }
    if (e.key === 'Escape') setPanelRespostas(false);
  }

  function usarResposta(r: RespostaProntaDoDesk) {
    setTexto(r.corpo);
    setRespostaProntaId(r.id);
    setPanelRespostas(false);
    campo.current?.focus();
  }

  if (!aberta) {
    return (
      <>
        <Fechado
          titulo="A janela de 24 horas de conversação foi excedida. Envie uma mensagem ativa para retomar o atendimento."
          botao="Enviar mensagem ativa"
          aoClicar={() => setTemplateAberto(true)}
        />
        {templateAberto ? (
          <TemplateModal
            conversation={conversation}
            templates={templates}
            aoFechar={() => setTemplateAberto(false)}
            aoEnviar={() => {
              setTemplateAberto(false);
              aoEnviar();
            }}
          />
        ) : null}
      </>
    );
  }

  return (
    <div className="dk-compositor">
      <div className="dk-compositor-papel">
        {panelRespostas ? (
          <RespostasPanel respostas={respostas} termo={texto} aoEscolher={usarResposta} />
        ) : null}
        <div className="dk-compositor-miolo">
          <div className="dk-compositor-campo">
            <textarea
              ref={campo}
              id="text-input"
              placeholder="Escreva uma mensagem..."
              value={texto}
              spellCheck
              onChange={(e) => {
                setTexto(e.target.value);
                setRespostaProntaId(null);
              }}
              onKeyDown={aoTeclar}
              disabled={enviando}
            />
          </div>
          <div className="dk-compositor-acoes">
            <div className="dk-compositor-esquerda">
              <button
                type="button"
                className="dk-botao-icone"
                id="custom-reply-btn"
                title="Enviar resposta pronta"
                aria-label="Enviar resposta pronta"
                aria-expanded={panelRespostas}
                onClick={() => setPanelRespostas((v) => !v)}
              >
                <IconeDesk nome="resposta-pronta" />
              </button>
              <button
                type="button"
                className="dk-botao-icone"
                id="send-file-btn"
                title={`Enviar arquivos (máximo de ${MAX_FILES_BY_ENVIO} arquivos por envio)`}
                aria-label={`Enviar arquivos (máximo de ${MAX_FILES_BY_ENVIO} arquivos por envio)`}
                onClick={() => file.current?.click()}
              >
                <IconeDesk nome="anexo" />
              </button>
              <input
                ref={file}
                type="file"
                multiple
                className="dk-so-leitor"
                accept="image/*,audio/*,video/*,application/pdf"
                onChange={(e) => void anexar(e.target.files)}
              />
              {/* ponytail: o seletor de emoji (emoji-mart) da referência; aqui só o botão. */}
              <button
                type="button"
                className="dk-botao-icone"
                id="emoji-btn"
                title="Adicionar emojis"
                aria-label="Adicionar emojis"
                disabled
              >
                <IconeDesk nome="emoji" />
              </button>
            </div>
            {texto.trim() ? (
              <button
                type="button"
                className="dk-botao-icone dk-primario"
                title="Enviar mensagem"
                aria-label="Enviar mensagem"
                onClick={() => void enviar()}
                disabled={enviando}
              >
                <IconeDesk nome="enviar" />
              </button>
            ) : (
              /* Ponytail: audio recording requires `MediaRecorder` and attachment upload; the button remains primary as in the reference. */
              <button
                type="button"
                className="dk-botao-icone dk-primario"
                id="blip-send-audio"
                title="Enviar um áudio"
                aria-label="Enviar um áudio"
                disabled
              >
                <IconeDesk nome="audio" />
              </button>
            )}
          </div>
        </div>
      </div>
      {error ? <p className="dk-erro">{error}</p> : null}
    </div>
  );
}


function Fechado({
  titulo,
  description,
  botao,
  aoClicar,
}: {
  titulo: string;
  description?: string;
  botao?: string;
  aoClicar?: () => void | Promise<void>;
}) {
  return (
    <div className="dk-compositor">
      <div className="dk-compositor-fechado">
        <div>
          <b>{titulo}</b>
          {description ? <div>{description}</div> : null}
        </div>
        {botao && aoClicar ? (
          <button type="button" className="dk-botao" onClick={() => void aoClicar()}>
            {botao}
          </button>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Reference quick-reply panel `.custom-reply`: list on the left, preview on the right (`Pré-visualização` / `Pressione Enter para selecionar`). Show `Não há título de resposta pronta que contenha este texto.` when none match; filter titles by the entered text.
 */
function RespostasPanel({
  respostas,
  termo,
  aoEscolher,
}: {
  respostas: RespostaProntaDoDesk[];
  termo: string;
  aoEscolher: (r: RespostaProntaDoDesk) => void;
}) {
  const [indice, setIndice] = useState(0);
  const filter = termo.trim().replace(/^\//, '').toLowerCase();
  const lista = respostas.filter(
    (r) =>
      !filter || r.titulo.toLowerCase().includes(filter) || r.atalho.toLowerCase().includes(filter),
  );
  const atual = lista[Math.min(indice, lista.length - 1)] ?? null;

  useEffect(() => {
    function aoTeclar(e: globalThis.KeyboardEvent) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setIndice((i) => Math.min(i + 1, lista.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setIndice((i) => Math.max(i - 1, 0));
      } else if (e.key === 'Enter' && atual) {
        e.preventDefault();
        aoEscolher(atual);
      }
    }
    window.addEventListener('keydown', aoTeclar);
    return () => window.removeEventListener('keydown', aoTeclar);
  }, [lista.length, atual, aoEscolher]);

  if (lista.length === 0) {
    return (
      <div className="dk-respostas" tabIndex={0}>
        <div className="dk-respostas-vazio">
          Não há título de resposta pronta que contenha este texto.
        </div>
      </div>
    );
  }
  return (
    <div className="dk-respostas" tabIndex={0}>
      <div className="dk-respostas-lista" role="listbox">
        {lista.map((r, i) => (
          <button
            key={r.id}
            type="button"
            role="option"
            aria-selected={atual?.id === r.id}
            className="dk-respostas-item"
            onMouseEnter={() => setIndice(i)}
            onClick={() => aoEscolher(r)}
          >
            {r.titulo}
            <small>/{r.atalho}</small>
          </button>
        ))}
      </div>
      <div className="dk-respostas-previa">
        <div className="dk-respostas-previa-rotulo">Pré-visualização</div>
        <div className="dk-respostas-previa-corpo">{atual?.corpo}</div>
        <div className="dk-respostas-previa-pe">
          Pressione <strong>Enter</strong> para selecionar
        </div>
      </div>
    </div>
  );
}

/**
 * When the window has closed, choose an approved template, fill `{{1}}`, `{{2}}` and later variables in order, and send through `POST /v1/conversas/:id/mensagens` with `template_id` and `parametros`.
 */
function TemplateModal({
  conversation,
  templates,
  aoFechar,
  aoEnviar,
}: {
  conversation: ConversationOpen;
  templates: TemplateAprovado[];
  aoFechar: () => void;
  aoEnviar: () => void;
}) {
  const [templateId, setTemplateId] = useState(templates[0]?.id ?? '');
  const [parametros, setParametros] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const template = templates.find((t) => t.id === templateId) ?? null;
  const variables = Array.isArray(template?.variables) ? (template.variables as string[]) : [];

  async function enviar() {
    if (!template) return;
    setEnviando(true);
    setError(null);
    try {
      await api.post(`/v1/conversations/${conversation.id}/messages`, {
        tipo: 'template',
        template_id: template.id,
        parametros: variables.map((_, i) => parametros[i] ?? ''),
      });
      atualizarLeituras();
      aoEnviar();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao enviar mensagem ativa');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="dk-veu" role="presentation" onClick={aoFechar}>
      <div
        className="dk-modal"
        role="dialog"
        aria-labelledby="modelo-titulo"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="modelo-titulo">Enviar mensagem ativa · Ticket {numeroDoTicket(conversation.id)}</h2>
        {templates.length === 0 ? (
          <p>Nenhum modelo de mensagem aprovado para este canal.</p>
        ) : (
          <>
            <label htmlFor="modelo">Modelo de mensagem</label>
            <select id="modelo" value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.nome}
                </option>
              ))}
            </select>
            {variables.map((v, i) => (
              <div key={v}>
                <label htmlFor={`var-${i}`}>{v}</label>
                <input
                  id={`var-${i}`}
                  type="text"
                  value={parametros[i] ?? ''}
                  onChange={(e) => {
                    const novo = [...parametros];
                    novo[i] = e.target.value;
                    setParametros(novo);
                  }}
                />
              </div>
            ))}
            <p style={{ whiteSpace: 'pre-line' }}>{template?.corpo}</p>
          </>
        )}
        {error ? <p className="dk-erro">{error}</p> : null}
        <div className="dk-modal-acoes">
          <button type="button" className="dk-botao dk-botao-secundario" onClick={aoFechar}>
            Cancelar
          </button>
          <button
            type="button"
            className="dk-botao"
            onClick={() => void enviar()}
            disabled={!template || enviando}
          >
            Enviar
          </button>
        </div>
      </div>
    </div>
  );
}
