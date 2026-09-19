import type {
  ClienteWhatsApp,
  ConteudoMidia,
  PedidoEnvio,
  RespostaEnvio,
} from './cliente.js';
import { ErroWhatsApp } from './cliente.js';
import { montarComponentes, ParametroFaltandoErro } from './template.js';
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
const CAMPO_DE_MIDIA = {
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
    const versao = pedido.credenciais.apiVersao ?? VERSAO_PADRAO;
    const url = `${BASE}/${versao}/${pedido.credenciais.phoneNumberId}/messages`;

    let corpo: Record<string, unknown>;
    try {
      corpo = montarCorpo(pedido);
    } catch (erro) {
      if (erro instanceof ParametroFaltandoErro) {
        throw new ErroWhatsApp(erro.codigo, erro.message, true);
      }
      throw erro;
    }

    let resposta: Response;
    try {
      resposta = await fetch(url, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${pedido.credenciais.tokenAcesso}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify(corpo),
      });
    } catch (erro) {
      // Rede caiu: temporário por definição.
      throw new ErroWhatsApp('rede', `Não alcançou a Meta: ${(erro as Error).message}`, false);
    }

    const dados = (await resposta.json().catch(() => ({}))) as RespostaMeta;

    if (!resposta.ok || dados.error) {
      const codigo = String(dados.error?.code ?? resposta.status);
      const texto =
        dados.error?.error_data?.details ??
        dados.error?.message ??
        `A Meta respondeu ${resposta.status}.`;
      // 4xx sem código conhecido também é permanente: repetir devolve o mesmo 4xx.
      const permanente =
        PERMANENTES.has(codigo) || (resposta.status >= 400 && resposta.status < 500 && resposta.status !== 429);
      throw new ErroWhatsApp(codigo, texto, permanente);
    }

    const idProvedor = dados.messages?.[0]?.id;
    if (!idProvedor) {
      throw new ErroWhatsApp('sem_id', 'A Meta aceitou mas não devolveu o id da mensagem.', false);
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
        components: montarComponentes(conteudo.template, conteudo.valores),
      },
    };
  }

  if (conteudo.tipo === 'interativo') {
    // O `id` é a posição (1, 2, …); a resposta chega com o `title`, que é o que o fluxo casa.
    const action =
      conteudo.formato === 'botoes'
        ? {
            buttons: conteudo.opcoes.map((titulo, i) => ({
              type: 'reply',
              reply: { id: String(i + 1), title: titulo },
            })),
          }
        : {
            button: ROTULO_DA_LISTA,
            sections: [{ rows: conteudo.opcoes.map((titulo, i) => ({ id: String(i + 1), title: titulo })) }],
          };
    return {
      ...base,
      type: 'interactive',
      interactive: {
        type: conteudo.formato === 'botoes' ? 'button' : 'list',
        body: { text: conteudo.texto },
        action,
      },
    };
  }

  return { ...base, type: CAMPO_DE_MIDIA[conteudo.tipo], [CAMPO_DE_MIDIA[conteudo.tipo]]: midia(conteudo) };
}

function midia(conteudo: ConteudoMidia): Record<string, string> {
  const corpo: Record<string, string> = { link: conteudo.link };
  // Áudio é o único que não aceita legenda na Cloud API.
  if (conteudo.legenda && conteudo.tipo !== 'audio') corpo['caption'] = conteudo.legenda;
  if (conteudo.nomeArquivo && conteudo.tipo === 'documento') corpo['filename'] = conteudo.nomeArquivo;
  return corpo;
}
