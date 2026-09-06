import { carregarPausas } from '../../../lib/cadastros';
import { duracaoLonga, numero } from '../../../lib/formato';
import { ListaRegras, type SecaoDeRegras } from '../../../componentes/lista-regras';
import { FormularioMotivoPausa } from './formulario';

export const dynamic = 'force-dynamic';

/**
 * Pausas personalizadas.
 *
 * Duas coisas na mesma tela, de propósito: o cadastro e o uso real. O motivo
 * cadastrado com "30 minutos" que na prática dura 47 é a informação que faz o
 * supervisor mexer na escala — e ela não existe em lugar nenhum se a tela só
 * mostrar o que foi digitado.
 *
 * A média é `avg` de SQL (ver `lib/cadastros.ts`): `packages/core/src/esforco/`
 * não conhece `pausa` nem `motivo_pausa`, só o intervalo entre mensagens.
 */

/** Diferença entre o observado e o sugerido, em português corrente. */
function comparacao(mediaSeg: number | null, sugeridaMin: number | null): string {
  if (mediaSeg === null) return '—';
  if (sugeridaMin === null) return 'sem referência';
  const deltaMin = Math.round(mediaSeg / 60 - sugeridaMin);
  if (deltaMin === 0) return 'no ponto';
  return deltaMin > 0 ? `+${numero(deltaMin)}min` : `${numero(deltaMin)}min`;
}

export default async function PaginaPausas() {
  const { motivos, dias, semMotivo, abertas } = await carregarPausas();

  const usados = motivos.filter((m) => m.pausas > 0).length;

  const secoes: SecaoDeRegras[] = [
    {
      titulo: 'Motivos de pausa',
      vazio:
        'Nenhum motivo cadastrado. O atendente sai do online sem dizer por quê, e a pausa fica sem motivo no relatório.',
      cartoes: motivos.map((m) => ({
        id: m.id,
        campos: [
          { rotulo: 'Motivo', valor: m.nome },
          {
            rotulo: 'Conta como',
            valor: m.contaComoProdutivo ? 'Produtivo' : 'Fora do trabalho',
          },
          {
            rotulo: 'Sugerida',
            valor: m.duracaoSugeridaMin === null ? '—' : `${numero(m.duracaoSugeridaMin)}min`,
            classe: 'num',
          },
          { rotulo: `Pausas em ${dias}d`, valor: numero(m.pausas), classe: 'num' },
          { rotulo: 'Média real', valor: duracaoLonga(m.mediaSeg), classe: 'num' },
          {
            rotulo: 'Contra a sugerida',
            valor: comparacao(m.mediaSeg, m.duracaoSugeridaMin),
            classe: 'num',
          },
        ],
        situacao: m.ativo ? 'Ativo' : 'Desativado',
        ativa: m.ativo,
        procura:
          `${m.nome} ${m.contaComoProdutivo ? 'produtivo' : 'fora do trabalho'}`.toLowerCase(),
      })),
    },
  ];

  return (
    <>
      <div className="board-head">
        <h2>Pausas personalizadas</h2>
        <span className="sub">
          {numero(motivos.length)} motivos, {numero(usados)} com uso nos últimos {dias} dias.
        </span>
      </div>

      <section className="card">
        <h3>Produtivo e não produtivo não é rótulo, é conta</h3>
        <p className="sub">
          Almoço, café e banheiro são pausa de verdade: o atendente saiu, e esse tempo não é tempo
          de trabalho. Treinamento, reunião e feedback são trabalho que não é atendimento — tirá-los
          do tempo trabalhado faz o atendente parecer ocioso num dia inteiro de treinamento. É essa
          a diferença que a caixa <b>conta como produtivo</b> guarda, e ela decide de que lado do
          relatório de esforço a pausa cai.
        </p>
        <p className="note">
          Hoje o relatório de esforço mede o tempo em sessão pelos intervalos entre as mensagens do
          atendente (<code>packages/core/src/esforco/sessao.ts</code>, corte em 10 minutos) e ainda
          não lê a tabela <code>pausa</code>. O que está marcado aqui é o que vai separar os dois
          tempos quando ele passar a ler — cadastrar certo agora evita ter de reclassificar o
          passado depois.
        </p>
      </section>

      <FormularioMotivoPausa />

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

      <ListaRegras secoes={secoes} placeholder="Buscar por motivo" />
    </>
  );
}
