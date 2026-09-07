import { Campo, Etiqueta, Seletor } from '@pipe/ui';
import { Bloco, CabecalhoDaSecao } from '../../../componentes/configuracoes/cabecalho';
import { Formulario } from '../../../componentes/configuracoes/formulario';
import { lerEspaco } from '../../../lib/configuracoes-dados';
import { numero } from '../../../lib/formato';
import { acaoSalvarEspaco } from '../acoes';

export const dynamic = 'force-dynamic';

/**
 * A lista de fusos vem do runtime, não de uma constante nossa.
 *
 * Lista escrita à mão envelhece a cada país que muda de horário de verão, e o
 * jeito de descobrir é um relatório sair com uma hora de diferença. `Intl` já
 * carrega o banco de fusos do sistema; usar outra fonte seria manter uma cópia
 * pior da mesma coisa.
 *
 * O `catch` cobre runtime antigo sem `supportedValuesOf`: sem a lista, o que
 * resta é o fuso atual, e o campo continua salvável.
 */
function fusosConhecidos(atual: string): string[] {
  try {
    const todos = Intl.supportedValuesOf('timeZone');
    return todos.includes(atual) ? [...todos] : [atual, ...todos];
  } catch {
    return [atual];
  }
}

const PLANOS: Record<string, string> = {
  essencial: 'Essencial',
  operacao: 'Operação',
  escala: 'Escala',
};

/**
 * Espaço de trabalho.
 *
 * É o "General" do Twenty, com a mesma ordem: imagem, nome, domínio, e a zona de
 * perigo por último. A zona de perigo **não veio**: "excluir o espaço de
 * trabalho" num produto multi-tenant com RLS apaga o cliente inteiro em cascata,
 * e isso é operação de contrato, não botão de tela — quem cancela fala com
 * alguém, e o `tenant.ativo` é o que desliga.
 *
 * O domínio é leitura. Ele existe para descobrir o tenant a partir do login
 * (`identidade.ts`) e só vale VERIFICADO, por registro TXT no DNS: um campo de
 * texto aqui deixaria qualquer administrador reivindicar `@banco.com.br` e
 * receber, no dia seguinte, quem tentasse entrar com aquele endereço.
 */
export default async function PaginaEspaco() {
  const espaco = await lerEspaco();
  const fusos = fusosConhecidos(espaco.fuso);

  return (
    <>
      <CabecalhoDaSecao titulo="Espaço de trabalho">
        O nome, a marca e o fuso que o Pipe usa para fechar o dia de todo mundo.
      </CabecalhoDaSecao>

      <Bloco titulo="Identidade" descricao="Aparece no cabeçalho, nos relatórios e nos e-mails.">
        <Formulario acao={acaoSalvarEspaco}>
          <label className="cfg-campo">
            <span>Nome da empresa</span>
            <Campo name="nome" defaultValue={espaco.nome} required maxLength={120} />
          </label>

          <label className="cfg-campo">
            <span>Endereço do logo</span>
            <Campo
              name="logoUrl"
              type="url"
              defaultValue={espaco.logoUrl ?? ''}
              placeholder="https://…"
              inputMode="url"
            />
            <span className="sub">
              Em branco, o Pipe usa o símbolo próprio. O logo é configuração, nunca build separado.
            </span>
          </label>

          <label className="cfg-campo">
            <span>Fuso horário</span>
            <Seletor name="fuso" defaultValue={espaco.fuso}>
              {fusos.map((fuso) => (
                <option key={fuso} value={fuso}>
                  {fuso}
                </option>
              ))}
            </Seletor>
            <span className="sub">
              É ele que decide onde o mês começa nos indicadores — não o fuso do servidor.
            </span>
          </label>
        </Formulario>
      </Bloco>

      <Bloco
        titulo="Contrato"
        descricao="Plano e hospedagem são de contrato: mudam com alguém do outro lado, não por botão."
      >
        <dl className="cfg-lista">
          <div>
            <dt>Identificador</dt>
            <dd className="mono">{espaco.slug}</dd>
          </div>
          <div>
            <dt>Plano</dt>
            <dd>
              <Etiqueta>{PLANOS[espaco.plano] ?? espaco.plano}</Etiqueta>
            </dd>
          </div>
          <div>
            <dt>Hospedagem</dt>
            <dd>
              {espaco.implantacao === 'dedicada' ? 'Instância dedicada' : 'Infraestrutura compartilhada'}
            </dd>
          </div>
          <div>
            <dt>Acessos ativos</dt>
            <dd className="num">{numero(espaco.membros)}</dd>
          </div>
        </dl>
      </Bloco>

      <Bloco
        titulo="Domínios"
        descricao="Quem entra com um e-mail destes cai neste espaço — e por isso só vale depois de verificado no DNS."
      >
        {espaco.dominios.length === 0 ? (
          <p className="sub">
            Nenhum domínio cadastrado. Sem domínio verificado, a única porta de entrada é o convite.
          </p>
        ) : (
          <ul className="cfg-dominios">
            {espaco.dominios.map((d) => (
              <li key={d.dominio}>
                <span className="mono">{d.dominio}</span>
                <Etiqueta tom={d.verificado ? 'sucesso' : 'alerta'}>
                  {d.verificado ? 'Verificado' : 'Aguardando verificação'}
                </Etiqueta>
              </li>
            ))}
          </ul>
        )}
      </Bloco>
    </>
  );
}
