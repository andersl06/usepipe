import Link from 'next/link';
import { Simbolo } from '@pipe/ui';
import { IconeDesk } from './icones-desk';
import { AlternarTema } from './alternar-tema';
import { BotaoDeStatus } from './barra-status';
import type { EstadoAtendente } from '../servidor/consultas';

/**
 * Trilho vertical de ícones, na geometria medida no Desk deles
 * (`docs/pesquisa/blip-desk-medidas.md`, §2): 80px de largura, cromo escuro de
 * altura cheia, coluna útil de 64px, passo de 48px entre itens, ícone de 24px,
 * e o ativo como um retângulo de 40×40 em raio 8 — sem barra lateral e sem cor
 * de marca. A marca no topo, a conta no rodapé.
 *
 * A DISPOSIÇÃO É A DELES, A TINTA É A NOSSA. Nenhum valor de cor da Blip entra
 * aqui: o escuro sai de `--p-superficie-4` e o realce do ativo é a tinta da
 * própria barra a 10%, do mesmo jeito que a Gestão deriva os dois degraus das
 * suas duas barras.
 *
 * **Nenhum item desabilitado**, e é por isso que este trilho tem quatro
 * controles e não os cinco módulos deles. Eles têm cinco destinos porque têm
 * cinco produtos; o Desk do Pipe tem um. O trilho é a forma; quantos itens ele
 * carrega é função do produto.
 *
 * O topo leva ao único destino que existe. O rodapé leva ao que é da conta: a
 * Gestão, que vive noutra origem, o tema, e o avatar com o ponto do estado —
 * que abre o mesmo diálogo do botão "Trocar status" da coluna, exatamente como
 * o avatar do rodapé deles.
 *
 * Não há barra superior. O Desk deles não tem, e o motivo é bom: com o trilho
 * ocupando a altura inteira, uma barra em cima rouba dobra da conversa para
 * repetir o que o trilho já diz. A Gestão continua com as duas barras porque a
 * tela de referência dela, o Monitoramento, tem duas barras.
 */

/** Onde vive a supervisão. O rodapé do trilho aponta para lá. */
const URL_GESTAO = process.env['NEXT_PUBLIC_PIPE_GESTAO_URL'] ?? 'http://localhost:3100';

export const COR_DO_ESTADO: Record<EstadoAtendente, string> = {
  online: 'var(--p-sucesso-conteudo)',
  pausa: 'var(--p-alerta-conteudo)',
  invisivel: 'var(--p-conteudo-fantasma)',
  offline: 'var(--p-linha-forte)',
};

const ROTULO_DO_ESTADO: Record<EstadoAtendente, string> = {
  online: 'Online',
  pausa: 'Pausa',
  invisivel: 'Invisível',
  offline: 'Offline',
};

export function TrilhoDesk({
  iniciais,
  nome,
  estado,
}: {
  iniciais: string;
  nome: string;
  estado: EstadoAtendente;
}) {
  return (
    <nav className="trilho-desk" aria-label="Módulos">
      <Link className="trilho-marca" href="/" aria-label="Pipe Desk">
        <Simbolo tamanho={26} />
      </Link>

      <div className="trilho-itens">
        {/* O Desk tem uma rota só: o caminho atual é constante e não precisa
            de `usePathname` nem de componente de cliente. */}
        <Link className="trilho-item" href="/" aria-current="page" title="Atendimentos">
          <IconeDesk nome="conversa" />
          <span className="sr">Atendimentos</span>
        </Link>
      </div>

      <div className="trilho-conta">
        <a
          className="trilho-item"
          href={URL_GESTAO}
          target="_blank"
          rel="noreferrer"
          title="Abrir o Pipe Gestão"
        >
          <IconeDesk nome="externo" />
          <span className="sr">Abrir o Pipe Gestão</span>
        </a>

        <AlternarTema />

        <BotaoDeStatus
          titulo={`${nome} · ${ROTULO_DO_ESTADO[estado]}`}
          cor={COR_DO_ESTADO[estado]}
          iniciais={iniciais}
        />
      </div>
    </nav>
  );
}
