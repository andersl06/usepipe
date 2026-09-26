# Retratos da LP — prompts para gerar

Três retratos, um por cenário. A página já tem o espaço reservado com o enquadramento certo
(proporção 4:3, corte na altura do peito). Gere no Gemini, me mande os arquivos e eu embuto na
página — imagem de domínio externo é bloqueada na publicação, então o arquivo precisa entrar no
próprio HTML.

## Regras que valem para os três

Para não parecer banco de imagem nem imagem de IA genérica:

- **Ambiente de trabalho brasileiro real**, não escritório de startup americana. Nada de parede de
  tijolinho, planta gigante ou sala de vidro impecável.
- **Luz natural lateral**, de janela. Sem luz de estúdio, sem contraluz dramático, sem sombra dura.
- **Expressão neutra ou meio sorriso**, olhando para a câmera ou levemente fora dela. Sem sorriso
  largo de comercial de banco.
- **Fundo desfocado mas legível** — dá para entender que é um escritório de verdade.
- **Sem texto, sem logotipo, sem tela legível** ao fundo.
- Enquadramento **médio**: da cintura para cima, com espaço à direita para o texto respirar.
- Formato **4:3 horizontal**, alta resolução.
- Paleta discreta que converse com a marca: verdes acinzentados, creme, madeira clara. Evitar azul
  saturado e vermelho forte na roupa.

Acrescente ao fim de todo prompt:
`fotografia realista, lente 50mm, profundidade de campo rasa, grão sutil de filme, sem texto, sem marca d'água, proporção 4:3`

---

## 1 · Consultora comercial

> Retrato fotográfico de uma mulher brasileira de aproximadamente 34 anos, cabelo castanho preso
> num rabo de cavalo baixo, blusa lisa cor areia, sentada à mesa de um escritório comercial simples
> no Brasil. Ela está levemente virada para a câmera, com meio sorriso, uma caneta na mão e um
> caderno aberto à frente. Luz natural vinda de uma janela à esquerda. Ao fundo, desfocado, mesas de
> trabalho e um armário baixo de madeira clara. Fotografia realista, lente 50mm, profundidade de
> campo rasa, grão sutil de filme, sem texto, sem marca d'água, proporção 4:3.

## 2 · Supervisora de suporte

> Retrato fotográfico de uma mulher brasileira negra de aproximadamente 41 anos, cabelo crespo
> curto, camisa verde-oliva desbotada, em pé com os braços cruzados sem rigidez, num escritório de
> operação de atendimento no Brasil. Expressão serena e atenta, olhando para a câmera. Luz natural
> de janela ampla à direita. Ao fundo, desfocado, fileiras de estações de trabalho com monitores
> desligados e cadeiras de escritório. Fotografia realista, lente 50mm, profundidade de campo rasa,
> grão sutil de filme, sem texto, sem marca d'água, proporção 4:3.

## 3 · Analista de qualidade

> Retrato fotográfico de um homem brasileiro de aproximadamente 29 anos, cabelo escuro curto, barba
> curta, óculos de armação fina, camiseta cinza-esverdeada, sentado de lado numa cadeira de
> escritório e virando o rosto para a câmera com expressão concentrada e tranquila. Fones de ouvido
> pendurados no pescoço. Luz natural difusa vinda de trás dele, à esquerda. Ao fundo, desfocado,
> uma parede clara com um quadro branco apagado. Fotografia realista, lente 50mm, profundidade de
> campo rasa, grão sutil de filme, sem texto, sem marca d'água, proporção 4:3.

---

## Depois de gerar

1. Salve como JPG, largura de 1.200 px, qualidade ~80.
2. Me mande os três arquivos.
3. Eu converto para data URI, embuto na página e ajusto o enquadramento de cada um.

Se algum sair com aquela pele plastificada típica de imagem gerada, me diga e eu ajusto o prompt —
o que costuma resolver é pedir textura de pele visível, poros e assimetria facial leve, e baixar a
palavra "profissional" do prompt, que é o que puxa para o visual de banco de imagem.
