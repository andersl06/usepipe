import { useEffect, useRef } from 'react';
import { useActionState } from 'react';
import { Botao, Campo, Etiqueta } from '@pipe/ui';
import { salvarRespostaPronta } from '../../lib/acoes';
import { envioQuePreserva } from '../../componentes/envio-de-formulario';

/**
 * Cadastro de resposta pronta — só `escopo = 'empresa'` (ver comentário de
 * `lib/comunicacao.ts`). A pessoal o próprio atendente cria no Desk.
 *
 * Nenhuma classe de "campo de formulário com rótulo" existe hoje no design
 * system compartilhado — só `.cl-campo` (rótulo acima de VALOR DE LEITURA, do
 * cartão de lista) e `.lbl`, que o comentário de `base.css` proíbe usar em
 * nome de campo. Por isso o rótulo aqui é `.sub` (legenda pequena, já
 * existente) em vez de uma classe nova.
 */
export function FormularioRespostaPronta({ aoSalvar }: { aoSalvar?: () => void }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [resultado, enviar, enviando] = useActionState(salvarRespostaPronta, { ok: true });
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
    <>
      <p className="sub">
        O atalho é o que o atendente digita depois do <b>#</b> no compositor do Desk (ver §5 de{' '}
        <code>2026-09-05-desk-requisitos.md</code>). A tabela não tem índice único de atalho por
        tenant — só um índice de busca —, então o conflito é checado aqui, ao salvar.
      </p>

      <form
        ref={formRef}
        onSubmit={envioQuePreserva(enviar)}
        style={{ display: 'flex', flexDirection: 'column', gap: 'var(--p-e-3)' }}
      >
        <label style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <span className="sub">Atalho (sem espaço, sem o #)</span>
          <Campo name="atalho" placeholder="saudacao-inicial" required disabled={enviando} />
        </label>

        <label style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <span className="sub">Título</span>
          <Campo name="titulo" placeholder="Saudação inicial" required disabled={enviando} />
        </label>

        <label style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <span className="sub">Fila ou canal a que pertence (opcional)</span>
          <Campo
            name="categoria"
            placeholder="Ex.: Suporte, Financeiro, WhatsApp"
            disabled={enviando}
          />
        </label>

        <label style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <span className="sub">Corpo</span>
          <textarea
            name="corpo"
            className="campo"
            rows={4}
            placeholder="Suporta contato.nome, contato.email, atendente.nome…"
            required
            disabled={enviando}
          />
        </label>

        {resultado.erro ? <Etiqueta tom="erro">{resultado.erro}</Etiqueta> : null}

        <div className="cl-acoes">
          <Botao type="submit" variante="primario" disabled={enviando}>
            {enviando ? 'Salvando…' : 'Salvar resposta pronta'}
          </Botao>
        </div>
      </form>
    </>
  );
}
