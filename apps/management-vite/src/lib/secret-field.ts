export function estadoVisualDoCampoSecreto(visivel: boolean) {
  return visivel
    ? { tipo: 'text' as const, icone: 'olho-riscado' as const, acao: 'Ocultar' }
    : { tipo: 'password' as const, icone: 'olho' as const, acao: 'Mostrar' };
}
