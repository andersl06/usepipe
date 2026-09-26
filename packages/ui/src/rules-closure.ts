export interface ClosureTag {
  id: string;
  nome: string;
  cor?: string | null;
  requiredInClosure: boolean;
}

/** Blip blocks confirmation until all required tags are selected. */
export function closureCanConfirm(
  etiquetas: readonly ClosureTag[],
  selecionadas: readonly string[],
  enviando: boolean,
): boolean {
  return !enviando && etiquetas.every((etiqueta) =>
    !etiqueta.requiredInClosure || selecionadas.includes(etiqueta.id),
  );
}
