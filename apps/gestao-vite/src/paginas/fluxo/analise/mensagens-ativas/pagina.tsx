import { useSearchParams } from 'react-router-dom';
import {
  PERIODOS_DE_CALENDARIO,
  PERIODOS_FIXOS,
  ROTULO_DO_PERIODO,
  type DadosDeMensagensAtivas,
  type Intervalo,
  type Periodo,
} from '@pipe/core/analise';
import { IconePortal } from '../../../../componentes/icones-portal';
import { useLeitura } from '../../../../lib/consulta';
import { useContato } from '../../contato';
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
 * `?ate`, `?template`) e a `api` resolve o período no fuso da conta.
 */
interface RespostaDeMensagensAtivas {
  periodo: Periodo;
  intervalo: Intervalo;
  hoje: string;
  /** O `startDateLimit` do `bds-datepicker`: 186 dias atrás. */
  limite: string;
  template: string | null;
  dados: DadosDeMensagensAtivas;
}

export function PaginaDeMensagensAtivas() {
  const { contato } = useContato();
  const [busca] = useSearchParams();
  const q = new URLSearchParams();
  for (const chave of ['periodo', 'de', 'ate', 'template']) {
    const v = busca.get(chave);
    if (v) q.set(chave, v);
  }
  const leitura = useLeitura<RespostaDeMensagensAtivas>(
    `/v1/gestao/fluxos/${contato.id}/analise/mensagens-ativas?${q.toString()}`,
  );
  if (!leitura.data) return null;
  const { periodo, intervalo, hoje, limite, template, dados } = leitura.data;

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
