import { randomBytes } from 'node:crypto';
import { cifrar, decifrar } from '@pipe/db';
import { chaveiro } from '../../banco.js';
import { ErroPipe } from '../../erros.js';

/**
 * O `state` do cadastro embutido. **Acréscimo do Pipe, não é porte.**
 *
 * O Chatwoot abre o popup pelo `FB.login` do SDK e não tem `state`: o `code` volta
 * para o JavaScript da própria página e segue num POST autenticado. A Blip usa o
 * diálogo por redirecionamento com `state` aleatório por abertura. O Pipe segue o
 * Chatwoot no fluxo e acrescenta a amarra, porque o ataque que ela fecha é
 * concreto: alguém conclui o cadastro com a WABA DELE e faz o navegador de um
 * administrador nosso entregar esse `code` — e o cliente passa a atender pelo
 * número de outra pessoa.
 *
 * O `state` é emitido pelo servidor, preso ao tenant e ao usuário da sessão, com
 * validade de dez minutos, e cifrado com o chaveiro que já cifra o token da Meta
 * (AES-256-GCM, autenticado: alterado, não decifra). Sem tabela nova.
 *
 * ponytail: não é de uso único. Reapresentado dentro dos dez minutos, só serve à
 * mesma pessoa no mesmo tenant, e o `code` da Meta já é de uso único e vive 30 s.
 * Se virar requisito, é uma tabela de `state` queimado.
 */

const VALIDADE_MS = 10 * 60 * 1000;

interface ConteudoDoEstado {
  t: string;
  u: string;
  e: number;
  n: string;
}

export function emitirEstado(tenantId: string, usuarioId: string, agora = Date.now()): string {
  const conteudo: ConteudoDoEstado = {
    t: tenantId,
    u: usuarioId,
    e: agora + VALIDADE_MS,
    n: randomBytes(8).toString('hex'),
  };
  return cifrar(JSON.stringify(conteudo), chaveiro());
}

export function conferirEstado(
  estado: string | undefined,
  tenantId: string,
  usuarioId: string,
  agora = Date.now(),
): void {
  let conteudo: ConteudoDoEstado | null = null;
  try {
    conteudo = estado ? (JSON.parse(decifrar(estado, chaveiro())) as ConteudoDoEstado) : null;
  } catch {
    conteudo = null;
  }
  // Ausente, forjado, de outra sessão ou vencido dão a MESMA resposta: dizer qual
  // metade falhou é ensinar a quem tenta.
  if (!conteudo || conteudo.t !== tenantId || conteudo.u !== usuarioId || !(conteudo.e > agora)) {
    throw new ErroPipe(
      403,
      'estado_invalido',
      'A conexão com a Meta não partiu desta sessão, ou demorou demais. Abra o cadastro de novo.',
    );
  }
}
