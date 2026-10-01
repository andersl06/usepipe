# Itens adiados (fora do escopo do plano que os achou)

## Do plano 03.2-03

- **`.fx-miolo { padding: 0 }` perde para `.pt-conteudo { padding: 0 16px 40px }` na cascata.** O comentário de `flow.css` diz que a casca do contato não acrescenta recuo (`.pa0` da Blip), mas o medido é 16px de cada lado e 40px embaixo em todas as telas do contato. O Atendimento compensou só no `.at-shell`; as outras telas do contato (Builder, Growth, Canais...) seguem com o recuo. Verificar contra a Blip antes de mexer na cascata compartilhada.
- **L-01 (casca.md):** avatar do contrato na barra do Portal 40x40 contra 32x32 da Blip (nome 8px à direita). Barra compartilhada com o Portal.
- **L-02 (casca.md):** nome do bot na barra do contato 8px à direita (padding da pílula de hover somado ao `margin-left: 15px`). Barra compartilhada com todos os módulos do contato.
