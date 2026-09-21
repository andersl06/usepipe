import type { ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { IconeGestao } from '../../../componentes/icones-gestao';
import { IconePortal } from '../../../componentes/icones-portal';
import Link from '../../../componentes/link';
import { rotaDoCanal, type TipoDeCanalDoBot } from '../../../lib/canal-do-fluxo';
import { CascaDoModulo, baseDoContato, useContato } from '../contato';
import '../integracoes/cabecalho-de-pagina.css';
import '../integracoes/integracoes.css';
import './canal-do-bot.css';

/**
 * A moldura de UMA página de canal dentro do bot — o template 79961 de
 * `portal.js` (WhatsApp) e o 230473 (Instagram), que são o mesmo desenho
 * (`FICHA-conectar-canal-no-bot.md` §1.2–1.4):
 *
 *   <page-header back-button="…channels" page-title="{canal}">
 *   <bds-paper> <bds-grid direction="column" padding="2">
 *     <bds-grid direction="row"> <bds-tabs …/> <"Documentação" + external-file/> </bds-grid>
 *     <bds-tab-panel class="mt4 w-100"> … </bds-tab-panel>
 *
 * A seta volta para a lista de canais do bot. As abas são links (cada uma tem
 * URL, como o `bds-tab group` da origem tem estado); `emBreve` desenha a aba
 * sem link com o selo, para a que a Pipe ainda não tem por dentro.
 *
 * "Documentação" na origem abre a central de ajuda da Blip
 * (`whatsapp.documentationLink`). A Pipe não tem esse endereço; o texto e o
 * ícone ficam, sem destino (`aria-disabled`) — inventar uma URL não é
 * reproduzir a tela.
 */

export interface AbaDoCanal {
  rotulo: string;
  /** Vazio é a aba-índice (a URL da própria página). */
  segmento: string;
  /** Só aparece com o canal conectado — o `ng-show` das abas da origem. */
  exigeConectado?: boolean;
  emBreve?: boolean;
}

export function CascaDoCanal({
  tipo,
  titulo,
  abas,
  conectado,
  children,
}: {
  tipo: TipoDeCanalDoBot;
  titulo: string;
  abas: readonly AbaDoCanal[];
  conectado: boolean;
  children: ReactNode;
}) {
  const { contato } = useContato();
  const base = baseDoContato(contato.tipo, contato.id);
  const caminho = useLocation().pathname.replace(/\/$/, '');
  /** A URL desta página; o que vier depois dela é a aba. */
  const raiz = rotaDoCanal(base, tipo);

  return (
    <CascaDoModulo ativo="Canais">
      <header className="ph-cabecalho">
        <div className="ph-conteudo">
          <div className="ph-voltar-caixa">
            <Link className="ph-voltar" href={`${base}/canais`} aria-label="Voltar">
              <IconePortal nome="voltar" tamanho={22} />
            </Link>
          </div>
          <div className="ph-titulo-caixa">
            <h1 className="ph-titulo">{titulo}</h1>
          </div>
        </div>
      </header>

      <div className="ig-grade">
        <section className="ig-papel">
          <div className="ig-papel-miolo">
            <div className="cb-abas-linha">
              <nav className="ig-abas" role="tablist" aria-label={`Abas do canal ${titulo}`}>
                {abas
                  .filter((aba) => conectado || !aba.exigeConectado)
                  .map((aba) => {
                    if (aba.emBreve) {
                      return (
                        <span key={aba.rotulo} className="ig-aba cb-aba-obra" aria-disabled="true">
                          {aba.rotulo}
                          <span className="pt-obra-selo">em breve</span>
                        </span>
                      );
                    }
                    const href = aba.segmento ? `${raiz}/${aba.segmento}` : raiz;
                    const ativa = aba.segmento ? caminho === href || caminho.startsWith(`${href}/`) : caminho === raiz;
                    return (
                      <Link
                        key={aba.rotulo}
                        href={href}
                        role="tab"
                        className="ig-aba cb-aba"
                        aria-selected={ativa}
                        aria-current={ativa ? 'page' : undefined}
                      >
                        {aba.rotulo}
                      </Link>
                    );
                  })}
              </nav>
              <span className="cb-doc" aria-disabled="true" title="Documentação: em breve">
                Documentação
                <IconeGestao nome="externo" tamanho={16} />
              </span>
            </div>

            <div className="cb-painel">{children}</div>
          </div>
        </section>
      </div>
    </CascaDoModulo>
  );
}
