import type { CargaAtendente } from '../lib/monitoramento';
import { numero } from '../lib/formato';

/**
 * Carga por atendente — a barra que explica a distribuição.
 *
 * O número é `cargaPonderada` de `packages/core/src/distribuicao/`: conversa
 * aguardando resposta do atendente pesa 2, conversa aguardando o cliente pesa 1.
 * É o mesmo cálculo que escolhe quem recebe a próxima conversa, então precisa
 * estar visível na tela do supervisor.
 */
export function CargaPorAtendente({ carga }: { carga: readonly CargaAtendente[] }) {
  return (
    <div className="tblwrap">
      <div className="tblhead">
        <h3>Carga por atendente</h3>
        <span className="sub" style={{ marginLeft: 'auto' }}>
          carga ponderada · aguardando o atendente pesa 2
        </span>
      </div>

      {carga.length === 0 ? (
        <div className="vazio">Nenhum atendente conectado agora.</div>
      ) : (
        <div className="bars">
          {carga.map((a) => {
            // Comprimento = carga ponderada. Cor = vagas restantes: um atendente pode
            // estar com meia carga e mesmo assim sem vaga, e é a vaga que decide se
            // ele recebe a próxima conversa.
            const proporcao = a.cargaMaxima > 0 ? a.carga / a.cargaMaxima : 0;
            const largura = Math.max(2, Math.min(100, Math.round(proporcao * 100)));
            const ocupacaoVagas = a.limite > 0 ? a.ativas / a.limite : 0;
            const classe =
              ocupacaoVagas >= 1 ? 'fill bad' : ocupacaoVagas >= 0.75 ? 'fill warn' : 'fill';
            return (
              <div className="bar-row" key={a.id}>
                {/*
                  Antes havia um ponto verde em toda linha para dizer "online",
                  que é o estado normal — verde repetido deixa de significar.
                  Agora só o desvio aparece, e em etiqueta neutra: quem não está
                  online é a informação, e ela é textual.
                */}
                <span className="nome">
                  <span>{a.nome}</span>
                  {a.estado === 'online' ? null : <span className="etiqueta">{a.estado}</span>}
                </span>
                <span className="track">
                  <span className={classe} style={{ width: `${largura}%` }} />
                </span>
                <span className="n" title={`carga ${a.carga} de ${a.cargaMaxima}`}>
                  {numero(a.ativas)}/{numero(a.limite)}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
