import { notFound } from 'next/navigation';
import { IconePortal } from '../../../../../componentes/icones-portal';
import { fusoDoTenant } from '../../../../../lib/banco';
import {
  PERIODOS_DE_CALENDARIO,
  PERIODOS_FIXOS,
  ROTULO_DO_PERIODO,
  carregarMensagensAtivas,
  hojeNoFuso,
  intervaloDoPeriodo,
  lerPeriodo,
} from '../../../../../lib/analise';
import { Filtro } from './filtro';
import { MioloDeMensagensAtivas } from './miolo';
import './mensagens-ativas.css';

/**
 * Análise › Mensagens ativas — o `<analytics-mfe page="activeMessages">` da
 * origem, que o `portal-fragment-analytics` resolve para o `Lx`
 * (analytics-main.js 56300) quando `is-displaying-analytics-active-messages-tab`
 * está ligada (está, para o roteador da captura).
 *
 * Lá o `Lx` guarda período e template em estado e pede quatro comandos
 * (`/active-messages/status`, `reply-hour`, `failed-count` e `template-names`)
 * a cada "Aplicar"/"Atualizar". Aqui o estado mora na URL (`?periodo`, `?de`,
 * `?ate`, `?template`) e a página lê o dado no servidor.
 */
export const dynamic = 'force-dynamic';

/** O `id` vem da URL, e URL é texto de fora: sem isto o Postgres recusa o uuid. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const texto = (v: string | string[] | undefined) => (typeof v === 'string' ? v : undefined);

export default async function PaginaDeMensagensAtivas({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const busca = await searchParams;

  const hoje = hojeNoFuso(await fusoDoTenant());
  const de = texto(busca['de']);
  const ate = texto(busca['ate']);
  /* 186 dias é o `startDateLimit` que o `St` põe no `bds-datepicker`. Período
     que não fecha cai no `yt.Today` inicial da origem. */
  let periodo = lerPeriodo(texto(busca['periodo']));
  let intervalo = intervaloDoPeriodo(periodo, hoje, { de, ate, limiteDias: 186 });
  if (!intervalo) {
    periodo = 'today';
    intervalo = { inicio: hoje, fim: hoje };
  }
  const template = texto(busca['template'])?.trim() || null;
  const dados = await carregarMensagensAtivas(id, intervalo, template);
  const limite = new Date(Date.parse(`${hoje}T00:00:00Z`) - 186 * 86_400_000)
    .toISOString()
    .slice(0, 10);

  return (
    <div className="ma-tela">
      <div className="ma-topo">
        {/* `Ix` › `jx` › `Ax` (título) e `Zx` (o "Atualizar" secundário com
            `refresh`). Atualizar reenvia o filtro como está — é o `te()` → `K()`. */}
        <div className="ma-cabeca">
          <h1 className="ma-titulo">Mensagens ativas</h1>
          <div className="ma-acoes">
            <button type="submit" form="ma-filtro" className="ma-botao ma-botao-secundario">
              <IconePortal nome="atualizar" tamanho={24} />
              Atualizar
            </button>
          </div>
        </div>
        <div className="ma-filtro-faixa">
          <Filtro
            fileiras={[PERIODOS_FIXOS, PERIODOS_DE_CALENDARIO].map((f) =>
              f.map((chave) => ({ chave, rotulo: ROTULO_DO_PERIODO[chave] })),
            )}
            periodo={periodo}
            de={periodo === 'custom' ? intervalo.inicio : ''}
            ate={periodo === 'custom' ? intervalo.fim : ''}
            template={template ?? ''}
            templates={dados.templates}
            hoje={hoje}
            limite={limite}
          />
        </div>
      </div>
      <MioloDeMensagensAtivas dados={dados} intervalo={intervalo} />
    </div>
  );
}
