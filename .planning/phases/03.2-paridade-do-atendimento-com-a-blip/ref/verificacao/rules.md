Base: 58bee4f038a5f7129e8b924a8ccd8636f6ba88f6
Tema: claro nas medições da Blip (cartões cinza-claro sobre fundo claro); o Pipe mantém os próprios tokens de superfície e tema escuro (D-12).

# Verificação: Regras de atendimento (rules) Blip x Pipe

**Fonte Blip.** Medição ao vivo de 2026-10-01 em `ref/verificacao/rules-blip.md` ([M] medido, [B] texto do pacote do desk, [A] estimado). Capturas brutas fora do Git. **Fonte Pipe.** Leitura do código e testes automáticos; sem render no navegador neste plano (a tela exige sessão e não foi forjada nenhuma). Por isso nenhuma linha está VISUALLY VERIFIED: tudo que depende de aparência fica NEEDS VALIDATION.

## Estado: lista

| Elemento | Blip | Pipe (depois do plano 17) | Status |
|---|---|---|---|
| Título | "Regras de atendimento", 24px, peso 400 [M] | igual (`.board-head h2`) | NEEDS VALIDATION |
| Botão do topo | "+ Criar nova regra", azul, 166x40, à direita [M] | igual, texto e ícone mais | NEEDS VALIDATION |
| Busca | "Buscar regras de atendimento", 420x42, uma só, por nome [M] | igual; a busca do Pipe também casa fila e condições | NEEDS VALIDATION |
| Cartão da regra | "Nome da Regra" e "Fila" (rótulo 12px sobre valor 16px/700), lápis, lixeira, interruptor [M] | igual nas duas colunas e nas três ações; o ícone de excluir agora é lixeira | NEEDS VALIDATION |
| Setas de ordem e rodapé do cartão | não existem na Blip | mantidos: a primeira regra que casa vence, então a ordem é função real; o rodapé descreve a regra e avisa de regra inalcançável | NEEDS VALIDATION (decisão do dono pendente) |
| Interruptor | ligado em todas as regras da 1ª página [M] | grava `active` pela rota existente; espaçamento do estilo compartilhado | NEEDS VALIDATION |
| Paginação | "Resultados por página" (início 5), "1-5 de 12", navegação [M] | componente compartilhado, início 5 | NEEDS VALIDATION |
| Uma regra por fila | "Fila" mostra uma fila por regra [M] | igual: a regra tem uma fila de destino | VERIFIED por leitura de código |

## Estado: vazio

| Elemento | Blip | Pipe | Status |
|---|---|---|---|
| Texto | "Crie uma regra para definir como seu chatbot deve direcionar os atendimentos entre os atendentes cadastrados." [B] | mesmo texto como título do vazio; a linha de apoio diz que, sem regra, a conversa cai na fila padrão da caixa de entrada | NEEDS VALIDATION |

## Estado: carregando

| Elemento | Blip | Pipe | Status |
|---|---|---|---|
| Indicador | rotação central de 64px sobre a lista [M] | indicador `Carregando` compartilhado (antes a página ficava em branco) | NEEDS VALIDATION |

## Estado: erro

| Elemento | Blip | Pipe | Status |
|---|---|---|---|
| Falha de leitura | não capturado | mensagem de erro no lugar da lista (antes, página em branco) | NEEDS VALIDATION |
| Falha ao salvar ou excluir | aviso de erro de exclusão existe no pacote [B] | mensagem do servidor abaixo do formulário e dentro da confirmação | NEEDS VALIDATION |

## Estado: criar regra aberto

Mesma URL; o formulário ocupa o lugar da lista; seta de voltar e Cancelar devolvem a lista sem confirmação [M].

| Elemento | Blip | Pipe | Status |
|---|---|---|---|
| Cabeçalho | seta de voltar 40x40 e título "Regras de atendimento" [M] | igual (`esquerda` e título) | NEEDS VALIDATION |
| Nome | editável no lugar, padrão "Regra N", lápis ao lado, erro "Ops! Este campo precisa ser preenchido" [M] | igual (título com lápis, "Regra N" pelo próximo número livre); sem nome, Salvar fica desabilitado, sem a mensagem do erro | NEEDS VALIDATION |
| Se | seleção: Mensagem, Nome Contato, Email Contato, Extras Contato [M] | `Select` do produto com as mesmas quatro opções; "Extras Contato" abre o campo da chave | NEEDS VALIDATION |
| Condição | Contém, Não contém, É igual, Não é igual [M] | `Select` do produto com as mesmas quatro | NEEDS VALIDATION |
| Valor | campo de chips (vários valores) [M] | um valor de texto por condição | Lacuna (L-1) |
| Adicionar condição | botão centralizado [M] | igual | NEEDS VALIDATION |
| Conector E/OU | um por grupo adicional, valor inicial OU, apoio "qualquer uma das condições abaixo" [M] | um conector por regra, valor inicial OU; para E, o apoio é "todas as condições abaixo" (texto da Blip não visto) | Lacuna (L-2) |
| Remover condição | botão à direita da condição extra [M] | igual | NEEDS VALIDATION |
| Encaminhar atendimento para | seleção com todas as filas em ordem alfabética, inicial "Default" [M] | `Select` do produto, filas em ordem alfabética, inicial "Default" se existir | NEEDS VALIDATION |
| Salvar | desabilitado em regra nova até haver valor [M] | desabilitado até nome, condições e fila válidos | NEEDS VALIDATION |
| Cancelar | secundário, à direita [M] | igual | NEEDS VALIDATION |

## Estado: editar regra aberto

Mesmo formulário preenchido com nome, condições, conector e fila; Salvar habilitado ao abrir quando a regra é válida [M]. Grava por `PATCH rules/attendance/:id`, que valida tipo, limites e tenant no servidor (já existente). NEEDS VALIDATION na aparência.

## Estado: excluir regra

| Elemento | Blip | Pipe | Status |
|---|---|---|---|
| Confirmação | título "Excluir regra"; corpo "Ao excluir essa regra, você removerá permanentemente o direcionamento dos tickets condicionados para a fila de atendimento {fila}."; botões "Cancelar" e "Excluir" [B] | mesmo texto e botões; foco inicial em Cancelar | NEEDS VALIDATION (a Blip não foi aberta ao vivo) |

## Estado: prioridade

A Blip não tem prioridade dentro de Regras de atendimento: a ordem entre regras não aparece na tela [M]. No Pipe a ordem é feita pelas setas do cartão (um `PATCH` por regra que mudou de posição). Regras de priorização de tickets ficam na edição da fila, plano 16.

## Navegação

| Ação | Blip | Pipe | Status |
|---|---|---|---|
| Menu "Regras" | Atendimento, SLA, Horários, nessa ordem [M] | `shell.tsx`: Atendimento (`rules`), SLA (`sla-policy`), Horários (`attendance-hours`) | VERIFIED por leitura de código |
| Criar nova regra | formulário no lugar da lista, URL igual [M] | igual (estado local, sem navegação) | NEEDS VALIDATION |
| Lápis | abre o mesmo formulário, URL igual [M] | igual | NEEDS VALIDATION |
| Seta de voltar e Cancelar | devolvem a lista, sem confirmação [M] | igual | NEEDS VALIDATION |
| Lixeira | confirmação [B] | confirmação em janela | NEEDS VALIDATION |

## Lacunas

- **L-1 Valor em chips.** A Blip aceita vários valores por condição; o Pipe grava um texto por condição e o motor compara um valor. Depende de decisão do dono (modelo de dados e motor).
- **L-2 Conector por condição.** Na Blip há um conector por grupo adicional; o Pipe grava um combinador por regra. Decisão do dono pendente (já anotada no plano 16).
- **L-3 Largura e posição dos controles no formulário.** As larguras medidas (Se 300, Condição 298, Valor 684, Fila 1302) não viraram token: o Pipe usa colunas flexíveis. Conferir no navegador antes de abrir token `--p-atend-regras-*`.
- **L-4 Mensagem de erro do nome.** A Blip mostra "Ops! Este campo precisa ser preenchido"; o Pipe só desabilita Salvar.
- **L-5 Tema escuro e cartões `#f6f6f6`.** O Pipe usa seus tokens de cartão (`--g-card-background`); sem token novo nem divergência de cor.
- **L-6 Estado vazio, erro e carregando renderizados:** não verificados no navegador.
- **L-7 Seleção da fila com fila desativada:** o Pipe acrescenta "(desativada)" ao nome; a Blip não foi observada nesse caso.

Nenhum token `--p-atend-regras-*` foi criado: não há medida que o Pipe precise divergir com tolerância de 1px sem render para conferir.
