export function camposVisiveisDoServico(principal: boolean, persistente: boolean) {
  return {
    mostrarPersistente: !principal,
    mostrarExpiracao: !principal && !persistente,
  };
}
