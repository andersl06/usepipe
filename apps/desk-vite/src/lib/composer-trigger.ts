/**
 * Gatilho das respostas prontas do compositor, copiado do Desk da Blip (ensaio 4 de
 * 03.1-ENSAIOS.md, 2026-10-01): só `#`, só no início do texto; `/` não abre nada.
 */
export const TRIGGERS = ['#'] as const;
export const TRIGGER_POSITION = 'inicio' as const;

export function responsesTrigger(texto: string): { aberto: boolean; termo: string } {
  const gatilho = TRIGGERS.find((g) => texto.startsWith(g));
  return gatilho ? { aberto: true, termo: texto.slice(gatilho.length) } : { aberto: false, termo: '' };
}

/** Como a Blip: prefixo do nome ou prefixo de qualquer palavra do nome, sem diferenciar maiúsculas. */
export function combinaComTermo(titulo: string, termo: string): boolean {
  const t = termo.trim().toLowerCase();
  if (!t) return true;
  const nome = titulo.toLowerCase();
  return nome.startsWith(t) || nome.includes(` ${t}`);
}
