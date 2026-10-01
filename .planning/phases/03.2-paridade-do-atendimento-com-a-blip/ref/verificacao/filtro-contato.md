# Filtro de Contato (busca de contato) — o que a Blip faz

**Fonte:** HTML renderizado colado pelo dono em 2026-10-01 (campo `bds-autocomplete` do Filtro rápido Contato, com a lista aberta), mais a captura `2026-09-30-monitoramento-filtro-contato-sem-resultado`. O HTML colado tem nomes e identificadores reais de contatos; ele NÃO foi copiado para o repositório (fica só na conversa). Este arquivo guarda apenas a descrição sem dados pessoais.

## Estrutura observada
- Componente de busca com servidor (`data-testid="data-autocomplete-serverside-test"`): é um autocompletar cujos resultados vêm do servidor.
- Campo de texto único, placeholder "Digite parte do nome, e-mail ou telefone do contato", `type="text"`, `loading="false"` no estado parado.
- Ícone de erro (escondido enquanto não há erro) e seta para baixo no fim do campo, tamanho pequeno.
- Lista de resultados aberta abaixo do campo (`position-bottom`, estado `open`), com uma opção por contato.
- Cada opção: botão (`role="button"`) com tipografia 14px; o texto é `{nome do contato} - {identidade do contato no fluxo}`; o valor da opção (`data-value`) é a identidade do contato no fluxo (formato `{uuid}@tunnel.msging.net`). Pode haver espaço inicial no nome, nome vazio ou `undefined` (a lista mostra o que a API devolver, sem tratar).
- Estado sem resultado: "Nenhum contato encontrado."

## Comportamento (informado pelo dono)
- A lista **atualiza enquanto o usuário digita**, sem esperar terminar o número ou o nome; busca por número, nome ou identificador, com texto parcial.
- O resultado traz a identidade do contato no fluxo (tunnel) e o nome.

## Não sabemos ainda (não inventar)
- Mínimo de caracteres para disparar a busca, espera (debounce) entre teclas, limite de resultados e rolagem da lista.
- Estado "carregando" (o atributo `loading` existe, mas não há captura com ele ativo).
- Ordem dos resultados e destaque do trecho digitado.
- Como o contato escolhido aparece na pílula depois de confirmar, e se o filtro aceita mais de um contato.
- Medidas visuais (altura do campo, da opção, largura e altura máxima da lista): o HTML não traz geometria; medir com `ref/medir-tela.js` na aba logada do bot dev (só leitura).

## Para o Pipe (decisão do dono em 2026-10-01: replicar no componente único)
- O `PanelFilters` já é único e usado em Monitoramento, Histórico e Relatórios de atendimento e de satisfação; o filtro de Contato fica nele e as telas herdam. Confirmar na Blip se o Histórico e os relatórios usam o mesmo componente.
- Buscar no servidor enquanto digita, com a busca sempre limitada ao tenant da sessão (nunca vindo da requisição), texto escapado, e limite de resultados e de frequência de chamadas para não sobrecarregar a API.
- Mostrar a identidade do contato como a Blip mostra só se isso não expuser dado indevido: decidir com o dono se a opção exibe o identificador do fluxo ou um identificador do Pipe equivalente.
