import type { EnvioGrowth } from '@pipe/contracts';

export function filtrarEnvios(envios: EnvioGrowth[], search: string, state: string) {
  const termo = search.trim().toLocaleLowerCase('pt-BR');
  return envios.filter(
    (envio) =>
      (!termo || envio.templateNome?.toLocaleLowerCase('pt-BR').includes(termo)) &&
      (state === 'todos' || envio.state === state),
  );
}

export interface DestinationCsv {
  telefone: string;
  nome: string | null;
  /** Colunas depois de telefone/nome — os `{{1}}`, `{{2}}`… do modelo, na ordem. */
  parametros: string[];
}

/**
 * The bulk-dispatch spreadsheet: the first row is a header (discarded), the following columns are `telefone,nome,parametro1,parametro2,...` — name and parameters are optional. A row with no phone number doesn't become a recipient.
 */
export function analisarCsv(texto: string): DestinationCsv[] {
  const linhas = texto
    .split(/\r?\n/)
    .map((linha) => linha.trim())
    .filter(Boolean);
  return linhas
    .slice(1)
    .map((linha) => {
      const [telefone, nome, ...parametros] = linha.split(',').map((column) => column.trim());
      return {
        telefone: telefone ?? '',
        nome: nome || null,
        parametros: parametros.filter(Boolean),
      };
    })
    .filter((destination) => destination.telefone);
}

export type SendBlockReason = 'template_not_approved' | 'template_inactive' | 'window_expired';

export interface SendBlockInput {
  templateStatus: string;
  /** Undefined means the flag is unknown and does not block. */
  active?: boolean;
  /** Free text needs the 24 h window; templates never do. */
  freeText?: boolean;
  windowOpen?: boolean;
}

/** Why a send must be blocked in the UI; the server enforces the same rules. */
export function sendBlockReason(input: SendBlockInput): SendBlockReason | null {
  const approved = input.templateStatus === 'APPROVED' || input.templateStatus === 'aprovado';
  if (!approved) return 'template_not_approved';
  if (input.active === false) return 'template_inactive';
  if (input.freeText && input.windowOpen === false) return 'window_expired';
  return null;
}

export const SEND_BLOCK_MESSAGE: Record<SendBlockReason, string> = {
  template_not_approved: 'Modelo não aprovado pela Meta.',
  template_inactive: 'Modelo inativo.',
  window_expired: 'Janela de 24 h encerrada: envie um modelo aprovado.',
};
