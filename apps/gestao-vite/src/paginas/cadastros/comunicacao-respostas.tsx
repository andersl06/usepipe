import { useState } from 'react';
import { Botao } from '@pipe/ui';
import { useLeitura } from '../../lib/consulta';
import type { RespostaProntaListada } from '../../lib/comunicacao';
import { ListaRegras, type SecaoDeRegras } from '../../componentes/lista-regras';
import { FormularioRespostaPronta } from './comunicacao-respostas-formulario';
import { Modal } from './_modal';

/**
 * Respostas prontas — as da empresa. As pessoais o atendente cria e organiza
 * sozinho no Desk (§5 de `docs/specs/2026-09-05-desk-requisitos.md`), então não
 * entram nesta tela de gestão.
 *
 * `FICHA-replies.md` foi capturada com a lista vazia — o material só confirma
 * cabeçalho com "Criar categoria" à direita (§2.1) e o texto do estado vazio
 * (§6); não há coluna nem linha com dado real para copiar. Um desalinhamento
 * de fundo que a ficha não resolve: a Blip organiza respostas em
 * CATEGORIAS (cria a categoria primeiro, a resposta mora dentro dela); o
 * nosso cadastro é uma lista achatada, sem categoria — mudar isso é desenho
 * de dado novo (tabela/API), fora do que esta tela sozinha decide. Por isso
 * o botão do cabeçalho aqui diz "Nova resposta pronta" (o que a tela faz de
 * verdade) e não "Criar categoria".
 *
 * Reaproveita `ListaRegras`, o mesmo cartão-de-lista com busca da tela de
 * Regras — o cartão já resolve busca, agrupamento e estado vazio sem
 * reescrever nada disso aqui.
 */
export function PaginaRespostasProntas() {
  const [modalAberto, setModalAberto] = useState(false);
  const leitura = useLeitura<RespostaProntaListada[]>('/v1/gestao/comunicacao/respostas-prontas');
  if (!leitura.data) return null;
  const respostas = leitura.data;

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
        <Botao
          variante="primario"
          icone="mais"
          className="board-acao"
          onClick={() => setModalAberto(true)}
        >
          Nova resposta pronta
        </Botao>
      </div>

      <ListaRegras secoes={secoes} placeholder="Buscar por título ou por atalho" ocultarCabecalhoDeSecao />

      <Modal
        aberto={modalAberto}
        titulo="Nova resposta pronta"
        onFechar={() => setModalAberto(false)}
      >
        <FormularioRespostaPronta aoSalvar={() => setModalAberto(false)} />
      </Modal>
    </>
  );
}
