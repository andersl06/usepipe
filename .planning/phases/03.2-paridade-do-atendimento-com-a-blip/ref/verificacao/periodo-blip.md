# Filtro de Período na Blip (Histórico): opções e seletor de datas

**Base:** medido ao vivo em 2026-10-01 no bot dev, só leitura (nada foi aplicado). Viewport 1707 px CSS, DPR 1,125. [M] = medido; [A] = estimado da captura.
**Arquivos brutos (fora do Git):** `2026-10-01-periodo-select.html`, `-periodo-sidebar.html`, `-periodo-personalizado-sidebar.html`, `-periodo-datepicker-inicio.html`, `-medidas-periodo.json`, screenshots `2026-10-01-historico-*.jpg`.

## Onde fica
- Na tela Histórico, a barra superior mostra o rótulo **"Últimos 30 dias"** (texto, não pílula) ao lado do botão **Filtros**. O período é escolhido no painel lateral **Filtros** (à direita, 420 px de largura, fundo `#f6f6f6`, altura da janela), aba **Nova consulta** (a outra aba é **Filtros salvos**), primeiro bloco **Período** [M]. Esse painel de 420 px é o contêiner `sidebar` que o dono enviou.

## Opções do seletor (ordem exata)
Hoje · Ontem · Últimos 7 dias · Últimos 15 dias · Últimos 30 dias (padrão) · Últimos 60 dias · Últimos 90 dias · Últimos 120 dias · Últimos 180 dias · **Personalizado** (última) [M].
- Escolher uma opção só muda o valor do seletor; o filtro é aplicado quando o usuário clica em **Aplicar** (botão azul 80x40 no rodapé do painel, ao lado de "Limpar tudo") [M].

## Personalizado
- Ao escolher Personalizado aparecem **Início** e **Fim** abaixo do seletor [M]:
  - Cada um é um campo de data (173,6x60,8: ícone de calendário, rótulo "Definir a data" 12 px bold, valor `dd/mm/aaaa`) + dois seletores, **hora** e **minuto** (83x40 cada), na mesma linha.
  - Padrão: Início = hoje menos 30 dias, 00:00; Fim = hoje, 23:59.
  - Limites do calendário: **início mínimo = hoje menos 5 anos** (`02/10/2021` na captura) e **fim máximo = hoje** (`01/10/2026`); os dias depois de hoje aparecem desabilitados.
  - Calendário (clicar no campo abre): setas de mês, seletores de mês e de ano, dias da semana D S T Q Q S S, dia selecionado em círculo azul, rodapé com **Redefinir** (secundário) e **Concluir** (primário). O componente tem `variant-banner="warning"`, que indica um aviso de intervalo.
- Campos: borda 1px `rgba(0,0,0,.2)`, raio 8, padding 7 4 8 12; rótulos "Início" e "Fim" 14 px regular `#282828`; "Período" 14 px bold [M].
- **Regra de 90 dias (decisão do dono):** o intervalo do Personalizado fica limitado a 90 dias, e o seletor de datas só aparece ao escolher Personalizado, que é a última opção.

## Não medido e por quê
- **A regra de 90 dias e a mensagem de excesso não foram observadas na Blip**: o painel só trouxe o limite de 5 anos para trás e o aviso configurado como "warning". Para testar seria preciso digitar um intervalo maior e clicar em Aplicar (fora da regra de só leitura). Fica como decisão do dono e requisito do Pipe, com a mensagem a definir.
- Larguras do calendário aberto e do seu rodapé: é um elemento flutuante sem medidas lidas; só o screenshot (`historico-periodo-datepicker.jpg`).
