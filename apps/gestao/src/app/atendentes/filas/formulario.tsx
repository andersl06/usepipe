'use client';

import { useEffect, useRef } from 'react';
import { useActionState } from 'react';
import { Botao, Campo, Etiqueta, Seletor } from '@pipe/ui';
import { salvarFila } from '../acoes';
import { CORES_DE_FILA } from './cores';
import type { HorarioParaEscolher } from '../../../lib/cadastros';
import { envioQuePreserva } from '../../../componentes/envio-de-formulario';

/**
 * Cadastro de fila.
 *
 * O rótulo de campo é `.sub` — a legenda pequena que já existe —, e não uma
 * classe nova: `base.css` proíbe `.lbl` em nome de campo e o design system não
 * tem "campo de formulário com rótulo". Mesma escolha da tela de respostas
 * prontas.
 */
export function FormularioFila({ horarios }: { horarios: readonly HorarioParaEscolher[] }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [resultado, enviar, enviando] = useActionState(salvarFila, { ok: true });

  useEffect(() => {
    if (resultado.ok) formRef.current?.reset();
  }, [resultado]);

  return (
    <section className="card">
      <h3>Nova fila</h3>
      <p className="sub">
        A fila é o que a regra de distribuição recorta: um atendente só recebe conversa de fila em
        que está habilitado. Depois de criada, quem entra nela é definido em <b>Operação</b>.
      </p>

      <form ref={formRef} onSubmit={envioQuePreserva(enviar)} className="form-cadastro">
        <div className="form-linha">
          <label className="form-campo" style={{ flexBasis: '260px' }}>
            <span className="sub">Nome</span>
            <Campo name="nome" placeholder="Suporte" required disabled={enviando} />
          </label>

          <label className="form-campo">
            <span className="sub">Cor</span>
            <Seletor name="cor" defaultValue="" disabled={enviando}>
              <option value="">Sem cor</option>
              {CORES_DE_FILA.map((c) => (
                <option key={c.valor} value={c.valor}>
                  {c.rotulo}
                </option>
              ))}
            </Seletor>
          </label>
        </div>

        <div className="form-linha">
          <label className="form-campo">
            <span className="sub">Capacidade padrão</span>
            <Campo
              name="capacidadePadrao"
              type="number"
              min={1}
              max={200}
              defaultValue={5}
              required
              disabled={enviando}
            />
          </label>

          <label className="form-campo">
            <span className="sub">Ordem</span>
            <Campo
              name="ordem"
              type="number"
              min={0}
              max={999}
              defaultValue={0}
              disabled={enviando}
            />
          </label>

          <label className="form-campo" style={{ flexBasis: '260px' }}>
            <span className="sub">Horário de atendimento</span>
            <Seletor name="horarioId" defaultValue="" disabled={enviando}>
              <option value="">Sem horário — o relógio do SLA corre 24×7</option>
              {horarios.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.nome}
                </option>
              ))}
            </Seletor>
          </label>
        </div>

        {/*
          O campo mais fácil de preencher errado da tela inteira, e por isso o
          único com explicação inteira embaixo dele. Ver o cartão "O que a
          capacidade decide" na página.
        */}
        <p className="note">
          <b>Capacidade padrão</b> é quantas conversas simultâneas um atendente desta fila aguenta.
          A distribuição para de mandar conversa para quem já bateu esse número — ele fica na fila
          sem atendente até alguém encerrar uma. Vale para todo mundo da fila, menos para quem tem
          limite próprio definido em Operação.
        </p>

        <label className="form-caixa">
          <input type="checkbox" name="ativa" defaultChecked disabled={enviando} />
          <span className="sub">
            Ativa — fila desativada não recebe conversa nova, e a que já está nela continua.
          </span>
        </label>

        {resultado.erro ? <Etiqueta tom="erro">{resultado.erro}</Etiqueta> : null}

        <div className="cl-acoes">
          <Botao type="submit" variante="primario" disabled={enviando}>
            {enviando ? 'Salvando…' : 'Salvar fila'}
          </Botao>
        </div>
      </form>
    </section>
  );
}
