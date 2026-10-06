# Nomear versão (Builder > Configuração > Versões)

## O que a Blip faz (provado)
- Em `ref/FIDELIDADE-F1-F6.md` (F-2.1) e na captura da plano 02-32: cada card de "VERSÕES PUBLICADAS" tem três botões-ícone, o primeiro é "Nomear versão" (editar, primary).
- Modal "Edite o título e descrição da versão": campos "Título" (50 caracteres) e "Descrição" (200 caracteres); botões "Cancelar"/"Salvar".
- O card mostra título (16, negrito, opcional), descrição (14), data `dd/MM/yyyy - HH:mm:ss` (negrito) e autor.

## O que o Pipe tinha
- `fluxo_versao` sem título/descrição; a aba Versões (`panel-configuration.tsx`) listava as últimas 10 publicações como cards sem o botão de nomear (pendência registrada no 02-32-SUMMARY).

## Decisão (dono aprovou)
- Migração 0094 (`0094_nome_da_versao.sql`): `titulo` (CHECK <= 50) e `descricao` (CHECK <= 200), nulos, aditiva e idempotente. Usamos os limites provados da Blip (50/200), não um campo único "nome".
- API: `PUT /v1/management/flows/:id/builder/versions/:version/name` com `{titulo, descricao}`; trim, texto vazio limpa, acima do limite = 400 `invalid_version_name`; mesma permissão de edição do Builder (`builder.escrever` no fluxo / `automacao.fluxo.editar`); isolamento por tenant (404); auditoria `alterou` em `fluxo_versao`. A lista de versões e `VersionOfFlow` passam a trazer `titulo`/`descricao`.
- UI: botão lápis "Nomear versão" no card e o modal acima; o card mostra título e descrição acima da data.

## Não provado na Blip (não inventado)
- Se a Descrição é campo de uma linha ou área de texto (usamos uma linha).
- Se título e descrição podem ficar vazios, e se há regra de unicidade do título.
- Ordem exata do botão entre os três ícones e o ícone usado (usamos `lapis` do Pipe, antes dos outros dois).
- Se a Blip nomeia também rascunhos/versões não publicadas (aqui só aparecem nos cards as publicadas).
- Se o nome acompanha a versão ao restaurar (aqui o rascunho restaurado nasce sem nome).