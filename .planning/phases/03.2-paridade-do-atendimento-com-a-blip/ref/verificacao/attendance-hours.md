Base: f3902f5952aa3d4320ff278d33092e22a824921d
Tema: claro nas medições da Blip; o Pipe mantém os próprios tokens de superfície e tema escuro (D-12).

# Verificação: Horários (attendance-hours) Blip x Pipe

**Fonte Blip.** Medição ao vivo de 2026-10-01 em `ref/verificacao/attendance-hours-blip.md` (somente leitura). **Fonte Pipe.** Leitura do código, testes automáticos (servidor com banco real, regras puras do formulário) e tipos; sem render no navegador. Nenhuma linha está VISUALLY VERIFIED: toda linha visual é NEEDS VALIDATION.

Tela: `apps/management-vite/src/pages/registrations/regras-horarios.tsx` e `regras-horarios-formulario.tsx`. Servidor: `apps/api/src/domain/management/horarios.ts` (`POST/PUT/DELETE /v1/management/rules/schedules`).

## Estado: lista

| Elemento | Blip | Pipe | Status |
|---|---|---|---|
| Título e botão | "Regras de horários", 24px; "+ Criar horário", 144x40 [M] | mesmos textos; estilo do cabeçalho compartilhado | NEEDS VALIDATION |
| Cartão | nome, chip "Horário regular", descrição, lápis e lixeira com dica "Editar"/"Excluir"; fundo `#f6f6f6`, raio 16 [M] | nome, chip "Horário regular" (quando é o regular), descrição (quando existe), programação resumida (ex.: "Seg a Sex 08:00–18:00") e filas; lápis e lixeira com as mesmas dicas; fundo é o do cartão do Pipe (divergência já decidida) | NEEDS VALIDATION |
| Chip "Horário regular" e descrição | presentes [M] | `selo` "Horário regular" na quarta coluna do cartão e campo "Descrição" quando preenchida; gravados em `horario_atendimento.regular` e `.descricao` (migração 0088, D-H01) | NEEDS VALIDATION |
| Interruptor, busca, paginação | não existem [M] | não existem (busca oculta, sem paginação) | NEEDS VALIDATION |
| "Criar horário" com o formulário aberto | esmaecido [M] | o formulário substitui a lista, então o botão não aparece | NEEDS VALIDATION |

## Estado: vazio

| Elemento | Blip | Pipe | Status |
|---|---|---|---|
| Texto | não visto (o bot de desenvolvimento tem 1 horário) | "Nenhum horário cadastrado." | NEEDS VALIDATION |

## Estado: carregando

| Elemento | Blip | Pipe | Status |
|---|---|---|---|
| Indicador | spinner abaixo da lista nas primeiras leituras [M] | componente `Carregando` do produto no lugar da lista | NEEDS VALIDATION |

## Estado: erro

| Elemento | Blip | Pipe | Status |
|---|---|---|---|
| Falha de leitura | não visto | etiqueta de erro "Não foi possível carregar os horários." (antes a tela ficava em branco) | NEEDS VALIDATION |
| Falha ao salvar ou excluir | não visto | mensagem do servidor em etiqueta de erro dentro do formulário e do modal; o que foi digitado continua na tela | NEEDS VALIDATION |

## Estado: formulário criar/editar

Mesma URL, sem navegação; seta de voltar e Cancelar voltam à lista sem confirmação [M].

| Elemento | Blip | Pipe | Status |
|---|---|---|---|
| Cartão e seções | cartão único, seções separadas por linha, título e ajuda à esquerda, controles à direita [M] | cartão do formulário de Regras/SLA (`.regras-form`, `.sla-form-linha`), mesma divisão; sem token `--p-atend-*` novo | NEEDS VALIDATION |
| Nome | campo de 663 de largura, "Insira o nome do horário (Ex: Horário de vendas)" [M] | mesmo texto; até 100 caracteres; obrigatório (servidor e tela) | NEEDS VALIDATION |
| Descrição | campo de texto [M] | campo habilitado, até 300 caracteres (servidor e tela) | NEEDS VALIDATION |
| Horário regular | interruptor "Definir como horário regular da operação"; liga e some o seletor de filas [M] | interruptor habilitado com a ajuda da Blip ("Horário regular é aquele que se aplica para toda a sua operação..."); ligado, o seletor de filas e o contador somem (as filas já vinculadas são mantidas ao salvar); ao salvar, o regular anterior do tenant é desmarcado na mesma transação (índice único parcial por tenant) | NEEDS VALIDATION |
| Filas | seletor múltiplo com busca e contador "0 de 17 filas selecionadas" [M] | `ChipsInput` do produto com busca; contador "N de M filas selecionadas"; todas as filas do tenant em ordem alfabética | NEEDS VALIDATION |
| Programação | Segunda a Domingo; dia vazio mostra "Sem atendentes disponíveis" e "+"; faixa com De/Até (padrão 08:00–18:00), lixeira e "+" para outra faixa [M] | igual; De/Até são dois `Select` do produto (hora e minuto), nunca `<select>` nativo; várias faixas por dia; faixa com fim antes do início ou sobreposta bloqueia o Salvar e é recusada pelo servidor | NEEDS VALIDATION |
| Períodos sem atendimento | "+ Cadastrar período", contador "0 períodos cadastrados" / "1 periodo cadastrado"; título editável, "Dia completo" ligado, De/Até com data e hora, lixeira [M] | igual; datas com `input type=date` (padrão: hoje no fuso do horário); "Dia completo" ligado deixa as horas desabilitadas em 00:00 e 23:59, como na Blip; intervalo de no máximo 90 dias, sem sobreposição (por data e hora) | NEEDS VALIDATION |
| Período com hora ("Dia completo" desligado) | possível [M] | hora e minuto em dois `Select` do produto em De e Até; fim depois do início (tela e servidor); gravado como início e fim absolutos (`inicio_em`, `fim_em`) no fuso do horário; testado nas bordas do dia em America/Sao_Paulo | NEEDS VALIDATION |
| Rodapé | Cancelar, "Salvar alterações" (146x40); "Excluir" à esquerda na edição [M] | igual; "Salvar alterações" desabilitado até o rascunho ser válido | NEEDS VALIDATION |

Gravação: o formulário envia o horário inteiro (nome, descrição, regular, filas, faixas, períodos). Faixas e períodos são substituídos; exceções que abrem em horário especial são preservadas e avisadas no formulário. Cada período é uma linha com início e fim absolutos (dia completo vai de 00:00 do primeiro dia a 00:00 depois do último); o motor desconta o período do expediente. Linhas antigas de dia fechado foram levadas para dia completo pela migração e a tela junta dias consecutivos com o mesmo título. O fuso é o do tenant na criação e o do horário na edição (teste com a virada às 03:00Z em America/Sao_Paulo).

## Estado: excluir (alerta)

| Elemento | Blip | Pipe | Status |
|---|---|---|---|
| Título | "Tem certeza que deseja excluir este horário?" [M] | mesmo texto | NEEDS VALIDATION |
| Corpo | "Automaticamente, as filas que estão vinculadas a ele passarão a operar no Horário regular, mas elas podem ser vinculadas a outro horário posteriormente." [M] | com outro horário regular definido, o mesmo texto da Blip. Sem regular, o texto diz que as filas passarão a funcionar 24 horas; excluindo o próprio regular, avisa que as filas sem horário próprio também passam a 24 horas (decisão D-H02 mais a regra de 24 horas sem regular) | NEEDS VALIDATION |
| Botões | Cancelar e Excluir [M] | iguais; o servidor exclui o horário (faixas e exceções em cascata), as filas ficam com `horario_id` nulo e passam a usar o horário regular do tenant, ou 24 horas se não houver regular (testado com banco real) | NEEDS VALIDATION |

## Navegação

| Clique | Destino Blip (tela/modal/painel + URL) | Destino Pipe | Status |
|---|---|---|---|
| Criar horário | formulário na mesma página (`attendance/desk/attendance-hours`) | formulário no lugar da lista, mesma URL | NEEDS VALIDATION |
| Lápis | formulário de edição na mesma página | formulário preenchido, mesma URL | NEEDS VALIDATION |
| Lixeira (cartão) e Excluir (edição) | modal de alerta | `ConfirmModal`; depois de excluir volta à lista | NEEDS VALIDATION |
| Seta de voltar, Cancelar | lista, sem confirmação | lista, sem confirmação | NEEDS VALIDATION |
| Salvar alterações | grava e volta à lista (não observado, somente leitura) | grava e volta à lista | NEEDS VALIDATION |
| Menu: Regras > Horários | grupo Regras: Atendimento, SLA, Horários [M] | mesma ordem no menu do Pipe | NEEDS VALIDATION |

## Lacunas

1. **Horário regular, chip "Horário regular" e descrição:** resolvido pela migração 0088 (D-H01) e pela regra D-H02. Resta o relógio de SLA: hoje ele não usa horário nenhum (corre 24 horas para todas as filas, inclusive as com horário próprio); ligar o SLA ao expediente muda o cálculo de todas as filas e fica como decisão do dono.
2. **Período com hora:** resolvido pela migração 0088 (colunas `inicio_em`, `fim_em`, `dia_completo` em `horario_excecao`).
3. **Menu:** no grupo Preferências o Pipe tem "Dados", que a Blip não tem; foi movido para o fim, de modo que Configurações gerais e Canais de atendimento seguem a ordem da Blip.
4. **Não medido no Pipe:** geometria, tipografia e cores (nenhuma sessão foi forjada e o navegador não foi usado). Validações do formulário e mensagens de sucesso da Blip não foram observadas (leitura apenas).
