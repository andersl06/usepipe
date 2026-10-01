# Lacunas da Onda 0 (casca, paginação, tblwrap)

**Origem:** `ref/verificacao/casca.md`, `paginacao.md` e `tblwrap.md`, consolidadas em `VERIFICACAO-VISUAL.md` (`## Onda 0`).
**Aprovação:** a coluna "Aprovada pelo dono" fica vazia até o portão visual (Tarefa 3 do plano 03.2-05). Exceção: Q5, decidida em 2026-09-30.

| ID | Lacuna | Origem | Proposta | Aprovada pelo dono |
|---|---|---|---|---|
| L-01 | Avatar do contrato 40x40 contra 32x32 na barra do Portal (nome 8px à direita) | casca.md | Corrigir junto com a verificação do Portal (barra compartilhada) | 2026-09-30 (portão Onda 0: aprovada a proposta) |
| L-02 | Nome do bot 8px à direita na barra do contato | casca.md | `margin-left` de 15px menos o padding, verificando o Builder junto | 2026-09-30 (portão Onda 0: aprovada a proposta) |
| L-03 | Largura útil da lateral 19px maior (a Blip tem barra de rolagem própria de 20px) | casca.md | Mudaria a arquitetura de rolagem da casca; manter como diferença | 2026-09-30 (portão Onda 0: aprovada a proposta) |
| L-04 | Item "Dados" extra em Preferências | casca.md | Divergência deliberada, mantida | 2026-09-30 (portão Onda 0: aprovada a proposta) |
| L-05 | Família tipográfica: IBM Plex Sans no Pipe, Nunito Sans na Blip | Q5 | Manter IBM Plex Sans | 2026-09-30 (Q5) |
| L-06 | Neutros quentes da marca no lugar dos cinzas da Blip (N1) e cores azuladas do plano e do módulo inativo | casca.md, tblwrap.md, paginacao.md | Manter neutros da marca, se o dono aceitar como troca de paleta | 2026-09-30 (portão Onda 0: aprovada a proposta) |
| L-07 | Grupo Comunicação: 144px no Pipe contra 165px na captura da Blip | casca.md | Nova captura da Blip para conferir o elemento a mais | 2026-09-30 (portão Onda 0: aprovada a proposta) |
| L-08 | Paginação da grade sem render com dados | paginacao.md | Medir quando houver ticket no Monitoramento ou membro na Equipe | n/a (correção ou medição futura, não é lacuna aceita) |
| L-09 | Divergências da paginação da lista (seletor 50,4px, contador no meio, ícone 16px, botão desabilitado) | paginacao.md | Correção em 03.2-07 (não é lacuna aceita) | n/a (correção ou medição futura, não é lacuna aceita) |
| L-10 | Raio, borda e fundo do cabeçalho da tabela `tblwrap` | tblwrap.md | Correção em 03.2-08 (não é lacuna aceita) | n/a (correção ou medição futura, não é lacuna aceita) |
