import { useMemo, useState, useTransition } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { IconeSearch, IconePortal } from '../../../../components/icones-portal';
import { Selection } from '../../../../components/selection';
import { useRead } from '../../../../lib/query';
import type { DataOfGrowth, EnvioGrowth } from '@pipe/contracts';
import { analisarCsv, filtrarEnvios } from '../regras';
import type { DestinationCsv } from '../regras';
import { dispararActiveMessages, rotuloDeRecusa } from './disparo';
import type { DisparoDestination, LimitesDeDisparo, RespostaDoDisparo } from './disparo';

type Etapa = 1 | 2 | 3 | 4;

export function ActiveMessagesTela({ data }: { data: DataOfGrowth }) {
  /* The origin's "Atualizar" reloads the screen; here it invalidates the Growth read. */
  const queue = useQueryClient();
  const [atualizando, iniciarUpdate] = useTransition();
  const [create, setCreate] = useState(false);
  const [etapa, setEtapa] = useState<Etapa>(1);
  const [channelId, setChannelId] = useState(data.channels[0]?.id ?? '');
  const [categoria, setCategoria] = useState('utilidade');
  const [templateId, setTemplateId] = useState('');
  const [nome, setNome] = useState('');
  const [tipoAudiencia, setTipoAudiencia] = useState<'massa' | 'individual'>('massa');
  const [contactId, setContactId] = useState('');
  const [file, setFile] = useState('');
  const [contactsFile, setContactsFile] = useState<DestinationCsv[]>([]);
  const [parametrosTexto, setParametrosTexto] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [resultadoEnvio, setResultadoEnvio] = useState<RespostaDoDisparo | null>(null);
  const [aviso, setAviso] = useState('');
  const [search, setSearch] = useState('');
  const [mostrarSearch, setMostrarSearch] = useState(false);
  const [channelFilter, setChannelFilter] = useState('whatsapp');
  const [tipoMessage, setTipoMessage] = useState('todos');
  const [tipoCampanha, setTipoCampanha] = useState('todos');
  const quantityFile = contactsFile.length;

  /*
   * GET /v1/mensagens-ativas/limites — the contact cap per dispatch, so the screen doesn't repeat a magic number (`ControladorMensagensAtivas.limites`).
   */
  const limites = useRead<LimitesDeDisparo>('/v1/messages-active/limits');
  const maxContacts = limites.data?.maxContactsByTrigger ?? 15;

  const modelosAprovados = data.modelos.filter(
    (template) =>
      template.channelId === channelId &&
      template.categoria === categoria &&
      template.statusMeta === 'aprovado',
  );
  const templateSelected = data.modelos.find((template) => template.id === templateId);
  const envios = useMemo(() => filtrarEnvios(data.envios, search, 'todos'), [data.envios, search]);

  function abrirCreation() {
    setCreate(true);
    setEtapa(1);
    setAviso('');
    setResultadoEnvio(null);
    setFile('');
    setContactsFile([]);
    setParametrosTexto('');
    setContactId('');
    setNome('');
  }

  function fecharAssistente() {
    setCreate(false);
  }

  async function readFile(file?: File) {
    if (!file) return;
    const texto = await file.text();
    setFile(file.name);
    setContactsFile(analisarCsv(texto));
  }

  function avancar() {
    if (etapa === 1 && !channelId) return setAviso('Selecione um canal.');
    if (etapa === 2 && !templateId) return setAviso('Selecione um modelo aprovado.');
    if (etapa === 3 && tipoAudiencia === 'massa' && !file) {
      return setAviso('Selecione o arquivo da audiência.');
    }
    if (etapa === 3 && tipoAudiencia === 'massa' && quantityFile === 0) {
      return setAviso('O arquivo não tem nenhum contato com telefone.');
    }
    if (etapa === 3 && tipoAudiencia === 'massa' && quantityFile > maxContacts) {
      return setAviso(`O limite é de ${maxContacts} contatos por disparo.`);
    }
    if (etapa === 3 && tipoAudiencia === 'individual' && !contactId) {
      return setAviso('Selecione um contato.');
    }
    setAviso('');
    setEtapa((atual) => Math.min(atual + 1, 4) as Etapa);
  }

  async function enviarAgora() {
    setAviso('');
    setEnviando(true);
    const destinos: DisparoDestination[] =
      tipoAudiencia === 'massa'
        ? contactsFile.map((c) => ({
            telefone: c.telefone,
            ...(c.nome ? { nome: c.nome } : {}),
            ...(c.parametros.length ? { parametros: c.parametros } : {}),
          }))
        : [{ contactId: contactId }];
    const parametrosGlobal = parametrosTexto.trim()
      ? parametrosTexto.split(',').map((p) => p.trim())
      : undefined;

    const resultado = await dispararActiveMessages({
      channelId: channelId,
      template_id: templateId,
      contacts: destinos,
      ...(parametrosGlobal ? { parametros: parametrosGlobal } : {}),
    });
    setEnviando(false);
    if (!resultado.ok) {
      setAviso(resultado.error);
      return;
    }
    setResultadoEnvio(resultado.value);
  }

  return (
    <div className="gr-container">
      <header className="gr-cabeca">
        <div>
          <div className="gr-titulo-com-info">
            <h1>Resumo dos envios de mensagens</h1>
            <IconePortal nome="informacao-cheia" tamanho={18} />
          </div>
          <p>Monitore o envio de mensagens ativas dos canais para sua audiência.</p>
        </div>
        <div className="gr-header-actions">
          <button
            className="gr-botao gr-botao-terciario"
            type="button"
            disabled={atualizando}
            onClick={() =>
              iniciarUpdate(() => {
                void queue.invalidateQueries({ queryKey: ['api'] });
              })
            }
          >
            <IconePortal nome="atualizar" tamanho={20} />
            Atualizar
          </button>
          <button className="gr-botao gr-botao-primario" type="button" onClick={abrirCreation}>
            Enviar mensagens ativas
          </button>
        </div>
      </header>

      <nav className="gr-abas" aria-label="Mensagens ativas">
        <button type="button" className="active" aria-current="page">
          Disparo
        </button>
      </nav>

      <section className="gr-filters">
        <header>
          <h2>Filtros</h2>
          <div>
            {mostrarSearch ? (
              <label>
                Nome da campanha
                <input
                  type="search"
                  placeholder="Digite o nome da campanha"
                  value={search}
                  onChange={(evento) => setSearch(evento.target.value)}
                />
              </label>
            ) : null}
            <button
              className="gr-botao gr-botao-pesquisa"
              type="button"
              aria-label="Pesquisar campanha"
              onClick={() => setMostrarSearch((atual) => !atual)}
            >
              <IconeSearch tamanho={22} />
            </button>
          </div>
        </header>
        <div className="gr-filters-fields">
          <label>
            Canal
            <Selection value={channelFilter} onChange={(evento) => setChannelFilter(evento.target.value)} aria-label="Canal">
              <option value="whatsapp">Whatsapp</option>
              <option value="google-rcs">GoogleRCS</option>
              <option value="sms">SMS</option>
              <option value="outros">Outros canais</option>
            </Selection>
          </label>
          <label>
            Tipo da mensagem
            <Selection
              value={tipoMessage}
              onChange={(evento) => setTipoMessage(evento.target.value)}
            >
              <option value="todos">Todos</option>
              <option value="agendadas">Agendadas</option>
              <option value="nao-agendadas">Não agendadas</option>
            </Selection>
          </label>
          <label>
            Tipo de campanha
            <Selection
              value={tipoCampanha}
              onChange={(evento) => setTipoCampanha(evento.target.value)}
            >
              <option value="todos">Todos</option>
              <option value="individual">Individual</option>
              <option value="massa">Em massa</option>
            </Selection>
          </label>
        </div>
      </section>

      <ListaDeEnvios envios={envios} />

      {create ? (
        <div
          className="gr-overlay"
          role="presentation"
          onMouseDown={(e) => e.target === e.currentTarget && setCreate(false)}
        >
          <section
            className="gr-modal gr-assistente"
            role="dialog"
            aria-modal="true"
            aria-labelledby="gr-titulo-criacao"
          >
            <header className="gr-modal-cabeca">
              <div>
                <h2 id="gr-titulo-criacao">Enviar mensagem ativa</h2>
                <p>
                  {['Escolha o canal', 'Nome e modelo', 'Audiência', 'Resumo e envio'][etapa - 1]}
                </p>
              </div>
              <button
                className="gr-icone-botao"
                type="button"
                aria-label="Fechar"
                onClick={() => setCreate(false)}
              >
                <IconePortal nome="fechar" tamanho={20} />
              </button>
            </header>
            <div className="gr-etapas" aria-label={`Etapa ${etapa} de 4`}>
              {[1, 2, 3, 4].map((numero) => (
                <span className={etapa >= numero ? 'concluida' : ''} key={numero}>
                  {numero}
                </span>
              ))}
            </div>
            <div className="gr-formulario">
              {etapa === 1 ? (
                <fieldset>
                  <legend>Canal</legend>
                  {data.channels.length ? (
                    data.channels.map((channel) => (
                      <label className="gr-escolha" key={channel.id}>
                        <input
                          type="radio"
                          name="canal"
                          checked={channelId === channel.id}
                          onChange={() => setChannelId(channel.id)}
                        />
                        <span>{channel.nome}</span>
                      </label>
                    ))
                  ) : (
                    <p>Nenhum canal WhatsApp ativo encontrado.</p>
                  )}
                </fieldset>
              ) : null}
              {etapa === 2 ? (
                <>
                  <label>
                    Nome da campanha
                    <input
                      value={nome}
                      onChange={(evento) => setNome(evento.target.value)}
                      placeholder="Escreva aqui"
                    />
                  </label>
                  <label>
                    Categoria da campanha
                    <Selection
                      value={categoria}
                      onChange={(evento) => {
                        setCategoria(evento.target.value);
                        setTemplateId('');
                      }}
                    >
                      <option value="utilidade">Utilidade</option>
                      <option value="marketing">Marketing</option>
                      <option value="autenticacao">Autenticação</option>
                    </Selection>
                  </label>
                  <label>
                    Modelo
                    <Selection
                      value={templateId}
                      onChange={(evento) => setTemplateId(evento.target.value)}
                    >
                      <option value="">Selecione um modelo aprovado</option>
                      {modelosAprovados.map((template) => (
                        <option value={template.id} key={template.id}>
                          {template.nome} · {template.idioma}
                        </option>
                      ))}
                    </Selection>
                  </label>
                  {modelosAprovados.length === 0 ? <p>Nenhum modelo aprovado encontrado.</p> : null}
                  {templateSelected ? (
                    <div className="gr-previa">
                      <span>Prévia</span>
                      <p>{templateSelected.corpo}</p>
                    </div>
                  ) : null}
                  {templateSelected && templateSelected.variables.length > 0 ? (
                    <label>
                      Parâmetros do modelo
                      <input
                        value={parametrosTexto}
                        onChange={(evento) => setParametrosTexto(evento.target.value)}
                        placeholder="Separados por vírgula, na ordem do modelo"
                      />
                      <small>
                        Vale para toda a lista; um contato com parâmetro próprio no arquivo
                        (colunas depois do telefone e do nome) usa o dele no lugar deste.
                      </small>
                    </label>
                  ) : null}
                </>
              ) : null}
              {etapa === 3 ? (
                <>
                  <fieldset>
                    <legend>Tipo de disparo</legend>
                    <label className="gr-escolha">
                      <input
                        type="radio"
                        checked={tipoAudiencia === 'massa'}
                        onChange={() => setTipoAudiencia('massa')}
                      />
                      Em massa
                    </label>
                    <label className="gr-escolha">
                      <input
                        type="radio"
                        checked={tipoAudiencia === 'individual'}
                        onChange={() => setTipoAudiencia('individual')}
                      />
                      Individual
                    </label>
                  </fieldset>
                  {tipoAudiencia === 'massa' ? (
                    <label className="gr-file">
                      Arraste e solte seus arquivos aqui ou clique para fazer upload do arquivo.
                      <input
                        type="file"
                        accept=".csv,text/csv"
                        onChange={(evento) => void readFile(evento.target.files?.[0])}
                      />
                      {file ? (
                        <span>
                          {file} · {quantityFile} contatos
                        </span>
                      ) : null}
                      <small>
                        Colunas: telefone, nome (opcional), parâmetros do modelo (opcionais).
                        Limite de {maxContacts} contatos por disparo.
                      </small>
                    </label>
                  ) : (
                    <label>
                      Contato
                      <Selection
                        value={contactId}
                        onChange={(evento) => setContactId(evento.target.value)}
                      >
                        <option value="">Selecione um contato</option>
                        {data.contacts.map((contact) => (
                          <option key={contact.id} value={contact.id}>
                            {contact.nome ?? contact.telefone} · {contact.telefone}
                          </option>
                        ))}
                      </Selection>
                    </label>
                  )}
                </>
              ) : null}
              {etapa === 4 ? (
                <div className="gr-revisao">
                  <h3>Resumo e envio</h3>
                  <dl>
                    <dt>Nome da mensagem:</dt>
                    <dd>{nome || '—'}</dd>
                    <dt>Nome do modelo:</dt>
                    <dd>{templateSelected?.nome ?? '—'}</dd>
                    <dt>Categoria do modelo:</dt>
                    <dd>{categoria}</dd>
                    <dt>Tipo de envio:</dt>
                    <dd>{tipoAudiencia === 'massa' ? 'Em massa' : 'Individual'}</dd>
                    <dt>Audiência:</dt>
                    <dd>
                      {tipoAudiencia === 'massa'
                        ? `${quantityFile} contatos · ${file || 'sem arquivo'}`
                        : (data.contacts.find((item) => item.id === contactId)?.nome ??
                          '1 contato')}
                    </dd>
                  </dl>
                  {resultadoEnvio ? (
                    <div className="gr-resultado-envio">
                      <p>
                        {resultadoEnvio.enviadas} contato(s) enviado(s)
                        {resultadoEnvio.recusadas
                          ? `, ${resultadoEnvio.recusadas} recusado(s):`
                          : '.'}
                      </p>
                      {resultadoEnvio.recusadas ? (
                        <ul>
                          {resultadoEnvio.data
                            .filter((item) => !item.enviada)
                            .map((item, indice) => (
                              <li key={item.contactId ?? item.telefone ?? indice}>
                                {item.telefone ?? item.contactId ?? 'Contato'} —{' '}
                                {rotuloDeRecusa(item.motivo)}
                              </li>
                            ))}
                        </ul>
                      ) : null}
                    </div>
                  ) : (
                    <p>
                      Verifique se está tudo certo com suas configurações antes de realizar o envio.
                    </p>
                  )}
                </div>
              ) : null}
              {aviso ? (
                <p className="gr-aviso" role="alert">
                  {aviso}
                </p>
              ) : null}
            </div>
            <footer className="gr-modal-actions">
              {etapa > 1 && !resultadoEnvio ? (
                <button
                  className="gr-botao"
                  type="button"
                  onClick={() => {
                    setAviso('');
                    setEtapa((atual) => (atual - 1) as Etapa);
                  }}
                >
                  Voltar
                </button>
              ) : null}
              {etapa < 4 ? (
                <button className="gr-botao gr-botao-primario" type="button" onClick={avancar}>
                  Continuar
                </button>
              ) : resultadoEnvio ? (
                <button
                  className="gr-botao gr-botao-primario"
                  type="button"
                  onClick={fecharAssistente}
                >
                  Concluir
                </button>
              ) : (
                <button
                  className="gr-botao gr-botao-primario"
                  type="button"
                  disabled={enviando}
                  onClick={() => void enviarAgora()}
                >
                  {enviando ? 'Enviando…' : 'Enviar agora'}
                </button>
              )}
            </footer>
          </section>
        </div>
      ) : null}
    </div>
  );
}

function ListaDeEnvios({ envios }: { envios: EnvioGrowth[] }) {
  return (
    <section className="gr-lista">
      {envios.length ? (
        <div className="gr-table-scroll">
          <table>
            <thead>
              <tr>
                <th>Nome da mensagem</th>
                <th>Status</th>
                <th>Agendamento</th>
                <th>Data de envio</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {envios.map((envio) => (
                <tr key={envio.id}>
                  <td>{envio.templateNome ?? '—'}</td>
                  <td>
                    <span className={`gr-status gr-status--${envio.estado ?? 'pendente'}`}>
                      {rotuloState(envio.estado)}
                    </span>
                  </td>
                  <td>Sem agendamento</td>
                  <td>{new Date(envio.criadaEm).toLocaleString('pt-BR')}</td>
                  <td>—</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="gr-empty">
          <IconePortal nome="megafone" tamanho={40} />
          <h2>Crie campanhas e envie mensagens ativas para sua audiência</h2>
          <p>Você ainda não criou nenhuma campanha. Envie mensagens ativas e</p>
          <p>analise o desempenho de suas campanhas por aqui.</p>
          <button className="gr-botao" type="button">
            Saiba como enviar mensagens ativas
          </button>
        </div>
      )}
    </section>
  );
}

function rotuloState(value: string | null): string {
  const rotulos: Record<string, string> = {
    pendente: 'Aguardando envio',
    enviando: 'Enviando',
    enviada: 'Enviada',
    entregue: 'Recebida',
    lida: 'Lida',
    falhou: 'Falhou',
  };
  return value ? (rotulos[value] ?? value) : 'Sem status';
}
