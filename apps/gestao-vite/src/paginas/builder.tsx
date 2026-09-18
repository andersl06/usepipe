import { useState } from 'react';
import { Icone } from '@pipe/ui';
import { IconeGestao } from '../componentes/icones-gestao';
import { BarrasDoContato } from './fluxo/contato';
import './builder.css';

/**
 * Builder — a MOLDURA do construtor de fluxo, não o construtor.
 *
 * Não existe editor de fluxo aqui: o que esta tela reproduz é a disposição
 * real do Builder de produção (faixa de aviso, barra de blocos, canvas
 * escuro, rodapé com status/zoom, botão de conversa), medida no DOM
 * capturado em `docs/capturas/blip/builder/builder-fluxo__pagina.html` — ver
 * o de-para completo em `builder.css`. Nenhum bloco, seta ou clique real:
 * todo controle de chrome está `disabled`, de propósito, porque fingir que
 * funciona é pior do que admitir que a tela ainda é só a casca.
 *
 * Duas coisas que a captura NÃO sustenta e por isso não estão aqui: a barra
 * de "5 ícones" do lado do "adicionar bloco" (o DOM só confirma
 * "Adicionar bloco" e "Pesquisar" — o resto da lista deles, Agente,
 * Pagamento, Catálogo, AI Answers…, é feature de plano, não chrome) e um
 * bloco de Início fake (a plataforma de referência pinta o dela de azul; o
 * nosso, quando existir, usa `--p-marca` — mas não existe hoje, e inventar
 * um só para ficar bonito seria mentir sobre o que a tela faz).
 *
 * Rota: `/fluxo/:id/builder` — DENTRO do contato, como na origem
 * (`/application/detail/<bot>/templates/builder`). Builder é escondido do
 * menu para roteador (`ESCONDIDOS_NO_ROTEADOR` em `fluxo/itens.ts`), e por
 * isso não existe `/roteador/:id/builder` em `App.tsx`.
 *
 * A moldura é `BarrasDoContato` (barra do portal + barra do contato, com
 * "Builder" aceso) e NADA mais — sem o `fx-coluna` de `CascaDoModulo`, que
 * limita a largura e dá padding: o Builder é TELA CHEIA, como o construtor de
 * fluxo real. Antes desta tela morar no contato, ela ainda desenhava dentro
 * do casco de duas barras de `estrutura-gestao.tsx` (largura cheia, mas sem a
 * barra do contato) e zerava o padding do ancestral com o seletor
 * `.p-conteudo:has(> .bl-tela)` em `builder.css` — um truque necessário
 * enquanto mexer no roteamento estava fora do escopo. Com o Builder dentro do
 * contato, `.bl-tela` é filha direta de `.pt-app` (a MESMA casca de
 * `fluxo/growth/casca.tsx`) e cresce com `flex: 1` sozinha; o truque de CSS
 * saiu.
 */
export function PaginaBuilder() {
  const [avisoAberto, setAvisoAberto] = useState(true);

  return (
    <div className="pt-app">
      <BarrasDoContato ativo="Builder" />
      <div className="bl-tela">
        {avisoAberto ? (
          <div className="bl-aviso">
            <div className="bl-aviso-texto">
              <span>
                O Builder ainda não tem editor de fluxo — esta tela é a moldura, sem lógica por
                trás.{' '}
                <details>
                  <summary>Saiba mais</summary>
                  <p className="bl-aviso-nota">
                    Hoje a triagem que existe é a fila padrão da caixa de entrada, em <b>Canais</b>,
                    e a regra de distribuição dentro da fila, em{' '}
                    <b>Atendentes › Filas de atendimento</b>. Falta decidir se o roteador vira uma
                    peça própria — que recebe tudo e decide o destino, como na plataforma de
                    referência — ou se roteamento continua sendo regra da fila.
                  </p>
                </details>
              </span>
            </div>
            <button
              type="button"
              className="bl-aviso-fechar"
              aria-label="Fechar aviso"
              onClick={() => setAvisoAberto(false)}
            >
              <Icone nome="x" tamanho={16} />
            </button>
          </div>
        ) : null}

        <div className="bl-corpo">
          <div className="bl-vazio">
            <Icone nome="grade" tamanho={40} />
            <p>Nenhum bloco ainda. Quando o editor existir, o fluxo se desenha nesta área.</p>
          </div>

          <div className="bl-barra">
            <button
              type="button"
              className="bl-icone-botao"
              disabled
              title="Adicionar bloco — ainda não construído"
              aria-label="Adicionar bloco"
            >
              <Icone nome="mais" tamanho={20} />
            </button>
            <button
              type="button"
              className="bl-icone-botao"
              disabled
              title="Pesquisar — ainda não construído"
              aria-label="Pesquisar"
            >
              <Icone nome="busca" tamanho={18} />
            </button>
          </div>

          <div className="bl-rodape">
            <div className="bl-status">
              <Icone nome="cheque" tamanho={16} />
              <span>Nada para salvar</span>
            </div>

            <div className="bl-controles">
              <button
                type="button"
                className="bl-icone-botao"
                disabled
                title="Desfazer"
                aria-label="Desfazer"
              >
                <IconeGestao nome="desfazer" tamanho={18} />
              </button>
              <button
                type="button"
                className="bl-icone-botao"
                disabled
                title="Refazer"
                aria-label="Refazer"
              >
                <IconeGestao nome="refazer" tamanho={18} />
              </button>
              <button
                type="button"
                className="bl-icone-botao"
                disabled
                title="Ajustar à tela"
                aria-label="Ajustar à tela"
              >
                <IconeGestao nome="telaCheia" tamanho={18} />
              </button>
            </div>

            <div className="bl-zoom">
              <span className="bl-zoom-valor">100%</span>
              <div className="bl-zoom-trilho">
                <div className="bl-zoom-preenchido" />
              </div>
            </div>
          </div>

          <button
            type="button"
            className="bl-conversa"
            disabled
            title="Conversa — em breve"
            aria-label="Conversa"
          >
            <Icone nome="balao" tamanho={22} />
          </button>
        </div>
      </div>
    </div>
  );
}
