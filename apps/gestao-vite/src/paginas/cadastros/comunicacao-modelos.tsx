import {
  ROTULO_CABECALHO,
  ROTULO_CATEGORIA_TEMPLATE,
  ROTULO_STATUS_META,
  cabecalhoTemMidia,
  deslocamentoDoCabecalho,
  type CabecalhoTemplate,
  type CategoriaTemplate,
  type CanalWhatsapp,
  type ModeloListado,
} from '../../lib/comunicacao';
import { useLeitura } from '../../lib/consulta';
import { ListaRegras, type SecaoDeRegras } from '../../componentes/lista-regras';
import { FormularioModelo } from './comunicacao-modelos-formulario';

/**
 * Posições reais de disparo, para leitura direta no cartão: sem cabeçalho de
 * mídia é `{{1}}, {{2}}…`; com mídia, cada uma desliza +1 e o cartão já mostra
 * o número deslocado — é a regra do §"modelos" da tarefa, visível na tela de
 * quem cadastra, não só no código de envio (`apps/workers/src/whatsapp/template.ts`).
 */
function posicoesDeDisparo(cabecalho: string, quantidade: number): string {
  if (quantidade === 0) return 'nenhuma';
  const deslocamento = deslocamentoDoCabecalho(cabecalho);
  const posicoes = Array.from({ length: quantidade }, (_, i) => i + 1 + deslocamento);
  return posicoes.map((p) => `{{${p}}}`).join(', ');
}

export function PaginaModelos() {
  const leitura = useLeitura<{ modelos: ModeloListado[]; canais: CanalWhatsapp[] }>(
    '/v1/gestao/comunicacao/modelos',
  );
  if (!leitura.data) return null;
  const { modelos, canais } = leitura.data;

  const secoes: SecaoDeRegras[] = [
    {
      titulo: 'Modelos de mensagem',
      vazio: 'Nenhum modelo cadastrado. O Desk não tem o que oferecer fora da janela de 24h.',
      cartoes: modelos.map((m) => ({
        id: m.id,
        campos: [
          { rotulo: 'Nome', valor: m.nome },
          { rotulo: 'Idioma', valor: m.idioma },
          {
            rotulo: 'Categoria',
            valor: ROTULO_CATEGORIA_TEMPLATE[m.categoria as CategoriaTemplate] ?? m.categoria,
          },
          { rotulo: 'Canal', valor: m.canalNome },
          {
            rotulo: 'Cabeçalho',
            valor: ROTULO_CABECALHO[m.cabecalhoTipo as CabecalhoTemplate] ?? m.cabecalhoTipo,
          },
          {
            rotulo: cabecalhoTemMidia(m.cabecalhoTipo)
              ? 'Variáveis (cabeçalho desloca +1)'
              : 'Variáveis',
            valor: posicoesDeDisparo(m.cabecalhoTipo, m.variaveis.length),
          },
          { rotulo: 'Status na Meta', valor: ROTULO_STATUS_META[m.statusMeta] ?? m.statusMeta },
        ],
        situacao: ROTULO_STATUS_META[m.statusMeta] ?? m.statusMeta,
        ativa: m.statusMeta === 'aprovado',
        procura: `${m.nome} ${m.idioma} ${m.categoria} ${m.canalNome}`.toLowerCase(),
      })),
    },
  ];

  return (
    <>
      {/* `FICHA-message-template.md` §2.1: cabeçalho SEM botão — a área à
          direita do título fica vazia na Blip, porque lá o modelo se cadastra
          em "Conteúdos > Modelo de mensagem" (§5), uma tela que não existe no
          Pipe hoje. Como não há para onde mandar essa criação, o formulário
          continua aqui — só desceu para depois da lista, para o topo da
          página bater com o deles antes de chegar na parte que é só nossa. */}
      <div className="board-head">
        <h2>Modelos de mensagem</h2>
      </div>

      <ListaRegras secoes={secoes} placeholder="Buscar por nome, idioma ou categoria" ocultarCabecalhoDeSecao />

      <FormularioModelo canais={canais} />
    </>
  );
}
