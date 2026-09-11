import { carregarCanais } from '../../lib/configuracoes';
import { numero } from '../../lib/formato';
import { ConectarWhatsApp } from '../../componentes/cadastro-embutido-whatsapp';

export const dynamic = 'force-dynamic';

const ROTULO_TIPO: Record<string, string> = {
  whatsapp_cloud: 'WhatsApp',
  instagram: 'Instagram',
  email: 'E-mail',
  widget: 'Site',
};

const DATA = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short' });

/**
 * Canais — o módulo que na barra deles fica à direita de Growth.
 *
 * Somente leitura, como todas as telas de configuração da Gestão: conectar um
 * canal grava credencial, e gravar credencial sem log de auditoria com autor e
 * horário é passivo. O que a tela resolve hoje é ver o que está conectado, se
 * está entregando, e para qual fila cada caixa manda.
 */
export default async function PaginaCanais() {
  const canais = await carregarCanais();
  const ligados = canais.filter((c) => c.ativo).length;

  return (
    <>
      <div className="board-head">
        <h2>Canais</h2>
        <span className="sub">
          {canais.length === 0
            ? 'Nenhum canal conectado.'
            : `${numero(ligados)} de ${numero(canais.length)} ligados. Canal é a conexão; caixa de entrada é para onde a conversa cai.`}
        </span>
      </div>

      {canais.length === 0 ? (
        <div className="tblwrap">
          <div className="vazio">
            Nenhum canal conectado neste tenant. Enquanto não houver canal, o Desk não recebe
            conversa e o Monitoramento fica em zero — não por falta de movimento, por falta de porta
            de entrada.
          </div>
        </div>
      ) : (
        canais.map((c) => (
          <div className="tblwrap" key={c.id}>
            <div className="tblhead">
              <h3>{c.nome}</h3>
              <span className="etiqueta">{ROTULO_TIPO[c.tipo] ?? c.tipo}</span>
              <span className="sub" style={{ marginLeft: 'auto' }}>
                {c.ativo ? 'Ligado' : 'Desligado'} · conectado em {DATA.format(c.criadoEm)}
              </span>
            </div>

            {c.caixas.length === 0 ? (
              <div className="vazio">
                Canal sem caixa de entrada. A conversa que chegar por ele não tem para onde ir.
              </div>
            ) : (
              <div className="scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Caixa de entrada</th>
                      <th>Fila padrão</th>
                      <th>Conversas abertas</th>
                    </tr>
                  </thead>
                  <tbody>
                    {c.caixas.map((cx) => (
                      <tr key={cx.id}>
                        <td className="who">{cx.nome}</td>
                        <td>{cx.filaPadrao ?? <span className="sub">Sem fila padrão</span>}</td>
                        <td className="num">{numero(cx.abertas)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ))
      )}

      <section className="card">
        <h3>Conectar um número de WhatsApp</h3>
        <p className="sub">
          Pelo cadastro embutido da Meta, dentro do Business Manager do cliente: ao fim, o Pipe troca o
          código pelo token, registra o número e aponta o webhook. Não há campo de &ldquo;token do
          canal&rdquo; para preencher. O passo a passo inteiro, com equipe e contatos, está em{' '}
          <a href="/implantacao">Implantação</a>.
        </p>
        <ConectarWhatsApp />
      </section>
    </>
  );
}
