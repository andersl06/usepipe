'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { IconePortal } from '../../../../../componentes/icones-portal';
import type { DadosDeGrowth, EnvioGrowth } from '../../../../../lib/growth';
import { filtrarEnvios, resumirEnvios } from '../regras';

type Aba = 'visao' | 'envios';
type Etapa = 1 | 2 | 3 | 4;

export function TelaDeMensagensAtivas({ dados }: { dados: DadosDeGrowth }) {
  const router = useRouter();
  const [atualizando, iniciarAtualizacao] = useTransition();
  const [aba, setAba] = useState<Aba>('visao');
  const [criar, setCriar] = useState(false);
  const [direto, setDireto] = useState(false);
  const [etapa, setEtapa] = useState<Etapa>(1);
  const [canalId, setCanalId] = useState(dados.canais[0]?.id ?? '');
  const [categoria, setCategoria] = useState('utilidade');
  const [modeloId, setModeloId] = useState('');
  const [nome, setNome] = useState('');
  const [tipoAudiencia, setTipoAudiencia] = useState<'massa' | 'individual'>('massa');
  const [contatoId, setContatoId] = useState('');
  const [arquivo, setArquivo] = useState('');
  const [quantidadeArquivo, setQuantidadeArquivo] = useState(0);
  const [aviso, setAviso] = useState('');
  const [busca, setBusca] = useState('');
  const [estado, setEstado] = useState('todos');

  const modelosAprovados = dados.modelos.filter(
    (modelo) =>
      modelo.canalId === canalId &&
      modelo.categoria === categoria &&
      modelo.statusMeta === 'aprovado',
  );
  const modeloSelecionado = dados.modelos.find((modelo) => modelo.id === modeloId);
  const envios = useMemo(
    () => filtrarEnvios(dados.envios, busca, estado),
    [dados.envios, busca, estado],
  );
  const resumo = useMemo(() => resumirEnvios(dados.envios), [dados.envios]);

  function abrirCriacao() {
    setDireto(false);
    setCriar(true);
    setEtapa(1);
    setAviso('');
  }

  function abrirEnvioDireto() {
    setCriar(false);
    setDireto(true);
    setAviso('');
  }

  async function lerArquivo(file?: File) {
    if (!file) return;
    const texto = await file.text();
    const linhas = texto.split(/\r?\n/).filter((linha) => linha.trim());
    setArquivo(file.name);
    setQuantidadeArquivo(Math.max(linhas.length - 1, 0));
  }

  function avancar() {
    if (etapa === 1 && !canalId) return setAviso('Selecione um canal.');
    if (etapa === 2 && !modeloId) return setAviso('Selecione um modelo aprovado.');
    if (etapa === 3 && tipoAudiencia === 'massa' && !arquivo) {
      return setAviso('Selecione o arquivo da audiência.');
    }
    if (etapa === 3 && tipoAudiencia === 'individual' && !contatoId) {
      return setAviso('Selecione um contato.');
    }
    setAviso('');
    setEtapa((atual) => Math.min(atual + 1, 4) as Etapa);
  }

  return (
    <div className="gr-container">
      <header className="gr-cabeca">
        <div>
          <h1>Resumo dos envios de mensagens</h1>
          <p>Monitore o envio de mensagens ativas dos canais para sua audiência.</p>
        </div>
        <button
          className="gr-botao"
          type="button"
          disabled={atualizando}
          onClick={() => iniciarAtualizacao(() => router.refresh())}
        >
          <IconePortal nome="atualizar" tamanho={20} />
          Atualizar
        </button>
      </header>

      <nav className="gr-abas" aria-label="Visões de mensagens ativas">
        <button
          type="button"
          className={aba === 'visao' ? 'ativa' : ''}
          aria-current={aba === 'visao' ? 'page' : undefined}
          onClick={() => setAba('visao')}
        >
          Visão Geral
        </button>
        <button
          type="button"
          className={aba === 'envios' ? 'ativa' : ''}
          aria-current={aba === 'envios' ? 'page' : undefined}
          onClick={() => setAba('envios')}
        >
          Status das mensagens
        </button>
      </nav>

      <section className="gr-filtros">
        <label>
          Nome do modelo
          <input
            type="search"
            placeholder="Digite o nome do modelo"
            value={busca}
            onChange={(evento) => setBusca(evento.target.value)}
          />
        </label>
        <label>
          Status das mensagens
          <select value={estado} onChange={(evento) => setEstado(evento.target.value)}>
            <option value="todos">Todos</option>
            <option value="pendente">Aguardando envio</option>
            <option value="enviando">Enviando</option>
            <option value="enviada">Enviadas</option>
            <option value="entregue">Recebidas</option>
            <option value="lida">Lidas</option>
            <option value="falhou">Falharam</option>
          </select>
        </label>
      </section>

      <div className="gr-acoes">
        <button className="gr-botao gr-botao-primario" type="button" onClick={abrirCriacao}>
          <IconePortal nome="megafone" tamanho={20} />
          Enviar mensagens ativas
        </button>
        <button className="gr-botao" type="button" onClick={abrirEnvioDireto}>
          [Beta] Envio direto
        </button>
      </div>

      {aba === 'visao' ? <Resumo resumo={resumo} /> : null}
      <ListaDeEnvios envios={envios} />

      {criar ? (
        <div
          className="gr-sobreposicao"
          role="presentation"
          onMouseDown={(e) => e.target === e.currentTarget && setCriar(false)}
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
                onClick={() => setCriar(false)}
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
                  {dados.canais.length ? (
                    dados.canais.map((canal) => (
                      <label className="gr-escolha" key={canal.id}>
                        <input
                          type="radio"
                          name="canal"
                          checked={canalId === canal.id}
                          onChange={() => setCanalId(canal.id)}
                        />
                        <span>{canal.nome}</span>
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
                    <select
                      value={categoria}
                      onChange={(evento) => {
                        setCategoria(evento.target.value);
                        setModeloId('');
                      }}
                    >
                      <option value="utilidade">Utilidade</option>
                      <option value="marketing">Marketing</option>
                      <option value="autenticacao">Autenticação</option>
                    </select>
                  </label>
                  <label>
                    Modelo
                    <select
                      value={modeloId}
                      onChange={(evento) => setModeloId(evento.target.value)}
                    >
                      <option value="">Selecione um modelo aprovado</option>
                      {modelosAprovados.map((modelo) => (
                        <option value={modelo.id} key={modelo.id}>
                          {modelo.nome} · {modelo.idioma}
                        </option>
                      ))}
                    </select>
                  </label>
                  {modelosAprovados.length === 0 ? <p>Nenhum modelo aprovado encontrado.</p> : null}
                  {modeloSelecionado ? (
                    <div className="gr-previa">
                      <span>Prévia</span>
                      <p>{modeloSelecionado.corpo}</p>
                    </div>
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
                    <label className="gr-arquivo">
                      Arraste e solte seus arquivos aqui ou clique para fazer upload do arquivo.
                      <input
                        type="file"
                        accept=".csv,text/csv"
                        onChange={(evento) => void lerArquivo(evento.target.files?.[0])}
                      />
                      {arquivo ? (
                        <span>
                          {arquivo} · {quantidadeArquivo} contatos
                        </span>
                      ) : null}
                    </label>
                  ) : (
                    <label>
                      Contato
                      <select
                        value={contatoId}
                        onChange={(evento) => setContatoId(evento.target.value)}
                      >
                        <option value="">Selecione um contato</option>
                        {dados.contatos.map((contato) => (
                          <option key={contato.id} value={contato.id}>
                            {contato.nome ?? contato.telefone} · {contato.telefone}
                          </option>
                        ))}
                      </select>
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
                    <dd>{modeloSelecionado?.nome ?? '—'}</dd>
                    <dt>Categoria do modelo:</dt>
                    <dd>{categoria}</dd>
                    <dt>Tipo de envio:</dt>
                    <dd>{tipoAudiencia === 'massa' ? 'Em massa' : 'Individual'}</dd>
                    <dt>Audiência:</dt>
                    <dd>
                      {tipoAudiencia === 'massa'
                        ? `${quantidadeArquivo} contatos · ${arquivo || 'sem arquivo'}`
                        : (dados.contatos.find((item) => item.id === contatoId)?.nome ??
                          '1 contato')}
                    </dd>
                  </dl>
                  <p>
                    Verifique se está tudo certo com suas configurações antes de realizar o envio.
                  </p>
                </div>
              ) : null}
              {aviso ? (
                <p className="gr-aviso" role="alert">
                  {aviso}
                </p>
              ) : null}
            </div>
            <footer className="gr-modal-acoes">
              {etapa > 1 ? (
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
              ) : (
                <button
                  className="gr-botao gr-botao-primario"
                  type="button"
                  onClick={() => setAviso('Envio ainda não disponível.')}
                >
                  Enviar agora
                </button>
              )}
            </footer>
          </section>
        </div>
      ) : null}

      {direto ? <EnvioDireto fechar={() => setDireto(false)} /> : null}
    </div>
  );
}

function Resumo({ resumo }: { resumo: ReturnType<typeof resumirEnvios> }) {
  return (
    <section className="gr-resumo" aria-label="Visão Geral">
      <h2>Visão Geral</h2>
      <p>Acompanhe as principais métricas das mensagens ativas no período escolhido.</p>
      <div className="gr-metricas">
        <Metrica titulo="Audiência" valor={resumo.audiencia} />
        <Metrica titulo="Recebidas" valor={resumo.recebidas} />
        <Metrica titulo="Lidas" valor={resumo.lidas} />
        <Metrica titulo="Falharam" valor={resumo.falharam} />
      </div>
    </section>
  );
}

function Metrica({ titulo, valor }: { titulo: string; valor: number }) {
  return (
    <article className="gr-metrica">
      <span>{titulo}</span>
      <strong>{valor.toLocaleString('pt-BR')}</strong>
    </article>
  );
}

function ListaDeEnvios({ envios }: { envios: EnvioGrowth[] }) {
  return (
    <section className="gr-lista">
      <h2>Dados de envio</h2>
      {envios.length ? (
        <div className="gr-tabela-rolagem">
          <table>
            <thead>
              <tr>
                <th>Nome da mensagem</th>
                <th>Contato</th>
                <th>Canal</th>
                <th>Data de envio</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {envios.map((envio) => (
                <tr key={envio.id}>
                  <td>{envio.templateNome ?? '—'}</td>
                  <td>{envio.contatoNome ?? '—'}</td>
                  <td>{envio.canalNome}</td>
                  <td>{new Date(envio.criadaEm).toLocaleString('pt-BR')}</td>
                  <td>
                    <span className={`gr-status gr-status--${envio.estado ?? 'pendente'}`}>
                      {rotuloEstado(envio.estado)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="gr-vazio">
          <IconePortal nome="megafone" tamanho={40} />
          <h3>Nenhuma mensagem ativa encontrada.</h3>
        </div>
      )}
    </section>
  );
}

function EnvioDireto({ fechar }: { fechar: () => void }) {
  const [amostra, setAmostra] = useState('');
  const [aviso, setAviso] = useState('');
  return (
    <div
      className="gr-sobreposicao"
      role="presentation"
      onMouseDown={(e) => e.target === e.currentTarget && fechar()}
    >
      <section
        className="gr-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="gr-direto-titulo"
      >
        <header className="gr-modal-cabeca">
          <div>
            <h2 id="gr-direto-titulo">Envio direto</h2>
            <p>Mensagens de Envio direto para modelos de Utilidade</p>
          </div>
          <button className="gr-icone-botao" type="button" aria-label="Fechar" onClick={fechar}>
            <IconePortal nome="fechar" tamanho={20} />
          </button>
        </header>
        <p>
          Simplifique sua operação com o envio de mensagens de Utilidade sem a necessidade de criar
          ou aprovar templates manualmente.
        </p>
        <p>
          Para ativar a funcionalidade, envie amostras de mensagens de Utilidade para verificação de
          elegibilidade.
        </p>
        <label>
          Amostra de modelo
          <textarea
            value={amostra}
            onChange={(evento) => setAmostra(evento.target.value)}
            placeholder="Digite sua mensagem de exemplo aqui"
          />
        </label>
        {aviso ? (
          <p className="gr-aviso" role="alert">
            {aviso}
          </p>
        ) : null}
        <footer className="gr-modal-acoes">
          <button className="gr-botao" type="button" onClick={fechar}>
            Cancelar
          </button>
          <button
            className="gr-botao gr-botao-primario"
            type="button"
            onClick={() => setAviso('Envio de amostras ainda não disponível.')}
          >
            Enviar amostras
          </button>
        </footer>
      </section>
    </div>
  );
}

function rotuloEstado(valor: string | null): string {
  const rotulos: Record<string, string> = {
    pendente: 'Aguardando envio',
    enviando: 'Enviando',
    enviada: 'Enviada',
    entregue: 'Recebida',
    lida: 'Lida',
    falhou: 'Falhou',
  };
  return valor ? (rotulos[valor] ?? valor) : 'Sem status';
}
