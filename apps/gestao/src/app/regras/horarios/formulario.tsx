'use client';

import { useEffect, useRef } from 'react';
import { useActionState } from 'react';
import { Botao, Campo, Etiqueta, Seletor } from '@pipe/ui';
import { salvarExcecao, salvarFaixa, salvarHorario } from '../acoes';
import { DIAS_DA_SEMANA } from '../../../lib/formato';
import type { HorarioParaEscolher } from '../../../lib/cadastros';

/**
 * Cadastro de horário, em três formulários.
 *
 * Um só formulário de "semana inteira" teria de reenviar as sete linhas a cada
 * correção — e como não há `update` nesta tela (a auditoria de configuração
 * ainda não existe), reenviar viraria horário duplicado. Então: cria-se o
 * horário, e depois acrescenta-se faixa e feriado um a um.
 *
 * Data e hora são `<input type="date">` e `<input type="time">` do navegador:
 * calendário, teclado e formato local vêm de graça, e nenhuma biblioteca entra
 * na tela por causa disso.
 */

function FormularioNovoHorario() {
  const formRef = useRef<HTMLFormElement>(null);
  const [resultado, enviar, enviando] = useActionState(salvarHorario, { ok: true });

  useEffect(() => {
    if (resultado.ok) formRef.current?.reset();
  }, [resultado]);

  return (
    <form ref={formRef} action={enviar} className="form-cadastro">
      <div className="form-linha">
        <label className="form-campo" style={{ flexBasis: '260px' }}>
          <span className="sub">Nome</span>
          <Campo name="nome" placeholder="Comercial" required disabled={enviando} />
        </label>

        <label className="form-campo" style={{ flexBasis: '240px' }}>
          <span className="sub">Fuso (IANA)</span>
          <Campo
            name="fuso"
            defaultValue="America/Sao_Paulo"
            placeholder="America/Sao_Paulo"
            required
            disabled={enviando}
          />
        </label>
      </div>

      <p className="note">
        O fuso é o do expediente, não o do servidor: é nele que “08:00” vira instante, e é ele que
        faz o horário de verão entrar e sair sozinho.
      </p>

      {resultado.erro ? <Etiqueta tom="erro">{resultado.erro}</Etiqueta> : null}

      <div className="cl-acoes">
        <Botao type="submit" variante="primario" disabled={enviando}>
          {enviando ? 'Salvando…' : 'Criar horário'}
        </Botao>
      </div>
    </form>
  );
}

function FormularioFaixa({ horarios }: { horarios: readonly HorarioParaEscolher[] }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [resultado, enviar, enviando] = useActionState(salvarFaixa, { ok: true });

  useEffect(() => {
    if (resultado.ok) formRef.current?.reset();
  }, [resultado]);

  return (
    <form ref={formRef} action={enviar} className="form-cadastro">
      <div className="form-linha">
        <label className="form-campo" style={{ flexBasis: '220px' }}>
          <span className="sub">Horário</span>
          <Seletor name="horarioId" required disabled={enviando}>
            {horarios.map((h) => (
              <option key={h.id} value={h.id}>
                {h.nome}
              </option>
            ))}
          </Seletor>
        </label>

        <label className="form-campo">
          <span className="sub">Dia da semana</span>
          <Seletor name="diaSemana" defaultValue="1" disabled={enviando}>
            {DIAS_DA_SEMANA.map((dia, indice) => (
              <option key={dia} value={indice}>
                {dia}
              </option>
            ))}
          </Seletor>
        </label>

        <label className="form-campo">
          <span className="sub">Abre</span>
          <Campo name="inicio" type="time" defaultValue="09:00" required disabled={enviando} />
        </label>

        <label className="form-campo">
          <span className="sub">Fecha</span>
          <Campo name="fim" type="time" defaultValue="18:00" required disabled={enviando} />
        </label>
      </div>

      <p className="note">
        Uma faixa por trecho contínuo. Expediente com intervalo de almoço são duas faixas no mesmo
        dia; expediente que atravessa a meia-noite são duas faixas, uma em cada dia.
      </p>

      {resultado.erro ? <Etiqueta tom="erro">{resultado.erro}</Etiqueta> : null}

      <div className="cl-acoes">
        <Botao type="submit" disabled={enviando}>
          {enviando ? 'Salvando…' : 'Acrescentar faixa'}
        </Botao>
      </div>
    </form>
  );
}

function FormularioExcecao({ horarios }: { horarios: readonly HorarioParaEscolher[] }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [resultado, enviar, enviando] = useActionState(salvarExcecao, { ok: true });

  useEffect(() => {
    if (resultado.ok) formRef.current?.reset();
  }, [resultado]);

  return (
    <form ref={formRef} action={enviar} className="form-cadastro">
      <div className="form-linha">
        <label className="form-campo" style={{ flexBasis: '220px' }}>
          <span className="sub">Horário</span>
          <Seletor name="horarioId" required disabled={enviando}>
            {horarios.map((h) => (
              <option key={h.id} value={h.id}>
                {h.nome}
              </option>
            ))}
          </Seletor>
        </label>

        <label className="form-campo">
          <span className="sub">Data</span>
          <Campo name="data" type="date" required disabled={enviando} />
        </label>

        <label className="form-campo">
          <span className="sub">Abre (só se não for fechado)</span>
          <Campo name="inicio" type="time" disabled={enviando} />
        </label>

        <label className="form-campo">
          <span className="sub">Fecha</span>
          <Campo name="fim" type="time" disabled={enviando} />
        </label>

        <label className="form-campo" style={{ flexBasis: '240px' }}>
          <span className="sub">Motivo</span>
          <Campo name="motivo" placeholder="Feriado nacional" disabled={enviando} />
        </label>
      </div>

      <label className="form-caixa">
        <input type="checkbox" name="fechado" defaultChecked disabled={enviando} />
        <span className="sub">
          Fechado o dia inteiro. Desmarque para abrir em horário especial — e aí os dois campos de
          hora são obrigatórios, porque exceção aberta sem horário próprio cai no expediente normal
          e não muda nada.
        </span>
      </label>

      {resultado.erro ? <Etiqueta tom="erro">{resultado.erro}</Etiqueta> : null}

      <div className="cl-acoes">
        <Botao type="submit" disabled={enviando}>
          {enviando ? 'Salvando…' : 'Acrescentar exceção'}
        </Botao>
      </div>
    </form>
  );
}

export function FormulariosDeHorario({ horarios }: { horarios: readonly HorarioParaEscolher[] }) {
  return (
    <>
      <section className="card">
        <h3>Novo horário</h3>
        <p className="sub">
          O horário nasce vazio — sem faixa nenhuma ele é expediente fechado, e o SLA de quem o usa
          nunca começa a correr. Crie e acrescente as faixas logo abaixo.
        </p>
        <FormularioNovoHorario />
      </section>

      {horarios.length > 0 ? (
        <>
          <section className="card">
            <h3>Faixa de um dia da semana</h3>
            <FormularioFaixa horarios={horarios} />
          </section>

          <section className="card">
            <h3>Exceção por data</h3>
            <p className="sub">
              Feriado, emenda, recesso. A exceção manda sobre a faixa da semana naquele dia.
            </p>
            <FormularioExcecao horarios={horarios} />
          </section>
        </>
      ) : null}
    </>
  );
}
