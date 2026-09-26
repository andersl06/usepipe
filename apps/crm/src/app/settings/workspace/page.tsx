import { Campo, Etiqueta, Seletor } from '@pipe/ui';
import { Block, SectionHeader } from '../../../components/settings/cabecalho';
import { Formulario } from '../../../components/settings/formulario';
import { lerEspaco } from '../../../lib/settings-data';
import { numero } from '../../../lib/format';
import { acaoSalvarEspaco } from '../actions';

export const dynamic = 'force-dynamic';

/**
 * The timezone list comes from the runtime, not from a constant of ours.
 *
 * A hand-written list ages every time a country changes its daylight-saving rules, and the
 * way you find out is a report coming out an hour off. `Intl` already carries the
 * system's timezone database; using another source would just mean keeping a worse
 * copy of the same thing.
 *
 * The `catch` covers older runtimes without `supportedValuesOf`: without the list, all
 * that's left is the current timezone, and the field stays savable.
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
 * Workspace.
 *
 * This is Twenty's "General", in the same order: image, name, domain, and the danger
 * zone last. The danger zone **wasn't included**: "delete the workspace" in a
 * multi-tenant product with RLS cascades into deleting the whole customer, and that's
 * a contract operation, not a screen button — whoever cancels talks to a person, and
 * `tenant.ativo` is what turns it off.
 *
 * The domain is read-only. It exists to discover the tenant from the login
 * (`identidade.ts`), and it's only valid once VERIFIED, via a DNS TXT record: a
 * free-text field here would let any admin claim `@banco.com.br` and, the next
 * day, receive anyone who tried to log in with that address.
 */
export default async function PageWorkspace() {
  const espaco = await lerEspaco();
  const fusos = fusosConhecidos(espaco.fuso);

  return (
    <>
      <SectionHeader titulo="Espaço de trabalho">
        O nome, a marca e o fuso que o Pipe usa para fechar o dia de todo mundo.
      </SectionHeader>

      <Block titulo="Identidade" description="Aparece no cabeçalho, nos relatórios e nos e-mails.">
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
      </Block>

      <Block
        titulo="Contrato"
        description="Plano e hospedagem são de contrato: mudam com alguém do outro lado, não por botão."
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
              {espaco.deployment === 'dedicada' ? 'Instância dedicada' : 'Infraestrutura compartilhada'}
            </dd>
          </div>
          <div>
            <dt>Acessos ativos</dt>
            <dd className="num">{numero(espaco.members)}</dd>
          </div>
        </dl>
      </Block>

      <Block
        titulo="Domínios"
        description="Quem entra com um e-mail destes cai neste espaço — e por isso só vale depois de verificado no DNS."
      >
        {espaco.dominios.length === 0 ? (
          <p className="sub">
            Nenhum domínio cadastrado. Sem domínio verificado, a única porta de entrada é o convite.
          </p>
        ) : (
          <ul className="cfg-dominios">
            {espaco.dominios.map((d) => (
              <li key={d.domain}>
                <span className="mono">{d.domain}</span>
                <Etiqueta tom={d.verificado ? 'sucesso' : 'alerta'}>
                  {d.verificado ? 'Verificado' : 'Aguardando verificação'}
                </Etiqueta>
              </li>
            ))}
          </ul>
        )}
      </Block>
    </>
  );
}
