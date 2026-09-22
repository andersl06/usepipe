import { useEffect, useRef } from 'react';
import { useActionState } from 'react';
import { Botao, Campo, Etiqueta } from '@pipe/ui';
import { salvarMotivoPausa } from '../../lib/acoes';
import { envioQuePreserva } from '../../componentes/envio-de-formulario';

/**
 * Conteúdo do modal "Criar nova pausa personalizada" — a forma é a literal da
 * origem (`FICHA-atendentes-filas-pausas.md` §a.5/§c): campo **"Nome da
 * pausa"** (`maxlength="30"`), campo **"Duração em minutos"** (`type="number"
 * max="999" maxlength="3"`, valor inicial `0`), botões **"Cancelar"** e
 * **"Criar"**. Sem descrição — a origem abre o modal direto no formulário.
 *
 * **"Conta como produtivo" é campo só nosso**, sem par na origem: decide se o
 * tempo desta pausa entra no relatório de esforço como trabalho (treinamento,
 * reunião) ou como tempo fora (almoço, café). Sem ele o relatório não sabe
 * separar as duas coisas — por isso fica, compacto, abaixo dos dois campos
 * literais, e não no lugar de nenhum deles.
 */
export function FormularioMotivoPausa({ aoSalvar }: { aoSalvar?: () => void }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [resultado, enviar, enviando] = useActionState(salvarMotivoPausa, { ok: true });
  /* Ver o comentário equivalente em `regras-atendimento-formulario.tsx`. */
  const estadoInicial = useRef(resultado);

  useEffect(() => {
    if (resultado === estadoInicial.current) return;
    if (resultado.ok) {
      formRef.current?.reset();
      aoSalvar?.();
    }
  }, [resultado]);

  return (
    <form ref={formRef} onSubmit={envioQuePreserva(enviar)} className="form-cadastro">
      <label className="form-campo">
        <span className="sub">Nome da pausa</span>
        <Campo name="nome" maxLength={30} required disabled={enviando} />
      </label>

      <label className="form-campo">
        <span className="sub">Duração em minutos</span>
        <Campo
          name="duracaoSugeridaMin"
          type="number"
          min={0}
          max={999}
          maxLength={3}
          defaultValue={0}
          disabled={enviando}
        />
      </label>

      <label className="form-caixa">
        <input type="checkbox" name="contaComoProdutivo" disabled={enviando} />
        <span className="sub">
          <b>Conta como produtivo</b> — o tempo desta pausa é tempo de trabalho, não tempo fora.
        </span>
      </label>

      <input type="hidden" name="ativo" value="on" />

      {resultado.erro ? <Etiqueta tom="erro">{resultado.erro}</Etiqueta> : null}

      <div className="cl-acoes">
        <Botao type="button" onClick={aoSalvar} disabled={enviando}>
          Cancelar
        </Botao>
        <Botao type="submit" variante="primario" disabled={enviando}>
          {enviando ? 'Criando…' : 'Criar'}
        </Botao>
      </div>
    </form>
  );
}
