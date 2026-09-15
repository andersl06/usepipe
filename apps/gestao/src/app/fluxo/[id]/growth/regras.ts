import type { EnvioGrowth } from '../../../../lib/growth';

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
