import { useState } from 'react';
import { Botao } from '@pipe/ui';
import { useLeitura } from '../../lib/consulta';
import type { UsoDePausas } from '../../lib/cadastros';
import { duracaoLonga, numero } from '../../lib/formato';
import { ListaRegras, type SecaoDeRegras } from '../../componentes/lista-regras';
import { FormularioMotivoPausa } from './atendentes-pausas-formulario';
import { Modal } from './_modal';

/**
 * Pausas personalizadas.
 *
 * Esqueleto medido em `FICHA-personalizedbreaks.md` §2: cabeçalho com "Nova
 * Pausa" à direita (sem subtítulo), sem busca nem filtro nenhum (§3), cartão
 * com só "Nome da pausa"/"Duração" como coluna (§4) e sem paginação — só
 * `rules` e `queue-management` têm rodapé confirmado no material. O modal
 * "Criar nova pausa personalizada" (§2.3) é onde o "Nova Pausa" do cabeçalho
 * manda.
 *
 * O uso real (cadastro + dado real na mesma tela, de propósito: o motivo
 * cadastrado com "30 minutos" que na prática dura 47 é a informação que faz o
 * supervisor mexer na escala) não é coluna documentada — fica no rodapé do
 * cartão, ao lado de "Conta como". A média é `avg` de SQL (ver
 * `lib/cadastros.ts`): `packages/core/src/esforco/` não conhece `pausa` nem
 * `motivo_pausa`, só o intervalo entre mensagens.
 *
 * Sem exclusão por cartão: a API não tem "excluir motivo de pausa" hoje — o
 * ícone "Excluir" do cartão deles (§5) fica de fora.
 */

/** Diferença entre o observado e o sugerido, em português corrente. */
function comparacao(mediaSeg: number | null, sugeridaMin: number | null): string {
  if (mediaSeg === null) return '—';
  if (sugeridaMin === null) return 'sem referência';
  const deltaMin = Math.round(mediaSeg / 60 - sugeridaMin);
  if (deltaMin === 0) return 'no ponto';
  return deltaMin > 0 ? `+${numero(deltaMin)}min` : `${numero(deltaMin)}min`;
}

export function PaginaPausas() {
  const [modalAberto, setModalAberto] = useState(false);
  const leitura = useLeitura<UsoDePausas>('/v1/gestao/atendentes/pausas');
  if (!leitura.data) return null;
  const { motivos, dias, semMotivo, abertas } = leitura.data;

  const secoes: SecaoDeRegras[] = [
    {
      titulo: 'Pausas personalizadas',
      vazio:
        'Nenhum motivo cadastrado. O atendente sai do online sem dizer por quê, e a pausa fica sem motivo no relatório.',
      cartoes: motivos.map((m) => ({
        id: m.id,
        campos: [
          { rotulo: 'Nome da pausa', valor: m.nome },
          {
            rotulo: 'Duração',
            valor: m.duracaoSugeridaMin === null ? 'sem sugestão' : `${numero(m.duracaoSugeridaMin)} minutos`,
          },
        ],
        situacao: m.ativo ? 'Ativo' : 'Desativado',
        ativa: m.ativo,
        rodape: [
          m.contaComoProdutivo ? 'Conta como produtivo' : 'Conta como fora do trabalho',
          `${numero(m.pausas)} pausa(s) em ${dias}d`,
          `Média real: ${duracaoLonga(m.mediaSeg)}`,
          `Contra a sugerida: ${comparacao(m.mediaSeg, m.duracaoSugeridaMin)}`,
        ],
        procura:
          `${m.nome} ${m.contaComoProdutivo ? 'produtivo' : 'fora do trabalho'}`.toLowerCase(),
      })),
    },
  ];

  return (
    <>
      <div className="board-head">
        <h2>Pausas personalizadas</h2>
        <Botao
          variante="primario"
          icone="mais"
          className="board-acao"
          onClick={() => setModalAberto(true)}
        >
          Nova Pausa
        </Botao>
      </div>

      {semMotivo > 0 || abertas > 0 ? (
        <div className="note">
          {semMotivo > 0
            ? `${numero(semMotivo)} pausa(s) encerrada(s) nos últimos ${dias} dias sem motivo — não entram em nenhuma linha abaixo. `
            : ''}
          {abertas > 0
            ? `${numero(abertas)} pausa(s) em aberto agora: ainda não terminaram e por isso ficam fora da média.`
            : ''}
        </div>
      ) : null}

      <ListaRegras secoes={secoes} ocultarCabecalhoDeSecao ocultarBusca />

      <Modal
        aberto={modalAberto}
        titulo="Criar nova pausa personalizada"
        onFechar={() => setModalAberto(false)}
      >
        <p className="sub">
          Almoço, café e banheiro são pausa de verdade: o atendente saiu, e esse tempo não é tempo
          de trabalho. Treinamento, reunião e feedback são trabalho que não é atendimento — tirá-los
          do tempo trabalhado faz o atendente parecer ocioso num dia inteiro de treinamento. É essa
          a diferença que a caixa <b>conta como produtivo</b> guarda, e ela decide de que lado do
          relatório de esforço a pausa cai.
        </p>
        <FormularioMotivoPausa aoSalvar={() => setModalAberto(false)} />
      </Modal>
    </>
  );
}
