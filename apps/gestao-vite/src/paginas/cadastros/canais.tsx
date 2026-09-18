import { useLeitura } from '../../lib/consulta';
import type { CanalDetalhado } from '../../lib/configuracoes';
import { numero } from '../../lib/formato';
import { ConectarWhatsApp } from '../../componentes/cadastro-embutido-whatsapp';

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
export function PaginaCanais() {
  const leitura = useLeitura<CanalDetalhado[]>('/v1/gestao/canais');
  if (!leitura.data) return null;
  const canais = leitura.data;

  return (
    <>
      {/*
        `FICHA-channels.md` §1: sem subtítulo — só o título "Canais de
        atendimento". O maior desalinhamento desta tela não é de layout: a
        Blip mostra um CATÁLOGO de integrações para conectar (Pipe Desk,
        Salesforce, Salesforce MIAW, Canal Personalizado — §2), enquanto esta
        tela mostra o PAINEL dos canais já conectados, com caixa de entrada,
        fila padrão e conversas abertas de verdade. Trocar uma coisa pela
        outra faria a tela "bater" na estrutura e perder o dado real — e
        inventar botões "Conectar Salesforce"/"Conectar Salesforce MIAW"
        seria simular integração que este produto não tem. Por isso a tela
        segue mostrando canal real, e este desencontro fica registrado aqui
        e no relatório da tarefa, para decisão de produto, não de CSS.
      */}
      <div className="board-head">
        <h2>Canais</h2>
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
                {c.ativo ? 'Ligado' : 'Desligado'} · conectado em {DATA.format(new Date(c.criadoEm))}
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
          Pelo cadastro embutido da Meta, dentro do Business Manager do cliente: ao fim, o Pipe
          troca o código pelo token, registra o número e aponta o webhook. Não há campo de
          &ldquo;token do canal&rdquo; para preencher. O passo a passo inteiro, com equipe e
          contatos, está em <a href="/implantacao">Implantação</a>.
        </p>
        <ConectarWhatsApp />
      </section>
    </>
  );
}
