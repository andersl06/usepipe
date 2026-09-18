import { useState } from 'react';
import { IconePortal } from '../../../componentes/icones-portal';
import type { DadosDeServicos } from '@pipe/contracts';
import { baseDoContato } from '../contato';
import { camposVisiveisDoServico } from './regras';

export function TelaDeServicos({
  dados,
  podeEditar,
}: {
  dados: DadosDeServicos;
  podeEditar: boolean;
}) {
  const [aberto, setAberto] = useState(false);
  const [principalMarcado, setPrincipalMarcado] = useState(false);
  const [persistente, setPersistente] = useState(false);
  const [erro, setErro] = useState('');
  const principal = dados.principal!;
  const campos = camposVisiveisDoServico(principalMarcado, persistente);
  const acaoIndisponivel = () => setErro('Ainda não disponível.');

  return (
    <div className="sv-container">
      <header className="ph-cabecalho">
        <div className="ph-conteudo">
          <div className="ph-titulo-caixa">
            <h1 className="ph-titulo">Serviços</h1>
          </div>
        </div>
      </header>
      <p>Adicione sub-bots como serviços do seu chatbot principal.</p>
      <p>
        Para informações sobre como configurar e utilizar o modelo Roteador, consulte nossa
        documentação.
      </p>
      <div className="sv-lista">
        {podeEditar ? (
          <button
            className="sv-botao sv-botao-primario"
            type="button"
            onClick={() => setAberto(true)}
          >
            <IconePortal nome="mais" tamanho={20} />
            Adicionar um serviço
          </button>
        ) : null}
        {aberto ? (
          <div className="sv-formulario" role="dialog" aria-label="Adicionar um serviço">
            <h2>Adicionar um serviço</h2>
            <label>
              Nome do serviço
              <input type="text" placeholder="Crie um nome para seu serviço" />
            </label>
            <label>
              Chatbot
              <input list="sv-chatbots" placeholder="Associe um chatbot para este serviço" />
            </label>
            <datalist id="sv-chatbots">
              {dados.busca
                .filter((item) => item.id !== principal.id)
                .map((item) => (
                  <option key={item.id} value={item.nome} />
                ))}
            </datalist>
            <label className="sv-check">
              <input
                type="checkbox"
                checked={principalMarcado}
                onChange={(evento) => setPrincipalMarcado(evento.target.checked)}
              />
              É o meu chatbot principal
            </label>
            {campos.mostrarPersistente ? (
              <label className="sv-check">
                <input
                  type="checkbox"
                  checked={persistente}
                  onChange={(evento) => setPersistente(evento.target.checked)}
                />
                Não redirecionar automaticamente para o principal
              </label>
            ) : null}
            {campos.mostrarExpiracao ? (
              <label>
                Expiração do redirecionamento
                <input type="number" placeholder="Expiração do redirecionamento" />
              </label>
            ) : null}
            <div className="sv-acoes">
              <button type="button" className="sv-botao" onClick={() => setAberto(false)}>
                Cancelar
              </button>
              <button
                type="button"
                className="sv-botao sv-botao-primario"
                onClick={acaoIndisponivel}
              >
                Adicionar
              </button>
            </div>
            {erro ? (
              <p className="sv-erro" role="alert">
                {erro}
              </p>
            ) : null}
          </div>
        ) : null}
        <article className="sv-cartao">
          <div className="sv-cartao-corpo">
            <h2>
              Chatbot principal{' '}
              <span title="Este serviço precisa de estar online para que seu chatbot funcione">
                <IconePortal nome="informacao" tamanho={16} />
              </span>
            </h2>
            <Linha rotulo="Serviço:" valor="Chatbot principal" />
            <Linha
              rotulo="Chatbot:"
              valor={principal.nome}
              href={baseDoContato(principal.tipo, principal.id)}
            />
            <Linha rotulo="Contrato:" valor="Pipe" />
          </div>
          {podeEditar ? (
            <div className="sv-cartao-acoes">
              <button aria-label="Editar serviço" type="button" onClick={acaoIndisponivel}>
                <IconePortal nome="editar" tamanho={20} />
              </button>
              <button aria-label="Excluir serviço" type="button" onClick={acaoIndisponivel}>
                <IconePortal nome="lixeira" tamanho={20} />
              </button>
            </div>
          ) : null}
        </article>
        {dados.filhos.map((filho) => (
          <article className="sv-cartao" key={filho.id}>
            <div className="sv-cartao-corpo">
              <Linha rotulo="Serviço:" valor={filho.nome} />
              <Linha rotulo="Chatbot:" valor={filho.nome} href={baseDoContato(filho.tipo, filho.id)} />
              <Linha rotulo="Contrato:" valor="Pipe" />
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

function Linha({ rotulo, valor, href }: { rotulo: string; valor: string; href?: string }) {
  return (
    <div className="sv-linha">
      <b>{rotulo}</b>
      {href ? <a href={href}>{valor}</a> : <span>{valor}</span>}
    </div>
  );
}
