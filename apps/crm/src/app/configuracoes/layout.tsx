import { CHAVE_TEMA } from '../../lib/configuracoes-comum';
import './configuracoes.css';

/**
 * O invólucro da área de configurações.
 *
 * Faz duas coisas, e nenhuma delas é navegação: a lateral já vem de
 * `AreaConfiguracoes`, montada em `componentes/estrutura-crm.tsx`.
 *
 * 1. Carrega a folha de estilo da área, que é local e só existe aqui.
 * 2. Escreve o tema salvo no `<html>` **antes** de a página pintar. Sem isto,
 *    quem escolheu escuro veria um lampejo branco a cada carregamento — o CSS
 *    do tema depende do atributo, e o atributo só existiria depois do React
 *    hidratar. É o mesmo truque que todo alternador de tema usa, e é a única
 *    razão de haver um `<script>` inline no projeto.
 *
 * O `try` não é decoração: `localStorage` lança em janela anônima com cookies
 * bloqueados, e um erro aqui derrubaria a página inteira antes do primeiro pixel.
 */
const APLICAR_TEMA = `try{var t=localStorage.getItem(${JSON.stringify(CHAVE_TEMA)});if(t==='claro'||t==='escuro'){document.documentElement.dataset.tema=t}}catch(e){}`;

export default function LayoutConfiguracoes({ children }: { children: React.ReactNode }) {
  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: APLICAR_TEMA }} />
      <div className="cfg">{children}</div>
    </>
  );
}
