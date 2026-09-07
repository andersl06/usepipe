/**
 * Iniciais para o avatar. Duas, no máximo — mais do que isso não cabe no
 * círculo do trilho.
 *
 * Vive fora de `servidor/banco.ts` porque é função pura e o `banco` passou a
 * importar `next/headers` para ler o cookie de sessão: quem só quer as iniciais
 * (a ficha do contato, e o teste) não deve arrastar o runtime do Next junto.
 */
export function iniciaisDe(nome: string): string {
  const partes = nome.trim().split(/\s+/);
  const primeira = partes[0]?.[0] ?? '?';
  const ultima = partes.length > 1 ? (partes[partes.length - 1]?.[0] ?? '') : '';
  return (primeira + ultima).toUpperCase();
}
