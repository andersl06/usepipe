import { useState } from 'react';
import type { ConfigurationOfWelcome } from '@pipe/contracts';
import { BotaoBds, PageHeader, CampoBds, Interruptor, Role } from '../pecas';
import { salvarBoasVindas } from './gravar';

const TEXTO_BOTAO_MAX = 20;

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
 * o botão Começar", `referencias-blip/pesquisa/blip-portal-telas.md` §6) e do enunciado
 * da tarefa.
 *
 * Duas escritas, pela mesma razão de UX: DESLIGAR o interruptor grava na
 * hora (não há formulário para ele submeter, e apagar sem aviso o que já
 * estava escrito seria pior); LIGAR só revela o formulário — quem ativa
 * ainda precisa escrever a mensagem e o texto do botão e clicar Salvar.
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
