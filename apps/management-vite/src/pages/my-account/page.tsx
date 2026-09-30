import Link from '../../components/link';
import { Avatar } from '@pipe/ui';
import { Navigate, useSearchParams } from 'react-router-dom';
import { useEu } from '../../context/session';
import { useSair } from '../../lib/shell';
import { useRead } from '../../lib/query';
import type { AccountInForce } from '../../lib/account';
import { APPLICATION } from '../../lib/application-paths';
import { saveAccount } from './actions';
import { PADRAO_DE_SITE, RECADOS, ROTULO_DE_FUSO, ROTULO_DE_IDIOMA, TAMANHO } from './regras';
import { Select } from '@pipe/ui/select';
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
  const read = useRead<AccountInForce>('/v1/account');
  if (read.error) return <Navigate to="/login" replace />;
  if (!read.data) return null;
  const account = read.data;

  const firstTime = account.onboardingConcluidoEm === null;
  const preferenciasAbertas = search.get('aba') === 'preferencias';
  /*
   * The field the server refused comes back marked. `data-erro` only exists when there is one, and it's what lights up the red ring on the right box.
   */
  const recusado = (nome: string) => (parametros.campo === nome ? '' : undefined);

  return (
    <div className="account-page">
      {/* ------------------------------------------------- a barra superior */}
      <header className="account-bar">
        <div className="account-bar-left">
          <span className="account-bar-brand" role="img" aria-label="Pipe" />
          <span className="account-bar-risk" />
          <nav>
            <a href="/my-account" aria-current="page">
              Minha conta
            </a>
            <Link href={APPLICATION}>Portal</Link>
            {/*
 * Desk doesn't have our screen yet. Grayed out, not hidden: that's what the source does, and hiding it would conceal that the product has it.
 */}
            <span aria-disabled="true">Desk</span>
          </nav>
        </div>

        <div className="account-bar-right">
          <Avatar nome={eu.user.nome} />
          <span className="account-bar-me">
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

      <div className="account-body">
        {/* ---------------------------------------------------- a lateral */}
        <aside className="account-side">
          <Avatar nome={eu.user.nome} />
          <p className="account-side-name" title={eu.user.nome}>
            {eu.user.nome}
          </p>
          <hr />
          <dl className="account-side-info">
            <dt>Nome</dt>
            <dd title={eu.user.nome}>{eu.user.nome}</dd>
            <dt>E-mail</dt>
            <dd title={eu.user.email}>{eu.user.email}</dd>
          </dl>
          <hr />
        </aside>

        {/* --------------------------------------------------- content */}
        <main className="account-content">
          <form id="conta-form" action={saveAccount} className="account-form">
            <div className="account-header">
              <h1>{firstTime ? 'Sobre a sua empresa' : 'Perfil da empresa'}</h1>
              <button type="submit" className="account-button">
                {firstTime ? 'Salvar e abrir o portal' : 'Salvar alterações'}
              </button>
            </div>
            <hr className="account-ruler" />

            <div className="account-area">
              <section className="account-card">
                <ul className="account-tabs">
                  <li>
                    <input
                      type="radio"
                      name="aba"
                      id="conta-aba-perfil"
                      defaultChecked={!preferenciasAbertas}
                    />
                    <label htmlFor="conta-aba-perfil">Empresa</label>
                  </li>
                  <li>
                    <input
                      type="radio"
                      name="aba"
                      id="conta-aba-preferencias"
                      defaultChecked={preferenciasAbertas}
                    />
                    <label htmlFor="conta-aba-preferencias">Preferências</label>
                  </li>
                </ul>

                {/* ------------------------------------------ aba: perfil */}
                <div className="account-panel account-panel-profile">
                  {parametros.erro ? (
                    <p className="account-notice" role="alert">
                      {parametros.erro}
                    </p>
                  ) : null}

                  <label className="account-field" data-error={recusado('nome')}>
                    <span data-obrigatorio="">Nome da empresa</span>
                    <input
                      name="nome"
                      type="text"
                      required
                      minLength={TAMANHO.nomeMin}
                      maxLength={TAMANHO.nomeMax}
                      defaultValue={account.name}
                    />
                  </label>
                  <p className="account-note">{RECADOS.nome}</p>

                  {/*
 * Read-only, as in the source: email is the sign-in key, and changing it here would change the person, not the data.
 */}
                  <label className="account-field">
                    <span>E-mail de acesso</span>
                    <input type="email" value={eu.user.email} readOnly disabled />
                  </label>

                  <label className="account-field" data-error={recusado('telefone')}>
                    <span data-obrigatorio="">Telefone</span>
                    <input
                      name="telefone"
                      type="tel"
                      required
                      maxLength={TAMANHO.telefoneMax}
                      placeholder="+55 31 99999-0000"
                      defaultValue={account.phone ?? ''}
                    />
                  </label>
                  <p className="account-note">{RECADOS.telefone}</p>

                  <label className="account-field" data-error={recusado('site')}>
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
                  <p className="account-note">{RECADOS.site}</p>

                  <label className="account-field" data-error={recusado('funcionarios')}>
                    <span>Tamanho da empresa</span>
                    <Select name="funcionarios" defaultValue={account.employees ?? ''} aria-label="Tamanho da empresa">
                      <option value="">Selecionar</option>
                      {account.faixasDeFuncionarios.map((faixa) => (
                        <option key={faixa} value={faixa}>
                          {faixa} funcionários
                        </option>
                      ))}
                    </Select>
                  </label>
                  <p className="account-note">{RECADOS.funcionarios}</p>

                  <label className="account-field">
                    <span>Cidade</span>
                    <input
                      name="cidade"
                      type="text"
                      maxLength={TAMANHO.cidadeMax}
                      defaultValue={account.city ?? ''}
                    />
                  </label>

                  <label className="account-field">
                    <span>Estado</span>
                    <Select name="estado" defaultValue={account.state ?? ''} aria-label="Estado">
                      <option value="">Selecionar</option>
                      {ESTADOS.map((uf) => (
                        <option key={uf} value={uf}>
                          {uf}
                        </option>
                      ))}
                    </Select>
                  </label>

                  <label className="account-field">
                    <span>País</span>
                    <input
                      name="pais"
                      type="text"
                      maxLength={TAMANHO.paisMax}
                      defaultValue={account.pais ?? 'Brasil'}
                    />
                  </label>

                  <label className="account-acceptance">
                    <input
                      type="checkbox"
                      name="optinWhatsapp"
                      defaultChecked={account.optinWhatsapp}
                    />
                    <span>Quero receber comunicações pelo WhatsApp</span>
                  </label>
                </div>

                {/* ------------------------------------- tab: preferences */}
                <div className="account-panel account-panel-preferences">
                  <label className="account-field" data-error={recusado('idioma')}>
                    <span>Idioma</span>
                    <Select name="idioma" defaultValue={account.idioma} aria-label="Idioma">
                      {account.idiomas.map((codigo) => (
                        <option key={codigo} value={codigo}>
                          {ROTULO_DE_IDIOMA[codigo] ?? codigo}
                        </option>
                      ))}
                    </Select>
                  </label>
                  <p className="account-note">{RECADOS.idioma}</p>

                  {/*
 * The timezone decides what "today" means on every card and every report: changing it redraws where the day cuts off, not just the time label.
 */}
                  <label className="account-field" data-error={recusado('fuso')}>
                    <span>Fuso horário</span>
                    <Select name="fuso" defaultValue={account.fuso} aria-label="Fuso horário">
                      {account.fusos.map((nome) => (
                        <option key={nome} value={nome}>
                          {ROTULO_DE_FUSO[nome] ?? nome}
                        </option>
                      ))}
                    </Select>
                  </label>
                  <p className="account-note">{RECADOS.fuso}</p>
                </div>

                {/*
 * Inside the card and below both panels, as in the source: it's the "Save changes" button's contract, and it applies to both tabs.
 */}
                <p className="account-terms">
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
