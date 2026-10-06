import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import type { ChannelOfFlowInScreen } from '@pipe/contracts';
import { Botao, Campo, Etiqueta } from '@pipe/ui';
import { api, ApiError } from '@pipe/ui/api';
import { ConfirmModal } from '@pipe/ui/modal';
import { atualizarLeituras } from '../../../../lib/actions';
import { useRead } from '../../../../lib/query';
import { connectChannelToFlow } from '../../../../lib/channels-gravar';
import { useContact } from '../../contact';
import { ChannelLogo } from '../channels';
import { ChannelShell, type ChannelTab } from '../shell-of-channel';
import { GREETING_MAX, parseOrigins, pipeChatSnippet } from './regras';
import './pipe-chat.css';

/**
 * Pipe Chat inside the bot, in the same frame as WhatsApp, Instagram and Messenger (`ChannelShell`): tabs "Visão Geral" (status and the embed snippet) and "Configurações" (allowed sites, display name, greeting, key). The Blip Chat channel has the same two tabs; its Configurações tab lists Domínios do Chatbot, Nome de exibição, Receber arquivos and Cores (`referencias-blip/canais/roteador/LEIA.md`). Receber arquivos and Cores are not built yet (phase 03.4).
 */

interface WidgetChannel {
  id: string;
  name: string;
  active: boolean;
  widgetKey: string;
  allowedOrigins: string[];
  greeting: string;
}

const ABAS: readonly ChannelTab[] = [
  { rotulo: 'Visão Geral', segment: '' },
  { rotulo: 'Configurações', segment: 'configuracoes', exigeConectado: true },
];

const NAME_MAX = 40;

function messageOf(error: unknown, fallback: string): string {
  return error instanceof ApiError && error.message ? error.message : fallback;
}

export function PagePipeChat() {
  const { contact } = useContact();
  const channels = useRead<{ data: WidgetChannel[] }>('/v1/management/widget-channels');
  const linked = useRead<ChannelOfFlowInScreen>(`/v1/management/flows/${contact.id}/channel`);
  const onSettings = useLocation().pathname.replace(/\/$/, '').endsWith('/configuracoes');

  const channel = channels.data?.data.find((item) => item.active) ?? null;
  const linkedIds = linked.data?.channels.filter((item) => item.ativo).map((item) => item.id) ?? [];
  const isLinked = channel ? linkedIds.includes(channel.id) : false;

  return (
    <ChannelShell raizPropria="pipe-chat" titulo="Pipe Chat" abas={ABAS} conectado={isLinked}>
      {channels.error || linked.error ? (
        <div className="pcc-estado" role="alert">
          <p>Não foi possível carregar o Pipe Chat.</p>
          <Botao
            type="button"
            onClick={() => {
              void channels.refetch();
              void linked.refetch();
            }}
          >
            Tentar novamente
          </Botao>
        </div>
      ) : !channels.data || !linked.data ? (
        <p className="pcc-estado" aria-busy="true">Carregando…</p>
      ) : !channel ? (
        <SemCanal flowId={contact.id} />
      ) : !isLinked ? (
        <LinkNotice flowId={contact.id} channelId={channel.id} />
      ) : onSettings ? (
        <Configuracoes key={`${channel.id}:${channel.widgetKey}`} channel={channel} />
      ) : (
        <VisaoGeral channel={channel} />
      )}
    </ChannelShell>
  );
}

function SemCanal({ flowId }: { flowId: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create() {
    setBusy(true);
    setError(null);
    try {
      const created = await api.post<WidgetChannel>('/v1/management/widget-channels', { name: 'Pipe Chat' });
      const result = await connectChannelToFlow(flowId, created.id);
      if (!result.ok) setError(result.error);
    } catch (e) {
      setError(messageOf(e, 'Não foi possível criar o Pipe Chat.'));
    } finally {
      setBusy(false);
      atualizarLeituras();
    }
  }

  return (
    <div className="cb-linha">
      <div className="cb-icon-column">
        <ChannelLogo nome="pipe" />
      </div>
      <div className="cb-column">
        <p className="cb-typo-16">
          Coloque um chat do Pipe no seu site para conversar com seus visitantes através deste bot.
        </p>
        {error ? <Etiqueta tom="erro">{error}</Etiqueta> : null}
        <div className="cb-actions-right">
          <Botao type="button" variante="primario" disabled={busy} onClick={() => void create()}>
            {busy ? 'Criando…' : 'Criar Pipe Chat'}
          </Botao>
        </div>
      </div>
    </div>
  );
}

function LinkNotice({ flowId, channelId }: { flowId: string; channelId: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="cb-linha">
      <div className="cb-icon-column">
        <ChannelLogo nome="pipe" />
      </div>
      <div className="cb-column">
        <p className="cb-typo-16">O Pipe Chat existe, mas ainda não está ligado a este bot.</p>
        {error ? <Etiqueta tom="erro">{error}</Etiqueta> : null}
        <div className="cb-actions-right">
          <Botao
            type="button"
            variante="primario"
            disabled={busy}
            onClick={() => {
              setBusy(true);
              setError(null);
              void connectChannelToFlow(flowId, channelId).then((result) => {
                setBusy(false);
                if (!result.ok) setError(result.error);
              });
            }}
          >
            {busy ? 'Ligando…' : 'Ligar a este bot'}
          </Botao>
        </div>
      </div>
    </div>
  );
}

function VisaoGeral({ channel }: { channel: WidgetChannel }) {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!copied) return undefined;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);

  const snippet = pipeChatSnippet({ scriptOrigin: window.location.origin, key: channel.widgetKey });

  async function copy() {
    try {
      await navigator.clipboard.writeText(snippet);
      setCopied(true);
      setError(null);
    } catch {
      setError('Não foi possível copiar. Selecione o código e copie manualmente.');
    }
  }

  return (
    <div className="cb-linha">
      <div className="cb-icon-column">
        <ChannelLogo nome="pipe" />
      </div>
      <div className="cb-column">
        <p className="cb-typo-16">
          <strong>Seu chatbot está conectado ao Pipe Chat.</strong>
        </p>
        <p className="cb-typo-16">
          Cole o código abaixo nas páginas do seu site onde o chat deve aparecer. A conversa chega ao atendimento deste bot.
        </p>
        <pre className="pcc-codigo" tabIndex={0}>
          {snippet}
        </pre>
        {error ? <Etiqueta tom="erro">{error}</Etiqueta> : null}
        <div className="cb-actions-right">
          <Botao type="button" variante="primario" onClick={() => void copy()}>
            {copied ? 'Copiado' : 'Copiar código'}
          </Botao>
        </div>
      </div>
    </div>
  );
}

function Configuracoes({ channel }: { channel: WidgetChannel }) {
  const [origins, setOrigins] = useState(channel.allowedOrigins.join('\n'));
  const [name, setName] = useState(channel.name);
  const [greeting, setGreeting] = useState(channel.greeting);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ tone: 'sucesso' | 'erro'; text: string } | null>(null);
  const [rotating, setRotating] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [rotateError, setRotateError] = useState<string | null>(null);

  const parsed = parseOrigins(origins);

  async function save() {
    if (parsed.invalid.length) return;
    setSaving(true);
    setFeedback(null);
    try {
      await api.patch<WidgetChannel>(`/v1/management/widget-channels/${channel.id}`, {
        name: name.trim() || undefined,
        allowedOrigins: parsed.valid,
        greeting: greeting.trim(),
      });
      setFeedback({ tone: 'sucesso', text: 'Configuração salva.' });
      atualizarLeituras();
    } catch (e) {
      setFeedback({ tone: 'erro', text: messageOf(e, 'Não foi possível salvar.') });
    } finally {
      setSaving(false);
    }
  }

  async function rotate() {
    setRotating(true);
    setRotateError(null);
    try {
      await api.patch<WidgetChannel>(`/v1/management/widget-channels/${channel.id}`, { rotateKey: true });
      setConfirming(false);
      atualizarLeituras();
    } catch (e) {
      setRotateError(messageOf(e, 'Não foi possível gerar a nova chave.'));
    } finally {
      setRotating(false);
    }
  }

  return (
    <div className="cb-linha">
      <div className="cb-icon-column">
        <ChannelLogo nome="pipe" />
      </div>
      <div className="pcc-coluna">
        <label className="pcc-rotulo pcc-primeiro" htmlFor="pcc-origins">
          Sites permitidos (um por linha)
        </label>
        <textarea
          id="pcc-origins"
          className="campo pcc-origens"
          rows={4}
          value={origins}
          placeholder="https://www.seusite.com.br"
          onChange={(e) => setOrigins(e.target.value)}
        />
        <span className="pcc-ajuda">
          Só os sites desta lista podem abrir o chat. Use o endereço completo, com https://.
        </span>
        {parsed.invalid.length ? (
          <Etiqueta tom="erro">Endereços inválidos: {parsed.invalid.join(', ')}</Etiqueta>
        ) : null}

        <label className="pcc-rotulo" htmlFor="pcc-name">
          Nome de exibição
        </label>
        <Campo id="pcc-name" value={name} maxLength={NAME_MAX} onChange={(e) => setName(e.target.value)} />
        <span className="pcc-ajuda">Aparece no topo da janela do chat.</span>

        <label className="pcc-rotulo" htmlFor="pcc-greeting">
          Mensagem de boas-vindas
        </label>
        <Campo
          id="pcc-greeting"
          value={greeting}
          maxLength={GREETING_MAX}
          onChange={(e) => setGreeting(e.target.value)}
        />
        <span className="pcc-ajuda">
          {greeting.length}/{GREETING_MAX}
        </span>

        <div className="pcc-acoes">
          <Botao
            type="button"
            variante="primario"
            disabled={saving || parsed.invalid.length > 0}
            onClick={() => void save()}
          >
            {saving ? 'Salvando…' : 'Salvar'}
          </Botao>
          {feedback ? <Etiqueta tom={feedback.tone}>{feedback.text}</Etiqueta> : null}
        </div>

        <hr className="pcc-divisoria" />
        <span className="pcc-rotulo pcc-rotulo-secao">Chave do chat</span>
        <span className="pcc-ajuda">
          Gerar uma nova chave desativa a atual nos sites onde o código já foi colado.
        </span>
        <div className="pcc-acoes">
          <Botao type="button" variante="perigo" onClick={() => setConfirming(true)}>
            Gerar nova chave
          </Botao>
        </div>

        <ConfirmModal
          aberto={confirming}
          titulo="Gerar nova chave?"
          message="A chave atual deixa de funcionar nos sites onde o código já foi colado."
          error={rotateError}
          confirmando={rotating}
          rotuloConfirmar="Gerar nova chave"
          onConfirmar={() => void rotate()}
          onCancelar={() => {
            setConfirming(false);
            setRotateError(null);
          }}
        />
      </div>
    </div>
  );
}
