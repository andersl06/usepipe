import type { EnvioGrowth } from '@pipe/contracts';

export function resumirEnvios(envios: EnvioGrowth[]) {
  return {
    audiencia: new Set(envios.map((envio) => envio.contactName ?? envio.id)).size,
    recebidas: envios.filter((envio) => envio.state === 'entregue' || envio.state === 'lida')
      .length,
    lidas: envios.filter((envio) => envio.state === 'lida').length,
    falharam: envios.filter((envio) => envio.state === 'falhou').length,
  };
}

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
