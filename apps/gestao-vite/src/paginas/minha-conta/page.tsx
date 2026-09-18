import Link from '../../componentes/link';
import { Avatar } from '@pipe/ui';
import { Navigate, useSearchParams } from 'react-router-dom';
import { useEu } from '../../contexto/sessao';
import { useSair } from '../../lib/casca';
import { useLeitura } from '../../lib/consulta';
import type { ContaEmVigor } from '../../lib/conta';
import { salvarConta } from './acoes';
import { PADRAO_DE_SITE, RECADOS, ROTULO_DE_FUSO, ROTULO_DE_IDIOMA, TAMANHO } from './regras';
import './minha-conta.css';

/**
 * "Minha conta": os dados da empresa, as preferências, e o passo que fecha o
 * onboarding.
 *
 * A TELA INTEIRA é a da plataforma de origem, medida no DOM dela e anotada em
 * `minha-conta.css`: barra superior escura, lateral escura com o retrato de
 * quem entrou, cabeçalho com o Salvar à direita, cartão com duas abas, coluna
 * única de campos com o rótulo dentro da caixa, e a linha de termos embaixo.
 * Só a tinta, a letra, a marca e os ícones são nossos.
 *
 * O cromo é PRÓPRIO desta página (como no portal): `/minha-conta` está fora do
 * casco da Gestão em `estrutura-gestao.tsx`, porque aqui a conta pode ainda não
 * ter canal, fila nem atendente — a lateral do produto mostraria uma operação
 * vazia para quem ainda nem disse de que empresa é.
 *
 * As regras dos campos são as do `lib/AccountIndex.js` deles: nome (6 a 250,
 * obrigatório), e-mail (só leitura), telefone (obrigatório), site (obrigatório,
 * com regex), tamanho da empresa em FAIXA, cidade, estado, país, aceite de
 * contato — e, na segunda aba, idioma e fuso.
 *
 * Uma diferença consciente, no relatório: estado é lista das 27 UFs e país é
 * texto. Lá cidade vem do Google Places e estado/país chegam travados,
 * preenchidos pelo serviço; aqui isso custaria uma chave de API e uma
 * dependência de rede na primeira tela de quem acabou de entrar.
 */
/** As 27 unidades da federação, na ordem do alfabeto. */
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

export function PaginaMinhaConta() {
  const eu = useEu();
  const sair = useSair();
  const [busca] = useSearchParams();
  const parametros = {
    erro: busca.get('erro') ?? undefined,
    campo: busca.get('campo') ?? undefined,
  };
  const leitura = useLeitura<ContaEmVigor>('/v1/conta');
  if (leitura.error) return <Navigate to="/entrar" replace />;
  if (!leitura.data) return null;
  const conta = leitura.data;

  const primeiraVez = conta.onboardingConcluidoEm === null;
  /* O campo que o servidor recusou volta marcado. `data-erro` só existe quando
     há um, e é ele que acende o anel vermelho na caixa certa. */
  const recusado = (nome: string) => (parametros.campo === nome ? '' : undefined);

  return (
    <div className="conta-pagina">
      {/* ------------------------------------------------- a barra superior */}
      <header className="conta-barra">
        <div className="conta-barra-esq">
          <span className="conta-barra-marca" role="img" aria-label="Pipe" />
          <span className="conta-barra-risco" />
          <nav>
            <a href="/minha-conta" aria-current="page">
              Minha conta
            </a>
            <Link href="/portal">Portal</Link>
            {/* O Desk ainda não tem tela nossa. Apagado, e não escondido: é o
                que a origem faz, e some-lo esconderia que o produto o tem. */}
            <span aria-disabled="true">Desk</span>
          </nav>
        </div>

        <div className="conta-barra-dir">
          <Avatar nome={eu.usuario.nome} />
          <span className="conta-barra-eu">
            <b>{eu.usuario.nome}</b>
            {/* Sair encerra sessão, e encerrar sessão muda estado: vai em POST,
                nunca num link. */}
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
          <Avatar nome={eu.usuario.nome} />
          <p className="conta-lateral-nome" title={eu.usuario.nome}>
            {eu.usuario.nome}
          </p>
          <hr />
          <dl className="conta-lateral-info">
            <dt>Nome</dt>
            <dd title={eu.usuario.nome}>{eu.usuario.nome}</dd>
            <dt>E-mail</dt>
            <dd title={eu.usuario.email}>{eu.usuario.email}</dd>
          </dl>
          <hr />
        </aside>

        {/* --------------------------------------------------- o conteúdo */}
        <main className="conta-conteudo">
          <form id="conta-form" action={salvarConta} className="conta-form">
            <div className="conta-cabecalho">
              <h1>{primeiraVez ? 'Sobre a sua empresa' : 'Minha conta'}</h1>
              <button type="submit" className="conta-botao">
                {primeiraVez ? 'Salvar e abrir o portal' : 'Salvar alterações'}
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
                      defaultValue={conta.nome}
                    />
                  </label>
                  <p className="conta-recado">{RECADOS.nome}</p>

                  {/* Só leitura, como na origem: e-mail é a chave da entrada, e
                      trocá-lo aqui trocaria de pessoa, não de dado. */}
                  <label className="conta-campo">
                    <span>Seu e-mail</span>
                    <input type="email" value={eu.usuario.email} readOnly disabled />
                  </label>

                  <label className="conta-campo" data-erro={recusado('telefone')}>
                    <span data-obrigatorio="">Telefone</span>
                    <input
                      name="telefone"
                      type="tel"
                      required
                      maxLength={TAMANHO.telefoneMax}
                      placeholder="+55 31 99999-0000"
                      defaultValue={conta.telefone ?? ''}
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
                      defaultValue={conta.site ?? ''}
                    />
                  </label>
                  <p className="conta-recado">{RECADOS.site}</p>

                  <label className="conta-campo" data-erro={recusado('funcionarios')}>
                    <span>Tamanho da empresa</span>
                    <select name="funcionarios" defaultValue={conta.funcionarios ?? ''}>
                      <option value="">Selecionar</option>
                      {conta.faixasDeFuncionarios.map((faixa) => (
                        <option key={faixa} value={faixa}>
                          {faixa} funcionários
                        </option>
                      ))}
                    </select>
                  </label>
                  <p className="conta-recado">{RECADOS.funcionarios}</p>

                  <label className="conta-campo">
                    <span>Cidade</span>
                    <input
                      name="cidade"
                      type="text"
                      maxLength={TAMANHO.cidadeMax}
                      defaultValue={conta.cidade ?? ''}
                    />
                  </label>

                  <label className="conta-campo">
                    <span>Estado</span>
                    <select name="estado" defaultValue={conta.estado ?? ''}>
                      <option value="">Selecionar</option>
                      {ESTADOS.map((uf) => (
                        <option key={uf} value={uf}>
                          {uf}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="conta-campo">
                    <span>País</span>
                    <input
                      name="pais"
                      type="text"
                      maxLength={TAMANHO.paisMax}
                      defaultValue={conta.pais ?? 'Brasil'}
                    />
                  </label>

                  <label className="conta-aceite">
                    <input
                      type="checkbox"
                      name="optinWhatsapp"
                      defaultChecked={conta.optinWhatsapp}
                    />
                    <span>Contato via WhatsApp</span>
                  </label>
                </div>

                {/* ------------------------------------- aba: preferências */}
                <div className="conta-painel conta-painel-preferencias">
                  <label className="conta-campo" data-erro={recusado('idioma')}>
                    <span>Idioma</span>
                    <select name="idioma" defaultValue={conta.idioma}>
                      {conta.idiomas.map((codigo) => (
                        <option key={codigo} value={codigo}>
                          {ROTULO_DE_IDIOMA[codigo] ?? codigo}
                        </option>
                      ))}
                    </select>
                  </label>
                  <p className="conta-recado">{RECADOS.idioma}</p>

                  {/* O fuso decide o que é "hoje" em todo cartão e todo
                      relatório: trocá-lo redesenha o corte do dia, não só o
                      rótulo da hora. */}
                  <label className="conta-campo" data-erro={recusado('fuso')}>
                    <span>Fuso horário</span>
                    <select name="fuso" defaultValue={conta.fuso}>
                      {conta.fusos.map((nome) => (
                        <option key={nome} value={nome}>
                          {ROTULO_DE_FUSO[nome] ?? nome}
                        </option>
                      ))}
                    </select>
                  </label>
                  <p className="conta-recado">{RECADOS.fuso}</p>
                </div>

                {/* Dentro do cartão e abaixo dos dois painéis, como na origem:
                    é o contrato do botão "Salvar alterações", e vale para as
                    duas abas. */}
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
