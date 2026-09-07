'use client';

import { useEffect, useRef } from 'react';
import { useActionState } from 'react';
import { Botao, Campo, Etiqueta } from '@pipe/ui';
import { salvarMotivoPausa } from '../acoes';
import { envioQuePreserva } from '../../../componentes/envio-de-formulario';

/**
 * Cadastro de motivo de pausa.
 *
 * `contaComoProdutivo` fica com a explicação inteira ao lado da caixa, e não
 * com um rótulo de duas palavras: quem cadastra "Almoço" não tem como
 * adivinhar que a caixa marcada tira o almoço do tempo ocioso do relatório de
 * esforço. Rótulo curto aqui produziria dado errado com a melhor das intenções.
 */
export function FormularioMotivoPausa() {
  const formRef = useRef<HTMLFormElement>(null);
  const [resultado, enviar, enviando] = useActionState(salvarMotivoPausa, { ok: true });

  useEffect(() => {
    if (resultado.ok) formRef.current?.reset();
  }, [resultado]);

  return (
    <section className="card">
      <h3>Novo motivo de pausa</h3>
      <p className="sub">
        É o que o atendente escolhe ao sair do <b>online</b> no Desk. O motivo fica gravado na
        pausa, então mudar de ideia depois não reescreve o passado — só vale para as pausas
        seguintes.
      </p>

      <form ref={formRef} onSubmit={envioQuePreserva(enviar)} className="form-cadastro">
        <div className="form-linha">
          <label className="form-campo" style={{ flexBasis: '260px' }}>
            <span className="sub">Nome</span>
            <Campo name="nome" placeholder="Almoço" required disabled={enviando} />
          </label>

          <label className="form-campo">
            <span className="sub">Duração sugerida (minutos)</span>
            <Campo
              name="duracaoSugeridaMin"
              type="number"
              min={1}
              max={480}
              placeholder="60"
              disabled={enviando}
            />
          </label>
        </div>

        <p className="note">
          A duração sugerida não corta a pausa: ela é a referência contra a qual a lista abaixo
          compara a duração real. Deixe em branco quando não houver um tempo esperado.
        </p>

        <label className="form-caixa">
          <input type="checkbox" name="contaComoProdutivo" disabled={enviando} />
          <span className="sub">
            <b>Conta como produtivo</b> — o tempo desta pausa é tempo de trabalho, não tempo fora.
            Marque para treinamento, reunião e feedback; deixe desmarcado para almoço, café e
            banheiro. É a única decisão desta tela que muda relatório, e não dá para descobrir isso
            pelo nome do campo: ela separa a pausa que entra no tempo trabalhado do atendente da que
            fica de fora.
          </span>
        </label>

        <label className="form-caixa">
          <input type="checkbox" name="ativo" defaultChecked disabled={enviando} />
          <span className="sub">
            Ativo — motivo desativado some da lista do Desk, e as pausas antigas continuam contadas
            por ele.
          </span>
        </label>

        {resultado.erro ? <Etiqueta tom="erro">{resultado.erro}</Etiqueta> : null}

        <div className="cl-acoes">
          <Botao type="submit" variante="primario" disabled={enviando}>
            {enviando ? 'Salvando…' : 'Salvar motivo'}
          </Botao>
        </div>
      </form>
    </section>
  );
}
