import { carregarRespostasProntas } from '../../../lib/comunicacao';
import { numero } from '../../../lib/formato';
import { ListaRegras, type SecaoDeRegras } from '../../../componentes/lista-regras';
import { FormularioRespostaPronta } from './formulario';

export const dynamic = 'force-dynamic';

/**
 * Respostas prontas — as da empresa. As pessoais o atendente cria e organiza
 * sozinho no Desk (§5 de `docs/specs/2026-09-05-desk-requisitos.md`), então não
 * entram nesta tela de gestão.
 *
 * Reaproveita `ListaRegras`, o mesmo cartão-de-lista com busca da tela de
 * Regras — é o padrão de tela apontado para seguir, e o cartão já resolve
 * busca, agrupamento e estado vazio sem reescrever nada disso aqui.
 */
export default async function PaginaRespostasProntas() {
  const respostas = await carregarRespostasProntas();

  const secoes: SecaoDeRegras[] = [
    {
      titulo: 'Respostas prontas',
      vazio: 'Nenhuma resposta pronta cadastrada. O atendente não tem nada para chamar com #.',
      cartoes: respostas.map((r) => ({
        id: r.id,
        campos: [
          { rotulo: 'Atalho', valor: `#${r.atalho}` },
          { rotulo: 'Título', valor: r.titulo },
          { rotulo: 'Fila / canal', valor: r.categoria ?? '—' },
          { rotulo: 'Corpo', valor: r.corpo },
        ],
        situacao: r.ativa ? 'Ativa' : 'Desativada',
        ativa: r.ativa,
        procura: `${r.titulo} ${r.atalho}`.toLowerCase(),
      })),
    },
  ];

  return (
    <>
      <div className="board-head">
        <h2>Respostas prontas</h2>
        <span className="sub">
          {numero(respostas.length)} respostas da empresa. O atalho é único por tenant — a tela
          confere na hora de salvar, porque a tabela não confere sozinha.
        </span>
      </div>

      <FormularioRespostaPronta />

      <ListaRegras secoes={secoes} placeholder="Buscar por título ou por atalho" />
    </>
  );
}
