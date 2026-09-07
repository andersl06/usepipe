import Link from 'next/link';
import { Simbolo } from '@pipe/ui';
import { IconeDesk, type NomeDeIconeDesk } from './icones-desk';
import { BotaoAjuda, BotaoPreferencias } from './dialogos-trilho';
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
 * São **cinco destinos em cima e três embaixo**, na ordem lida do `tooltip-text`
 * de cada ícone deles (`docs/pesquisa/blip-desk-dom.md`, §2). O trilho é o mapa
 * do produto, e um mapa com um destino só não é mapa: guardar os cinco é o que
 * mostra ao atendente que Mensagens ativas e Métricas existem, ainda que hoje
 * quem as sirva seja outro aplicativo.
 *
 * Onde o destino ainda não existe aqui, o ícone aponta para quem faz a mesma
 * coisa hoje, e é a spec que decide para quem: disparo em massa e relatório são
 * do Pipe Gestão (`docs/specs/2026-09-05-desk-requisitos.md`, §7 e princípio da
 * tela), e a ficha do contato é do Pipe CRM. Nenhum item fica desabilitado —
 * ícone que não abre nada é ruído, não promessa.
 *
 * Não há barra superior. O Desk deles não tem, e o motivo é bom: com o trilho
 * ocupando a altura inteira, uma barra em cima rouba dobra da conversa para
 * repetir o que o trilho já diz. A Gestão continua com as duas barras porque a
 * tela de referência dela, o Monitoramento, tem duas barras.
 */

/** Onde vive a supervisão, e onde vive a ficha do contato. */
const URL_GESTAO = process.env['NEXT_PUBLIC_PIPE_GESTAO_URL'] ?? 'http://localhost:3100';
const URL_CRM = process.env['NEXT_PUBLIC_PIPE_CRM_URL'] ?? 'http://localhost:3300';

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

/**
 * `fora` marca o destino que hoje mora noutro aplicativo. Serve para abrir em
 * outra aba e para o título dizer onde a pessoa vai parar — clicar num ícone do
 * Desk e cair no Gestão sem aviso é o tipo de surpresa que custa confiança.
 */
interface Destino {
  chave: string;
  rotulo: string;
  icone: NomeDeIconeDesk;
  href: string;
  fora?: string;
}

const DESTINOS: Destino[] = [
  { chave: 'atendimentos', rotulo: 'Atendimentos', icone: 'conversa', href: '/' },
  {
    chave: 'ativas',
    rotulo: 'Mensagens ativas',
    icone: 'paperplane',
    href: URL_GESTAO,
    fora: 'Pipe Gestão',
  },
  {
    chave: 'metricas',
    rotulo: 'Métricas de atendimento',
    icone: 'metricas',
    href: URL_GESTAO,
    fora: 'Pipe Gestão',
  },
  {
    chave: 'contatos',
    rotulo: 'Contatos',
    icone: 'contatos',
    href: `${URL_CRM}/contatos`,
    fora: 'Pipe CRM',
  },
  {
    chave: 'massa',
    rotulo: 'Ações em massa',
    icone: 'massa',
    href: URL_GESTAO,
    fora: 'Pipe Gestão',
  },
];

export function TrilhoDesk({
  iniciais,
  nome,
  email,
  tenantNome,
  estado,
}: {
  iniciais: string;
  nome: string;
  email: string;
  tenantNome: string;
  estado: EstadoAtendente;
}) {
  return (
    <nav className="trilho-desk" aria-label="Módulos">
      <Link className="trilho-marca" href="/" aria-label="Pipe Desk">
        {/* 40×40 dentro do bloco de 64, que é a proporção medida no topo do
            trilho deles. Em 26 a marca ficava menor que os ícones abaixo dela,
            e um trilho onde a marca é o menor elemento não tem topo. */}
        <Simbolo tamanho={40} />
      </Link>

      <div className="trilho-itens">
        {DESTINOS.map((destino) => {
          const titulo = destino.fora ? `${destino.rotulo} · no ${destino.fora}` : destino.rotulo;
          const conteudo = (
            <>
              <IconeDesk nome={destino.icone} />
              <span className="sr">{titulo}</span>
            </>
          );
          // O Desk tem uma rota só: o caminho atual é constante e não precisa
          // de `usePathname` nem de componente de cliente.
          return destino.fora ? (
            <a
              className="trilho-item"
              key={destino.chave}
              href={destino.href}
              target="_blank"
              rel="noreferrer"
              title={titulo}
            >
              {conteudo}
            </a>
          ) : (
            <Link
              className="trilho-item"
              key={destino.chave}
              href={destino.href}
              aria-current="page"
              title={titulo}
            >
              {conteudo}
            </Link>
          );
        })}
      </div>

      <div className="trilho-conta">
        <BotaoAjuda />
        <BotaoPreferencias urlGestao={URL_GESTAO} nome={nome} email={email} tenant={tenantNome} />
        <BotaoDeStatus
          titulo={`Seu status é: ${ROTULO_DO_ESTADO[estado]}`}
          cor={COR_DO_ESTADO[estado]}
          iniciais={iniciais}
          nome={nome}
        />
      </div>
    </nav>
  );
}
