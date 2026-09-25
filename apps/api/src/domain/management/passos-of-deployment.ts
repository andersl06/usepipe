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

export interface SignalsOfDeployment {
  adminEntrou: boolean;
  channelsConectados: number;
  /** Ligados, mas marcados para reautorização (webhook que falhou, número pendente na Meta). */
  channelsPending: number;
  convites: number;
  /** Usuários ativos, o administrador incluído. */
  members: number;
  queuesActive: number;
  queuesWithAgent: number;
  lastImport: {
    id: string;
    state: string;
    accepted: number;
    rejeitados: number;
    temFalhas: boolean;
  } | null;
  conversationAtendida: boolean;
}

export type StateOfPasso = 'done' | 'progress' | 'pending';

export type IdDoPasso = 'access' | 'whatsapp' | 'equipe' | 'queue' | 'contacts' | 'conversation';

export interface AcaoDoPasso {
  rotulo: string;
  href: string;
  externo?: boolean;
}

export interface PassoOfDeployment {
  id: IdDoPasso;
  title: string;
  state: StateOfPasso;
  /** O que falta, ou o que já existe. Uma frase. */
  resumo: string;
  acao: AcaoDoPasso | null;
}

function quantos(n: number, um: string, varios: string): string {
  return `${n} ${n === 1 ? um : varios}`;
}

function passoOfContacts(
  s: SignalsOfDeployment,
): Omit<PassoOfDeployment, 'id' | 'titulo' | 'acao'> {
  const ultima = s.lastImport;
  if (!ultima) {
    return {
      state: 'pending',
      resumo: 'Opcional: traga a base de clientes de uma planilha CSV.',
    };
  }
  if (ultima.state === 'pronta' || ultima.state === 'executando') {
    return {
      state: 'progress',
      resumo: 'Importação em andamento. Arquivo grande leva alguns minutos.',
    };
  }
  if (ultima.state === 'falhou') {
    return {
      state: 'pending',
      resumo:
        'A última importação falhou: o arquivo tem aspas malformadas. Corrija e envie de novo.',
    };
  }
  const rejeitadas =
    ultima.rejeitados > 0
      ? `, ${quantos(ultima.rejeitados, 'linha rejeitada', 'linhas rejeitadas')}`
      : '';
  return {
    state: ultima.accepted > 0 ? 'done' : 'pending',
    resumo: `${quantos(ultima.accepted, 'contato importado', 'contatos importados')}${rejeitadas}.`,
  };
}

export function montarPassos(s: SignalsOfDeployment, urlDoDesk: string): PassoOfDeployment[] {
  const temWhatsApp = s.channelsConectados > 0;
  return [
    {
      id: 'access',
      title: 'Primeiro acesso do administrador',
      estado: s.adminEntrou ? 'done' : 'pending',
      resumo: s.adminEntrou
        ? 'O administrador já entrou pelo Google.'
        : 'Nenhum administrador entrou ainda. Ele entra pelo Google, com o e-mail provisionado.',
      acao: null,
    },
    {
      id: 'whatsapp',
      title: 'Conectar o WhatsApp',
      estado: temWhatsApp ? 'done' : s.channelsPending > 0 ? 'progress' : 'pending',
      resumo: temWhatsApp
        ? `${quantos(s.channelsConectados, 'número conectado', 'números conectados')}.`
        : s.channelsPending > 0
          ? 'O número foi ligado, mas a Meta pede reautorização. Refaça a conexão.'
          : 'Sem número conectado, nenhuma conversa chega ao Desk.',
      acao: temWhatsApp
        ? { rotulo: 'Ver canais', href: '/canais' }
        : { rotulo: 'Conectar', href: '#whatsapp' },
    },
    {
      id: 'equipe',
      title: 'Convidar a equipe',
      estado: s.members > 1 ? 'done' : s.convites > 0 ? 'progress' : 'pending',
      resumo:
        s.members > 1
          ? `${quantos(s.members, 'pessoa', 'pessoas')} com acesso.`
          : s.convites > 0
            ? `${quantos(s.convites, 'convite enviado', 'convites enviados')}, ninguém aceitou ainda.`
            : 'Só o administrador tem acesso. Atendente entra por convite.',
      acao: { rotulo: 'Convidar', href: '#equipe' },
    },
    {
      id: 'queue',
      title: 'Criar a primeira fila com atendente',
      estado: s.queuesWithAgent > 0 ? 'done' : 'pending',
      resumo:
        s.queuesWithAgent > 0
          ? `${quantos(s.queuesWithAgent, 'fila', 'filas')} com atendente habilitado.`
          : s.queuesActive > 0
            ? 'Há fila ativa, mas nenhum atendente habilitado nela: a conversa chega e ninguém a recebe.'
            : 'Nenhuma fila ativa.',
      acao: { rotulo: 'Abrir filas', href: '/atendentes/filas' },
    },
    {
      id: 'contacts',
      title: 'Importar contatos',
      ...passoOfContacts(s),
      acao: { rotulo: 'Importar', href: '#contatos' },
    },
    {
      id: 'conversation',
      title: 'Atender a conversa de teste',
      estado: s.conversationAtendida ? 'done' : 'pending',
      resumo: s.conversationAtendida
        ? 'Uma conversa já foi respondida pelo Desk.'
        : temWhatsApp
          ? 'Mande um WhatsApp do seu celular para o número conectado e responda pelo Desk.'
          : 'Depende do WhatsApp conectado.',
      acao:
        temWhatsApp && !s.conversationAtendida
          ? { rotulo: 'Abrir o Desk', href: urlDoDesk, externo: true }
          : null,
    },
  ];
}
