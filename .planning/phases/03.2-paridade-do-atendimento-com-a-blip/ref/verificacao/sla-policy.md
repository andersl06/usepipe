Base: 58bee4f038a5f7129e8b924a8ccd8636f6ba88f6
Tema: claro nas medições da Blip; o Pipe mantém os próprios tokens de superfície e tema escuro (D-12).

# Verificação: SLA (sla-policy) Blip x Pipe

**Fonte Blip.** Medição ao vivo de 2026-10-01 em `ref/verificacao/sla-policy-blip.md` e ficha `FICHA-sla-policy.md`. O bot de desenvolvimento não tinha regra de SLA: só o vazio e o formulário de criar foram medidos; a lista com regras e o formulário de editar vêm de ficha e texto do pacote [B]. **Fonte Pipe.** Leitura do código e testes automáticos (servidor com banco real); sem render no navegador. Nenhuma linha está VISUALLY VERIFIED.

## Estado: lista

Montada pela ficha e pelo padrão da lista de Regras, porque a Blip não tinha regras na captura. **Toda a tabela abaixo é NEEDS VALIDATION.**

| Elemento | Blip | Pipe | Status |
|---|---|---|---|
| Título e botão | "Regras de SLA"; botão "+ Criar regra", 132x40 [M] | igual | NEEDS VALIDATION |
| Busca | "Buscar regras de SLA" [B] | igual | NEEDS VALIDATION |
| Cartão | colunas "Regras de SLA", "Metas" (TME, TMR1, TMA), "Filas atribuídas" e etiqueta "Padrão" [ficha] | igual; o prazo de cada meta vai na dica do campo "Metas" | NEEDS VALIDATION |
| Ações | lápis e lixeira, sem interruptor [ficha] | igual (o interruptor foi removido) | NEEDS VALIDATION |
| Paginação | rodapé com "Resultados por página" [ficha] | componente compartilhado, início 5 | NEEDS VALIDATION |
| Política | uma regra tem várias metas e várias filas [M] | o cartão é uma política; o servidor guarda uma linha por meta e por escopo e a tela junta pelo nome | NEEDS VALIDATION |

## Estado: vazio

| Elemento | Blip | Pipe | Status |
|---|---|---|---|
| Título | "Você ainda não possui nenhuma regra de SLA", 16px, negrito [M] | mesmo texto | NEEDS VALIDATION |
| Descrição | "Defina as regras de SLA para determinar os prazos e condições de atendimento dos tickets." [M] | mesmo texto | NEEDS VALIDATION |
| Ilustração | personagem de atendimento, 160x166 [M] | sem ilustração | Lacuna (L-1) |

## Estado: carregando

Indicador `Carregando` compartilhado no lugar da lista (antes a página ficava em branco). NEEDS VALIDATION; a Blip não foi capturada nesse estado.

## Estado: erro

Mensagem de erro de leitura no lugar da lista; falha ao salvar mostra a mensagem do servidor abaixo do formulário; "Erro ao salvar regra!" é o texto padrão quando o servidor não explica [B]. NEEDS VALIDATION.

## Estado: criar política aberto

Mesma URL; seta de voltar devolve a lista sem confirmação [M].

| Elemento | Blip | Pipe | Status |
|---|---|---|---|
| Cabeçalho | seta de voltar e "Nova regra de SLA" [M] | igual; na edição, "Editar regra de SLA" [B] | NEEDS VALIDATION |
| Cartão | duas colunas por linha: rótulo e ajuda à esquerda, controle à direita (670px) [M] | duas colunas (`.sla-form-linha`); cor de cartão do Pipe | NEEDS VALIDATION |
| Nome da regra | campo com rótulo "Nome da regra", exemplo "SLA Padrão", máximo 100, erro "Informe um nome para a regra" [M] | igual; o servidor também limita a 100 e exige nome | NEEDS VALIDATION |
| Filas aplicáveis | seleção com chips das filas do bot, sem criar itens [M] | `ChipsInput` do produto com as filas do tenant da sessão | NEEDS VALIDATION |
| Utilizar regra como padrão | interruptor, desligado [M] | interruptor; ligado grava a política para toda a operação | NEEDS VALIDATION |
| Aviso de metas | "Configure pelo menos uma meta de SLA para acompanhamento" [M] | mesmo texto, cor de informação do Pipe | NEEDS VALIDATION |
| Três metas | TME, TMR1, TMA, cada uma com interruptor, ajuda, tempo e unidade [M] | iguais, com o mesmo título, ajuda e rótulo de campo | NEEDS VALIDATION |
| Tempo | numérico, mínimo 0, desabilitado até ligar, erro "Campo obrigatório" [M] | igual; também recusa zero, fracionado e mais de 7 dias | NEEDS VALIDATION |
| Unidade | Segundos, Minutos, Horas, Dias; inicial Segundos [M] | `Select` do produto, mesmas opções | NEEDS VALIDATION |
| Salvar | desabilitado em regra nova [M] | desabilitado até haver nome, escopo e uma meta válida | NEEDS VALIDATION |

## Estado: editar política aberto

Mesmo formulário preenchido: nome, filas, padrão e metas ligadas na maior unidade exata (7200 s abre como 2 horas). Metas já gravadas que a tela não mostra (`resposta`) são preservadas ao salvar. Salvar reativa linhas que estivessem desligadas. NEEDS VALIDATION na aparência; o gravar e o ler de volta têm teste com banco.

## Estado: excluir política

| Elemento | Blip | Pipe | Status |
|---|---|---|---|
| Confirmação | "Ao excluir, novos tickets das filas que seguiam essa regra não serão mais considerados nos indicadores de SLA em Relatórios e em Monitoramento"; pergunta "Deseja realmente excluir a regra de SLA?" [B] | mesmo texto; foco em Cancelar | NEEDS VALIDATION |
| Cronômetro correndo | não observado | o servidor recusa e diz para esperar as conversas encerrarem | VERIFIED por teste de código |

## Navegação

| Ação | Blip | Pipe | Status |
|---|---|---|---|
| Menu "Regras" | SLA é o segundo item [M] | `shell.tsx`: Atendimento, SLA, Horários | VERIFIED por leitura de código |
| Criar regra e lápis | formulário no lugar da lista, URL igual [M] | igual | NEEDS VALIDATION |
| Seta de voltar e Cancelar | devolvem a lista sem confirmação [M] | igual | NEEDS VALIDATION |

## Regra dos 90 dias

A Blip avisa que atrasos de SLA não aparecem para períodos acima de 90 dias [B]. Esta tela não tem período nem intervalo de datas, então nada a aplicar aqui; a regra continua valendo para Histórico e relatórios (ver `periodo-blip.md`). O prazo de cada meta é limitado a 7 dias no servidor.

## Lacunas

- **L-1 Ilustração do vazio.** Falta uma ilustração própria do Pipe (a da Blip não se copia). A lista compartilhada hoje não aceita ilustração.
- **L-2 Lista com regras e edição não vistas na Blip.** Sem regra no bot de desenvolvimento; a lista e a edição foram montadas pela ficha e pelo padrão de Regras. Validar com um bot que tenha regras de SLA.
- **L-3 Modelo de dados.** Uma política vira várias linhas com o mesmo nome. O nome é a chave da política: renomear renomeia todas as linhas. Decisão do dono: manter ou evoluir para uma tabela de política (exigiria migração, não autorizada).
- **L-4 Padrão e filas ao mesmo tempo.** A Blip não mostra o que acontece com a seleção de filas quando "padrão" está ligado; o Pipe aceita as duas coisas (escopo toda a operação mais as filas escolhidas). Validar.
- **L-5 Duas políticas padrão ou mesma fila.** O servidor recusa política que repete a mesma meta no mesmo escopo de outra regra ativa; a Blip não foi observada nesse caso.
- **L-6 Alerta de SLA.** O Pipe guarda alerta e ação de estouro por linha; a tela da Blip não tem esses campos. Linhas antigas com alerta continuam valendo.
- **L-7 Larguras e tema escuro.** Larguras medidas (cartão 1402, campo 671, unidade 155) não viraram token; conferir no navegador.
