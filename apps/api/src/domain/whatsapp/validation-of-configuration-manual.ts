import { sql } from 'drizzle-orm';
import { databaseOwner } from '../../database.js';
import { PipeError } from '../../errors.js';
import { clienteGraph } from './cliente-graph.js';

/**
 * Ported from chatwoot/chatwoot (MIT), app/services/whatsapp/manual_setup_validation_service.rb. Without embedded signup, the customer (or Pipe owner during testing; `docs/specs/2026-09-07-implantacao.md` §1.4) supplies WABA ID, Phone Number ID, and a system-user token. Before writing, verify the number belongs to the WABA, is verified and unused by another channel, and the token can read templates and send messages. Return the original Portuguese rejection messages as 422 `configuracao_invalida`, corresponding to Chatwoot's `ArgumentError`.
 */

const PERMISSION_OF_MESSAGE = 'whatsapp_business_messaging';

export interface PreviewOfConfiguration {
  nomeVerificado: string | null;
  number: string;
  numberId: string;
  wabaId: string;
  accessToTemplates: true;
  nomeSugerido: string;
  /** Token-owning app, where `subirFoto` uploads the profile photo. */
  appId: string | null;
}

/** O App Secret da Meta: 32 caracteres hexadecimais. */
const FORMAT_OF_SECRET = /^[0-9a-f]{32}$/i;

function recusa(message: string): PipeError {
  return new PipeError(422, 'configuration_invalid', message);
}

export function numeroNormalizado(numero: unknown): string {
  return `+${String(numero ?? '').replace(/[^\d]/g, '')}`;
}

export async function validateConfigurationManual(data: {
  wabaId?: string | undefined;
  numberId?: string | undefined;
  token?: string | undefined;
  appSecret?: string | undefined;
  /** On reconnection, the channel already owning this number does not conflict with itself. */
  channelId?: string | undefined;
}): Promise<PreviewOfConfiguration> {
  // `validate_parameters!`
  if (!data.wabaId) throw recusa('O WABA ID é obrigatório.');
  if (!data.numberId) throw recusa('O Phone Number ID é obrigatório.');
  if (!data.token) throw recusa('O token de acesso é obrigatório.');
  // The token belongs to the customer's app, and Meta signs its webhook with that app's secret. Require it or every inbound message will fail with 401.
  // o segredo DESSE app. Sem ele, toda mensagem recebida cai em 401.
  if (!data.appSecret) throw recusa('O App Secret é obrigatório.');
  if (!FORMAT_OF_SECRET.test(data.appSecret)) {
    throw recusa('O App Secret tem 32 caracteres, só números e letras de a a f.');
  }
  const { wabaId, numberId: numeroId, token, appSecret } = data as {
    wabaId: string;
    numberId: string;
    token: string;
    appSecret: string;
  };

  const cliente = clienteGraph(token);

  // `find_phone_data!`
  const numeros = await cliente.buscarTodosOsNumeros(wabaId);
  const achado = numeros.find((n) => String(n.id) === String(numeroId));
  if (!achado) throw recusa('Este Phone Number ID não pertence ao WABA ID informado.');
  const dataOfNumber: Record<string, unknown> = {
    ...achado,
    ...(await cliente.buscarNumero(numeroId, 'status,code_verification_status')),
  };

  // `verify_phone_number_ready!`
  if (
    dataOfNumber['status'] !== 'CONNECTED' &&
    dataOfNumber['code_verification_status'] !== 'VERIFIED'
  ) {
    throw recusa('Conclua a verificação do número na Meta antes de continuar.');
  }

  // `verify_uniqueness!` checks globally across tenants with the owner role, returning only yes/no.
  const numero = numeroNormalizado(dataOfNumber['display_phone_number']);
  /*
   * During reconnection, the current channel owns the number and must not conflict with itself, or replacing an expired token would be impossible.
   */
  const eu = data.channelId ?? null;
  const { rows } = await databaseOwner().execute<{ number: boolean; id: boolean }>(sql`
    select exists (
             select 1 from canal
              where tipo = 'whatsapp_cloud' and config->>'numero' = ${numero}
                and (${eu}::uuid is null or id <> ${eu}::uuid)
           ) as numero,
           exists (
             select 1 from canal
              where tipo = 'whatsapp_cloud' and numero_id = ${numeroId}
                and (${eu}::uuid is null or id <> ${eu}::uuid)
           ) as id
  `);
  if (rows[0]?.number) throw recusa('Este número de WhatsApp já está conectado a outra caixa de entrada.');
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
    const permissions = (await cliente.fetchPermissions()).data ?? [];
    permitido = permissions.some(
      (p) => p.permission === PERMISSION_OF_MESSAGE && p.status === 'granted',
    );
  } catch {
    permitido = false;
  }
  if (!permitido) {
    throw recusa(
      'O token não alcança o envio de mensagens do WhatsApp. Gere um token com a permissão whatsapp_business_messaging.',
    );
  }

  // Pipe addition: the secret must belong to the app that issued the token.
  if (!(await cliente.checkSecretOfApp(numeroId, appSecret))) {
    throw recusa('Este App Secret não é do aplicativo que gerou o token.');
  }
  const app = await cliente.buscarAppDoToken().catch(() => null);

  // `build_preview`
  const nomeVerificado =
    typeof dataOfNumber['verified_name'] === 'string' && dataOfNumber['verified_name']
      ? dataOfNumber['verified_name']
      : null;
  return {
    nomeVerificado,
    number: numero,
    numberId: String(achado.id),
    wabaId: String(wabaId),
    accessToTemplates: true,
    nomeSugerido: `${nomeVerificado ?? numero} WhatsApp`,
    appId: app?.id ? String(app.id) : null,
  };
}
