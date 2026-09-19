import { registrarAuditoria } from '@pipe/db';
import { noTenant } from '../../banco.js';
import { ErroPipe } from '../../erros.js';
import { lerCanalWhatsApp, texto } from './canal.js';
import type { CanalWhatsApp } from './canal.js';
import { clienteGraph } from './cliente-graph.js';
import type { PerfilDoNumero, PerfilParaGravar } from './cliente-graph.js';

/**
 * O perfil comercial do número — o que o cliente do WhatsApp vê ao abrir o
 * contato: foto, recado ("sobre"), descrição, endereço, e-mail, sites e categoria.
 *
 * Acréscimo do Pipe (o Chatwoot não edita perfil). Funciona com o token de
 * qualquer um dos dois caminhos de conexão, inclusive o manual: é a Cloud API
 * (`/{phone}/whatsapp_business_profile`) com `whatsapp_business_management`,
 * que o token manual já provou ter (`validacao-da-configuracao-manual.ts`).
 *
 * O NOME de exibição fica fora da gravação de propósito: toda troca passa pela
 * análise da Meta, e por aqui ele só é lido, com o status da análise.
 *
 * Limites da documentação da Cloud API. A Meta confere de novo; conferir aqui é
 * para a tela dizer qual campo está errado em vez de repetir a recusa dela.
 */

export const LIMITES_DO_PERFIL = {
  sobre: 139,
  endereco: 256,
  descricao: 512,
  email: 128,
  site: 256,
  sites: 2,
} as const;

/** 5 MB, JPEG ou PNG: o que a Meta aceita como foto de perfil. */
const FOTO_MAX_BYTES = 5 * 1024 * 1024;
const TIPOS_DE_FOTO = ['image/jpeg', 'image/png'] as const;

export interface PerfilVisivel {
  sobre: string;
  endereco: string;
  descricao: string;
  email: string;
  sites: string[];
  categoria: string;
  fotoUrl: string | null;
  /** Só leitura: o nome e o estado da análise da Meta. */
  nome: {
    exibicao: string | null;
    status: string | null;
    novoNome: string | null;
    novoStatus: string | null;
  };
}

export interface PedidoDePerfil {
  sobre?: string;
  endereco?: string;
  descricao?: string;
  email?: string;
  sites?: string[];
  categoria?: string;
  /** `data:image/jpeg;base64,…` — o mesmo formato da foto do fluxo. */
  foto?: string;
}

function recusa(campo: string, mensagem: string): ErroPipe {
  return new ErroPipe(422, 'perfil_invalido', mensagem, { campo });
}

function tokenDo(canal: CanalWhatsApp): string {
  const token = texto(canal.config['tokenAcesso']);
  if (!token) throw ErroPipe.conflito('canal_sem_token', 'O canal não tem token: reconecte o WhatsApp.');
  return token;
}

function numeroDo(canal: CanalWhatsApp): string {
  const numero = texto(canal.config['phoneNumberId']) ?? canal.numeroId;
  if (!numero) throw ErroPipe.conflito('canal_sem_numero', 'O canal não tem número: reconecte o WhatsApp.');
  return numero;
}

function comoVisivel(perfil: PerfilDoNumero, numero: Record<string, unknown>): PerfilVisivel {
  return {
    sobre: perfil.about ?? '',
    endereco: perfil.address ?? '',
    descricao: perfil.description ?? '',
    email: perfil.email ?? '',
    sites: perfil.websites ?? [],
    categoria: perfil.vertical ?? '',
    fotoUrl: perfil.profile_picture_url ?? null,
    nome: {
      exibicao: texto(numero['verified_name']),
      status: texto(numero['name_status']),
      novoNome: texto(numero['new_display_name']),
      novoStatus: texto(numero['new_name_status']),
    },
  };
}

export async function lerPerfilDoCanal(tenantId: string, canalId: string): Promise<PerfilVisivel> {
  const canal = await lerCanalWhatsApp(tenantId, canalId);
  const cliente = clienteGraph(tokenDo(canal));
  const numeroId = numeroDo(canal);
  // Em série: a segunda chamada só faz sentido se a primeira alcançou o número.
  const perfil = await cliente.lerPerfil(numeroId);
  const numero = await cliente.buscarNumero(
    numeroId,
    'verified_name,name_status,new_display_name,new_name_status',
  );
  return comoVisivel(perfil, numero);
}

/** Confere e traduz para os nomes da Meta só o que veio — campo ausente não é mexido. */
export function validarPerfil(pedido: PedidoDePerfil): PerfilParaGravar {
  const saida: PerfilParaGravar = {};
  const textoLimitado = (
    valor: string | undefined,
    campo: keyof typeof LIMITES_DO_PERFIL,
    rotulo: string,
  ): string | undefined => {
    if (valor === undefined) return undefined;
    if (typeof valor !== 'string') throw recusa(campo, `${rotulo} tem de ser texto.`);
    const limpo = valor.trim();
    if (limpo.length > LIMITES_DO_PERFIL[campo]) {
      throw recusa(campo, `${rotulo} aceita no máximo ${LIMITES_DO_PERFIL[campo]} caracteres.`);
    }
    return limpo;
  };

  const sobre = textoLimitado(pedido.sobre, 'sobre', 'O recado');
  // A Meta recusa `about` vazio: o recado existe sempre, só dá para trocar.
  if (sobre !== undefined) {
    if (!sobre) throw recusa('sobre', 'O recado não pode ficar vazio.');
    saida.about = sobre;
  }
  const endereco = textoLimitado(pedido.endereco, 'endereco', 'O endereço');
  if (endereco !== undefined) saida.address = endereco;
  const descricao = textoLimitado(pedido.descricao, 'descricao', 'A descrição');
  if (descricao !== undefined) saida.description = descricao;
  const email = textoLimitado(pedido.email, 'email', 'O e-mail');
  if (email !== undefined) {
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw recusa('email', 'O e-mail não é válido.');
    saida.email = email;
  }
  if (pedido.sites !== undefined) {
    if (!Array.isArray(pedido.sites)) throw recusa('sites', 'Os sites vêm em lista.');
    const sites = pedido.sites.map((s) => String(s).trim()).filter(Boolean);
    if (sites.length > LIMITES_DO_PERFIL.sites) {
      throw recusa('sites', `São no máximo ${LIMITES_DO_PERFIL.sites} sites.`);
    }
    for (const site of sites) {
      if (site.length > LIMITES_DO_PERFIL.site) {
        throw recusa('sites', `Cada site aceita no máximo ${LIMITES_DO_PERFIL.site} caracteres.`);
      }
      if (!/^https?:\/\/\S+$/i.test(site)) throw recusa('sites', 'O site tem de começar com http:// ou https://.');
    }
    saida.websites = sites;
  }
  if (pedido.categoria !== undefined) {
    // A lista de categorias é da Meta e muda; aqui só o formato do código dela.
    if (!/^[A-Z_]{2,40}$/.test(pedido.categoria)) throw recusa('categoria', 'Categoria inválida.');
    saida.vertical = pedido.categoria;
  }
  return saida;
}

export function lerFoto(foto: string): { bytes: Buffer; tipo: string } {
  const partes = /^data:([^;,]+);base64,(.+)$/s.exec(foto);
  if (!partes) throw recusa('foto', 'A foto tem de vir como imagem.');
  const tipo = partes[1]!.toLowerCase();
  if (!(TIPOS_DE_FOTO as readonly string[]).includes(tipo)) {
    throw recusa('foto', 'A foto tem de ser JPG ou PNG.');
  }
  const bytes = Buffer.from(partes[2]!, 'base64');
  if (bytes.length === 0) throw recusa('foto', 'A foto está vazia.');
  if (bytes.length > FOTO_MAX_BYTES) throw recusa('foto', 'A foto tem de ter no máximo 5 MB.');
  return { bytes, tipo };
}

export async function gravarPerfilDoCanal(
  tenantId: string,
  usuarioId: string,
  canalId: string,
  pedido: PedidoDePerfil,
): Promise<PerfilVisivel> {
  const canal = await lerCanalWhatsApp(tenantId, canalId);
  const perfil = validarPerfil(pedido);
  const foto = pedido.foto === undefined ? null : lerFoto(pedido.foto);
  if (!foto && Object.keys(perfil).length === 0) {
    throw ErroPipe.requisicao('nada_para_gravar', 'Nada mudou no perfil.');
  }

  const cliente = clienteGraph(tokenDo(canal));
  const numeroId = numeroDo(canal);
  if (foto) {
    // A foto sobe no app dono do token: o do cliente (manual) ou o nosso (embutido).
    const appId = texto(canal.config['appId']) ?? process.env['WHATSAPP_APP_ID'] ?? '';
    if (!appId) {
      throw ErroPipe.conflito(
        'canal_sem_app',
        'Não sabemos o aplicativo deste canal para enviar a foto: reconecte o WhatsApp.',
      );
    }
    perfil.profile_picture_handle = await cliente.subirFoto(appId, foto.bytes, foto.tipo);
  }
  await cliente.gravarPerfil(numeroId, perfil);

  await noTenant(tenantId, (tx) =>
    registrarAuditoria(tx, tenantId, {
      ator: { tipo: 'usuario', id: usuarioId },
      acao: 'alterou',
      objetoTipo: 'canal',
      objetoId: canal.id,
      // Sem a foto nem o handle: o log guarda o que mudou, não a imagem.
      depois: {
        perfil: Object.keys(perfil).filter((c) => c !== 'profile_picture_handle'),
        foto: Boolean(foto),
      },
    }),
  );

  return lerPerfilDoCanal(tenantId, canalId);
}
