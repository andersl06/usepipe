/**
 * Pure screen-side WhatsApp/Instagram channel types and rules mirror `apps/api/src/controladores/canais.ts` and `canais-instagram.ts` without importing backend Postgres code. Omit `./api` intentionally so `tests/canais.test.ts` can run without Vite or `import.meta.env`.
 */

export interface ChannelWhatsAppVisible {
  id: string;
  name: string;
  active: boolean;
  wabaId: string | null;
  numeroId: string | null;
  number: string | null;
  displayName: string | null;
  state: 'conectado' | 'desligado' | 'indisponivel';
  quality: string | null;
  limite: string | null;
  motivo: string | null;
  reauthorizationPending: boolean;
  webhookUrl: string;
  criadoEm: string;
}

export interface PerfilVisivel {
  about: string;
  endereco: string;
  description: string;
  email: string;
  sites: string[];
  category: string;
  fotoUrl: string | null;
  nome: {
    display: string | null;
    status: string | null;
    novoNome: string | null;
    novoStatus: string | null;
  };
}

export interface PedidoDePerfil {
  about?: string;
  endereco?: string;
  description?: string;
  email?: string;
  sites?: string[];
  category?: string;
  foto?: string;
}

export interface ChannelPreferences {
  quickReply: boolean;
  menu: boolean;
  alertRecategorization: { active: boolean; emails: string[] };
}

export interface PreferencesRequest {
  quickReply?: boolean;
  menu?: boolean;
  alertRecategorization?: { active?: boolean; emails?: string[] };
}

export interface ChannelInstagramVisible {
  id: string;
  name: string;
  active: boolean;
  igUserId: string | null;
  username: string | null;
  state: 'conectado' | 'desligado' | 'indisponivel';
  motivo: string | null;
  tokenExpiresAt: string | null;
  webhookUrl: string;
  criadoEm: string;
}
export interface ChannelMessengerVisible { id: string; name: string; active: boolean; paginaId: string | null; state: 'conectado' | 'desligado'; webhookUrl: string; criadoEm: string }

/** Use the same profile limits as `apps/api/src/dominio/whatsapp/perfil.ts` for screen counters only. */
export const LIMITES_DO_PERFIL = {
  endereco: 256,
  descricao: 512,
  email: 128,
  site: 256,
  sites: 2,
} as const;

/**
 * WhatsApp Business Profile `vertical` codes come from Meta's public Cloud API list, not invented locally. Profile `categoria` accepts those codes; backend checks only syntax (`/^[A-Z_]{2,40}$/`), while Meta validates the actual value.
 */
export const CATEGORIAS_DO_PERFIL: readonly { value: string; rotulo: string }[] = [
  { value: 'UNDECIDED', rotulo: 'Não decidido' },
  { value: 'OTHER', rotulo: 'Outro' },
  { value: 'AUTO', rotulo: 'Automotivo' },
  { value: 'BEAUTY', rotulo: 'Beleza, spa e salão' },
  { value: 'APPAREL', rotulo: 'Vestuário e moda' },
  { value: 'EDU', rotulo: 'Educação' },
  { value: 'ENTERTAIN', rotulo: 'Entretenimento' },
  { value: 'EVENT_PLAN', rotulo: 'Planejamento de eventos' },
  { value: 'FINANCE', rotulo: 'Finanças' },
  { value: 'GROCERY', rotulo: 'Supermercado' },
  { value: 'GOVT', rotulo: 'Governo' },
  { value: 'HOTEL', rotulo: 'Hotelaria e turismo' },
  { value: 'HEALTH', rotulo: 'Saúde' },
  { value: 'NONPROFIT', rotulo: 'Organização sem fins lucrativos' },
  { value: 'PROF_SERVICES', rotulo: 'Serviços profissionais' },
  { value: 'RETAIL', rotulo: 'Varejo' },
  { value: 'TRAVEL', rotulo: 'Viagem e transporte' },
  { value: 'RESTAURANT', rotulo: 'Restaurante' },
  { value: 'NOT_A_BIZ', rotulo: 'Não é uma empresa' },
];

/** Keep the `motivo` of `indisponivel` in Portuguese, using the same domain codes as `api`. */
const ROTULO_MOTIVO: Readonly<Record<string, string>> = {
  reautorizacao_pendente: 'Aguardando reautorização do WhatsApp.',
  sem_token: 'Canal sem token de acesso: reconecte.',
  meta_inacessivel: 'A Meta não respondeu: tente novamente em instantes.',
  canal_sem_waba: 'Canal sem WABA: reconecte.',
};

export function rotuloDoMotivo(motivo: string | null): string {
  if (!motivo) return 'Canal indisponível.';
  return ROTULO_MOTIVO[motivo] ?? motivo;
}

/**
 * Convert reference `Insira os e-mails separados por vírgula` (sheet Section 4) to a list. Accept commas or newlines, trim whitespace, drop empty values and duplicates.
 */
export function textoParaEmails(texto: string): string[] {
  const vistos = new Set<string>();
  const saida: string[] = [];
  for (const bruto of texto.split(/[,\n]/)) {
    const limpo = bruto.trim().toLowerCase();
    if (!limpo || vistos.has(limpo)) continue;
    vistos.add(limpo);
    saida.push(limpo);
  }
  return saida;
}

/** Convert email list back to comma-separated field text. */
export function emailsParaTexto(emails: readonly string[]): string {
  return emails.join(', ');
}

/** Parse profile sites one per field line into an API list, capped at `LIMITES_DO_PERFIL.sites`. */
export function textoParaSites(texto: string): string[] {
  const vistos = new Set<string>();
  const saida: string[] = [];
  for (const bruto of texto.split('\n')) {
    const limpo = bruto.trim();
    if (!limpo || vistos.has(limpo)) continue;
    vistos.add(limpo);
    saida.push(limpo);
  }
  return saida;
}

export function sitesParaTexto(sites: readonly string[]): string {
  return sites.join('\n');
}
