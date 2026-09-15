import { and, asc, eq, ne } from 'drizzle-orm';
import { fluxo } from '@pipe/db/schema';
import { consultar, tenantId } from './banco';

export interface ServicoDoRoteador {
  id: string;
  nome: string;
  estado: string;
  tipo: string;
  shortName: string | null;
}

export interface DadosDeServicos {
  principal: ServicoDoRoteador | null;
  filhos: ServicoDoRoteador[];
  busca: ServicoDoRoteador[];
}

/**
 * A origem guarda a relação roteador → sub-bot numa configuração própria.
 * O Pipe ainda só guarda `fluxo.tipo`; sem tabela de vínculo, a leitura segura
 * é mostrar o roteador e não inventar filhos. ponytail: teto é ausência de
 * relação persistida; criar `roteador_servico` com tenant_id, roteador_id,
 * servico_id, nome, principal, persistente e timeout antes de gravar vínculos.
 */
export async function carregarServicos(id: string): Promise<DadosDeServicos> {
  const tid = await tenantId();
  return consultar(async (tx) => {
    const todos = await tx
      .select({
        id: fluxo.id,
        nome: fluxo.nome,
        estado: fluxo.estado,
        tipo: fluxo.tipo,
        shortName: fluxo.shortName,
      })
      .from(fluxo)
      .where(and(eq(fluxo.tenantId, tid), ne(fluxo.estado, 'arquivado')))
      .orderBy(asc(fluxo.nome));
    const principal = todos.find((item) => item.id === id && item.tipo === 'roteador') ?? null;
    return { principal, filhos: [], busca: todos };
  });
}
