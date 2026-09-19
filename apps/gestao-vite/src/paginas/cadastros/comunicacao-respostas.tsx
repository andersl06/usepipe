import { useState } from 'react';
import { Botao, BotaoDeIcone } from '@pipe/ui';
import { useLeitura } from '../../lib/consulta';
import type { RespostaProntaListada } from '../../lib/comunicacao';
import { alternarRespostaPronta, excluirRespostaPronta } from '../../lib/comunicacao-gravar';
import { ListaRegras, type SecaoDeRegras } from '../../componentes/lista-regras';
import { FormularioRespostaPronta } from './comunicacao-respostas-formulario';
import { Modal } from './_modal';

/** O switch + o "Excluir" do cartão-linha — `PATCH`/`DELETE` em `.../respostas-prontas/:id`. */
function AcoesDaResposta({ resposta }: { resposta: RespostaProntaListada }) {
  const alternar = async () => {
    const r = await alternarRespostaPronta(resposta.id, resposta.ativa);
    if (!r.ok) window.alert(r.erro);
  };
  const excluir = async () => {
    if (!window.confirm(`Excluir a resposta "${resposta.titulo}"? Esta ação não pode ser desfeita.`)) {
      return;
    }
    const r = await excluirRespostaPronta(resposta.id);
    if (!r.ok) window.alert(r.erro);
  };
  return (
    <>
      <button
        type="button"
        className="interruptor"
        role="switch"
        aria-checked={resposta.ativa}
        aria-label={
          resposta.ativa ? `Desativar a resposta ${resposta.titulo}` : `Ativar a resposta ${resposta.titulo}`
        }
        title={resposta.ativa ? 'Desativar esta resposta' : 'Ativar esta resposta'}
        onClick={() => void alternar()}
      >
        <span className="interruptor-bolinha" />
      </button>
      <BotaoDeIcone
        nome="x"
        rotulo={`Excluir a resposta ${resposta.titulo}`}
        onClick={() => void excluir()}
      />
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
export function PaginaRespostasProntas() {
  const [modalAberto, setModalAberto] = useState(false);
  const leitura = useLeitura<RespostaProntaListada[]>('/v1/gestao/comunicacao/respostas-prontas');
  if (!leitura.data) return null;
  const respostas = leitura.data;

  const secoes: SecaoDeRegras[] = [
    {
      titulo: 'Respostas prontas',
      /* Texto literal do estado vazio deles — `FICHA-replies.md` §6, a única
         parte do material que não é sujeita ao desalinhamento de categorias
         descrito acima: o texto não fala de categoria nem de #, então copia
         sem ressalva. */
      vazio: 'Você ainda não criou respostas prontas',
      vazioDescricao: 'Crie respostas para agilizar seus atendimentos',
      cartoes: respostas.map((r) => ({
        id: r.id,
        campos: [
          { rotulo: 'Atalho', valor: `#${r.atalho}` },
          { rotulo: 'Título', valor: r.titulo },
          { rotulo: 'Fila / canal', valor: r.categoria ?? '—' },
          { rotulo: 'Corpo', valor: r.corpo },
        ],
        situacao: r.ativa ? 'Ativa' : 'Desativada',
        ativa: r.ativa,
        acao: <AcoesDaResposta resposta={r} />,
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

      <ListaRegras secoes={secoes} placeholder="Buscar por título ou por atalho" ocultarCabecalhoDeSecao />

      <Modal
        aberto={modalAberto}
        titulo="Nova resposta pronta"
        onFechar={() => setModalAberto(false)}
      >
        <FormularioRespostaPronta aoSalvar={() => setModalAberto(false)} />
      </Modal>
    </>
  );
}
