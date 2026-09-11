/**
 * Os passos do assistente de implantação, a partir do que existe no banco.
 *
 * Os passos e a ordem vêm do onboarding do Chatwoot
 * (`app/javascript/dashboard/routes/dashboard/onboarding/`, MIT): dados da conta,
 * depois os canais (`InboxSetup.vue`, com o WhatsApp primeiro), depois a equipe
 * (`invite_team`). O Pipe acrescenta os três que faltam para chegar na primeira
 * conversa atendida: fila com atendente, contatos e a conversa de teste.
 *
 * Diferença de desenho, e deliberada: lá o passo corrente é um cursor gravado na
 * conta (`onboarding_step`), que avança quando a pessoa clica em "Continuar".
 * Aqui cada passo é CONSULTADO — está feito quando o que ele pede existe. Cursor
 * diz que alguém passou pela tela; o banco diz se a coisa existe.
 *
 * Puro, sem banco e sem Next, para o `node --test` rodar.
 */

export interface SinaisDaImplantacao {
  adminEntrou: boolean;
  canaisConectados: number;
  /** Ligados, mas marcados para reautorização (webhook que falhou, número pendente na Meta). */
  canaisPendentes: number;
  convites: number;
  /** Usuários ativos, o administrador incluído. */
  membros: number;
  filasAtivas: number;
  filasComAtendente: number;
  ultimaImportacao: {
    id: string;
    estado: string;
    aceitos: number;
    rejeitados: number;
    temFalhas: boolean;
  } | null;
  conversaAtendida: boolean;
}

export type EstadoDoPasso = 'feito' | 'andamento' | 'pendente';

export type IdDoPasso = 'acesso' | 'whatsapp' | 'equipe' | 'fila' | 'contatos' | 'conversa';

export interface AcaoDoPasso {
  rotulo: string;
  href: string;
  externo?: boolean;
}

export interface PassoDaImplantacao {
  id: IdDoPasso;
  titulo: string;
  estado: EstadoDoPasso;
  /** O que falta, ou o que já existe. Uma frase. */
  resumo: string;
  acao: AcaoDoPasso | null;
}

function quantos(n: number, um: string, varios: string): string {
  return `${n} ${n === 1 ? um : varios}`;
}

function passoDosContatos(s: SinaisDaImplantacao): Omit<PassoDaImplantacao, 'id' | 'titulo' | 'acao'> {
  const ultima = s.ultimaImportacao;
  if (!ultima) {
    return { estado: 'pendente', resumo: 'Opcional: traga a base de clientes de uma planilha CSV.' };
  }
  if (ultima.estado === 'pronta' || ultima.estado === 'executando') {
    return { estado: 'andamento', resumo: 'Importação em andamento. Arquivo grande leva alguns minutos.' };
  }
  if (ultima.estado === 'falhou') {
    return {
      estado: 'pendente',
      resumo: 'A última importação falhou: o arquivo tem aspas malformadas. Corrija e envie de novo.',
    };
  }
  const rejeitadas = ultima.rejeitados > 0 ? `, ${quantos(ultima.rejeitados, 'linha rejeitada', 'linhas rejeitadas')}` : '';
  return {
    estado: ultima.aceitos > 0 ? 'feito' : 'pendente',
    resumo: `${quantos(ultima.aceitos, 'contato importado', 'contatos importados')}${rejeitadas}.`,
  };
}

export function montarPassos(s: SinaisDaImplantacao, urlDoDesk: string): PassoDaImplantacao[] {
  const temWhatsApp = s.canaisConectados > 0;
  return [
    {
      id: 'acesso',
      titulo: 'Primeiro acesso do administrador',
      estado: s.adminEntrou ? 'feito' : 'pendente',
      resumo: s.adminEntrou
        ? 'O administrador já entrou pelo Google.'
        : 'Nenhum administrador entrou ainda. Ele entra pelo Google, com o e-mail provisionado.',
      acao: null,
    },
    {
      id: 'whatsapp',
      titulo: 'Conectar o WhatsApp',
      estado: temWhatsApp ? 'feito' : s.canaisPendentes > 0 ? 'andamento' : 'pendente',
      resumo: temWhatsApp
        ? `${quantos(s.canaisConectados, 'número conectado', 'números conectados')}.`
        : s.canaisPendentes > 0
          ? 'O número foi ligado, mas a Meta pede reautorização. Refaça a conexão.'
          : 'Sem número conectado, nenhuma conversa chega ao Desk.',
      acao: temWhatsApp ? { rotulo: 'Ver canais', href: '/canais' } : { rotulo: 'Conectar', href: '#whatsapp' },
    },
    {
      id: 'equipe',
      titulo: 'Convidar a equipe',
      estado: s.membros > 1 ? 'feito' : s.convites > 0 ? 'andamento' : 'pendente',
      resumo:
        s.membros > 1
          ? `${quantos(s.membros, 'pessoa', 'pessoas')} com acesso.`
          : s.convites > 0
            ? `${quantos(s.convites, 'convite enviado', 'convites enviados')}, ninguém aceitou ainda.`
            : 'Só o administrador tem acesso. Atendente entra por convite.',
      acao: { rotulo: 'Convidar', href: '#equipe' },
    },
    {
      id: 'fila',
      titulo: 'Criar a primeira fila com atendente',
      estado: s.filasComAtendente > 0 ? 'feito' : 'pendente',
      resumo:
        s.filasComAtendente > 0
          ? `${quantos(s.filasComAtendente, 'fila', 'filas')} com atendente habilitado.`
          : s.filasAtivas > 0
            ? 'Há fila ativa, mas nenhum atendente habilitado nela: a conversa chega e ninguém a recebe.'
            : 'Nenhuma fila ativa.',
      acao: { rotulo: 'Abrir filas', href: '/atendentes/filas' },
    },
    {
      id: 'contatos',
      titulo: 'Importar contatos',
      ...passoDosContatos(s),
      acao: { rotulo: 'Importar', href: '#contatos' },
    },
    {
      id: 'conversa',
      titulo: 'Atender a conversa de teste',
      estado: s.conversaAtendida ? 'feito' : 'pendente',
      resumo: s.conversaAtendida
        ? 'Uma conversa já foi respondida pelo Desk.'
        : temWhatsApp
          ? 'Mande um WhatsApp do seu celular para o número conectado e responda pelo Desk.'
          : 'Depende do WhatsApp conectado.',
      acao:
        temWhatsApp && !s.conversaAtendida
          ? { rotulo: 'Abrir o Desk', href: urlDoDesk, externo: true }
          : null,
    },
  ];
}
