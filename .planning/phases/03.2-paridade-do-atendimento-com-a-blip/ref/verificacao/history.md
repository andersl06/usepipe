Base: c57b671e866aee94c48600e3af29ea828f740b35
Tema: claro (cartões cinza-claro sobre fundo claro nas capturas `.jpg`; o HTML não traz `data-theme`; D-12).

# Verificação: lista, filtros, detalhe e estados do Histórico (Blip x Pipe)

**Fonte Blip.** Capturas de 2026-09-30 em `referencias-blip/atendimento/03.2-capturas/` (`2026-09-30-historico-*`, fora do Git, com dados pessoais reais: nenhum valor de contato foi copiado para cá) e `referencias-blip/fichas/FICHA-history.md`. [M] = lido no DOM serializado (ordem, rótulos, `title`, `variant`, `bold`, `width`, `tooltip-text`, `position`). [A] = estimado na imagem `.jpg`, usando um botão de 40px como régua (a imagem está reduzida, escala aproximada 0,53); [A] nunca fecha a tolerância de 1px.

**Fonte Pipe.** Valores declarados em `attendance.css`, `global.css` (`.card-list`, `.cl-*`) e nos componentes, antes e depois. Não houve medição por CDP: o tenant local não tem conversas encerradas (mesma limitação de `monitoring.md`). Por isso nenhuma linha de geometria está VISUALLY VERIFIED.

**Achado estrutural.** A Blip não usa tabela no Histórico: cada resultado é um cartão (`elevation="static"`, fundo `surface-1`) com caixa de seleção, Ticket, Atendente, Contato, três tempos e um botão que abre o detalhe. O plano previa `tblwrap`; a evidência manda manter cartões, que o Pipe já tinha. A paginação acoplada ao rodapé é a do plano 07 (`Pagination layout="grade"`).

## Estado: lista (com resultados)

| Elemento | Blip | Pipe (antes) | Pipe (depois) | Status |
|---|---|---|---|---|
| Campos do cartão e ordem | Ticket, Atendente, Contato, Tempo de espera, Tempo de 1ª resposta, Tempo de atendimento [M] | Ticket, Encerrada, Contato, Fila, Atendente, Espera do cliente, 1ª resposta, Atendimento, selo de status, etiquetas | Ticket, Atendente, Contato, Tempo de espera, Tempo de 1ª resposta, Tempo de atendimento | NEEDS VALIDATION (render) |
| Rótulo do campo | fs-12, peso regular [M] | 12/400, entrelinha 18 | igual | NEEDS VALIDATION (render) |
| Valor do campo | fs-16, negrito [M]; Ticket fs-14 regular [M] | 16/700; Ticket 14/400 | igual | NEEDS VALIDATION (render) |
| Larguras fixas das colunas | `width` 75, 110, 160, 125 nos quatro primeiros blocos [M]; ordem dos blocos ainda não casada com cada campo | colunas iguais (`1fr`) | colunas iguais (`1fr`) | NEEDS VALIDATION (casar larguras) |
| Caixa de seleção | à esquerda, `Selecionar todos` acima da lista [M] | igual | igual | NEEDS VALIDATION (render) |
| Botão de detalhe | botão terciário só com seta para a direita, tooltip "Consultar detalhes do ticket", posição `left-center` [M] | ausente | link com seta para a direita (desenhada no Pipe), `title` e nome acessível "Consultar detalhes do ticket", abre em nova aba | NEEDS VALIDATION (tooltip de caixa própria e posição à esquerda não feitos; hoje é o `title` do navegador) |
| Altura do cartão | ~48 na imagem, ~90 após a escala [A] | `min-height` 88 | igual (88) | NEEDS VALIDATION [A] |
| Espaço entre cartões | ~6 na imagem, ~11 após a escala [A] | 8 | igual (8) | NEEDS VALIDATION [A] |
| Padding / raio do cartão | utilitários `pa4`, `mv3` no DOM [M] sem valor em px na captura | 20 / 16 | igual | NEEDS VALIDATION |
| Selo de status, etiquetas, "Encerrada", "Fila" | não aparecem no cartão [M] | apareciam | removidos da tela (continuam no CSV) | pendente do dono (ver Lacunas) |
| Seleção para exportar | limite de 1 a 20 tickets, tooltip no botão desabilitado [M] | sem limite, botão "Exportar CSV" | sem limite, botão "Exportar CSV" | resolvido no menu "Enviar por e-mail" (plano 13); o limite de 20 vale só para o PDF |

## Estado: rodapé de paginação

| Elemento | Blip | Pipe (antes) | Pipe (depois) | Status |
|---|---|---|---|---|
| Texto e seletor | "Resultados por página", seletor com valor 100, abre para cima (`options-position="top"`) [M] | sem paginação (até 200 linhas, aviso "as 200 mais recentes") | `Pagination layout="grade"`, 100 por página por padrão, mesmo componente do Monitoramento | NEEDS VALIDATION (render) |
| Contador e botões | "1-11 de 11", primeira, anterior, número, próxima, última [M, jpg] | n/a | contador e quatro botões do componente comum | NEEDS VALIDATION (render) |
| Origem da página | servidor | n/a | `pagina` e `porPagina` na API; total geral devolvido; mudar filtro volta à página 1 | testes de API passam; consulta SQL não exercitada contra Postgres |

## Estado: vazio

| Elemento | Blip | Pipe | Diferença | Status |
|---|---|---|---|---|
| Ilustração, título e texto | "Nenhum resultado encontrado", "Não encontramos nenhum resultado a partir da pesquisa realizada. Que tal refazer a sua busca?" [M, FICHA §6] | mesmo texto e botão "Redefinir filtros"; ilustração do Pipe | ilustração é arte do Pipe, não cópia | NEEDS VALIDATION (render) |
| Texto do UI-SPEC ("Ajuste os filtros ou o período...") | não usado: a captura traz texto próprio | não usado | nenhuma | VISUALLY VERIFIED quanto ao texto (copy literal da ficha) |
| Termo de responsabilidade | link no canto inferior direito [M] | igual | 0 | NEEDS VALIDATION (render) |

## Estado: carregando

| Elemento | Blip | Pipe | Diferença | Status |
|---|---|---|---|---|
| Aspecto | sem captura (C-20, C-21 pendentes) | cartão "Carregando histórico…" com `role="status"`; ao trocar de página ou filtro a página anterior fica visível até a nova chegar | n/a | NEEDS VALIDATION |

## Estado: erro

| Elemento | Blip | Pipe | Diferença | Status |
|---|---|---|---|---|
| Aspecto e texto | sem captura | "Não foi possível carregar o histórico", "Verifique a conexão e tente novamente.", botão "Tentar novamente" (texto do UI-SPEC) | n/a | NEEDS VALIDATION |

## Estado: filtros abertos

| Elemento | Blip | Pipe (antes) | Pipe (depois) | Status |
|---|---|---|---|---|
| Campos e ordem | Período, IDs dos tickets, Atendentes, Tags, Filas, Contato; abas "Nova consulta" e "Filtros salvos" [M, FICHA §2.3 e §3] | mesmos campos e abas | mesmos | NEEDS VALIDATION (render) |
| IDs dos tickets | campo de chips, "Aperte Enter para confirmar" [M] | campo de texto simples; ids separados por espaço ou vírgula | idem; agora filtrado no servidor (até 20 ids) | lacuna: chips |
| Atendentes, Tags, Filas | multisseleção em chips [M] | seleção única | seleção única | lacuna: multisseleção (o contrato da API aceita um id) |
| Contato | nome, e-mail ou telefone [M] | nome, filtrado só no navegador na página carregada | nome, filtrado no servidor | lacuna: e-mail e telefone não existem na linha |
| Defeito de nomes dos parâmetros | n/a | o formulário enviava `fila`, `atendente`, `contato`, mas a tela lia `queue`, `agent`, `contact`: os três filtros eram ignorados; "Limpar" gerava `to=` em vez de `ate=` | a tela lê os nomes que o formulário envia; "Limpar" gera `ate=` | corrigido (Rule 1) |
| Filtros salvos | aba e switch "Criar Filtro Salvo" [M] | abas presentes, sem persistência | igual | lacuna: depende de backend |

## Estado: detalhe do ticket

| Elemento | Blip | Pipe | Diferença | Status |
|---|---|---|---|---|
| Destino | nova aba, página própria do contato, sem a barra lateral do atendimento (C-10) | nova aba, rota `attendance/history/:id?ticketId=`, dentro da casca do Atendimento | casca com a barra lateral | lacuna |
| Cabeçalho | seta de voltar, ícone de pessoa, nome do contato, botão de atualizar [M, jpg] | seta de voltar e nome do contato | sem ícone de pessoa nem atualizar | lacuna |
| Bloco "Informações" do contato | nome, e-mail, telefone, cidade, documento, gênero, edição [M, jpg] | resumo com Ticket, Atendente e Fila | faltam dados de contato | lacuna: depende de API de contato (03.1) |
| Lista "Tickets" do contato | data, hora, número, atendente, fila, tags, tempo médio, status, relacionar ticket, baixar [M, jpg] | não existe | falta | lacuna: depende de API de contato |
| Painel "Histórico de Conversa" | lateral direito, mensagens, notas e eventos [M, jpg] | seção "Histórico de Conversa" com as mensagens e notas da rota de prévia do Monitoramento | layout próprio | NEEDS VALIDATION (render); a rota exige a permissão de monitoramento em tempo real |

## Estado: Enviar por e-mail aberto (menu e modais de exportação)

Capturas de 2026-09-30 (C-12 a C-14, parciais): `historico-selecao-1-ticket-menu-enviar`, `historico-enviar-por-email-menu-sem-selecao`, `historico-enviar-lista-tickets-modal`, `historico-enviar-pdf-modal` (fora do Git; o e-mail que aparece nelas é dado pessoal e não foi copiado). Todas as medidas abaixo são [A] (imagem reduzida) ou texto lido na imagem; nenhuma geometria foi medida no Pipe (sem conversas encerradas no tenant local, sem CDP). Nada aqui fecha a tolerância de 1px.

### Menu (botão "Enviar por e-mail")

| Elemento | Blip | Pipe | Status |
|---|---|---|---|
| Controle | um botão primário "Enviar por e-mail" com ícone de envelope; não há botão "Exportar CSV" nem "Exportar PDF" separados | botão primário "Enviar por e-mail" que abre menu; ícone provisório (`baixar`) | NEEDS VALIDATION (ícone de envelope não desenhado) |
| Itens | "Lista de tickets / Exporta uma planilha CSV com os dados dos tickets filtrados"; "Histórico de conversas (.pdf) / Gera um arquivo PDF com o histórico das conversas" | mesmos dois itens e textos | NEEDS VALIDATION (render, geometria) |
| Sem seleção | "Lista de tickets" habilitado, PDF desabilitado (esmaecido) | igual; PDF também desabilita com mais de 20 selecionados (limite lido no DOM, plano 11) | NEEDS VALIDATION (render) |
| Largura do menu | ~190 px na imagem (~360 após a escala) [A] | 360 | NEEDS VALIDATION [A] |
| Ícones nos itens | ícone à esquerda de cada item | ausentes | lacuna |
| Item extra | não existe | "Baixar planilha (.csv)" baixa a seleção no navegador (comportamento anterior do Pipe) | pendente do dono: manter ou retirar |

### Estado: Exportar CSV aberto (Lista de tickets)

| Elemento | Blip | Pipe | Status |
|---|---|---|---|
| Título e texto | "Enviar lista de tickets"; "Informe o e-mail para receber a planilha (.CSV) com os tickets selecionados:" | iguais (texto literal da captura) | NEEDS VALIDATION (render) |
| Campo | rótulo flutuante "Email", pré-preenchido com o e-mail do usuário | campo "Email" pré-preenchido com o e-mail da sessão; rótulo acima, não flutuante | lacuna: rótulo flutuante |
| Termo | caixa "Li e estou ciente do Termo de responsabilidade." com link | igual; link abre `/termo-de-responsabilidade` em nova aba | NEEDS VALIDATION; texto do termo sem captura (C-13 pendente) |
| Botões | "Cancelar" (texto) e "Enviar" desabilitado até aceitar o termo; "X" no canto | igual; botão "Cancelar" com estilo `btn`, "X" da casca padrão | NEEDS VALIDATION (render) |
| Ilustração | envelope com tickets à esquerda | ausente (arte da Blip não é copiada) | lacuna: arte própria do Pipe |
| Largura da caixa | ~366 px na imagem (~690 após a escala) [A] | 520 | diferença [A]; NEEDS VALIDATION |

### Estado: Exportar PDF aberto

| Elemento | Blip | Pipe | Status |
|---|---|---|---|
| Título e texto | "Enviar histórico de conversas"; "Informe o e-mail para receber o arquivo (.PDF) com o histórico completo das conversas selecionadas:" | iguais | NEEDS VALIDATION (render) |
| Demais itens | iguais ao modal CSV; ilustração de documento PDF | iguais ao modal CSV, sem ilustração | NEEDS VALIDATION; termo sem captura (C-14 pendente) |
| Origem do PDF (Q4) | n/a | gerado no servidor com pdfkit e enviado por e-mail (plano 12); filtro `ticket` = selecionados | decisão do dono aplicada; aparência do PDF pendente do dono |

### Estado: envio com erro

| Elemento | Blip | Pipe | Status |
|---|---|---|---|
| Texto e aspecto | sem captura (confirmação e erro pendentes em C-12) | "Não foi possível enviar: {motivo do servidor}", `role="alert"`, formulário mantido, Enviar volta a habilitar | NEEDS VALIDATION (texto não vem da Blip) |
| Sucesso | sem captura | "O arquivo foi enviado para {e-mail}." e botão "Fechar" | NEEDS VALIDATION |

## Navegação

| Clique | Destino Blip (tela/modal/painel + URL) | Destino Pipe | Status |
|---|---|---|---|
| Botão de seta do cartão (Consultar detalhes do ticket) | nova aba `attendance/history/{id}@tunnel.msging.net?ticketId=...` (R-08) | nova aba `attendance/history/{conversaId}?ticketId={ticket}` | NEEDS VALIDATION (render; casca e segmento `@tunnel.msging.net` não reproduzidos, decisão R-08 aplicada ao segmento de rota) |
| Número do ticket | sem link no DOM [M] | sem link | VISUALLY VERIFIED (mesmo comportamento) |
| Nome do contato | sem link no DOM da lista [M] | sem link | VISUALLY VERIFIED (mesmo comportamento) |
| Enviar por e-mail | menu com "Lista de tickets" (CSV) e "Histórico de conversas (.pdf)", cada um abre um modal de e-mail (C-12 a C-14) | botão "Enviar por e-mail" abre o mesmo menu; cada item abre o modal; "Baixar planilha (.csv)" baixa a seleção | NEEDS VALIDATION (render; termos sem captura) |
| Pílulas IDs dos tickets, Atendentes, Tags e Filtros | painel lateral Filtros | painel lateral Filtros | NEEDS VALIDATION (render) |
| Redefinir filtros | limpa os filtros | recarrega com período atual | NEEDS VALIDATION |
| Termo de responsabilidade | link no rodapé da área | `/termo-de-responsabilidade` | NEEDS VALIDATION |

## Lacunas

- Nenhuma linha de geometria está VISUALLY VERIFIED: o tenant local não tem conversas encerradas para medir por CDP, e as imagens estão reduzidas. Reabrir com dados de teste; medir altura, espaçamento, padding e larguras dos blocos.
- Itens retirados do cartão por não existirem na Blip (Encerrada, Fila, selo de status e destaque da conversa perdida, etiquetas): a informação continua no CSV. Confirmar com o dono se algum deve voltar, por exemplo o destaque de "Perdida".
- "Agrupar por" é do Pipe, sem equivalente na Blip. Com paginação no servidor ele agrupa só a página carregada.
- Tooltip em caixa própria no botão de detalhe (hoje `title`): igual ao Monitoramento exige o componente de tooltip.
- Ícones de seta desenhados no Pipe (`direita`, `esquerda`), não cópia dos da Blip.
- Filtros por chips e multisseleção, e-mail e telefone no filtro de contato, filtros salvos: dependem de contrato de API novo.
- Detalhe do ticket sem bloco de dados do contato, lista de tickets do contato e eventos; leitura do histórico depende da permissão de monitoramento. Dependem da 03.1 e de rota de leitura própria do Histórico.
- Carregando e erro sem captura da Blip (C-20, C-21): textos do UI-SPEC, aspecto NEEDS VALIDATION.
- Enviar por e-mail (CSV e PDF): endpoint no plano 12, menu e modais no plano 13. Faltam: ilustrações, ícones do menu, rótulo flutuante, texto do termo de responsabilidade, confirmação e erro da Blip, e a pergunta se a Blip aceita destinatário fora do tenant (hoje só usuários do tenant).
- Nenhum `--p-atend-historico-*` novo foi criado: todos os valores usados já existiam na escala; `tokens.css` e `MARCA.md` ficaram sem mudança.

## Correção B2: Período e busca (D-T01 c)

Fonte Blip: `periodo-blip.md` (medido ao vivo em 2026-10-01 [M]). Pipe: código; sem render medido em Chrome headless (não houve sessão autorizada para abrir a tela autenticada), então nada abaixo é VISUALLY VERIFIED.

| Elemento | Blip | Pipe | Diferença | Status |
|---|---|---|---|---|
| Opções do Período | Hoje, Ontem, Últimos 7, 15, 30, 60, 90, 120, 180 dias, Personalizado por último [M] | mesma ordem (`PERIODOS` + Personalizado) | 0 | NEEDS VALIDATION (render) |
| Início e Fim | só aparecem em Personalizado [M] | só aparecem em Personalizado; nos atalhos vão como campos ocultos | 0 | NEEDS VALIDATION (render) |
| Limites | início mínimo hoje menos 5 anos; fim máximo hoje [M] | `min`/`max` do campo de data nativo | calendário é o nativo do navegador, não o da Blip | NEEDS VALIDATION |
| Hora e minuto | seletores 83x40, padrão 00:00 e 23:59 [M] | seletores do Pipe, desabilitados (o servidor aplica dias inteiros) | DIVERGE: sem hora e minuto efetivos | DIVERGE (pendente) |
| Redefinir e Concluir | rodapé do calendário [M] | botões abaixo dos campos: Redefinir volta a 30 dias; Concluir valida e leva ao Aplicar | calendário flutuante não replicado | NEEDS VALIDATION |
| Limite de 90 dias (dono) | não observado na Blip | cliente: mensagem e bloqueio do envio (apenas no Histórico); servidor: 400 `periodo_longo_demais` acima de 90 dias inclusive e `periodo_invalido` se fim < início, na lista e na exportação | presets 120 e 180 dias passam de 90 (pendente) | testes de API passam |
| Busca de contato e ticket | n/a | `likeLiteral` escapa `!`, `%` e `_` com `escape '!'`; `%` e `_` não casam com tudo | 0 | testes com banco passam |
