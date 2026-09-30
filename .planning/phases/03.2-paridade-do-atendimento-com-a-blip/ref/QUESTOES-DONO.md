# Questões para o dono (portão da Onda 0)

Perguntas em aberto da pesquisa e do plano. O Claude não assume resposta; a opção mais barata é apenas indicada.

## Q1. Tolerância de medida
- (a) 0px de diferença em dimensão e espaçamento medido (UI-SPEC aprovado). Consequência: mais correções e mais lacunas por erro de arredondamento.
- (b) 1px (Fase 2). Consequência: menos ruído; diferenças de 1px deixam de virar lacuna. Opção mais barata.

## Q2. Paginação no servidor para o Histórico (e, se quiser, Monitoramento)
- (a) Sim: usar `apps/api/src/pagination.ts`. Consequência: muda contrato de API e testes; paridade real com muitos tickets.
- (b) Não: manter `usePage` no cliente como hoje. Consequência: mais barato; carrega todos os tickets do período no navegador.

## Q3. Skins de paginação `grade` e `lista`
- (a) Colapsar em uma só, se o censo (03.2-02) e a medição (03.2-03) mostrarem que a Blip tem uma aparência só.
- (b) Manter as duas skins.
- Evidência: ver `ref/verificacao/paginacao.md` (ainda não produzida).

## Q4. Exportar PDF do Histórico
- (a) PDF pelo navegador (impressão nativa com CSS de impressão, sem dependência nova); "Enviar por e-mail" manda o CSV em anexo. Opção mais barata.
- (b) PDF gerado no servidor com biblioteca nova. Exige checkpoint de legitimidade do pacote antes de instalar; o PDF também vai por e-mail.

## Q5. Fonte do Atendimento
Se a medição mostrar família diferente de IBM Plex Sans na Blip:
- (a) Manter IBM Plex Sans e registrar como lacuna.
- (b) Trocar para a fonte da Blip (exige licença/uso permitido e token novo).

## Q6. Dashboards de ligações e vendas
O Pipe não tem dado de ligação nem de venda.
- (a) Mostrar a tela igual à Blip com estado vazio real.
- (b) Registrar como dependência em `DEPENDENCIAS-03.1.md` e não entregar a tela.

## Q7. Conflitos de rota
Uma decisão por item de `ref/CONFLITOS-ROTA.md`: R-01, R-02, R-03, R-04, R-05, R-06, R-07. Opções (a) adotar o segmento Blip e redirecionar o antigo, (b) manter o do Pipe como divergência deliberada.
