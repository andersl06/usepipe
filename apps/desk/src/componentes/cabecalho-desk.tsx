import { Cabecalho } from '@pipe/ui';
import { AlternarTema } from './alternar-tema';
import type { EstadoAtendente } from '../servidor/consultas';

/**
 * Cabeçalho do Desk. Substitui o trilho vertical de ícones que existia aqui.
 *
 * O trilho tinha cinco itens e quatro deles estavam desabilitados: Mensagem
 * ativa, Respostas prontas, Contatos e Etiquetas. Item que não funciona não
 * aparece — os quatro saíram. Sobrando um módulo só, lateral nenhuma se
 * justifica: navegação de módulo vive no topo, horizontal, como nos outros
 * aplicativos do Pipe.
 *
 * À direita fica só o que é da conta: alternar tema e o avatar do atendente
 * com o ponto do estado atual.
 */

export const COR_DO_ESTADO: Record<EstadoAtendente, string> = {
  online: 'var(--p-sucesso-tinta)',
  pausa: 'var(--p-alerta-tinta)',
  invisivel: 'var(--p-tinta-3)',
  offline: 'var(--p-linha-forte)',
};

const ITENS = [{ rotulo: 'Atendimentos', href: '/' }] as const;

export function CabecalhoDesk({
  iniciais,
  nome,
  estado,
}: {
  iniciais: string;
  nome: string;
  estado: EstadoAtendente;
}) {
  return (
    <Cabecalho
      nome="Pipe Desk"
      itens={ITENS}
      // O Desk tem uma rota só: o caminho atual é constante e não precisa de
      // `usePathname` nem de componente de cliente.
      caminhoAtual="/"
      fim={
        <>
          <AlternarTema />
          <div
            className="me"
            title={`${nome} · ${estado}`}
            style={{ ['--estado-cor' as string]: COR_DO_ESTADO[estado] }}
          >
            {iniciais}
          </div>
        </>
      }
    />
  );
}
