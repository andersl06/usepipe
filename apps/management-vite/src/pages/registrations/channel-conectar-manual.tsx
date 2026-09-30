import { useId, useState, type FormEvent, type ReactNode } from 'react';
import { Botao, Campo, Etiqueta, type VarianteDeBotao } from '@pipe/ui';
import { Modal } from '@pipe/ui/modal';
import { atualizarLeituras } from '../../lib/actions';
import type {
  ChannelInstagramVisible,
  ChannelMessengerVisible,
  ChannelWhatsAppVisible,
} from '../../lib/channels';
import {
  conectarInstagramManual,
  conectarMessengerManual,
  conectarWhatsappManual,
  type ChannelConnected,
} from '../../lib/channels-gravar';
import { secretFieldVisualState } from '../../lib/secret-field';
import './channel-conectar-manual.css';

interface Props<T> {
  flowId?: string;
  channelId?: string;
  values?: { wabaId?: string; numeroId?: string };
  rotulo?: string;
  variante?: VarianteDeBotao;
  onConectado?: (channel: T) => void;
}

function Field({
  name,
  label,
  help,
  required = true,
  initial,
  secret = false,
  readOnly = false,
}: {
  name: string;
  label: string;
  help?: string;
  required?: boolean;
  initial?: string;
  secret?: boolean;
  readOnly?: boolean;
}) {
  const [visible, setVisible] = useState(false);
  const inputId = useId();
  const helpId = useId();
  const secretState = secretFieldVisualState(visible);
  return (
    <div className="cc-campo">
      <label className="cc-campo-rotulo" htmlFor={inputId}>
        {label}
      </label>
      <span
        className={secret ? 'cc-campo-controle cc-campo-controle--secreto' : 'cc-campo-controle'}
      >
        <Campo
          id={inputId}
          name={name}
          type={secret ? secretState.type : 'text'}
          required={required}
          defaultValue={initial}
          readOnly={readOnly}
          autoComplete="off"
          autoCapitalize="off"
          aria-describedby={help ? helpId : undefined}
        />
        {secret ? (
          <button
            className="cc-campo-olho"
            type="button"
            aria-label={`${secretState.action} ${label}`}
            aria-pressed={visible}
            aria-controls={inputId}
            onClick={() => setVisible((value) => !value)}
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              {secretState.icon === 'eye-off' ? (
                <>
                  <path d="M3 3l18 18" />
                  <path d="M10.58 10.59a2 2 0 0 0 2.83 2.83" />
                  <path d="M9.88 5.1A10.9 10.9 0 0 1 12 4.9c4.6 0 8.4 2.9 10 7.1a11 11 0 0 1-3.05 4.35" />
                  <path d="M6.6 6.6A11.4 11.4 0 0 0 2 12c1.6 4.2 5.4 7.1 10 7.1 1.4 0 2.75-.27 3.95-.77" />
                </>
              ) : (
                <>
                  <path d="M2 12s3.6-7.1 10-7.1S22 12 22 12s-3.6 7.1-10 7.1S2 12 2 12Z" />
                  <circle cx="12" cy="12" r="3" />
                </>
              )}
            </svg>
          </button>
        ) : null}
      </span>
      {help ? (
        <span className="cc-campo-ajuda" id={helpId}>
          {help}
        </span>
      ) : null}
    </div>
  );
}

function Actions({
  sending,
  onCancel,
  label = 'Conectar',
}: {
  sending: boolean;
  onCancel: () => void;
  label?: string;
}) {
  return (
    <div className="cc-acoes">
      <Botao type="button" onClick={onCancel} disabled={sending}>
        Cancelar
      </Botao>
      <Botao type="submit" variante="primario" disabled={sending}>
        {sending ? 'Salvando…' : label}
      </Botao>
    </div>
  );
}

function WebhookReady({
  webhook,
  webhookError,
  onClose,
}: {
  webhook: { url: string; verifyToken: string };
  webhookError: string | null;
  onClose: () => void;
}) {
  return (
    <div className="cc-formulario">
      <Etiqueta tom="sucesso">Canal conectado.</Etiqueta>
      {webhookError ? (
        <Etiqueta tom="alerta">
          Não foi possível configurar o webhook automaticamente. Cadastre os dados abaixo no
          aplicativo.
        </Etiqueta>
      ) : null}
      <p className="cc-introducao">Use estes dados na configuração de webhook do aplicativo.</p>
      <Field name="url" label="URL de callback" initial={webhook.url} readOnly />
      <Field
        name="verifyToken"
        label="Token de verificação"
        initial={webhook.verifyToken}
        secret
        readOnly
      />
      <div className="cc-acoes">
        <Botao type="button" variante="primario" onClick={onClose}>
          Concluir
        </Botao>
      </div>
    </div>
  );
}

function FormModal({
  open,
  title,
  onClose,
  busy = false,
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  busy?: boolean;
  children: ReactNode;
}) {
  return (
    <Modal aberto={open} titulo={title} onFechar={busy ? undefined : onClose}>
      {children}
    </Modal>
  );
}

export function ConectarWhatsappManual({
  flowId,
  channelId,
  values,
  rotulo = 'Conectar WhatsApp',
  variante = 'padrao',
  onConectado,
}: Props<ChannelWhatsAppVisible>) {
  const [open, setOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<ChannelConnected<ChannelWhatsAppVisible> | null>(null);
  function close() {
    setOpen(false);
    setError(null);
    if (success) {
      onConectado?.(success.channel);
      atualizarLeituras();
    }
    setSuccess(null);
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSending(true);
    setError(null);
    const data = new FormData(event.currentTarget);
    const result = await conectarWhatsappManual({
      wabaId: String(data.get('wabaId') ?? '').trim(),
      numeroId: String(data.get('numeroId') ?? '').trim(),
      token: String(data.get('token') ?? '').trim(),
      appSecret: String(data.get('appSecret') ?? '').trim(),
      nome: String(data.get('nome') ?? '').trim() || undefined,
      ...(flowId ? { flowId } : {}),
      ...(channelId ? { channelId } : {}),
    });
    setSending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setSuccess(result.value);
  }
  return (
    <>
      <Botao type="button" variante={variante} onClick={() => setOpen(true)}>
        {rotulo}
      </Botao>
      <FormModal
        open={open}
        title={channelId ? 'Atualizar conexão do WhatsApp' : 'Conectar WhatsApp'}
        onClose={close}
        busy={sending}
      >
        {success ? (
          <WebhookReady
            webhook={success.webhook}
            webhookError={success.webhookError}
            onClose={close}
          />
        ) : (
          <form className="cc-formulario" onSubmit={(event) => void submit(event)}>
            <p className="cc-introducao">
              Informe as credenciais do aplicativo e do número que receberá as mensagens. Os dados
              sensíveis ficam ocultos por padrão.
            </p>
            <div className="cc-grade">
              <Field name="wabaId" label="ID da conta do WhatsApp" initial={values?.wabaId} />
              <Field name="numeroId" label="ID do número de telefone" initial={values?.numeroId} />
            </div>
            <Field name="token" label="Token de acesso" secret />
            <Field
              name="appSecret"
              label="Chave secreta do aplicativo"
              help="Disponível nas configurações básicas do aplicativo na Meta."
              secret
            />
            <Field
              name="nome"
              label="Nome para identificar o canal"
              help="Opcional"
              required={false}
            />
            {error ? <Etiqueta tom="erro">{error}</Etiqueta> : null}
            <Actions
              sending={sending}
              onCancel={close}
              label={channelId ? 'Salvar credenciais' : 'Conectar'}
            />
          </form>
        )}
      </FormModal>
    </>
  );
}

export function ConectarInstagramManual({
  flowId,
  channelId,
  rotulo = 'Conectar Instagram',
  variante = 'padrao',
  onConectado,
}: Props<ChannelInstagramVisible>) {
  const [open, setOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<ChannelConnected<ChannelInstagramVisible> | null>(null);
  function close() {
    setOpen(false);
    setError(null);
    if (success) {
      onConectado?.(success.channel);
      atualizarLeituras();
    }
    setSuccess(null);
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSending(true);
    setError(null);
    const data = new FormData(event.currentTarget);
    const result = await conectarInstagramManual({
      token: String(data.get('token') ?? '').trim(),
      appSecret: String(data.get('appSecret') ?? '').trim(),
      nome: String(data.get('nome') ?? '').trim() || undefined,
      ...(flowId ? { flowId } : {}),
      ...(channelId ? { channelId } : {}),
    });
    setSending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setSuccess(result.value);
  }
  return (
    <>
      <Botao type="button" variante={variante} onClick={() => setOpen(true)}>
        {rotulo}
      </Botao>
      <FormModal
        open={open}
        title={channelId ? 'Atualizar conexão do Instagram' : 'Conectar Instagram'}
        onClose={close}
        busy={sending}
      >
        {success ? (
          <WebhookReady
            webhook={success.webhook}
            webhookError={success.webhookError}
            onClose={close}
          />
        ) : (
          <form className="cc-formulario" onSubmit={(event) => void submit(event)}>
            <p className="cc-introducao">
              Informe as credenciais do aplicativo vinculado à conta profissional do Instagram.
            </p>
            <Field name="token" label="Token de acesso" secret />
            <Field
              name="appSecret"
              label="Chave secreta do aplicativo"
              help="Disponível nas configurações básicas do aplicativo na Meta."
              secret
            />
            <Field
              name="nome"
              label="Nome para identificar o canal"
              help="Opcional"
              required={false}
            />
            {error ? <Etiqueta tom="erro">{error}</Etiqueta> : null}
            <Actions sending={sending} onCancel={close} label={channelId ? 'Salvar credenciais' : 'Conectar'} />
          </form>
        )}
      </FormModal>
    </>
  );
}

export function ConectarMessengerManual({
  flowId,
  rotulo = 'Conectar Messenger',
  variante = 'padrao',
  onConectado,
}: Props<ChannelMessengerVisible>) {
  const [open, setOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<ChannelConnected<ChannelMessengerVisible> | null>(null);
  function close() {
    setOpen(false);
    setError(null);
    if (success) {
      onConectado?.(success.channel);
      atualizarLeituras();
    }
    setSuccess(null);
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSending(true);
    setError(null);
    const data = new FormData(event.currentTarget);
    const result = await conectarMessengerManual({
      token: String(data.get('token') ?? '').trim(),
      appSecret: String(data.get('appSecret') ?? '').trim(),
      nome: String(data.get('nome') ?? '').trim() || undefined,
      ...(flowId ? { flowId } : {}),
    });
    setSending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setSuccess(result.value);
  }
  return (
    <>
      <Botao type="button" variante={variante} onClick={() => setOpen(true)}>
        {rotulo}
      </Botao>
      <FormModal open={open} title="Conectar Messenger" onClose={close} busy={sending}>
        {success ? (
          <WebhookReady
            webhook={success.webhook}
            webhookError={success.webhookError}
            onClose={close}
          />
        ) : (
          <form className="cc-formulario" onSubmit={(event) => void submit(event)}>
            <p className="cc-introducao">
              Informe as credenciais do aplicativo e da Página que receberá as mensagens.
            </p>
            <Field name="token" label="Token de acesso da Página" secret />
            <Field
              name="appSecret"
              label="Chave secreta do aplicativo"
              help="Disponível nas configurações básicas do aplicativo na Meta."
              secret
            />
            <Field
              name="nome"
              label="Nome para identificar o canal"
              help="Opcional"
              required={false}
            />
            {error ? <Etiqueta tom="erro">{error}</Etiqueta> : null}
            <Actions sending={sending} onCancel={close} />
          </form>
        )}
      </FormModal>
    </>
  );
}
