import { useState, type FormEvent, type ReactNode } from 'react';
import { Botao, Campo, Etiqueta, type VarianteDeBotao } from '@pipe/ui';
import { IconePortal } from '@pipe/ui/icones-portal';
import { Modal } from '@pipe/ui/modal';
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
import { estadoVisualDoCampoSecreto } from '../../lib/secret-field';
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
  const secretState = estadoVisualDoCampoSecreto(visible);
  return (
    <label className="cc-campo">
      <span className="cc-campo-rotulo">{label}</span>
      <span
        className={secret ? 'cc-campo-controle cc-campo-controle--secreto' : 'cc-campo-controle'}
      >
        <Campo
          name={name}
          type={secret ? secretState.tipo : 'text'}
          required={required}
          defaultValue={initial}
          readOnly={readOnly}
          autoComplete="off"
          autoCapitalize="off"
        />
        {secret ? (
          <button
            className={`cc-campo-olho cc-campo-olho--${secretState.icone}`}
            type="button"
            aria-label={`${secretState.acao} ${label}`}
            aria-pressed={visible}
            onClick={() => setVisible((value) => !value)}
          >
            <IconePortal nome="olho" tamanho={20} />
          </button>
        ) : null}
      </span>
      {help ? <span className="cc-campo-ajuda">{help}</span> : null}
    </label>
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
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <Modal aberto={open} titulo={title} onFechar={onClose}>
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
    if (success) onConectado?.(success.channel);
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
    if (success) onConectado?.(success.channel);
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
      <FormModal open={open} title="Conectar Instagram" onClose={close}>
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
            <Actions sending={sending} onCancel={close} />
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
    if (success) onConectado?.(success.channel);
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
      <FormModal open={open} title="Conectar Messenger" onClose={close}>
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
