/**
 * Normaliza uma conversa em transcrição legível para o modelo: quem falou, quando,
 * o quê.
 *
 * Duas decisões vêm direto do case-sync:
 *
 * 1. **Cada linha ganha um rótulo curto (`m1`, `m2`…), não o uuid da mensagem.**
 *    O modelo cita evidência pelo rótulo e nós traduzimos de volta pelo índice. É
 *    barato em token e, principalmente, é **validável**: rótulo que não existe é
 *    erro explícito, do mesmo jeito que a opção de picklist inválida era.
 * 2. **Áudio sem transcrição é marcado como não transcrito, não some.** No
 *    case-sync, 229 áudios viraram silêncio e o resumo saiu confiante sobre uma
 *    conversa que ninguém tinha lido.
 */

export type DirecaoMensagem = 'entrada' | 'saida' | 'interna';
export type AutorMensagem = 'contato' | 'atendente' | 'bot' | 'sistema';
export type TipoMensagem =
  'texto' | 'imagem' | 'audio' | 'video' | 'documento' | 'localizacao' | 'template';

export interface AnexoTranscricao {
  nomeArquivo?: string | null;
  duracaoSeg?: number | null;
  /** Texto do áudio quando alguém já transcreveu. Ausente, a linha diz que falta. */
  transcricao?: string | null;
}

/** Espelha o essencial de `mensagem` (§4 do modelo de dados). */
export interface MensagemTranscricao {
  id: string;
  criadaEm: Date;
  direcao: DirecaoMensagem;
  autorTipo: AutorMensagem;
  autorNome?: string | null;
  tipo: TipoMensagem;
  conteudo?: string | null;
  anexo?: AnexoTranscricao | null;
}

export interface LinhaTranscricao {
  /** Rótulo curto usado pelo modelo para citar evidência. */
  rotulo: string;
  mensagemId: string;
  texto: string;
}

export interface Transcricao {
  /** O texto que vai para o modelo. */
  texto: string;
  linhas: LinhaTranscricao[];
  /** `rotulo` → `mensagem.id`. É o que traduz a evidência de volta para o banco. */
  indice: Record<string, string>;
  truncada: boolean;
  mensagensOmitidas: number;
  totalMensagens: number;
}

export interface OpcoesTranscricao {
  /** Orçamento total da transcrição em caracteres. */
  maxCaracteres?: number;
  /** Teto por mensagem, antes de qualquer truncamento global. */
  maxCaracteresPorMensagem?: number;
  /**
   * Fatia do orçamento reservada ao início quando precisa truncar. O resto vai
   * para o fim. Início e fim é onde está a informação: o pedido e o desfecho.
   */
  fracaoInicio?: number;
}

export const MAX_CARACTERES_PADRAO = 24_000;
export const MAX_CARACTERES_POR_MENSAGEM_PADRAO = 2_000;
export const FRACAO_INICIO_PADRAO = 0.4;

const MARCA_CORTE = '…(cortado)';

/** Como cada autor aparece na transcrição. */
export function rotuloDoAutor(m: MensagemTranscricao): string {
  const nome = m.autorNome?.trim();
  switch (m.autorTipo) {
    case 'contato':
      return nome || 'Cliente';
    case 'atendente':
      return nome || 'Atendente';
    case 'bot':
      return nome || 'Bot';
    case 'sistema':
      return 'Sistema';
  }
}

function duracao(segundos: number | null | undefined): string {
  return typeof segundos === 'number' && segundos > 0
    ? `${Math.round(segundos)}s`
    : 'duração desconhecida';
}

/** `dd/mm HH:MM` em UTC — sem fuso implícito, para a transcrição ser determinística. */
export function carimboDeHora(em: Date): string {
  const iso = em.toISOString();
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)} ${iso.slice(11, 16)}`;
}

/**
 * O corpo de uma mensagem já resolvido: áudio usa o texto transcrito quando
 * existe, mídia vira descrição, mensagem vazia é dita como vazia.
 */
export function corpoDaMensagem(m: MensagemTranscricao): string {
  const texto = m.conteudo?.trim() ?? '';
  const arquivo = m.anexo?.nomeArquivo?.trim();

  switch (m.tipo) {
    case 'audio': {
      const transcrito = m.anexo?.transcricao?.trim();
      if (transcrito) return `(áudio de ${duracao(m.anexo?.duracaoSeg)}, transcrito) ${transcrito}`;
      return `(áudio de ${duracao(m.anexo?.duracaoSeg)}, NÃO TRANSCRITO — conteúdo desconhecido)`;
    }
    case 'imagem':
    case 'video':
    case 'documento': {
      const rotulo = arquivo ? `${m.tipo}: ${arquivo}` : m.tipo;
      return texto ? `(${rotulo}) ${texto}` : `(${rotulo}, sem legenda)`;
    }
    case 'localizacao':
      return texto ? `(localização) ${texto}` : '(localização)';
    case 'texto':
    case 'template':
      return texto || '(mensagem vazia)';
  }
}

function cortar(texto: string, max: number): string {
  if (texto.length <= max) return texto;
  return texto.slice(0, Math.max(0, max - MARCA_CORTE.length)) + MARCA_CORTE;
}

/** Monta a linha completa de uma mensagem, já com rótulo, hora e autor. */
export function montarLinha(
  m: MensagemTranscricao,
  rotulo: string,
  maxCaracteresPorMensagem: number,
): LinhaTranscricao {
  const marcaInterna = m.direcao === 'interna' ? ' (nota interna)' : '';
  const cabecalho = `[${rotulo}] ${carimboDeHora(m.criadaEm)} ${rotuloDoAutor(m)}${marcaInterna}: `;
  const corpo = cortar(corpoDaMensagem(m).replace(/\s+/g, ' ').trim(), maxCaracteresPorMensagem);
  return { rotulo, mensagemId: m.id, texto: cabecalho + corpo };
}

/**
 * Só as linhas que sobreviveram ao truncamento entram no índice: rótulo citado
 * fora dele é alucinação, e é assim que a avaliação a pega.
 */
function indexar(linhas: readonly LinhaTranscricao[]): Record<string, string> {
  const indice: Record<string, string> = {};
  for (const linha of linhas) indice[linha.rotulo] = linha.mensagemId;
  return indice;
}

function semTruncar(linhas: LinhaTranscricao[]): Transcricao {
  return {
    texto: linhas.map((l) => l.texto).join('\n'),
    linhas,
    indice: indexar(linhas),
    truncada: false,
    mensagensOmitidas: 0,
    totalMensagens: linhas.length,
  };
}

/**
 * Normaliza a conversa e, quando não cabe no orçamento, preserva início e fim,
 * dizendo quantas mensagens ficaram de fora. A ordem cronológica é imposta aqui:
 * não confie na ordem de entrada.
 */
export function montarTranscricao(
  mensagens: readonly MensagemTranscricao[],
  opcoes: OpcoesTranscricao = {},
): Transcricao {
  const maxCaracteres = opcoes.maxCaracteres ?? MAX_CARACTERES_PADRAO;
  const maxPorMensagem = opcoes.maxCaracteresPorMensagem ?? MAX_CARACTERES_POR_MENSAGEM_PADRAO;
  const fracaoInicio = opcoes.fracaoInicio ?? FRACAO_INICIO_PADRAO;

  const ordenadas = [...mensagens].sort((a, b) => a.criadaEm.getTime() - b.criadaEm.getTime());
  const todas = ordenadas.map((m, i) => montarLinha(m, `m${i + 1}`, maxPorMensagem));

  const total = todas.reduce((soma, l) => soma + l.texto.length + 1, 0);
  if (total <= maxCaracteres || todas.length <= 2) return semTruncar(todas);

  const orcamentoInicio = Math.floor(maxCaracteres * fracaoInicio);
  const orcamentoFim = maxCaracteres - orcamentoInicio;

  let fimDoInicio = 0;
  let gasto = 0;
  while (fimDoInicio < todas.length) {
    const custo = todas[fimDoInicio]!.texto.length + 1;
    if (fimDoInicio > 0 && gasto + custo > orcamentoInicio) break;
    gasto += custo;
    fimDoInicio++;
  }

  let inicioDoFim = todas.length;
  gasto = 0;
  while (inicioDoFim > fimDoInicio) {
    const custo = todas[inicioDoFim - 1]!.texto.length + 1;
    if (inicioDoFim < todas.length && gasto + custo > orcamentoFim) break;
    gasto += custo;
    inicioDoFim--;
  }

  const omitidas = Math.max(0, inicioDoFim - fimDoInicio);
  if (omitidas === 0) return semTruncar(todas);

  const inicio = todas.slice(0, fimDoInicio);
  const fim = todas.slice(inicioDoFim);
  const texto = [
    ...inicio.map((l) => l.texto),
    `[… ${omitidas} mensagens omitidas do meio da conversa …]`,
    ...fim.map((l) => l.texto),
  ].join('\n');

  const linhas = [...inicio, ...fim];
  return {
    texto,
    linhas,
    indice: indexar(linhas),
    truncada: true,
    mensagensOmitidas: omitidas,
    totalMensagens: todas.length,
  };
}
