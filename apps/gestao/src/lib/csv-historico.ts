import type { CartaoHistorico } from '../componentes/lista-historico';

/**
 * O CSV da ação em massa do Histórico.
 *
 * Mora fora do componente porque escapar campo é lógica, não desenho, e
 * lógica precisa de uma verificação que roda. A do fim deste arquivo é ela:
 *
 *     pnpm --filter @pipe/gestao exec tsx src/lib/csv-historico.ts
 *
 * Separador é ponto e vírgula, e não vírgula: no Excel em português é o
 * separador de lista, e com vírgula a planilha abre tudo numa coluna só.
 */

/** Os rótulos das colunas, na ordem em que saem no arquivo. */
export const COLUNAS_CSV = [
  'Ticket',
  'Encerrada',
  'Contato',
  'Fila',
  'Atendente',
  'Espera do cliente',
  '1ª resposta',
  'Atendimento',
  'Situação',
  'Etiquetas',
] as const;

function valoresDe(c: CartaoHistorico): string[] {
  return [
    c.ticket,
    c.encerrada,
    c.contato,
    c.fila,
    c.atendente,
    c.espera,
    c.primeiraResposta,
    c.atendimento,
    c.statusTexto,
    c.etiquetas.join(', '),
  ];
}

/**
 * Campo sempre entre aspas, com aspas de dentro dobradas. É o mínimo que
 * sobrevive a nome de contato com ponto e vírgula, com aspas ou com quebra de
 * linha — e nome de contato tem os três.
 */
export function celulaCsv(valor: string): string {
  return `"${valor.replace(/"/g, '""')}"`;
}

export function montarCsv(cartoes: readonly CartaoHistorico[]): string {
  const linhas = [
    COLUNAS_CSV.map(celulaCsv).join(';'),
    ...cartoes.map((c) => valoresDe(c).map(celulaCsv).join(';')),
  ];
  // O BOM na frente é o que faz o Excel em português abrir o acento certo.
  return `\uFEFF${linhas.join('\r\n')}\r\n`;
}

/* ------------------------------------------------------------------ conferência */

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/'))) {
  /* Sem `node:assert`: este arquivo também vai para o navegador, e importar
     módulo de Node aqui quebraria o pacote do cliente. Um `throw` basta. */
  let passaram = 0;
  const conferir = (condicao: boolean, oQue: string) => {
    if (!condicao) throw new Error(`falhou: ${oQue}`);
    passaram += 1;
  };

  const cartao = (parcial: Partial<CartaoHistorico>): CartaoHistorico => ({
    id: 'x',
    ticket: '#1',
    encerrada: '05/09, 19:22',
    contato: 'Contato',
    fila: 'Suporte',
    atendente: 'Ana',
    espera: '10:05',
    primeiraResposta: '01:22',
    atendimento: '45:33',
    statusTexto: 'Finalizada',
    statusClasse: 'etiqueta',
    critico: false,
    etiquetas: [],
    ...parcial,
  });

  const csv = montarCsv([
    cartao({ contato: 'Silva; Souza' }),
    cartao({ contato: 'O "Grande"', etiquetas: ['Elogio', 'Reclamação'] }),
  ]);

  // O BOM abre o arquivo, senão o Excel come o acento.
  conferir(csv.startsWith('\uFEFF'), 'o CSV começa com BOM');

  const linhas = csv.slice(1).trimEnd().split('\r\n');
  conferir(linhas.length === 3, 'cabeçalho mais duas conversas');
  conferir(linhas[0] === COLUNAS_CSV.map((c) => `"${c}"`).join(';'), 'cabeçalho com as dez colunas');

  // Ponto e vírgula dentro do campo não pode virar coluna nova: as aspas seguram.
  conferir(linhas[1]!.includes('"Silva; Souza"'), 'o separador dentro do campo fica preso');
  conferir(linhas[1]!.split('";"').length === COLUNAS_CSV.length, 'dez colunas na primeira');

  // Aspas do nome saem dobradas, que é como o formato escapa aspas.
  conferir(linhas[2]!.includes('"O ""Grande"""'), 'aspas dobradas');
  conferir(linhas[2]!.endsWith('"Elogio, Reclamação"'), 'etiquetas juntas na última coluna');

  conferir(montarCsv([]).slice(1).trimEnd().split('\r\n').length === 1, 'sem linha, só cabeçalho');

  console.log(`csv-historico: as ${passaram} conferências passaram`);
}
