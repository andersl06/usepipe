import { useState } from 'react';
import { BotaoBds, CabecalhoDaPagina, CampoBds, Interruptor, Papel } from '../pecas';

/**
 * `/configurations/welcome` (LEIA.md, Rodada 2, captura 5): o estado real
 * observado no roteador é o interruptor **Desligado** — nesse estado a
 * origem não desenha NADA além do título e do switch (nem o rótulo do
 * formulário chega a existir no DOM). É esse comportamento que a tela
 * reproduz: o formulário (Mensagem de saudação + texto do botão "Começar")
 * só nasce quando alguém liga o interruptor.
 *
 * Os dois campos internos não foram vistos ligados na captura (a régua não
 * ativou o roteador de produção para não alterar o estado dele) — os nomes
 * vêm da descrição do próprio item de menu ("Defina a Mensagem de Saudação e
 * o botão Começar", `docs/pesquisa/blip-portal-telas.md` §6) e do enunciado
 * da tarefa. ponytail: `activateWelcomeMessage`/`saveWelcomeMessage` não
 * existem na `api` — "Salvar" devolve o erro controlado, como em `api/tela.tsx`.
 */
export function TelaDeBoasVindas() {
  const [ativo, setAtivo] = useState(false);
  const [mensagem, setMensagem] = useState('');
  const [textoDoBotao, setTextoDoBotao] = useState('Começar');
  const [aviso, setAviso] = useState('');

  return (
    <>
      <CabecalhoDaPagina
        titulo={<h1>Tela de Boas-vindas</h1>}
        descricao={<p>Defina a Mensagem de Saudação e o botão Começar</p>}
        acoes={
          <Interruptor
            ligado={ativo}
            aoMudar={setAtivo}
            rotulo={ativo ? 'Ativado' : 'Desativado'}
          />
        }
      />
      {ativo ? (
        <div className="cf-container">
          <Papel className="cf-papel--conexao">
            <form
              onSubmit={(evento) => {
                evento.preventDefault();
                setAviso('A tela de boas-vindas ainda não está disponível.');
              }}
            >
              <CampoBds
                id="welcomeMessage"
                rotulo="Mensagem de saudação"
                placeholder="Escreva a mensagem que seu contato vê ao começar a conversa"
                valor={mensagem}
                aoMudar={setMensagem}
                linhas={4}
                obrigatorio
              />
              <div className="cf-mt4">
                <CampoBds
                  id="welcomeButtonText"
                  rotulo="Texto do botão"
                  valor={textoDoBotao}
                  aoMudar={setTextoDoBotao}
                  maxLength={20}
                  obrigatorio
                />
              </div>
              {aviso ? (
                <p className="cf-aviso" role="alert">
                  {aviso}
                </p>
              ) : null}
              <div className="cf-form-http-rodape">
                <BotaoBds variante="bot" type="submit">
                  Salvar
                </BotaoBds>
              </div>
            </form>
          </Papel>
        </div>
      ) : null}
    </>
  );
}
