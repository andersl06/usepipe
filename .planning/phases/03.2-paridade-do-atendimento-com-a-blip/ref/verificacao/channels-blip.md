# Canais de atendimento (attendance/desk/channels): captura ao vivo da Blip

**Fonte:** bot dev `auvpcapitaldev1`, 2026-10-01, só leitura. Janela de 1920 px. Brutos em `referencias-blip/atendimento/03.2-capturas/2026-10-01-canais-*` (fora do Git). [M] medido, [A] estimado.

## URL e navegação
- `.../attendance/desk/channels`, menu Preferências > Canais de atendimento (último item do menu lateral). Título da página "Canais de atendimento".

## Cartões
Quatro cartões lado a lado [M]: cada um 343,4 x 270, fundo branco `#fff`, raio 16, sombra `rgba(0,0,0,.16) 0 2px 8px -2px`, x = 383, 742, 1101 e 1461 (passo de 359, ou seja, 15,6 de espaço), y = 233.

| Cartão | Subtítulo | Ação |
|---|---|---|
| Blip Desk (logo "blip desk") | Canal de atendimento do Blip | botão de contorno "Conectado" com ícone de confirmação (estado já conectado) |
| Salesforce (logo) | Live Agent da Salesforce | botão azul "Conectar >" |
| Salesforce MIAW (logo) | Nova integração | botão azul "Conectar >" |
| Canal Personalizado (ícone de nuvem) | Conecte-se a outros canais | botão azul "Conectar >" |

- Logo no topo à esquerda, título em negrito e subtítulo em cinza, botão no pé do cartão.

## Não medido e por quê
- O fluxo de "Conectar" de cada canal e o de desconectar o Blip Desk: não abri para não iniciar uma conexão nem arriscar gravação.
- Estados vazio, carregando, erro e tooltips. Tipografia exata dos títulos [A] (os componentes mostram 16 px no host; os reais ficam no shadow DOM).
- Contexto: durante a captura o rodapé do Portal exibiu "Serviços Blip fora do ar"; isso não é da tela.
