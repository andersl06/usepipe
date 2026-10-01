# Itens adiados

- (plano 02) 6 a 7 testes do api falham na linha de base, sem relação com fluxo_id: queue-entry.test.ts (2, "who closed"), desk-write-commands.test.ts (2), flow-actions.test.ts (2, inclui "SendCommand /status encerrada"), mais 1 intermitente. Confirmado revertendo os arquivos ao HEAD: mesmas falhas. Causa provável: migration 0081 (estado com_bot) da pipe-40, removida pelo plano 15.
