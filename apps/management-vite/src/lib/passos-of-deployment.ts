import { APPLICATION, flowPath } from './application-paths';

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

export interface DeploymentSignals {
  adminEntrou: boolean;
  channelsConnected: number;
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
  conversationHandled: boolean;
}

export type StepState = 'feito' | 'andamento' | 'pendente';

export type IdDoPasso = 'acesso' | 'whatsapp' | 'equipe' | 'fila' | 'contatos' | 'conversa';

export interface AcaoDoPasso {
  rotulo: string;
  href: string;
  externo?: boolean;
}

export interface DeploymentStep {
  id: IdDoPasso;
  titulo: string;
  state: StepState;
  /** O que falta, ou o que já existe. Uma frase. */
  resumo: string;
  acao: AcaoDoPasso | null;
}

function quantos(n: number, um: string, varios: string): string {
  return `${n} ${n === 1 ? um : varios}`;
}

function contactsStep(
  s: DeploymentSignals,
): Omit<DeploymentStep, 'id' | 'titulo' | 'acao'> {
  const ultima = s.lastImport;
  if (!ultima) {
    return {
      state: 'pendente',
      resumo: 'Opcional: traga a base de clientes de uma planilha CSV.',
    };
  }
  if (ultima.state === 'pronta' || ultima.state === 'executando') {
    return {
      state: 'andamento',
      resumo: 'Importação em andamento. Arquivo grande leva alguns minutos.',
    };
  }
  if (ultima.state === 'falhou') {
    return {
      state: 'pendente',
      resumo:
        'A última importação falhou: o arquivo tem aspas malformadas. Corrija e envie de novo.',
    };
  }
  const rejeitadas =
    ultima.rejeitados > 0
      ? `, ${quantos(ultima.rejeitados, 'linha rejeitada', 'linhas rejeitadas')}`
      : '';
  return {
    state: ultima.accepted > 0 ? 'feito' : 'pendente',
    resumo: `${quantos(ultima.accepted, 'contato importado', 'contatos importados')}${rejeitadas}.`,
  };
}

/**
 * `primaryShortName` is the tenant's most recent flow (`pages/deployment/page.tsx` reads it from
 * the same portal grid the list screen uses — this file has no database access of its own, and
 * the account may not have a "main" flow at all). Steps that link into a contact fall back to the
 * portal list when there is none, since there's no contact to link into yet.
 */
export function montarPassos(
  s: DeploymentSignals,
  urlDoDesk: string,
  primaryShortName: string | null,
): DeploymentStep[] {
  const temWhatsApp = s.channelsConnected > 0;
  return [
    {
      id: 'acesso',
      titulo: 'Primeiro acesso do administrador',
      state: s.adminEntrou ? 'feito' : 'pendente',
      resumo: s.adminEntrou
        ? 'O administrador já entrou pelo Google.'
        : 'Nenhum administrador entrou ainda. Ele entra pelo Google, com o e-mail provisionado.',
      acao: null,
    },
    {
      id: 'whatsapp',
      titulo: 'Conectar o WhatsApp',
      state: temWhatsApp ? 'feito' : s.channelsPending > 0 ? 'andamento' : 'pendente',
      resumo: temWhatsApp
        ? `${quantos(s.channelsConnected, 'número conectado', 'números conectados')}.`
        : s.channelsPending > 0
          ? 'O número foi ligado, mas a Meta pede reautorização. Refaça a conexão.'
          : 'Sem número conectado, nenhuma conversa chega ao Desk.',
      acao: temWhatsApp
        ? { rotulo: 'Ver canais', href: primaryShortName ? flowPath(primaryShortName, 'channels') : APPLICATION }
        : { rotulo: 'Conectar', href: '#whatsapp' },
    },
    {
      id: 'equipe',
      titulo: 'Convidar a equipe',
      state: s.members > 1 ? 'feito' : s.convites > 0 ? 'andamento' : 'pendente',
      resumo:
        s.members > 1
          ? `${quantos(s.members, 'pessoa', 'pessoas')} com acesso.`
          : s.convites > 0
            ? `${quantos(s.convites, 'convite enviado', 'convites enviados')}, ninguém aceitou ainda.`
            : 'Só o administrador tem acesso. Atendente entra por convite.',
      acao: { rotulo: 'Convidar', href: '#equipe' },
    },
    {
      id: 'fila',
      titulo: 'Criar a primeira fila com atendente',
      state: s.queuesWithAgent > 0 ? 'feito' : 'pendente',
      resumo:
        s.queuesWithAgent > 0
          ? `${quantos(s.queuesWithAgent, 'fila', 'filas')} com atendente habilitado.`
          : s.queuesActive > 0
            ? 'Há fila ativa, mas nenhum atendente habilitado nela: a conversa chega e ninguém a recebe.'
            : 'Nenhuma fila ativa.',
      acao: {
        rotulo: 'Abrir filas',
        href: primaryShortName ? flowPath(primaryShortName, 'attendance/queue-management') : APPLICATION,
      },
    },
    {
      id: 'contatos',
      titulo: 'Importar contatos',
      ...contactsStep(s),
      acao: { rotulo: 'Importar', href: '#contatos' },
    },
    {
      id: 'conversa',
      titulo: 'Atender a conversa de teste',
      state: s.conversationHandled ? 'feito' : 'pendente',
      resumo: s.conversationHandled
        ? 'Uma conversa já foi respondida pelo Desk.'
        : temWhatsApp
          ? 'Mande um WhatsApp do seu celular para o número conectado e responda pelo Desk.'
          : 'Depende do WhatsApp conectado.',
      acao:
        temWhatsApp && !s.conversationHandled
          ? { rotulo: 'Abrir o Desk', href: urlDoDesk, externo: true }
          : null,
    },
  ];
}
