import { sql } from 'drizzle-orm';
import { bancoDono } from '../../banco.js';
import { ErroPipe } from '../../erros.js';
import { clienteGraph } from './cliente-graph.js';

/**
 * Portado de chatwoot/chatwoot (MIT), app/services/whatsapp/manual_setup_validation_service.rb
 *
 * O caminho SEM cadastro embutido: o cliente (ou o dono do Pipe, no próprio teste
 * — ver `docs/specs/2026-09-07-implantacao.md` §1.4) cola WABA ID, Phone Number ID
 * e um token de usuário de sistema. Antes de gravar qualquer coisa, prova que o
 * token serve: o número pertence à WABA, está verificado, não está em outro canal,
 * o token lê os modelos e tem permissão de enviar mensagem.
 *
 * Cada recusa sai com a mesma frase do original, em português, e todas como 422
 * `configuracao_invalida` — é o `ArgumentError` de lá.
 */

const PERMISSAO_DE_MENSAGEM = 'whatsapp_business_messaging';

export interface PreviaDaConfiguracao {
  nomeVerificado: string | null;
  numero: string;
  numeroId: string;
  wabaId: string;
  acessoAosModelos: true;
  nomeSugerido: string;
  /** O app dono do token: é nele que a foto do perfil sobe (`subirFoto`). */
  appId: string | null;
}

/** O App Secret da Meta: 32 caracteres hexadecimais. */
const FORMATO_DO_SEGREDO = /^[0-9a-f]{32}$/i;

function recusa(mensagem: string): ErroPipe {
  return new ErroPipe(422, 'configuracao_invalida', mensagem);
}

export function numeroNormalizado(numero: unknown): string {
  return `+${String(numero ?? '').replace(/[^\d]/g, '')}`;
}

export async function validarConfiguracaoManual(dados: {
  wabaId?: string | undefined;
  numeroId?: string | undefined;
  token?: string | undefined;
  appSecret?: string | undefined;
}): Promise<PreviaDaConfiguracao> {
  // `validate_parameters!`
  if (!dados.wabaId) throw recusa('O WABA ID é obrigatório.');
  if (!dados.numeroId) throw recusa('O Phone Number ID é obrigatório.');
  if (!dados.token) throw recusa('O token de acesso é obrigatório.');
  // Acréscimo do Pipe: o token é do app do CLIENTE, e a Meta assina o webhook com
  // o segredo DESSE app. Sem ele, toda mensagem recebida cai em 401.
  if (!dados.appSecret) throw recusa('O App Secret é obrigatório.');
  if (!FORMATO_DO_SEGREDO.test(dados.appSecret)) {
    throw recusa('O App Secret tem 32 caracteres, só números e letras de a a f.');
  }
  const { wabaId, numeroId, token, appSecret } = dados as {
    wabaId: string;
    numeroId: string;
    token: string;
    appSecret: string;
  };

  const cliente = clienteGraph(token);

  // `find_phone_data!`
  const numeros = await cliente.buscarTodosOsNumeros(wabaId);
  const achado = numeros.find((n) => String(n.id) === String(numeroId));
  if (!achado) throw recusa('Este Phone Number ID não pertence ao WABA ID informado.');
  const dadosDoNumero: Record<string, unknown> = {
    ...achado,
    ...(await cliente.buscarNumero(numeroId, 'status,code_verification_status')),
  };

  // `verify_phone_number_ready!`
  if (
    dadosDoNumero['status'] !== 'CONNECTED' &&
    dadosDoNumero['code_verification_status'] !== 'VERIFIED'
  ) {
    throw recusa('Conclua a verificação do número na Meta antes de continuar.');
  }

  // `verify_uniqueness!` — global, entre clientes: papel dono, só sim ou não.
  const numero = numeroNormalizado(dadosDoNumero['display_phone_number']);
  const { rows } = await bancoDono().execute<{ numero: boolean; id: boolean }>(sql`
    select exists (select 1 from canal where tipo = 'whatsapp_cloud' and config->>'numero' = ${numero}) as numero,
           exists (select 1 from canal where tipo = 'whatsapp_cloud' and numero_id = ${numeroId}) as id
  `);
  if (rows[0]?.numero) throw recusa('Este número de WhatsApp já está conectado a outra caixa de entrada.');
  if (rows[0]?.id) throw recusa('Este Phone Number ID já é usado por outra caixa de entrada do WhatsApp.');

  // `verify_template_access!`
  try {
    await cliente.buscarModelos(wabaId);
  } catch {
    throw recusa(
      'O token alcança o número, mas não os modelos de mensagem. Gere um token com a permissão whatsapp_business_management.',
    );
  }

  // `verify_messaging_access!`
  let permitido = false;
  try {
    const permissoes = (await cliente.buscarPermissoes()).data ?? [];
    permitido = permissoes.some(
      (p) => p.permission === PERMISSAO_DE_MENSAGEM && p.status === 'granted',
    );
  } catch {
    permitido = false;
  }
  if (!permitido) {
    throw recusa(
      'O token não alcança o envio de mensagens do WhatsApp. Gere um token com a permissão whatsapp_business_messaging.',
    );
  }

  // Acréscimo do Pipe: o segredo tem de ser do app que gerou o token.
  if (!(await cliente.conferirSegredoDoApp(numeroId, appSecret))) {
    throw recusa('Este App Secret não é do aplicativo que gerou o token.');
  }
  const app = await cliente.buscarAppDoToken().catch(() => null);

  // `build_preview`
  const nomeVerificado =
    typeof dadosDoNumero['verified_name'] === 'string' && dadosDoNumero['verified_name']
      ? dadosDoNumero['verified_name']
      : null;
  return {
    nomeVerificado,
    numero,
    numeroId: String(achado.id),
    wabaId: String(wabaId),
    acessoAosModelos: true,
    nomeSugerido: `${nomeVerificado ?? numero} WhatsApp`,
    appId: app?.id ? String(app.id) : null,
  };
}
