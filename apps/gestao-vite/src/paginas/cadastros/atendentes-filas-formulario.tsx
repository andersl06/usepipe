import { useEffect, useRef, useState } from 'react';
import { useActionState } from 'react';
import { Botao, Campo, Etiqueta } from '@pipe/ui';
import { salvarFila } from '../../lib/acoes';
import { envioQuePreserva } from '../../componentes/envio-de-formulario';

/**
 * O modal "Criar nova fila" — a FORMA é a da origem, e ela é mínima
 * (`referencias-blip/fichas/FICHA-atendentes-filas-pausas.md` §a.2, extraída do
 * `bds-modal` que `queue-management.html` traz no DOM com `open="false"`):
 *
 *   título  "Criar nova fila"
 *   texto   "Dê um nome para essa fila de atendimento"
 *   campo   placeholder "Nome da fila"
 *   ajuda   "Use apenas letras, números, hifens (-) e sublinhados (_)"
 *   botões  "Cancelar"  "Salvar"  (o segundo desabilitado até haver nome)
 *
 * **Um campo só, e os outros quatro foram para a página de edição.** Este
 * formulário tinha cor, capacidade padrão, ordem, horário e "ativa" na mesma
 * caixa — cinco campos que a origem não pede aqui. Eles não sumiram: moram em
 * "Dados da fila", na página `atendentes/filas/:id/editar`, que é onde a
 * origem também põe o que é configuração da fila. O que continua indo junto na
 * criação são os PADRÕES (capacidade 5, ordem 0, ativa), em campo escondido,
 * porque `criarFila` cobra `capacidadePadrao` entre 1 e 200 e uma fila nasce
 * ligada.
 *
 * A ajuda sobre caracteres é literal da origem. Nós não recusamos nome com
 * acento (`nomeDeFilaConferido` só exige não-vazio), então ela é orientação e
 * não promessa de validação — está dita assim de propósito.
 */
export function FormularioFila({
  aoSalvar,
}: {
  /** Fecha o modal quando o salvamento dá certo. */
  aoSalvar?: () => void;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  /* Controlado só para o "Salvar" nascer desabilitado, como o `save-button`
     da origem — não para guardar o valor, que o `FormData` já leva. */
  const [nome, setNome] = useState('');
  const [resultado, enviar, enviando] = useActionState(salvarFila, { ok: true });
  /* Ver o comentário equivalente em `regras-atendimento-formulario.tsx`: o
     valor inicial do `useActionState` não é uma confirmação de envio. */
  const estadoInicial = useRef(resultado);

  useEffect(() => {
    if (resultado === estadoInicial.current) return;
    if (resultado.ok) {
      formRef.current?.reset();
      setNome('');
      aoSalvar?.();
    }
  }, [resultado]);

  return (
    <form ref={formRef} onSubmit={envioQuePreserva(enviar)} className="form-cadastro">
      <p className="sub">Dê um nome para essa fila de atendimento</p>

      <label className="form-campo">
        <Campo
          name="nome"
          placeholder="Nome da fila"
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          required
          disabled={enviando}
        />
      </label>
      <p className="note">Use apenas letras, números, hifens (-) e sublinhados (_)</p>

      {/* Os padrões da fila nova. Editáveis em "Dados da fila", na página de
          edição — aqui só existem porque `criarFila` cobra a capacidade. */}
      <input type="hidden" name="capacidadePadrao" value={5} />
      <input type="hidden" name="ordem" value={0} />
      <input type="hidden" name="ativa" value="on" />

      {resultado.erro ? <Etiqueta tom="erro">{resultado.erro}</Etiqueta> : null}

      <div className="cl-acoes">
        <Botao type="button" onClick={aoSalvar} disabled={enviando}>
          Cancelar
        </Botao>
        <Botao type="submit" variante="primario" disabled={enviando || nome.trim() === ''}>
          {enviando ? 'Salvando…' : 'Salvar'}
        </Botao>
      </div>
    </form>
  );
}
