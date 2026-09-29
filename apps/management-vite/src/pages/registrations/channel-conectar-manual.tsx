import { useState, type FormEvent } from 'react';
import { Botao, Campo, Etiqueta, type VarianteDeBotao } from '@pipe/ui';
import type { ChannelInstagramVisible, ChannelWhatsAppVisible } from '../../lib/channels';
import type { ChannelMessengerVisible } from '../../lib/channels';
import {
  conectarInstagramManual,
  conectarMessengerManual,
  conectarWhatsappManual,
  type ChannelConnected,
} from '../../lib/channels-gravar';
import { Modal } from '@pipe/ui/modal';

/**
 * The manual path for connecting WhatsApp/Instagram — without an app approved by Meta, the embedded signup (`cadastro-embutido-whatsapp.tsx`) isn't an option for the average customer; this is the main path now (`POST /v1/canais/{whatsapp,instagram}/manual`, `canais.ts`/`canais-instagram.ts`).
 *
 * The two connection forms (`configuracao-manual.ts`/`instagram/canal.ts`) reject with `ErroPipe` WITHOUT `detalhe.campo` — unlike profile and preferences, which point to the field. So here the error only fits in a general banner, not under a specific field (a backend finding, not fixed here: the task only asks to consume it).
 */

const column = { display: 'flex', flexDirection: 'column' as const, gap: 'var(--p-e-3)' };
const rotulo = { display: 'flex', flexDirection: 'column' as const, gap: '4px' };

function CampoComRotulo({
  nome,
  rotuloTexto,
  ajuda,
  obrigatorio = true,
  desabilitado,
  tipo = 'text',
  valueInitial,
}: {
  nome: string;
  rotuloTexto: string;
  ajuda?: string;
  obrigatorio?: boolean;
  desabilitado?: boolean;
  tipo?: string;
  /** On reconnection, WABA and the number are already known: they come prefilled. */
  valueInitial?: string | undefined;
}) {
  return (
    <label style={rotulo}>
      <span className="sub">{rotuloTexto}</span>
      <Campo
        name={nome}
        type={tipo}
        required={obrigatorio}
        disabled={desabilitado}
        defaultValue={valueInitial}
        autoComplete="off"
      />
      {ajuda ? <span className="sub">{ajuda}</span> : null}
    </label>
  );
}

/**
 * What the three modals have in common, now that they live on the channel's page INSIDE THE BOT (`fluxo/canais/**`): `flowId` makes the channel born already linked to the bot (`fluxo_id` in the connection routes), and the button that opens the modal carries the label and variant of the screen hosting it.
 */
interface PropsDeConexaoManual<T> {
  flowId?: string;
  /**
   * RECONNECT this channel instead of creating another. The client token expires, and in the source the way out is to redo the connection on the same channel — there's no disconnect for WhatsApp (`FICHA-conectar-canal-no-bot.md` §5).
   */
  channelId?: string;
  /** Fills the form with what's already known about the channel. */
  values?: { wabaId?: string; numeroId?: string };
  rotulo?: string;
  variante?: VarianteDeBotao;
  onConectado?: (channel: T) => void;
}

export function ConectarMessengerManual({ flowId, rotulo = 'Conectar manualmente', variante = 'padrao', onConectado }: PropsDeConexaoManual<ChannelMessengerVisible>) {
  const [aberto, setAberto] = useState(false); const [enviando, setEnviando] = useState(false); const [error, setError] = useState<string | null>(null); const [sucesso, setSucesso] = useState<ChannelConnected<ChannelMessengerVisible> | null>(null);
  function fechar() { setAberto(false); setError(null); if (sucesso) onConectado?.(sucesso.channel); setSucesso(null); }
  async function enviar(evento: FormEvent<HTMLFormElement>) { evento.preventDefault(); setEnviando(true); const d = new FormData(evento.currentTarget); const r = await conectarMessengerManual({ token: String(d.get('token') ?? '').trim(), appSecret: String(d.get('appSecret') ?? '').trim(), nome: String(d.get('nome') ?? '').trim() || undefined, ...(flowId ? { flowId } : {}) }); setEnviando(false); if (!r.ok) { setError(r.error); return; } setSucesso(r.value); }
  return <><Botao type="button" variante={variante} onClick={() => setAberto(true)}>{rotulo}</Botao><Modal aberto={aberto} titulo="Conectar Facebook Messenger manualmente" onFechar={fechar}>{sucesso ? <WebhookPronto webhook={sucesso.webhook} webhookError={sucesso.webhookError} onFechar={fechar} /> : <form onSubmit={(e) => void enviar(e)} style={column}><p className="sub">No developers.facebook.com, abra o aplicativo do cliente: Messenger → Configurações. Gere um token de Página de longa duração e copie o App Secret em Configurações básicas. Depois de conectar, cole a URL e o verify token exibidos aqui no Webhooks do app.</p><CampoComRotulo nome="token" rotuloTexto="Token de acesso da Página" /><CampoComRotulo nome="appSecret" rotuloTexto="App Secret" ajuda="32 caracteres, só números e letras de a a f." /><CampoComRotulo nome="nome" rotuloTexto="Nome do canal (opcional)" obrigatorio={false} />{error ? <Etiqueta tom="erro">{error}</Etiqueta> : null}<div className="cl-actions"><Botao type="button" onClick={fechar} disabled={enviando}>Cancelar</Botao><Botao type="submit" variante="primario" disabled={enviando}>{enviando ? 'Conectando…' : 'Conectar'}</Botao></div></form>}</Modal></>;
}

/** O que sobra na tela depois de conectar: o cliente TEM de colar isto no app dele. */
function WebhookPronto({
  webhook,
  webhookError,
  onFechar,
}: {
  webhook: { url: string; verifyToken: string };
  webhookError: string | null;
  onFechar: () => void;
}) {
  return (
    <div style={column}>
      <Etiqueta tom="sucesso">Canal conectado.</Etiqueta>
      {webhookError ? (
        <Etiqueta tom="alerta">
          A assinatura automática do webhook falhou ({webhookError}). Cole os dados abaixo no painel
          do aplicativo mesmo assim.
        </Etiqueta>
      ) : null}
      <p className="sub">
        Cole estes dois valores no painel do seu aplicativo na Meta (Configuração do Webhook):
      </p>
      <label style={rotulo}>
        <span className="sub">URL de callback</span>
        <Campo value={webhook.url} readOnly onFocus={(e) => e.currentTarget.select()} />
      </label>
      <label style={rotulo}>
        <span className="sub">Verify token</span>
        <Campo value={webhook.verifyToken} readOnly onFocus={(e) => e.currentTarget.select()} />
      </label>
      <div className="cl-actions">
        <Botao type="button" variante="primario" onClick={onFechar}>
          Concluir
        </Botao>
      </div>
    </div>
  );
}

export function ConectarWhatsappManual({
  flowId,
  channelId,
  values,
  rotulo = 'Conectar manualmente',
  variante = 'padrao',
  onConectado,
}: PropsDeConexaoManual<ChannelWhatsAppVisible>) {
  const [aberto, setAberto] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState<ChannelConnected<ChannelWhatsAppVisible> | null>(null);

  function fechar() {
    setAberto(false);
    setError(null);
    if (sucesso) onConectado?.(sucesso.channel);
    setSucesso(null);
  }

  async function enviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setEnviando(true);
    setError(null);
    const data = new FormData(evento.currentTarget);
    const resultado = await conectarWhatsappManual({
      wabaId: String(data.get('wabaId') ?? '').trim(),
      numeroId: String(data.get('numeroId') ?? '').trim(),
      token: String(data.get('token') ?? '').trim(),
      appSecret: String(data.get('appSecret') ?? '').trim(),
      nome: String(data.get('nome') ?? '').trim() || undefined,
      ...(flowId ? { flowId } : {}),
      ...(channelId ? { channelId } : {}),
    });
    setEnviando(false);
    if (!resultado.ok) {
      setError(resultado.error);
      return;
    }
    setSucesso(resultado.value);
  }

  return (
    <>
      <Botao type="button" variante={variante} onClick={() => setAberto(true)}>
        {rotulo}
      </Botao>
      <Modal
        aberto={aberto}
        titulo={channelId ? 'Reconectar WhatsApp' : 'Conectar WhatsApp manualmente'}
        onFechar={fechar}
      >
        {sucesso ? (
          <WebhookPronto
            webhook={sucesso.webhook}
            webhookError={sucesso.webhookError}
            onFechar={fechar}
          />
        ) : (
          <form onSubmit={(e) => void enviar(e)} style={column}>
            <p className="sub">
              Onde encontrar cada dado no painel da Meta (business.facebook.com):
            </p>
            <ol className="sub" style={{ margin: 0, paddingLeft: '1.2em' }}>
              <li>
                <b>WABA ID</b>: Configurações do negócio → Contas → Contas do WhatsApp → clique na
                conta.
              </li>
              <li>
                <b>Phone Number ID</b>: dentro da conta do WhatsApp, na lista de números → clique no
                número → "ID do número de telefone".
              </li>
              <li>
                <b>Token de acesso</b>: crie um usuário de sistema (Configurações do negócio →
                Usuários → Usuários do sistema), dê acesso à conta do WhatsApp com as permissões
                <code> whatsapp_business_management</code> e <code>whatsapp_business_messaging</code>, e
                gere um token PERMANENTE dele.
              </li>
              <li>
                <b>App Secret</b>: no app conectado (developers.facebook.com → seu app →
                Configurações básicas) → "Chave secreta do aplicativo" → Mostrar.
              </li>
            </ol>

            <CampoComRotulo nome="wabaId" rotuloTexto="WABA ID" valueInitial={values?.wabaId} />
            <CampoComRotulo
              nome="numeroId"
              rotuloTexto="Phone Number ID"
              valueInitial={values?.numeroId}
            />
            <CampoComRotulo nome="token" rotuloTexto="Token de acesso (usuário de sistema)" />
            <CampoComRotulo
              nome="appSecret"
              rotuloTexto="App Secret"
              ajuda="32 caracteres, só números e letras de a a f."
            />
            <CampoComRotulo nome="nome" rotuloTexto="Nome do canal (opcional)" obrigatorio={false} />

            {error ? <Etiqueta tom="erro">{error}</Etiqueta> : null}

            <div className="cl-actions">
              <Botao type="button" onClick={fechar} disabled={enviando}>
                Cancelar
              </Botao>
              <Botao type="submit" variante="primario" disabled={enviando}>
                {enviando ? 'Conectando…' : channelId ? 'Reconectar' : 'Conectar'}
              </Botao>
            </div>
          </form>
        )}
      </Modal>
    </>
  );
}

export function ConectarInstagramManual({
  flowId,
  rotulo = 'Conectar manualmente',
  variante = 'padrao',
  onConectado,
}: PropsDeConexaoManual<ChannelInstagramVisible>) {
  const [aberto, setAberto] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState<ChannelConnected<ChannelInstagramVisible> | null>(null);

  function fechar() {
    setAberto(false);
    setError(null);
    if (sucesso) onConectado?.(sucesso.channel);
    setSucesso(null);
  }

  async function enviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setEnviando(true);
    setError(null);
    const data = new FormData(evento.currentTarget);
    const resultado = await conectarInstagramManual({
      token: String(data.get('token') ?? '').trim(),
      appSecret: String(data.get('appSecret') ?? '').trim(),
      nome: String(data.get('nome') ?? '').trim() || undefined,
      ...(flowId ? { flowId } : {}),
    });
    setEnviando(false);
    if (!resultado.ok) {
      setError(resultado.error);
      return;
    }
    setSucesso(resultado.value);
  }

  return (
    <>
      <Botao type="button" variante={variante} onClick={() => setAberto(true)}>
        {rotulo}
      </Botao>
      <Modal aberto={aberto} titulo="Conectar Instagram manualmente" onFechar={fechar}>
        {sucesso ? (
          <WebhookPronto
            webhook={sucesso.webhook}
            webhookError={sucesso.webhookError}
            onFechar={fechar}
          />
        ) : (
          <form onSubmit={(e) => void enviar(e)} style={column}>
            <p className="sub">
              Sem aplicativo aprovado na Meta: crie o app do tipo "Instagram API with Instagram Login",
              gere o token de longa duração da conta profissional e cole os dois valores abaixo.
            </p>
            <CampoComRotulo nome="token" rotuloTexto="Token de acesso (longa duração)" />
            <CampoComRotulo
              nome="appSecret"
              rotuloTexto="App Secret"
              ajuda="32 caracteres, só números e letras de a a f."
            />
            <CampoComRotulo nome="nome" rotuloTexto="Nome do canal (opcional)" obrigatorio={false} />

            {error ? <Etiqueta tom="erro">{error}</Etiqueta> : null}

            <div className="cl-actions">
              <Botao type="button" onClick={fechar} disabled={enviando}>
                Cancelar
              </Botao>
              <Botao type="submit" variante="primario" disabled={enviando}>
                {enviando ? 'Conectando…' : 'Conectar'}
              </Botao>
            </div>
          </form>
        )}
      </Modal>
    </>
  );
}
