import { useState } from 'react';

/**
 * O botão de copiar do cartão de resumo — o ícone com tooltip "Copiar" que fica
 * ao lado do endereço e do ID na tela deles.
 *
 * É o ÚNICO pedaço de cliente desta rota; o resto do painel é Server Component.
 * A área de transferência só existe no navegador.
 *
 * Aqui ele é PALAVRA e não ícone: não há desenho de "copiar" nem em
 * `icones-portal.tsx` nem no `@pipe/ui`, e um ícone emprestado de outro
 * significado (um visto, um prédio) diria a coisa errada. A palavra é a mesma
 * do tooltip deles.
 *
 * Quando `navigator.clipboard` não existe (http sem TLS, navegador antigo) o
 * clique não faz nada — e por isso o valor ao lado é texto de verdade,
 * selecionável, e não um atributo escondido.
 */
export function BotaoCopiar({ valor, oQue }: { valor: string; oQue: string }) {
  const [copiado, setCopiado] = useState(false);

  return (
    <button
      type="button"
      className="ct-copiar"
      title="Copiar"
      aria-label={`Copiar ${oQue}`}
      onClick={() => {
        void navigator.clipboard?.writeText(valor).then(() => {
          setCopiado(true);
        });
      }}
    >
      {copiado ? 'Copiado' : 'Copiar'}
    </button>
  );
}
