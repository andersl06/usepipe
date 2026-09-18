import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import type { ConversaAberta, RespostaProntaDoDesk, TemplateAprovado } from '@pipe/contracts';
import { IconeDesk } from '../../componentes/icones-desk';
import { api } from '../../lib/api';
import { atualizarLeituras } from '../../lib/acoes';
import { janelaAberta } from '../../lib/ordem';
import { numeroDoTicket } from '../../lib/canal';

/**
 * O compositor — `.pane-chat-message-input` da referência
 * (`~/desk-clone/capturas/parciais/composer.html`): um `bds-paper` com o
 * `textarea` ("Escreva uma mensagem...") em cima e a faixa de ações embaixo:
 * à esquerda resposta pronta (`ab`), anexo, emoji; à direita o áudio como
 * PRIMÁRIO, que vira o botão de enviar quando há texto.
 *
 * Quando a conversa não aceita texto livre, o compositor inteiro dá lugar a um
 * bloco centrado com uma linha e um botão — os casos do i18n de lá:
 * `standbyInputLock`, `clientClosed`, `clientClosedInactivity`,
 * `attendantClosed`; e a janela de 24h fechada
 * (`failedMaxTimeChannelInterval`), que aqui abre o envio de modelo.
 *
 * Enviar vai para `POST /v1/conversas/:id/mensagens` (texto, anexo ou template).
 * A nota interna não passa por aqui: é o "Comentário" do painel do contato.
 */
export function Compositor({
  conversa,
  respostas,
  templates,
  agora,
  aoEnviar,
}: {
  conversa: ConversaAberta;
  respostas: RespostaProntaDoDesk[];
  templates: TemplateAprovado[];
  agora: Date;
  aoEnviar: () => void;
}) {
  const [texto, setTexto] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [painelRespostas, setPainelRespostas] = useState(false);
  const [modeloAberto, setModeloAberto] = useState(false);
  const campo = useRef<HTMLTextAreaElement>(null);
  const arquivo = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setTexto('');
    setErro(null);
    setPainelRespostas(false);
    campo.current?.focus();
  }, [conversa.id]);

  /* O piso e o teto do campo (4em a 11.5em): cresce com o texto. */
  useEffect(() => {
    const el = campo.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.max(64, Math.min(184, el.scrollHeight))}px`;
  }, [texto]);

  if (conversa.estado === 'em_espera') {
    return (
      <Fechado
        titulo="Retire o cliente do Modo de espera clicando no botão abaixo."
        botao="Remover do Modo de Espera"
        aoClicar={async () => {
          await api.post(`/v1/conversas/${conversa.id}/espera`);
          atualizarLeituras();
        }}
      />
    );
  }
  if (conversa.estado === 'encerrada') {
    return (
      <Fechado
        titulo="Conversa encerrada pelo atendente."
        descricao="Envie uma nova mensagem para reabrir a conversa."
      />
    );
  }

  const aberta = janelaAberta(conversa.janelaExpiraEm, conversa.canalTipo, agora);

  async function enviar() {
    const corpo = texto.trim();
    if (!corpo || enviando) return;
    setEnviando(true);
    setErro(null);
    try {
      await api.post(`/v1/conversas/${conversa.id}/mensagens`, { texto: corpo, tipo: 'texto' });
      atualizarLeituras();
      setTexto('');
      aoEnviar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Ocorreu um erro ao enviar a mensagem.');
    } finally {
      setEnviando(false);
      campo.current?.focus();
    }
  }

  async function anexar(lista: FileList | null) {
    const f = lista?.[0];
    if (!f) return;
    setEnviando(true);
    setErro(null);
    try {
      const resposta = await fetch(`/v1/anexos?nome=${encodeURIComponent(f.name)}`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': f.type || 'application/octet-stream' },
        body: f,
      });
      if (!resposta.ok) throw new Error('Não foi possível enviar o arquivo.');
      const anexo = (await resposta.json()) as { id: string; tipo: string };
      await api.post(`/v1/conversas/${conversa.id}/mensagens`, {
        anexo_id: anexo.id,
        tipo: anexo.tipo,
      });
      atualizarLeituras();
      aoEnviar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível enviar o arquivo.');
    } finally {
      setEnviando(false);
      if (arquivo.current) arquivo.current.value = '';
    }
  }

  function aoTeclar(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey && !painelRespostas) {
      e.preventDefault();
      void enviar();
    }
    if (e.key === 'Escape') setPainelRespostas(false);
  }

  function usarResposta(r: RespostaProntaDoDesk) {
    setTexto(r.corpo);
    setPainelRespostas(false);
    campo.current?.focus();
  }

  if (!aberta) {
    return (
      <>
        <Fechado
          titulo="A janela de 24 horas de conversação foi excedida. Envie uma mensagem ativa para retomar o atendimento."
          botao="Enviar mensagem ativa"
          aoClicar={() => setModeloAberto(true)}
        />
        {modeloAberto ? (
          <ModalDeModelo
            conversa={conversa}
            templates={templates}
            aoFechar={() => setModeloAberto(false)}
            aoEnviar={() => {
              setModeloAberto(false);
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
        {painelRespostas ? (
          <PainelDeRespostas respostas={respostas} termo={texto} aoEscolher={usarResposta} />
        ) : null}
        <div className="dk-compositor-miolo">
          <div className="dk-compositor-campo">
            <textarea
              ref={campo}
              id="text-input"
              placeholder="Escreva uma mensagem..."
              value={texto}
              spellCheck
              onChange={(e) => setTexto(e.target.value)}
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
                aria-expanded={painelRespostas}
                onClick={() => setPainelRespostas((v) => !v)}
              >
                <IconeDesk nome="resposta-pronta" />
              </button>
              <button
                type="button"
                className="dk-botao-icone"
                id="send-file-btn"
                title="Enviar arquivos (máximo de 10 arquivos por envio)"
                aria-label="Enviar arquivos (máximo de 10 arquivos por envio)"
                onClick={() => arquivo.current?.click()}
              >
                <IconeDesk nome="anexo" />
              </button>
              <input
                ref={arquivo}
                type="file"
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
              /* ponytail: gravação de áudio depende do MediaRecorder + anexo; o botão fica primário como lá. */
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
      {erro ? <p className="dk-erro">{erro}</p> : null}
    </div>
  );
}

/** O bloco que substitui o compositor (piso de 150px, uma linha e um botão). */
function Fechado({
  titulo,
  descricao,
  botao,
  aoClicar,
}: {
  titulo: string;
  descricao?: string;
  botao?: string;
  aoClicar?: () => void | Promise<void>;
}) {
  return (
    <div className="dk-compositor">
      <div className="dk-compositor-fechado">
        <div>
          <b>{titulo}</b>
          {descricao ? <div>{descricao}</div> : null}
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
 * O painel de respostas prontas (`.custom-reply`): lista à esquerda,
 * pré-visualização à direita ("Pré-visualização" / "Pressione Enter para
 * selecionar"); sem resultado, "Não há título de resposta pronta que
 * contenha este texto.". Filtra pelo título com o que está no campo.
 */
function PainelDeRespostas({
  respostas,
  termo,
  aoEscolher,
}: {
  respostas: RespostaProntaDoDesk[];
  termo: string;
  aoEscolher: (r: RespostaProntaDoDesk) => void;
}) {
  const [indice, setIndice] = useState(0);
  const filtro = termo.trim().replace(/^\//, '').toLowerCase();
  const lista = respostas.filter(
    (r) =>
      !filtro || r.titulo.toLowerCase().includes(filtro) || r.atalho.toLowerCase().includes(filtro),
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
 * O envio de modelo (template aprovado) quando a janela fechou: escolhe o
 * modelo, preenche as variáveis na ordem `{{1}}`, `{{2}}`… e envia por
 * `POST /v1/conversas/:id/mensagens` com `template_id` e `parametros`.
 */
function ModalDeModelo({
  conversa,
  templates,
  aoFechar,
  aoEnviar,
}: {
  conversa: ConversaAberta;
  templates: TemplateAprovado[];
  aoFechar: () => void;
  aoEnviar: () => void;
}) {
  const [templateId, setTemplateId] = useState(templates[0]?.id ?? '');
  const [parametros, setParametros] = useState<string[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const template = templates.find((t) => t.id === templateId) ?? null;
  const variaveis = Array.isArray(template?.variaveis) ? (template.variaveis as string[]) : [];

  async function enviar() {
    if (!template) return;
    setEnviando(true);
    setErro(null);
    try {
      await api.post(`/v1/conversas/${conversa.id}/mensagens`, {
        tipo: 'template',
        template_id: template.id,
        parametros: variaveis.map((_, i) => parametros[i] ?? ''),
      });
      atualizarLeituras();
      aoEnviar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro ao enviar mensagem ativa');
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
        <h2 id="modelo-titulo">Enviar mensagem ativa · Ticket {numeroDoTicket(conversa.id)}</h2>
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
            {variaveis.map((v, i) => (
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
        {erro ? <p className="dk-erro">{erro}</p> : null}
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
