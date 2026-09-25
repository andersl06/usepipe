import { useState } from 'react';
import { Botao, BotaoDeIcone, Etiqueta } from '@pipe/ui';
import { useRead } from '../../lib/consulta';
import type { RespostaProntaListada } from '../../lib/comunicacao';
import { alternarRespostaPronta, excluirRespostaPronta } from '../../lib/comunicacao-gravar';
import { ListaRegras, type RulesSection } from '../../componentes/lista-regras';
import { FormularioRespostaPronta } from './comunicacao-respostas-formulario';
import { Modal, ModalConfirmation } from './_modal';

/** O switch + o "Excluir" do cartão-linha — `PATCH`/`DELETE` em `.../respostas-prontas/:id`. */
function RespostaActions({
  resposta,
  onErrorAlternar,
  onExcluir,
}: {
  resposta: RespostaProntaListada;
  onErrorAlternar: (error: string) => void;
  onExcluir: () => void;
}) {
  const alternar = async () => {
    const r = await alternarRespostaPronta(resposta.id, resposta.active);
    if (!r.ok) onErrorAlternar(r.error);
  };
  return (
    <>
      <button
        type="button"
        className="interruptor"
        role="switch"
        aria-checked={resposta.active}
        aria-label={
          resposta.active ? `Desativar a resposta ${resposta.titulo}` : `Ativar a resposta ${resposta.titulo}`
        }
        title={resposta.active ? 'Desativar esta resposta' : 'Ativar esta resposta'}
        onClick={() => void alternar()}
      >
        <span className="interruptor-bolinha" />
      </button>
      <BotaoDeIcone nome="x" rotulo={`Excluir a resposta ${resposta.titulo}`} onClick={onExcluir} />
    </>
  );
}

/**
 * Respostas prontas — as da empresa. As pessoais o atendente cria e organiza
 * sozinho no Desk (§5 de `docs/specs/2026-09-05-desk-requisitos.md`), então não
 * entram nesta tela de gestão.
 *
 * `FICHA-replies.md` foi capturada com a lista vazia — o material só confirma
 * cabeçalho com "Criar categoria" à direita (§2.1) e o texto do estado vazio
 * (§6); não há coluna nem linha com dado real para copiar. Um desalinhamento
 * de fundo que a ficha não resolve: a Blip organiza respostas em
 * CATEGORIAS (cria a categoria primeiro, a resposta mora dentro dela); o
 * nosso cadastro é uma lista achatada, sem categoria — mudar isso é desenho
 * de dado novo (tabela/API), fora do que esta tela sozinha decide. Por isso
 * o botão do cabeçalho aqui diz "Nova resposta pronta" (o que a tela faz de
 * verdade) e não "Criar categoria".
 *
 * Reaproveita `ListaRegras`, o mesmo cartão-de-lista com busca da tela de
 * Regras — o cartão já resolve busca, agrupamento e estado vazio sem
 * reescrever nada disso aqui.
 */
export function PageCannedResponses() {
  const [modalAberto, setModalAberto] = useState(false);
  const [respostaParaExcluir, setRespostaParaExcluir] = useState<RespostaProntaListada | null>(null);
  const [excluindo, setExcluindo] = useState(false);
  const [errorExclusao, setErrorExclusao] = useState<string | null>(null);
  const [errorAlternar, setErrorAlternar] = useState<string | null>(null);
  const read = useRead<RespostaProntaListada[]>('/v1/management/communication/responses-ready');
  if (!read.data) return null;
  const respostas = read.data;

  async function excluir() {
    if (!respostaParaExcluir) return;
    setExcluindo(true);
    setErrorExclusao(null);
    const resultado = await excluirRespostaPronta(respostaParaExcluir.id);
    setExcluindo(false);
    if (resultado.ok) setRespostaParaExcluir(null);
    else setErrorExclusao(resultado.error);
  }

  const sections: RulesSection[] = [
    {
      titulo: 'Respostas prontas',
      /* Texto literal do estado vazio deles — `FICHA-replies.md` §6, a única
         parte do material que não é sujeita ao desalinhamento de categorias
         descrito acima: o texto não fala de categoria nem de #, então copia
         sem ressalva. */
      empty: 'Você ainda não criou respostas prontas',
      emptyDescription: 'Crie respostas para agilizar seus atendimentos',
      cards: respostas.map((r) => ({
        id: r.id,
        campos: [
          { rotulo: 'Atalho', valor: `#${r.atalho}` },
          { rotulo: 'Título', valor: r.titulo },
          { rotulo: 'Fila / canal', valor: r.categoria ?? '—' },
          { rotulo: 'Corpo', valor: r.corpo },
        ],
        situacao: r.active ? 'Ativa' : 'Desativada',
        ativa: r.active,
        acao: (
          <RespostaActions
            resposta={r}
            onErrorAlternar={setErrorAlternar}
            onExcluir={() => setRespostaParaExcluir(r)}
          />
        ),
        procura: `${r.titulo} ${r.atalho}`.toLowerCase(),
      })),
    },
  ];

  return (
    <>
      <div className="board-head">
        <h2>Respostas prontas</h2>
        <Botao
          variante="primario"
          icone="mais"
          className="board-acao"
          onClick={() => setModalAberto(true)}
        >
          Nova resposta pronta
        </Botao>
      </div>

      {errorAlternar ? <Etiqueta tom="erro">{errorAlternar}</Etiqueta> : null}

      <ListaRegras sections={sections} placeholder="Buscar por título ou por atalho" sectionOcultarHeader />

      <Modal
        aberto={modalAberto}
        titulo="Nova resposta pronta"
        onFechar={() => setModalAberto(false)}
      >
        <FormularioRespostaPronta aoSalvar={() => setModalAberto(false)} />
      </Modal>

      <ModalConfirmation
        aberto={respostaParaExcluir !== null}
        titulo="Excluir resposta"
        message={
          <>Excluir a resposta "{respostaParaExcluir?.titulo}"? Esta ação não pode ser desfeita.</>
        }
        error={errorExclusao}
        confirmando={excluindo}
        onConfirmar={() => void excluir()}
        onCancelar={() => {
          setRespostaParaExcluir(null);
          setErrorExclusao(null);
        }}
      />
    </>
  );
}
