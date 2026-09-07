import Link from 'next/link';
import type { ReactNode } from 'react';
import { Avatar } from '@pipe/ui';

/**
 * As peças da ficha, usadas pelas três: lead, conta e contato.
 *
 * A forma foi medida no Twenty (`record-show`) e no Salesforce, que chegaram ao
 * mesmo desenho sem se falarem: uma faixa de identidade no topo, uma tira curta
 * dos campos que decidem o que fazer, uma coluna lateral com o resto dos dados
 * em seções que abrem e fecham, e abas para o conteúdo pesado.
 *
 * Elas moravam dentro de `leads/[id]/page.tsx`, e a conta e o contato eram duas
 * telas mais pobres por não as terem. Estão aqui pela razão de sempre: três
 * cópias do mesmo cabeçalho viram três cabeçalhos diferentes no terceiro mês.
 *
 * Tudo aqui é componente de SERVIDOR. Nenhuma peça guarda estado, e a aba vive
 * na URL — a ficha inteira funciona sem JavaScript, e é o que permite colar no
 * chat o endereço de uma ficha já aberta na aba certa.
 */

export function Campo({ k, v }: { k: string; v: ReactNode }) {
  return (
    <div>
      <span className="k">{k}</span>
      <span className="v">{v}</span>
    </div>
  );
}

/**
 * Uma seção da coluna lateral, que abre e fecha.
 *
 * `<details>` nativo: o navegador já sabe abrir, fechar, responder ao teclado e
 * contar para o leitor de tela. Escrever isso em React seria trocar zero linha
 * por trinta e perder o comportamento de busca na página.
 */
export function Secao({
  titulo,
  aberta = true,
  children,
}: {
  titulo: string;
  aberta?: boolean;
  children: ReactNode;
}) {
  return (
    <details className="secao" open={aberta}>
      <summary>
        <b>{titulo}</b>
      </summary>
      {children}
    </details>
  );
}

export interface CampoPrincipal {
  rotulo: string;
  valor: ReactNode;
  /** A segunda linha, em tom menor: "há 12 dias", o nome da campanha, a faixa. */
  nota?: ReactNode;
  /** Número em monoespaçada tabular. Para valor e contagem, não para texto. */
  numerico?: boolean;
}

/**
 * O cabeçalho de destaque: identidade em cima, campos principais embaixo.
 *
 * **Cinco campos principais, no máximo** — é a régua do destaque do Salesforce,
 * e mais do que isso deixa de ser destaque. As três fichas obedecem a mesma.
 */
export function Destaque({
  trilha,
  nome,
  etiquetas,
  nota,
  principais,
}: {
  trilha: { href: string; rotulo: string };
  nome: string;
  /** As etiquetas de estado, à direita do nome. Cor só no que exige ação. */
  etiquetas?: ReactNode;
  /** O carimbo discreto do fim da linha: "criado há 3 dias". */
  nota?: ReactNode;
  principais: readonly CampoPrincipal[];
}) {
  return (
    <div className="destaque">
      <div className="identidade">
        <Link href={trilha.href} className="trilha">
          {trilha.rotulo}
        </Link>
        <span className="barra" aria-hidden="true">
          /
        </span>
        <Avatar nome={nome} />
        <h2>{nome}</h2>
        {etiquetas}
        {nota ? <span className="criado">{nota}</span> : null}
      </div>

      <dl className="principais">
        {principais.map((c) => (
          <div key={c.rotulo}>
            <dt>{c.rotulo}</dt>
            <dd className={c.numerico ? 'n' : undefined}>
              {c.valor}
              {c.nota ? <em>{c.nota}</em> : null}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export interface AbaDaFicha {
  chave: string;
  rotulo: string;
  /** `null` esconde a contagem. Zero é contagem, e zero é informação. */
  contagem?: number | null;
}

/**
 * As abas do conteúdo. São LINKS, não estado de cliente: a aba vive na URL, o
 * botão de voltar do navegador desfaz a troca, e a ficha continua sendo
 * servidor inteiro.
 */
export function AbasDaFicha({
  base,
  aba,
  abas,
  formatar,
}: {
  /** O endereço da ficha, sem parâmetro. A aba entra como `?aba=`. */
  base: string;
  aba: string;
  abas: readonly AbaDaFicha[];
  /** Como escrever o número. A tela passa o `numero` do formato local. */
  formatar: (n: number) => string;
}) {
  return (
    <div className="tabs" role="tablist">
      {abas.map((a) => (
        <Link
          key={a.chave}
          href={`${base}?aba=${a.chave}`}
          role="tab"
          aria-current={a.chave === aba ? 'true' : undefined}
          scroll={false}
        >
          {a.rotulo}
          {a.contagem === null || a.contagem === undefined ? null : (
            <span className="qt">{formatar(a.contagem)}</span>
          )}
        </Link>
      ))}
    </div>
  );
}

/**
 * A seção de atributos personalizados da lateral.
 *
 * As três tabelas guardam `atributos` em JSONB — é a decisão do modelo que evita
 * os 304 campos customizados do Lead do Salesforce de hoje. Como a forma é a
 * mesma nas três, a seção também é.
 */
export function SecaoAtributos({
  atributos,
  titulo = 'Atributos',
  vazio = 'Nenhum atributo personalizado.',
}: {
  atributos: Record<string, unknown>;
  titulo?: string;
  vazio?: string;
}) {
  const pares = Object.entries(atributos);
  return (
    <Secao titulo={titulo} aberta={pares.length > 0}>
      {pares.length === 0 ? (
        <div className="vazio">{vazio}</div>
      ) : (
        <div className="campos">
          {pares.map(([k, v]) => (
            <Campo key={k} k={k} v={String(v)} />
          ))}
        </div>
      )}
    </Secao>
  );
}
