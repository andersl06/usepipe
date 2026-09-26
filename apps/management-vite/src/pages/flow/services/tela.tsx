import { useState } from 'react';

import { IconePortal } from '../../../components/icones-portal';

import type { DataOfServices, LinkedService } from '@pipe/contracts';

import { contactBase } from '../contact';

import { deleteService, saveService } from './gravar';

import {
  serviceFieldsVisible,
  searchChatbots,
  pedidoDoFormulario,
  type ServiceForm,
} from './regras';

const EMPTY: ServiceForm = {
  nome: '',
  chatbotId: '',
  principal: false,
  persistente: false,
  expiration: '',
};

function formularioDe(service: LinkedService): ServiceForm {
  return {
    nome: service.nome,
    chatbotId: service.chatbot.id,
    principal: service.principal,
    persistente: service.persistente,
    expiration:
      service.expirationMin === null
        ? ''
        : String(service.expirationMin),
  };
}

export function TelaDeServicos({
  data,
  podeEditar,
}: {
  data: DataOfServices;
  podeEditar: boolean;
}) {
  /**
   * `null` = closed
   * `'novo'` = adding
   * otherwise, the id of the service being edited
   */
  const [aberto, setAberto] = useState<string | null>(null);

  const [formulario, setFormulario] =
    useState<ServiceForm>(EMPTY);

  const [searchText, searchSetText] = useState('');
  const [error, setError] = useState('');
  const [gravando, setGravando] = useState(false);

  const router = data.router!;

  const servicos = [
    ...(data.principal ? [data.principal] : []),
    ...data.filhos,
  ];

  const campos = serviceFieldsVisible(
    formulario.principal,
    formulario.persistente,
  );

  const editando =
    aberto !== null && aberto !== 'novo'
      ? aberto
      : null;

  const jaUsados = new Set(
    servicos
      .filter((s) => s.id !== editando)
      .map((s) => s.chatbot.id),
  );

  const encontrados = searchChatbots(
    data.search,
    searchText,
    jaUsados,
  );

  const titulo = editando
    ? 'Editar serviço'
    : 'Adicionar um serviço';

  const abrir = (
    service: LinkedService | null,
  ) => {
    setFormulario(
      service
        ? formularioDe(service)
        : EMPTY,
    );

    searchSetText(
      service
        ? service.chatbot.nome
        : '',
    );

    setError('');

    setAberto(
      service
        ? service.id
        : 'novo',
    );
  };

  const mudar = (
    parte: Partial<ServiceForm>,
  ) =>
    setFormulario((atual) => ({
      ...atual,
      ...parte,
    }));

  const gravar = async () => {
    setGravando(true);

    const r = await saveService(
      router.id,
      editando,
      pedidoDoFormulario(formulario),
    );

    setGravando(false);

    if (!r.ok) {
      return setError(r.error);
    }

    setAberto(null);
  };

  const excluir = async (
    service: LinkedService,
  ) => {
    const r = await deleteService(
      router.id,
      service.id,
    );

    if (!r.ok) {
      setError(r.error);
    }
  };

  return (
    <div className="sv-container">
      <header className="ph-cabecalho">
        <div className="ph-conteudo">
          <div className="ph-titulo-caixa">
            <h1 className="ph-titulo">
              Serviços
            </h1>
          </div>
        </div>
      </header>

      <p>
        Adicione sub-bots como serviços do seu
        chatbot principal.
      </p>

      <p>
        Para informações sobre como configurar
        e utilizar o modelo Roteador, consulte
        nossa documentação.
      </p>

      <div className="sv-lista">
        {podeEditar ? (
          <button
            className="sv-botao sv-botao-primario"
            type="button"
            onClick={() => abrir(null)}
          >
            <IconePortal
              nome="mais"
              tamanho={20}
            />

            Adicionar um serviço
          </button>
        ) : null}

        {aberto !== null ? (
          <div
            className="sv-formulario"
            role="dialog"
            aria-label={titulo}
          >
            <h2>{titulo}</h2>

        {}
        <div className="sv-campo">
          <div className="sv-input">
            <div className="sv-input-container">
              <div className="sv-input-wrapper">
                <label
                  className="sv-input-label-text"
                  htmlFor="sv-nome-servico"
                >
                  Crie um nome para seu serviço
                </label>

                <input
                  id="sv-nome-servico"
                  type="text"
                  autoCapitalize="off"
                  autoComplete="off"
                  placeholder="É usado para referenciar seu serviço ao trocar de bot"
                  value={formulario.nome}
                  onChange={(evento) =>
                    mudar({
                      nome: evento.target.value,
                    })
                  }
                />
              </div>
            </div>
          </div>
        </div>

        {/* CHATBOT */}
        <div className="sv-campo">
          <div className="sv-input">
            <div className="sv-input-container">
              <div className="sv-input-wrapper">
                <label
                  className="sv-input-label-text"
                  htmlFor="sv-chatbot-servico"
                >
                  Associe um chatbot para este serviço
                </label>

                <input
                  id="sv-chatbot-servico"
                  type="search"
                  autoCapitalize="off"
                  autoComplete="off"
                  value={searchText}
                  onChange={(evento) => {
                    searchSetText(evento.target.value);

                    mudar({
                      chatbotId: '',
                    });
                  }}
                />
              </div>
            </div>
          </div>
        </div>

            {formulario.chatbotId ? null : encontrados.length === 0 ? (
              <p className="sv-search-empty">
                Nenhum chatbot encontrado
              </p>
            ) : (
              <ul className="sv-search">
                {encontrados.map((item) => {
                  const initials = item.nome
                    .trim()
                    .split(/\s+/)
                    .slice(0, 2)
                    .map((parte) =>
                      parte.charAt(0),
                    )
                    .join('')
                    .toUpperCase();

                  return (
                    <li key={item.id}>
                      <button
                        type="button"
                        className={[
                          'sv-chatbot-item',
                          item.estado ===
                          'publicado'
                            ? ''
                            : 'sv-apagado',
                        ]
                          .filter(Boolean)
                          .join(' ')}
                        onClick={() => {
                          mudar({
                            chatbotId: item.id,
                          });

                          searchSetText(
                            item.nome,
                          );
                        }}
                      >
                        <span
                          className="sv-chatbot-avatar"
                          aria-hidden="true"
                        >
                          {initials}
                        </span>

                        <span className="sv-chatbot-texto">
                          <span className="sv-chatbot-nome">
                            {item.nome}
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}

            <label className="sv-check">
              <input
                type="checkbox"
                checked={
                  formulario.principal
                }
                onChange={(evento) =>
                  mudar({
                    principal:
                      evento.target.checked,
                  })
                }
              />

              <span>
                É o meu chatbot principal
              </span>
            </label>

            {campos.mostrarPersistente ? (
              <label className="sv-check">
                <input
                  type="checkbox"
                  checked={
                    formulario.persistente
                  }
                  onChange={(evento) =>
                    mudar({
                      persistente:
                        evento.target.checked,
                    })
                  }
                />

                <span>
                  Não redirecionar automaticamente para o principal
                </span>
              </label>
            ) : null}

            {}
        {campos.mostrarExpiracao ? (
          <div className="sv-campo sv-field-expiration">
            <div className="sv-input">
              <div className="sv-input-container">
                <div className="sv-input-wrapper">
                  <label
                    className="sv-input-label-text"
                    htmlFor="sv-expiracao"
                  >
                    Expiração do redirecionamento
                  </label>

                  <input
                    id="sv-expiracao"
                    type="number"
                    min={1}
                    step={1}
                    autoComplete="off"
                    placeholder="Defina o tempo, em segundos, que clientes voltarão para o chatbot principal após a última interação. Padrão: 1800 s (30 min)"
                    value={formulario.expiration}
                    onChange={(evento) =>
                      mudar({
                        expiration: evento.target.value,
                      })
                    }
                  />
                </div>
              </div>
            </div>
          </div>
        ) : null}

            <div className="sv-actions">
              <button
                type="button"
                className="sv-botao"
                onClick={() =>
                  setAberto(null)
                }
              >
                Cancelar
              </button>

              <button
                type="button"
                className="sv-botao sv-botao-primario"
                disabled={gravando}
                onClick={() =>
                  void gravar()
                }
              >
                {editando
                  ? 'Salvar'
                  : 'Confirmar'}
              </button>
            </div>
          </div>
        ) : null}

        {error ? (
          <p
            className="sv-error"
            role="alert"
          >
            {error}
          </p>
        ) : null}

        {servicos.map((service) => (
          <article
            className="sv-card"
            key={service.id}
          >
            <div className="sv-card-body">
              {service.principal ? (
                <h2>
                  Chatbot principal{' '}

                  <span
                    title="Este serviço precisa de estar online para que seu chatbot funcione"
                  >
                    <IconePortal
                      nome="informacao"
                      tamanho={16}
                    />
                  </span>
                </h2>
              ) : null}

              <Linha
                rotulo="Serviço:"
                value={service.nome}
              />

              <Linha
                rotulo="Chatbot:"
                value={
                  service.chatbot.nome
                }
                href={contactBase(
                  service.chatbot.tipo,
                  service.chatbot.id,
                )}
              />

              <Linha
                rotulo="Contrato:"
                value="Pipe"
              />
            </div>

            {podeEditar ? (
              <div className="sv-card-actions">
                <button
                  aria-label="Editar serviço"
                  type="button"
                  onClick={() =>
                    abrir(service)
                  }
                >
                  <IconePortal
                    nome="editar"
                    tamanho={24}
                  />
                </button>

                <button
                  aria-label="Excluir serviço"
                  type="button"
                  onClick={() =>
                    void excluir(service)
                  }
                >
                  <IconePortal
                    nome="lixeira"
                    tamanho={24}
                  />
                </button>
              </div>
            ) : null}
          </article>
        ))}
      </div>
    </div>
  );
}

function Linha({
  rotulo,
  value,
  href,
}: {
  rotulo: string;
  value: string;
  href?: string;
}) {
  return (
    <div className="sv-linha">
      <b>{rotulo}</b>

      {href ? (
        <a href={href}>
          {value}
        </a>
      ) : (
        <span>{value}</span>
      )}
    </div>
  );
}