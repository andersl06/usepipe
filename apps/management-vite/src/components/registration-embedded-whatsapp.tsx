import { useState, type ReactNode } from 'react';
import { Botao, Etiqueta } from '@pipe/ui';
import type { VarianteDeBotao } from '@pipe/ui';
import { concluirRegistrationEmbedded, iniciarRegistrationEmbedded } from '../pages/deployment/actions';

/**
 * Portado de chatwoot/chatwoot (MIT):
 * - app/javascript/dashboard/composables/useWhatsappEmbeddedSignup.js;
 * - app/javascript/dashboard/routes/dashboard/settings/inbox/channels/whatsapp/utils.js
 *   (carregar o SDK, `FB.login`, classificar o evento `WA_EMBEDDED_SIGNUP`);
 * - o `connectWhatsapp` de .../onboarding/inbox-setup/useChannelConnect.js.
 *
 * O popup do cadastro embutido pelo `FB.login` do SDK, com `config_id`,
 * `response_type: 'code'` e `override_default_response_type`. O `code` chega
 * pela resposta do login e os identificadores da WABA chegam por `postMessage`,
 * em ordem que não é garantida — por isso as duas coisas são esperadas e só se
 * segue com as duas na mão.
 *
 * Diferença registrada: a Blip abre o diálogo por redirecionamento
 * (`/dialog/oauth?...&state=`) com `state` aleatório. O Pipe segue o Chatwoot no
 * fluxo e acrescenta o `state` do lado de fora do popup: ele sai da `api` antes
 * de o popup abrir (`iniciarCadastroEmbutido`) e volta junto com o `code`.
 *
 * Acréscimo do Pipe: sem aplicativo aprovado na Meta (`modo: 'duble'`), o botão
 * não abre popup — gera credenciais de ensaio e percorre o resto do caminho de
 * verdade, contra o dublê da `api`.
 */

interface RespostaDoLogin {
  authResponse?: { code?: string } | null;
  error?: string;
}

interface SdkDoFacebook {
  init(options: Record<string, unknown>): void;
  login(return: (resposta: RespostaDoLogin) => void, options: Record<string, unknown>): void;
}

declare global {
  interface Window {
    FB?: SdkDoFacebook;
    fbAsyncInit?: () => void;
  }
}

const VERSAO_PADRAO = 'v26.0';

/** `loadFacebookSdk` */
function carregarSdk(): Promise<void> {
  return new Promise((resolver, rejeitar) => {
    if (window.FB || document.getElementById('facebook-jssdk')) {
      resolver();
      return;
    }
    const script = document.createElement('script');
    script.id = 'facebook-jssdk';
    script.src = 'https://connect.facebook.net/en_US/sdk.js';
    script.async = true;
    script.defer = true;
    script.crossOrigin = 'anonymous';
    script.onload = () => resolver();
    script.onerror = () => rejeitar(new Error('Não foi possível carregar o SDK da Meta.'));
    document.body.appendChild(script);
  });
}

/** `initializeFacebook` */
function iniciarFacebook(appId: string, versao: string): Promise<void> {
  return new Promise((resolver) => {
    const iniciar = () => {
      window.FB!.init({ appId, autoLogAppEvents: true, xfbml: true, version: versao });
      resolver();
    };
    if (window.FB) iniciar();
    else window.fbAsyncInit = iniciar;
  });
}

interface EmpresaData {
  waba_id: string;
  phone_number_id?: string;
  business_id?: string;
}

/** `isValidBusinessData`: só o `waba_id` é garantido (a coexistência manda só ele). */
function empresaValidData(data: unknown): data is EmpresaData {
  return Boolean(data && typeof data === 'object' && (data as EmpresaData).waba_id);
}

const EVENTO_DE_COEXISTENCIA = 'FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING';
const EVENTOS_DE_FIM = ['FINISH', EVENTO_DE_COEXISTENCIA];
/** Terminam o fluxo sem um número da Cloud API com que se possa criar canal. */
const EVENTOS_SEM_SUPORTE = [
  'FINISH_ONLY_WABA',
  'FINISH_OBO_MIGRATION',
  'FINISH_GRANT_ONLY_API_ACCESS',
];

type Classification =
  | { tipo: 'fim'; coexistencia: boolean }
  | { tipo: 'sem_suporte' }
  | { tipo: 'cancelado' }
  | { tipo: 'erro'; message: string | undefined }
  | { tipo: 'ignorar' };

/**
 * `classifySignupEvent`. A v4 escreve `ERROR` onde a v3 escrevia `error`, e
 * também reporta falha como `CANCEL` com `error_message` — um `CANCEL` puro é a
 * pessoa desistindo, e os dois não podem ser lidos como a mesma coisa.
 */
function classificarEvento(data: { event?: unknown; error_message?: string }): Classification {
  const evento = data.event;
  if (typeof evento !== 'string') return { tipo: 'ignorar' };
  if (EVENTOS_DE_FIM.includes(evento)) {
    return { tipo: 'fim', coexistencia: evento === EVENTO_DE_COEXISTENCIA };
  }
  if (EVENTOS_SEM_SUPORTE.includes(evento)) return { tipo: 'sem_suporte' };
  if (evento.toUpperCase() === 'ERROR') return { tipo: 'erro', message: data.error_message };
  if (evento === 'CANCEL') {
    return data.error_message
      ? { tipo: 'erro', message: data.error_message }
      : { tipo: 'cancelado' };
  }
  return { tipo: 'ignorar' };
}

/** `createMessageHandler`: só mensagem do Facebook, e só do tipo do cadastro embutido. */
function createTratador(
  aoReceber: (data: { event?: unknown; error_message?: string; data?: unknown }) => void,
): (evento: MessageEvent) => void {
  return (evento) => {
    if (!evento.origin.endsWith('facebook.com')) return;
    try {
      const data: unknown =
        typeof evento.data === 'string' ? JSON.parse(evento.data) : evento.data;
      if (
        data &&
        typeof data === 'object' &&
        (data as { type?: string }).type === 'WA_EMBEDDED_SIGNUP'
      ) {
        aoReceber(data as { event?: unknown; error_message?: string; data?: unknown });
      }
    } catch {
      // Mensagem que não é JSON, ou não é nossa.
    }
  };
}

/** `initWhatsAppEmbeddedSignup` */
function abrirRegistration(configId: string): Promise<string> {
  return new Promise((resolver, rejeitar) => {
    window.FB!.login(
      (resposta) => {
        if (resposta.authResponse?.code) resolver(resposta.authResponse.code);
        else if (resposta.error) rejeitar(new Error(resposta.error));
        else rejeitar(new Error('Login cancelado'));
      },
      {
        config_id: configId,
        response_type: 'code',
        override_default_response_type: true,
        extras: {
          setup: {},
          featureType: 'whatsapp_business_app_onboarding',
          sessionInfoVersion: '3',
        },
      },
    );
  });
}

interface Credentials {
  codigo: string;
  wabaId: string;
  numeroId: string;
  businessId: string;
  coexistencia: boolean;
}

/**
 * `runEmbeddedSignup`: `null` quando a pessoa fecha o popup; rejeita em erro do
 * SDK, erro do cadastro e fim sem número utilizável.
 */
function executarRegistration(
  appId: string,
  versao: string,
  configId: string,
): Promise<Credentials | null> {
  return new Promise((resolver, rejeitar) => {
    let codigo: string | null = null;
    let empresa: EmpresaData | null = null;
    let coexistencia = false;
    let encerrado = false;

    const tratador = createTratador((data) => {
      const resultado = classificarEvento(data);
      if (resultado.tipo === 'fim') {
        // Fica o primeiro evento terminal: um FINISH de coexistência ganha de um FINISH comum que chegue depois.
        if (empresa) return;
        if (!empresaValidData(data.data)) {
          encerrar(() => rejeitar(new Error('A Meta devolveu os dados da empresa incompletos.')));
          return;
        }
        empresa = data.data;
        coexistencia = resultado.coexistencia;
        seguirSePronto();
      } else if (resultado.tipo === 'sem_suporte') {
        encerrar(() =>
          rejeitar(
            new Error('O cadastro terminou sem um número da API do WhatsApp para conectar.'),
          ),
        );
      } else if (resultado.tipo === 'cancelado') {
        encerrar(() => resolver(null));
      } else if (resultado.tipo === 'erro') {
        encerrar(() => rejeitar(new Error(resultado.message || 'O cadastro na Meta falhou.')));
      }
    });

    function encerrar(fim: () => void): void {
      if (encerrado) return;
      encerrado = true;
      window.removeEventListener('message', tratador);
      fim();
    }

    function seguirSePronto(): void {
      if (!codigo || !empresa) return;
      const credentials: Credentials = {
        codigo,
        wabaId: empresa.waba_id,
        numeroId: empresa.phone_number_id ?? '',
        businessId: empresa.business_id ?? '',
        coexistencia,
      };
      encerrar(() => resolver(credentials));
    }

    window.addEventListener('message', tratador);
    void (async () => {
      try {
        await carregarSdk();
        await iniciarFacebook(appId, versao || VERSAO_PADRAO);
        codigo = await abrirRegistration(configId);
        seguirSePronto();
      } catch (error) {
        const message = (error as Error).message;
        // Fechar o popup não é erro: é a pessoa desistindo.
        if (message === 'Login cancelado') encerrar(() => resolver(null));
        else encerrar(() => rejeitar(error as Error));
      }
    })();
  });
}

function ensaioCredentials(): Credentials {
  return {
    codigo: `ensaio-${crypto.randomUUID()}`,
    wabaId: 'waba-duble',
    numeroId: '',
    businessId: '',
    coexistencia: false,
  };
}

/**
 * O botão "Conectar" da linha de canal (`ChannelRow.vue`) com o
 * `connectWhatsapp`: pede o `state`, abre o popup, entrega o `code` e diz o que
 * aconteceu ali mesmo, sem trocar de tela.
 */
export function ConectarWhatsApp({
  channelId,
  flowId,
  rotulo = 'Conectar WhatsApp',
  variante = 'primario',
  className,
  prefix,
  onConectado,
}: {
  channelId?: string;
  /** Conexão de dentro do bot (`fluxo/canais/whatsapp`): o canal nasce ligado a ele. */
  flowId?: string;
  rotulo?: string;
  variante?: VarianteDeBotao;
  className?: string;
  /** O que vem antes do rótulo — o logo do Facebook do botão `variant="facebook"` da origem. */
  prefix?: ReactNode;
  onConectado?: () => void;
}) {
  const [ocupado, setOcupado] = useState(false);
  const [aviso, setAviso] = useState<{ tom: 'sucesso' | 'erro'; texto: string } | null>(null);

  async function conectar(): Promise<void> {
    if (ocupado) return;
    setOcupado(true);
    setAviso(null);
    try {
      const inicio = await iniciarRegistrationEmbedded();
      if (!inicio.ok || !inicio.state) {
        setAviso({ tom: 'erro', texto: inicio.error ?? 'Não foi possível iniciar a conexão.' });
        return;
      }

      let credentials: Credentials | null;
      try {
        credentials =
          inicio.modo === 'real'
            ? await executarRegistration(
                inicio.appId ?? '',
                inicio.versao ?? VERSAO_PADRAO,
                inicio.configId ?? '',
              )
            : ensaioCredentials();
      } catch (error) {
        setAviso({ tom: 'erro', texto: (error as Error).message || 'O cadastro na Meta falhou.' });
        return;
      }
      if (!credentials) return;

      const resultado = await concluirRegistrationEmbedded({
        ...credentials,
        state: inicio.state,
        ...(channelId ? { channelId } : {}),
        ...(flowId ? { flowId } : {}),
      });
      setAviso(
        resultado.ok
          ? { tom: 'sucesso', texto: resultado.message ?? 'WhatsApp conectado.' }
          : { tom: 'erro', texto: resultado.error ?? 'A conexão falhou.' },
      );
      if (resultado.ok) onConectado?.();
    } finally {
      setOcupado(false);
    }
  }

  return (
    <div className="cl-acoes">
      <Botao variante={variante} className={className} onClick={() => void conectar()} disabled={ocupado}>
        {prefix}
        {ocupado ? 'Conectando…' : rotulo}
      </Botao>
      {aviso ? <Etiqueta tom={aviso.tom}>{aviso.texto}</Etiqueta> : null}
    </div>
  );
}
