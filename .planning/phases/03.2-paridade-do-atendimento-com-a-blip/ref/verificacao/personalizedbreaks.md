Base: cf0eea3ff670b12f38ebb7779b382f64601c0df9
Tema: claro nas medições da Blip; o Pipe mantém os próprios tokens de superfície e tema escuro (D-12).

# Verificação: Pausas personalizadas (personalizedbreaks) Blip x Pipe

**Fonte Blip.** Medição ao vivo de 2026-10-01 em `ref/verificacao/personalizedbreaks-blip.md` (somente leitura; o bot de desenvolvimento não tem pausas) e ficha `FICHA-personalizedbreaks.md`. **Fonte Pipe.** Leitura do código, testes automáticos (servidor com banco real, regras puras) e tipos; sem render no navegador. Nenhuma linha está VISUALLY VERIFIED: toda linha visual é NEEDS VALIDATION.

Tela: `apps/management-vite/src/pages/registrations/agents-breaks.tsx` e `agents-breaks-formulario.tsx`. Servidor: `POST/PATCH/DELETE /v1/management/agents/pauses`.

## Estado: lista

A lista com pausas não foi capturada na Blip; a estrutura vem da ficha.

| Elemento | Blip | Pipe | Status |
|---|---|---|---|
| Título e botão | "Pausas personalizadas" 24px; "+ Nova Pausa" 138x40 [M] | mesmos textos | NEEDS VALIDATION |
| Cartão | colunas "Nome da pausa" e "Duração"; só a ação de excluir, sem interruptor nem lápis [ficha] | igual; ação é a lixeira com dica "Excluir" | NEEDS VALIDATION |
| Paginação | só setas, número da página e contador, sem "Resultados por página" [ficha] | componente compartilhado com o seletor de tamanho oculto, início 5 | NEEDS VALIDATION |
| Busca | não existe [ficha] | oculta | NEEDS VALIDATION |
| Editar pausa | não existe na ficha | a tela não oferece; o servidor aceita `PATCH` (ativar e desativar, produtivo) sem controle na tela | NEEDS VALIDATION |

## Estado: vazio

| Elemento | Blip | Pipe | Status |
|---|---|---|---|
| Título | "Que tal personalizar os tipos de pausa disponíveis para sua equipe de atendimento?" (negrito) [M] | mesmo texto | NEEDS VALIDATION |
| Texto | "Pausas personalizadas ajudam atendentes a ter mais autonomia na gestão de tempo e te dão mais controle sobre sua operação." [M] | mesmo texto | NEEDS VALIDATION |
| Ilustração | caixa aberta 160x165 [M] | sem ilustração própria ainda (decisão do dono pendente, como no SLA) | LACUNA |

## Estado: carregando

| Elemento | Blip | Pipe | Status |
|---|---|---|---|
| Indicador | não visto | componente `Carregando` do produto (antes a tela ficava em branco) | NEEDS VALIDATION |

## Estado: erro

| Elemento | Blip | Pipe | Status |
|---|---|---|---|
| Falha de leitura | não visto | etiqueta de erro "Não foi possível carregar as pausas personalizadas." | NEEDS VALIDATION |
| Falha ao criar ou excluir | não visto | mensagem do servidor na etiqueta de erro do modal; no modal de exclusão, o erro aparece acima dos botões | NEEDS VALIDATION |

## Estado: criar pausa (modal)

| Elemento | Blip | Pipe | Status |
|---|---|---|---|
| Modal | "Criar nova pausa personalizada" sobre a lista, sem mudar a URL [M] | `Modal` do produto sobre a lista, mesma URL | NEEDS VALIDATION |
| Nome da pausa | texto, máximo 30 [M] | máximo 30 no campo e no servidor (`name_size`) | NEEDS VALIDATION |
| Duração em minutos | número, inicial 0, máximo 999 [M] | número, inicial 0, máximo 999; o servidor aceita de 1 a 999 (antes recusava acima de 480, o que contradizia o campo) | NEEDS VALIDATION |
| Criar | começa desabilitado até os campos serem válidos [M] | desabilitado até nome preenchido e duração de 1 a 999; a regra de duração mínima da Blip não foi confirmada (o campo aceita 0 lá) | NEEDS VALIDATION |
| Cancelar | fecha sem confirmação e não cria nada [M] | igual | NEEDS VALIDATION |
| Conta como produtivo | não existe [M] | caixa de marcação própria do Pipe, que grava e alimenta o relatório de esforço | DIVERGÊNCIA (dono decide) |
| Ilustração e botão fechar (X) do modal | ilustração 178x191 e X no canto [M] | botão de fechar do `Modal` compartilhado; sem ilustração | LACUNA |

## Estado: excluir

| Elemento | Blip | Pipe | Status |
|---|---|---|---|
| Confirmação | não capturada (sem pausas para abrir); texto do plano: "Excluir pausa: esta ação não pode ser desfeita." com "Excluir pausa" e "Cancelar" | título "Excluir pausa", texto "Esta ação não pode ser desfeita.", botões "Excluir pausa" e "Cancelar" | NEEDS VALIDATION |
| Efeito | não observado | exclui o motivo; pausas históricas ficam sem motivo (`ON DELETE SET NULL`), testado | NEEDS VALIDATION |

## Navegação

| Clique | Destino Blip (tela/modal/painel + URL) | Destino Pipe | Status |
|---|---|---|---|
| Nova Pausa | modal "Criar nova pausa personalizada", mesma URL | modal sobre a lista, mesma URL | NEEDS VALIDATION |
| Criar (válido) | cria e fecha o modal (não observado, somente leitura) | grava, fecha o modal e a lista recarrega | NEEDS VALIDATION |
| Cancelar | fecha o modal sem confirmação | fecha o modal sem confirmação | NEEDS VALIDATION |
| Lixeira da pausa | confirmação de exclusão (não capturada) | `ConfirmModal`; depois de excluir fica na lista | NEEDS VALIDATION |
| Menu: Atendentes > Pausas personalizadas | grupo Atendentes: Gestão de atendentes, Filas de atendimento, Pausas personalizadas [M] | mesma ordem no menu do Pipe | NEEDS VALIDATION |

## Lacunas

1. Lista com pausas, colunas reais, ordenação e confirmação de exclusão da Blip: não capturadas (o bot de desenvolvimento não tem pausas; criar uma gravaria).
2. Ilustração do vazio e do modal: sem arte própria do Pipe.
3. Duração mínima da Blip e mensagens de validação: não observadas.
