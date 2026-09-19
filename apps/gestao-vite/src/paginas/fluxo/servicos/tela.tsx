import { useState } from 'react';
import { IconePortal } from '../../../componentes/icones-portal';
import type { DadosDeServicos, ServicoVinculado } from '@pipe/contracts';
import { baseDoContato } from '../contato';
import { excluirServico, salvarServico } from './gravar';
import {
  camposVisiveisDoServico,
  chatbotsDaBusca,
  pedidoDoFormulario,
  type FormularioDeServico,
} from './regras';

const VAZIO: FormularioDeServico = {
  nome: '',
  chatbotId: '',
  principal: false,
  persistente: false,
  expiracao: '',
};

function formularioDe(servico: ServicoVinculado): FormularioDeServico {
  return {
    nome: servico.nome,
    chatbotId: servico.chatbot.id,
    principal: servico.principal,
    persistente: servico.persistente,
    expiracao: servico.expiracaoMin === null ? '' : String(servico.expiracaoMin),
  };
}

export function TelaDeServicos({
  dados,
  podeEditar,
}: {
  dados: DadosDeServicos;
  podeEditar: boolean;
}) {
  /** `null` = fechado; `'novo'` = adicionar; senão, o id do serviço em edição. */
  const [aberto, setAberto] = useState<string | null>(null);
  const [formulario, setFormulario] = useState<FormularioDeServico>(VAZIO);
  const [textoDaBusca, setTextoDaBusca] = useState('');
  const [erro, setErro] = useState('');
  const [gravando, setGravando] = useState(false);
  const roteador = dados.roteador!;
  const servicos = [...(dados.principal ? [dados.principal] : []), ...dados.filhos];
  const campos = camposVisiveisDoServico(formulario.principal, formulario.persistente);
  const editando = aberto !== null && aberto !== 'novo' ? aberto : null;
  const jaUsados = new Set(
    servicos.filter((s) => s.id !== editando).map((s) => s.chatbot.id),
  );
  const encontrados = chatbotsDaBusca(dados.busca, textoDaBusca, jaUsados);
  const titulo = editando ? 'Editar serviço' : 'Adicionar um serviço';

  const abrir = (servico: ServicoVinculado | null) => {
    setFormulario(servico ? formularioDe(servico) : VAZIO);
    setTextoDaBusca(servico ? servico.chatbot.nome : '');
    setErro('');
    setAberto(servico ? servico.id : 'novo');
  };
  const mudar = (parte: Partial<FormularioDeServico>) =>
    setFormulario((atual) => ({ ...atual, ...parte }));

  const gravar = async () => {
    setGravando(true);
    const r = await salvarServico(roteador.id, editando, pedidoDoFormulario(formulario));
    setGravando(false);
    if (!r.ok) return setErro(r.erro);
    setAberto(null);
  };
  const excluir = async (servico: ServicoVinculado) => {
    if (!window.confirm(`Excluir serviço ${servico.nome}?`)) return;
    const r = await excluirServico(roteador.id, servico.id);
    if (!r.ok) setErro(r.erro);
  };

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
            onClick={() => abrir(null)}
          >
            <IconePortal nome="mais" tamanho={20} />
            Adicionar um serviço
          </button>
        ) : null}
        {aberto !== null ? (
          <div className="sv-formulario" role="dialog" aria-label={titulo}>
            <h2>{titulo}</h2>
            <label>
              Nome do serviço
              <input
                type="text"
                placeholder="Crie um nome para seu serviço"
                value={formulario.nome}
                onChange={(evento) => mudar({ nome: evento.target.value })}
              />
            </label>
            <label>
              Chatbot
              <input
                type="search"
                placeholder="Associe um chatbot para este serviço"
                value={textoDaBusca}
                onChange={(evento) => {
                  setTextoDaBusca(evento.target.value);
                  mudar({ chatbotId: '' });
                }}
              />
            </label>
            {formulario.chatbotId ? null : encontrados.length === 0 ? (
              <p className="sv-busca-vazia">Nenhum chatbot encontrado</p>
            ) : (
              <ul className="sv-busca">
                {encontrados.map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      className={item.estado === 'publicado' ? undefined : 'sv-apagado'}
                      onClick={() => {
                        mudar({ chatbotId: item.id });
                        setTextoDaBusca(item.nome);
                      }}
                    >
                      {item.nome}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <label className="sv-check">
              <input
                type="checkbox"
                checked={formulario.principal}
                onChange={(evento) => mudar({ principal: evento.target.checked })}
              />
              É o meu chatbot principal
            </label>
            {campos.mostrarPersistente ? (
              <label className="sv-check">
                <input
                  type="checkbox"
                  checked={formulario.persistente}
                  onChange={(evento) => mudar({ persistente: evento.target.checked })}
                />
                Não redirecionar automaticamente para o principal
              </label>
            ) : null}
            {campos.mostrarExpiracao ? (
              <label>
                Expiração do redirecionamento
                <input
                  type="number"
                  min={1}
                  step={1}
                  placeholder="Expiração do redirecionamento"
                  value={formulario.expiracao}
                  onChange={(evento) => mudar({ expiracao: evento.target.value })}
                />
              </label>
            ) : null}
            <div className="sv-acoes">
              <button type="button" className="sv-botao" onClick={() => setAberto(null)}>
                Cancelar
              </button>
              <button
                type="button"
                className="sv-botao sv-botao-primario"
                disabled={gravando}
                onClick={() => void gravar()}
              >
                {editando ? 'Salvar' : 'Adicionar'}
              </button>
            </div>
          </div>
        ) : null}
        {erro ? (
          <p className="sv-erro" role="alert">
            {erro}
          </p>
        ) : null}
        {servicos.map((servico) => (
          <article className="sv-cartao" key={servico.id}>
            <div className="sv-cartao-corpo">
              {servico.principal ? (
                <h2>
                  Chatbot principal{' '}
                  <span title="Este serviço precisa de estar online para que seu chatbot funcione">
                    <IconePortal nome="informacao" tamanho={16} />
                  </span>
                </h2>
              ) : null}
              <Linha rotulo="Serviço:" valor={servico.nome} />
              <Linha
                rotulo="Chatbot:"
                valor={servico.chatbot.nome}
                href={baseDoContato(servico.chatbot.tipo, servico.chatbot.id)}
              />
              <Linha rotulo="Contrato:" valor="Pipe" />
            </div>
            {podeEditar ? (
              <div className="sv-cartao-acoes">
                <button aria-label="Editar serviço" type="button" onClick={() => abrir(servico)}>
                  <IconePortal nome="editar" tamanho={20} />
                </button>
                <button
                  aria-label="Excluir serviço"
                  type="button"
                  onClick={() => void excluir(servico)}
                >
                  <IconePortal nome="lixeira" tamanho={20} />
                </button>
              </div>
            ) : null}
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
