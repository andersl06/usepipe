import { useState } from 'react';
import { BotaoBds, BotaoDeIcone, CabecalhoDaPagina, CampoBds, Papel } from '../pecas';

/** `Você poderá adicionar até 3 itens que disparam um comando.` (LEIA.md, Rodada 2, captura 6). */
const MAXIMO_DE_ITENS = 3;

interface ItemDoMenu {
  texto: string;
  link: string;
  aberto: boolean;
}

function itemVazio(): ItemDoMenu {
  return { texto: '', link: '', aberto: false };
}

/**
 * `/configurations/persistentMenu` (LEIA.md, Rodada 2, captura 6): 3 linhas em
 * acordeão (ícone "+" fechado), cada uma com **Texto** e **Link**; o Salvar
 * chega `disabled` na origem porque este roteador não está conectado ao
 * Messenger — é essa condição real que `canalCompativel` verifica, não um
 * estado inventado.
 *
 * O segundo bloqueio da origem ("Antes de salvar... preencher a tela de
 * boas-vindas") não tem como ser reproduzido de verdade: a Tela de
 * Boas-vindas desta régua não grava nada na `api` (`../boasvindas/tela.tsx`),
 * então não existe um "preenchido" para consultar — fica só o aviso de texto,
 * como a origem também mostra.
 */
export function TelaDeMenuPersistente({ canalCompativel }: { canalCompativel: boolean }) {
  const [itens, setItens] = useState<ItemDoMenu[]>(() =>
    Array.from({ length: MAXIMO_DE_ITENS }, itemVazio),
  );
  const [aviso, setAviso] = useState('');

  function mudarCampo(indice: number, campo: 'texto' | 'link', valor: string) {
    setItens((atual) => atual.map((item, i) => (i === indice ? { ...item, [campo]: valor } : item)));
  }

  function alternarAberto(indice: number) {
    setItens((atual) =>
      atual.map((item, i) => (i === indice ? { ...item, aberto: !item.aberto } : item)),
    );
  }

  return (
    <>
      <CabecalhoDaPagina
        titulo={<h1>Menu Persistente</h1>}
        acoes={
          <BotaoBds
            variante="bot"
            disabled={!canalCompativel}
            onClick={() => setAviso('O menu persistente ainda não está disponível.')}
          >
            Salvar
          </BotaoBds>
        }
      />
      <div className="cf-container cf-menu-persistente">
        {!canalCompativel ? (
          <p className="cf-faixa-alerta" role="status">
            Só é possível ativar o menu persistente se o seu chatbot estiver conectado ao Facebook
            Messenger
          </p>
        ) : null}

        <p>
          O menu persistente estará sempre disponível para o seu cliente. Ele deve conter comandos
          que poderão ser utilizadas em qualquer momento do fluxo. Você poderá adicionar até{' '}
          {MAXIMO_DE_ITENS} itens que disparam um comando.
        </p>
        <p className="cf-menu-aviso-boasvindas">
          Antes de salvar o menu persistente, você precisa preencher a tela de boas-vindas no menu
          lateral.
        </p>

        {itens.map((item, indice) => (
          <Papel key={indice} className="cf-menu-item">
            <div className="cf-menu-item-topo">
              <span>Item {indice + 1}</span>
              <BotaoDeIcone
                icone="mais"
                rotulo={item.aberto ? `Recolher item ${indice + 1}` : `Adicionar item ${indice + 1}`}
                aria-expanded={item.aberto}
                onClick={() => alternarAberto(indice)}
              />
            </div>
            {item.aberto ? (
              <div className="cf-menu-item-corpo">
                <CampoBds
                  rotulo="Texto"
                  valor={item.texto}
                  aoMudar={(valor) => mudarCampo(indice, 'texto', valor)}
                />
                <div className="cf-mt4">
                  <CampoBds
                    rotulo="Link"
                    valor={item.link}
                    aoMudar={(valor) => mudarCampo(indice, 'link', valor)}
                  />
                </div>
              </div>
            ) : null}
          </Papel>
        ))}

        {aviso ? (
          <p className="cf-aviso" role="alert">
            {aviso}
          </p>
        ) : null}
      </div>
    </>
  );
}
