import { useState } from 'react';
import type { ConfigurationOfWelcome } from '@pipe/contracts';
import { BotaoBds, PageHeader, CampoBds, Interruptor, Role } from '../pecas';
import { salvarBoasVindas } from './gravar';

const TEXTO_BOTAO_MAX = 20;

/**
 * `/configurations/welcome` (LEIA.md, Round 2, capture 5): the real state observed on the router is the switch **Off** — in that state the source draws NOTHING besides the title and the switch (not even the form's label exists in the DOM). That's the behavior the screen reproduces: the form (Mensagem de saudação + "Começar" button text) only appears once someone turns the switch on.
 *
 * The two inner fields weren't seen turned on in the capture (the ruler didn't activate the production router, to avoid changing its state) — the names come from the menu item's own description ("Defina a Mensagem de Saudação e o botão Começar", `referencias-blip/pesquisa/blip-portal-telas.md` §6) and from the task's statement.
 *
 * Two writes, for the same UX reason: turning the switch OFF saves immediately (there's no form for it to submit, and silently erasing what was already written would be worse); turning it ON only reveals the form — whoever enables it still needs to write the message and button text and click Save.
 */
export function TelaDeBoasVindas({ id, inicial }: { id: string; inicial: ConfigurationOfWelcome }) {
  const [ativo, setAtivo] = useState(inicial.ativo);
  const [message, setMessage] = useState(inicial.message);
  const [textoDoBotao, setTextoDoBotao] = useState(inicial.textoBotao);
  const [aviso, setAviso] = useState('');
  const [sucesso, setSucesso] = useState('');
  const [salvando, setSalvando] = useState(false);

  async function desligar() {
    setAtivo(false);
    setAviso('');
    setSucesso('');
    const resultado = await salvarBoasVindas(id, { ativo: false });
    if (!resultado.ok) {
      setAtivo(true);
      setAviso(resultado.error);
    }
  }

  async function salvar() {
    setAviso('');
    setSucesso('');
    setSalvando(true);
    const resultado = await salvarBoasVindas(id, { ativo: true, message, textoBotao: textoDoBotao });
    setSalvando(false);
    if (!resultado.ok) {
      setAviso(resultado.error);
      return;
    }
    setMessage(resultado.value.message);
    setTextoDoBotao(resultado.value.textoBotao);
    setSucesso('Configuração salva com sucesso.');
  }

  return (
    <>
      <PageHeader
        titulo={<h1>Tela de Boas-vindas</h1>}
        description={<p>Defina a Mensagem de Saudação e o botão Começar</p>}
        actions={
          <Interruptor
            ligado={ativo}
            aoMudar={(novo) => {
              if (novo) setAtivo(true);
              else void desligar();
            }}
            rotulo={ativo ? 'Ativado' : 'Desativado'}
          />
        }
      />
      {ativo ? (
        <div className="cf-container">
          <Role className="cf-papel--conexao">
            <form
              onSubmit={(evento) => {
                evento.preventDefault();
                if (salvando) return;
                void salvar();
              }}
            >
              <CampoBds
                id="welcomeMessage"
                rotulo="Mensagem de saudação"
                placeholder="Escreva a mensagem que seu contato vê ao começar a conversa"
                value={message}
                aoMudar={setMessage}
                linhas={4}
                obrigatorio
              />
              <div className="cf-mt4">
                <CampoBds
                  id="welcomeButtonText"
                  rotulo="Texto do botão"
                  value={textoDoBotao}
                  aoMudar={setTextoDoBotao}
                  maxLength={TEXTO_BOTAO_MAX}
                  obrigatorio
                />
              </div>
              {aviso ? (
                <p className="cf-aviso" role="alert">
                  {aviso}
                </p>
              ) : null}
              {sucesso ? (
                <p className="cf-basicas-sucesso" role="status">
                  {sucesso}
                </p>
              ) : null}
              <div className="cf-form-http-rodape">
                <BotaoBds variante="bot" type="submit" disabled={salvando}>
                  Salvar
                </BotaoBds>
              </div>
            </form>
          </Role>
        </div>
      ) : (
        aviso ? (
          <div className="cf-container">
            <p className="cf-aviso" role="alert">
              {aviso}
            </p>
          </div>
        ) : null
      )}
    </>
  );
}
