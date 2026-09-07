'use client';

import { useActionState, useId, useState, type ReactNode } from 'react';
import { useFormStatus } from 'react-dom';
import { Botao } from '@pipe/ui';
import type { Resultado } from '../../lib/configuracoes-comum';

/**
 * O formulário da área de configurações, e o único.
 *
 * Cada tela de configuração é a mesma coisa repetida: campos, um botão, e uma
 * resposta do servidor que precisa aparecer em português. Isso está aqui uma vez
 * porque escrever de novo em sete telas é como as mensagens de erro divergem —
 * três jeitos de dizer "não deu" e um deles em inglês.
 *
 * Duas escolhas que valem explicação:
 *
 * - **`<form action={...}>` de verdade, com `useActionState`.** O envio é o do
 *   navegador; o JavaScript só melhora. Sem ele a página recarrega e a
 *   configuração continua funcionando — que é o mínimo para uma tela em que
 *   alguém desativa o próprio acesso por engano.
 * - **Os campos vêm de fora, como `children`.** Eles são renderizados no
 *   servidor e chegam prontos, então este arquivo — que é o único `'use client'`
 *   da área — não importa nada que puxe `pg`. `Resultado` é `import type`, e
 *   `configuracoes-comum.ts` não toca em banco.
 */

export function Formulario({
  acao,
  children,
  botao,
  rotuloBotao = 'Salvar',
  className,
}: {
  acao: (anterior: Resultado | null, dados: FormData) => Promise<Resultado>;
  children: ReactNode;
  /** Substitui o botão padrão — é como a confirmação de exclusão entra. */
  botao?: ReactNode;
  rotuloBotao?: string;
  className?: string;
}) {
  const [resultado, enviar] = useActionState(acao, null);

  return (
    <form action={enviar} className={className ? `cfg-form ${className}` : 'cfg-form'}>
      {children}
      <div className="cfg-form-fim">
        {botao ?? <BotaoDeEnvio rotulo={rotuloBotao} />}
        <Resposta resultado={resultado} />
      </div>
    </form>
  );
}

/**
 * O formulário de UMA linha de tabela: desativar um membro, revogar uma chave,
 * cancelar um convite.
 *
 * Separado do `Formulario` porque a forma é outra — não tem título, não tem
 * "Salvo." e o alvo vem em campo oculto, não digitado. Continua sendo um `form`
 * de verdade: cada linha envia a si mesma, e sem JavaScript a página recarrega
 * com a mudança feita.
 *
 * O id vai em `<input type="hidden">` e é conferido com `ehUuid` do outro lado
 * antes de virar `where`. Campo oculto é sugestão do navegador, não promessa.
 */
export function FormularioDeLinha({
  acao,
  campos,
  children,
}: {
  acao: (anterior: Resultado | null, dados: FormData) => Promise<Resultado>;
  campos: Record<string, string>;
  children: ReactNode;
}) {
  const [resultado, enviar] = useActionState(acao, null);

  return (
    <form action={enviar} className="cfg-linha-form">
      {Object.entries(campos).map(([nome, valor]) => (
        <input key={nome} type="hidden" name={nome} value={valor} />
      ))}
      {children}
      {resultado && !resultado.ok ? (
        <span className="cfg-aviso erro" role="alert">
          {resultado.erro}
        </span>
      ) : null}
    </form>
  );
}

/** Botão de envio com o estado de espera. `useFormStatus` só funciona aqui dentro. */
export function BotaoDeEnvio({
  rotulo = 'Salvar',
  variante = 'primario',
}: {
  rotulo?: string;
  variante?: 'padrao' | 'primario' | 'perigo';
}) {
  const { pending } = useFormStatus();
  return (
    <Botao type="submit" variante={variante} disabled={pending}>
      {pending ? 'Salvando…' : rotulo}
    </Botao>
  );
}

/**
 * Confirmação em dois toques, no lugar de um `confirm()` do navegador.
 *
 * O primeiro clique arma e diz o que vai acontecer, com `role="alert"` para que
 * quem usa leitor de tela ouça a pergunta em vez de só encontrar um botão novo.
 * O segundo confirma. Sem diálogo modal: modal para uma frase é foco roubado e
 * uma armadilha de teclado a mais para manter.
 */
export function BotaoDeConfirmacao({
  rotulo,
  pergunta,
  rotuloConfirmar = 'Confirmar',
}: {
  rotulo: string;
  pergunta: string;
  rotuloConfirmar?: string;
}) {
  const [armado, setArmado] = useState(false);
  const { pending } = useFormStatus();

  if (!armado) {
    return (
      <Botao variante="perigo" onClick={() => setArmado(true)}>
        {rotulo}
      </Botao>
    );
  }

  return (
    <span className="cfg-confirmar">
      <span role="alert">{pergunta}</span>
      <Botao type="submit" variante="perigo" disabled={pending}>
        {pending ? 'Aplicando…' : rotuloConfirmar}
      </Botao>
      <Botao onClick={() => setArmado(false)}>Cancelar</Botao>
    </span>
  );
}

/**
 * A resposta do servidor.
 *
 * Erro é `role="alert"` (interrompe: a pessoa precisa saber que não gravou);
 * sucesso é `role="status"` (avisa sem cortar o que estiver sendo lido). Trocar
 * os dois é o erro clássico que faz um leitor de tela anunciar "salvo" por cima
 * do que a pessoa estava digitando.
 */
function Resposta({ resultado }: { resultado: Resultado | null }) {
  if (!resultado) return null;

  if (!resultado.ok) {
    return (
      <span className="cfg-aviso erro" role="alert">
        {resultado.erro}
      </span>
    );
  }

  if (resultado.segredo) return <Segredo valor={resultado.segredo} />;

  return (
    <span className="cfg-aviso ok" role="status">
      Salvo.
    </span>
  );
}

/**
 * O segredo que aparece UMA vez: token de chave de API, link de convite, segredo
 * de webhook. O banco guarda o hash (ou a cifra), então recarregar a página não
 * o traz de volta — e a caixa diz isso, porque descobrir depois custa uma chave
 * nova.
 *
 * É `readOnly` e não `disabled` de propósito: campo desabilitado não recebe foco
 * e não pode ser copiado com o teclado.
 */
function Segredo({ valor }: { valor: string }) {
  const [copiado, setCopiado] = useState(false);
  const idCampo = useId();

  return (
    <div className="cfg-segredo" role="status">
      <label htmlFor={idCampo}>
        Copie agora — isto não aparece de novo.
        <input id={idCampo} className="campo mono" readOnly value={valor} />
      </label>
      <Botao
        onClick={() => {
          void navigator.clipboard?.writeText(valor).then(() => setCopiado(true));
        }}
      >
        {copiado ? 'Copiado' : 'Copiar'}
      </Botao>
    </div>
  );
}
