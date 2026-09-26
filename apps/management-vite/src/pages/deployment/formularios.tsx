import { useActionState, useEffect, useRef } from 'react';
import { Botao, Campo, Etiqueta, Seletor } from '@pipe/ui';
import { envioQuePreserva } from '../../components/envio-de-formulario';
import { conectarManual, convidar, importContacts } from './actions';
import type { ResultadoDaAcao } from './actions';

/**
 * The three onboarding wizard forms. Same shape as Gestão's forms: label in `.sub`, fields in `.form-linha`, the button in `.cl-acoes`, and submission that doesn't erase what was typed when the server refuses.
 */

const INICIAL: ResultadoDaAcao = { ok: true };

function Resultado({ resultado }: { resultado: ResultadoDaAcao }) {
  if (resultado.error) return <Etiqueta tom="erro">{resultado.error}</Etiqueta>;
  if (resultado.message) return <Etiqueta tom="sucesso">{resultado.message}</Etiqueta>;
  return null;
}

/** Reuses the invite that already exists (`POST /v1/convites`). */
export function FormularioInvitation() {
  const formulario = useRef<HTMLFormElement>(null);
  const [resultado, enviar, enviando] = useActionState(convidar, INICIAL);

  useEffect(() => {
    if (resultado.ok && resultado.link) formulario.current?.reset();
  }, [resultado]);

  return (
    <form ref={formulario} onSubmit={envioQuePreserva(enviar)} className="form-registration">
      <div className="form-linha">
        <label className="form-campo" style={{ flexBasis: '280px' }}>
          <span className="sub">E-mail</span>
          <Campo
            name="email"
            type="email"
            placeholder="ana@empresa.com.br"
            required
            disabled={enviando}
          />
        </label>
        <label className="form-campo">
          <span className="sub">Papel</span>
          <Seletor name="papel" defaultValue="atendente" disabled={enviando}>
            <option value="atendente">Atendente</option>
            <option value="supervisor">Supervisor</option>
            <option value="avaliador">Avaliador</option>
            <option value="gestor">Gestor</option>
            <option value="administrador">Administrador</option>
          </Seletor>
        </label>
      </div>

      {resultado.link ? (
        <label className="form-campo">
          <span className="sub">
            Envie este link à pessoa. Vale sete dias e uma vez só; convidar de novo invalida o
            anterior.
          </span>
          <Campo readOnly value={resultado.link} onFocus={(e) => e.currentTarget.select()} />
        </label>
      ) : null}

      <div className="cl-actions">
        <Resultado resultado={resultado} />
        <Botao type="submit" variante="primario" disabled={enviando}>
          {enviando ? 'Convidando…' : 'Convidar'}
        </Botao>
      </div>
    </form>
  );
}

export function FormularioImport() {
  const formulario = useRef<HTMLFormElement>(null);
  const [resultado, enviar, enviando] = useActionState(importContacts, INICIAL);

  useEffect(() => {
    if (resultado.ok && resultado.message) formulario.current?.reset();
  }, [resultado]);

  return (
    <form ref={formulario} onSubmit={envioQuePreserva(enviar)} className="form-registration">
      <label className="form-campo" style={{ flexBasis: '320px' }}>
        <span className="sub">Arquivo CSV (vírgula ou ponto e vírgula, até 20 MB)</span>
        <Campo name="arquivo" type="file" accept=".csv,text/csv" required disabled={enviando} />
      </label>
      <div className="cl-actions">
        <Resultado resultado={resultado} />
        <Botao type="submit" variante="primario" disabled={enviando}>
          {enviando ? 'Enviando…' : 'Importar contatos'}
        </Botao>
      </div>
    </form>
  );
}

/** Manual setup (`manual_setup_service.rb`), for whoever doesn't go through embedded signup. */
export function FormularioManual() {
  const formulario = useRef<HTMLFormElement>(null);
  const [resultado, enviar, enviando] = useActionState(conectarManual, INICIAL);

  useEffect(() => {
    if (resultado.ok && resultado.message) formulario.current?.reset();
  }, [resultado]);

  return (
    <details className="g-grupo">
      <summary className="sub">
        Conectar sem o cadastro embutido, com token de usuário de sistema
      </summary>
      <form ref={formulario} onSubmit={envioQuePreserva(enviar)} className="form-registration">
        <div className="form-linha">
          <label className="form-campo">
            <span className="sub">WABA ID</span>
            <Campo name="wabaId" required disabled={enviando} />
          </label>
          <label className="form-campo">
            <span className="sub">Phone Number ID</span>
            <Campo name="numeroId" required disabled={enviando} />
          </label>
          <label className="form-campo">
            <span className="sub">Nome do canal (opcional)</span>
            <Campo name="nome" disabled={enviando} />
          </label>
        </div>
        <label className="form-campo">
          <span className="sub">
            Token de usuário de sistema, com whatsapp_business_messaging e
            whatsapp_business_management
          </span>
          <Campo name="token" type="password" autoComplete="off" required disabled={enviando} />
        </label>
        <p className="note">
          Antes de gravar, o Pipe confere que o número é da WABA, está verificado, não está em outro
          canal e que o token lê os modelos e envia mensagem. O token é guardado cifrado.
        </p>
        <div className="cl-actions">
          <Resultado resultado={resultado} />
          <Botao type="submit" disabled={enviando}>
            {enviando ? 'Conferindo…' : 'Conectar'}
          </Botao>
        </div>
      </form>
    </details>
  );
}
