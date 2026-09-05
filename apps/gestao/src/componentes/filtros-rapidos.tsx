/**
 * Filtros rápidos do monitoramento.
 *
 * Formulário GET puro: o estado do filtro vive na URL, então recarga periódica,
 * F5 e link compartilhado mostram exatamente a mesma tela. Nada de estado de
 * cliente para isso.
 */
export function FiltrosRapidos({
  filas,
  atendentes,
  atual,
}: {
  filas: readonly { id: string; nome: string }[];
  atendentes: readonly { id: string; nome: string }[];
  atual: { fila?: string; atendente?: string; aba?: string; busca?: string };
}) {
  return (
    <form className="quickfilters" method="get" action="/">
      <span className="lbl">Filtros rápidos</span>

      <select name="fila" defaultValue={atual.fila ?? ''} aria-label="Fila" className="btn">
        <option value="">Todas as filas</option>
        {filas.map((f) => (
          <option key={f.id} value={f.id}>
            {f.nome}
          </option>
        ))}
      </select>

      <select
        name="atendente"
        defaultValue={atual.atendente ?? ''}
        aria-label="Atendente"
        className="btn"
      >
        <option value="">Todos os atendentes</option>
        {atendentes.map((a) => (
          <option key={a.id} value={a.id}>
            {a.nome}
          </option>
        ))}
      </select>

      <input
        type="search"
        name="busca"
        defaultValue={atual.busca ?? ''}
        placeholder="Ticket ou contato"
        aria-label="Buscar ticket ou contato"
        className="btn"
      />

      <input type="hidden" name="aba" value={atual.aba ?? 'atribuido'} />
      <button type="submit" className="btn primary">
        Aplicar
      </button>
      <a href="/" className="btn">
        Limpar
      </a>
    </form>
  );
}
