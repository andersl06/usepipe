// `rodarFluxo` calls entrada.ts, not rodarFluxoNaEntrada or entrada.tsx.
const untouched = "// rodarFluxo and /v1/fluxos are string content";
const template = `/* rodarFluxo is string content */`;
const expression = /\/\/ rodarFluxo/;
// The fluxo goes through rodarFluxo(); fluxo is ordinary prose.
// fluxo: ordinary prose; `fluxo`: an identifier.
/** See `apps/api/src/dominio/entrada.ts` and /v1/fluxos. */
// https://example.org/v1/fluxos?fluxo=1 stays external.
// ?fluxo=1 is a local query parameter. `fluxo` is a code token.
// /v1/fluxos-extra and /painel-extra stay; /painel is a local route.
// "rodarFluxo" is quoted as an identifier; `data-bloco` is an attribute.
// `codigo_gravado` is persisted. `modo_antigo` is ambiguous.
// `fila-entrada` and .acoes-em-lote use named technical values.
