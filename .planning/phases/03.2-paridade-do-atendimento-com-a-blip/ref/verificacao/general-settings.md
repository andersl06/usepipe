Base: d494a9a0376ea6d13553b8fb0b168e8294991456
Tema: claro nas medições da Blip; o Pipe mantém os próprios tokens de superfície e tema escuro (D-12).

# Verificação: Configurações gerais (general-settings) Blip x Pipe

**Fonte Blip.** Captura ao vivo de 2026-10-01 em `ref/verificacao/general-settings-blip.md` (somente leitura; nenhum interruptor foi clicado). **Fonte Pipe.** Código, testes automáticos com banco real (tags globais, encerramento automático com relógio falso) e tipos; sem render no navegador. Nenhuma linha está VISUALLY VERIFIED: toda linha visual é NEEDS VALIDATION.

Tela: `apps/management-vite/src/pages/registrations/settings-general.tsx`. Rota `attendance/general-settings` (R-01). Servidor: `GET /v1/management/settings/general` e as ações `salvarTagsGlobais`, `salvarEtiquetasDeEncerramento`, `salvarIdentidade`, `salvarPesquisa` em `POST /v1/management/actions/:nome` (sessão, tenant da sessão, permissão `tenant.configurar`, auditoria).

## Onde foram parar as abas antigas

| Antes | Agora | Motivo |
|---|---|---|
| `preferences/data` (tabela de etiquetas com uso, nota sobre canais) | redireciona para `general-settings`; as etiquetas e seus usos moram nos cartões "Gerenciar tags" e "Tornar obrigatória..."; os canais já estão em `channels` | a Blip não tem tela Dados; nenhuma função se perdeu |
| `preferences/rules` (SLA e filas, só leitura) | redireciona para `sla-policy`; a capacidade e o horário de cada fila estão em `queue-management` | a Blip tem Regras de SLA e Gestão de filas separadas, e ambas gravam; a tela só lia |
| item "Dados" do menu Preferências | removido | a Blip tem só Configurações gerais e Canais |

## Estado: lista

| Elemento | Blip | Pipe | Status |
|---|---|---|---|
| Estrutura | uma página longa, sem abas, um cartão por seção, cada cartão com Salvar próprio [M] | igual: sem abas, um cartão por seção, Salvar próprio nos que gravam | NEEDS VALIDATION |
| Gerenciar tags | texto "Crie e edite as tags ... todas as filas", chips "Insira as tags separando por vírgulas", Salvar | igual, grava o catálogo GLOBAL de tags de conversa (`etiqueta`); remove só tag sem conversa etiquetada | NEEDS VALIDATION |
| Tornar obrigatória a inclusão de tags em atendimentos finalizados manualmente | caixa única, desmarcada | interruptor do cartão + escolha de quais tags são obrigatórias (modelo do Pipe: `etiqueta.obrigatoria_no_encerramento`); o Desk e a API recusam o encerramento manual sem elas; o encerramento automático não pede tags | divergência registrada |
| Histórico de atendimentos, Pipe Calls, Disponibilidade por fila, Distribuição de tickets, Envio de mensagens ativas, Transferir tickets, Envio de áudios, Emojis, Envio de arquivos, Esconder número de clientes aguardando, Atendente inativo, Tempo máximo de resposta do cliente | cartões com interruptor, caixas e campos [M] | cartões na mesma ordem, interruptor e caixas desabilitados, rodapé "Este recurso será liberado em breve para este fluxo."; sem Salvar | NEEDS VALIDATION |
| Categoria Modo de Espera | interruptor + "Enquanto o ticket estiver no Modo de Espera, o encerramento automático por inatividade será pausado." | cartão desabilitado com o mesmo texto; o efeito (pausa) já vale: conversa em `em_espera` não é encerrada e a contagem recomeça na retomada | NEEDS VALIDATION |
| Encerramento automático de tickets (global) | interruptor "Encerre automaticamente os tickets por inatividade" | cartão desabilitado; a regra continua por fila (gestão da fila) | NEEDS VALIDATION |
| Identidade da operação, Pesquisa de satisfação | não existem na Blip | mantidos no fim da página (D-06) | divergência registrada |
| Select de Modelo e de Quando disparar (pesquisa) | seletor da Blip | `Select` global de `@pipe/ui`; nome mantido no campo oculto para o envio do cartão; o botão Salvar acorda ao escolher | NEEDS VALIDATION |
| Largura, fundo, raio, sombra dos cartões | 1401,9, `#f6f6f6`, 16, `0 2px 8px -2px`; interruptor 56 x 32 [M] | tokens do cartão do Pipe (fundo branco do produto; interruptor de 38 x 22 do produto) | divergência registrada |

## Estado: vazio

| Elemento | Blip | Pipe | Status |
|---|---|---|---|
| Sem tags | chips vazios | chips vazios; cartão de obrigatórias mostra "Nenhuma tag cadastrada. Crie tags no cartão Gerenciar tags para poder exigi-las." | NEEDS VALIDATION |

## Estado: carregando

| Elemento | Blip | Pipe | Status |
|---|---|---|---|
| Leitura | não medido | a página não desenha até a leitura voltar (sem esqueleto) | NEEDS VALIDATION |

## Estado: erro

| Elemento | Blip | Pipe | Status |
|---|---|---|---|
| Erro de gravação | não medido | texto do servidor na etiqueta de erro do cartão (por exemplo: tag em uso, tag com HTML, mais de 200 tags, sem permissão) | NEEDS VALIDATION |

## Estado: salvando e sucesso

| Elemento | Blip | Pipe | Status |
|---|---|---|---|
| Salvar | botão 75 x 40 por cartão | "Salvar" do cartão, "Salvando…" durante o envio, desabilitado sem alteração | NEEDS VALIDATION |

## Navegação

| Clique | Blip | Pipe |
|---|---|---|
| Menu Preferências > Configurações gerais | `attendance/desk/general-settings` | `attendance/general-settings` |
| endereço antigo `preferences/general` | n/a | redireciona para `general-settings` |
| endereço antigo `preferences/data` | n/a | redireciona para `general-settings` |
| endereço antigo `preferences/rules` | n/a | redireciona para `sla-policy` |

## Integração com o Desk e o Builder (medida por testes e leitura de código)

- **Tags globais e o Desk:** o modal de finalizar do Desk lista o mesmo catálogo `etiqueta` que o cartão "Gerenciar tags" edita, e `closeInTransaction` exige as tags obrigatórias no encerramento manual. Mudou uma, mudou a outra, sem cópia.
- **Tags da fila x tags globais:** as tags da edição de fila (`fila.etiquetas`, lista de nomes) e as tags de encerramento do encerramento automático aplicam, por nome, só as que existem no catálogo (as demais ficam registradas em `tags_nao_encontradas`). A Blip tem uma lista só, global; no Pipe a lista da fila continua à parte (pendente do dono: unificar a lista da fila com o catálogo).
- **Encerramento automático:** não pede tags obrigatórias (é automático, "finalizados manualmente"); registra `encerrada_por = inatividade`.
- **Modo de Espera pausa o encerramento automático:** implementado e coberto em `apps/api/tests/auto-close.test.ts` (relógio falso): conversa em espera nunca vence; a contagem recomeça na retomada (evento `espera_encerrada`). O alerta de inatividade segue a mesma referência.
- **Encerramento automático global:** NÃO implementado. Não há onde gravar a regra global sem migração (ver Lacunas); a regra por fila continua. Precedência prevista quando existir: a fila vence a global.

## Lacunas

- Preferências globais sem armazenamento (migração NÃO autorizada): ver `ref/DEPENDENCIAS-03.1.md`, linha "Preferências globais do Desk". Proposta: coluna `tenant.configuracao_atendimento jsonb not null default '{}'` com CHECK de objeto (RLS do `tenant` já cobre), validada por esquema no servidor; leitura pelo motor de distribuição, pelo Desk (transferência, áudio, emoji, arquivo, número de aguardando) e pelo worker de encerramento (regra global, com a fila vencendo a global).
- `docs/specs/2026-09-05-desk-requisitos.md`, "Etiquetas de encerramento ... exclusivas por fila" (linha 59): a coluna `etiqueta.exclusiva_por_fila` existe, mas esta tela não a edita; mantida como está, sem remover.
- `docs/specs/2026-09-05-desk-requisitos.md`, "Modo de espera" (linhas 38 a 42): o Pipe pausa a inatividade do cliente e não pune o atendente; a implementação nova é compatível com isso.
- `docs/specs/2026-09-05-desk-requisitos.md`, "Fechamento automático ... a contagem zera a cada mensagem do cliente" (linhas 61 e 62): a contagem segue a última mensagem de qualquer autor, divergência já registrada no resumo C4.
- Obrigatoriedade global ("pelo menos uma tag") da Blip: o Pipe exige tags específicas. Pendente do dono: adotar a regra da Blip exigiria um campo global (mesma migração).
- Renomear tag: hoje é remover e criar (só se a tag não tiver conversa etiquetada).
- Tipografia dos títulos e valores iniciais dos campos numéricos [A] na Blip.

## Não medido

Nenhum clique, nenhuma gravação e nenhum estado de erro da Blip. Nenhuma linha acima foi vista no navegador.
