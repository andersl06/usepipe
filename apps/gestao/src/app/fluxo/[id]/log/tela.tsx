'use client';

import { useState } from 'react';
import { IconeBusca, IconePortal } from '../../../../componentes/icones-portal';
import { Interruptor } from '../integracoes/interruptor';

/**
 * O template do Log (módulo 4842 de portal.js), tal qual:
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
 * Textos pt-BR: "Log", "Ativar", "Funcionalidade desabilitada. " + "Novas
 * mensagens e notificações trafegadas não aparecerão aqui.", "Pesquise por
 * qualquer termo para filtrar as mensagens...", "Aguardando a primeira
 * mensagem", "Aqui você poderá visualizar todas as mensagens enviadas e
 * recebidas, assim como informações de quem as enviou. Você pode aproveitar
 * este tempo para ficar disponível em outros canais e alcançar mais
 * clientes.", "Nenhum resultado encontrado".
 *
 * As duas feature flags (`search-logs`, `show-message-logs-switch`) estão
 * ligadas na conta capturada, então busca e interruptor aparecem.
 *
 * ponytail: `/log-configurations` (ligar/desligar a coleta) não existe na
 * API do Pipe. O interruptor é local: começa desligado — o mesmo estado da
 * origem sem configuração — e só esconde o aviso amarelo. O "Id" abre, na
 * origem, o modal de notificações da mensagem; aqui é só o link.
 */
export interface MensagemDoLog {
  id: string;
  data: string;
  de: string;
  para: string;
  tipo: string;
  conteudo: string;
  metadata: string | null;
}

export function TelaDoLog({ busca, mensagens }: { busca: string; mensagens: MensagemDoLog[] }) {
  const [ativo, setAtivo] = useState(false);
  const mostrarBusca = busca !== '' || mensagens.length !== 0;

  return (
    <>
      <header className="ph-cabecalho lg-cabecalho">
        <div className="ph-conteudo">
          <div className="ph-titulo-caixa">
            <h1 className="ph-titulo">Log</h1>
          </div>
          <div className="ph-direita">
            <div className="lg-custom">
              {mostrarBusca ? (
                <div className="lg-doze">
                  <form id="messagesForm" className="lg-form" method="get">
                    <div className="lg-grupo">
                      <div className="lg-campo">
                        <input
                          name="busca"
                          defaultValue={busca}
                          autoComplete="off"
                          placeholder="Pesquise por qualquer termo para filtrar as mensagens..."
                        />
                      </div>
                      <button type="submit" className="lg-busca-botao" aria-label="Pesquisar">
                        <IconeBusca tamanho={24} />
                      </button>
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

      <div className="lg-historico">
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

        {mensagens.length > 0 ? (
          <div className="lg-fileira">
            {mensagens.map((mensagem) => (
              <div key={mensagem.id}>
                <article className="lg-papel">
                  <p>
                    <strong>Date:</strong> {mensagem.data}
                  </p>
                  <p>
                    <strong>Id:</strong>
                    <a className="lg-link"> {mensagem.id}</a>
                  </p>
                  <p>
                    <strong>From:</strong> {mensagem.de}
                  </p>
                  <p>
                    <strong>To:</strong> {mensagem.para}
                  </p>
                  <p>
                    <strong>Type:</strong> {mensagem.tipo}
                  </p>
                  <p>
                    <strong>Content:</strong>
                  </p>
                  <pre>{mensagem.conteudo}</pre>
                  {mensagem.metadata ? (
                    <div>
                      <p>
                        <strong>Metadata:</strong>
                      </p>
                      <pre>{mensagem.metadata}</pre>
                    </div>
                  ) : null}
                </article>
              </div>
            ))}
          </div>
        ) : null}

        {busca && mensagens.length === 0 ? (
          <div className="lg-vazio">
            <div className="lg-vazio-icone">
              <IconePortal nome="erro-contorno" tamanho={56} />
            </div>
            <div className="lg-fileira">
              <div className="lg-doze lg-centro">
                <h4>Nenhum resultado encontrado</h4>
              </div>
            </div>
          </div>
        ) : null}

        {!busca && mensagens.length === 0 ? (
          <div>
            <div className="lg-vazio">
              <h4 className="lg-h4-apagado">Aguardando a primeira mensagem</h4>
            </div>
            <p className="lg-descricao">
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
