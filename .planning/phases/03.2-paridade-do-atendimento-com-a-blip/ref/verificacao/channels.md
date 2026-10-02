Base: d494a9a0376ea6d13553b8fb0b168e8294991456
Tema: claro nas medições da Blip; o Pipe mantém os próprios tokens de superfície e tema escuro (D-12).

# Verificação: Canais de atendimento (channels) Blip x Pipe

**Fonte Blip.** Captura ao vivo de 2026-10-01 em `ref/verificacao/channels-blip.md` (somente leitura). **Fonte Pipe.** Código e tipos; sem render no navegador. Nenhuma linha está VISUALLY VERIFIED: toda linha visual é NEEDS VALIDATION.

Tela: `apps/management-vite/src/pages/registrations/channels.tsx`. Rota `attendance/channels`. A conexão de canal em si (WhatsApp, Instagram, Messenger) continua dentro do fluxo, em `/{tipo}/{id}/canais/*`, e não foi tocada; nada aqui altera `roteador_canal`, caixas de entrada ou a fila padrão da entrada.

## Estado: lista

| Elemento | Blip | Pipe | Status |
|---|---|---|---|
| Título | "Canais de atendimento", sem subtítulo nem botão | igual | NEEDS VALIDATION |
| Grade | 4 cartões lado a lado, 343,4 x 270, passo 359 (espaço 15,6) [M] | tokens `--p-atend-canal-cartao-largura` 343, `-altura` 270, `-espaco` 16 (antes 242 x 292, medida antiga) | NEEDS VALIDATION |
| Cartão | fundo branco, raio 16, sombra `0 2px 8px -2px`, logo no topo, título em negrito, subtítulo cinza, botão no pé [M] | raio, sombra e fundo pelos tokens de cartão; logo, título, subtítulo e botão no pé | NEEDS VALIDATION |
| Blip Desk | "Canal de atendimento do Blip", botão de contorno "Conectado" | "Pipe Desk", "Canal de atendimento do Pipe", botão "Conectado" (contorno, desabilitado: desconectar o Desk próprio não existe) | NEEDS VALIDATION |
| Salesforce | "Live Agent da Salesforce", botão azul "Conectar >" | igual, botão desabilitado com `title` e nota "Este recurso será liberado em breve para este fluxo." | NEEDS VALIDATION |
| Salesforce MIAW | "Nova integração", "Conectar >" | igual, desabilitado | NEEDS VALIDATION |
| Canal Personalizado | "Conecte-se a outros canais", "Conectar >" | igual, desabilitado | NEEDS VALIDATION |
| Ícones | logos da Blip e da Salesforce | símbolo do Pipe e ícones do produto (D-05: nada da Blip no repositório) | divergência registrada |

## Estado: vazio

| Elemento | Blip | Pipe | Status |
|---|---|---|---|
| Sem canais | não medido; o catálogo é fixo de 4 cartões | catálogo fixo, não há estado vazio | NEEDS VALIDATION |

## Estado: carregando

| Elemento | Blip | Pipe | Status |
|---|---|---|---|
| Carregando | não medido | a tela não lê a API: o catálogo é fixo, não há carregamento | NEEDS VALIDATION |

## Estado: erro

| Elemento | Blip | Pipe | Status |
|---|---|---|---|
| Erro | não medido | a tela não lê a API: não há erro de leitura | NEEDS VALIDATION |

## Estado: ação aberta (Conectar)

| Elemento | Blip | Pipe | Status |
|---|---|---|---|
| Fluxo de Conectar e de desconectar | não aberto na captura (não iniciar conexão) | botão desabilitado com o aviso do UI-SPEC | NEEDS VALIDATION |

## Navegação

| Clique | Blip | Pipe |
|---|---|---|
| Menu Preferências > Canais de atendimento | `attendance/desk/channels` | `attendance/channels` (shell de operação) |
| Conectar (Salesforce, MIAW, Personalizado) | fluxo de conexão não medido | sem destino, desabilitado |
| Conectado (Pipe Desk) | não medido | sem destino, desabilitado |

## Lacunas

- Salesforce, Salesforce MIAW e Canal Personalizado: o Pipe não tem essas integrações; o fluxo de conexão da Blip não foi medido. Listado em `ref/DEPENDENCIAS-03.1.md`.
- Coerência com o Builder: os canais que de fato recebem conversa (WhatsApp, Instagram, Messenger) continuam sendo configurados no fluxo; a fila padrão da entrada (`queue-entry.ts`) e o `roteador_canal` não mudam com esta tela.
- Tipografia exata dos títulos [A] na Blip (shadow DOM).
- Pendente do dono: se o cartão "Pipe Desk" deve permitir desconectar (a Blip não foi aberta para medir).

## Não medido

Nenhum clique, nenhum estado de erro e nenhum tooltip da Blip. Nenhuma linha acima foi vista no navegador.
