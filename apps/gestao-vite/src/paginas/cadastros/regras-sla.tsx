import { useLeitura } from '../../lib/consulta';
import { ROTULO_ALVO, type RegraSlaConfigurada } from '../../lib/configuracoes';
import { duracao } from '../../lib/formato';
import { ListaRegras, type SecaoDeRegras } from '../../componentes/lista-regras';

/**
 * A sigla que a coluna "Metas" deles usa para cada alvo (`dom/sla-policy.html`:
 * "TME, TMR1, TMA" — tempo médio de espera, tempo médio da 1ª resposta,
 * tempo médio de atendimento; `FICHA-sla-policy.md` §8). O nosso alvo é um
 * só por regra, então a coluna traz uma sigla; o prazo e o alerta vão no
 * `title` da célula, que é onde cabem sem abrir coluna que a tela deles não
 * tem.
 */
const SIGLA_DO_ALVO: Record<string, string> = {
  espera_fila: 'TME',
  primeira_resposta: 'TMR1',
  resposta: 'TMR',
  resolucao: 'TMA',
};

/**
 * Regras ├ SLA — `attendance/desk/sla-policy` da origem, medido em
 * `docs/capturas/blip/dom/FICHA-sla-policy.md` e conferido na foto
 * `fotos/original-sla-policy.png`.
 *
 * Esqueleto igual ao deles (§2): cabeçalho, busca sozinha embaixo ("Buscar
 * regras de SLA", §3), lista de cartões e rodapé de paginação (§5). O cartão
 * tem QUATRO colunas — "Regras de SLA", "Metas", "Filas atribuídas" e o selo
 * "Padrão" sem rótulo (§4) — e nada mais na linha além das ações.
 *
 * Divergências de DADO, não de layout:
 * - **Uma meta por regra.** Lá uma política combina vários alvos ("TME,
 *   TMR1"); aqui `regra_sla.alvo` é um valor só. A coluna traz a sigla do
 *   alvo, e o prazo/alerta ficam no `title`.
 * - **"Padrão" vem do escopo.** O que a origem chama de política padrão é,
 *   aqui, a regra de escopo `tenant` — a que `escolherRegra` usa como
 *   respaldo. O selo é essa regra, não um bit novo.
 * - **"Filas atribuídas"** é no máximo uma fila (ou toda a operação):
 *   `escopoTipo`/`escopoId` prendem a regra a um escopo só.
 *
 * TODO(escrita): não existe `salvar`/`alternar`/`excluir` de `regra_sla` na
 * API — só a leitura. Por isso não há "Criar regra" nem os ícones de
 * "Editar"/"Excluir" do cartão deles (§5): fingir o envio gravaria uma
 * mentira. Quando a mutação existir, ligar como `regras-atendimento.tsx`.
 */
export function PaginaRegrasDeSla() {
  const leitura = useLeitura<{ regras: RegraSlaConfigurada[] }>(
    '/v1/gestao/configuracoes/regras',
  );
  if (!leitura.data) return null;
  const { regras } = leitura.data;

  const secoes: SecaoDeRegras[] = [
    {
      titulo: 'Regras de SLA',
      vazio: 'Nenhuma regra de SLA cadastrada',
      vazioDescricao: 'Toda conversa aparece como “Sem regra” no Monitoramento.',
      cartoes: regras.map((r) => {
        const filaAtribuida = r.escopoTipo === 'tenant' ? '' : (r.escopoNome ?? 'fila removida');
        const meta = SIGLA_DO_ALVO[r.alvo] ?? r.alvo;
        const prazo = `${ROTULO_ALVO[r.alvo] ?? r.alvo}: prazo ${duracao(r.prazoSeg)}${
          r.alertaSeg === null ? '' : `, alerta ${duracao(r.alertaSeg)}`
        }`;
        return {
          id: r.id,
          campos: [
            { rotulo: 'Regras de SLA', valor: r.nome },
            { rotulo: 'Metas', valor: meta, titulo: prazo },
            { rotulo: 'Filas atribuídas', valor: filaAtribuida },
          ],
          selo: r.escopoTipo === 'tenant' ? 'Padrão' : undefined,
          situacao: r.ativa ? 'Ativa' : 'Desativada',
          ativa: r.ativa,
          procura: `${r.nome} ${meta} ${ROTULO_ALVO[r.alvo] ?? r.alvo} ${filaAtribuida}`.toLowerCase(),
        };
      }),
    },
  ];

  return (
    <>
      <div className="board-head">
        <h2>Regras de SLA</h2>
      </div>

      <ListaRegras
        secoes={secoes}
        placeholder="Buscar regras de SLA"
        ocultarCabecalhoDeSecao
        paginar
        tamanhoDePaginaInicial={5}
      />
    </>
  );
}
