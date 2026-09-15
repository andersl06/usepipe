import Link from 'next/link';
import { and, eq } from 'drizzle-orm';
import { canal, fluxo } from '@pipe/db/schema';
import { Avatar } from '@pipe/ui';
import { IconeGestao } from '../../../componentes/icones-gestao';
import { IconePortal } from '../../../componentes/icones-portal';
import { consultar, tenantId } from '../../../lib/banco';
import { ICONES_DO_CONTATO, LIMITE_VISIVEL, itensDoMenu, type ItemDoMenu } from './itens';

/**
 * A barra do CONTATO — a `subheader-detail` da origem (módulo 80688).
 *
 * Mora fora de `page.tsx` porque na origem ela é do estado-pai
 * `auth.application.detail`: a `home` e a Análise (`/analise`) desenham a
 * MESMA barra, e a segunda só acende o item dela.
 */

/** O `id` vem da URL, e URL é texto de fora: sem isto o Postgres recusa o uuid. */
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * O contato e o canal dele. Uma consulta, um `leftJoin`.
 *
 * Fica aqui e não em `src/lib/` porque é uma leitura só, sem regra: o dia em
 * que esta tela gravar alguma coisa, ela muda de lugar junto com a gravação —
 * como `lib/contrato.ts` fez.
 */
export async function carregarContato(id: string) {
  const tid = await tenantId();
  return consultar(async (tx) => {
    const [linha] = await tx
      .select({
        id: fluxo.id,
        nome: fluxo.nome,
        estado: fluxo.estado,
        tipo: fluxo.tipo,
        imagemUrl: fluxo.imagemUrl,
        shortName: fluxo.shortName,
        criadoEm: fluxo.criadoEm,
        canalNome: canal.nome,
        canalTipo: canal.tipo,
        canalAtivo: canal.ativo,
      })
      .from(fluxo)
      .leftJoin(canal, eq(canal.id, fluxo.canalId))
      .where(and(eq(fluxo.tenantId, tid), eq(fluxo.id, id)))
      .limit(1);
    return linha ?? null;
  });
}

export type Contato = NonNullable<Awaited<ReturnType<typeof carregarContato>>>;

export function BarraDoContato({ contato, ativo }: { contato: Contato; ativo?: string }) {
  const itens = itensDoMenu(contato.tipo === 'roteador' ? 'roteador' : 'fluxo', contato.id);
  const visiveis = itens.slice(0, LIMITE_VISIVEL);
  const excedentes = itens.slice(LIMITE_VISIVEL);

  return (
    <>
      {/* A `subheader-detail` deles: a barra do CONTATO, escura, logo abaixo da
          barra da conta. É ela que diz "você está dentro de um contato agora" —
          no portal, este degrau é a barra clara com a busca. */}
      <div className="fx-subbarra">
        <div className="fx-contato">
          <span className="fx-av">
            {contato.imagemUrl ? (
              <img src={contato.imagemUrl} alt="" width={36} height={36} />
            ) : (
              <Avatar nome={contato.nome} />
            )}
            {/* O `u-status-on/off` deles, no vértice do avatar. Lá o sinal é
                `application.status` (online/offline); aqui é `estado`, que é o
                mais perto que temos: publicado atende, rascunho ainda não. */}
            <i
              className={contato.estado === 'publicado' ? 'g-ponto g-ponto-on' : 'g-ponto'}
              title={contato.estado === 'publicado' ? 'Publicado' : 'Rascunho'}
            />
          </span>

          {/* O `<dropdown-item>` do nome: nome + `arrow-down`, e um painel de
              160px com "Home", "Configuração" e "Deixar projeto" (esta em
              vermelho, a `bp-c-delete` deles). Só a primeira tem destino —
              "Home" é a tela do contato, que é para onde o `ui-sref` dela aponta. */}
          <details className="g-menu fx-contato-menu">
            <summary>
              <span className="fx-contato-nome">{contato.nome}</span>
              <IconePortal nome="baixo" tamanho={16} />
            </summary>
            <div className="g-painel">
              <Link href={`/fluxo/${contato.id}`}>Home</Link>
              <span className="pt-obra">
                Configuração
                <span className="pt-obra-selo">em breve</span>
              </span>
              <span className="pt-obra fx-sair">
                Deixar projeto
                <span className="pt-obra-selo">em breve</span>
              </span>
            </div>
          </details>
        </div>

        <nav className="fx-menu" aria-label="Seções do contato">
          {visiveis.map((item) => (
            <ItemDaBarra key={item.rotulo} item={item} ativo={item.rotulo === ativo} />
          ))}

          {/* O "…" da origem só existe quando SOBRA item, e mostra o que sobrou.
              Mesma regra da fileira de módulos de `estrutura-gestao.tsx`. */}
          {excedentes.length > 0 ? (
            <details className="g-menu fx-mais">
              <summary className="g-iconbtn" title="Mais seções" aria-label="Mais seções">
                <IconeGestao nome="reticencias" tamanho={24} />
              </summary>
              <div className="g-painel">
                {excedentes.map((item) =>
                  item.href ? (
                    <Link key={item.rotulo} href={item.href}>
                      {item.rotulo}
                    </Link>
                  ) : (
                    <span key={item.rotulo} className="pt-obra">
                      {item.rotulo}
                      <span className="pt-obra-selo">em breve</span>
                    </span>
                  ),
                )}
              </div>
            </details>
          ) : null}
        </nav>

        {/* `subheader-icons`: Integrações, Configurações, Equipe e Testar. NÃO
            passam pelo filtro de template — o roteador mostra os quatro. Lá
            são `<i class="icon-…">` da fonte `blip-icons` com dica embaixo; o
            rótulo vai na dica e no nome acessível. Nenhum tem destino aqui:
            um selo só para os quatro. */}
        <div className="fx-icones pt-links-obra">
          {ICONES_DO_CONTATO.map((item) => (
            <span
              key={item.rotulo}
              className="fx-icone"
              title={item.rotulo}
              aria-label={item.rotulo}
            >
              <IconePortal nome={item.icone} tamanho={20} />
            </span>
          ))}
          <span className="pt-obra-selo">em breve</span>
        </div>
      </div>
    </>
  );
}

/** Um item da fileira: link quando a tela existe, bloco apagado quando não. */
function ItemDaBarra({ item, ativo }: { item: ItemDoMenu; ativo: boolean }) {
  if (item.href) {
    return (
      <Link
        className={ativo ? 'fx-item fx-item--ativo' : 'fx-item'}
        href={item.href}
        aria-current={ativo ? 'page' : undefined}
      >
        {item.rotulo}
      </Link>
    );
  }
  return (
    <span className="fx-item pt-links-obra">
      {item.rotulo}
      <span className="pt-obra-selo">em breve</span>
    </span>
  );
}
