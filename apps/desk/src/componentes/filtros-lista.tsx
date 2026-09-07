'use client';

import { ORDENS } from '../lib/ordem';
import type { ChaveDeOrdem } from '../lib/ordem';

/**
 * Ordem da coluna e recorte por fila.
 *
 * Formulário GET para `/`, como a busca ao lado: o estado mora na URL, o botão
 * de voltar funciona e recarregar não perde o recorte. `'use client'` existe só
 * para submeter na troca — `<select>` em formulário GET sem script exige um
 * botão "Aplicar", e um botão para dois seletores é um clique a mais em cada
 * ajuste da fila.
 *
 * Os campos escondidos carregam a busca e a ficha: trocar a ordem não pode
 * apagar o que o atendente já filtrou. A conversa aberta NÃO viaja, do mesmo
 * jeito que não viaja ao clicar numa ficha — recortar a lista é pedir para ver
 * outra coisa, e a página reabre a primeira do novo recorte.
 */
export function FiltrosDaLista({
  ordem,
  fila,
  filas,
  busca,
  ficha,
}: {
  ordem: ChaveDeOrdem;
  fila: string;
  filas: string[];
  busca: string;
  ficha: string;
}) {
  function submeter(evento: { currentTarget: HTMLSelectElement }) {
    evento.currentTarget.form?.requestSubmit();
  }

  return (
    <form className="filtros-lista" action="/">
      {busca ? <input type="hidden" name="busca" value={busca} /> : null}
      <input type="hidden" name="filtro" value={ficha} />

      <select
        className="seletor"
        name="ordem"
        aria-label="Ordenar atendimentos"
        defaultValue={ordem}
        onChange={submeter}
      >
        {ORDENS.map((opcao) => (
          <option key={opcao.chave} value={opcao.chave}>
            {opcao.rotulo}
          </option>
        ))}
      </select>

      {/* O seletor de fila some quando não há fila nenhuma para escolher: um
          controle com uma opção só é decoração, e ocupa a mesma linha que a
          ordem precisa. */}
      {filas.length > 1 ? (
        <select
          className="seletor"
          name="fila"
          aria-label="Filtrar por fila"
          defaultValue={fila}
          onChange={submeter}
        >
          <option value="">Todas as filas</option>
          {filas.map((nome) => (
            <option key={nome} value={nome}>
              {nome}
            </option>
          ))}
        </select>
      ) : null}
    </form>
  );
}
