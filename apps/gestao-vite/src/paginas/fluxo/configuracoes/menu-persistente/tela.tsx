import { useState } from 'react';
import type { ConfiguracaoDeMenuPersistente } from '@pipe/contracts';
import { BotaoBds, BotaoDeIcone, CabecalhoDaPagina, CampoBds, Papel } from '../pecas';
import { salvarMenuPersistente } from './gravar';

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

function itensIniciais(inicial: ConfiguracaoDeMenuPersistente): ItemDoMenu[] {
  const preenchidos = inicial.itens.map((item) => ({ ...item, aberto: true }));
  const vazios = Array.from({ length: MAXIMO_DE_ITENS - preenchidos.length }, itemVazio);
  return [...preenchidos, ...vazios];
}

/**
 * `/configurations/persistentMenu` (LEIA.md, Rodada 2, captura 6): 3 linhas em
 * acordeão (ícone "+" fechado), cada uma com **Texto** e **Link**; o Salvar
 * chega `disabled` na origem porque este roteador não está conectado ao
 * Messenger — é essa condição real que `canalCompativel` verifica, não um
 * estado inventado.
 *
 * O segundo bloqueio da origem ("Antes de salvar... preencher a tela de
 * boas-vindas") agora é real: `boasVindasPreenchida` vem de
 * `GET /v1/gestao/fluxos/:id/menu-persistente`, e a `api` recusa o PATCH do
 * mesmo jeito se as duas condições não valerem — a tela só reflete o mesmo
 * motivo com antecedência.
 */
export function TelaDeMenuPersistente({
  id,
  canalCompativel,
  inicial,
}: {
  id: string;
  canalCompativel: boolean;
  inicial: ConfiguracaoDeMenuPersistente;
}) {
  const [itens, setItens] = useState<ItemDoMenu[]>(() => itensIniciais(inicial));
  const [aviso, setAviso] = useState('');
  const [sucesso, setSucesso] = useState('');
  const [salvando, setSalvando] = useState(false);
  const podeSalvar = canalCompativel && inicial.boasVindasPreenchida;

  function mudarCampo(indice: number, campo: 'texto' | 'link', valor: string) {
    setItens((atual) => atual.map((item, i) => (i === indice ? { ...item, [campo]: valor } : item)));
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
      setAviso(resultado.erro);
      return;
    }
    setSucesso('Configuração salva com sucesso.');
  }

  return (
    <>
      <CabecalhoDaPagina
        titulo={<h1>Menu Persistente</h1>}
        acoes={
          <BotaoBds variante="bot" disabled={!podeSalvar || salvando} onClick={() => void salvar()}>
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
        {canalCompativel && !inicial.boasVindasPreenchida ? (
          <p className="cf-menu-aviso-boasvindas">
            Antes de salvar o menu persistente, você precisa preencher a tela de boas-vindas no
            menu lateral.
          </p>
        ) : null}

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
        {sucesso ? (
          <p className="cf-basicas-sucesso" role="status">
            {sucesso}
          </p>
        ) : null}
      </div>
    </>
  );
}
