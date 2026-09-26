import Link from '../../components/link';
import { Avatar } from '@pipe/ui';
import { Navigate, useSearchParams } from 'react-router-dom';
import { useEu } from '../../context/session';
import { useSair } from '../../lib/shell';
import { useRead } from '../../lib/query';
import type { AccountInVigor } from '../../lib/account';
import { salvarAccount } from './actions';
import { PADRAO_DE_SITE, RECADOS, ROTULO_DE_FUSO, ROTULO_DE_IDIOMA, TAMANHO } from './regras';
import { Selection } from '../../components/selection';
import './my-account.css';

/**
 * "Minha conta": the company data, the preferences, and the step that closes onboarding.
 *
 * The ENTIRE screen is the source platform's, measured on its DOM and noted in `minha-conta.css`: dark top bar, dark sidebar with the signed-in person's portrait, header with Save on the right, card with two tabs, single column of fields with the label inside the box, and the terms line at the bottom. Only the colors, typeface, brand and icons are ours.
 *
 * The chrome is THIS page's OWN (like the portal's): `/minha-conta` sits outside Gestão's shell in `estrutura-gestao.tsx`, because here the account may not yet have a channel, queue or agent — the product's sidebar would show an empty operation to someone who hasn't even said what company they're from yet.
 *
 * The field rules are their `lib/AccountIndex.js`'s: name (6 to 250, required), email (read-only), phone (required), site (required, with regex), company size as a RANGE, city, state, country, contact consent — and, on the second tab, language and timezone.
 *
 * One conscious difference, noted in the report: state is a list of the 27 Brazilian states and country is free text. There, city comes from Google Places and state/country arrive locked, filled by the service; here that would cost an API key and a network dependency on the first screen of someone who just signed up.
 */
/** The 27 Brazilian states, in alphabetical order. */
const ESTADOS = [
  'AC',
  'AL',
  'AP',
  'AM',
  'BA',
  'CE',
  'DF',
  'ES',
  'GO',
  'MA',
  'MT',
  'MS',
  'MG',
  'PA',
  'PB',
  'PR',
  'PE',
  'PI',
  'RJ',
  'RN',
  'RS',
  'RO',
  'RR',
  'SC',
  'SP',
  'SE',
  'TO',
] as const;

export function PageMyAccount() {
  const eu = useEu();
  const sair = useSair();
  const [search] = useSearchParams();
  const parametros = {
    erro: search.get('erro') ?? undefined,
    campo: search.get('campo') ?? undefined,
  };
  const read = useRead<AccountInVigor>('/v1/account');
  if (read.error) return <Navigate to="/login" replace />;
  if (!read.data) return null;
  const account = read.data;

  const firstVez = account.onboardingConcluidoEm === null;
  /*
   * The field the server refused comes back marked. `data-erro` only exists when there is one, and it's what lights up the red ring on the right box.
   */
  const recusado = (nome: string) => (parametros.campo === nome ? '' : undefined);

  return (
    <div className="conta-pagina">
      {/* ------------------------------------------------- a barra superior */}
      <header className="conta-barra">
        <div className="conta-barra-esq">
          <span className="conta-barra-marca" role="img" aria-label="Pipe" />
          <span className="conta-barra-risco" />
          <nav>
            <a href="/my-account" aria-current="page">
              Minha conta
            </a>
            <Link href="/portal">Portal</Link>
            {/*
 * Desk doesn't have our screen yet. Grayed out, not hidden: that's what the source does, and hiding it would conceal that the product has it.
 */}
            <span aria-disabled="true">Desk</span>
          </nav>
        </div>

        <div className="conta-barra-dir">
          <Avatar nome={eu.user.nome} />
          <span className="conta-barra-eu">
            <b>{eu.user.nome}</b>
            {/*
 * Signing out ends the session, and ending a session changes state: it goes through POST, never through a link.
 */}
            <form
              onSubmit={(evento) => {
                evento.preventDefault();
                void sair();
              }}
            >
              <button type="submit">Sair</button>
            </form>
          </span>
        </div>
      </header>

      <div className="conta-corpo">
        {/* ---------------------------------------------------- a lateral */}
        <aside className="conta-lateral">
          <Avatar nome={eu.user.nome} />
          <p className="conta-lateral-nome" title={eu.user.nome}>
            {eu.user.nome}
          </p>
          <hr />
          <dl className="conta-lateral-info">
            <dt>Nome</dt>
            <dd title={eu.user.nome}>{eu.user.nome}</dd>
            <dt>E-mail</dt>
            <dd title={eu.user.email}>{eu.user.email}</dd>
          </dl>
          <hr />
        </aside>

        {/* --------------------------------------------------- content */}
        <main className="conta-conteudo">
          <form id="conta-form" action={salvarAccount} className="conta-form">
            <div className="conta-cabecalho">
              <h1>{firstVez ? 'Sobre a sua empresa' : 'Minha conta'}</h1>
              <button type="submit" className="conta-botao">
                {firstVez ? 'Salvar e abrir o portal' : 'Salvar alterações'}
              </button>
            </div>
            <hr className="conta-regua" />

            <div className="conta-area">
              <section className="conta-cartao">
                <ul className="conta-abas">
                  <li>
                    <input type="radio" name="aba" id="conta-aba-perfil" defaultChecked />
                    <label htmlFor="conta-aba-perfil">Meu perfil</label>
                  </li>
                  <li>
                    <input type="radio" name="aba" id="conta-aba-preferencias" />
                    <label htmlFor="conta-aba-preferencias">Preferências</label>
                  </li>
                </ul>

                {/* ------------------------------------------ aba: perfil */}
                <div className="conta-painel conta-painel-perfil">
                  {parametros.erro ? (
                    <p className="conta-aviso" role="alert">
                      {parametros.erro}
                    </p>
                  ) : null}

                  <label className="conta-campo" data-erro={recusado('nome')}>
                    <span data-obrigatorio="">Nome da empresa</span>
                    <input
                      name="nome"
                      type="text"
                      required
                      minLength={TAMANHO.nomeMin}
                      maxLength={TAMANHO.nomeMax}
                      defaultValue={account.nome}
                    />
                  </label>
                  <p className="conta-recado">{RECADOS.nome}</p>

                  {/*
 * Read-only, as in the source: email is the sign-in key, and changing it here would change the person, not the data.
 */}
                  <label className="conta-campo">
                    <span>Seu e-mail</span>
                    <input type="email" value={eu.user.email} readOnly disabled />
                  </label>

                  <label className="conta-campo" data-erro={recusado('telefone')}>
                    <span data-obrigatorio="">Telefone</span>
                    <input
                      name="telefone"
                      type="tel"
                      required
                      maxLength={TAMANHO.telefoneMax}
                      placeholder="+55 31 99999-0000"
                      defaultValue={account.telefone ?? ''}
                    />
                  </label>
                  <p className="conta-recado">{RECADOS.telefone}</p>

                  <label className="conta-campo" data-erro={recusado('site')}>
                    <span data-obrigatorio="">Site da empresa</span>
                    <input
                      name="site"
                      type="text"
                      required
                      minLength={TAMANHO.siteMin}
                      maxLength={TAMANHO.siteMax}
                      pattern={PADRAO_DE_SITE}
                      placeholder="empresa.com.br"
                      defaultValue={account.site ?? ''}
                    />
                  </label>
                  <p className="conta-recado">{RECADOS.site}</p>

                  <label className="conta-campo" data-erro={recusado('funcionarios')}>
                    <span>Tamanho da empresa</span>
                    <Selection name="funcionarios" defaultValue={account.funcionarios ?? ''} aria-label="Tamanho da empresa">
                      <option value="">Selecionar</option>
                      {account.faixasDeFuncionarios.map((faixa) => (
                        <option key={faixa} value={faixa}>
                          {faixa} funcionários
                        </option>
                      ))}
                    </Selection>
                  </label>
                  <p className="conta-recado">{RECADOS.funcionarios}</p>

                  <label className="conta-campo">
                    <span>Cidade</span>
                    <input
                      name="cidade"
                      type="text"
                      maxLength={TAMANHO.cidadeMax}
                      defaultValue={account.city ?? ''}
                    />
                  </label>

                  <label className="conta-campo">
                    <span>Estado</span>
                    <Selection name="estado" defaultValue={account.state ?? ''} aria-label="Estado">
                      <option value="">Selecionar</option>
                      {ESTADOS.map((uf) => (
                        <option key={uf} value={uf}>
                          {uf}
                        </option>
                      ))}
                    </Selection>
                  </label>

                  <label className="conta-campo">
                    <span>País</span>
                    <input
                      name="pais"
                      type="text"
                      maxLength={TAMANHO.paisMax}
                      defaultValue={account.pais ?? 'Brasil'}
                    />
                  </label>

                  <label className="conta-aceite">
                    <input
                      type="checkbox"
                      name="optinWhatsapp"
                      defaultChecked={account.optinWhatsapp}
                    />
                    <span>Contato via WhatsApp</span>
                  </label>
                </div>

                {/* ------------------------------------- tab: preferences */}
                <div className="conta-painel conta-painel-preferencias">
                  <label className="conta-campo" data-erro={recusado('idioma')}>
                    <span>Idioma</span>
                    <Selection name="idioma" defaultValue={account.idioma} aria-label="Idioma">
                      {account.idiomas.map((codigo) => (
                        <option key={codigo} value={codigo}>
                          {ROTULO_DE_IDIOMA[codigo] ?? codigo}
                        </option>
                      ))}
                    </Selection>
                  </label>
                  <p className="conta-recado">{RECADOS.idioma}</p>

                  {/*
 * The timezone decides what "today" means on every card and every report: changing it redraws where the day cuts off, not just the time label.
 */}
                  <label className="conta-campo" data-erro={recusado('fuso')}>
                    <span>Fuso horário</span>
                    <Selection name="fuso" defaultValue={account.fuso} aria-label="Fuso horário">
                      {account.fusos.map((nome) => (
                        <option key={nome} value={nome}>
                          {ROTULO_DE_FUSO[nome] ?? nome}
                        </option>
                      ))}
                    </Selection>
                  </label>
                  <p className="conta-recado">{RECADOS.fuso}</p>
                </div>

                {/*
 * Inside the card and below both panels, as in the source: it's the "Save changes" button's contract, and it applies to both tabs.
 */}
                <p className="conta-termos">
                  Ao clicar em salvar alterações, eu aceito os{' '}
                  <a href="https://pipe.com.br/termos" target="_blank" rel="noreferrer">
                    Termos de Uso e Privacidade do Pipe
                  </a>
                </p>
              </section>
            </div>
          </form>
        </main>
      </div>
    </div>
  );
}
