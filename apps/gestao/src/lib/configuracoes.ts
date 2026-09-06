import { asc, count, eq } from 'drizzle-orm';
import {
  canal,
  conversaEtiqueta,
  etiqueta,
  fila,
  motivoPausa,
  regraSla,
  statusAtendente,
  usuario,
} from '@pipe/db/schema';
import { consultar } from './banco';

/**
 * Leitura do que está configurado no tenant.
 *
 * Tudo aqui é somente leitura, e isso é deliberado: a edição exige log de
 * auditoria com autor, valor anterior e horário, e configurar sem rastro é
 * passivo — a mesma razão que segura a edição de contato no Desk. O que a tela
 * resolve hoje já é o problema real: o gestor não tinha onde ver por que uma
 * conversa estourou o SLA, nem qual fila tem qual capacidade.
 */

export interface RegraSlaConfigurada {
  id: string;
  nome: string;
  alvo: string;
  prazoSeg: number;
  alertaSeg: number | null;
  escopoTipo: string;
  escopoNome: string | null;
  ativa: boolean;
}

export interface FilaConfigurada {
  id: string;
  nome: string;
  capacidadePadrao: number;
  ordem: number;
  temHorario: boolean;
  ativa: boolean;
}

/** Rótulos do banco em português corrente. O alvo é enum, não texto livre. */
export const ROTULO_ALVO: Record<string, string> = {
  primeira_resposta: 'Primeira resposta',
  resposta: 'Tempo de resposta',
  resolucao: 'Encerramento',
  espera_fila: 'Espera na fila',
};

export const ROTULO_ESCOPO: Record<string, string> = {
  tenant: 'Toda a operação',
  fila: 'Fila',
};

export async function carregarRegras(): Promise<{
  filas: FilaConfigurada[];
  regras: RegraSlaConfigurada[];
}> {
  return consultar(async (tx) => {
    const filas = await tx
      .select({
        id: fila.id,
        nome: fila.nome,
        capacidadePadrao: fila.capacidadePadrao,
        ordem: fila.ordem,
        horarioId: fila.horarioId,
        ativa: fila.ativa,
      })
      .from(fila)
      .orderBy(asc(fila.ordem), asc(fila.nome));

    const nomeDaFila = new Map(filas.map((f) => [f.id, f.nome]));

    const regras = await tx
      .select({
        id: regraSla.id,
        nome: regraSla.nome,
        alvo: regraSla.alvo,
        prazoSeg: regraSla.prazoSeg,
        alertaSeg: regraSla.alertaSeg,
        escopoTipo: regraSla.escopoTipo,
        escopoId: regraSla.escopoId,
        ativa: regraSla.ativa,
      })
      .from(regraSla)
      .orderBy(asc(regraSla.nome));

    return {
      filas: filas.map(({ horarioId, ...resto }) => ({ ...resto, temHorario: horarioId !== null })),
      regras: regras.map(({ escopoId, ...resto }) => ({
        ...resto,
        escopoNome: escopoId ? (nomeDaFila.get(escopoId) ?? 'fila removida') : null,
      })),
    };
  });
}

export interface MotivoConfigurado {
  id: string;
  nome: string;
  duracaoSugeridaMin: number | null;
  contaComoProdutivo: boolean;
  ativo: boolean;
}

export interface AtendenteConfigurado {
  id: string;
  nome: string;
  email: string;
  estado: string | null;
  ativo: boolean;
}

export async function carregarOperacao(): Promise<{
  motivos: MotivoConfigurado[];
  atendentes: AtendenteConfigurado[];
}> {
  return consultar(async (tx) => {
    const motivos = await tx
      .select({
        id: motivoPausa.id,
        nome: motivoPausa.nome,
        duracaoSugeridaMin: motivoPausa.duracaoSugeridaMin,
        contaComoProdutivo: motivoPausa.contaComoProdutivo,
        ativo: motivoPausa.ativo,
      })
      .from(motivoPausa)
      .orderBy(asc(motivoPausa.nome));

    const atendentes = await tx
      .select({
        id: usuario.id,
        nome: usuario.nome,
        email: usuario.email,
        estado: statusAtendente.estado,
        ativo: usuario.ativo,
      })
      .from(usuario)
      .leftJoin(statusAtendente, eq(statusAtendente.usuarioId, usuario.id))
      .orderBy(asc(usuario.nome));

    return { motivos, atendentes };
  });
}

export interface EtiquetaConfigurada {
  id: string;
  nome: string;
  escopo: string;
  obrigatoriaNoEncerramento: boolean;
  usos: number;
}

export interface CanalConfigurado {
  id: string;
  nome: string;
  tipo: string;
  ativo: boolean;
}

export async function carregarDados(): Promise<{
  etiquetas: EtiquetaConfigurada[];
  canais: CanalConfigurado[];
}> {
  return consultar(async (tx) => {
    const etiquetas = await tx
      .select({
        id: etiqueta.id,
        nome: etiqueta.nome,
        escopo: etiqueta.escopo,
        obrigatoriaNoEncerramento: etiqueta.obrigatoriaNoEncerramento,
        usos: count(conversaEtiqueta.conversaId),
      })
      .from(etiqueta)
      .leftJoin(conversaEtiqueta, eq(conversaEtiqueta.etiquetaId, etiqueta.id))
      .groupBy(etiqueta.id, etiqueta.nome, etiqueta.escopo, etiqueta.obrigatoriaNoEncerramento)
      .orderBy(asc(etiqueta.nome));

    const canais = await tx
      .select({ id: canal.id, nome: canal.nome, tipo: canal.tipo, ativo: canal.ativo })
      .from(canal)
      .orderBy(asc(canal.nome));

    return { etiquetas, canais };
  });
}
