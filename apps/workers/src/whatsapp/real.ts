import type {
  ClienteWhatsApp,
  ContentMedia,
  PedidoEnvio,
  RespostaEnvio,
} from './cliente.js';
import { WhatsAppError } from './cliente.js';
import { assembleComponents, ParametroMissingError } from './template.js';
import { ROTULO_DA_LISTA } from './interativo.js';

/**
 * Cliente da Cloud API da Meta.
 *
 * `POST https://graph.facebook.com/<versao>/<phone_number_id>/messages`.
 * Nunca foi exercitado contra uma WABA real — não temos uma. O que ele tem de
 * confiável é a classificação de erro, que é o que decide entre repetir e desistir.
 */

const VERSAO_PADRAO = 'v21.0';
const BASE = process.env['WHATSAPP_API_BASE'] ?? 'https://graph.facebook.com';

/** Nome do campo de conteúdo na Cloud API, por tipo do Pipe. */
const FIELD_OF_MEDIA = {
  imagem: 'image',
  audio: 'audio',
  video: 'video',
  documento: 'document',
} as const;

/**
 * Códigos que não melhoram com repetição: número inválido, template inexistente,
 * fora da janela, sem permissão. Repetir esses só queima tentativa e atrasa o aviso
 * ao atendente. O resto (limite de taxa, indisponibilidade) volta para o outbox.
 * Fonte: catálogo de erro da Cloud API; a lista é configuração, não dogma.
 */
const PERMANENTES = new Set([
  '100', // parâmetro inválido
  '131008', // campo obrigatório ausente
  '131009', // valor de parâmetro inválido
  '131026', // destinatário não pode receber mensagem
  '131047', // fora da janela de 24h: exige template
  '131051', // tipo de mensagem não suportado
  '132000', // número de parâmetros do template não bate
  '132001', // template não existe nesse idioma
  '132005', // template com hash divergente
  '132007', // template com formato rejeitado
  '132012', // formato de parâmetro do template inválido
  '133010', // número não registrado
  '190', // token expirado ou revogado
]);

interface RespostaMeta {
  messages?: { id: string }[];
  error?: { code?: number; message?: string; error_data?: { details?: string } };
}

export class ClienteWhatsAppReal implements ClienteWhatsApp {
  readonly nome = 'real' as const;

  async enviar(pedido: PedidoEnvio): Promise<RespostaEnvio> {
    const versao = pedido.credentials.apiVersao ?? VERSAO_PADRAO;
    const url = `${BASE}/${versao}/${pedido.credentials.phoneNumberId}/messages`;

    let corpo: Record<string, unknown>;
    try {
      corpo = montarCorpo(pedido);
    } catch (error) {
      if (error instanceof ParametroMissingError) {
        throw new WhatsAppError(error.codigo, error.message, true);
      }
      throw error;
    }

    let resposta: Response;
    try {
      resposta = await fetch(url, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${pedido.credentials.tokenAccess}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify(corpo),
      });
    } catch (erro) {
      // Rede caiu: temporário por definição.
      throw new WhatsAppError('rede', `Não alcançou a Meta: ${(erro as Error).message}`, false);
    }

    const data = (await resposta.json().catch(() => ({}))) as RespostaMeta;

    if (!resposta.ok || data.error) {
      const codigo = String(data.error?.code ?? resposta.status);
      const texto =
        data.error?.error_data?.details ??
        data.error?.message ??
        `A Meta respondeu ${resposta.status}.`;
      // 4xx sem código conhecido também é permanente: repetir devolve o mesmo 4xx.
      const permanente =
        PERMANENTES.has(codigo) || (resposta.status >= 400 && resposta.status < 500 && resposta.status !== 429);
      throw new WhatsAppError(codigo, texto, permanente);
    }

    const idProvedor = data.messages?.[0]?.id;
    if (!idProvedor) {
      throw new WhatsAppError('sem_id', 'A Meta aceitou mas não devolveu o id da mensagem.', false);
    }
    return { idProvedor };
  }
}

export function montarCorpo(pedido: PedidoEnvio): Record<string, unknown> {
  const base = { messaging_product: 'whatsapp', recipient_type: 'individual', to: pedido.para };
  const conteudo = pedido.conteudo;

  if (conteudo.tipo === 'texto') {
    return { ...base, type: 'text', text: { preview_url: false, body: conteudo.texto } };
  }

  if (conteudo.tipo === 'template') {
    return {
      ...base,
      type: 'template',
      template: {
        name: conteudo.template.nome,
        language: { code: conteudo.template.idioma },
        components: assembleComponents(conteudo.template, conteudo.values),
      },
    };
  }

  if (conteudo.tipo === 'interativo') {
    // O `id` é a posição (1, 2, …); a resposta chega com o `title`, que é o que o fluxo casa.
    const action =
      conteudo.format === 'botoes'
        ? {
            buttons: conteudo.options.map((titulo, i) => ({
              type: 'reply',
              reply: { id: String(i + 1), title: titulo },
            })),
          }
        : {
            button: ROTULO_DA_LISTA,
            sections: [{ rows: conteudo.options.map((titulo, i) => ({ id: String(i + 1), title: titulo })) }],
          };
    return {
      ...base,
      type: 'interactive',
      interactive: {
        type: conteudo.format === 'botoes' ? 'button' : 'list',
        body: { text: conteudo.texto },
        action,
      },
    };
  }

  return { ...base, type: FIELD_OF_MEDIA[conteudo.tipo], [FIELD_OF_MEDIA[conteudo.tipo]]: media(conteudo) };
}

function media(conteudo: ContentMedia): Record<string, string> {
  const corpo: Record<string, string> = { link: conteudo.link };
  // Áudio é o único que não aceita legenda na Cloud API.
  if (conteudo.legenda && conteudo.tipo !== 'audio') corpo['caption'] = conteudo.legenda;
  if (conteudo.nameFile && conteudo.tipo === 'documento') corpo['filename'] = conteudo.nameFile;
  return corpo;
}
