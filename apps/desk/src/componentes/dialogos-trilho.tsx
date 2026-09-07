'use client';

import { useRef, type ReactNode } from 'react';
import { Icone } from '@pipe/ui';
import { AlternarTema } from './alternar-tema';
import { ATALHOS_GLOBAIS, ID_FOLHA_ATALHOS } from './atalhos';
import { IconeDesk } from './icones-desk';
import { sair } from '../app/entrar/acoes';

/**
 * Os dois destinos de conta do rodapé do trilho — Ajuda e Preferências.
 *
 * No Desk deles os dois são ícone de trilho com tooltip; aqui cada um abre um
 * `<dialog>` nativo, que é o mesmo gesto que o status e o encerramento já usam.
 * Diálogo em vez de rota porque nenhum dos dois tem conteúdo que justifique
 * sair da conversa: quem abre a folha de atalhos quer voltar a atender no
 * segundo seguinte.
 *
 * A folha de atalhos existe porque a spec pede (§11): o Blip não documenta
 * nenhum atalho, e o `#`, o `/` e o `@` do compositor não se descobrem sozinhos.
 */

const ATALHOS_DO_CAMPO: { tecla: string; faz: string }[] = [
  { tecla: '#', faz: 'Abre as respostas prontas — as da empresa e as suas, na mesma lista' },
  { tecla: '/', faz: 'Abre os comandos da conversa: encerrar, colocar em espera, nota interna' },
  { tecla: '@', faz: 'Menciona um colega, e o compositor vira nota interna' },
  { tecla: '↑ ↓', faz: 'Percorre a lista aberta pelo gatilho' },
  { tecla: 'Enter', faz: 'Com a lista aberta, insere o item; com ela fechada, envia a mensagem' },
  { tecla: 'Shift + Enter', faz: 'Quebra a linha sem enviar' },
  { tecla: 'Esc', faz: 'Fecha a lista do gatilho, ou o diálogo aberto' },
];

function BotaoDeDialogo({
  rotulo,
  icone,
  id,
  children,
}: {
  rotulo: string;
  icone: 'ajuda' | 'preferencias';
  /** Só a folha de atalhos precisa: é por ele que a tecla `?` a abre. */
  id?: string;
  children: ReactNode;
}) {
  const dialogo = useRef<HTMLDialogElement>(null);

  return (
    <>
      <button
        type="button"
        className="trilho-item"
        title={rotulo}
        aria-label={rotulo}
        onClick={() => dialogo.current?.showModal()}
      >
        {icone === 'ajuda' ? <IconeDesk nome="ajuda" /> : <Icone nome="engrenagem" tamanho={24} />}
      </button>
      <dialog id={id} ref={dialogo} aria-label={rotulo}>
        <div className="conteudo">
          <h4>{rotulo}</h4>
          {children}
          <div className="rodape">
            <button type="button" className="btn" onClick={() => dialogo.current?.close()}>
              Fechar
            </button>
          </div>
        </div>
      </dialog>
    </>
  );
}

export function BotaoAjuda() {
  return (
    <BotaoDeDialogo rotulo="Ajuda" icone="ajuda" id={ID_FOLHA_ATALHOS}>
      <p>Os atalhos do Desk. Nenhum deles envia nada sozinho.</p>

      {/* Dois grupos, porque a mesma tecla faz coisas diferentes conforme o
          foco: com o cursor no campo, `/` é texto e abre os comandos; fora
          dele, `/` abre as respostas prontas. Uma lista só faria as duas
          linhas parecerem contraditórias. */}
      <span className="lbl">Com o cursor no campo de mensagem</span>
      <dl className="atalhos">
        {ATALHOS_DO_CAMPO.map((atalho) => [
          <dt key={`t-${atalho.tecla}`} className="mono">
            {atalho.tecla}
          </dt>,
          <dd key={`d-${atalho.tecla}`}>{atalho.faz}</dd>,
        ])}
      </dl>

      <span className="lbl">Com o foco fora de qualquer campo</span>
      <dl className="atalhos">
        {ATALHOS_GLOBAIS.map((atalho) => [
          <dt key={`t-${atalho.tecla}`} className="mono">
            {atalho.tecla}
          </dt>,
          <dd key={`d-${atalho.tecla}`}>{atalho.faz}</dd>,
        ])}
      </dl>
    </BotaoDeDialogo>
  );
}

export function BotaoPreferencias({
  urlGestao,
  nome,
  email,
  tenant,
}: {
  urlGestao: string;
  nome: string;
  email: string;
  tenant: string;
}) {
  return (
    <BotaoDeDialogo rotulo="Preferências" icone="preferencias">
      {/* A conta em vigor vem PRIMEIRO: quem abre este diálogo com dúvida sobre
          com qual conta entrou não devia ter de ler as preferências antes. O
          avatar do trilho já mostra as iniciais desta mesma pessoa. */}
      <div className="eu-bloco">
        <b>{nome}</b>
        <span>{email}</span>
        <span>{tenant}</span>
      </div>

      <p>
        O Desk não configura fila, regra nem relatório — isso é do Pipe Gestão. Aqui fica só o
        que é da sua tela.
      </p>
      <div className="preferencia">
        <span>Tema claro e escuro</span>
        <AlternarTema />
      </div>
      <a className="btn" href={urlGestao} target="_blank" rel="noreferrer">
        <IconeDesk nome="externo" tamanho={14} />
        Abrir o Pipe Gestão
      </a>

      <form className="eu-sair" action={sair}>
        <button type="submit" className="btn">
          Sair
        </button>
      </form>
    </BotaoDeDialogo>
  );
}
