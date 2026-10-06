import { useEffect, useState } from 'react';
import type { ChannelOfFlowInScreen } from '@pipe/contracts';
import { Botao, Campo, Etiqueta } from '@pipe/ui';
import { api, ApiError } from '@pipe/ui/api';
import { ConfirmModal } from '@pipe/ui/modal';
import { IconePortal } from '@pipe/ui/icones-portal';
import Link from '../../../../components/link';
import { atualizarLeituras } from '../../../../lib/actions';
import { useRead } from '../../../../lib/query';
import { connectChannelToFlow } from '../../../../lib/channels-gravar';
import { ShellModule, contactPath, useContact } from '../../contact';
import { ChannelLogo } from '../channels';
import { GREETING_MAX, parseOrigins, pipeChatSnippet } from './regras';
import '../../integrations/header-of-page.css';
import '../../integrations/integrations.css';
import './pipe-chat.css';

/**
 * Pipe Chat inside the bot: create the web widget channel, link it to this bot, edit the allowed origins and greeting, and copy the embed snippet.
 */

interface WidgetChannel {
  id: string;
  name: string;
  active: boolean;
  widgetKey: string;
  allowedOrigins: string[];
  greeting: string;
}

function messageOf(error: unknown, fallback: string): string {
  return error instanceof ApiError && error.message ? error.message : fallback;
}

export function PagePipeChat() {
  const { contact } = useContact();
  const base = contactPath(contact);
  const channels = useRead<{ data: WidgetChannel[] }>('/v1/management/widget-channels');
  const linked = useRead<ChannelOfFlowInScreen>(`/v1/management/flows/${contact.id}/channel`);

  return (
    <ShellModule ativo="Canais">
      <header className="ph-cabecalho">
        <div className="ph-conteudo">
          <div className="ph-voltar-caixa">
            <Link className="ph-voltar" href={`${base}/channels`} aria-label="Voltar">
              <IconePortal nome="voltar" tamanho={22} />
            </Link>
          </div>
          <div className="ph-titulo-caixa">
            <h1 className="ph-titulo">Pipe Chat</h1>
          </div>
        </div>
      </header>

      <div className="ig-grade">
        <section className="ig-paper">
          <div className="ig-paper-core pcc-corpo">
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
            ) : (
              <Configuracao
                flowId={contact.id}
                channel={channels.data.data.find((item) => item.active) ?? null}
                linkedIds={linked.data.channels.filter((item) => item.ativo).map((item) => item.id)}
              />
            )}
          </div>
        </section>
      </div>
    </ShellModule>
  );
}

function Configuracao({
  flowId,
  channel,
  linkedIds,
}: {
  flowId: string;
  channel: WidgetChannel | null;
  linkedIds: string[];
}) {
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

  if (!channel) {
    return (
      <div className="pcc-linha">
        <ChannelLogo nome="pipe" />
        <div className="pcc-coluna">
          <p>Coloque um chat do Pipe no seu site para conversar com seus visitantes através deste bot.</p>
          {error ? <Etiqueta tom="erro">{error}</Etiqueta> : null}
          <div>
            <Botao type="button" variante="primario" disabled={busy} onClick={() => void create()}>
              {busy ? 'Criando…' : 'Criar Pipe Chat'}
            </Botao>
          </div>
        </div>
      </div>
    );
  }

  const isLinked = linkedIds.includes(channel.id);
  return (
    <div className="pcc-linha">
      <ChannelLogo nome="pipe" />
      <div className="pcc-coluna">
        {isLinked ? null : <LinkNotice flowId={flowId} channelId={channel.id} />}
        <Formulario key={`${channel.id}:${channel.widgetKey}`} channel={channel} />
      </div>
    </div>
  );
}

function LinkNotice({ flowId, channelId }: { flowId: string; channelId: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="pcc-aviso" role="status">
      <p>O Pipe Chat existe, mas ainda não está ligado a este bot.</p>
      {error ? <Etiqueta tom="erro">{error}</Etiqueta> : null}
      <div>
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
  );
}

function Formulario({ channel }: { channel: WidgetChannel }) {
  const [origins, setOrigins] = useState(channel.allowedOrigins.join('\n'));
  const [greeting, setGreeting] = useState(channel.greeting);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ tone: 'sucesso' | 'erro'; text: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [rotating, setRotating] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [rotateError, setRotateError] = useState<string | null>(null);

  useEffect(() => {
    if (!copied) return undefined;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);

  const parsed = parseOrigins(origins);
  const snippet = pipeChatSnippet({ scriptOrigin: window.location.origin, key: channel.widgetKey });

  async function save() {
    if (parsed.invalid.length) return;
    setSaving(true);
    setFeedback(null);
    try {
      await api.patch<WidgetChannel>(`/v1/management/widget-channels/${channel.id}`, {
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

  async function copy() {
    try {
      await navigator.clipboard.writeText(snippet);
      setCopied(true);
    } catch {
      setFeedback({ tone: 'erro', text: 'Não foi possível copiar. Selecione o código e copie manualmente.' });
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
    <>
      <label className="pcc-rotulo" htmlFor="pcc-origins">
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
      <span className="pcc-rotulo pcc-rotulo-secao">Código para colar no seu site</span>
      <span className="pcc-ajuda">
        Cole antes do fechamento de &lt;/body&gt; nas páginas onde o chat deve aparecer. A conversa chega ao atendimento deste bot.
      </span>
      <pre className="pcc-codigo" tabIndex={0}>
        {snippet}
      </pre>
      <div className="pcc-acoes">
        <Botao type="button" onClick={() => void copy()}>
          {copied ? 'Copiado' : 'Copiar'}
        </Botao>
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
    </>
  );
}
