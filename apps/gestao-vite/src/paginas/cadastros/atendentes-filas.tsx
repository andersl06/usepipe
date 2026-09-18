import { useState } from 'react';
import { PESO_AGUARDANDO_ATENDENTE, PESO_AGUARDANDO_CLIENTE } from '@pipe/core';
import { Botao } from '@pipe/ui';
import { useLeitura } from '../../lib/consulta';
import type { FilaCadastrada, HorarioParaEscolher } from '../../lib/cadastros';
import { numero } from '../../lib/formato';
import { ListaRegras, type SecaoDeRegras } from '../../componentes/lista-regras';
import { FormularioFila } from './atendentes-filas-formulario';
import { corDaFila, rotuloDaCor } from '../../lib/cores-de-fila';
import { Modal } from './_modal';

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
 * Sem toggle nem exclusão por cartão: `lib/acoes.ts` só tem `salvarFila`
 * (criar) — não há `alternarFila`/excluir fila na API hoje, então o switch e
 * o ícone "Excluir" do cartão deles (§4, §5) ficam de fora em vez de simular
 * uma ação que não existe. Cor, capacidade, ordem, horário e teto simultâneo
 * — que não são coluna documentada — ficam no rodapé do cartão, ao lado dos
 * atendentes habilitados.
 */
export function PaginaFilas() {
  const [modalAberto, setModalAberto] = useState(false);
  const leitura = useLeitura<{ filas: FilaCadastrada[]; horarios: HorarioParaEscolher[] }>(
    '/v1/gestao/atendentes/filas',
  );
  if (!leitura.data) return null;
  const { filas, horarios } = leitura.data;

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

      <ListaRegras
        secoes={secoes}
        placeholder="Buscar fila"
        ocultarCabecalhoDeSecao
        paginar
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
    </>
  );
}
