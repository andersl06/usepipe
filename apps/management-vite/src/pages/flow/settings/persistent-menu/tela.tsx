import { useState } from 'react';
import type { ConfigurationOfMenuPersistent } from '@pipe/contracts';
import { BotaoBds, BotaoDeIcone, PageHeader, CampoBds, Role } from '../pecas';
import { salvarMenuPersistente } from './gravar';

/** `Você poderá adicionar até 3 itens que disparam um comando.` (LEIA.md, Round 2, capture 6). */
const MAXIMO_DE_ITENS = 3;

interface ItemDoMenu {
  texto: string;
  link: string;
  aberto: boolean;
}

function itemEmpty(): ItemDoMenu {
  return { texto: '', link: '', aberto: false };
}

function itemsInitials(inicial: ConfigurationOfMenuPersistent): ItemDoMenu[] {
  const preenchidos = inicial.itens.map((item) => ({ ...item, aberto: true }));
  const vazios = Array.from({ length: MAXIMO_DE_ITENS - preenchidos.length }, itemEmpty);
  return [...preenchidos, ...vazios];
}

/**
 * `/configurations/persistentMenu` (LEIA.md, Round 2, capture 6): 3 accordion rows (closed "+" icon), each with **Texto** and **Link**; the Salvar button arrives `disabled` in the source because this router isn't connected to Messenger — that's the real condition `canalCompativel` checks, not an invented state.
 *
 * The source's second block ("Antes de salvar... preencher a tela de boas-vindas") is now real: `boasVindasPreenchida` comes from `GET /v1/gestao/fluxos/:id/menu-persistente`, and the `api` refuses the PATCH the same way if both conditions don't hold — the screen just reflects the same reason ahead of time.
 */
export function TelaDeMenuPersistente({
  id,
  channelCompatible,
  inicial,
}: {
  id: string;
  channelCompatible: boolean;
  inicial: ConfigurationOfMenuPersistent;
}) {
  const [itens, setItens] = useState<ItemDoMenu[]>(() => itemsInitials(inicial));
  const [aviso, setAviso] = useState('');
  const [sucesso, setSucesso] = useState('');
  const [salvando, setSalvando] = useState(false);
  const podeSalvar = channelCompatible && inicial.boasVindasPreenchida;

  function mudarCampo(indice: number, campo: 'texto' | 'link', value: string) {
    setItens((atual) => atual.map((item, i) => (i === indice ? { ...item, [campo]: value } : item)));
  }

  function alternarAberto(indice: number) {
    setItens((atual) =>
      atual.map((item, i) => (i === indice ? { ...item, aberto: !item.aberto } : item)),
    );
  }

  async function salvar() {
    setAviso('');
    setSucesso('');
    setSalvando(true);
    const resultado = await salvarMenuPersistente(
      id,
      itens.map(({ texto, link }) => ({ texto, link })),
    );
    setSalvando(false);
    if (!resultado.ok) {
      setAviso(resultado.error);
      return;
    }
    setSucesso('Configuração salva com sucesso.');
  }

  return (
    <>
      <PageHeader
        titulo={<h1>Menu Persistente</h1>}
        actions={
          <BotaoBds variante="bot" disabled={!podeSalvar || salvando} onClick={() => void salvar()}>
            Salvar
          </BotaoBds>
        }
      />
      <div className="cf-container cf-menu-persistente">
        {!channelCompatible ? (
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
        {channelCompatible && !inicial.boasVindasPreenchida ? (
          <p className="cf-menu-aviso-boasvindas">
            Antes de salvar o menu persistente, você precisa preencher a tela de boas-vindas no
            menu lateral.
          </p>
        ) : null}

        {itens.map((item, indice) => (
          <Role key={indice} className="cf-menu-item">
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
                  value={item.texto}
                  aoMudar={(value) => mudarCampo(indice, 'texto', value)}
                />
                <div className="cf-mt4">
                  <CampoBds
                    rotulo="Link"
                    value={item.link}
                    aoMudar={(value) => mudarCampo(indice, 'link', value)}
                  />
                </div>
              </div>
            ) : null}
          </Role>
        ))}

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
      </div>
    </>
  );
}
