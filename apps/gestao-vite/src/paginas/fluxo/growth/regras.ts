import type { EnvioGrowth } from '@pipe/contracts';

export function resumirEnvios(envios: EnvioGrowth[]) {
  return {
    audiencia: new Set(envios.map((envio) => envio.contatoNome ?? envio.id)).size,
    recebidas: envios.filter((envio) => envio.estado === 'entregue' || envio.estado === 'lida')
      .length,
    lidas: envios.filter((envio) => envio.estado === 'lida').length,
    falharam: envios.filter((envio) => envio.estado === 'falhou').length,
  };
}

export function filtrarEnvios(envios: EnvioGrowth[], busca: string, estado: string) {
  const termo = busca.trim().toLocaleLowerCase('pt-BR');
  return envios.filter(
    (envio) =>
      (!termo || envio.templateNome?.toLocaleLowerCase('pt-BR').includes(termo)) &&
      (estado === 'todos' || envio.estado === estado),
  );
}

export interface DestinoCsv {
  telefone: string;
  nome: string | null;
  /** Colunas depois de telefone/nome — os `{{1}}`, `{{2}}`… do modelo, na ordem. */
  parametros: string[];
}

/**
 * A planilha do disparo em massa: primeira linha é cabeçalho (descartada),
 * colunas seguintes são `telefone,nome,parametro1,parametro2,...` — nome e
 * parâmetros são opcionais. Linha sem telefone não vira destino.
 */
export function analisarCsv(texto: string): DestinoCsv[] {
  const linhas = texto
    .split(/\r?\n/)
    .map((linha) => linha.trim())
    .filter(Boolean);
  return linhas
    .slice(1)
    .map((linha) => {
      const [telefone, nome, ...parametros] = linha.split(',').map((coluna) => coluna.trim());
      return {
        telefone: telefone ?? '',
        nome: nome || null,
        parametros: parametros.filter(Boolean),
      };
    })
    .filter((destino) => destino.telefone);
}
