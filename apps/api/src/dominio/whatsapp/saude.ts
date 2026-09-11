import { clienteGraph, versaoDaApi } from './cliente-graph.js';

/**
 * Portado de chatwoot/chatwoot (MIT), app/services/whatsapp/health_service.rb —
 * só o `fetch_health_status`, com os mesmos campos e a mesma formatação.
 *
 * A persistência (`sync_health_status!`, `phone_number_health`) fica de fora: a
 * tela de Canais do Pipe pergunta à Meta a cada leitura, e guardar saúde sem quem
 * a leia é coluna para envelhecer.
 */

/** `MINIMUM_HEALTH_API_VERSION`: os campos de saúde só existem da v24 em diante. */
export const VERSAO_MINIMA_DA_SAUDE = 24.0;

const CAMPOS_DO_NUMERO = [
  'id',
  'quality_rating',
  'whatsapp_business_manager_messaging_limit',
  'status',
  'code_verification_status',
  'account_mode',
  'display_phone_number',
  'name_status',
  'verified_name',
  'webhook_configuration',
  'throughput',
  'last_onboarded_time',
  'is_on_biz_app',
  'platform_type',
].join(',');

const CAMPOS_DA_WABA = 'id,name,owner_business_info';

export interface SaudeDoNumero {
  id?: string;
  display_phone_number?: string;
  verified_name?: string;
  name_status?: string;
  quality_rating?: string;
  messaging_limit_tier?: string;
  status?: string;
  account_mode?: string;
  code_verification_status?: string;
  throughput?: { level?: string };
  throughput_level?: string;
  is_on_biz_app?: boolean;
  platform_type?: string;
  business_account_id?: string;
  business_account_name?: string;
}

export interface AlvoDaSaude {
  tokenAcesso: string | null;
  numeroId: string | null;
  wabaId: string | null;
}

export function versaoDaSaude(): string {
  const configurada = Number.parseFloat(versaoDaApi().replace(/^v/, ''));
  const versao = Math.max(Number.isFinite(configurada) ? configurada : 0, VERSAO_MINIMA_DA_SAUDE);
  return `v${versao.toFixed(1)}`;
}

function comoTexto(valor: unknown): string | undefined {
  return typeof valor === 'string' ? valor : undefined;
}

export async function buscarSaude(alvo: AlvoDaSaude): Promise<SaudeDoNumero> {
  // `validate_channel!`
  if (!alvo.tokenAcesso) throw new Error('Falta o token de acesso.');
  if (!alvo.numeroId) throw new Error('Falta o phone number id.');
  if (!alvo.wabaId) throw new Error('Falta o business account id.');

  const cliente = clienteGraph(alvo.tokenAcesso);
  const versao = versaoDaSaude();

  const numero = await cliente.buscarNumero(alvo.numeroId, CAMPOS_DO_NUMERO, versao);
  const throughput = (numero['throughput'] ?? undefined) as { level?: string } | undefined;
  const saude: SaudeDoNumero = {
    id: comoTexto(numero['id']),
    display_phone_number: comoTexto(numero['display_phone_number']),
    verified_name: comoTexto(numero['verified_name']),
    name_status: comoTexto(numero['name_status']),
    quality_rating: comoTexto(numero['quality_rating']),
    messaging_limit_tier: comoTexto(numero['whatsapp_business_manager_messaging_limit']),
    status: comoTexto(numero['status']),
    account_mode: comoTexto(numero['account_mode']),
    code_verification_status: comoTexto(numero['code_verification_status']),
    ...(throughput ? { throughput, throughput_level: throughput.level } : {}),
    ...(typeof numero['is_on_biz_app'] === 'boolean' ? { is_on_biz_app: numero['is_on_biz_app'] } : {}),
    platform_type: comoTexto(numero['platform_type']),
  };

  // Como no original: se só a WABA falhar, a saúde do número já buscada volta assim mesmo.
  try {
    const waba = await cliente.buscarNumero(alvo.wabaId, CAMPOS_DA_WABA, versao);
    return {
      ...saude,
      business_account_id: comoTexto(waba['id']),
      business_account_name: comoTexto(waba['name']),
    };
  } catch {
    return saude;
  }
}

/** `platform_type`/`throughput_level` em `NOT_APPLICABLE`: o número ainda está sendo provisionado. */
export function numeroPendente(saude: SaudeDoNumero): boolean {
  return (
    saude.platform_type === 'NOT_APPLICABLE' ||
    saude.throughput_level === 'NOT_APPLICABLE' ||
    saude.throughput?.level === 'NOT_APPLICABLE'
  );
}
