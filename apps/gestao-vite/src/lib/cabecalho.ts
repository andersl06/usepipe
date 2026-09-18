import { useEu } from '../contexto/sessao';
import { useLeitura } from './consulta';

/**
 * O que as duas barras do topo da Gestão mostram — o `DadosDoCabecalho` de
 * `apps/gestao/src/lib/cabecalho.ts`, montado no navegador: conta e pessoa
 * vêm da sessão (`GET /v1/eu`); canais e avisos, de `GET /v1/gestao/cabecalho`.
 */
export interface DadosDoCabecalho {
  tenant: { nome: string; plano: string };
  canais: { id: string; nome: string; tipo: string; ativo: boolean }[];
  avisos: number;
  usuario: { nome: string; email: string } | null;
}

export function useCabecalho(): DadosDoCabecalho {
  const eu = useEu();
  const leitura = useLeitura<{ canais: DadosDoCabecalho['canais']; avisos: number }>(
    '/v1/gestao/cabecalho',
    { staleTime: 60_000 },
  );
  return {
    tenant: { nome: eu.tenant.nome, plano: eu.tenant.plano },
    usuario: { nome: eu.usuario.nome, email: eu.usuario.email },
    canais: leitura.data?.canais ?? [],
    avisos: leitura.data?.avisos ?? 0,
  };
}
