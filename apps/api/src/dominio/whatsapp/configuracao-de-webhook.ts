import { randomInt } from 'node:crypto';
import { ErroPipe } from '../../erros.js';
import { atualizarCanal, pedirReautorizacao, texto, urlDoWebhook } from './canal.js';
import type { CanalWhatsApp } from './canal.js';
import { CAMPOS_PADRAO_DO_WEBHOOK, clienteGraph } from './cliente-graph.js';
import { buscarSaude, numeroPendente } from './saude.js';
import type { SaudeDoNumero } from './saude.js';

/**
 * Portado de chatwoot/chatwoot (MIT), app/services/whatsapp/webhook_setup_service.rb
 * e o `setup_webhooks` de app/models/channel/whatsapp.rb.
 *
 * Dois passos, na ordem do original:
 *
 * 1. **registrar o número** (`POST /{phone}/register` com PIN de 6 dígitos) —
 *    só quando ele não está verificado/conectado ou a Meta ainda o dá como
 *    pendente. Falha aqui NÃO interrompe: fica em `erroDeRegistro` e segue;
 * 2. **assinar o app na WABA e apontar o callback do número** para a rota do
 *    canal. Falha aqui interrompe, com "Falha ao configurar o webhook".
 *
 * O PIN é guardado no canal para a próxima reautorização reaproveitá-lo (a Meta
 * recusa um PIN diferente do que já está no número).
 *
 * Acréscimos do Pipe:
 * - o PIN é gravado CIFRADO (`pinVerificacao` está em `CAMPOS_SECRETOS_DE_CANAL`);
 * - além de `messages`/`smb_message_echoes`, assina os três campos que não
 *   aceitam override e caem na rota guarda-chuva (spec webhook-por-cliente §7);
 * - o limite de 200 caracteres da URL de override é conferido antes da chamada;
 * - `calls` não entra: o Pipe não tem voz.
 */

export const CAMPOS_ASSINADOS = [
  ...CAMPOS_PADRAO_DO_WEBHOOK,
  'message_template_status_update',
  'phone_number_quality_update',
  'account_update',
] as const;

/** Limite da Meta para `override_callback_uri`. */
const LIMITE_DA_URL = 200;

export interface OpcoesDoWebhook {
  wabaId?: string | null;
  token?: string | null;
  /**
   * `true`: número em coexistência com o app WhatsApp Business — já vem
   * registrado, e o registro é pulado sem nem perguntar a saúde. `null`: ninguém
   * disse (configuração manual), e a saúde decide pelo `is_on_biz_app`.
   */
  coexistencia?: boolean | null;
}

export interface ResultadoDoWebhook {
  canal: CanalWhatsApp;
  erroDeRegistro: Error | null;
}

function comoErro(erro: unknown): Error {
  return erro instanceof Error ? erro : new Error(String(erro));
}

export async function configurarWebhook(
  canal: CanalWhatsApp,
  opcoes: OpcoesDoWebhook = {},
): Promise<ResultadoDoWebhook> {
  const wabaId = opcoes.wabaId ?? canal.wabaId ?? '';
  const token = opcoes.token ?? texto(canal.config['tokenAcesso']) ?? '';
  const numeroId = texto(canal.config['phoneNumberId']);
  const coexistencia = opcoes.coexistencia === undefined ? null : opcoes.coexistencia;

  // `validate_parameters!`
  if (!wabaId) throw ErroPipe.requisicao('waba_ausente', 'O WABA ID é obrigatório.');
  if (!token) throw ErroPipe.requisicao('token_ausente', 'O token de acesso é obrigatório.');
  if (!numeroId) throw ErroPipe.requisicao('numero_ausente', 'O Phone Number ID é obrigatório.');

  const cliente = clienteGraph(token);

  let saude: SaudeDoNumero | null = null;
  const lerSaude = async (): Promise<SaudeDoNumero> => {
    if (saude) return saude;
    try {
      saude = await buscarSaude({ tokenAcesso: token, numeroId, wabaId });
    } catch (erro) {
      // Sem saúde, a decisão conservadora do original: não registrar.
      console.error(`[whatsapp] a checagem de saúde falhou: ${comoErro(erro).message}`);
      saude = {};
    }
    return saude;
  };

  const verificado = async (): Promise<boolean> => {
    try {
      return await cliente.numeroVerificado(numeroId);
    } catch (erro) {
      // Se a checagem falhar, supõe não verificado — o lado seguro, segundo o original.
      console.error(`[whatsapp] a checagem de verificação do número falhou: ${comoErro(erro).message}`);
      return false;
    }
  };

  // `should_register_phone_number?`
  const deveRegistrar = async (): Promise<boolean> => {
    if (coexistencia === true) return false;
    if (coexistencia === null && (await lerSaude()).is_on_biz_app) return false;
    return !(await verificado()) || numeroPendente(await lerSaude());
  };

  let atual = canal;
  let erroDeRegistro: Error | null = null;
  if (await deveRegistrar()) {
    try {
      // `fetch_or_create_pin`: o guardado, ou um novo entre 100000 e 999999.
      const pin = texto(atual.config['pinVerificacao']) ?? String(randomInt(100_000, 1_000_000));
      await cliente.registrarNumero(numeroId, pin);
      atual = await atualizarCanal(atual, { pinVerificacao: pin });
    } catch (erro) {
      erroDeRegistro = comoErro(erro);
      console.warn(`[whatsapp] o registro do número falhou, seguindo: ${erroDeRegistro.message}`);
    }
  }

  const url = urlDoWebhook(atual.id);
  if (url.length > LIMITE_DA_URL) {
    throw new ErroPipe(
      500,
      'url_longa_demais',
      `A URL do webhook tem ${url.length} caracteres e a Meta aceita ${LIMITE_DA_URL}. Encurte PIPE_URL_API.`,
    );
  }

  const verifyToken = texto(atual.config['verifyToken']) ?? '';
  try {
    await cliente.assinarWebhookDoNumero(wabaId, numeroId, url, verifyToken, CAMPOS_ASSINADOS);
  } catch (erro) {
    const mensagem = comoErro(erro).message;
    console.error(`[whatsapp] a configuração do webhook falhou: ${mensagem}`);
    throw new ErroPipe(502, 'webhook_falhou', `Falha ao configurar o webhook: ${mensagem}`);
  }

  return { canal: atual, erroDeRegistro };
}

/**
 * `Channel::Whatsapp#setup_webhooks`: webhook que falha não desfaz o canal — marca
 * o canal para reautorização, e a tela de Canais passa a pedir que o cliente
 * refaça a conexão.
 */
export async function configurarWebhooksDoCanal(
  canal: CanalWhatsApp,
  coexistencia: boolean | null = null,
): Promise<CanalWhatsApp> {
  try {
    return (await configurarWebhook(canal, { coexistencia })).canal;
  } catch (erro) {
    console.error(`[whatsapp] a configuração do webhook falhou: ${comoErro(erro).message}`);
    return pedirReautorizacao(canal);
  }
}
