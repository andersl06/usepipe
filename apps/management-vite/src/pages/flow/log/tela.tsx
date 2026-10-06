import { useEffect, useState, type FormEvent } from 'react';
import { SearchIcon, IconePortal } from '@pipe/ui/icones-portal';
import { Select } from '@pipe/ui/select';
import { Interruptor } from '../integrations/interruptor';
import { EMPTY_LOG_FILTERS, filtersFromForm, type LogFilterValues } from './filtros';

/** `mensagem.direcao`/`mensagem.tipo` (`@pipe/db/schema`) — os valores que o filtro aceita. */
const DIRECTIONS: [string, string][] = [
  ['', 'Todas as direções'],
  ['entrada', 'Recebidas'],
  ['saida', 'Enviadas'],
  ['interna', 'Internas'],
];
const TIPOS: [string, string][] = [
  ['', 'Todos os tipos'],
  ['texto', 'Texto'],
  ['imagem', 'Imagem'],
  ['audio', 'Áudio'],
  ['video', 'Vídeo'],
  ['documento', 'Documento'],
  ['localizacao', 'Localização'],
  ['template', 'Modelo'],
];

/**
 * The Log template (portal.js module 4842), as-is:
 *
 *   <page-header page-title="modules.application.detail.messages.title" class="message-history-header">
 *     <custom-content class="u-full-width items-center">
 *       <div class="twelve columns" ng-if="($ctrl.search !== '' || $ctrl.messages.length !== 0) && $ctrl.searchLogsEnabled">
 *         <form id="messagesForm" class="mb0"> <div class="input-group flex">
 *           <bds-input class="u-full-width" placeholder="…history.filterPlaceholder"/>
 *           <bds-button-icon icon="search" type-icon="icon" size="short"/>
 *       <bds-switch ng-if="$ctrl.switchLogsEnabled" ng-checked="$ctrl.logsEnabled"/>
 *       <bds-typo tag="span" variant="fs-16" bold="bold"> utils.forms.activate </bds-typo>
 *     <additional-info></additional-info>
 *   </page-header>
 *   <div class="container relative message-history">
 *     <bds-chip-tag ng-show="$ctrl.switchLogsEnabled && !$ctrl.logsEnabled" icon="warning" color="warning">
 *       …disabledAlert.first …disabledAlert.second
 *     <div class="row" ng-if="$ctrl.messages.length > 0"> <div ng-repeat="message in $ctrl.messages">
 *       <bds-paper elevation="primary" style="padding:16px" class="mb4">
 *         <bds-typo tag="p" variant="fs-12"> <strong>Date:</strong> {{storageDate | date:'yyyy-MM-dd HH:mm:ss'}}
 *         <bds-typo tag="p" variant="fs-12" ng-if="message.id"> <strong>Id:</strong><a ng-click="openMessageNotificationsModal"> {{message.id}}</a>
 *         … From / To / (Pp) / Type … <strong>Content:</strong> <pre>{{message.content}}</pre>
 *         <div ng-if="message.metadata"> <strong>Metadata:</strong> <pre>{{message.metadata}}</pre>
 *     <div ng-if="$ctrl.search && $ctrl.messages.length === 0" class="no-logs-found">
 *       <bds-grid justify-content="center"> <bds-icon name="error" theme="outline" size="brand"/>
 *       <div class="row"> <div class="twelve columns tc"> <bds-typo tag="h4" variant="fs-16"> utils.misc.noSearchResults
 *     <div ng-if="!$ctrl.search && $ctrl.messages.length === 0">
 *       <div class="no-logs-found"> <bds-typo tag="h4" margin="false" variant="fs-16"> …history.noMessages
 *       <bds-typo tag="p" variant="fs-14"> …history.noMessagesDescription
 *
 * pt-BR texts (captured verbatim): "Log", "Ativar", "Funcionalidade desabilitada. " + "Novas mensagens e notificações trafegadas não aparecerão aqui.", "Pesquise por qualquer termo para filtrar as mensagens...", "Aguardando a primeira mensagem", "Aqui você poderá visualizar todas as mensagens enviadas e recebidas, assim como informações de quem as enviou. Você pode aproveitar este tempo para ficar disponível em outros canais e alcançar mais clientes.", "Nenhum resultado encontrado".
 *
 * Both feature flags (`search-logs`, `show-message-logs-switch`) are on on the captured account, so search and the toggle both show.
 *
 * ponytail: `/log-configurations` (turning collection on/off) doesn't exist in the Pipe API. The toggle is local: it starts off — the same state as the source with no configuration — and only hides the yellow warning. "Id" opens, in the source, the message notifications modal; here it's just the link.
 */
export interface LogMessage {
  id: string;
  data: string;
  de: string;
  para: string;
  tipo: string;
  conteudo: string;
  metadata: string | null;
}

export function TelaDoLog({
  search,
  de,
  ate,
  direction,
  tipo,
  messages,
  carregado = false,
  temMais = false,
  carregandoMais = false,
  aoCarregarMais,
  aoAplicarFiltro,
}: {
  search: string;
  /** Filter by period, direction and type — task item 4: the source only had search. */
  de?: string;
  ate?: string;
  direction?: string;
  tipo?: string;
  messages: LogMessage[];
  /** The first page has arrived: the filter bar stays so an empty result can be cleared. */
  carregado?: boolean;
  temMais?: boolean;
  carregandoMais?: boolean;
  aoCarregarMais?: () => void;
  /**
   * Filtro em React state (D-30, `std/nav-contract.md` §Gestão): o
   * `<form method="get">` continua existindo por acessibilidade (Enter
   * envia), mas o envio é interceptado — nunca mais navega para
   * `?busca=&de=&...`, só chama esta função com os valores lidos.
   */
  aoAplicarFiltro?: (filtros: LogFilterValues) => void;
}) {
  const [ativo, setAtivo] = useState(false);
  const filterActive = Boolean(search || de || ate || direction || tipo);
  const showSearch = filterActive || messages.length !== 0 || carregado;
  const filtros: LogFilterValues = {
    busca: search,
    de: de ?? '',
    ate: ate ?? '',
    direcao: direction ?? '',
    tipo: tipo ?? '',
  };
  /* The search text is typed locally and applied on submit; the other filters apply as soon as they change. */
  const [texto, setTexto] = useState(search);
  useEffect(() => {
    setTexto(search);
  }, [search]);

  function aplicar(mudanca: Partial<LogFilterValues>) {
    aoAplicarFiltro?.({ ...filtros, ...mudanca });
  }

  function enviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    aoAplicarFiltro?.(filtersFromForm(new FormData(evento.currentTarget)));
  }

  return (
    <>
      <header className="ph-cabecalho lg-cabecalho">
        <div className="ph-conteudo">
          <div className="ph-titulo-caixa">
            <h1 className="ph-titulo">Log</h1>
          </div>
          <div className="ph-direita">
            <div className="lg-custom">
              {showSearch ? (
                <div className="lg-doze">
                  <form id="messagesForm" className="lg-form" method="get" onSubmit={enviar}>
                    <div className="lg-grupo">
                      <div className="lg-campo">
                        <input
                          name="busca"
                          value={texto}
                          onChange={(evento) => setTexto(evento.target.value)}
                          autoComplete="off"
                          placeholder="Pesquise por qualquer termo para filtrar as mensagens..."
                        />
                      </div>
                      <button type="submit" className="lg-search-button" aria-label="Pesquisar">
                        <SearchIcon tamanho={24} />
                      </button>
                    </div>
                    <div className="lg-filters">
                      <label className="lg-filter">
                        <span>De</span>
                        <input type="date" name="de" value={filtros.de} onChange={(evento) => aplicar({ de: evento.target.value })} />
                      </label>
                      <label className="lg-filter">
                        <span>Até</span>
                        <input type="date" name="ate" value={filtros.ate} onChange={(evento) => aplicar({ ate: evento.target.value })} />
                      </label>
                      <label className="lg-filter">
                        <span>Direção</span>
                        <Select name="direcao" value={filtros.direcao} onChange={(evento) => aplicar({ direcao: evento.target.value })} aria-label="Direção">
                          {DIRECTIONS.map(([value, rotulo]) => (
                            <option key={value} value={value}>
                              {rotulo}
                            </option>
                          ))}
                        </Select>
                      </label>
                      <label className="lg-filter">
                        <span>Tipo</span>
                        <Select name="tipo" value={filtros.tipo} onChange={(evento) => aplicar({ tipo: evento.target.value })} aria-label="Tipo">
                          {TIPOS.map(([value, rotulo]) => (
                            <option key={value} value={value}>
                              {rotulo}
                            </option>
                          ))}
                        </Select>
                      </label>
                      {filterActive ? (
                        <button type="button" className="lg-link lg-limpar" onClick={() => aoAplicarFiltro?.(EMPTY_LOG_FILTERS)}>
                          Limpar
                        </button>
                      ) : null}
                    </div>
                  </form>
                </div>
              ) : null}
              <Interruptor id="log-switch" ligado={ativo} rotulo="Ativar" aoMudar={setAtivo} />
              <span className="ph-ativar">Ativar</span>
            </div>
          </div>
        </div>
      </header>

      <div className="lg-history">
        {!ativo ? (
          <div className="lg-chip" role="status">
            <span className="lg-chip-icone">
              <IconePortal nome="alerta" tamanho={16} />
            </span>
            <p>
              Funcionalidade desabilitada. Novas mensagens e notificações trafegadas não aparecerão
              aqui.
            </p>
          </div>
        ) : null}

        {messages.length > 0 ? (
          <div className="lg-row">
            {messages.map((message) => (
              <div key={message.id}>
                <article className="lg-paper">
                  <p>
                    <strong>Date:</strong> {message.data}
                  </p>
                  <p>
                    <strong>Id:</strong>
                    <a className="lg-link"> {message.id}</a>
                  </p>
                  <p>
                    <strong>From:</strong> {message.de}
                  </p>
                  <p>
                    <strong>To:</strong> {message.para}
                  </p>
                  <p>
                    <strong>Type:</strong> {message.tipo}
                  </p>
                  <p>
                    <strong>Content:</strong>
                  </p>
                  <pre>{message.conteudo}</pre>
                  {message.metadata ? (
                    <div>
                      <p>
                        <strong>Metadata:</strong>
                      </p>
                      <pre>{message.metadata}</pre>
                    </div>
                  ) : null}
                </article>
              </div>
            ))}
          </div>
        ) : null}

        {messages.length > 0 && temMais ? (
          <div className="lg-mais">
            <button type="button" onClick={aoCarregarMais} disabled={carregandoMais}>
              {carregandoMais ? 'Carregando…' : 'Carregar mais'}
            </button>
          </div>
        ) : null}

        {filterActive && messages.length === 0 ? (
          <div className="lg-empty">
            <div className="lg-empty-icon">
              <IconePortal nome="erro-contorno" tamanho={56} />
            </div>
            <div className="lg-row">
              <div className="lg-doze lg-centro">
                <h4>Nenhum resultado encontrado</h4>
              </div>
            </div>
          </div>
        ) : null}

        {!filterActive && messages.length === 0 ? (
          <div>
            <div className="lg-empty">
              <h4 className="lg-h4-apagado">Aguardando a primeira mensagem</h4>
            </div>
            <p className="lg-description">
              Aqui você poderá visualizar todas as mensagens enviadas e recebidas, assim como
              informações de quem as enviou. Você pode aproveitar este tempo para ficar disponível
              em outros canais e alcançar mais clientes.
            </p>
          </div>
        ) : null}
      </div>
    </>
  );
}
