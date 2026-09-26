import { useEffect, useRef } from 'react';
import { useActionState } from 'react';
import { Botao, Campo, Etiqueta } from '@pipe/ui';
import { salvarMotivoPausa } from '../../lib/actions';
import { envioQuePreserva } from '../../components/envio-de-formulario';

/**
 * Content of the "Criar nova pausa personalizada" modal — the form is literally the source's (`FICHA-atendentes-filas-pausas.md` §a.5/§c): **"Nome da pausa"** field (`maxlength="30"`), **"Duração em minutos"** field (`type="number" max="999" maxlength="3"`, initial value `0`), **"Cancelar"** and **"Criar"** buttons. No description — the source opens the modal straight into the form.
 *
 * **"Conta como produtivo" is a field that's ours alone**, with no counterpart in the source: it decides whether this break's time counts toward the effort report as work (training, meetings) or as time off (lunch, coffee). Without it the report can't tell the two apart — so it stays, compact, below the two literal fields, and not in place of either.
 */
export function FormularioMotivoPausa({ aoSalvar }: { aoSalvar?: () => void }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [resultado, enviar, enviando] = useActionState(salvarMotivoPausa, { ok: true });
  /* Ver o comentário equivalente em `regras-atendimento-formulario.tsx`. */
  const stateInitial = useRef(resultado);

  useEffect(() => {
    if (resultado === stateInitial.current) return;
    if (resultado.ok) {
      formRef.current?.reset();
      aoSalvar?.();
    }
  }, [resultado]);

  return (
    <form ref={formRef} onSubmit={envioQuePreserva(enviar)} className="form-registration">
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

      {resultado.error ? <Etiqueta tom="erro">{resultado.error}</Etiqueta> : null}

      <div className="cl-actions">
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
