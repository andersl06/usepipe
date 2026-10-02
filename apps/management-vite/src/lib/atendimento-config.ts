import { api } from '@pipe/ui/api';
import { clienteDeConsultas } from './cliente-de-consultas';
import { motivoDe } from './rest';

/** Preferências globais do atendimento (`GET/PUT /v1/management/settings/attendance`). */
export interface ConfigAtendimento {
  modoEspera: { ativo: boolean };
  encerramentoAutomatico: {
    ativo: boolean;
    tempo: number;
    unidade: 'minutos' | 'horas';
    soSePrimeiroAtendimento: boolean;
    naoSeAguardandoAtendente: boolean;
    removerDaTela: boolean;
    alerta: { ativo: boolean; mensagem: string; antecedencia: number; unidade: 'minutos' | 'horas' };
    tags: { ativo: boolean; tags: string[] };
  } | null;
  distribuicao: {
    modo: 'menos_ativos' | 'mais_tempo_sem_receber';
    atendimentosPorAtendente: number;
    bloquearSolicitacaoManual: boolean;
  };
  transferencia: { habilitada: boolean; atendentesEspecificos: boolean; offline: boolean };
  midia: { audio: boolean; emoji: boolean; arquivos: boolean };
  esconderAguardando: { ativo: boolean };
  historico: { ativo: boolean };
  mensagensAtivas: { ativo: boolean; limitePorDisparo: number };
}

export type SecaoDeAtendimento = keyof ConfigAtendimento;

export const CAMINHO_CONFIG_ATENDIMENTO = '/v1/management/settings/attendance';

/**
 * Ação de cartão: monta a seção a partir do formulário e a grava. Interruptor e caixa marcada chegam
 * no `FormData` só quando ligados, por isso a leitura é por presença.
 */
export function salvarSecao<K extends SecaoDeAtendimento>(
  secao: K,
  montar: (dados: FormData) => ConfigAtendimento[K],
) {
  return async (_anterior: { ok: boolean; error?: string }, dados: FormData) => {
    try {
      await api.put(CAMINHO_CONFIG_ATENDIMENTO, { [secao]: montar(dados) });
    } catch (error) {
      return { ok: false, error: motivoDe(error, 'Não foi possível salvar.') };
    }
    void clienteDeConsultas.invalidateQueries({ queryKey: ['api'] });
    return { ok: true };
  };
}

export const ligado = (dados: FormData, nome: string): boolean => dados.get(nome) !== null;
export const inteiro = (dados: FormData, nome: string): number => Number(dados.get(nome));
