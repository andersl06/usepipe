import { Botao, EstadoVazio, Etiqueta } from '@pipe/ui';
import { useCanalWhatsapp } from './casca';
import { rotuloDoMotivo } from '../../../lib/canais';

/**
 * Visão Geral — `FICHA-canal-whatsapp.md` §1 (conectado) e §7 (não conectado).
 *
 * Texto literal da Blip quando conectado, inclusive o link "boas práticas"
 * (aqui só em negrito: a ficha não guardou o destino real do link, e inventar
 * uma URL não é reproduzir a tela, é adivinhar).
 */
export function AbaVisaoGeral() {
  const { canal } = useCanalWhatsapp();

  if (canal.estado === 'conectado') {
    const numeroWa = (canal.numero ?? '').replace(/[^\d]/g, '');
    return (
      <div className="cl-form" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--p-e-3)' }}>
        <p style={{ margin: 0, fontWeight: 'var(--g-peso-forte)' }}>
          Seu chatbot está conectado ao número:
        </p>
        <Etiqueta tom="sucesso">{canal.numero ?? canal.numeroId}</Etiqueta>
        <p className="sub" style={{ margin: 0 }}>
          Você já pode conversar com seus clientes pelo WhatsApp, configurar as funcionalidades do
          canal e gerar mais insights para o seu negócio!
        </p>
        <p className="sub" style={{ margin: 0 }}>
          Com o número conectado, você tem a possibilidade de interagir com seus clientes e leads
          proativamente, sem precisar que ele te chame no WhatsApp primeiro. Conheça nossas{' '}
          <strong>boas práticas</strong>!
        </p>
        {numeroWa ? (
          <div className="cl-acoes">
            <Botao
              type="button"
              variante="primario"
              onClick={() => window.open(`https://wa.me/${numeroWa}`, '_blank', 'noreferrer')}
            >
              Testar no WhatsApp
            </Botao>
          </div>
        ) : null}
      </div>
    );
  }

  if (canal.estado === 'desligado') {
    return (
      <EstadoVazio titulo="Este canal está desligado">
        <p className="sub">
          Reconecte pelo cadastro manual em Canais de atendimento para voltar a usar este número.
        </p>
      </EstadoVazio>
    );
  }

  return (
    <EstadoVazio titulo="Ainda não é possível usar este canal" ilustracao="erro">
      <p className="sub">{rotuloDoMotivo(canal.motivo)}</p>
    </EstadoVazio>
  );
}
