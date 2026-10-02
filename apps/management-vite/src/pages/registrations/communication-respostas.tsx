import { useRef, useState } from 'react';
import { Botao, BotaoDeIcone, Campo, Carregando, Etiqueta } from '@pipe/ui';
import { Modal, ConfirmModal } from '@pipe/ui/modal';
import { Pagination, usePage } from '@pipe/ui/pagination';
import { Toasts } from '@pipe/ui/toast';
import { dismissToast, pushToast, type Toast, type ToastInput } from '@pipe/ui/toast-queue';
import { useRead } from '../../lib/query';
import {
  agruparPorCategoria,
  motivoDoNomeDeCategoria,
  LIMITES_RESPOSTA,
  type RespostaProntaListada,
} from '../../lib/communication';
import {
  excluirCategoriaDeRespostas,
  excluirRespostaPronta,
  renomearCategoriaDeRespostas,
} from '../../lib/communication-gravar';
import { AVISO_EM_BREVE, CartaoResposta } from './communication-respostas-formulario';

/** Os 14 tipos do menu da Blip, na ordem dela; só o texto grava hoje (a tabela guarda atalho, título e texto). */
const TIPOS_DE_RESPOSTA = [
  'Texto', 'Quick reply', 'Menu', 'Carrossel', 'Imagem', 'Figurinha', 'Áudio',
  'Vídeo', 'Documento', 'Pedir localização', 'Enviar localização', 'Web link',
  'Solicitar ligação', 'Conteúdo dinâmico',
] as const;

type Alvo = { nome: string | null };

/**
 * Respostas prontas. A lista mostra CATEGORIAS (cartões, paginação); abrir uma categoria mostra as
 * respostas dela na mesma URL, e cada resposta grava na hora, como na Blip. Não há tabela de
 * categorias: uma categoria existe enquanto tiver resposta; uma nova, ainda vazia, só vive nesta tela
 * até receber a primeira resposta.
 */
export function PageCannedResponses() {
  const read = useRead<RespostaProntaListada[]>('/v1/management/communication/responses-ready');
  const [aberta, setAberta] = useState<Alvo | null>(null);
  const [rascunhos, setRascunhos] = useState<string[]>([]);
  const [modalCriar, setModalCriar] = useState(false);
  const [nomeNovo, setNomeNovo] = useState('');
  const [categoriaParaExcluir, setCategoriaParaExcluir] = useState<Alvo | null>(null);
  const [respostaParaExcluir, setRespostaParaExcluir] = useState<RespostaProntaListada | null>(null);
  const [erroExclusao, setErroExclusao] = useState<string | null>(null);
  const [excluindo, setExcluindo] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toast = (input: ToastInput) => setToasts((prev) => pushToast(prev, input, Date.now()));

  const respostas = read.data ?? [];
  const reais = agruparPorCategoria(respostas);
  const categorias = [
    ...reais,
    ...rascunhos.filter((r) => !reais.some((c) => c.nome === r)).map((nome) => ({ nome, respostas: [] })),
  ];
  const pagina = usePage(categorias, 5);

  if (read.isError) return <Etiqueta tom="erro">Não foi possível carregar as respostas prontas.</Etiqueta>;
  if (!read.data) return <Carregando />;

  const nomes = categorias.map((c) => c.nome);
  const motivoNovo = motivoDoNomeDeCategoria(nomeNovo, nomes);

  function avisoDeGravacao(erro: string | null) {
    if (erro) toast({ tom: 'perigo', texto: erro });
    else toast({ tom: 'sucesso', texto: 'Categoria salva com sucesso!' });
  }

  function criarCategoria() {
    if (motivoNovo) return;
    const nome = nomeNovo.trim();
    setRascunhos((r) => [...r, nome]);
    setModalCriar(false);
    setNomeNovo('');
    setAberta({ nome });
  }

  async function confirmarExclusao() {
    setExcluindo(true);
    setErroExclusao(null);
    if (respostaParaExcluir) {
      const r = await excluirRespostaPronta(respostaParaExcluir.id);
      setExcluindo(false);
      if (!r.ok) return setErroExclusao(r.error);
      setRespostaParaExcluir(null);
      avisoDeGravacao(null);
      return;
    }
    const alvo = categoriaParaExcluir;
    if (!alvo) return;
    const temRespostas = reais.some((c) => c.nome === alvo.nome);
    const r = alvo.nome !== null && temRespostas ? await excluirCategoriaDeRespostas(alvo.nome) : { ok: true as const };
    setExcluindo(false);
    if (!r.ok) return setErroExclusao(r.error);
    setRascunhos((lista) => lista.filter((n) => n !== alvo.nome));
    setCategoriaParaExcluir(null);
    setAberta(null);
  }

  const confirmacao = (
    <ConfirmModal
      aberto={respostaParaExcluir !== null || categoriaParaExcluir !== null}
      titulo={respostaParaExcluir ? 'Excluir resposta' : 'Excluir categoria'}
      message={
        respostaParaExcluir
          ? 'Tem certeza que deseja excluir essa resposta?'
          : `Tem certeza que deseja excluir a categoria "${categoriaParaExcluir?.nome ?? 'Sem categoria'}" e as respostas dela?`
      }
      error={erroExclusao}
      confirmando={excluindo}
      onConfirmar={() => void confirmarExclusao()}
      onCancelar={() => {
        setRespostaParaExcluir(null);
        setCategoriaParaExcluir(null);
        setErroExclusao(null);
      }}
    />
  );
  const avisos = (
    <Toasts
      toasts={toasts}
      onFechar={(id) => setToasts((prev) => dismissToast(prev, id))}
      onPausar={() => {}}
      onRetomar={() => {}}
    />
  );

  if (aberta) {
    const atual = categorias.find((c) => c.nome === aberta.nome);
    return (
      <>
        <DetalheDaCategoria
          nome={aberta.nome}
          respostas={atual?.respostas ?? []}
          nomes={nomes}
          aoVoltar={() => setAberta(null)}
          aoRenomear={(novo) => {
            setRascunhos((l) => l.map((n) => (n === aberta.nome ? novo : n)));
            setAberta({ nome: novo });
          }}
          aoExcluirResposta={(r) => setRespostaParaExcluir(r)}
          aoSalvar={avisoDeGravacao}
          toast={toast}
        />
        {confirmacao}
        {avisos}
      </>
    );
  }

  return (
    <>
      <div className="board-head">
        <h2>Respostas prontas</h2>
        <Botao
          variante="primario"
          icone="mais"
          className="board-acao"
          onClick={() => {
            setNomeNovo('');
            setModalCriar(true);
          }}
        >
          Criar categoria
        </Botao>
      </div>

      {categorias.length === 0 ? (
        <div className="empty">
          <strong>Você ainda não criou respostas prontas</strong>
          <p className="sub">Crie respostas para agilizar seus atendimentos</p>
        </div>
      ) : (
        pagina.visiveis.map((c) => (
          <div key={c.nome ?? '__sem_categoria__'} className="resp-cartao resp-cartao--categoria">
            <button type="button" className="resp-cartao-nome" onClick={() => setAberta({ nome: c.nome })}>
              <span className="sub">Categoria</span>
              <strong>{c.nome ?? 'Sem categoria'}</strong>
            </button>
            <BotaoDeIcone nome="lapis" rotulo="Editar" onClick={() => setAberta({ nome: c.nome })} />
            <BotaoDeIcone nome="lixeira" rotulo="Excluir" onClick={() => setCategoriaParaExcluir({ nome: c.nome })} />
          </div>
        ))
      )}
      <Pagination layout="grade" state={pagina} afastado />

      <Modal aberto={modalCriar} titulo="Criar nova categoria" onFechar={() => setModalCriar(false)}>
        <p className="sub">Dê um nome para essa categoria de respostas prontas</p>
        <Campo
          aria-label="Nome da categoria"
          placeholder="Nome da categoria"
          value={nomeNovo}
          maxLength={LIMITES_RESPOSTA.categoria}
          autoFocus
          onChange={(e) => setNomeNovo(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') criarCategoria();
          }}
        />
        {nomeNovo && motivoNovo ? <Etiqueta tom="erro">{motivoNovo}</Etiqueta> : null}
        <div className="cl-actions">
          <Botao onClick={() => setModalCriar(false)}>Cancelar</Botao>
          <Botao variante="primario" disabled={motivoNovo !== null} onClick={criarCategoria}>
            Salvar
          </Botao>
        </div>
      </Modal>
      {confirmacao}
      {avisos}
    </>
  );
}

function DetalheDaCategoria({
  nome,
  respostas,
  nomes,
  aoVoltar,
  aoRenomear,
  aoExcluirResposta,
  aoSalvar,
  toast,
}: {
  nome: string | null;
  respostas: RespostaProntaListada[];
  nomes: (string | null)[];
  aoVoltar: () => void;
  aoRenomear: (novo: string) => void;
  aoExcluirResposta: (r: RespostaProntaListada) => void;
  aoSalvar: (erro: string | null) => void;
  toast: (t: ToastInput) => void;
}) {
  const [renomeando, setRenomeando] = useState(false);
  const [rotulo, setRotulo] = useState(nome ?? '');
  const [erroNome, setErroNome] = useState<string | null>(null);
  const [menu, setMenu] = useState(false);
  const [novas, setNovas] = useState<number[]>([]);
  const proxima = useRef(0);
  const existente = respostas.length > 0;

  async function salvarNome() {
    const novo = rotulo.trim();
    if (!nome || novo === nome) {
      setRenomeando(false);
      setErroNome(null);
      return;
    }
    const motivo = motivoDoNomeDeCategoria(novo, nomes, nome);
    if (motivo) return setErroNome(motivo);
    if (existente) {
      const r = await renomearCategoriaDeRespostas(nome, novo);
      if (!r.ok) return setErroNome(r.error);
      toast({ tom: 'sucesso', texto: 'Categoria salva com sucesso!' });
    }
    setRenomeando(false);
    setErroNome(null);
    aoRenomear(novo);
  }

  return (
    <>
      <div className="board-head">
        <BotaoDeIcone nome="esquerda" rotulo="Voltar" onClick={aoVoltar} />
        {renomeando && nome ? (
          <>
            <Campo
              aria-label="Nome da categoria"
              value={rotulo}
              maxLength={LIMITES_RESPOSTA.categoria}
              autoFocus
              onChange={(e) => setRotulo(e.target.value)}
              onBlur={() => void salvarNome()}
              onKeyDown={(e) => {
                if (e.key === 'Enter') e.currentTarget.blur();
                if (e.key === 'Escape') {
                  setRotulo(nome);
                  setRenomeando(false);
                }
              }}
            />
          </>
        ) : (
          <>
            <h2>{nome ?? 'Sem categoria'}</h2>
            {nome ? <BotaoDeIcone nome="lapis" rotulo="Editar" onClick={() => setRenomeando(true)} /> : null}
          </>
        )}
        <div className="board-acao resp-menu">
          <Botao variante="primario" icone="mais" aria-expanded={menu} onClick={() => setMenu((v) => !v)}>
            Adicionar resposta
          </Botao>
          {menu ? (
            <div className="resp-menu-lista" role="menu">
              {TIPOS_DE_RESPOSTA.map((tipo) => {
                const disponivel = tipo === 'Texto';
                return (
                  <button
                    key={tipo}
                    type="button"
                    role="menuitem"
                    className="resp-menu-item"
                    disabled={!disponivel}
                    title={disponivel ? undefined : AVISO_EM_BREVE}
                    onClick={() => {
                      setNovas((l) => [...l, proxima.current++]);
                      setMenu(false);
                    }}
                  >
                    {tipo}
                  </button>
                );
              })}
            </div>
          ) : null}
        </div>
      </div>
      {erroNome ? <Etiqueta tom="erro">{erroNome}</Etiqueta> : null}

      {respostas.map((r) => (
        <CartaoResposta
          key={r.id}
          resposta={r}
          categoria={nome}
          aoSalvar={aoSalvar}
          aoExcluir={() => aoExcluirResposta(r)}
        />
      ))}
      {novas.map((chave) => (
        <CartaoResposta
          key={`nova-${chave}`}
          categoria={nome}
          aoSalvar={aoSalvar}
          aoCriar={() => setNovas((l) => l.filter((k) => k !== chave))}
          aoExcluir={() => setNovas((l) => l.filter((k) => k !== chave))}
        />
      ))}
      {respostas.length === 0 && novas.length === 0 ? (
        <div className="empty">
          <strong>Nenhuma resposta nesta categoria</strong>
          <p className="sub">Use "Adicionar resposta" para criar a primeira.</p>
        </div>
      ) : null}
    </>
  );
}
