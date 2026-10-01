# Pausas personalizadas (`attendance/desk/personalizedbreaks`) — Blip ao vivo

**Base:** captura ao vivo em 2026-10-01 no bot dev `auvpcapitaldev1`, somente leitura (nenhuma pausa criada). Janela 1920x863. Arquivos brutos (fora do Git): `referencias-blip/atendimento/03.2-capturas/2026-10-01-pausas-*`.

Legenda: [M] medido ao vivo; [A] estimado do screenshot.

## Posição no menu [M]
Grupo **Atendentes** (Gestão de atendentes, Filas de atendimento, **Pausas personalizadas**). O menu completo está em `attendance-hours-blip.md`.

## Tela [M]
- URL fixa; criar acontece em **modal** sobre a lista, sem mudar a URL.
- Título "Pausas personalizadas" (24px, peso 400, `#282828`, Nunito Sans) e botão "+ Nova Pausa" (138x40, azul sólido) à direita.
- **Estado vazio** (o dev não tem pausas): ilustração de caixa aberta (160x165) centralizada; título em negrito **"Que tal personalizar os tipos de pausa disponíveis para sua equipe de atendimento?"**; texto: "Pausas personalizadas ajudam atendentes a ter mais autonomia na gestão de tempo e te dão mais controle sobre sua operação."
- Lista com pausas: **não capturada** (o dev não tem nenhuma; criar uma gravaria).

## Modal "Criar nova pausa personalizada" [M]
- Rodapé de ação com 592 de largura, fundo `#f6f6f6`, ilustração à esquerda (178x191), botão fechar (X) no canto.
- Título "Criar nova pausa personalizada" (peso forte [A]).
- Campo **"Nome da pausa"**: texto, máximo **30 caracteres**.
- Campo **"Duração em minutos"**: número, valor inicial 0, máximo **999** (3 dígitos).
- Rodapé: **Cancelar** (texto) e **Criar** (66x40, azul) — **Criar começa desabilitado** até os campos serem válidos.
- Cancelar fecha sem confirmação e não cria nada.

## Não medido e por quê
- Lista com pausas (colunas, ações, interruptor de ativar, ordenação, paginação): o dev não tem pausas.
- Editar e excluir pausa, e a confirmação de exclusão: sem pausas para abrir.
- Cor da pausa e "tempo limite" como campos: **não existem** neste modal (só nome e duração).
- Validações de mensagem (nome repetido, duração 0): não observadas sem criar.
- Regra da duração mínima (o campo aceita 0, mas "Criar" depende da validação): não confirmada.
- Posição do modal e do overlay em larguras menores: só 1920 de largura.
