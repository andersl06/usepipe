import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import type { TemplateAprovado, TipoCanalBanco } from '@pipe/contracts';
import { useLeitura } from '../../lib/consulta';
import { api } from '../../lib/api';
import { atualizarLeituras } from '../../lib/acoes';
import { IconeDesk } from '../../componentes/icones-desk';
import { Avatar } from '../../componentes/avatar';
import { nomeDeExibicao, telefoneInternacional } from '../../lib/ordem';
import type { ContatoDaLista } from '../../lib/contatos';
import { aplicarParametros } from '../../lib/modelo';

/**
 * "Enviar mensagem ativa" — `/activeMessage/send`, o stepper 1-2-3 da
 * referência (`~/desk-clone/clone/index.html`, seção `active-msg`, foto
 * `desk2/blip-clone-active.png`): cabeçalho com seta, título e "Ajuda na
 * busca"; os três passos "Selecionar contato", "Escolher modelo", "Revisar
 * conteúdo"; o aviso de privacidade; o formulário à esquerda ("Selecionar
 * contato existente" / "Adicionar novo contato", "Novo contato", os campos
 * "Adicionar contato por", "Salvar contato no chatbot", "Telefone", "Nome do
 * contato" e "Adicionar") e o painel "Contatos selecionados 0/15" à direita;
 * "Cancelar" / "Continuar" embaixo. Os textos são os do MFE
 * `desk-active-message` (`docs/pesquisa/blip-desk-vocabulario.md`).
 *
 * O envio vai para `POST /v1/mensagens-ativas` (canal, modelo, contatos), que
 * já existe na `api`; "chatbot" da referência é o nosso canal.
 */
const MAX_CONTATOS = 15;

interface Canal {
  id: string;
  nome: string;
  tipo: TipoCanalBanco;
  templates: TemplateAprovado[];
}

interface Destino {
  contatoId: string | null;
  telefone: string | null;
  nome: string | null;
}

export function PaginaMensagemAtiva() {
  const navegar = useNavigate();
  const [parametros] = useSearchParams();
  const [passo, setPasso] = useState<1 | 2 | 3>(1);
  const [origem, setOrigem] = useState<'existente' | 'novo'>(
    parametros.get('contato') ? 'existente' : 'novo',
  );
  const [canalId, setCanalId] = useState('');
  const [telefone, setTelefone] = useState('');
  const [nome, setNome] = useState('');
  const [busca, setBusca] = useState('');
  const [destinos, setDestinos] = useState<Destino[]>([]);
  const [templateId, setTemplateId] = useState('');
  const [parametrosDoModelo, setParametrosDoModelo] = useState<string[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState<{ enviadas: number; recusadas: number } | null>(null);

  const canais = useLeitura<{ canais: Canal[] }>('/v1/desk/canais');
  const contatos = useLeitura<{ contatos: ContatoDaLista[] }>(
    origem === 'existente'
      ? `/v1/desk/contatos${busca.trim().length >= 2 ? `?busca=${encodeURIComponent(busca.trim())}` : ''}`
      : null,
  );
  const contatoInicial = useLeitura<{
    contato: { id: string; nome: string | null; telefone: string | null };
  }>(parametros.get('contato') ? `/v1/desk/contatos/${parametros.get('contato')}` : null);
  /* Vindo de "Conversar novamente" (Contatos), o contato já entra selecionado. */
  useEffect(() => {
    const c = contatoInicial.data?.contato;
    if (c)
      setDestinos((atual) =>
        atual.length === 0 ? [{ contatoId: c.id, telefone: c.telefone, nome: c.nome }] : atual,
      );
  }, [contatoInicial.data]);

  const canal = canais.data?.canais.find((c) => c.id === canalId) ?? null;
  const template = canal?.templates.find((t) => t.id === templateId) ?? null;
  const variaveis = Array.isArray(template?.variaveis) ? (template.variaveis as string[]) : [];

  function adicionarNovo() {
    const t = telefone.replace(/\D/g, '');
    if (t.length < 10) return setErro('Informe o identificador completo');
    if (destinos.length >= MAX_CONTATOS)
      return setErro(`Selecione entre 1 e ${MAX_CONTATOS} contatos`);
    setDestinos([
      ...destinos,
      { contatoId: null, telefone: '+55' + t.replace(/^55/, ''), nome: nome.trim() || null },
    ]);
    setTelefone('');
    setNome('');
    setErro(null);
  }

  function alternarExistente(c: ContatoDaLista) {
    const ja = destinos.some((d) => d.contatoId === c.id);
    if (ja) setDestinos(destinos.filter((d) => d.contatoId !== c.id));
    else if (destinos.length < MAX_CONTATOS)
      setDestinos([...destinos, { contatoId: c.id, telefone: c.telefone, nome: c.nome }]);
  }

  async function enviar() {
    if (!canal || !template) return;
    setEnviando(true);
    setErro(null);
    try {
      const r = await api.post<{ enviadas: number; recusadas: number }>('/v1/mensagens-ativas', {
        canal_id: canal.id,
        template_id: template.id,
        parametros: variaveis.map((_, i) => parametrosDoModelo[i] ?? ''),
        contatos: destinos.map((d) => ({
          contato_id: d.contatoId,
          telefone: d.telefone,
          nome: d.nome,
        })),
      });
      setResultado(r);
      atualizarLeituras();
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro ao enviar mensagem ativa');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="dk-ativa">
      <div className="dk-ativa-topo">
        <button
          type="button"
          className="dk-botao-icone dk-pequeno"
          aria-label="Voltar"
          onClick={() => navegar('/')}
        >
          <IconeDesk nome="seta-esquerda" />
        </button>
        <h2>Enviar mensagem ativa</h2>
        <div className="dk-metricas-atualizar">
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
          <div className="dk-ativa-corpo">
            <div className="dk-ativa-form">
              <div className="dk-ativa-radios">
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
                    <select value={canalId} onChange={(e) => setCanalId(e.target.value)}>
                      <option value="">Selecionar chatbot</option>
                      {canais.data?.canais.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.nome}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="dk-ativa-ajuda">
                    Para alterar o chatbot, é necessário limpar a seleção de contatos atual
                  </div>
                  <label className="dk-campo-flutuante">
                    <span>Telefone</span>
                    <span className="dk-ativa-telefone">
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
                    <select value={canalId} onChange={(e) => setCanalId(e.target.value)}>
                      <option value="">Selecionar chatbot</option>
                      {canais.data?.canais.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.nome}
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
                      value={busca}
                      onChange={(e) => setBusca(e.target.value)}
                    />
                  </label>
                  <ul className="dk-ativa-contatos">
                    {contatos.data?.contatos.slice(0, 20).map((c) => (
                      <li key={c.id}>
                        <label>
                          <input
                            type="checkbox"
                            checked={destinos.some((d) => d.contatoId === c.id)}
                            onChange={() => alternarExistente(c)}
                          />
                          <Avatar tamanho={32} />
                          <span>
                            <b>
                              {nomeDeExibicao({
                                contatoNome: c.nome,
                                contatoTelefone: c.telefone,
                                contatoEmail: c.email,
                                contatoId: c.id,
                              })}
                            </b>
                            <small>
                              {c.telefone ? telefoneInternacional(c.telefone) : c.email}
                            </small>
                          </span>
                        </label>
                      </li>
                    ))}
                  </ul>
                </>
              )}
              {erro ? <p className="dk-erro">{erro}</p> : null}
            </div>
            <aside className="dk-ativa-lado">
              <div className="dk-ativa-lado-topo">
                <span>
                  Contatos selecionados {destinos.length}/{MAX_CONTATOS}
                </span>
                <button type="button" className="dk-ativa-limpar" onClick={() => setDestinos([])}>
                  Limpar seleção
                </button>
              </div>
              <div className="dk-ativa-lado-corpo">
                {destinos.length === 0 ? (
                  <>
                    <div className="dk-ativa-caixa" />
                    <div>
                      Selecione entre 1 e {MAX_CONTATOS} contatos para enviar a mensagem ativa
                    </div>
                  </>
                ) : (
                  <ul className="dk-ativa-selecionados">
                    {destinos.map((d, i) => (
                      <li key={(d.contatoId ?? d.telefone ?? '') + i}>
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
          <div className="dk-ativa-pe">
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
              disabled={destinos.length === 0 || !canalId}
              onClick={() => setPasso(2)}
            >
              Continuar
            </button>
          </div>
        </>
      ) : null}

      {passo === 2 ? (
        <>
          <div className="dk-ativa-corpo">
            <div className="dk-ativa-form">
              <h3>Escolher modelo</h3>
              <p>Modelos de mensagem aprovados para o chatbot {canal?.nome ?? ''}.</p>
              {(canal?.templates ?? []).length === 0 ? (
                <p>Nenhum modelo de mensagem aprovado para este chatbot.</p>
              ) : (
                <ul className="dk-ativa-modelos">
                  {canal?.templates.map((t) => (
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
              {variaveis.map((v, i) => (
                <label key={v} className="dk-campo-flutuante">
                  <span>{v}</span>
                  <input
                    type="text"
                    value={parametrosDoModelo[i] ?? ''}
                    onChange={(e) => {
                      const novo = [...parametrosDoModelo];
                      novo[i] = e.target.value;
                      setParametrosDoModelo(novo);
                    }}
                  />
                </label>
              ))}
            </div>
            <aside className="dk-ativa-lado">
              <div className="dk-ativa-lado-topo">
                <span>Pré-visualização</span>
              </div>
              <div
                className="dk-ativa-lado-corpo"
                style={{ alignItems: 'stretch', textAlign: 'left' }}
              >
                <div
                  className="dk-balao"
                  style={{ float: 'none', maxWidth: '100%', whiteSpace: 'pre-line' }}
                >
                  {template
                    ? aplicarParametros(template.corpo, parametrosDoModelo)
                    : 'Escolha um modelo para ver a mensagem.'}
                </div>
              </div>
            </aside>
          </div>
          <div className="dk-ativa-pe">
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
          <div className="dk-ativa-corpo">
            <div className="dk-ativa-form">
              <h3>Dados da Mensagem Ativa</h3>
              <div className="dk-campo-flutuante">
                <span>Chatbot</span>
                <b>{canal?.nome}</b>
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
              {erro ? <p className="dk-erro">{erro}</p> : null}
            </div>
            <aside className="dk-ativa-lado">
              <div className="dk-ativa-lado-topo">
                <span>Pré-visualização</span>
              </div>
              <div
                className="dk-ativa-lado-corpo"
                style={{ alignItems: 'stretch', textAlign: 'left' }}
              >
                <div
                  className="dk-balao"
                  style={{ float: 'none', maxWidth: '100%', whiteSpace: 'pre-line' }}
                >
                  {template ? aplicarParametros(template.corpo, parametrosDoModelo) : ''}
                </div>
              </div>
            </aside>
          </div>
          <div className="dk-ativa-pe">
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
