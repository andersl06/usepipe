import Link from 'next/link';
import { Avatar, Campo, Etiqueta } from '@pipe/ui';
import { Block, SectionHeader } from '../../../components/settings/cabecalho';
import { Formulario } from '../../../components/settings/formulario';
import { SeletorDeTema } from '../../../components/settings/seletor-de-tema';
import { lerEspaco, userCurrent } from '../../../lib/settings-data';
import { dataHora } from '../../../lib/format';
import { acaoSalvarPerfil } from '../actions';

export const dynamic = 'force-dynamic';

/**
 * The person's profile.
 *
 * In Twenty this is TWO screens: "Profile" (photo, name, email, password, danger zone)
 * and "Experience" (theme, language, density, date and number formats). Here it's
 * one, and the reason is countable: of the thirteen things those two screens offer
 * there, Pipe has four. A screen with four controls and another with one wouldn't be
 * two screens — they'd be one screen and a waiting room.
 *
 * What was left out, and why:
 *
 * - **Separate last name.** `usuario.nome` is a single field, and splitting it in two
 *   would require a migration to solve a problem nobody has.
 * - **Change email, change password, delete the account, end sessions.** All of
 *   these depend on the CRM's own session, which doesn't exist yet (`banco.ts`
 *   resolves everything through an environment variable). A button that doesn't do
 *   what it promises is worse than no button, and the project's rule is explicit: an
 *   item that doesn't work doesn't appear.
 * - **Interface density and date formats.** The density scale belongs to the design
 *   system and applies equally to all three apps; making it configurable per person
 *   would undo what `packages/ui` exists to guarantee.
 */
export default async function PageProfile() {
  const pessoa = await userCurrent();
  const espaco = await lerEspaco();

  return (
    <>
      <SectionHeader titulo="Perfil">
        Seu nome e sua foto, como as outras pessoas do espaço veem, e o tema desta tela.
      </SectionHeader>

      <Block titulo="Foto e nome" description="É o que aparece ao lado de cada lead que é seu.">
        <Formulario acao={acaoSalvarPerfil}>
          <div className="cfg-avatar">
            <Avatar nome={pessoa.nome} />
            <label className="cfg-campo">
              <span>Nome</span>
              <Campo
                name="nome"
                defaultValue={pessoa.nome}
                required
                maxLength={120}
                autoComplete="name"
              />
            </label>
          </div>
          <label className="cfg-campo">
            <span>Endereço da foto</span>
            <Campo
              name="avatarUrl"
              type="url"
              defaultValue={pessoa.avatarUrl ?? ''}
              placeholder="https://…"
              inputMode="url"
            />
            <span className="sub">
              Em branco, o Pipe usa as iniciais do nome. Envio de arquivo entra quando houver
              armazenamento de imagem no CRM.
            </span>
          </label>
        </Formulario>
      </Block>

      <Block
        titulo="Acesso"
        description="O e-mail é a chave da conta: trocar exige refazer o vínculo com o Google."
      >
        <dl className="cfg-lista">
          <div>
            <dt>E-mail</dt>
            <dd className="mono">{pessoa.email}</dd>
          </div>
          <div>
            <dt>Papel</dt>
            <dd>
              {pessoa.papeis.length === 0 ? (
                <span className="sub">Nenhum papel atribuído.</span>
              ) : (
                pessoa.papeis.map((p) => <Etiqueta key={p}>{p}</Etiqueta>)
              )}
            </dd>
          </div>
          <div>
            <dt>Último acesso</dt>
            <dd>{dataHora(pessoa.ultimoAccessIn, espaco.fuso)}</dd>
          </div>
        </dl>
      </Block>

      <Block
        titulo="Aparência"
        description="Fica guardado neste navegador. Cada aparelho tem a sua escolha."
      >
        <SeletorDeTema />
      </Block>

      <Block
        titulo="Idioma e fuso"
        description="Os dois são do espaço de trabalho, não da pessoa: relatório e SLA precisam do mesmo dia para todo mundo."
      >
        <dl className="cfg-lista">
          <div>
            <dt>Idioma</dt>
            <dd>Português (Brasil)</dd>
          </div>
          <div>
            <dt>Fuso horário</dt>
            <dd className="mono">{espaco.fuso}</dd>
          </div>
        </dl>
        <p className="sub">
          O fuso se muda em <Link href="/settings/workspace">Espaço de trabalho</Link>.
        </p>
      </Block>
    </>
  );
}
