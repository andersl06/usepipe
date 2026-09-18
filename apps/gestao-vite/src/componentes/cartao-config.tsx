import { useActionState, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { Botao, Etiqueta } from '@pipe/ui';
import { envioQuePreserva } from './envio-de-formulario';

/**
 * O cartão de configuração — `blip-telas-cadastro.md` §3.
 *
 * Título 20/700, explicação 14/400 logo abaixo, interruptor da seção à direita
 * na altura do título, e o conteúdo embaixo. O **Salvar é do cartão**, no canto
 * inferior direito: a tela de Configurações gerais deles não tem botão Salvar
 * geral, e cada cartão nasce com o seu desabilitado.
 *
 * "Cartão sem alteração não oferece ação" é a régua da casa aplicada ao botão —
 * a mesma que proíbe item de menu desabilitado. Aqui o botão desabilitado é
 * INFORMAÇÃO: ele diz "não há nada para salvar", que é diferente de "você não
 * pode salvar". Por isso ele existe apagado em vez de sumir: um botão que
 * aparece e desaparece faz o rodapé do cartão pular a cada tecla.
 *
 * A sujeira é rastreada no `onChange` do formulário inteiro, e não campo a
 * campo. É um `onChange` contra N estados controlados, e o React já borbulha
 * o evento de qualquer campo até o `<form>`.
 */

export interface ResultadoDeCartao {
  ok: boolean;
  erro?: string;
}

export interface InterruptorDaSecao {
  /** Nome do campo enviado. Só vai no `FormData` quando ligado, como caixa de marcar. */
  name: string;
  rotulo: string;
  ligado: boolean;
}

export function CartaoConfig({
  titulo,
  explicacao,
  acao,
  interruptor,
  children,
  rodape,
}: {
  titulo: string;
  explicacao: ReactNode;
  acao: (anterior: ResultadoDeCartao, dados: FormData) => Promise<ResultadoDeCartao>;
  interruptor?: InterruptorDaSecao;
  children: ReactNode;
  /** Texto à esquerda do Salvar: o que este cartão decide, em uma linha. */
  rodape?: ReactNode;
}) {
  const [resultado, enviar, enviando] = useActionState(acao, { ok: true });
  const [sujo, setSujo] = useState(false);
  const [ligado, setLigado] = useState(interruptor?.ligado ?? true);

  useEffect(() => {
    if (resultado.ok) setSujo(false);
  }, [resultado]);

  const idTitulo = `cfg-${titulo.replace(/\W+/g, '-').toLowerCase()}`;

  return (
    <form
      className="cartao-config"
      data-ligado={interruptor ? String(ligado) : undefined}
      onChange={() => setSujo(true)}
      onSubmit={envioQuePreserva(enviar)}
      aria-labelledby={idTitulo}
    >
      <header>
        <div>
          <h3 id={idTitulo}>{titulo}</h3>
          <p>{explicacao}</p>
        </div>

        {interruptor ? (
          <>
            <button
              type="button"
              className="interruptor"
              role="switch"
              aria-checked={ligado}
              aria-label={interruptor.rotulo}
              title={interruptor.rotulo}
              disabled={enviando}
              onClick={() => {
                setLigado((v) => !v);
                setSujo(true);
              }}
            >
              <span className="interruptor-bolinha" />
            </button>
            {/* O `FormData` não enxerga estado do React: o valor precisa estar
                num campo de verdade. Marcado quando ligado, ausente quando
                desligado — a ação lê `dados.get(name) !== null`. */}
            {ligado ? <input type="hidden" name={interruptor.name} value="1" /> : null}
          </>
        ) : null}
      </header>

      <div className="cartao-config-corpo">{children}</div>

      {resultado.erro ? <Etiqueta tom="erro">{resultado.erro}</Etiqueta> : null}

      <footer>
        {rodape ? <span className="sub">{rodape}</span> : null}
        <Botao type="submit" variante="primario" disabled={!sujo || enviando}>
          {enviando ? 'Salvando…' : 'Salvar'}
        </Botao>
      </footer>
    </form>
  );
}
