import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { CartaoEncerramentoTicket, avisarTicketFinalizado, type EtiquetaDeEncerramento } from '@pipe/ui';
import type { EtiquetaDoDesk } from '@pipe/contracts';
import type { LinhaConversaAberta } from '../lib/monitoramento';
import { api } from '../lib/api';
import { useLeitura } from '../lib/consulta';

/**
 * O menu do monitoramento mantém a rota de operação da Gestão, mas usa o mesmo
 * cartão do Desk: a Blip mostra um único `close-modal` nos dois pontos.
 */
export function ModalFinalizarMonitoramento({
  linha,
  aoFechar,
}: {
  linha: LinhaConversaAberta;
  aoFechar: () => void;
}) {
  const [selecionadas, setSelecionadas] = useState<string[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const consultas = useQueryClient();
  const leitura = useLeitura<{ etiquetas: EtiquetaDoDesk[] }>('/v1/etiquetas?escopo=conversa');
  const etiquetas: EtiquetaDeEncerramento[] = leitura.data?.etiquetas ?? [];

  useEffect(() => {
    if (!etiquetas.length) return;
    setSelecionadas((atuais) => atuais.length
      ? atuais
      : etiquetas.filter((etiqueta) => linha.etiquetas.includes(etiqueta.nome)).map((etiqueta) => etiqueta.id));
  }, [etiquetas, linha.etiquetas]);

  async function finalizar() {
    setEnviando(true);
    setErro(null);
    try {
      await api.post(`/v1/gestao/monitoramento/conversas/${linha.id}/finalizar`, { etiqueta_ids: selecionadas });
      await consultas.invalidateQueries({ queryKey: ['api'] });
      avisarTicketFinalizado(linha.ticket);
      aoFechar();
    } catch (causa) {
      setErro(causa instanceof Error ? causa.message : 'Não foi possível finalizar o ticket.');
      setEnviando(false);
    }
  }

  return (
    <CartaoEncerramentoTicket
      numero={linha.ticket}
      etiquetas={etiquetas}
      selecionadas={selecionadas}
      erro={erro}
      enviando={enviando}
      aoSelecionar={setSelecionadas}
      aoCancelar={aoFechar}
      aoFinalizar={() => void finalizar()}
    />
  );
}
