import { and, count, desc, ilike, ne, type SQL } from 'drizzle-orm';
import { fluxo } from '@pipe/db/schema';
import { consultar, exigirEu } from './banco';
import { minhasContas, type ContaNaLista } from './conta';

/**
 * O que a tela de portal mostra: quem está logado, a conta em vigor e os
 * fluxos dela.
 *
 * `exigirEu()` e não `euAtual()`: o portal é tela de produto, não de entrada.
 * Sem sessão ele manda para `/entrar`, como o resto da Gestão — e é por isso
 * que `usuario` aqui NÃO é `null`, diferente do que acontece em `cabecalho.ts`.
 *
 * O avatar vem da sessão (`Eu.usuario.avatarUrl`) e não do cabeçalho: a
 * `DadosDoCabecalho` carrega só nome e e-mail, e o portal deles põe a foto da
 * pessoa na ponta direita da barra. Buscar `Eu` de novo custa uma chamada a
 * `GET /v1/eu` que já está sem cache — não vale inventar um endpoint novo.
 */
/**
 * O que a BARRA do portal precisa saber — e nada além.
 *
 * Existe separado porque a barra escura não é mais só do `/portal`: as telas
 * que penduram nele (novidades, a loja, criar roteador) mostram a MESMA barra,
 * como na origem, e não podem pagar a consulta da grade de fluxos só para
 * desenhar o topo.
 */
export interface CascaDoPortal {
  usuario: { nome: string; email: string; avatarUrl: string | null };
  tenant: { nome: string; slug: string; plano: string };
  /** As contas deste e-mail, para o seletor. Uma só quando não há outras. */
  contas: ContaNaLista[];
  /** O que a pessoa pode fazer aqui. Botão que ela não pode usar não aparece. */
  podeCriar: boolean;
}

/** A casca sozinha: sessão, conta em vigor e a lista do seletor. Sem banco. */
export async function carregarCascaDoPortal(): Promise<CascaDoPortal> {
  const eu = await exigirEu();
  return {
    usuario: { nome: eu.usuario.nome, email: eu.usuario.email, avatarUrl: eu.usuario.avatarUrl },
    tenant: { nome: eu.tenant.nome, slug: eu.tenant.slug, plano: eu.tenant.plano },
    contas: await minhasContas(),
    podeCriar: eu.permissoes.includes('automacao.fluxo.editar'),
  };
}

export interface DadosDoPortal extends CascaDoPortal {
  /**
   * Cada cartão da grade. Vazio é o caso normal em conta nova.
   *
   * `tipo` é o que a etiqueta do cartão diz — `fluxo` ou `roteador` —, e é o
   * mesmo papel que o `template` (`builder`/`master`) cumpre na origem.
   */
  fluxos: {
    id: string;
    nome: string;
    estado: string;
    tipo: string;
    /**
     * A foto escolhida na criação. Nula na maioria — e é a nulidade que decide
     * o desenho do cartão: na origem, `ng-if="!contact.imageUri"` troca a foto
     * pelo ícone do produto.
     */
    imagemUrl: string | null;
  }[];
  /** Quantos fluxos a conta tem ao todo, ignorando a busca. É o "N contatos". */
  total: number;
  /** Quantos a busca encontrou. Sem busca, é igual a `total`. */
  encontrados: number;
}

/**
 * Os tamanhos de página, lidos do `items-page="[40,80,120]"` do
 * `bds-pagination` da tela de origem. Não são números escolhidos por nós.
 */
export const POR_PAGINA = [40, 80, 120] as const;

export interface PedidoDoPortal {
  busca: string;
  pagina: number;
  porPagina: number;
}

/**
 * A lista é PAGINADA no banco, e não fatiada na tela.
 *
 * A origem pagina (`bds-pagination` com contador e escolha de itens por
 * página), e conta com centenas de bots por conta. Trazer tudo e cortar em
 * memória funciona com um fluxo e derruba a tela com mil.
 *
 * `arquivado` fica FORA da lista: na origem a lista é o que está em uso, e
 * arquivar é justamente tirar de circulação. Apagar seria perder histórico —
 * a linha continua no banco, só não ocupa a grade.
 */
export async function carregarPortal(pedido?: PedidoDoPortal): Promise<DadosDoPortal> {
  const busca = (pedido?.busca ?? '').trim();
  const porPagina = POR_PAGINA.includes(pedido?.porPagina as never)
    ? (pedido?.porPagina as number)
    : POR_PAGINA[0];
  const pagina = Math.max(1, Math.trunc(pedido?.pagina ?? 1));
  const eu = await exigirEu();
  const usuario = {
    nome: eu.usuario.nome,
    email: eu.usuario.email,
    avatarUrl: eu.usuario.avatarUrl,
  };
  const tenant = { nome: eu.tenant.nome, slug: eu.tenant.slug, plano: eu.tenant.plano };
  const contas = await minhasContas();
  /* `automacao.fluxo.editar` é o nosso `canCreateChatBot`: a origem esconde o
     banner de boas-vindas e as saídas de criação de quem não tem a permissão,
     em vez de mostrar e recusar depois. */
  const podeCriar = eu.permissoes.includes('automacao.fluxo.editar');

  const emUso = ne(fluxo.estado, 'arquivado');
  const filtro: SQL | undefined = busca ? and(emUso, ilike(fluxo.nome, `%${busca}%`)) : emUso;

  try {
    return await consultar(async (tx) => {
      /* UMA de cada vez, e não `Promise.all`: a transação vive numa conexão só,
         e duas consultas concorrentes nela se atropelam — o erro cai no `catch`
         lá embaixo e a tela inteira vira "conta nova". */
      const total = await tx.select({ n: count() }).from(fluxo).where(emUso);
      const totalN = total[0]?.n ?? 0;
      const encontradosN = busca
        ? ((await tx.select({ n: count() }).from(fluxo).where(filtro))[0]?.n ?? 0)
        : totalN;

      const fluxos = await tx
        .select({
          id: fluxo.id,
          nome: fluxo.nome,
          estado: fluxo.estado,
          tipo: fluxo.tipo,
          imagemUrl: fluxo.imagemUrl,
        })
        /* Do MAIS NOVO para o mais antigo, que é a ordem da origem: na conta
           com onze bots o primeiro cartão da grade é o último criado (o
           "AUVP Seguros - Router", de 2025) e o último é o primeiro de todos
           (o "AUVP Capital", de 2024). Estava invertido aqui. */
        .from(fluxo)
        .where(filtro)
        .orderBy(desc(fluxo.criadoEm))
        .limit(porPagina)
        .offset((pagina - 1) * porPagina);

      return {
        usuario,
        tenant,
        contas,
        fluxos,
        total: totalN,
        encontrados: encontradosN,
        podeCriar,
      };
    });
  } catch {
    /* Banco fora do ar não pode apagar a barra: a grade cai no estado vazio,
       que é exatamente o que a pessoa vê numa conta nova. */
    return { usuario, tenant, contas, fluxos: [], total: 0, encontrados: 0, podeCriar };
  }
}
