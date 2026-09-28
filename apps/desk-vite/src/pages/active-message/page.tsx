import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import type { TemplateAprovado, TypeChannelDatabase } from '@pipe/contracts';
import { useRead } from '../../lib/query';
import { api } from '../../lib/api';
import { atualizarLeituras } from '../../lib/actions';
import { IconeDesk } from '../../components/icones-desk';
import { Avatar } from '../../components/avatar';
import { displayName, telefoneInternacional } from '../../lib/order';
import type { ListContact } from '../../lib/contacts';
import { aplicarParametros } from '../../lib/template';

/**
 * `Enviar mensagem ativa` at `/activeMessage/send` follows the reference three-step flow (`~/desk-clone/clone/index.html`, active-msg section; `desk2/blip-clone-active.png`): select contact, choose template, review content; show privacy notice, contact form and selected-contacts panel (0/15), then `Cancelar` / `Continuar`. Copy comes from MFE `desk-active-message` (`referencias-blip/pesquisa/blip-desk-vocabulario.md`). Send channel, template, and contacts to existing `api` endpoint `POST /v1/mensagens-ativas`; reference `chatbot` corresponds to our channel.
 */
const MAX_CONTACTS = 15;

interface Channel {
  id: string;
  name: string;
  type: TypeChannelDatabase;
  templates: TemplateAprovado[];
}

interface Destination {
  contactId: string | null;
  telefone: string | null;
  nome: string | null;
}

export function PageActiveMessage() {
  const navegar = useNavigate();
  const [parametros] = useSearchParams();
  const [passo, setPasso] = useState<1 | 2 | 3>(1);
  const [origem, setOrigem] = useState<'existente' | 'novo'>(
    parametros.get('contact') ? 'existente' : 'novo',
  );
  const [channelId, setChannelId] = useState('');
  const [telefone, setTelefone] = useState('');
  const [nome, setNome] = useState('');
  const [search, setSearch] = useState('');
  const [destinos, setDestinos] = useState<Destination[]>([]);
  const [templateId, setTemplateId] = useState('');
  const [templateParameters, templateSetParameters] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState<{ enviadas: number; recusadas: number } | null>(null);

  const channels = useRead<{ channels: Channel[] }>('/v1/desk/channels');
  const contacts = useRead<{ contacts: ListContact[] }>(
    origem === 'existente'
      ? `/v1/desk/contacts${search.trim().length >= 2 ? `?search=${encodeURIComponent(search.trim())}` : ''}`
      : null,
  );
  const contactInitial = useRead<{
    contact: { id: string; name: string | null; phone: string | null };
  }>(parametros.get('contact') ? `/v1/desk/contacts/${parametros.get('contact')}` : null);
  /* When arriving from `Conversar novamente` in Contacts, preselect that contact. */
  useEffect(() => {
    const c = contactInitial.data?.contact;
    if (c)
      setDestinos((atual) =>
        atual.length === 0 ? [{ contactId: c.id, telefone: c.phone, nome: c.name }] : atual,
      );
  }, [contactInitial.data]);

  const channel = channels.data?.channels.find((c) => c.id === channelId) ?? null;
  const template = channel?.templates.find((t) => t.id === templateId) ?? null;
  const variables = Array.isArray(template?.variables) ? (template.variables as string[]) : [];

  function adicionarNovo() {
    const t = telefone.replace(/\D/g, '');
    if (t.length < 10) return setError('Informe o identificador completo');
    if (destinos.length >= MAX_CONTACTS)
      return setError(`Selecione entre 1 e ${MAX_CONTACTS} contatos`);
    setDestinos([
      ...destinos,
      { contactId: null, telefone: '+55' + t.replace(/^55/, ''), nome: nome.trim() || null },
    ]);
    setTelefone('');
    setNome('');
    setError(null);
  }

  function alternarExistente(c: ListContact) {
    const ja = destinos.some((d) => d.contactId === c.id);
    if (ja) setDestinos(destinos.filter((d) => d.contactId !== c.id));
    else if (destinos.length < MAX_CONTACTS)
      setDestinos([...destinos, { contactId: c.id, telefone: c.phone, nome: c.name }]);
  }

  async function enviar() {
    if (!channel || !template) return;
    setEnviando(true);
    setError(null);
    try {
      const r = await api.post<{ enviadas: number; recusadas: number }>('/v1/messages-active', {
        channelId: channel.id,
        template_id: template.id,
        parametros: variables.map((_, i) => templateParameters[i] ?? ''),
        contacts: destinos.map((d) => ({
          contactId: d.contactId,
          phone: d.telefone,
          name: d.nome,
        })),
      });
      setResultado(r);
      atualizarLeituras();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao enviar mensagem ativa');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="dk-active">
      <div className="dk-active-top">
        <button
          type="button"
          className="dk-botao-icone dk-pequeno"
          aria-label="Voltar"
          onClick={() => navegar('/')}
        >
          <IconeDesk nome="seta-esquerda" />
        </button>
        <h2>Enviar mensagem ativa</h2>
        <div className="dk-metrics-refresh">
          <IconeDesk nome="info" tamanho={20} /> Ajuda na busca
        </div>
      </div>
      <div className="dk-stepper">
        {(['Selecionar contato', 'Escolher modelo', 'Revisar conteúdo'] as const).map(
          (rotulo, i) => (
            <div key={rotulo} style={{ display: 'contents' }}>
              {i > 0 ? <div className="dk-stepper-linha" /> : null}
              <div className="dk-stepper-passo" aria-current={passo === i + 1 ? 'step' : undefined}>
                <span className="dk-stepper-numero">{i + 1}</span> {rotulo}
              </div>
            </div>
          ),
        )}
      </div>

      {passo === 1 ? (
        <>
          <div className="dk-alerta-aviso">
            <IconeDesk nome="aviso" tamanho={20} />
            <div>
              Atenção à Privacidade: Com as novas políticas de privacidade da Meta, usuários poderão
              ocultar seus números de telefone usando identificadores (usernames). Para fazer
              disparos para um novo contato com um ID ainda desconhecido, o campo de número de
              telefone é necessário.
            </div>
          </div>
          <div className="dk-active-body">
            <div className="dk-active-form">
              <div className="dk-active-radios">
                <label>
                  <input
                    type="radio"
                    name="origem"
                    checked={origem === 'existente'}
                    onChange={() => setOrigem('existente')}
                  />{' '}
                  Selecionar contato existente
                </label>
                <label>
                  <input
                    type="radio"
                    name="origem"
                    checked={origem === 'novo'}
                    onChange={() => setOrigem('novo')}
                  />{' '}
                  Adicionar novo contato
                </label>
              </div>
              {origem === 'novo' ? (
                <>
                  <h3>Novo contato</h3>
                  <p>
                    Envie uma mensagem ativa para contatos que não estão salvos em seus chatbots.
                  </p>
                  <div className="dk-campo-flutuante">
                    <span>Adicionar contato por</span>
                    <b>Telefone</b>
                  </div>
                  <label className="dk-campo-flutuante">
                    <span>Salvar contato no chatbot</span>
                    <select value={channelId} onChange={(e) => setChannelId(e.target.value)}>
                      <option value="">Selecionar chatbot</option>
                      {channels.data?.channels.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="dk-active-help">
                    Para alterar o chatbot, é necessário limpar a seleção de contatos atual
                  </div>
                  <label className="dk-campo-flutuante">
                    <span>Telefone</span>
                    <span className="dk-active-phone">
                      <small>BR</small> +55{' '}
                      <input
                        type="tel"
                        value={telefone}
                        onChange={(e) => setTelefone(e.target.value)}
                        aria-label="Telefone"
                      />
                    </span>
                  </label>
                  <label className="dk-campo-flutuante">
                    <span>&nbsp;</span>
                    <input
                      type="text"
                      placeholder="Nome do contato"
                      value={nome}
                      onChange={(e) => setNome(e.target.value)}
                    />
                  </label>
                  <div style={{ textAlign: 'right' }}>
                    <button
                      type="button"
                      className="dk-botao dk-botao-curto"
                      disabled={!telefone.trim()}
                      onClick={adicionarNovo}
                    >
                      Adicionar
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <h3>Contato existente</h3>
                  <p>Busque por contatos existentes para enviar uma mensagem ativa</p>
                  <label className="dk-campo-flutuante">
                    <span>Salvar contato no chatbot</span>
                    <select value={channelId} onChange={(e) => setChannelId(e.target.value)}>
                      <option value="">Selecionar chatbot</option>
                      {channels.data?.channels.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="dk-campo">
                    <span className="dk-campo-icone">
                      <IconeDesk nome="busca" />
                    </span>
                    <input
                      type="search"
                      placeholder="Pesquisar"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                  </label>
                  <ul className="dk-active-contacts">
                    {contacts.data?.contacts.slice(0, 20).map((c) => (
                      <li key={c.id}>
                        <label>
                          <input
                            type="checkbox"
                            checked={destinos.some((d) => d.contactId === c.id)}
                            onChange={() => alternarExistente(c)}
                          />
                          <Avatar tamanho={32} />
                          <span>
                            <b>
                              {displayName({
                                contactName: c.name,
                                contactPhone: c.phone,
                                contactEmail: c.email,
                                contactId: c.id,
                              })}
                            </b>
                            <small>
                              {c.phone ? telefoneInternacional(c.phone) : c.email}
                            </small>
                          </span>
                        </label>
                      </li>
                    ))}
                  </ul>
                </>
              )}
              {error ? <p className="dk-error">{error}</p> : null}
            </div>
            <aside className="dk-active-side">
              <div className="dk-active-side-top">
                <span>
                  Contatos selecionados {destinos.length}/{MAX_CONTACTS}
                </span>
                <button type="button" className="dk-active-clear" onClick={() => setDestinos([])}>
                  Limpar seleção
                </button>
              </div>
              <div className="dk-active-side-body">
                {destinos.length === 0 ? (
                  <>
                    <div className="dk-active-box" />
                    <div>
                      Selecione entre 1 e {MAX_CONTACTS} contatos para enviar a mensagem ativa
                    </div>
                  </>
                ) : (
                  <ul className="dk-active-selected">
                    {destinos.map((d, i) => (
                      <li key={(d.contactId ?? d.telefone ?? '') + i}>
                        <Avatar tamanho={32} />
                        <span>
                          <b>{d.nome ?? 'Desconhecido'}</b>
                          <small>{d.telefone ? telefoneInternacional(d.telefone) : ''}</small>
                        </span>
                        <button
                          type="button"
                          className="dk-botao-icone dk-pequeno"
                          aria-label="Remover contato"
                          onClick={() => setDestinos(destinos.filter((_, j) => j !== i))}
                        >
                          <IconeDesk nome="fechar" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </aside>
          </div>
          <div className="dk-active-foot">
            <button
              type="button"
              className="dk-botao dk-botao-secundario dk-botao-curto"
              onClick={() => navegar('/')}
            >
              Cancelar
            </button>
            <button
              type="button"
              className="dk-botao dk-botao-curto"
              disabled={destinos.length === 0 || !channelId}
              onClick={() => setPasso(2)}
            >
              Continuar
            </button>
          </div>
        </>
      ) : null}

      {passo === 2 ? (
        <>
          <div className="dk-active-body">
            <div className="dk-active-form">
              <h3>Escolher modelo</h3>
              <p>Modelos de mensagem aprovados para o chatbot {channel?.name ?? ''}.</p>
              {(channel?.templates ?? []).length === 0 ? (
                <p>Nenhum modelo de mensagem aprovado para este chatbot.</p>
              ) : (
                <ul className="dk-active-templates">
                  {channel?.templates.map((t) => (
                    <li key={t.id}>
                      <label>
                        <input
                          type="radio"
                          name="modelo"
                          checked={templateId === t.id}
                          onChange={() => setTemplateId(t.id)}
                        />
                        <span>
                          <b>{t.nome}</b>
                          <small>{t.categoria}</small>
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
              )}
              {variables.map((v, i) => (
                <label key={v} className="dk-campo-flutuante">
                  <span>{v}</span>
                  <input
                    type="text"
                    value={templateParameters[i] ?? ''}
                    onChange={(e) => {
                      const novo = [...templateParameters];
                      novo[i] = e.target.value;
                      templateSetParameters(novo);
                    }}
                  />
                </label>
              ))}
            </div>
            <aside className="dk-active-side">
              <div className="dk-active-side-top">
                <span>Pré-visualização</span>
              </div>
              <div
                className="dk-active-side-body"
                style={{ alignItems: 'stretch', textAlign: 'left' }}
              >
                <div
                  className="dk-balao"
                  style={{ float: 'none', maxWidth: '100%', whiteSpace: 'pre-line' }}
                >
                  {template
                    ? aplicarParametros(template.corpo, templateParameters)
                    : 'Escolha um modelo para ver a mensagem.'}
                </div>
              </div>
            </aside>
          </div>
          <div className="dk-active-foot">
            <button
              type="button"
              className="dk-botao dk-botao-secundario dk-botao-curto"
              onClick={() => setPasso(1)}
            >
              Voltar
            </button>
            <button
              type="button"
              className="dk-botao dk-botao-curto"
              disabled={!template}
              onClick={() => setPasso(3)}
            >
              Continuar
            </button>
          </div>
        </>
      ) : null}

      {passo === 3 ? (
        <>
          <div className="dk-active-body">
            <div className="dk-active-form">
              <h3>Dados da Mensagem Ativa</h3>
              <div className="dk-campo-flutuante">
                <span>Chatbot</span>
                <b>{channel?.name}</b>
              </div>
              <div className="dk-campo-flutuante">
                <span>Modelo de mensagem</span>
                <b>{template?.nome}</b>
              </div>
              <div className="dk-campo-flutuante">
                <span>Destinatário</span>
                <b>{destinos.length} contato(s)</b>
              </div>
              {resultado ? (
                <p>
                  {resultado.enviadas} enviada(s), {resultado.recusadas} recusada(s).
                </p>
              ) : null}
              {error ? <p className="dk-error">{error}</p> : null}
            </div>
            <aside className="dk-active-side">
              <div className="dk-active-side-top">
                <span>Pré-visualização</span>
              </div>
              <div
                className="dk-active-side-body"
                style={{ alignItems: 'stretch', textAlign: 'left' }}
              >
                <div
                  className="dk-balao"
                  style={{ float: 'none', maxWidth: '100%', whiteSpace: 'pre-line' }}
                >
                  {template ? aplicarParametros(template.corpo, templateParameters) : ''}
                </div>
              </div>
            </aside>
          </div>
          <div className="dk-active-foot">
            <button
              type="button"
              className="dk-botao dk-botao-secundario dk-botao-curto"
              onClick={() => setPasso(2)}
            >
              Voltar
            </button>
            {resultado ? (
              <button
                type="button"
                className="dk-botao dk-botao-curto"
                onClick={() => navegar('/')}
              >
                Atendimento
              </button>
            ) : (
              <button
                type="button"
                className="dk-botao dk-botao-curto"
                disabled={enviando}
                onClick={() => void enviar()}
              >
                {enviando ? 'Enviando...' : 'Enviar'}
              </button>
            )}
          </div>
        </>
      ) : null}
    </div>
  );
}
