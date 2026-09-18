/* Regras de interface da tela de Contatos, copiadas do controlador da origem
   (`portal.js`, módulo `users`): contagem aproximada, período padrão do
   seletor, formatação de data e o lado de cada balão do histórico. */

/** `{{ $ctrl.totalItems }} Contatos Aproximadamente` / `1 Contato` / `0 Contato`. */
export function rotuloDeContagem(total: number): string {
  if (total > 1) return `${total} Contatos Aproximadamente`;
  return `${total} Contato`;
}

/** `getFormatedLastInteraction`: `toLocaleString(idioma, {ano, mês, dia, hora, minuto})`. */
export function formatarUltimaInteracao(data: Date | null | undefined): string {
  if (!data) return '-';
  return data.toLocaleString('pt-BR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** `ticket.$day` (moment `L`) e `ticket.$hour` (moment `LT`). */
export function diaEHora(data: Date): { dia: string; hora: string } {
  return {
    dia: data.toLocaleDateString('pt-BR'),
    hora: data.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
  };
}

/** Carimbo do balão do histórico: `16/09/2026 - 13:26`. */
export function carimboDaMensagem(data: Date): string {
  const { dia, hora } = diaEHora(data);
  return `${dia} - ${hora}`;
}

/** Texto do seletor de período: `09 set, 2026 - 00:00`. */
export function formatarLimiteDoPeriodo(data: Date): string {
  const dia = String(data.getDate()).padStart(2, '0');
  const mes = data.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '');
  const { hora } = diaEHora(data);
  return `${dia} ${mes}, ${data.getFullYear()} - ${hora}`;
}

/** Período padrão da origem: últimos 7 dias, do início do dia inicial ao fim do dia atual. */
export function periodoPadrao(hoje: Date): { inicio: Date; fim: Date } {
  const inicio = new Date(hoje);
  inicio.setDate(inicio.getDate() - 7);
  inicio.setHours(0, 0, 0, 0);
  const fim = new Date(hoje);
  fim.setHours(23, 59, 0, 0);
  return { inicio, fim };
}

/** Na origem o contato fica à direita (`.right`) e o bot/atendente à esquerda, com foto. */
export function ladoDaMensagem(direcao: string): 'direita' | 'esquerda' {
  return direcao === 'entrada' ? 'direita' : 'esquerda';
}

/** `modules.application.detail.attendance.history.<statusName>` traduzido para o estado do Pipe. */
export function rotuloDoStatus(estado: string): string {
  const rotulos: Record<string, string> = {
    na_fila: 'Na fila',
    atribuida: 'Atribuído',
    em_atendimento: 'Em atendimento',
    em_espera: 'Em atendimento',
    encerrada: 'Atendido',
  };
  return rotulos[estado] ?? estado;
}

/** `getChannelNameFromSource`: nome do canal a partir da origem. */
export function rotuloDoCanal(tipo: string, nome: string): string {
  const rotulos: Record<string, string> = {
    whatsapp_cloud: 'WhatsApp',
    email: 'E-mail',
    widget: 'Pipe Chat',
  };
  return rotulos[tipo] ?? nome;
}

/** Ao abrir o detalhe, o ticket ativo é o da URL (`?ticketId`) ou o mais recente. */
export function ticketAtivo<T extends { id: string }>(
  tickets: T[],
  ticketId?: string,
): T | undefined {
  return tickets.find((item) => item.id === ticketId) ?? tickets[0];
}
