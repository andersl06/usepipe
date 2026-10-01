Base: cf0eea3ff670b12f38ebb7779b382f64601c0df9
Tema: claro nas medições da Blip; o Pipe mantém os próprios tokens de superfície e tema escuro (D-12).

# Verificação: Horários (attendance-hours) Blip x Pipe

**Fonte Blip.** Medição ao vivo de 2026-10-01 em `ref/verificacao/attendance-hours-blip.md` (somente leitura). **Fonte Pipe.** Leitura do código, testes automáticos (servidor com banco real, regras puras do formulário) e tipos; sem render no navegador. Nenhuma linha está VISUALLY VERIFIED: toda linha visual é NEEDS VALIDATION.

Tela: `apps/management-vite/src/pages/registrations/regras-horarios.tsx` e `regras-horarios-formulario.tsx`. Servidor: `apps/api/src/domain/management/horarios.ts` (`POST/PUT/DELETE /v1/management/rules/schedules`).

## Estado: lista

| Elemento | Blip | Pipe | Status |
|---|---|---|---|
| Título e botão | "Regras de horários", 24px; "+ Criar horário", 144x40 [M] | mesmos textos; estilo do cabeçalho compartilhado | NEEDS VALIDATION |
| Cartão | nome, chip "Horário regular", descrição, lápis e lixeira com dica "Editar"/"Excluir"; fundo `#f6f6f6`, raio 16 [M] | nome, programação resumida (ex.: "Seg a Sex 08:00–18:00") e filas; lápis e lixeira com as mesmas dicas; fundo é o do cartão do Pipe (divergência já decidida) | NEEDS VALIDATION |
| Chip "Horário regular" e descrição | presentes [M] | ausentes: não há onde gravar (ver Lacunas) | LACUNA |
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
| Descrição | campo de texto [M] | campo desabilitado com "Este recurso será liberado em breve para este fluxo." | LACUNA |
| Horário regular | interruptor "Definir como horário regular da operação"; liga e some o seletor de filas [M] | interruptor desabilitado com o texto de em breve; o seletor de filas fica sempre visível | LACUNA |
| Filas | seletor múltiplo com busca e contador "0 de 17 filas selecionadas" [M] | `ChipsInput` do produto com busca; contador "N de M filas selecionadas"; todas as filas do tenant em ordem alfabética | NEEDS VALIDATION |
| Programação | Segunda a Domingo; dia vazio mostra "Sem atendentes disponíveis" e "+"; faixa com De/Até (padrão 08:00–18:00), lixeira e "+" para outra faixa [M] | igual; De/Até são dois `Select` do produto (hora e minuto), nunca `<select>` nativo; várias faixas por dia; faixa com fim antes do início ou sobreposta bloqueia o Salvar e é recusada pelo servidor | NEEDS VALIDATION |
| Períodos sem atendimento | "+ Cadastrar período", contador "0 períodos cadastrados" / "1 periodo cadastrado"; título editável, "Dia completo" ligado, De/Até com data e hora, lixeira [M] | igual; datas com `input type=date` (padrão: hoje no fuso do horário); "Dia completo" ligado e desabilitado (horas 00:00 e 23:59 como na Blip com o interruptor ligado); intervalo de no máximo 90 dias, sem sobreposição | NEEDS VALIDATION |
| Período com horas parciais ("Dia completo" desligado) | possível [M] | não implementado: a tabela de exceções guarda uma data por linha e só dia fechado (ver Lacunas) | LACUNA |
| Rodapé | Cancelar, "Salvar alterações" (146x40); "Excluir" à esquerda na edição [M] | igual; "Salvar alterações" desabilitado até o rascunho ser válido | NEEDS VALIDATION |

Gravação: o formulário envia o horário inteiro (nome, filas, faixas, períodos). Faixas e dias fechados são substituídos; exceções que abrem em horário especial são preservadas e avisadas no formulário. Um período vira um dia fechado por dia, e a tela junta de volta dias consecutivos com o mesmo título. O fuso é o do tenant na criação e o do horário na edição; o dia fechado vale de 00:00 a 24:00 no fuso do horário (teste com a virada às 03:00Z em America/Sao_Paulo).

## Estado: excluir (alerta)

| Elemento | Blip | Pipe | Status |
|---|---|---|---|
| Título | "Tem certeza que deseja excluir este horário?" [M] | mesmo texto | NEEDS VALIDATION |
| Corpo | "Automaticamente, as filas que estão vinculadas a ele passarão a operar no Horário regular, mas elas podem ser vinculadas a outro horário posteriormente." [M] | "As filas que estão vinculadas a ele ficarão sem horário e passarão a funcionar 24 horas, mas podem ser vinculadas a outro horário posteriormente." Divergência de propósito: o Pipe não tem Horário regular, e o texto da Blip prometeria um comportamento que o servidor não tem | DIVERGÊNCIA (dono decide) |
| Botões | Cancelar e Excluir [M] | iguais; o servidor exclui o horário (faixas e exceções em cascata) e as filas ficam com `horario_id` nulo, testado | NEEDS VALIDATION |

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

1. **Horário regular, chip "Horário regular" e descrição** exigem colunas novas em `horario_atendimento` (migração não autorizada). Controles desabilitados e listados em `DEPENDENCIAS-03.1.md`. Sem a regra de horário regular, filas sem horário seguem contando 24 horas.
2. **Período com horas parciais** exige modelo de período (data e hora de início e de fim) em vez de uma exceção por data. Interruptor "Dia completo" fica ligado e desabilitado.
3. **Menu:** no grupo Preferências o Pipe tem "Dados", que a Blip não tem; foi movido para o fim, de modo que Configurações gerais e Canais de atendimento seguem a ordem da Blip.
4. **Não medido no Pipe:** geometria, tipografia e cores (nenhuma sessão foi forjada e o navegador não foi usado). Validações do formulário e mensagens de sucesso da Blip não foram observadas (leitura apenas).
