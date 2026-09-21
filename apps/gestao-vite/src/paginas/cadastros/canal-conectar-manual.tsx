import { useState, type FormEvent } from 'react';
import { Botao, Campo, Etiqueta, type VarianteDeBotao } from '@pipe/ui';
import type { CanalInstagramVisivel, CanalWhatsAppVisivel } from '../../lib/canais';
import type { CanalMessengerVisivel } from '../../lib/canais';
import {
  conectarInstagramManual,
  conectarMessengerManual,
  conectarWhatsappManual,
  type CanalConectado,
} from '../../lib/canais-gravar';
import { Modal } from './_modal';

/**
 * O caminho manual de conectar WhatsApp/Instagram — sem aplicativo aprovado
 * na Meta, o cadastro embutido (`cadastro-embutido-whatsapp.tsx`) não é uma
 * opção para o cliente médio; este é o caminho principal agora
 * (`POST /v1/canais/{whatsapp,instagram}/manual`, `canais.ts`/
 * `canais-instagram.ts`).
 *
 * Os dois formulários de conexão (`configuracao-manual.ts`/`instagram/
 * canal.ts`) recusam com `ErroPipe` SEM `detalhe.campo` — diferente de perfil
 * e preferências, que apontam o campo. Por isso aqui o erro só cabe num
 * banner geral, não embaixo de um campo específico (achado de backend, não
 * corrigido: a tarefa pede só consumir).
 */

const coluna = { display: 'flex', flexDirection: 'column' as const, gap: 'var(--p-e-3)' };
const rotulo = { display: 'flex', flexDirection: 'column' as const, gap: '4px' };

function CampoComRotulo({
  nome,
  rotuloTexto,
  ajuda,
  obrigatorio = true,
  desabilitado,
  tipo = 'text',
}: {
  nome: string;
  rotuloTexto: string;
  ajuda?: string;
  obrigatorio?: boolean;
  desabilitado?: boolean;
  tipo?: string;
}) {
  return (
    <label style={rotulo}>
      <span className="sub">{rotuloTexto}</span>
      <Campo name={nome} type={tipo} required={obrigatorio} disabled={desabilitado} autoComplete="off" />
      {ajuda ? <span className="sub">{ajuda}</span> : null}
    </label>
  );
}

/**
 * O que os três modais têm em comum, agora que moram na página do canal DO BOT
 * (`fluxo/canais/**`): `fluxoId` faz o canal nascer já ligado ao bot
 * (`fluxo_id` nas rotas de conexão), e o botão que abre o modal leva o rótulo
 * e a variante da tela que o hospeda.
 */
interface PropsDeConexaoManual<T> {
  fluxoId?: string;
  rotulo?: string;
  variante?: VarianteDeBotao;
  onConectado?: (canal: T) => void;
}

export function ConectarMessengerManual({ fluxoId, rotulo = 'Conectar manualmente', variante = 'padrao', onConectado }: PropsDeConexaoManual<CanalMessengerVisivel>) {
  const [aberto, setAberto] = useState(false); const [enviando, setEnviando] = useState(false); const [erro, setErro] = useState<string | null>(null); const [sucesso, setSucesso] = useState<CanalConectado<CanalMessengerVisivel> | null>(null);
  function fechar() { setAberto(false); setErro(null); if (sucesso) onConectado?.(sucesso.canal); setSucesso(null); }
  async function enviar(evento: FormEvent<HTMLFormElement>) { evento.preventDefault(); setEnviando(true); const d = new FormData(evento.currentTarget); const r = await conectarMessengerManual({ token: String(d.get('token') ?? '').trim(), appSecret: String(d.get('appSecret') ?? '').trim(), nome: String(d.get('nome') ?? '').trim() || undefined, ...(fluxoId ? { fluxoId } : {}) }); setEnviando(false); if (!r.ok) { setErro(r.erro); return; } setSucesso(r.valor); }
  return <><Botao type="button" variante={variante} onClick={() => setAberto(true)}>{rotulo}</Botao><Modal aberto={aberto} titulo="Conectar Facebook Messenger manualmente" onFechar={fechar}>{sucesso ? <WebhookPronto webhook={sucesso.webhook} erroDeWebhook={sucesso.erroDeWebhook} onFechar={fechar} /> : <form onSubmit={(e) => void enviar(e)} style={coluna}><p className="sub">No developers.facebook.com, abra o aplicativo do cliente: Messenger → Configurações. Gere um token de Página de longa duração e copie o App Secret em Configurações básicas. Depois de conectar, cole a URL e o verify token exibidos aqui no Webhooks do app.</p><CampoComRotulo nome="token" rotuloTexto="Token de acesso da Página" /><CampoComRotulo nome="appSecret" rotuloTexto="App Secret" ajuda="32 caracteres, só números e letras de a a f." /><CampoComRotulo nome="nome" rotuloTexto="Nome do canal (opcional)" obrigatorio={false} />{erro ? <Etiqueta tom="erro">{erro}</Etiqueta> : null}<div className="cl-acoes"><Botao type="button" onClick={fechar} disabled={enviando}>Cancelar</Botao><Botao type="submit" variante="primario" disabled={enviando}>{enviando ? 'Conectando…' : 'Conectar'}</Botao></div></form>}</Modal></>;
}

/** O que sobra na tela depois de conectar: o cliente TEM de colar isto no app dele. */
function WebhookPronto({
  webhook,
  erroDeWebhook,
  onFechar,
}: {
  webhook: { url: string; verifyToken: string };
  erroDeWebhook: string | null;
  onFechar: () => void;
}) {
  return (
    <div style={coluna}>
      <Etiqueta tom="sucesso">Canal conectado.</Etiqueta>
      {erroDeWebhook ? (
        <Etiqueta tom="alerta">
          A assinatura automática do webhook falhou ({erroDeWebhook}). Cole os dados abaixo no painel
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
      <div className="cl-acoes">
        <Botao type="button" variante="primario" onClick={onFechar}>
          Concluir
        </Botao>
      </div>
    </div>
  );
}

export function ConectarWhatsappManual({
  fluxoId,
  rotulo = 'Conectar manualmente',
  variante = 'padrao',
  onConectado,
}: PropsDeConexaoManual<CanalWhatsAppVisivel>) {
  const [aberto, setAberto] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState<CanalConectado<CanalWhatsAppVisivel> | null>(null);

  function fechar() {
    setAberto(false);
    setErro(null);
    if (sucesso) onConectado?.(sucesso.canal);
    setSucesso(null);
  }

  async function enviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setEnviando(true);
    setErro(null);
    const dados = new FormData(evento.currentTarget);
    const resultado = await conectarWhatsappManual({
      wabaId: String(dados.get('wabaId') ?? '').trim(),
      numeroId: String(dados.get('numeroId') ?? '').trim(),
      token: String(dados.get('token') ?? '').trim(),
      appSecret: String(dados.get('appSecret') ?? '').trim(),
      nome: String(dados.get('nome') ?? '').trim() || undefined,
      ...(fluxoId ? { fluxoId } : {}),
    });
    setEnviando(false);
    if (!resultado.ok) {
      setErro(resultado.erro);
      return;
    }
    setSucesso(resultado.valor);
  }

  return (
    <>
      <Botao type="button" variante={variante} onClick={() => setAberto(true)}>
        {rotulo}
      </Botao>
      <Modal aberto={aberto} titulo="Conectar WhatsApp manualmente" onFechar={fechar}>
        {sucesso ? (
          <WebhookPronto
            webhook={sucesso.webhook}
            erroDeWebhook={sucesso.erroDeWebhook}
            onFechar={fechar}
          />
        ) : (
          <form onSubmit={(e) => void enviar(e)} style={coluna}>
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

            <CampoComRotulo nome="wabaId" rotuloTexto="WABA ID" />
            <CampoComRotulo nome="numeroId" rotuloTexto="Phone Number ID" />
            <CampoComRotulo nome="token" rotuloTexto="Token de acesso (usuário de sistema)" />
            <CampoComRotulo
              nome="appSecret"
              rotuloTexto="App Secret"
              ajuda="32 caracteres, só números e letras de a a f."
            />
            <CampoComRotulo nome="nome" rotuloTexto="Nome do canal (opcional)" obrigatorio={false} />

            {erro ? <Etiqueta tom="erro">{erro}</Etiqueta> : null}

            <div className="cl-acoes">
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

export function ConectarInstagramManual({
  fluxoId,
  rotulo = 'Conectar manualmente',
  variante = 'padrao',
  onConectado,
}: PropsDeConexaoManual<CanalInstagramVisivel>) {
  const [aberto, setAberto] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState<CanalConectado<CanalInstagramVisivel> | null>(null);

  function fechar() {
    setAberto(false);
    setErro(null);
    if (sucesso) onConectado?.(sucesso.canal);
    setSucesso(null);
  }

  async function enviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setEnviando(true);
    setErro(null);
    const dados = new FormData(evento.currentTarget);
    const resultado = await conectarInstagramManual({
      token: String(dados.get('token') ?? '').trim(),
      appSecret: String(dados.get('appSecret') ?? '').trim(),
      nome: String(dados.get('nome') ?? '').trim() || undefined,
      ...(fluxoId ? { fluxoId } : {}),
    });
    setEnviando(false);
    if (!resultado.ok) {
      setErro(resultado.erro);
      return;
    }
    setSucesso(resultado.valor);
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
            erroDeWebhook={sucesso.erroDeWebhook}
            onFechar={fechar}
          />
        ) : (
          <form onSubmit={(e) => void enviar(e)} style={coluna}>
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

            {erro ? <Etiqueta tom="erro">{erro}</Etiqueta> : null}

            <div className="cl-acoes">
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
