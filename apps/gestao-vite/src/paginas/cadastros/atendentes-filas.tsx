import { useState } from 'react';
import { PESO_AGUARDANDO_ATENDENTE, PESO_AGUARDANDO_CLIENTE } from '@pipe/core';
import { Botao, BotaoDeIcone, Etiqueta } from '@pipe/ui';
import { useLeitura } from '../../lib/consulta';
import type { AtendenteCadastrado, FilaCadastrada, HorarioParaEscolher } from '../../lib/cadastros';
import { alternarFila, excluirFila } from '../../lib/cadastros-gravar';
import { numero } from '../../lib/formato';
import { ListaRegras, type SecaoDeRegras } from '../../componentes/lista-regras';
import { FormularioFila } from './atendentes-filas-formulario';
import { EdicaoDeFila } from './atendentes-filas-edicao';
import { corDaFila, rotuloDaCor } from '../../lib/cores-de-fila';
import { Modal, ModalConfirmacao } from './_modal';

/**
 * Filas de atendimento.
 *
 * Esqueleto medido em `FICHA-queue-management.md` §2: cabeçalho com "Nova
 * fila" à direita (sem subtítulo), busca "Buscar fila" embaixo, cartão-linha
 * com só "Fila de atendimento"/"Atendentes atribuídos" como coluna (§4) e o
 * rodapé de paginação (§5) — as duas telas com paginação confirmada no
 * material são esta e `regras-atendimento.tsx`. O modal "Criar nova fila"
 * (§2.6, fechado na captura) é onde o "Nova fila" do cabeçalho manda; o
 * conteúdo do formulário em si não está no material, então a explicação da
 * capacidade — que não é da Blip, é nossa, porque `capacidade_padrao` era um
 * número mágico sem ela — mora ali dentro, e não mais solta na página.
 *
 * Toggle e exclusão por cartão: `lib/cadastros.ts` agora tem
 * `alternarFila`/`excluirFila` (`PATCH`/`DELETE` em
 * `/v1/gestao/atendentes/filas/:id`), então o switch e o ícone "Excluir" do
 * cartão deles (§4, §5) entram — a exclusão pede confirmação em
 * `ModalConfirmacao` (nunca `window.confirm`/`window.alert`, que era o
 * provisório de antes), mesmo padrão de `regras-atendimento.tsx`. A recusa do
 * toggle (fila com conversa aberta, fila padrão de caixa de entrada, ...) vira
 * `Etiqueta` acima da lista — o `window.alert` de antes não tem onde morar
 * dentro do modal de exclusão, que só abre quando alguém exclui. Cor,
 * capacidade, ordem, horário e teto simultâneo — que não são coluna
 * documentada — ficam no rodapé do cartão, ao lado dos atendentes habilitados.
 *
 * Renomear e vincular/desvincular atendente: o ícone "Editar" abre
 * `EdicaoDeFila` (`atendentes-filas-edicao.tsx`) — um modal só, com o nome da
 * fila e a lista de atendentes vinculados/a vincular. Não é coluna nem modal
 * documentado na ficha (capturada com o `bds-modal` fechado); a forma segue a
 * do resto da tela — mesmo cartão, mesmo `_modal.tsx`.
 */

/** O switch + editar/excluir do cartão-linha — o slot `acao` que `lista-regras.tsx` reserva. */
function AcoesDaFila({
  fila,
  onErroAlternar,
  onEditar,
  onExcluir,
}: {
  fila: FilaCadastrada;
  onErroAlternar: (erro: string) => void;
  onEditar: () => void;
  onExcluir: () => void;
}) {
  const alternar = async () => {
    const r = await alternarFila(fila.id, fila.ativa);
    if (!r.ok) onErroAlternar(r.erro);
  };
  return (
    <>
      <button
        type="button"
        className="interruptor"
        role="switch"
        aria-checked={fila.ativa}
        aria-label={fila.ativa ? `Desativar a fila ${fila.nome}` : `Ativar a fila ${fila.nome}`}
        title={fila.ativa ? 'Desativar esta fila' : 'Ativar esta fila'}
        onClick={() => void alternar()}
      >
        <span className="interruptor-bolinha" />
      </button>
      <BotaoDeIcone nome="lapis" rotulo={`Editar a fila ${fila.nome}`} onClick={onEditar} />
      <BotaoDeIcone nome="x" rotulo={`Excluir a fila ${fila.nome}`} onClick={onExcluir} />
    </>
  );
}
export function PaginaFilas() {
  const [modalAberto, setModalAberto] = useState(false);
  /* Id, não o objeto: vincular/desvincular atendente invalida a leitura
     (`atualizarLeituras`) e `filas` chega de novo com outra referência —
     guardar só o id e buscar de novo em `filas` a cada render é o que faz o
     modal aberto mostrar o atendente recém-vinculado sem fechar e reabrir. */
  const [filaEmEdicaoId, setFilaEmEdicaoId] = useState<string | null>(null);
  const [filaParaExcluir, setFilaParaExcluir] = useState<FilaCadastrada | null>(null);
  const [excluindo, setExcluindo] = useState(false);
  const [erroExclusao, setErroExclusao] = useState<string | null>(null);
  const [erroAlternar, setErroAlternar] = useState<string | null>(null);
  const leitura = useLeitura<{ filas: FilaCadastrada[]; horarios: HorarioParaEscolher[] }>(
    '/v1/gestao/atendentes/filas',
  );
  /* O seletor de atendentes do modal "Editar fila" — mesma leitura de
     `atendentes-gestao.tsx`. Fica aqui em cima (e não dentro do modal) para
     não repetir o `useLeitura` a cada abertura. */
  const leituraAtendentes = useLeitura<AtendenteCadastrado[]>('/v1/gestao/atendentes/gestao');
  if (!leitura.data || !leituraAtendentes.data) return null;
  const { filas, horarios } = leitura.data;
  const atendentesGestao = leituraAtendentes.data;
  const filaEmEdicao = filas.find((f) => f.id === filaEmEdicaoId) ?? null;

  async function excluir() {
    if (!filaParaExcluir) return;
    setExcluindo(true);
    setErroExclusao(null);
    const resultado = await excluirFila(filaParaExcluir.id);
    setExcluindo(false);
    if (resultado.ok) setFilaParaExcluir(null);
    else setErroExclusao(resultado.erro);
  }

  const secoes: SecaoDeRegras[] = [
    {
      titulo: 'Filas de atendimento',
      vazio: 'Nenhuma fila cadastrada. Toda conversa que chega fica sem fila e sem distribuição.',
      cartoes: filas.map((f) => {
        const teto = f.atendentes.reduce((total, a) => total + a.capacidade, 0);
        const detalhes = [
          `Cor: ${rotuloDaCor(f.cor)}`,
          `Capacidade padrão: ${numero(f.capacidadePadrao)}`,
          `Ordem: ${numero(f.ordem)}`,
          `Horário: ${f.horarioNome ?? 'sem horário, o relógio corre sempre'}`,
          `Teto simultâneo: ${numero(teto)}`,
        ];
        return {
          id: f.id,
          cor: corDaFila(f.cor),
          campos: [
            { rotulo: 'Fila de atendimento', valor: f.nome },
            { rotulo: 'Atendentes atribuídos', valor: numero(f.atendentes.length), classe: 'num' },
          ],
          situacao: f.ativa ? 'Ativa' : 'Desativada',
          ativa: f.ativa,
          acao: (
            <AcoesDaFila
              fila={f}
              onErroAlternar={setErroAlternar}
              onEditar={() => setFilaEmEdicaoId(f.id)}
              onExcluir={() => setFilaParaExcluir(f)}
            />
          ),
          rodape: [
            ...detalhes,
            ...(f.atendentes.length > 0
              ? f.atendentes.map((a) => `${a.nome} · ${a.capacidade}${a.temOverride ? ' próprio' : ''}`)
              : ['Nenhum atendente habilitado — a distribuição não tem a quem entregar']),
          ],
          procura:
            `${f.nome} ${f.horarioNome ?? ''} ${f.atendentes.map((a) => a.nome).join(' ')}`.toLowerCase(),
        };
      }),
    },
  ];

  return (
    <>
      <div className="board-head">
        <h2>Filas de atendimento</h2>
        <Botao
          variante="primario"
          icone="mais"
          className="board-acao"
          onClick={() => setModalAberto(true)}
        >
          Nova fila
        </Botao>
      </div>

      {erroAlternar ? <Etiqueta tom="erro">{erroAlternar}</Etiqueta> : null}

      <ListaRegras
        secoes={secoes}
        placeholder="Buscar fila"
        ocultarCabecalhoDeSecao
        paginar
        tamanhoDePaginaInicial={5}
      />

      <Modal aberto={modalAberto} titulo="Criar nova fila" onFechar={() => setModalAberto(false)}>
        <p className="sub">
          A <b>capacidade padrão</b> é quantas conversas simultâneas um atendente desta fila
          aguenta. A distribuição só entrega conversa a quem está na fila, está <b>online</b> e
          ainda tem vaga — vaga é <b>capacidade menos conversas abertas</b>. Entre os que têm vaga,
          quem recebe é o de menor carga ponderada: conversa que aguarda o atendente pesa{' '}
          {numero(PESO_AGUARDANDO_ATENDENTE)} e conversa que aguarda o cliente pesa{' '}
          {numero(PESO_AGUARDANDO_CLIENTE)} — a mesma conta da barra “Carga por atendente” do
          Monitoramento.
        </p>
        <FormularioFila horarios={horarios} aoSalvar={() => setModalAberto(false)} />
      </Modal>

      <Modal
        aberto={filaEmEdicaoId !== null}
        titulo="Editar fila"
        onFechar={() => setFilaEmEdicaoId(null)}
      >
        {filaEmEdicao ? (
          <EdicaoDeFila fila={filaEmEdicao} atendentesGestao={atendentesGestao} />
        ) : null}
      </Modal>

      <ModalConfirmacao
        aberto={filaParaExcluir !== null}
        titulo="Excluir fila"
        mensagem={<>Excluir a fila "{filaParaExcluir?.nome}"? Esta ação não pode ser desfeita.</>}
        erro={erroExclusao}
        confirmando={excluindo}
        onConfirmar={() => void excluir()}
        onCancelar={() => {
          setFilaParaExcluir(null);
          setErroExclusao(null);
        }}
      />
    </>
  );
}
