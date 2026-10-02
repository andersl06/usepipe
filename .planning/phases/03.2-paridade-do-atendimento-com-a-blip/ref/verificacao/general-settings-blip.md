# Configurações gerais (attendance/desk/general-settings): captura ao vivo da Blip

**Fonte:** bot dev `auvpcapitaldev1`, 2026-10-01, só leitura (nenhum interruptor foi clicado). Janela de 1920 px. Brutos em `referencias-blip/atendimento/03.2-capturas/2026-10-01-configgerais-*` (fora do Git). A página é pesada (a captura de tela por automação deu timeout; o conteúdo foi lido do DOM). [M] medido, [A] estimado.

## URL e navegação
- `.../attendance/desk/general-settings`, menu Preferências > Configurações gerais. Tudo numa única página longa, sem abas.
- Página com **24 cartões** (de seção) empilhados [M]: cada cartão 1401,9 de largura em x = 381, fundo `#f6f6f6`, raio 16, sombra `rgba(0,0,0,.16) 0 2px 8px -2px`. Sub-cartões internos têm 1322 de largura em x = 421 (recuo de 40). Interruptores de 56 x 32 [M]. Botão "Salvar" de 75,2 x 40 por cartão que tem campos.
- Estado dos interruptores no DOM: atributo `checked` vazio = ligado, `checked="false"` = desligado (inferência [A]).

## Seções, na ordem da página (textos exatos)
1. **Gerenciar tags**: "Crie e edite as tags disponíveis para os atendentes que operam em todas as filas do Blip Desk." Campo de chips "Insira as tags separando por vírgulas" (neste bot: Aguardando, Campanha, Criar Conta, Conta criada, Encerrado por inatividade, ...). Caixa "Tornar obrigatória a inclusão de tags em atendimentos finalizados manualmente" (desmarcada). Botão Salvar. **As tags são globais, para todas as filas.**
2. **Habilitar consulta a histórico de atendimentos no Blip Desk**: "Permita consultas a informações de atendimentos anteriores no Blip Desk. Lembre-se de conceder as permissões na página de Atendentes." Interruptor.
3. **Blip Calls**: "Permitir que atendentes façam e recebam ligações", com dois sub-cartões: "Receber ligações de voz" ("Permitir que atendentes recebam ligações do cliente via WhatsApp no Blip Desk") e "Realizar ligações de voz" ("Permite que atendentes façam ligações ativas pelo Blip Desk").
4. **Disponibilidade de atendente por fila**: interruptor.
5. **Distribuição de tickets**: "Defina o número máximo de atendimentos distribuídos automaticamente por atendente." "Modo de distribuição" com duas opções ("Priorizar atendentes com menos tickets ativos (Padrão)" e "Priorizar atendentes que estão há mais tempo sem receber novos tickets"); "Atendimentos por atendente" ("Para ativar, utilize um valor maior que 0."); caixas "Não permitir que atendentes solicitem tickets manualmente" e "Permitir atendimentos sem primeira resposta". Salvar.
6. **Envio de mensagens ativas**: interruptor "Habilitar o envio de mensagens ativas pelo Blip Desk" e o aviso verde "O envio de mensagens ativas está habilitado e pronto para ser utilizado no Blip Desk!" ou o amarelo "Faltam alguns passos para habilitar o envio de mensagens!" com checklist (essenciais: conectar o chatbot ou roteador ao canal do WhatsApp; configurar o fluxo de atendimento humano no Builder. Recomendados: ao menos 1 modelo de mensagem para WhatsApp na aba Conteúdos; ao menos 1 modelo na aba Atendimento; habilitar a configuração de contexto do roteador no Builder; legenda Pendente/Falha/Concluído; botão "Entendi"). Sub-cartões:
   - **Selecionar roteadores**: "Indique o ID de um ou mais roteadores, caso o WhatsApp não esteja conectado ao chatbot." (campo de chips com sufixo `@msging.net`); caixas "Permitir a busca de contatos pelo roteador" e "Permitir a busca de contatos pelo chatbot"; erro "Você precisa selecionar pelo menos uma opção."
   - **Estabelecer prioridade máxima para tickets de Mensagens Ativas**.
   - **Limitar o total de mensagens ativas por cliente** (por atendente, em 24 horas; aviso sobre agendamento indisponível ao atingir o limite).
   - **Limitar contatos por disparo de mensagem ativa**.
   - **Enviar mensagem ativa para contato em atendimento** (só se o ticket está com o próprio atendente). Salvar.
7. **Transferir tickets pelo Blip Desk**: "Habilita a transferência de tickets durante o atendimento"; caixas "Permitir transferência para atendentes específicos" (transferência direta entre atendentes) e "Permitir transferência para filas e atendentes offline". Salvar.
8. **Envio de áudios**, 9. **Emojis**, 10. **Envio de arquivos** (com sub-opção "Bloquear arquivos externos ao Blip": o usuário só poderá enviar ao chatbot arquivos hospedados e validados no Blip), 11. **Esconder número de clientes aguardando**: interruptores.
12. **Atendente inativo**: "Atendente receberá um alerta visual quando estiver demorando para responder um cliente." Quantidade (1, 2 ou 3 alertas), "Alertar a cada" (tempo maior que 0, mensagem "O tempo deve ser um valor maior que 0."), Unidade (Segundos, Minutos, Horas, Dias), pré-visualização do alerta (cartão com "Cliente", "Você poderia me ajudar?", "#1234", "Fila: Default", "Sequência dos alertas: 1º, 2º, 3º"). Salvar.
13. **Tempo máximo de resposta do cliente**: aviso ao atendente quando o cliente demora; "Tempo máximo de resposta" e "Tempo do segundo alerta", cada um com tempo e unidade (Segundos a Dias). Salvar.
14. **Categoria Modo de Espera**: "Ative o Modo de Espera para que seus atendentes possam pausar tickets enquanto realizam procedimentos internos. Quando ativada, essa funcionalidade fica disponível para todos os atendentes. Para limitar o uso, acesse a área de atendentes e ajuste as permissões individualmente." E o texto: **"Enquanto o ticket estiver no Modo de Espera, o encerramento automático por inatividade será pausado."**
15. **Encerramento automático de tickets**: "Encerre automaticamente os tickets por inatividade" (interruptor; desligado neste bot). É a configuração **global**; na página de edição de fila a Blip tem o cartão por fila.

## Achados que afetam o Pipe e o Builder
- Tags de encerramento são **globais** (seção 1), com a opção "tornar obrigatória a inclusão de tags" e uma tag já existente "Encerrado por inatividade". No Pipe a lista de etiquetas por fila e o catálogo global divergem.
- Modo de Espera **pausa o encerramento automático**: responde ao pendente "a espera deve pausar a contagem?".
- Mensagens ativas dependem de roteador, de modelos e de configuração de contexto no Builder: é um checklist ligado ao Builder.
- Distribuição (modo, limite por atendente, não permitir solicitar manualmente) e Disponibilidade por fila alimentam o motor de distribuição que o Builder usa no transbordo.

## Não medido e por quê
- Nenhum interruptor ou caixa foi clicado (gravam; um clique assim já travou a sessão). Valores iniciais dos campos numéricos, estados de erro além dos textos listados e a tipografia exata dos títulos [A].
- Screenshot: a página travou a captura por automação (timeout), então só há DOM, textos e medidas; a imagem de 2026-09-30 em `referencias-blip/atendimento/03.2-capturas/` cobre a parte superior.
