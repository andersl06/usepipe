import {
  ROTULO_CABECALHO,
  ROTULO_CATEGORIA_TEMPLATE,
  ROTULO_STATUS_META,
  carregarCanaisWhatsapp,
  carregarModelos,
  cabecalhoTemMidia,
  deslocamentoDoCabecalho,
  type CabecalhoTemplate,
  type CategoriaTemplate,
} from '../../../lib/comunicacao';
import { numero } from '../../../lib/formato';
import { ListaRegras, type SecaoDeRegras } from '../../../componentes/lista-regras';
import { FormularioModelo } from './formulario';

export const dynamic = 'force-dynamic';

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

export default async function PaginaModelos() {
  // Em série de propósito, mesmo sendo duas transações `comTenant` independentes:
  // a regra da casa é nunca `Promise.all` perto de `comTenant`, para never sobrar
  // dúvida de qual delas corre de verdade em paralelo dentro de uma conexão.
  const modelos = await carregarModelos();
  const canais = await carregarCanaisWhatsapp();

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
            rotulo: cabecalhoTemMidia(m.cabecalhoTipo) ? 'Variáveis (cabeçalho desloca +1)' : 'Variáveis',
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
      <div className="board-head">
        <h2>Modelos de mensagem</h2>
        <span className="sub">
          {numero(modelos.length)} modelos. O texto vive na Meta — aqui fica nome, idioma,
          categoria e o mapeamento de posição das variáveis.
        </span>
      </div>

      <FormularioModelo canais={canais} />

      <ListaRegras secoes={secoes} placeholder="Buscar por nome, idioma ou categoria" />
    </>
  );
}
