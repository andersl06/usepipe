/**
 * Os números da operação do Desk, num lugar só.
 *
 * Cada um destes valores foi lido do arquivo de configuração público da tela de
 * atendimento que serve de referência ao Pipe, e está registrado com a chave de
 * origem em `docs/pesquisa/blip-desk-medidas.md`, §9. **O número é medido; o
 * código é nosso.** Nenhuma linha de lá foi copiada — o que veio foi a régua.
 *
 * Por que num arquivo e não espalhados: quase todos estes valores aparecem em
 * dois lugares — na regra que os aplica e na frase que os explica ao atendente
 * ("você será desconectado em 10 minutos"). Número repetido em dois lugares vira
 * dois números diferentes na primeira vez que alguém muda um deles.
 *
 * Os que ainda não têm quem os aplique estão marcados com AINDA NÃO VALE. Eles
 * ficam aqui de propósito: quando a função nascer, o limite já está escrito e
 * conferido, em vez de ser inventado na hora pelo primeiro que chegar.
 */

const SEGUNDO = 1000;
const MINUTO = 60 * SEGUNDO;

/* ------------------------------------------------------------ inatividade */

/**
 * Quanto tempo sem nenhum gesto do atendente até a tela considerar que ele saiu
 * de perto. Dez minutos.
 */
export const INATIVIDADE_AVISO_MS = 10 * MINUTO;

/**
 * Quanto tempo A MAIS depois do aviso até o status cair para Offline. Outros
 * dez minutos, ou seja: vinte no total sem tocar em nada.
 *
 * Cair para Offline não é castigo, é higiene de fila: atendente marcado como
 * Online que não está na frente da tela recebe conversa que fica parada, e a
 * fila inteira paga por isso.
 */
export const INATIVIDADE_OFFLINE_MS = 10 * MINUTO;

/** De quanto em quanto tempo a tela confere o relógio da inatividade. */
export const INATIVIDADE_CHECAGEM_MS = 5 * SEGUNDO;

/**
 * Piso entre dois reinícios do relógio. Sem ele, mexer o mouse dispara centenas
 * de gravações de estado por segundo para nada — o relógio só precisa saber que
 * houve gesto neste segundo, não quantos.
 */
export const INATIVIDADE_REINICIO_MINIMO_MS = 1 * SEGUNDO;

/* -------------------------------------------------------------- conversa */

/**
 * Quantas mensagens o histórico traz por página quando a conversa é longa.
 *
 * AINDA NÃO VALE: hoje a tela carrega a conversa inteira de uma vez. A paginação
 * entra junto com a rolagem infinita; o tamanho da página já está decidido.
 */
export const HISTORICO_PAGINA = 40;

/**
 * Quanto tempo o aviso de "digitando…" sobrevive sem nova notícia do outro lado.
 *
 * AINDA NÃO VALE: depende de tempo real por WebSocket, que o Desk ainda não tem.
 */
export const DIGITANDO_MS = 4 * SEGUNDO;

/**
 * A que distância do fim da conversa o botão de "voltar ao fim" aparece.
 *
 * AINDA NÃO VALE: depende do rolador observado no cliente.
 */
export const DISTANCIA_MINIMA_ROLAGEM_PX = 150;

/* ---------------------------------------------------------------- anexos */

/**
 * Teto de um anexo: 100 MB. E quantos arquivos por envio: 10.
 *
 * AINDA NÃO VALE: o Desk não tem anexo. Os dois números ficam aqui porque é
 * aqui que a validação vai nascer, e porque limite inventado na hora é o que
 * faz o atendente descobrir o teto pelo erro do servidor.
 */
export const ANEXO_TAMANHO_MAXIMO_BYTES = 104_857_600;
export const ANEXO_QUANTIDADE_MAXIMA = 10;

/* ---------------------------------------------------------------- sessão */

/** Validade da sessão do atendente: oito horas, que é o turno. */
export const SESSAO_VALIDADE_MS = 8 * 60 * MINUTO;
