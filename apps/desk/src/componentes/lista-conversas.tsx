import Link from 'next/link';
import { janelaAberta, pertoDeExpirar, segundosRestantes } from '@pipe/core';
import { decorrido, duracaoCurta } from '../servidor/formato';
import type { ConversaDaLista, TipoCanalBanco } from '../servidor/consultas';

/**
 * Rótulo curto do canal, do jeito que o atendente fala.
 *
 * Em caixa normal: canal é conteúdo da linha, não título de seção. Estava em
 * caixa alta e repetido em toda conversa da lista, o que dava à coluna o peso
 * de um cabeçalho. A caixa alta fica para rótulo de seção e cabeçalho de
 * coluna (ver docs/marca/MARCA.md, regras de interface).
 *
 * Os mesmos rótulos existem em `conversa.tsx` — quando o terceiro consumidor
 * aparecer, isto vira uma constante compartilhada.
 */
const CANAL: Record<TipoCanalBanco, string> = {
  whatsapp_cloud: 'WhatsApp',
  instagram: 'Instagram',
  email: 'E-mail',
  widget: 'Site',
};

const RESUMO_POR_TIPO: Record<string, string> = {
  audio: '🎙 Áudio',
  imagem: '🖼 Imagem',
  documento: '📎 Documento',
  video: '🎬 Vídeo',
  localizacao: '📍 Localização',
};

function resumoDaUltima(conversa: ConversaDaLista): string {
  const prefixo = RESUMO_POR_TIPO[conversa.ultimaMensagemTipo ?? 'texto'];
  if (prefixo && conversa.ultimaMensagemTipo !== 'texto') return prefixo;
  return conversa.ultimaMensagem ?? 'Sem mensagem ainda';
}

export function ListaConversas({
  conversas,
  selecionadaId,
  busca,
  agora,
}: {
  conversas: ConversaDaLista[];
  selecionadaId: string | null;
  busca: string;
  agora: Date;
}) {
  return (
    <>
      <form className="busca" action="/">
        <input
          type="search"
          name="busca"
          defaultValue={busca}
          placeholder="Buscar por nome do contato ou por fila"
          aria-label="Buscar atendimento"
        />
      </form>

      {conversas.length === 0 ? (
        <p className="vazio">
          Nenhum atendimento na sua fila{busca ? ` para “${busca}”` : ''}. Rode{' '}
          <code>pnpm seed:demo</code> se você esperava ver a demonstração.
        </p>
      ) : (
        <ul className="convs">
          {conversas.map((conversa) => {
            const temJanela = conversa.canalTipo === 'whatsapp_cloud';
            const aberta = janelaAberta(conversa.janelaExpiraEm, agora);
            const expirando = temJanela && pertoDeExpirar(conversa.janelaExpiraEm, agora);
            const fechada = temJanela && !aberta;
            return (
              <li key={conversa.id}>
                <Link
                  className="conv"
                  href={`/?conversa=${conversa.id}`}
                  aria-current={conversa.id === selecionadaId ? 'true' : undefined}
                >
                  <span className="nm">{conversa.contatoNome ?? 'Sem nome'}</span>
                  <span className="t">
                    {conversa.ultimaMensagemEm ? decorrido(conversa.ultimaMensagemEm, agora) : '—'}
                  </span>
                  <span className="sn">{resumoDaUltima(conversa)}</span>
                  <span className="meta">
                    {conversa.filaNome ? (
                      <span className="etiqueta">{conversa.filaNome}</span>
                    ) : null}
                    <span className="etiqueta">{CANAL[conversa.canalTipo]}</span>
                    {/*
                      Prioridade em etiqueta neutra. Era vermelha em "Alta" e
                      ocre em "Média", duas cores de estado repetidas em quase
                      toda linha da fila — e prioridade é categoria fixa, não
                      alerta: o atendente não resolve a prioridade clicando
                      nela. A cor da coluna fica reservada ao que ele resolve,
                      que é a janela expirando e a janela fechada, logo abaixo.
                    */}
                    {conversa.prioridade === 'alta' ? (
                      <span className="etiqueta">Prioridade alta</span>
                    ) : null}
                    {conversa.prioridade === 'media' ? (
                      <span className="etiqueta">Prioridade média</span>
                    ) : null}
                    {conversa.estado === 'em_espera' ? (
                      <span className="etiqueta">Em espera</span>
                    ) : null}
                    {expirando ? (
                      <span className="etiqueta alerta">
                        Janela {duracaoCurta(segundosRestantes(conversa.janelaExpiraEm, agora))}
                      </span>
                    ) : null}
                    {fechada ? <span className="etiqueta erro">Janela fechada</span> : null}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
