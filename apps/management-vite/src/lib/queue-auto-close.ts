/** Configuração de tags e encerramento automático da fila: tipos, rascunho do formulário e validação (espelha a API). */

export type UnidadeDeTempo = 'minutos' | 'horas';

export interface AutoCloseConfig {
  ativo: boolean;
  tempo: number;
  unidade: UnidadeDeTempo;
  soSePrimeiroAtendimento: boolean;
  naoSeAguardandoAtendente: boolean;
  removerDaTela: boolean;
  alerta: { ativo: boolean; mensagem: string; antecedencia: number; unidade: UnidadeDeTempo };
  tags: { ativo: boolean; tags: string[] };
}

/** Rascunho: os números ficam como texto enquanto a pessoa digita. */
export interface AutoCloseRascunho {
  tempo: string;
  unidade: UnidadeDeTempo;
  soSePrimeiroAtendimento: boolean;
  naoSeAguardandoAtendente: boolean;
  removerDaTela: boolean;
  alertaAtivo: boolean;
  alertaMensagem: string;
  alertaAntecedencia: string;
  alertaUnidade: UnidadeDeTempo;
  tagsAtivo: boolean;
  tags: string[];
}

export const MINUTOS_MAXIMO = 43_200;
export const MENSAGEM_MAXIMA = 1000;
export const TAGS_MAXIMO = 30;
export const TAG_TAMANHO_MAXIMO = 40;

/** Valores usados quando a fila nunca foi configurada e a pessoa liga o interruptor. */
export const CONFIG_PADRAO: AutoCloseConfig = {
  ativo: false,
  tempo: 60,
  unidade: 'minutos',
  soSePrimeiroAtendimento: false,
  naoSeAguardandoAtendente: false,
  removerDaTela: false,
  alerta: { ativo: false, mensagem: '', antecedencia: 5, unidade: 'minutos' },
  tags: { ativo: false, tags: [] },
};

export function rascunhoDe(config: AutoCloseConfig | null): AutoCloseRascunho {
  const c = config ?? CONFIG_PADRAO;
  return {
    tempo: String(c.tempo),
    unidade: c.unidade,
    soSePrimeiroAtendimento: c.soSePrimeiroAtendimento,
    naoSeAguardandoAtendente: c.naoSeAguardandoAtendente,
    removerDaTela: c.removerDaTela,
    alertaAtivo: c.alerta.ativo,
    alertaMensagem: c.alerta.mensagem,
    alertaAntecedencia: String(c.alerta.antecedencia),
    alertaUnidade: c.alerta.unidade,
    tagsAtivo: c.tags.ativo,
    tags: [...c.tags.tags],
  };
}

const emMinutos = (valor: number, unidade: UnidadeDeTempo) => (unidade === 'horas' ? valor * 60 : valor);

function inteiroPositivo(texto: string): number | null {
  const t = texto.trim();
  if (!/^\d+$/.test(t)) return null;
  const n = Number(t);
  return n > 0 ? n : null;
}

export interface ErrosDoRascunho {
  tempo?: string;
  alertaMensagem?: string;
  alertaAntecedencia?: string;
  tags?: string;
}

export function errosDoRascunho(r: AutoCloseRascunho): ErrosDoRascunho {
  const erros: ErrosDoRascunho = {};
  const tempo = inteiroPositivo(r.tempo);
  if (tempo === null) erros.tempo = 'O tempo deve ser um valor maior que 0.';
  else if (emMinutos(tempo, r.unidade) > MINUTOS_MAXIMO) erros.tempo = 'O tempo máximo é de 30 dias.';
  if (r.alertaAtivo) {
    if (!r.alertaMensagem.trim()) erros.alertaMensagem = 'É necessário informar uma mensagem';
    else if (/[<>]/.test(r.alertaMensagem)) erros.alertaMensagem = 'A mensagem não pode ter HTML.';
    else if (r.alertaMensagem.length > MENSAGEM_MAXIMA) erros.alertaMensagem = `A mensagem aceita até ${MENSAGEM_MAXIMA} caracteres.`;
    const antecedencia = inteiroPositivo(r.alertaAntecedencia);
    if (antecedencia === null) erros.alertaAntecedencia = 'O tempo deve ser um valor maior que 0.';
    else if (tempo !== null && emMinutos(antecedencia, r.alertaUnidade) >= emMinutos(tempo, r.unidade)) {
      erros.alertaAntecedencia = 'Esse valor não pode ser maior que o tempo de inatividade';
    }
  }
  if (r.tagsAtivo) {
    const erroDasTags = r.tags.length === 0 ? 'Informe ao menos uma tag.' : erroDeTags(r.tags);
    if (erroDasTags) erros.tags = erroDasTags;
  }
  return erros;
}

export const rascunhoValido = (r: AutoCloseRascunho): boolean => Object.keys(errosDoRascunho(r)).length === 0;

/** Corpo do PUT; só chamar com rascunho válido. */
export function configDoRascunho(r: AutoCloseRascunho, ativo: boolean): AutoCloseConfig {
  return {
    ativo,
    tempo: Number(r.tempo.trim()),
    unidade: r.unidade,
    soSePrimeiroAtendimento: r.soSePrimeiroAtendimento,
    naoSeAguardandoAtendente: r.naoSeAguardandoAtendente,
    removerDaTela: r.removerDaTela,
    alerta: {
      ativo: r.alertaAtivo,
      mensagem: r.alertaAtivo ? r.alertaMensagem.trim() : '',
      antecedencia: r.alertaAtivo ? Number(r.alertaAntecedencia.trim()) : CONFIG_PADRAO.alerta.antecedencia,
      unidade: r.alertaUnidade,
    },
    tags: { ativo: r.tagsAtivo, tags: r.tagsAtivo ? r.tags : [] },
  };
}

/** Algo mudou em relação ao que está gravado? */
export function rascunhoAlterado(r: AutoCloseRascunho, config: AutoCloseConfig | null): boolean {
  return JSON.stringify(r) !== JSON.stringify(rascunhoDe(config));
}

/** As tags digitadas diferem das gravadas (ordem conta). */
export function tagsAlteradas(atuais: readonly string[], gravadas: readonly string[]): boolean {
  return atuais.length !== gravadas.length || atuais.some((t, i) => t !== gravadas[i]);
}

/** Valida as tags da fila antes de enviar: lista vazia é permitida (apaga todas). */
export function erroDeTags(tags: readonly string[]): string | null {
  if (tags.length > TAGS_MAXIMO) return `Use no máximo ${TAGS_MAXIMO} tags.`;
  if (tags.some((t) => t.length > TAG_TAMANHO_MAXIMO)) return `Cada tag aceita até ${TAG_TAMANHO_MAXIMO} caracteres.`;
  if (tags.some((t) => /[<>]/.test(t))) return 'As tags não podem ter HTML.';
  return null;
}
