/**
 * Canais WhatsApp/Instagram — tipos e regras PURAS do lado da tela.
 *
 * Espelha os tipos de `apps/api/src/controladores/canais.ts` e
 * `canais-instagram.ts` (não importa de lá: são pacotes diferentes, e aquele
 * lado carrega Postgres). Arquivo sem `./api` de propósito — só tipo e função
 * pura, testável por `tests/canais.test.ts` sem tocar em `import.meta.env`.
 */

export interface CanalWhatsAppVisivel {
  id: string;
  nome: string;
  ativo: boolean;
  wabaId: string | null;
  numeroId: string | null;
  numero: string | null;
  nomeExibicao: string | null;
  estado: 'conectado' | 'desligado' | 'indisponivel';
  qualidade: string | null;
  limite: string | null;
  motivo: string | null;
  reautorizacaoPendente: boolean;
  webhookUrl: string;
  criadoEm: string;
}

export interface PerfilVisivel {
  sobre: string;
  endereco: string;
  descricao: string;
  email: string;
  sites: string[];
  categoria: string;
  fotoUrl: string | null;
  nome: {
    exibicao: string | null;
    status: string | null;
    novoNome: string | null;
    novoStatus: string | null;
  };
}

export interface PedidoDePerfil {
  endereco?: string;
  descricao?: string;
  email?: string;
  sites?: string[];
  categoria?: string;
  foto?: string;
}

export interface PreferenciasDoCanal {
  quickReply: boolean;
  menu: boolean;
  alertaRecategorizacao: { ativo: boolean; emails: string[] };
}

export interface PedidoDePreferencias {
  quickReply?: boolean;
  menu?: boolean;
  alertaRecategorizacao?: { ativo?: boolean; emails?: string[] };
}

export interface CanalInstagramVisivel {
  id: string;
  nome: string;
  ativo: boolean;
  igUserId: string | null;
  username: string | null;
  estado: 'conectado' | 'desligado' | 'indisponivel';
  motivo: string | null;
  tokenExpiraEm: string | null;
  webhookUrl: string;
  criadoEm: string;
}

/** Mesmos limites de `apps/api/src/dominio/whatsapp/perfil.ts` — só para o contador da tela. */
export const LIMITES_DO_PERFIL = {
  endereco: 256,
  descricao: 512,
  email: 128,
  site: 256,
  sites: 2,
} as const;

/**
 * O `vertical` do WhatsApp Business Profile — lista pública da Cloud API
 * (Meta), não inventada aqui. `categoria` do perfil só aceita um destes
 * códigos; o backend confere só o FORMATO (`/^[A-Z_]{2,40}$/`), quem confere o
 * valor de verdade é a Meta.
 */
export const CATEGORIAS_DO_PERFIL: readonly { valor: string; rotulo: string }[] = [
  { valor: 'UNDECIDED', rotulo: 'Não decidido' },
  { valor: 'OTHER', rotulo: 'Outro' },
  { valor: 'AUTO', rotulo: 'Automotivo' },
  { valor: 'BEAUTY', rotulo: 'Beleza, spa e salão' },
  { valor: 'APPAREL', rotulo: 'Vestuário e moda' },
  { valor: 'EDU', rotulo: 'Educação' },
  { valor: 'ENTERTAIN', rotulo: 'Entretenimento' },
  { valor: 'EVENT_PLAN', rotulo: 'Planejamento de eventos' },
  { valor: 'FINANCE', rotulo: 'Finanças' },
  { valor: 'GROCERY', rotulo: 'Supermercado' },
  { valor: 'GOVT', rotulo: 'Governo' },
  { valor: 'HOTEL', rotulo: 'Hotelaria e turismo' },
  { valor: 'HEALTH', rotulo: 'Saúde' },
  { valor: 'NONPROFIT', rotulo: 'Organização sem fins lucrativos' },
  { valor: 'PROF_SERVICES', rotulo: 'Serviços profissionais' },
  { valor: 'RETAIL', rotulo: 'Varejo' },
  { valor: 'TRAVEL', rotulo: 'Viagem e transporte' },
  { valor: 'RESTAURANT', rotulo: 'Restaurante' },
  { valor: 'NOT_A_BIZ', rotulo: 'Não é uma empresa' },
];

/** O `motivo` de `indisponivel`, em português — mesmos códigos do domínio da `api`. */
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
 * "Insira os e-mails separados por vírgula" (ficha §4) → lista. Aceita
 * vírgula OU quebra de linha, tira espaço, tira vazio, tira repetido.
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

/** O caminho de volta: lista → texto separado por vírgula, para o campo. */
export function emailsParaTexto(emails: readonly string[]): string {
  return emails.join(', ');
}

/** Sites do perfil: um por linha no campo, lista para a API (até `LIMITES_DO_PERFIL.sites`). */
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
