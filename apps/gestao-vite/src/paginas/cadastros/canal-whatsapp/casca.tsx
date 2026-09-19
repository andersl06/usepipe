import { Outlet, useLocation, useOutletContext, useParams } from 'react-router-dom';
import { EstadoVazio } from '@pipe/ui';
import Link from '../../../componentes/link';
import { baseDoAtendimento } from '../../operacao/casca';
import { useContato } from '../../fluxo/contato';
import { useLeitura } from '../../../lib/consulta';
import type { CanalWhatsAppVisivel } from '../../../lib/canais';
import './canal-whatsapp.css';

/**
 * O canal WhatsApp por dentro — `FICHA-canal-whatsapp.md` §1: breadcrumb "‹
 * WhatsApp" e as abas Visão Geral | Perfil da empresa | Configurações |
 * Configurações de alerta | Ambiente de testes.
 *
 * §7 documenta que, DESCONECTADO, a Blip esconde "Perfil da empresa" e
 * "Configurações" (só aparecem com número conectado) — reproduzido abaixo
 * pelo `estado` de `listarCanaisWhatsApp` (`api/src/dominio/canais.ts`).
 *
 * A moldura em volta (barra do portal + `desk-sidebar`) não é a da Blip —
 * decisão já registrada em `cadastros/canais.tsx`: aqui "Canais" é item do
 * módulo Atendimento, não uma seção own-top-level como na origem. O que este
 * arquivo reproduz fielmente é a FORMA de dentro do canal: as abas, os
 * textos, os campos — a moldura fica a que o resto do Pipe já usa.
 */

interface ContextoDoCanal {
  canal: CanalWhatsAppVisivel;
}

export function useCanalWhatsapp(): ContextoDoCanal {
  return useOutletContext<ContextoDoCanal>();
}

const ABAS = [
  { rotulo: 'Visão Geral', segmento: '' },
  { rotulo: 'Perfil da empresa', segmento: 'perfil', exigeConectado: true },
  { rotulo: 'Configurações', segmento: 'configuracoes', exigeConectado: true },
  { rotulo: 'Configurações de alerta', segmento: 'alerta' },
] as const;

export function CascaCanalWhatsapp() {
  const { contato } = useContato();
  const { canalId } = useParams<{ canalId: string }>();
  const base = `${baseDoAtendimento(contato.tipo, contato.id)}/canais`;
  const caminho = useLocation().pathname;

  const leitura = useLeitura<{ canais: CanalWhatsAppVisivel[] }>('/v1/canais/whatsapp');
  if (!leitura.data) return null;
  const canal = leitura.data.canais.find((c) => c.id === canalId);

  if (!canal) {
    return (
      <>
        <Link href={base} className="cw-voltar">
          ‹ WhatsApp
        </Link>
        <EstadoVazio titulo="Canal não encontrado">
          <Link href={base}>Voltar para Canais de atendimento</Link>
        </EstadoVazio>
      </>
    );
  }

  const conectado = canal.estado === 'conectado';
  const baseDoCanal = `${base}/whatsapp/${canal.id}`;

  return (
    <div className="cw-casca">
      <Link href={base} className="cw-voltar">
        ‹ WhatsApp
      </Link>

      <div className="card cw-painel">
        <nav className="tabs cw-abas" aria-label="Abas do canal WhatsApp">
          {ABAS.filter((a) => conectado || !('exigeConectado' in a && a.exigeConectado)).map((aba) => {
            const href = aba.segmento ? `${baseDoCanal}/${aba.segmento}` : baseDoCanal;
            // Sem `estaAtivo` genérico: a aba-índice (sem segmento) precisa de
            // igualdade exata, senão fica "ativa" em toda sub-rota do canal.
            const ativa = aba.segmento ? caminho.startsWith(`${href}/`) || caminho === href : caminho === href;
            return (
              <Link key={aba.rotulo} href={href} aria-current={ativa ? 'true' : undefined}>
                {aba.rotulo}
              </Link>
            );
          })}
          <span className="cw-aba-obra">
            Ambiente de testes
            <span className="pt-obra-selo">em breve</span>
          </span>
        </nav>

        <div className="cw-conteudo">
          <Outlet context={{ canal } satisfies ContextoDoCanal} />
        </div>
      </div>
    </div>
  );
}
