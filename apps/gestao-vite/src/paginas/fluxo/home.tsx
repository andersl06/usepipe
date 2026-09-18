import { Avatar } from '@pipe/ui';
import { BarrasDoContato, useContato } from './contato';
import {
  CartaoCanais,
  CartaoEquipe,
  CartaoExtensoes,
  CartaoMetricas,
  CartaoPreferencias,
} from './cartoes';
import { useCascaDoPortal } from '../../lib/casca';
import './fluxo.css';

/**
 * A tela do contato — o `auth.application.detail.home` da origem,
 * `/application/detail/{shortName}/home`.
 *
 * É onde a criação do roteador TERMINA: lá o `goToApplicationDetails()` faz
 * `$state.go('auth.application.detail.home', { shortName })`, e é por isso que
 * `criar/roteador/acoes.ts` passou a redirecionar para cá.
 *
 * A régua é o bundle `supernova.blip.ai/portal.js` (25.203.0-v0.43.0) — o
 * template `application.home` (módulo 77021) e o controlador `HomeController`
 * (módulo 84909) —, mais a folha `portal.css` para a disposição da grade.
 *
 * ═══ A ROTA É PELO `id`, E ISSO É UMA DIVERGÊNCIA CONSCIENTE ═══
 *
 * Lá a URL leva o `shortName`, que é a chave do contato na plataforma. Aqui a
 * coluna `fluxo.short_name` existe (migration 0020) mas NÃO é única — não há
 * índice, e a unicidade é conferida sobre `nome` na criação. Rotear por um
 * campo que pode repetir é escolher, na sorte do `limit(1)`, qual dos dois
 * contatos a pessoa abre. Fica pelo `id` até haver índice único; o `shortName`
 * continua sendo o que a tela MOSTRA, no lugar onde a origem escreve "Id:".
 *
 * ═══ O QUE A ORIGEM MOSTRA E NÓS NÃO TEMOS ═══
 *
 * O miolo dela é uma grade de até cinco áreas — Extensões, Canais, Equipe,
 * Preferências e Métricas. Cada cartão (`cartoes.tsx`) recebe o dado por prop
 * e aplica a condição do template de origem; esta página passa o que o Pipe
 * tem, e vazio no que não tem — e aí é a regra da origem que decide o que some.
 *
 * O cromo é o do PORTAL (`pt-app` + `BarraDoPortal`), como em "Novidades" e no
 * "Painel do contrato": na origem esta tela troca a barra clara do portal pela
 * barra ESCURA do contato, mas a barra de cima continua a mesma. Por isso
 * `/fluxo` entrou na lista de casco próprio de `estrutura-gestao.tsx`.
 */
export function HomeDoContato() {
  const { contato, fuso } = useContato();
  const casca = useCascaDoPortal();

  return (
    <div className="pt-app">
      <BarrasDoContato />

      {/* `#main-content-area` é `pa0`: quem recua é a `.container` de dentro. */}
      <main className="pt-conteudo fx-miolo">
        <div className="fx-coluna">
          {/* O cabeçalho da origem: foto à esquerda, nome e "Id:" ao lado, e a
              data de criação encostada na direita, na mesma linha. */}
          <header className="fx-cabecalho">
            <div className="fx-identidade">
              {contato.imagemUrl ? (
                <img className="fx-foto" src={contato.imagemUrl} alt="" width={72} height={72} />
              ) : (
                <Avatar nome={contato.nome} className="fx-foto" />
              )}
              <div className="fx-titulos">
                {/* Lá o nome é um `bds-input-editable` para quem tem a claim 109
                    (`basicConfigurations`), e um texto para quem não tem. Aqui é
                    sempre texto: renomear grava no mesmo lugar que a criação, e
                    a Server Action dessa edição ainda não existe. */}
                <h1 className="fx-nome">{contato.nome}</h1>
                <p className="fx-id">Id: {contato.shortName ?? contato.id}</p>
              </div>
            </div>
            <p className="fx-criado">
              <span>Criado em</span> {porData(contato.criadoEm, fuso)}
            </p>
          </header>

          <hr className="fx-fio" />

          {/* A ordem é a do template: extensões, canais, equipe, preferências,
              métricas — a grade posiciona por `grid-area`. O que o Pipe não tem
              (loja, equipe por contato, contagem por contato) vai vazio. */}
          <div className="fx-grade">
            <CartaoExtensoes extensoes={[]} />
            <CartaoCanais
              ativos={contato.canalAtivo && contato.canalTipo ? [contato.canalTipo] : []}
              id={contato.id}
            />
            <CartaoEquipe membros={[]} />
            <CartaoPreferencias fuso={fuso} plano={casca.tenant.plano} />
            <CartaoMetricas metricas={null} />
          </div>
        </div>
      </main>
    </div>
  );
}

/* ------------------------------------------------------------------ peças */

/** O `moment(created).format('L')` deles, no fuso da conta: `13/09/2026`. */
function porData(instante: string | null, fuso: string): string {
  if (!instante) return '—';
  return new Date(instante).toLocaleDateString('pt-BR', {
    timeZone: fuso,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}
