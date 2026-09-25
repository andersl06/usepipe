export interface ClosureTag {
  id: string;
  nome: string;
  cor?: string | null;
  obrigatoriaInClosure: boolean;
}

/** A Blip bloqueia a confirmação enquanto faltar qualquer tag obrigatória. */
export function closureCanConfirm(
  etiquetas: readonly ClosureTag[],
  selecionadas: readonly string[],
  enviando: boolean,
): boolean {
  return !enviando && etiquetas.every((etiqueta) =>
    !etiqueta.obrigatoriaInClosure || selecionadas.includes(etiqueta.id),
  );
}
