export interface EtiquetaDeEncerramento {
  id: string;
  nome: string;
  cor?: string | null;
  obrigatoriaNoEncerramento: boolean;
}

/** A Blip bloqueia a confirmação enquanto faltar qualquer tag obrigatória. */
export function encerramentoPodeConfirmar(
  etiquetas: readonly EtiquetaDeEncerramento[],
  selecionadas: readonly string[],
  enviando: boolean,
): boolean {
  return !enviando && etiquetas.every((etiqueta) =>
    !etiqueta.obrigatoriaNoEncerramento || selecionadas.includes(etiqueta.id),
  );
}
