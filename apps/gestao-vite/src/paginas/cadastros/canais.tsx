import { Icone } from '@pipe/ui';
import { useLeitura } from '../../lib/consulta';
import type { CanalDetalhado } from '../../lib/configuracoes';
import { numero } from '../../lib/formato';
import { IconeGestao } from '../../componentes/icones-gestao';
import { ConectarWhatsApp } from '../../componentes/cadastro-embutido-whatsapp';

const ROTULO_TIPO: Record<string, string> = {
  whatsapp_cloud: 'WhatsApp',
  instagram: 'Instagram',
  email: 'E-mail',
  widget: 'Site',
};

/**
 * Canais de atendimento — `attendance/desk/channels` da origem
 * (`FICHA-channels.md`): título sem subtítulo nem botão, e uma GRADE de
 * cartões (`bds-grid direction="row"`, `bds-paper` de 242×292), cada um com
 * ícone, título 16/700, subtítulo 14/400 e um botão no pé — "Conectado"
 * (terciário, com o `checkball`) ou "Conectar" (primário, com a seta).
 *
 * O desalinhamento de dado fica registrado: lá é um CATÁLOGO fixo de
 * integrações (Pipe Desk, Salesforce, Salesforce MIAW, Canal Personalizado);
 * aqui cada cartão é um canal REAL já conectado, com as caixas de entrada e
 * a fila padrão de cada uma no subtítulo — dado que a tela deles não tem e
 * que não pode sumir. O último cartão é o "Conectar" nosso: o cadastro
 * embutido do WhatsApp. Não há Salesforce aqui, e inventar o botão seria
 * simular integração que o produto não tem.
 */
export function PaginaCanais() {
  const leitura = useLeitura<CanalDetalhado[]>('/v1/gestao/canais');
  if (!leitura.data) return null;
  const canais = leitura.data;

  return (
    <>
      <div className="board-head">
        <h2>Canais de atendimento</h2>
      </div>

      <div className="canais-grade">
        {canais.map((c) => (
          <section className="canal-cartao" key={c.id}>
            <span className="canal-icone" aria-hidden="true">
              <Icone nome="balao" tamanho={40} />
            </span>
            <h3>{c.nome}</h3>
            <p>
              {ROTULO_TIPO[c.tipo] ?? c.tipo}
              {c.caixas.length === 0
                ? ' · sem caixa de entrada'
                : c.caixas.map(
                    (cx) =>
                      ` · ${cx.nome}: ${cx.filaPadrao ?? 'sem fila padrão'} (${numero(cx.abertas)} aberta(s))`,
                  )}
            </p>
            <span className={c.ativo ? 'btn fantasma canal-acao' : 'btn fantasma canal-acao apagado'}>
              <IconeGestao nome="circuloOk" tamanho={20} />
              {c.ativo ? 'Conectado' : 'Desligado'}
            </span>
          </section>
        ))}

        <section className="canal-cartao">
          <span className="canal-icone" aria-hidden="true">
            <Icone nome="balao" tamanho={40} />
          </span>
          <h3>WhatsApp</h3>
          <p>Conecte um número pelo cadastro embutido da Meta</p>
          <div className="canal-acao">
            <ConectarWhatsApp rotulo="Conectar" />
          </div>
        </section>
      </div>
    </>
  );
}
